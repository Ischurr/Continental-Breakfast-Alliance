import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { buildWeeklySpPlan } from '@/lib/fantasy/weeklySpPlan';
import type { WeeklySpPlan } from '@/lib/fantasy/weeklySpPlan';

export const dynamic = 'force-dynamic';

const MLB_BASE = 'https://statsapi.mlb.com/api/v1';
const DATA_DIR = path.join(process.cwd(), 'data');
const LEAGUE_AVG_ERA = 4.20;

// Park factors by home team abbreviation (hitter perspective)
const PARK_FACTORS: Record<string, number> = {
  COL: 1.13, BOS: 1.07, CIN: 1.06, CHC: 1.05, NYY: 1.04, TEX: 1.03, ATL: 1.03,
  PHI: 1.02, BAL: 1.01, HOU: 1.01, MIL: 1.00, STL: 1.00, DET: 1.00, MIA: 0.99,
  CLE: 0.99, MIN: 0.99, NYM: 0.98, TOR: 0.98, TB: 0.97, LAD: 0.97, SEA: 0.97,
  ARI: 0.97, KC: 0.96, SD: 0.96, PIT: 0.96, CWS: 0.96, SF: 0.95, LAA: 0.95,
  OAK: 0.95, ATH: 0.95, WSH: 0.94,
};

// Lineup slots in greedy priority order (most restrictive → most flexible)
const SLOT_ORDER = [
  'C', '1B', '2B', '3B', 'SS',
  'OF', 'OF', 'OF',
  'MI', 'CI',
  'DH', 'UTIL',
  'SP', 'SP', 'SP', 'SP', 'SP', 'SP',
  'RP', 'RP', 'RP',
];

// ── Types ──────────────────────────────────────────────────────────────────────

interface EROSPPlayer {
  mlbam_id: number;
  espn_id: string;
  name: string;
  position: string;
  mlb_team: string;
  role: 'H' | 'SP' | 'RP';
  fantasy_team_id: number;
  erosp_per_game: number;
  erosp_raw: number;
  start_probability: number;
  games_remaining: number;
  fp_per_start?: number;
  rp_role?: string;
  il_type?: string;
  il_days_remaining?: number;
  injury_note?: string;
}

interface ESPNRosterPlayer {
  playerId: string;
  playerName: string;
  position: string;
  eligiblePositions: string[];
  photoUrl?: string;
  totalPoints?: number;
  injuryStatus?: string; // ESPN: OUT, DOUBTFUL, QUESTIONABLE, DAY_TO_DAY, SUSPENSION, etc.
}

export interface LineupPlayer {
  name: string;
  mlbamId: number;
  espnId: string;
  photoUrl: string;
  primaryPosition: string;
  eligiblePositions: string[];
  mlbTeam: string;
  role: 'H' | 'SP' | 'RP';
  rpRole?: string;
  erospPerGame: number;
  fpPerStart?: number;
  startProbability: number;
  ilType?: string;
  ilDaysRemaining?: number;
  injuryNote?: string;
  injuryStatus?: string; // ESPN status: OUT, DOUBTFUL, QUESTIONABLE, DAY_TO_DAY, SUSPENSION
  // Career batter-vs-pitcher history (only on hitters)
  vsOpponentHits?: number;
  vsOpponentAB?: number;
  // Schedule context
  hasGame: boolean;
  isHome: boolean;
  opponentAbbr?: string;
  // For batters: pitcher they face
  probablePitcherName?: string;
  probablePitcherMlbamId?: number;
  probablePitcherEra?: number;
  parkFactor: number;
  opponentStrength: number; // 0.5 = average (higher = weaker pitcher = better for hitter)
  // For SPs: are they the probable starter today?
  isStartingToday: boolean;
  // Computed for optimizer
  estimatedTodayPoints: number;
  // Assigned by optimizer
  slot?: string;
}

export interface DailyLineupResponse {
  date: string;
  teamId: number;
  starters: LineupPlayer[];
  bench: LineupPlayer[];
  weeklySpPlan?: WeeklySpPlan;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getTodayET(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
  }).format(new Date());
}

function eraToOpponentStrength(era: number): number {
  const raw = 0.5 + (era - LEAGUE_AVG_ERA) * 0.05;
  return Math.max(0.1, Math.min(0.9, raw));
}

