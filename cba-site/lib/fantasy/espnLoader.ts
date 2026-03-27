// ============================================================
// lib/fantasy/espnLoader.ts
//
// Loads live matchup state from ESPN Fantasy API + EROSP projections.
// Returns MatchupState[] ready for simulation.
//
// Data sources:
//   - ESPN API: current matchup pairs, team scores, roster, lineup status
//   - data/erosp/latest.json: per-player projections (primary projection signal)
//   - data/current/2026.json: team names / metadata fallback
// ============================================================

import * as fs from "fs";
import * as path from "path";
import { createESPNClient } from "../espn-api";
import type {
  EROSPPlayerData,
  FantasyTeamMatchupState,
  LeagueConfig,
  MatchupConfig,
  MatchupState,
  PlayerProjectionInput,
  PlayerRole,
  ScheduledGame,
} from "./types";
import {
  CBA_PITCHER_START_CAP,
  CBA_ROSTER_SLOTS,
  CBA_SCORING,
  ESPN_LEAGUE_ID,
  ESPN_SEASON_ID,
  GAME_SCHEDULED_PROB,
  HITTER_P_PLAY_DEFAULT,
  MATCHUP_WEEK_LENGTH_DAYS,
  RP_APPEARANCE_RATE_DEFAULT,
  SP_DAYS_BETWEEN_STARTS,
  SP_START_RATE_PER_GAME,
} from "./constants";

// ---- EROSP JSON shape ----

interface RawEROSPPlayer {
  mlbam_id: number;
  espn_id: string;
  name: string;
  position: string;
  mlb_team: string;
  role: string; // "H" | "SP" | "RP"
  fantasy_team_id: number;
  is_fa: boolean;
  erosp_raw: number;
  erosp_startable: number;
  erosp_per_game: number;
  games_remaining: number;
  start_probability: number;
  cap_factor: number;
  pa_per_game?: number;
  fp_per_pa?: number;
}

interface RawEROSPFile {
  generated_at: string;
  season: number;
  players: RawEROSPPlayer[];
}

// ---- ESPN API shapes (loosely typed) ----

type ESPNAny = Record<string, unknown>;

// ---- Helpers ----

function toRole(espnDefaultPositionId: number): PlayerRole {
  if (espnDefaultPositionId === 1) return "starting_pitcher";
  if (espnDefaultPositionId === 11) return "relief_pitcher";
  return "hitter";
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z ]/g, "")
    .trim();
}

/**
 * Returns the ISO date string (YYYY-MM-DD) for the Monday that starts
 * the current matchup week.
 */