async function fetchPitcherEra(personId: number): Promise<number | null> {
  try {
    const url =
      `${MLB_BASE}/people/${personId}/stats` +
      `?stats=season&season=2026&group=pitching&sportId=1`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(6_000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as {
      stats?: Array<{ splits?: Array<{ stat?: { era?: string } }> }>;
    };
    const era = data.stats?.[0]?.splits?.[0]?.stat?.era;
    const num = era != null ? parseFloat(era) : NaN;
    return isFinite(num) ? num : null;
  } catch {
    return null;
  }
}

async function fetchBatterVsPitcher(
  batterId: number,
  pitcherId: number,
): Promise<{ hits: number; atBats: number } | null> {
  try {
    const url =
      `${MLB_BASE}/people/${batterId}/stats` +
      `?stats=vsPlayer&opposingPlayerId=${pitcherId}&group=hitting&sportId=1`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(6_000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as {
      stats?: Array<{ splits?: Array<{ stat?: { atBats?: number; hits?: number } }> }>;
    };
    const stat = data.stats?.[0]?.splits?.[0]?.stat;
    if (!stat) return null;
    return { hits: stat.hits ?? 0, atBats: stat.atBats ?? 0 };
  } catch {
    return null;
  }
}

// ── Schedule fetch ─────────────────────────────────────────────────────────────

interface GameContext {
  hasGame: boolean;
  isHome: boolean;
  opponentAbbr: string;
  // Pitcher the BATTERS on this team face
  probablePitcherName?: string;
  probablePitcherMlbamId?: number;
  probablePitcherEra?: number;
  opponentStrength: number;
  parkFactor: number;
  // mlbamId of this team's probable SP (to identify who is starting)
  ownProbablePitcherMlbamId?: number;
  ownProbablePitcherName?: string;
}

async function fetchTodayGameContexts(today: string): Promise<Map<string, GameContext>> {
  const result = new Map<string, GameContext>();
  try {
    const url =
      `${MLB_BASE}/schedule?sportId=1&gameType=R&date=${today}` +
      `&hydrate=probablePitcher,team` +
      `&fields=dates,date,games,teams,home,away,team,abbreviation,probablePitcher,id,fullName`;

    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return result;

    const data = await resp.json() as {
      dates?: Array<{
        games?: Array<{
          teams?: {
            home?: {
              team?: { abbreviation?: string };
              probablePitcher?: { id?: number; fullName?: string };
            };
            away?: {
              team?: { abbreviation?: string };
              probablePitcher?: { id?: number; fullName?: string };
            };
          };
        }>;
      }>;
    };

    // Collect pitcher IDs for ERA fetch
    const pitcherIds = new Set<number>();
    for (const dateEntry of data.dates ?? []) {
      for (const game of dateEntry.games ?? []) {
        const hp = game.teams?.home?.probablePitcher?.id;
        const ap = game.teams?.away?.probablePitcher?.id;
        if (hp) pitcherIds.add(hp);
        if (ap) pitcherIds.add(ap);
      }
    }

    // Fetch ERAs in parallel
    const eraMap = new Map<number, number | null>();
    await Promise.all(
      [...pitcherIds].map(async id => {
        const era = await fetchPitcherEra(id);
        eraMap.set(id, era);
      })
    );

    // Build per-team game context
    for (const dateEntry of data.dates ?? []) {
      for (const game of dateEntry.games ?? []) {
        const homeAbbr = game.teams?.home?.team?.abbreviation ?? '';
        const awayAbbr = game.teams?.away?.team?.abbreviation ?? '';
        if (!homeAbbr || !awayAbbr) continue;

        const homePitcher = game.teams?.home?.probablePitcher;
        const awayPitcher = game.teams?.away?.probablePitcher;
        const parkFactor = PARK_FACTORS[homeAbbr] ?? 1.0;

        // Home team batters face the AWAY team's probable pitcher
        const homeFacesPitcherId = awayPitcher?.id;
        const homeFacesPitcherName = awayPitcher?.fullName;
        const homeFacesPitcherEra = homeFacesPitcherId ? eraMap.get(homeFacesPitcherId) ?? null : null;
        const homeOpponentStrength = homeFacesPitcherEra != null
          ? eraToOpponentStrength(homeFacesPitcherEra)
          : 0.5;

        // Away team batters face the HOME team's probable pitcher
        const awayFacesPitcherId = homePitcher?.id;
        const awayFacesPitcherName = homePitcher?.fullName;
        const awayFacesPitcherEra = awayFacesPitcherId ? eraMap.get(awayFacesPitcherId) ?? null : null;
        const awayOpponentStrength = awayFacesPitcherEra != null
          ? eraToOpponentStrength(awayFacesPitcherEra)
          : 0.5;

        result.set(homeAbbr, {
          hasGame: true,
          isHome: true,
          opponentAbbr: awayAbbr,
          probablePitcherName: homeFacesPitcherName,
          probablePitcherMlbamId: homeFacesPitcherId,
          probablePitcherEra: homeFacesPitcherEra ?? undefined,
          opponentStrength: homeOpponentStrength,
          parkFactor,
          ownProbablePitcherMlbamId: homePitcher?.id,
          ownProbablePitcherName: homePitcher?.fullName,
        });

        result.set(awayAbbr, {
          hasGame: true,
          isHome: false,
          opponentAbbr: homeAbbr,
          probablePitcherName: awayFacesPitcherName,
          probablePitcherMlbamId: awayFacesPitcherId,
          probablePitcherEra: awayFacesPitcherEra ?? undefined,
          opponentStrength: awayOpponentStrength,
          parkFactor,
          ownProbablePitcherMlbamId: awayPitcher?.id,
          ownProbablePitcherName: awayPitcher?.fullName,
        });
      }
    }
  } catch {
    // Return empty on network failure
  }
  return result;
}

// ── Lineup optimizer ───────────────────────────────────────────────────────────

function canFillSlot(player: LineupPlayer, slot: string): boolean {
  if (slot === 'SP') return player.role === 'SP';
  if (slot === 'RP') return player.role === 'RP';
  if (player.role === 'SP' || player.role === 'RP') return false;

  const ep = player.eligiblePositions;
  const has = (...pos: string[]) => pos.some(p => ep.includes(p));

  switch (slot) {
    case 'C':    return has('C');
    case '1B':   return has('1B');
    case '2B':   return has('2B');
    case '3B':   return has('3B');
    case 'SS':   return has('SS');
    case 'MI':   return has('2B', 'SS');
    case 'CI':   return has('1B', '3B');
    case 'OF':   return has('OF', 'LF', 'CF', 'RF');
    case 'DH':   return true; // any hitter
    case 'UTIL': return true; // any hitter
    default:     return false;
  }
}

function computeEstimatedPoints(player: Omit<LineupPlayer, 'estimatedTodayPoints' | 'slot'>): number {
  // IL players and definitive scratches cannot play
  if (player.ilType) return 0;
  const status = player.injuryStatus;
  if (status === 'OUT' || status === 'DOUBTFUL' || status === 'SUSPENSION') return 0;

  if (!player.hasGame) return 0;

  let pts: number;

  if (player.role === 'SP') {
    if (!player.isStartingToday) return 0;
    const base = player.fpPerStart ?? (player.erospPerGame / Math.max(player.startProbability, 0.1));
    pts = Math.max(0, base);
  } else if (player.role === 'RP') {
    pts = Math.max(0, player.erospPerGame);
  } else {
    // Hitter: adjust for park factor and opponent pitcher strength
    const pitcherMult = 0.7 + player.opponentStrength * 0.6; // 0.76 (elite) → 1.24 (bad) pitcher
    pts = Math.max(0, player.erospPerGame * player.parkFactor * pitcherMult);
  }

  // Day-to-day / questionable: ~25% chance of playing full game
  if (status === 'DAY_TO_DAY' || status === 'QUESTIONABLE') pts *= 0.25;

  return pts;
}

function isUnavailable(player: LineupPlayer): boolean {
  if (player.ilType) return true;
  const s = player.injuryStatus;
  return s === 'OUT' || s === 'DOUBTFUL' || s === 'SUSPENSION';
}

function optimizeLineup(players: LineupPlayer[]): { starters: LineupPlayer[]; bench: LineupPlayer[] } {
  // Sort by estimated points descending (players with games > without)
  const sorted = [...players].sort((a, b) => b.estimatedTodayPoints - a.estimatedTodayPoints);

  const assignedIds = new Set<string>();
  const starters: LineupPlayer[] = [];

  for (const slot of SLOT_ORDER) {
    const best = sorted.find(p => !assignedIds.has(p.espnId) && !isUnavailable(p) && canFillSlot(p, slot));
    if (best) {
      assignedIds.add(best.espnId);
      starters.push({ ...best, slot });
    }
  }

  const bench = players
    .filter(p => !assignedIds.has(p.espnId))
    .sort((a, b) => b.estimatedTodayPoints - a.estimatedTodayPoints);

  return { starters, bench };
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> }
): Promise<NextResponse> {
  const { teamId: teamIdStr } = await params;
  const teamId = parseInt(teamIdStr, 10);
  const today = getTodayET();

  // Load EROSP data
  let erospPlayers: EROSPPlayer[] = [];
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, 'erosp', 'latest.json'), 'utf-8')
    );
    erospPlayers = (raw?.players ?? raw) as EROSPPlayer[];
  } catch { /* EROSP unavailable */ }

  const teamEROSP = erospPlayers.filter(p => p.fantasy_team_id === teamId);
  const erospByEspnId = new Map<string, EROSPPlayer>();
  const erospByMlbamId = new Map<number, EROSPPlayer>();
  for (const p of teamEROSP) {
    if (p.espn_id) erospByEspnId.set(p.espn_id, p);
    if (p.mlbam_id) erospByMlbamId.set(p.mlbam_id, p);
  }

  // Name-based fallback lookup across ALL EROSP players — used in Pass 2 to
  // recover mlb_team and projections for rostered players whose espn_id is
  // missing from EROSP (e.g. Jose Ramirez, Bobby Witt Jr., Tatis Jr., etc.)
  function normName(s: string): string {
    return s.toLowerCase().replace(/[^a-z]/g, '');
  }
  const erospByName = new Map<string, EROSPPlayer>();
  for (const p of erospPlayers) {
    erospByName.set(normName(p.name), p);
  }

  // Load ESPN roster for position eligibilities
  let espnRoster: ESPNRosterPlayer[] = [];
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, 'current', '2026.json'), 'utf-8')
    );
    const rosters: Array<{ teamId: number; players: ESPNRosterPlayer[] }> = raw?.rosters ?? [];
    espnRoster = rosters.find(r => r.teamId === teamId)?.players ?? [];
  } catch { /* ESPN data unavailable */ }

  // Build ESPN player lookup by playerId
  const espnByPlayerId = new Map<string, ESPNRosterPlayer>();
  for (const p of espnRoster) {
    espnByPlayerId.set(p.playerId, p);
  }

  // Fetch today's schedule with pitcher info
  const schedule = await fetchTodayGameContexts(today);

  // Build combined player list (EROSP + ESPN roster eligibility)
  const seenEspnIds = new Set<string>();
  const players: LineupPlayer[] = [];

  // Pass 1: EROSP players for this team (primary source)
  for (const ep of teamEROSP) {
    const espn = ep.espn_id ? espnByPlayerId.get(ep.espn_id) : undefined;
    const eligiblePositions = espn?.eligiblePositions ?? [ep.position];
    const photoUrl = espn?.photoUrl ?? (ep.espn_id
      ? `https://a.espncdn.com/i/headshots/mlb/players/full/${ep.espn_id}.png`
      : '');

    const gameCtx = schedule.get(ep.mlb_team);
    const hasGame = gameCtx?.hasGame ?? false;

    // For SP: check if they're the probable starter today
    const isStartingToday =
      ep.role === 'SP' &&
      hasGame &&
      gameCtx?.ownProbablePitcherMlbamId === ep.mlbam_id;

    const playerBase: Omit<LineupPlayer, 'estimatedTodayPoints' | 'slot'> = {
      name: ep.name,
      mlbamId: ep.mlbam_id,
      espnId: ep.espn_id,
      photoUrl,
      primaryPosition: ep.position,
      eligiblePositions,
      mlbTeam: ep.mlb_team,
      role: ep.role,
      rpRole: ep.rp_role,
      erospPerGame: ep.erosp_per_game,
      fpPerStart: ep.fp_per_start,
      startProbability: ep.start_probability,
      ilType: ep.il_type,
      ilDaysRemaining: ep.il_days_remaining,
      injuryNote: ep.injury_note,
      injuryStatus: espn?.injuryStatus,
      hasGame,
      isHome: gameCtx?.isHome ?? false,
      opponentAbbr: gameCtx?.opponentAbbr,
      probablePitcherName: gameCtx?.probablePitcherName,
      probablePitcherMlbamId: gameCtx?.probablePitcherMlbamId,
      probablePitcherEra: gameCtx?.probablePitcherEra,
      parkFactor: hasGame ? (gameCtx?.parkFactor ?? 1.0) : 1.0,
      opponentStrength: gameCtx?.opponentStrength ?? 0.5,
      isStartingToday,
    };

    const estimated = computeEstimatedPoints(playerBase);
    players.push({ ...playerBase, estimatedTodayPoints: estimated });

    if (ep.espn_id) seenEspnIds.add(ep.espn_id);
  }

  // Pass 2: ESPN roster players not matched by espn_id.
  // Try a name-based fallback into EROSP so players whose espn_id is missing
  // (e.g. Jose Ramirez, Tatis Jr., Bobby Witt Jr.) still get their real
  // mlb_team, schedule context, and projections.
  for (const ep of espnRoster) {
    if (seenEspnIds.has(ep.playerId)) continue;

    const erospMatch = erospByName.get(normName(ep.playerName));
    const mlbTeam = erospMatch?.mlb_team ?? '';
    const gameCtx = mlbTeam ? schedule.get(mlbTeam) : undefined;
    const hasGame = gameCtx?.hasGame ?? false;
    const role: 'H' | 'SP' | 'RP' = erospMatch
      ? erospMatch.role
      : (ep.position === 'SP' ? 'SP' : ep.position === 'RP' ? 'RP' : 'H');
    const isStartingToday =
      role === 'SP' && hasGame && !!erospMatch &&
      gameCtx?.ownProbablePitcherMlbamId === erospMatch.mlbam_id;

    const playerBase: Omit<LineupPlayer, 'estimatedTodayPoints' | 'slot'> = {
      name: ep.playerName,
      mlbamId: erospMatch?.mlbam_id ?? 0,
      espnId: ep.playerId,
      photoUrl: ep.photoUrl ?? `https://a.espncdn.com/i/headshots/mlb/players/full/${ep.playerId}.png`,
      primaryPosition: ep.position,
      eligiblePositions: ep.eligiblePositions,
      mlbTeam,
      role,
      rpRole: erospMatch?.rp_role,
      erospPerGame: erospMatch?.erosp_per_game ?? 0,
      fpPerStart: erospMatch?.fp_per_start,
      startProbability: erospMatch?.start_probability ?? (role !== 'H' ? 0.2 : 0.9),
      ilType: erospMatch?.il_type,
      ilDaysRemaining: erospMatch?.il_days_remaining,
      injuryNote: erospMatch?.injury_note,
      injuryStatus: ep.injuryStatus,
      hasGame,
      isHome: gameCtx?.isHome ?? false,
      opponentAbbr: gameCtx?.opponentAbbr,
      probablePitcherName: gameCtx?.probablePitcherName,
      probablePitcherMlbamId: gameCtx?.probablePitcherMlbamId,
      probablePitcherEra: gameCtx?.probablePitcherEra,
      parkFactor: hasGame ? (gameCtx?.parkFactor ?? 1.0) : 1.0,
      opponentStrength: gameCtx?.opponentStrength ?? 0.5,
      isStartingToday,
    };

    const estimated = computeEstimatedPoints(playerBase);
    players.push({ ...playerBase, estimatedTodayPoints: estimated });
    seenEspnIds.add(ep.playerId);
  }

  // Fetch career batter-vs-pitcher history in parallel for all hitters with a known probable pitcher
  const bvpResults = await Promise.all(
    players
      .filter(p => p.role === 'H' && p.mlbamId && p.probablePitcherMlbamId)
      .map(async p => {
        const stats = await fetchBatterVsPitcher(p.mlbamId, p.probablePitcherMlbamId!);
        return { espnId: p.espnId, stats };
      })
  );
  const bvpMap = new Map(bvpResults.map(r => [r.espnId, r.stats]));
  const playersWithBvp = players.map(p => {
    const bvp = bvpMap.get(p.espnId);
    return bvp ? { ...p, vsOpponentHits: bvp.hits, vsOpponentAB: bvp.atBats } : p;
  });

  const { starters, bench } = optimizeLineup(playersWithBvp);

  // Build weekly SP plan from all SP roster players
  const spRoster = playersWithBvp
    .filter(p => p.role === 'SP' && p.fpPerStart && p.fpPerStart > 0)
    .map(p => ({
      name: p.name,
      mlbamId: p.mlbamId,
      espnId: p.espnId,
      mlbTeam: p.mlbTeam,
      fpPerStart: p.fpPerStart!,
    }));

  const weeklySpPlan = await buildWeeklySpPlan(spRoster, today);

  const response: DailyLineupResponse = { date: today, teamId, starters, bench, weeklySpPlan };
  return NextResponse.json(response);
}