function getCurrentWeekMonday(now: Date = new Date()): Date {
  const d = new Date(now);
  // JS getDay(): 0=Sun, 1=Mon, ... 6=Sat
  const dayOfWeek = d.getDay();
  // Offset so Monday = 0
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  d.setDate(d.getDate() - daysFromMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Returns the number of remaining calendar days in the current scoring week
 * (Monday through Sunday), inclusive of today.
 *
 * Monday=7, Tuesday=6, ..., Sunday=1, after-Sunday-midnight=0
 */
function daysRemainingInWeek(now: Date = new Date()): number {
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  // Days until end-of-Sunday (0=already Sunday end, 1=Saturday, ..., 6=Monday)
  const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  return daysToSunday + 1; // +1 because today still has games
}

/**
 * Estimate how many SP starts have already been used this week.
 * Heuristic: the cap is 7; the week is 7 days; expect ~1 start/day on avg.
 * This is improved if ESPN roster weekly stat data is available.
 */
function estimateStartsUsed(
  cap: number,
  now: Date = new Date(),
  weeklyStartsFromRoster?: number
): number {
  if (weeklyStartsFromRoster !== undefined) return weeklyStartsFromRoster;
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon
  const daysElapsed = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // days since Monday
  return Math.min(cap, Math.round(daysElapsed * (cap / MATCHUP_WEEK_LENGTH_DAYS)));
}

/**
 * Builds ScheduledGame entries for remaining games this matchup week.
 *
 * Since we don't have a per-player/per-day schedule from MLB Stats API here,
 * we use a probabilistic model:
 *   - Each remaining calendar day is one ScheduledGame entry
 *   - game_scheduled_prob ≈ 0.89 (most teams play ~6/7 days per week)
 *   - For SPs: isStartingPitcherExpected and startProbability based on rotation slot
 *   - For hitters: appearanceProbability = p_play × game_scheduled_prob
 *   - For RPs: appearanceProbability = p_appear × game_scheduled_prob
 *
 * To replace this with real schedule data: substitute daysRemaining game objects
 * with actual schedule lookups from MLB Stats API /schedule endpoint.
 */
function buildRemainingGames(
  role: PlayerRole,
  erosp: EROSPPlayerData | undefined,
  now: Date = new Date()
): ScheduledGame[] {
  const days = daysRemainingInWeek(now);
  if (days <= 0) return [];

  const games: ScheduledGame[] = [];
  const monday = getCurrentWeekMonday(now);

  for (let d = 0; d < MATCHUP_WEEK_LENGTH_DAYS; d++) {
    const gameDate = new Date(monday);
    gameDate.setDate(gameDate.getDate() + d);

    const isPast = gameDate < new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const isToday = toISODate(gameDate) === toISODate(now);

    if (isPast) continue; // already played, skip — scored points already in currentPoints

    let appearanceProbability: number;
    let isStartingPitcherExpected = false;
    let startProbability: number | undefined;

    if (role === "hitter") {
      const pPlay = erosp?.startProbability
        ? Math.min(erosp.startProbability, 0.98) // cap at 98%
        : HITTER_P_PLAY_DEFAULT;
      appearanceProbability = pPlay * GAME_SCHEDULED_PROB;
    } else if (role === "starting_pitcher") {
      // SP starts every ~5 days in the rotation
      const pStart = SP_START_RATE_PER_GAME;
      // cap_factor < 1 means team has so many SPs that some are capped out; reduce further
      const capAdj = erosp?.capFactor ?? 1.0;
      const pStartAdj = pStart * capAdj;
      appearanceProbability = pStartAdj * GAME_SCHEDULED_PROB;
      isStartingPitcherExpected = true;
      startProbability = pStartAdj * GAME_SCHEDULED_PROB;
    } else {
      // Relief pitcher
      appearanceProbability = RP_APPEARANCE_RATE_DEFAULT * GAME_SCHEDULED_PROB;
    }

    games.push({
      date: toISODate(gameDate),
      gameState: isToday ? "live" : "upcoming",
      locked: false,
      completed: false,
      appearanceProbability,
      isStartingPitcherExpected,
      startProbability,
    });
  }

  return games;
}

// ---- EROSP index by ESPN ID and normalized name ----

function buildEROSPIndex(players: RawEROSPPlayer[]): {
  byEspnId: Map<string, EROSPPlayerData>;
  byNormName: Map<string, EROSPPlayerData>;
} {
  const byEspnId = new Map<string, EROSPPlayerData>();
  const byNormName = new Map<string, EROSPPlayerData>();

  for (const p of players) {
    const mapped: EROSPPlayerData = {
      mlbamId: p.mlbam_id,
      espnId: p.espn_id,
      name: p.name,
      position: p.position,
      mlbTeam: p.mlb_team,
      role: p.role,
      fantasyTeamId: p.fantasy_team_id,
      isFa: p.is_fa,
      erospRaw: p.erosp_raw,
      erospStartable: p.erosp_startable,
      erospPerGame: p.erosp_per_game,
      gamesRemaining: p.games_remaining,
      startProbability: p.start_probability,
      capFactor: p.cap_factor,
      paPerGame: p.pa_per_game,
      fpPerPa: p.fp_per_pa,
    };

    if (p.espn_id) byEspnId.set(p.espn_id, mapped);
    const nn = normalizeName(p.name);
    if (!byNormName.has(nn)) byNormName.set(nn, mapped); // first match wins
  }

  return { byEspnId, byNormName };
}

function lookupEROSP(
  espnPlayerId: string,
  playerName: string,
  idx: { byEspnId: Map<string, EROSPPlayerData>; byNormName: Map<string, EROSPPlayerData> }
): EROSPPlayerData | undefined {
  return idx.byEspnId.get(espnPlayerId) ?? idx.byNormName.get(normalizeName(playerName));
}

// ---- Build a PlayerProjectionInput from ESPN roster entry + EROSP ----

function buildPlayerProjection(
  entry: ESPNAny,
  teamId: number,
  erospIdx: ReturnType<typeof buildEROSPIndex>,
  now: Date
): PlayerProjectionInput | null {
  const ppe = entry.playerPoolEntry as ESPNAny | undefined;
  const player = ppe?.player as ESPNAny | undefined;
  if (!player) return null;

  const espnId = String(player.id ?? entry.playerId ?? "");
  const name = (player.fullName as string) ?? "Unknown";
  const defaultPositionId = (player.defaultPositionId as number) ?? 0;
  const role = toRole(defaultPositionId);

  const injuryStatus = (ppe?.injuryStatus as string) ?? "";
  const injured = ["OUT", "DOUBTFUL", "IR"].includes(injuryStatus);
  const questionable = injuryStatus === "QUESTIONABLE";

  // Lineup slot ID — 20/21 = bench, 16/17 = bench
  const lineupSlotId = (entry.lineupSlotId as number) ?? 0;
  const active = lineupSlotId < 16 || (lineupSlotId === 12); // not bench/IL

  // Current week's points from weekly stat split
  const weeklyStatEntry = (player.stats as ESPNAny[] | undefined)?.find(
    (s) =>
      (s.statSourceId as number) === 0 &&
      (s.statSplitTypeId as number) === 1 && // 1 = current scoring period
      (s.seasonId as number) === parseInt(ESPN_SEASON_ID, 10)
  );
  const alreadyScored = (weeklyStatEntry?.appliedTotal as number) ?? 0;

  const erosp = lookupEROSP(espnId, name, erospIdx);

  const scheduledGamesRemaining = buildRemainingGames(role, erosp, now);

  return {
    playerId: espnId,
    name,
    mlbTeam: (player.proTeamId as string) ?? "",
    fantasyTeamId: String(teamId),
    active,
    lineupSlot: String(lineupSlotId),
    role,
    injured,
    questionable,
    season: {},
    recent: {},
    erosp,
    alreadyScoredPointsThisMatchup: alreadyScored,
    scheduledGamesRemaining,
  };
}

// ---- Determine current SP starts used from ESPN roster data ----
// Counts SPs whose weekly appliedTotal > 0 as a proxy for starts used.
// A score > 15 suggests a quality start (QS=3, 6IP×3=18) so we count it extra.
function countStartsUsedFromRoster(players: PlayerProjectionInput[]): number {
  const sps = players.filter((p) => p.role === "starting_pitcher");
  let starts = 0;
  for (const sp of sps) {
    const pts = sp.alreadyScoredPointsThisMatchup;
    if (pts > 2) starts += 1;   // any meaningful appearance → 1 start
    if (pts > 25) starts += 1;  // excellent outing → likely 2+ starts? No, count extra start only
    // Actually: if pts > 20, likely used 2 starts (rare but possible early week start + mid-week start)
    // Capped at starts used per SP: 2 max in a 7-day week
  }
  return Math.min(starts, CBA_PITCHER_START_CAP);
}

// ---- Main loader ----

export interface LoadMatchupStateOptions {
  /** Override the season ID (defaults to ESPN_SEASON_ID env var) */
  seasonId?: string;
  /** If true, load EROSP from file; if false, projections use ESPN stats only */
  useEROSP?: boolean;
  /** Timestamp to use as "now" (for testing / nightly job timing) */
  now?: Date;
  /** Path to EROSP JSON file (defaults to data/erosp/latest.json) */
  erospPath?: string;
}

/**
 * Loads the current week's matchup states for all active matchups.
 * Combines live ESPN API data with EROSP projections.
 *
 * @returns Array of MatchupState, one per active matchup pair this week.
 */
export async function loadCurrentMatchupStates(
  options: LoadMatchupStateOptions = {}
): Promise<MatchupState[]> {
  const {
    seasonId = process.env.ESPN_SEASON_ID ?? ESPN_SEASON_ID,
    useEROSP = true,
    now = new Date(),
    erospPath,
  } = options;

  // ---- Load EROSP projections ----
  const erospFilePath =
    erospPath ??
    path.join(process.cwd(), "data", "erosp", "latest.json");

  let erospIdx: ReturnType<typeof buildEROSPIndex> = {
    byEspnId: new Map(),
    byNormName: new Map(),
  };

  if (useEROSP && fs.existsSync(erospFilePath)) {
    try {
      const erospFile: RawEROSPFile = JSON.parse(
        fs.readFileSync(erospFilePath, "utf-8")
      );
      erospIdx = buildEROSPIndex(erospFile.players);
      console.log(`[espnLoader] Loaded ${erospFile.players.length} EROSP players`);
    } catch (e) {
      console.warn("[espnLoader] Failed to load EROSP file:", e);
    }
  }

  // ---- Fetch ESPN data ----
  const client = createESPNClient(seasonId);

  // Fetch matchup scores + team/roster data in parallel
  const [matchupData, rosterData] = await Promise.all([
    client.fetchLeagueData(["mMatchup", "mMatchupScore", "mSettings", "mTeam"]),
    client.fetchLeagueData(["mTeam", "mRoster"]),
  ]);

  // ---- Parse league settings ----
  const settings = matchupData.settings as ESPNAny | undefined;
  const scoringSettings = settings?.scoringSettings as ESPNAny | undefined;

  // Pitcher start cap: try to read from ESPN settings, fall back to CBA default (7)
  const pitcherStartCap: number =
    ((scoringSettings as ESPNAny | undefined)?.allowedStartingPitchers as number) ??
    CBA_PITCHER_START_CAP;

  const leagueConfig: LeagueConfig = {
    leagueId: process.env.ESPN_LEAGUE_ID ?? ESPN_LEAGUE_ID,
    seasonId,
    scoring: CBA_SCORING,
    rosterPositions: CBA_ROSTER_SLOTS,
    pitcherStartCap,
    dailyLock: true,
    pointsLeague: true,
  };

  // ---- Determine current matchup period ----
  const currentMatchupPeriod: number =
    ((matchupData.status as ESPNAny)?.currentMatchupPeriod as number | undefined) ??
    (matchupData.scoringPeriodId as number | undefined) ??
    1;

  const weekMonday = getCurrentWeekMonday(now);
  const weekSunday = new Date(weekMonday);
  weekSunday.setDate(weekSunday.getDate() + 6);

  // ---- Build team name map ----
  const teamNameMap = new Map<number, string>();
  for (const team of (matchupData.teams ?? []) as ESPNAny[]) {
    const id = team.id as number;
    const name =
      (team.name as string) ??
      (team.location && team.nickname
        ? `${team.location} ${team.nickname}`
        : `Team ${id}`);
    teamNameMap.set(id, name);
  }

  // ---- Build roster map: teamId → player entries ----
  const rosterMap = new Map<number, ESPNAny[]>();
  for (const team of (rosterData.teams ?? []) as ESPNAny[]) {
    const teamId = team.id as number;
    const roster = team.roster as ESPNAny | undefined;
    const entries = (roster?.entries ?? []) as ESPNAny[];
    rosterMap.set(teamId, entries);
  }

  // ---- Find current week's matchups ----
  const schedule = (matchupData.schedule ?? []) as ESPNAny[];
  const currentMatchups = schedule.filter(
    (m) => (m.matchupPeriodId as number) === currentMatchupPeriod
  );

  if (currentMatchups.length === 0) {
    console.warn(
      `[espnLoader] No matchups found for period ${currentMatchupPeriod}`
    );
    return [];
  }

  // ---- Build MatchupState for each matchup ----
  const results: MatchupState[] = [];

  for (const espnMatchup of currentMatchups) {
    const homeData = espnMatchup.home as ESPNAny | undefined;
    const awayData = espnMatchup.away as ESPNAny | undefined;

    if (!homeData?.teamId || !awayData?.teamId) continue;

    const homeTeamId = homeData.teamId as number;
    const awayTeamId = awayData.teamId as number;

    // Team-level current points for this week
    const homeCurrentPoints = (homeData.totalPoints as number) ?? 0;
    const awayCurrentPoints = (awayData.totalPoints as number) ?? 0;

    // Build player lists
    function buildTeamState(
      teamId: number,
      currentPoints: number
    ): FantasyTeamMatchupState {
      const entries = rosterMap.get(teamId) ?? [];
      const players: PlayerProjectionInput[] = [];

      for (const entry of entries) {
        const proj = buildPlayerProjection(entry, teamId, erospIdx, now);
        if (proj) players.push(proj);
      }

      // Estimate starts used: first try counting from roster weekly stats,
      // then fall back to day-of-week heuristic
      const startsFromRoster = countStartsUsedFromRoster(players);
      const usedPitcherStarts = startsFromRoster > 0
        ? startsFromRoster
        : estimateStartsUsed(pitcherStartCap, now);

      return {
        fantasyTeamId: String(teamId),
        name: teamNameMap.get(teamId) ?? `Team ${teamId}`,
        currentPoints,
        players,
        usedPitcherStarts,
      };
    }

    const homeTeam = buildTeamState(homeTeamId, homeCurrentPoints);
    const awayTeam = buildTeamState(awayTeamId, awayCurrentPoints);

    // Detect extended matchup (e.g., 8-day week due to schedule quirks)
    const matchupDays = Math.round(
      (weekSunday.getTime() - weekMonday.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;
    const isExtendedMatchup = matchupDays > 7;

    const matchupConfig: MatchupConfig = {
      matchupId: String(espnMatchup.id ?? `${homeTeamId}-${awayTeamId}`),
      matchupPeriodId: currentMatchupPeriod,
      weekStart: toISODate(weekMonday),
      weekEnd: toISODate(weekSunday),
      pitcherStartCap: isExtendedMatchup
        ? Math.ceil(pitcherStartCap * (matchupDays / 7)) // proportional cap for extended weeks
        : pitcherStartCap,
      isExtendedMatchup,
      lastUpdatedAt: now.toISOString(),
    };

    results.push({
      league: leagueConfig,
      matchup: matchupConfig,
      home: homeTeam,
      away: awayTeam,
    });
  }

  console.log(
    `[espnLoader] Built ${results.length} matchup states for period ${currentMatchupPeriod}`
  );
  return results;
}

/**
 * Lightweight version that loads matchup state from local JSON files only
 * (no ESPN API call). Used for backtesting and testing.
 *
 * @param homeTeamId - CBA team ID
 * @param awayTeamId - CBA team ID
 * @param homeCurrentPoints - points scored so far
 * @param awayCurrentPoints - points scored so far
 */
export async function buildOfflineMatchupState(
  homeTeamId: number,
  awayTeamId: number,
  homeCurrentPoints: number,
  awayCurrentPoints: number,
  options: LoadMatchupStateOptions = {}
): Promise<MatchupState> {
  const {
    seasonId = ESPN_SEASON_ID,
    now = new Date(),
    erospPath,
  } = options;

  const erospFilePath =
    erospPath ??
    path.join(process.cwd(), "data", "erosp", "latest.json");

  let erospIdx: ReturnType<typeof buildEROSPIndex> = {
    byEspnId: new Map(),
    byNormName: new Map(),
  };

  if (fs.existsSync(erospFilePath)) {
    const erospFile: RawEROSPFile = JSON.parse(
      fs.readFileSync(erospFilePath, "utf-8")
    );
    erospIdx = buildEROSPIndex(erospFile.players);
  }

  // Load roster data from local file
  const currentDataPath = path.join(
    process.cwd(),
    "data",
    "current",
    `${seasonId}.json`
  );
  const currentData = JSON.parse(fs.readFileSync(currentDataPath, "utf-8"));

  function buildOfflineTeam(teamId: number, currentPoints: number): FantasyTeamMatchupState {
    const rosterEntry = (currentData.rosters ?? []).find(
      (r: { teamId: number }) => r.teamId === teamId
    );
    const players: PlayerProjectionInput[] = [];

    for (const player of (rosterEntry?.players ?? [])) {
      const erosp = lookupEROSP(player.playerId ?? "", player.playerName ?? "", erospIdx);
      if (!erosp) continue;

      const role: PlayerRole =
        erosp.role === "SP"
          ? "starting_pitcher"
          : erosp.role === "RP"
          ? "relief_pitcher"
          : "hitter";

      players.push({
        playerId: player.playerId ?? "",
        name: player.playerName ?? "",
        mlbTeam: erosp.mlbTeam,
        fantasyTeamId: String(teamId),
        active: true,
        lineupSlot: erosp.position,
        role,
        season: {},
        recent: {},
        erosp,
        alreadyScoredPointsThisMatchup: 0,
        scheduledGamesRemaining: buildRemainingGames(role, erosp, now),
      });
    }

    return {
      fantasyTeamId: String(teamId),
      name: (currentData.teams ?? []).find((t: { id: number }) => t.id === teamId)?.name ?? `Team ${teamId}`,
      currentPoints,
      players,
      usedPitcherStarts: estimateStartsUsed(CBA_PITCHER_START_CAP, now),
    };
  }

  const weekMonday = getCurrentWeekMonday(now);
  const weekSunday = new Date(weekMonday);
  weekSunday.setDate(weekSunday.getDate() + 6);

  return {
    league: {
      leagueId: ESPN_LEAGUE_ID,
      seasonId,
      scoring: CBA_SCORING,
      rosterPositions: CBA_ROSTER_SLOTS,
      pitcherStartCap: CBA_PITCHER_START_CAP,
      dailyLock: true,
      pointsLeague: true,
    },
    matchup: {
      matchupId: `${homeTeamId}-${awayTeamId}`,
      matchupPeriodId: 1,
      weekStart: toISODate(weekMonday),
      weekEnd: toISODate(weekSunday),
      pitcherStartCap: CBA_PITCHER_START_CAP,
      isExtendedMatchup: false,
      lastUpdatedAt: now.toISOString(),
    },
    home: buildOfflineTeam(homeTeamId, homeCurrentPoints),
    away: buildOfflineTeam(awayTeamId, awayCurrentPoints),
  };
}
