/**
 * Admin Editorial Intelligence — pure analytics functions.
 * No async, no server/client directives. Takes pre-loaded data, returns insights.
 */

import type { SeasonData, StandingEntry, PlayerSeason, WeeklyScoresData, WeeklyPlayerEntry } from './types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EROSPPlayer {
  name: string;
  mlbam_id?: number;
  espn_id?: number;
  position: string;
  role: 'H' | 'SP' | 'RP';
  team?: string;
  erosp_raw: number;
  erosp_startable: number;
  erosp_per_game?: number;
  fantasy_team_id: number;
  il_type?: string;
  il_days_remaining?: number;
  injury_note?: string;
  injury_news?: string;
}

export interface TeamMetaEntry {
  id: number;
  displayName?: string;
  name?: string;
  owner?: string;
  primaryColor?: string;
  abbrev?: string;
}

export interface RankingsArticle {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

export interface AdminAnalyticsInput {
  currentSeason: SeasonData;
  erospPlayers: EROSPPlayer[];
  teamMetadata: TeamMetaEntry[];
  rankingsArticles: RankingsArticle[];
  TOTAL_WEEKS: number;
  historicalSeasons?: SeasonData[];
  weeklyScores?: WeeklyScoresData;
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface AllTimeRecord {
  highPoints: number;
  highWeek: number;
  highYear: number;
  lowPoints: number;
  lowWeek: number;
  lowYear: number;
}

export interface SeasonHighLow {
  highPoints: number;
  highWeek: number;
  lowPoints: number;
  lowWeek: number;
}

export interface TeamTrend {
  teamId: number;
  teamName: string;
  owner: string;
  record: string;
  weeklyScores: { week: number; points: number }[];
  avgRecent: number;
  avgEarlier: number;
  trendDirection: 'rising' | 'falling' | 'stable' | 'insufficient_data';
  erospTotal: number;
  actualPointsFor: number;
  erospPace: number;
  vsErospPacePct: number;
  allTimeRecord: AllTimeRecord | null;
  seasonHighLow: SeasonHighLow | null;
  isAllTimeHigh: boolean;
  isAllTimeLow: boolean;
  isSeasonHigh: boolean;
  isSeasonLow: boolean;
  expectedWins: number;
  expectedLosses: number;
}

export interface PlayerSignal {
  playerName: string;
  teamId: number;
  teamName: string;
  position: string;
  totalPoints: number;
  erospRaw: number;
  erospPace: number;
  deviationPct: number;
  priorityScore: number;
  signalType: 'overperforming' | 'underperforming' | 'injury_watch';
  ilType?: string;
  ilDaysRemaining?: number;
  injuryNote?: string;
}

export type UnitGroup = 'SP' | 'RP' | 'C' | 'MIF' | 'CIF' | 'OF' | 'DH';

export const UNIT_LABELS: Record<UnitGroup, string> = {
  SP: 'Starting Pitching',
  RP: 'Relief Pitching',
  C: 'Catcher',
  MIF: 'Middle Infield',
  CIF: 'Corner Infield',
  OF: 'Outfield',
  DH: 'DH / Utility',
};

export interface UnitTeamEntry {
  teamId: number;
  teamName: string;
  actualPts: number;
  rank: number;
  zScore: number;
  players: { name: string; pts: number; position: string }[];
}

export interface UnitGroupStats {
  group: UnitGroup;
  label: string;
  leagueAvg: number;
  leagueStdDev: number;
  teams: UnitTeamEntry[];
}

export interface PositionGroupTeamEntry {
  teamId: number;
  teamName: string;
  erospTotal: number;
  rank: number;
  zScore: number;
  players: { name: string; erospRaw: number }[];
}

export interface PositionGroupStats {
  group: 'SP' | 'RP' | 'C' | 'INF' | 'OF' | 'DH';
  leagueAvg: number;
  leagueStdDev: number;
  teams: PositionGroupTeamEntry[];
}

export interface RosterMoveSignal {
  playerName: string;
  teamId: number;
  teamName: string;
  acquisitionType: 'ADD' | 'TRADE';
  erospRaw: number;
  impact: 'strong' | 'moderate' | 'watch';
  note: string;
}

export interface StorylineBullet {
  priority: number;
  category: 'trend' | 'player_over' | 'player_under' | 'position' | 'roster' | 'injury' | 'season_stats';
  emoji: string;
  headline: string;
  detail?: string;
  teamIds: number[];
  playerName?: string;
}

export interface RankingsTheme {
  name: string;
  type: 'player' | 'team';
  mentionCount: number;
  lastSeen: string;
  currentStatus: 'new' | 'continuing' | 'fading';
}

// ── Weekly Detail Types ───────────────────────────────────────────────────────

export interface WeekTopPerformer {
  playerName: string;
  teamId: number;
  teamName: string;
  slot: string;
  weekPoints: number;
  photoUrl?: string;
}

export interface BenchBoom {
  playerName: string;
  teamId: number;
  teamName: string;
  slot: string;          // slot they WOULD have been in if active
  benchPoints: number;   // points scored while benched
  photoUrl?: string;
}

export interface SlotUnitWeekEntry {
  teamId: number;
  teamName: string;
  activePoints: number;   // points scored in this slot this week
  players: { name: string; points: number; slot: string }[];
}

export interface SlotUnitWeekStats {
  slot: string;           // 'SP', 'DH', 'OF', 'C', etc.
  label: string;
  leagueAvg: number;
  teams: SlotUnitWeekEntry[];
}

export interface WeekDetailStats {
  week: number;
  topPerformers: WeekTopPerformer[];   // top 10 individual performances
  benchBooms: BenchBoom[];             // top bench-point wasters
  slotUnits: SlotUnitWeekStats[];      // per-slot scoring across all teams
  teamBreakdowns: {
    teamId: number;
    teamName: string;
    totalPoints: number;
    benchTotal: number;
    activePlayers: WeeklyPlayerEntry[];
    benchPlayers: WeeklyPlayerEntry[];
  }[];
}

export interface PriorWeekMatchupResult {
  homeTeamId: number;
  homeTeamName: string;
  homePoints: number;
  awayTeamId: number;
  awayTeamName: string;
  awayPoints: number;
  winnerId: number | undefined;
  margin: number;
  marginLabel: 'Dominant' | 'Clear' | 'Close' | 'Nail-biter';
  winnerName: string;
  loserName: string;
}

export interface WeekTeamDelta {
  teamId: number;
  teamName: string;
  weekPoints: number;
  delta: number;
  deltaPct: number;
}

export interface WeekStats {
  priorWeek: number;
  leagueAvg: number;
  leagueMedian: number;
  leagueHigh: number;
  leagueLow: number;
  leagueStdDev: number;
  seasonAvgToDate: number;
  vsSeasonAvg: number;
  teamVsSeasonAvg: WeekTeamDelta[];
}

export interface CategoryPlayerEntry {
  playerName: string;
  teamId: number;
  teamName: string;
  value: number;
  photoUrl?: string;
}

export interface StatCategoryStats {
  catId: string;
  label: string;
  type: 'hitter' | 'pitcher';
  higherIsBetter: boolean;
  leagueTotal: number;
  top3: CategoryPlayerEntry[];
  bottom3: CategoryPlayerEntry[];
}

export interface WeekCategoryStats {
  week: number;
  categories: StatCategoryStats[];
  oddityBullets: StorylineBullet[];
}

export interface TeamSeasonCatStat {
  catId: string;
  label: string;
  type: 'hitter' | 'pitcher';
  higherIsBetter: boolean;
  leagueTotal: number;
  leagueAvg: number;
  teams: { teamId: number; teamName: string; value: number; rank: number }[];
}
export interface TeamSeasonStats {
  categories: TeamSeasonCatStat[];
}

export interface AdminAnalytics {
  currentWeek: number;
  priorWeek: number;
  priorWeekMatchupResults: PriorWeekMatchupResult[];
  completionFraction: number;
  teamTrends: TeamTrend[];
  playerSignals: PlayerSignal[];
  positionGroups: PositionGroupStats[];
  unitStats: UnitGroupStats[];
  rosterMoves: RosterMoveSignal[];
  bullets: StorylineBullet[];
  rankingsThemes: RankingsTheme[];
  seasonStats: {
    topScorerTeamId: number;
    topScorerTeamName: string;
    topScorerPoints: number;
    biggestSingleWeekTeamId: number;
    biggestSingleWeekTeamName: string;
    biggestSingleWeekPoints: number;
    biggestSingleWeekWeek: number;
    totalLeaguePoints: number;
  };
  weekDetail: WeekDetailStats | null;
  weekStats: WeekStats | null;
  weekCategories: WeekCategoryStats | null;
  seasonCatStats: TeamSeasonStats | null;
  allWeekMatchups: Record<number, PriorWeekMatchupResult[]>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeName(n: string): string {
  return n.toLowerCase().replace(/[^a-z ]/g, '').trim();
}

function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length);
}

function zScore(value: number, avg: number, sd: number): number {
  if (sd === 0) return 0;
  return (value - avg) / sd;
}

type PosGroup = 'SP' | 'RP' | 'C' | 'INF' | 'OF' | 'DH';

function classifyPositionGroup(player: EROSPPlayer): PosGroup | null {
  if (player.role === 'SP') return 'SP';
  if (player.role === 'RP') return 'RP';
  const pos = player.position;
  if (pos === 'C') return 'C';
  if (['1B', '2B', '3B', 'SS', 'IF', 'MIF', 'CIF'].includes(pos)) return 'INF';
  if (['OF', 'LF', 'CF', 'RF'].includes(pos)) return 'OF';
  if (pos === 'DH') return 'DH';
  return null;
}

function ordinalStr(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function teamDisplayName(teamId: number, meta: TeamMetaEntry[]): string {
  const m = meta.find(t => t.id === teamId);
  return m?.displayName || m?.name || `Team ${teamId}`;
}

function teamOwner(teamId: number, meta: TeamMetaEntry[]): string {
  const m = meta.find(t => t.id === teamId);
  return m?.owner || '';
}

// Banshees (id=10) joined in 2025; all other teams since 2022
const TEAM_JOIN_YEAR: Record<number, number> = { 10: 2025 };
function teamJoinYear(teamId: number): number {
  return TEAM_JOIN_YEAR[teamId] ?? 2022;
}

// Classify a roster player into a unit group using EROSP role when available.
// Used for season-aggregate unit stats (position-based, fallback).
function classifyUnit(position: string, erospRole?: 'H' | 'SP' | 'RP'): UnitGroup | null {
  if (erospRole === 'SP') return 'SP';
  if (erospRole === 'RP') return 'RP';
  if (position === 'SP') return 'SP';
  if (position === 'RP') return 'RP';
  if (position === 'C') return 'C';
  if (position === '2B' || position === 'SS') return 'MIF';
  if (position === '1B' || position === '3B') return 'CIF';
  if (['OF', 'LF', 'CF', 'RF'].includes(position)) return 'OF';
  if (position === 'DH') return 'DH';
  return null;
}

// Classify by actual ESPN lineup slot ID — used for slot-based unit tracking.
// This correctly attributes DH points to whoever was in the DH slot, not just DH-primary players.
const SLOT_TO_UNIT: Record<number, UnitGroup> = {
  0: 'C',
  1: 'CIF',   // 1B
  2: 'MIF',   // 2B
  3: 'CIF',   // 3B
  4: 'MIF',   // SS
  5: 'OF',    // UTIL-OF flex
  6: 'MIF',   // MI flex
  7: 'CIF',   // CI flex
  8: 'OF', 9: 'OF', 10: 'OF',
  12: 'DH',
  13: 'SP', 14: 'SP',
  15: 'RP',
  19: 'DH',   // INF/UTIL flex — treat like DH for aggregation
};

function classifySlotUnit(slotId: number): UnitGroup | null {
  return SLOT_TO_UNIT[slotId] ?? null;
}

const SLOT_DISPLAY: Record<string, string> = {
  C: 'Catcher', '1B': '1B', '2B': '2B', '3B': '3B', SS: 'SS',
  MIF: 'Middle IF', CIF: 'Corner IF', OF: 'Outfield', DH: 'DH / Utility',
  SP: 'Starting Pitching', RP: 'Relief Pitching',
};

// Human-readable display labels for slots (used in week detail view)
export function slotDisplayLabel(slot: string): string {
  return SLOT_DISPLAY[slot] ?? slot;
}

// ── Season-to-date stat categories (shared by weekCategories + seasonCatStats) ─

const SEASON_HITTER_CATS: { catId: string; label: string; higherIsBetter: boolean }[] = [
  { catId: '12', label: 'HR', higherIsBetter: true },
  { catId: '13', label: 'RBI', higherIsBetter: true },
  { catId: '5',  label: 'R',   higherIsBetter: true },
  { catId: '23', label: 'SB',  higherIsBetter: true },
  { catId: '6',  label: 'H',   higherIsBetter: true },
  { catId: '48', label: 'K',   higherIsBetter: false }, // batting Ks
  { catId: '24', label: 'CS',  higherIsBetter: false },
];

const SEASON_PITCHER_CATS: { catId: string; label: string; higherIsBetter: boolean }[] = [
  { catId: '48', label: 'K',   higherIsBetter: true },  // pitcher Ks
  { catId: '34', label: 'IP',  higherIsBetter: true },
  { catId: '64', label: 'QS',  higherIsBetter: true },
  { catId: '57', label: 'SV',  higherIsBetter: true },
  { catId: '63', label: 'HD',  higherIsBetter: true },
  { catId: '41', label: 'ER',  higherIsBetter: false },
  { catId: '61', label: 'BS',  higherIsBetter: false },
];

// ── Main function ─────────────────────────────────────────────────────────────

export function computeAdminAnalytics(input: AdminAnalyticsInput): AdminAnalytics {
  const { currentSeason, erospPlayers, teamMetadata, rankingsArticles, TOTAL_WEEKS, historicalSeasons, weeklyScores } = input;
  const { matchups, standings, rosters } = currentSeason;

  // -- Current week (in-progress or latest active) --
  const weeksWithActivity = matchups
    .filter(m => (m.home.totalPoints > 0 || m.away.totalPoints > 0))
    .map(m => m.week);
  const currentWeek = weeksWithActivity.length > 0 ? Math.max(...weeksWithActivity) : 1;

  // -- Prior week = most recently FULLY completed week (all matchups have a winner) --
  const weeksByNum: Record<number, typeof matchups> = {};
  for (const m of matchups) {
    if (!weeksByNum[m.week]) weeksByNum[m.week] = [];
    weeksByNum[m.week].push(m);
  }
  const finalizedWeeks = Object.entries(weeksByNum)
    .filter(([, ms]) => ms.length > 0 && ms.every(m => m.winner !== undefined))
    .map(([wk]) => Number(wk));
  const priorWeek = finalizedWeeks.length > 0 ? Math.max(...finalizedWeeks) : 0;

  // Prior week matchup results (for editorial display)
  const priorWeekMatchupResults: PriorWeekMatchupResult[] = priorWeek > 0
    ? (weeksByNum[priorWeek] ?? []).map(m => {
        const homeWon = m.winner === m.home.teamId;
        const winnerPts = homeWon ? m.home.totalPoints : m.away.totalPoints;
        const loserPts = homeWon ? m.away.totalPoints : m.home.totalPoints;
        const margin = Math.round((winnerPts - loserPts) * 10) / 10;
        const marginLabel: PriorWeekMatchupResult['marginLabel'] =
          margin >= 80 ? 'Dominant' : margin >= 40 ? 'Clear' : margin >= 15 ? 'Close' : 'Nail-biter';
        const winnerName = homeWon
          ? teamDisplayName(m.home.teamId, teamMetadata)
          : teamDisplayName(m.away.teamId, teamMetadata);
        const loserName = homeWon
          ? teamDisplayName(m.away.teamId, teamMetadata)
          : teamDisplayName(m.home.teamId, teamMetadata);
        return {
          homeTeamId: m.home.teamId,
          homeTeamName: teamDisplayName(m.home.teamId, teamMetadata),
          homePoints: m.home.totalPoints,
          awayTeamId: m.away.teamId,
          awayTeamName: teamDisplayName(m.away.teamId, teamMetadata),
          awayPoints: m.away.totalPoints,
          winnerId: m.winner,
          margin,
          marginLabel,
          winnerName,
          loserName,
        };
      })
    : [];

  // Completion fraction based on prior completed week (for pace analysis)
  const completionFraction = Math.min((priorWeek || currentWeek) / TOTAL_WEEKS, 1);

  const teamIds = standings.map(s => s.teamId);

  // ── ALL-TIME RECORDS ──────────────────────────────────────────────────────────

  // Collect all weekly scores across every season (historical + current), respecting join year
  const allTimeWeeklyScores: Record<number, { points: number; week: number; year: number }[]> = {};
  const allSeasons: SeasonData[] = [...(historicalSeasons ?? []), currentSeason];
  for (const season of allSeasons) {
    const year = season.year;
    for (const m of season.matchups) {
      const addScore = (teamId: number, pts: number) => {
        if (pts <= 0) return;
        if (year < teamJoinYear(teamId)) return;
        if (!allTimeWeeklyScores[teamId]) allTimeWeeklyScores[teamId] = [];
        allTimeWeeklyScores[teamId].push({ points: pts, week: m.week, year });
      };
      addScore(m.home.teamId, m.home.totalPoints);
      addScore(m.away.teamId, m.away.totalPoints);
    }
  }

  // Compute all-time high/low per team
  const allTimeRecordByTeam: Record<number, AllTimeRecord> = {};
  for (const [tid, scores] of Object.entries(allTimeWeeklyScores)) {
    const teamId = Number(tid);
    if (scores.length === 0) continue;
    const hi = scores.reduce((a, b) => (b.points > a.points ? b : a));
    const lo = scores.reduce((a, b) => (b.points < a.points ? b : a));
    allTimeRecordByTeam[teamId] = {
      highPoints: hi.points, highWeek: hi.week, highYear: hi.year,
      lowPoints: lo.points, lowWeek: lo.week, lowYear: lo.year,
    };
  }

  // ── TEAM TRENDS ──────────────────────────────────────────────────────────────

  // Build weekly scores per team from matchups
  const weeklyScoresByTeam: Record<number, { week: number; points: number }[]> = {};
  for (const m of matchups) {
    if (m.home.totalPoints > 0 || m.away.totalPoints > 0) {
      if (!weeklyScoresByTeam[m.home.teamId]) weeklyScoresByTeam[m.home.teamId] = [];
      if (!weeklyScoresByTeam[m.away.teamId]) weeklyScoresByTeam[m.away.teamId] = [];
      weeklyScoresByTeam[m.home.teamId].push({ week: m.week, points: m.home.totalPoints });
      weeklyScoresByTeam[m.away.teamId].push({ week: m.week, points: m.away.totalPoints });
    }
  }

  // Build EROSP total per team
  const erospByTeam: Record<number, number> = {};
  for (const p of erospPlayers) {
    if (p.fantasy_team_id > 0) {
      erospByTeam[p.fantasy_team_id] = (erospByTeam[p.fantasy_team_id] || 0) + p.erosp_raw;
    }
  }

  // Compute xW-L: each completed week, normalize scores to 7-day equivalent, compare to median
  const xWins = new Map<number, number>();
  const xLosses = new Map<number, number>();
  const completedMatchupsByWeek: Record<number, typeof matchups> = {};
  for (const m of matchups) {
    if (m.winner !== undefined) {
      if (!completedMatchupsByWeek[m.week]) completedMatchupsByWeek[m.week] = [];
      completedMatchupsByWeek[m.week].push(m);
    }
  }
  for (const weekMatchups of Object.values(completedMatchupsByWeek)) {
    const scores = weekMatchups.flatMap(m => [m.home.totalPoints, m.away.totalPoints]);
    const sorted = [...scores].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    for (const m of weekMatchups) {
      for (const side of [m.home, m.away]) {
        if (side.totalPoints >= median) {
          xWins.set(side.teamId, (xWins.get(side.teamId) ?? 0) + 1);
        } else {
          xLosses.set(side.teamId, (xLosses.get(side.teamId) ?? 0) + 1);
        }
      }
    }
  }

  // ── WEEK STATS (league-wide context for the prior week) ─────────────────────

  let weekStats: WeekStats | null = null;
  if (priorWeek > 0) {
    const priorMatchups = weeksByNum[priorWeek] ?? [];
    const priorScores = priorMatchups.flatMap(m => [
      { teamId: m.home.teamId, pts: m.home.totalPoints },
      { teamId: m.away.teamId, pts: m.away.totalPoints },
    ]);
    if (priorScores.length > 0) {
      const pts = priorScores.map(s => s.pts);
      const leagueAvg = mean(pts);
      const sortedPts = [...pts].sort((a, b) => a - b);
      const mid = Math.floor(sortedPts.length / 2);
      const leagueMedian = sortedPts.length % 2 !== 0
        ? sortedPts[mid]
        : (sortedPts[mid - 1] + sortedPts[mid]) / 2;
      const leagueHigh = Math.max(...pts);
      const leagueLow = Math.min(...pts);
      const leagueStdDev = stdDev(pts);

      // Season avg across all fully finalized weeks
      const allFinalizedPts: number[] = [];
      for (const wk of finalizedWeeks) {
        for (const m of (weeksByNum[wk] ?? [])) {
          allFinalizedPts.push(m.home.totalPoints, m.away.totalPoints);
        }
      }
      const seasonAvgToDate = allFinalizedPts.length > 0 ? mean(allFinalizedPts) : leagueAvg;
      const vsSeasonAvg = leagueAvg - seasonAvgToDate;

      const teamVsSeasonAvg: WeekTeamDelta[] = priorScores.map(s => ({
        teamId: s.teamId,
        teamName: teamDisplayName(s.teamId, teamMetadata),
        weekPoints: s.pts,
        delta: s.pts - seasonAvgToDate,
        deltaPct: seasonAvgToDate > 0 ? ((s.pts - seasonAvgToDate) / seasonAvgToDate) * 100 : 0,
      })).sort((a, b) => b.delta - a.delta);

      weekStats = { priorWeek, leagueAvg, leagueMedian, leagueHigh, leagueLow, leagueStdDev, seasonAvgToDate, vsSeasonAvg, teamVsSeasonAvg };
    }
  }

  const teamTrends: TeamTrend[] = teamIds.map(teamId => {
    const standingEntry = standings.find(s => s.teamId === teamId);
    const wins = standingEntry?.wins ?? 0;
    const losses = standingEntry?.losses ?? 0;
    const ties = standingEntry?.ties ?? 0;
    const pointsFor = standingEntry?.pointsFor ?? 0;

    const weeklyScores = (weeklyScoresByTeam[teamId] || []).sort((a, b) => a.week - b.week);
    const completedWeeks = weeklyScores.filter(w => w.week < currentWeek);
    const recent2 = completedWeeks.slice(-2).map(w => w.points);
    const earlier = completedWeeks.slice(0, -2).map(w => w.points);

    const avgRecent = mean(recent2);
    const avgEarlier = mean(earlier);

    let trendDirection: TeamTrend['trendDirection'] = 'insufficient_data';
    if (recent2.length >= 1 && earlier.length >= 1) {
      if (avgRecent > avgEarlier * 1.10) trendDirection = 'rising';
      else if (avgRecent < avgEarlier * 0.90) trendDirection = 'falling';
      else trendDirection = 'stable';
    } else if (recent2.length >= 2) {
      trendDirection = 'stable';
    }

    const erospTotal = erospByTeam[teamId] || 0;
    const erospPace = erospTotal * completionFraction;
    const vsErospPacePct = erospPace > 0 ? ((pointsFor - erospPace) / erospPace) * 100 : 0;

    // Season high/low (current season only, completed weeks)
    const completedPoints = completedWeeks.map(w => w.points);
    let seasonHighLow: SeasonHighLow | null = null;
    if (completedPoints.length > 0) {
      const hiW = completedWeeks.reduce((a, b) => (b.points > a.points ? b : a));
      const loW = completedWeeks.reduce((a, b) => (b.points < a.points ? b : a));
      seasonHighLow = { highPoints: hiW.points, highWeek: hiW.week, lowPoints: loW.points, lowWeek: loW.week };
    }

    // All-time record comparisons (use prior completed week, not in-progress current week)
    const atr = allTimeRecordByTeam[teamId] ?? null;
    const priorWeekPts = weeklyScores.find(w => w.week === priorWeek)?.points ?? 0;
    const isAllTimeHigh = atr !== null && priorWeekPts > 0 && priorWeekPts >= atr.highPoints;
    const isAllTimeLow = atr !== null && priorWeekPts > 0 && priorWeekPts <= atr.lowPoints && priorWeek > 1;
    const isSeasonHigh = seasonHighLow !== null && priorWeekPts > 0 && priorWeekPts >= seasonHighLow.highPoints && priorWeek > 1;
    const isSeasonLow = seasonHighLow !== null && priorWeekPts > 0 && priorWeekPts <= seasonHighLow.lowPoints && priorWeek > 1;

    return {
      teamId,
      teamName: teamDisplayName(teamId, teamMetadata),
      owner: teamOwner(teamId, teamMetadata),
      record: `${wins}-${losses}${ties > 0 ? `-${ties}` : ''}`,
      weeklyScores,
      avgRecent,
      avgEarlier,
      trendDirection,
      erospTotal,
      actualPointsFor: pointsFor,
      erospPace,
      vsErospPacePct,
      allTimeRecord: atr,
      seasonHighLow,
      isAllTimeHigh,
      isAllTimeLow,
      isSeasonHigh,
      isSeasonLow,
      expectedWins: xWins.get(teamId) ?? 0,
      expectedLosses: xLosses.get(teamId) ?? 0,
    };
  });

  // ── PLAYER SIGNALS ────────────────────────────────────────────────────────────

  // Build name → EROSP player map
  const erospByNormName: Record<string, EROSPPlayer> = {};
  for (const ep of erospPlayers) {
    erospByNormName[normalizeName(ep.name)] = ep;
  }

  const playerSignals: PlayerSignal[] = [];

  if (rosters && rosters.length > 0) {
    for (const roster of rosters) {
      const { teamId, players } = roster;
      const tName = teamDisplayName(teamId, teamMetadata);

      for (const rp of players) {
        const ep = erospByNormName[normalizeName(rp.playerName)];
        if (!ep) continue;

        const erospPace = ep.erosp_raw * completionFraction;
        // Only flag meaningful signals
        if (erospPace < 15 || rp.totalPoints < 5) continue;

        const deviationPct = erospPace > 0 ? ((rp.totalPoints - erospPace) / erospPace) * 100 : 0;
        const priorityScore = Math.abs(deviationPct) * Math.log(Math.max(ep.erosp_raw, 1));

        const isIL = !!ep.il_type;

        // Injury watch: on IL and significant projection
        if (isIL && ep.erosp_raw >= 100) {
          playerSignals.push({
            playerName: rp.playerName,
            teamId,
            teamName: tName,
            position: ep.position,
            totalPoints: rp.totalPoints,
            erospRaw: ep.erosp_raw,
            erospPace,
            deviationPct,
            priorityScore: ep.erosp_raw * 2, // high priority for star IL
            signalType: 'injury_watch',
            ilType: ep.il_type,
            ilDaysRemaining: ep.il_days_remaining,
            injuryNote: ep.injury_note,
          });
          continue;
        }

        if (!isIL) {
          if (rp.totalPoints > erospPace * 1.20) {
            playerSignals.push({
              playerName: rp.playerName,
              teamId,
              teamName: tName,
              position: ep.position,
              totalPoints: rp.totalPoints,
              erospRaw: ep.erosp_raw,
              erospPace,
              deviationPct,
              priorityScore,
              signalType: 'overperforming',
            });
          } else if (rp.totalPoints < erospPace * 0.75) {
            playerSignals.push({
              playerName: rp.playerName,
              teamId,
              teamName: tName,
              position: ep.position,
              totalPoints: rp.totalPoints,
              erospRaw: ep.erosp_raw,
              erospPace,
              deviationPct,
              priorityScore,
              signalType: 'underperforming',
            });
          }
        }
      }
    }
  }

  // Sort by priority
  playerSignals.sort((a, b) => b.priorityScore - a.priorityScore);

  // ── POSITION GROUPS ───────────────────────────────────────────────────────────

  const posGroups: PosGroup[] = ['SP', 'RP', 'C', 'INF', 'OF', 'DH'];

  // Collect EROSP per team per group
  const erospByTeamGroup: Record<number, Partial<Record<PosGroup, { total: number; players: { name: string; erospRaw: number }[] }>>> = {};
  for (const tid of teamIds) erospByTeamGroup[tid] = {};

  for (const ep of erospPlayers) {
    if (ep.fantasy_team_id <= 0) continue;
    const grp = classifyPositionGroup(ep);
    if (!grp) continue;
    const tid = ep.fantasy_team_id;
    if (!erospByTeamGroup[tid]) erospByTeamGroup[tid] = {};
    if (!erospByTeamGroup[tid][grp]) erospByTeamGroup[tid][grp] = { total: 0, players: [] };
    erospByTeamGroup[tid][grp]!.total += ep.erosp_raw;
    erospByTeamGroup[tid][grp]!.players.push({ name: ep.name, erospRaw: ep.erosp_raw });
  }

  const positionGroups: PositionGroupStats[] = posGroups.map(grp => {
    const teamTotals = teamIds.map(tid => ({
      teamId: tid,
      total: erospByTeamGroup[tid]?.[grp]?.total ?? 0,
      players: erospByTeamGroup[tid]?.[grp]?.players ?? [],
    }));
    const totals = teamTotals.map(t => t.total);
    const avg = mean(totals);
    const sd = stdDev(totals);

    const sorted = [...teamTotals].sort((a, b) => b.total - a.total);
    const teams: PositionGroupTeamEntry[] = sorted.map((t, i) => ({
      teamId: t.teamId,
      teamName: teamDisplayName(t.teamId, teamMetadata),
      erospTotal: t.total,
      rank: i + 1,
      zScore: zScore(t.total, avg, sd),
      players: t.players.sort((a, b) => b.erospRaw - a.erospRaw),
    }));

    return { group: grp, leagueAvg: avg, leagueStdDev: sd, teams };
  });

  // ── UNIT STATS (actual scored points by position group) ───────────────────────
  // When weekly slot data is available, use slot-based unit attribution (fixes DH = 0).
  // Falls back to position-based classification when weekly data isn't present.

  const erospRoleByName: Record<string, 'H' | 'SP' | 'RP'> = {};
  for (const ep of erospPlayers) {
    erospRoleByName[normalizeName(ep.name)] = ep.role;
  }

  const unitGroups: UnitGroup[] = ['SP', 'RP', 'C', 'MIF', 'CIF', 'OF', 'DH'];

  const unitByTeam: Record<number, Partial<Record<UnitGroup, { total: number; players: { name: string; pts: number; position: string }[] }>>> = {};
  for (const tid of teamIds) unitByTeam[tid] = {};

  const hasSlotData = !!weeklyScores && Object.keys(weeklyScores.weeks).length > 0;

  if (hasSlotData && weeklyScores) {
    // Slot-based: sum activePoints per player across all weeks, grouped by their primarySlot
    for (const weekTeams of Object.values(weeklyScores.weeks)) {
      for (const teamBreakdown of weekTeams) {
        const teamId = teamBreakdown.teamId;
        if (!unitByTeam[teamId]) unitByTeam[teamId] = {};
        for (const player of teamBreakdown.players) {
          if (player.activePoints <= 0) continue;
          const grp = classifySlotUnit(player.primarySlotId);
          if (!grp) continue;
          if (!unitByTeam[teamId][grp]) unitByTeam[teamId][grp] = { total: 0, players: [] };
          unitByTeam[teamId][grp]!.total += player.activePoints;
          // Accumulate across weeks for the same player
          const existing = unitByTeam[teamId][grp]!.players.find(p => p.name === player.playerName);
          if (existing) {
            existing.pts += player.activePoints;
          } else {
            unitByTeam[teamId][grp]!.players.push({
              name: player.playerName, pts: player.activePoints, position: player.position,
            });
          }
        }
      }
    }
  } else if (rosters && rosters.length > 0) {
    // Fallback: position-based classification from season roster totals
    for (const roster of rosters) {
      const { teamId, players } = roster;
      if (!unitByTeam[teamId]) unitByTeam[teamId] = {};
      for (const rp of players) {
        if (rp.totalPoints <= 0) continue;
        const erospRole = erospRoleByName[normalizeName(rp.playerName)];
        const grp = classifyUnit(rp.position, erospRole);
        if (!grp) continue;
        if (!unitByTeam[teamId][grp]) unitByTeam[teamId][grp] = { total: 0, players: [] };
        unitByTeam[teamId][grp]!.total += rp.totalPoints;
        unitByTeam[teamId][grp]!.players.push({ name: rp.playerName, pts: rp.totalPoints, position: rp.position });
      }
    }
  }

  const unitStats: UnitGroupStats[] = unitGroups.map(grp => {
    const teamTotals = teamIds.map(tid => ({
      teamId: tid,
      total: unitByTeam[tid]?.[grp]?.total ?? 0,
      players: unitByTeam[tid]?.[grp]?.players ?? [],
    }));
    const totals = teamTotals.map(t => t.total);
    const avg = mean(totals);
    const sd = stdDev(totals);

    const sorted = [...teamTotals].sort((a, b) => b.total - a.total);
    const teams: UnitTeamEntry[] = sorted.map((t, i) => ({
      teamId: t.teamId,
      teamName: teamDisplayName(t.teamId, teamMetadata),
      actualPts: t.total,
      rank: i + 1,
      zScore: zScore(t.total, avg, sd),
      players: t.players.sort((a, b) => b.pts - a.pts),
    }));

    return { group: grp, label: UNIT_LABELS[grp], leagueAvg: avg, leagueStdDev: sd, teams };
  });

  // ── ROSTER MOVES ─────────────────────────────────────────────────────────────

  const rosterMoves: RosterMoveSignal[] = [];

  if (rosters && rosters.length > 0) {
    const seasonStarted = standings.some(s => s.wins > 0 || s.losses > 0);
    for (const roster of rosters) {
      const { teamId, players } = roster;
      const tName = teamDisplayName(teamId, teamMetadata);

      for (const rp of players) {
        const at = rp.acquisitionType;
        if (at !== 'ADD' && at !== 'TRADE') continue;

        const ep = erospByNormName[normalizeName(rp.playerName)];
        const erospRaw = ep?.erosp_raw ?? 0;
        const impact: RosterMoveSignal['impact'] =
          erospRaw >= 300 ? 'strong' : erospRaw >= 150 ? 'moderate' : 'watch';
        const note =
          at === 'ADD'
            ? `${seasonStarted ? 'Added in-season' : 'Added this offseason'} · ${Math.round(erospRaw)} projected pts`
            : `Acquired via trade · ${Math.round(erospRaw)} projected pts`;

        rosterMoves.push({
          playerName: rp.playerName,
          teamId,
          teamName: tName,
          acquisitionType: at as 'ADD' | 'TRADE',
          erospRaw,
          impact,
          note,
        });
      }
    }
    rosterMoves.sort((a, b) => b.erospRaw - a.erospRaw);
  }

  // ── RANKINGS THEMES ───────────────────────────────────────────────────────────

  const rankingsThemes: RankingsTheme[] = [];

  if (rankingsArticles.length > 0) {
    const sortedArticles = [...rankingsArticles].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const newestDate = sortedArticles[0]?.createdAt ?? '';
    const twoArticlesAgo = sortedArticles[1]?.createdAt ?? '';

    // Gather all EROSP player names + team names as candidates
    const playerNames = erospPlayers
      .filter(ep => ep.fantasy_team_id > 0)
      .map(ep => ({ name: ep.name, norm: normalizeName(ep.name) }));

    const teamNames = teamMetadata.map(m => ({
      name: m.displayName || m.name || '',
      norm: normalizeName(m.displayName || m.name || ''),
    }));

    const mentionCounts: Record<string, { count: number; lastSeen: string; type: 'player' | 'team'; displayName: string }> = {};

    for (const article of sortedArticles) {
      const bodyNorm = normalizeName(article.title + ' ' + article.content);

      for (const pn of playerNames) {
        if (pn.norm.length < 4) continue; // skip very short names
        if (bodyNorm.includes(pn.norm)) {
          if (!mentionCounts[pn.norm]) {
            mentionCounts[pn.norm] = { count: 0, lastSeen: '', type: 'player', displayName: pn.name };
          }
          mentionCounts[pn.norm].count++;
          if (!mentionCounts[pn.norm].lastSeen || article.createdAt > mentionCounts[pn.norm].lastSeen) {
            mentionCounts[pn.norm].lastSeen = article.createdAt;
          }
        }
      }

      for (const tn of teamNames) {
        if (tn.norm.length < 4) continue;
        if (bodyNorm.includes(tn.norm)) {
          if (!mentionCounts[tn.norm]) {
            mentionCounts[tn.norm] = { count: 0, lastSeen: '', type: 'team', displayName: tn.name };
          }
          mentionCounts[tn.norm].count++;
          if (!mentionCounts[tn.norm].lastSeen || article.createdAt > mentionCounts[tn.norm].lastSeen) {
            mentionCounts[tn.norm].lastSeen = article.createdAt;
          }
        }
      }
    }

    for (const [, info] of Object.entries(mentionCounts)) {
      if (info.count === 0) continue;
      let currentStatus: RankingsTheme['currentStatus'];
      if (info.lastSeen === newestDate && info.count === 1) currentStatus = 'new';
      else if (info.count >= 2 && info.lastSeen >= twoArticlesAgo) currentStatus = 'continuing';
      else currentStatus = 'fading';

      rankingsThemes.push({
        name: info.displayName,
        type: info.type,
        mentionCount: info.count,
        lastSeen: info.lastSeen,
        currentStatus,
      });
    }

    rankingsThemes.sort((a, b) => b.mentionCount - a.mentionCount || b.lastSeen.localeCompare(a.lastSeen));
  }

  // ── SEASON STATS ──────────────────────────────────────────────────────────────

  const topScorer = standings.reduce<StandingEntry | null>(
    (best, s) => (!best || s.pointsFor > best.pointsFor ? s : best),
    null
  );

  let biggestWeekTeamId = 0;
  let biggestWeekTeamName = '';
  let biggestWeekPoints = 0;
  let biggestWeekWeek = 0;
  for (const m of matchups) {
    if (m.home.totalPoints > biggestWeekPoints) {
      biggestWeekPoints = m.home.totalPoints;
      biggestWeekTeamId = m.home.teamId;
      biggestWeekTeamName = teamDisplayName(m.home.teamId, teamMetadata);
      biggestWeekWeek = m.week;
    }
    if (m.away.totalPoints > biggestWeekPoints) {
      biggestWeekPoints = m.away.totalPoints;
      biggestWeekTeamId = m.away.teamId;
      biggestWeekTeamName = teamDisplayName(m.away.teamId, teamMetadata);
      biggestWeekWeek = m.week;
    }
  }

  const totalLeaguePoints = standings.reduce((s, x) => s + x.pointsFor, 0);

  const seasonStats = {
    topScorerTeamId: topScorer?.teamId ?? 0,
    topScorerTeamName: topScorer ? teamDisplayName(topScorer.teamId, teamMetadata) : '',
    topScorerPoints: topScorer?.pointsFor ?? 0,
    biggestSingleWeekTeamId: biggestWeekTeamId,
    biggestSingleWeekTeamName: biggestWeekTeamName,
    biggestSingleWeekPoints: biggestWeekPoints,
    biggestSingleWeekWeek: biggestWeekWeek,
    totalLeaguePoints,
  };

  // ── SEASON CAT STATS ──────────────────────────────────────────────────────────

  let seasonCatStats: TeamSeasonStats | null = null;

  if (weeklyScores && Object.keys(weeklyScores.weeks).length > 0) {
    const isPitcherEntry = (p: WeeklyPlayerEntry) => p.primarySlot === 'SP' || p.primarySlot === 'RP';
    const hitterTotals: Record<number, Record<string, number>> = {};
    const pitcherTotals: Record<number, Record<string, number>> = {};
    for (const tid of teamIds) { hitterTotals[tid] = {}; pitcherTotals[tid] = {}; }

    for (const [weekKey, weekTeams] of Object.entries(weeklyScores.weeks)) {
      if (!finalizedWeeks.includes(Number(weekKey))) continue;
      for (const teamBreakdown of weekTeams) {
        const tid = teamBreakdown.teamId;
        if (!hitterTotals[tid]) { hitterTotals[tid] = {}; pitcherTotals[tid] = {}; }
        for (const player of teamBreakdown.players) {
          if (!player.weeklyStats) continue;
          const isP = isPitcherEntry(player);
          if (isP) {
            if (player.benchDays > 0 && player.activeDays === 0) continue;
            for (const c of SEASON_PITCHER_CATS) {
              let val = player.weeklyStats[c.catId] ?? 0;
              if (c.catId === '34') val = val / 3; // outs → innings
              pitcherTotals[tid][c.catId] = (pitcherTotals[tid][c.catId] ?? 0) + val;
            }
          } else {
            for (const c of SEASON_HITTER_CATS) {
              const val = player.weeklyStats[c.catId] ?? 0;
              hitterTotals[tid][c.catId] = (hitterTotals[tid][c.catId] ?? 0) + val;
            }
          }
        }
      }
    }

    const buildSeasonCat = (catId: string, label: string, type: 'hitter' | 'pitcher', higherIsBetter: boolean): TeamSeasonCatStat => {
      const totals = type === 'hitter' ? hitterTotals : pitcherTotals;
      const teamValues = teamIds.map(tid => ({
        teamId: tid,
        teamName: teamDisplayName(tid, teamMetadata),
        value: Math.round((totals[tid]?.[catId] ?? 0) * 10) / 10,
      }));
      const leagueTotal = teamValues.reduce((s, t) => s + t.value, 0);
      const leagueAvg = teamIds.length > 0 ? leagueTotal / teamIds.length : 0;
      const sorted = [...teamValues].sort((a, b) => higherIsBetter ? b.value - a.value : a.value - b.value);
      return {
        catId, label, type, higherIsBetter, leagueTotal,
        leagueAvg: Math.round(leagueAvg * 10) / 10,
        teams: sorted.map((t, i) => ({ ...t, rank: i + 1 })),
      };
    };

    const categories: TeamSeasonCatStat[] = [];
    for (const c of SEASON_HITTER_CATS) categories.push(buildSeasonCat(c.catId, c.label, 'hitter', c.higherIsBetter));
    for (const c of SEASON_PITCHER_CATS) categories.push(buildSeasonCat(c.catId, c.label, 'pitcher', c.higherIsBetter));
    seasonCatStats = { categories };
  }

  // ── STORYLINE BULLETS ─────────────────────────────────────────────────────────

  // Hoisted here so both bullets and weekCategories can use them
  const detailWeek = priorWeek > 0 ? priorWeek : currentWeek;
  const weekBreakdowns = weeklyScores?.weeks[String(detailWeek)];

  const bullets: StorylineBullet[] = [];

  // Team trend bullets
  for (const trend of teamTrends) {
    if (trend.trendDirection === 'rising' && trend.avgEarlier > 0) {
      const pct = Math.round(((trend.avgRecent - trend.avgEarlier) / trend.avgEarlier) * 100);
      bullets.push({
        priority: Math.min(80, 40 + pct),
        category: 'trend',
        emoji: '📈',
        headline: `**${trend.teamName}** is on a hot streak — averaging ${Math.round(trend.avgRecent)} pts/week over the last 2 weeks`,
        detail: `Up ${pct}% from their earlier average of ${Math.round(trend.avgEarlier)} pts/week.`,
        teamIds: [trend.teamId],
      });
    }
    if (trend.trendDirection === 'falling' && trend.avgEarlier > 0) {
      const pct = Math.round(((trend.avgEarlier - trend.avgRecent) / trend.avgEarlier) * 100);
      bullets.push({
        priority: Math.min(75, 35 + pct),
        category: 'trend',
        emoji: '📉',
        headline: `**${trend.teamName}** is cooling off — averaging ${Math.round(trend.avgRecent)} pts/week recently`,
        detail: `Down ${pct}% from their earlier average of ${Math.round(trend.avgEarlier)} pts/week.`,
        teamIds: [trend.teamId],
      });
    }
    // vs EROSP pace bullets
    if (Math.abs(trend.vsErospPacePct) >= 10 && trend.erospPace > 0) {
      const dir = trend.vsErospPacePct > 0 ? 'ahead of' : 'behind';
      const absPct = Math.abs(Math.round(trend.vsErospPacePct));
      bullets.push({
        priority: Math.min(70, 30 + absPct),
        category: 'trend',
        emoji: trend.vsErospPacePct > 0 ? '🔥' : '⚠️',
        headline: `**${trend.teamName}** is ${absPct}% ${dir} their EROSP pace through Week ${priorWeek || currentWeek}`,
        detail: `Actual: ${Math.round(trend.actualPointsFor)} pts · Expected: ${Math.round(trend.erospPace)} pts`,
        teamIds: [trend.teamId],
      });
    }
  }

  // Player over/under bullets
  const overPerformers = playerSignals.filter(s => s.signalType === 'overperforming').slice(0, 3);
  const underPerformers = playerSignals.filter(s => s.signalType === 'underperforming').slice(0, 3);
  const injuryWatch = playerSignals.filter(s => s.signalType === 'injury_watch').slice(0, 3);

  for (const sig of overPerformers) {
    const pct = Math.round(sig.deviationPct);
    bullets.push({
      priority: Math.min(90, 50 + pct / 2),
      category: 'player_over',
      emoji: '⭐',
      headline: `**${sig.playerName}** (${sig.teamName}) is outperforming EROSP pace by ${pct}% through Week ${priorWeek || currentWeek}`,
      detail: `${sig.totalPoints.toFixed(1)} actual pts vs ${sig.erospPace.toFixed(1)} projected pace (${sig.erospRaw} full-season EROSP).`,
      teamIds: [sig.teamId],
      playerName: sig.playerName,
    });
  }

  for (const sig of underPerformers) {
    const pct = Math.round(Math.abs(sig.deviationPct));
    bullets.push({
      priority: Math.min(85, 45 + pct / 2),
      category: 'player_under',
      emoji: '🧊',
      headline: `**${sig.playerName}** (${sig.teamName}) is underperforming EROSP pace by ${pct}%`,
      detail: `${sig.totalPoints.toFixed(1)} actual pts vs ${sig.erospPace.toFixed(1)} projected pace (${sig.erospRaw} full-season EROSP).`,
      teamIds: [sig.teamId],
      playerName: sig.playerName,
    });
  }

  for (const sig of injuryWatch) {
    const daysStr = sig.ilDaysRemaining ? `${sig.ilDaysRemaining} days remaining` : 'timeline unknown';
    bullets.push({
      priority: Math.min(95, 60 + sig.erospRaw / 10),
      category: 'injury',
      emoji: '🚨',
      headline: `**${sig.playerName}** (${sig.teamName}) is on the ${sig.ilType} IL — ${daysStr}, ${Math.round(sig.erospRaw)} projected season pts at stake`,
      detail: sig.injuryNote || undefined,
      teamIds: [sig.teamId],
      playerName: sig.playerName,
    });
  }

  // Position group bullets
  for (const pg of positionGroups) {
    const top = pg.teams[0];
    const bottom = pg.teams[pg.teams.length - 1];
    if (top && top.zScore >= 1.0) {
      bullets.push({
        priority: Math.min(75, 40 + top.zScore * 15),
        category: 'position',
        emoji: '💪',
        headline: `**${top.teamName}** leads the league in projected ${pg.group} strength (EROSP: ${Math.round(top.erospTotal)} pts, 1st of ${pg.teams.length})`,
        detail: `z-score: +${top.zScore.toFixed(1)} above league average.`,
        teamIds: [top.teamId],
      });
    }
    if (bottom && bottom.zScore <= -1.0) {
      bullets.push({
        priority: Math.min(70, 35 + Math.abs(bottom.zScore) * 15),
        category: 'position',
        emoji: '⚠️',
        headline: `**${bottom.teamName}** ranks last in ${pg.group} projected value — potential drag on scoring all season`,
        detail: `EROSP: ${Math.round(bottom.erospTotal)} pts (league avg: ${Math.round(pg.leagueAvg)} pts).`,
        teamIds: [bottom.teamId],
      });
    }
  }

  // Roster move bullets
  const strongAdds = rosterMoves.filter(m => m.acquisitionType === 'ADD' && m.impact === 'strong').slice(0, 2);
  const strongTrades = rosterMoves.filter(m => m.acquisitionType === 'TRADE' && m.impact !== 'watch').slice(0, 2);

  for (const mv of strongAdds) {
    bullets.push({
      priority: 65,
      category: 'roster',
      emoji: '📋',
      headline: `**${mv.teamName}** added **${mv.playerName}** — ${Math.round(mv.erospRaw)} projected season pts`,
      detail: mv.note,
      teamIds: [mv.teamId],
      playerName: mv.playerName,
    });
  }
  for (const mv of strongTrades) {
    bullets.push({
      priority: 60,
      category: 'roster',
      emoji: '🔄',
      headline: `**${mv.teamName}** acquired **${mv.playerName}** via trade — ${Math.round(mv.erospRaw)} projected season pts`,
      detail: mv.note,
      teamIds: [mv.teamId],
      playerName: mv.playerName,
    });
  }

  // All-time and season record bullets
  for (const trend of teamTrends) {
    const curPts = trend.weeklyScores.find(w => w.week === currentWeek)?.points ?? 0;
    if (curPts <= 0) continue;
    if (trend.isAllTimeHigh) {
      const yrsLabel = trend.allTimeRecord!.highYear < currentSeason.year
        ? ` (prev best: ${Math.round(trend.allTimeRecord!.highPoints)} in ${trend.allTimeRecord!.highYear})`
        : '';
      bullets.push({
        priority: 92,
        category: 'trend',
        emoji: '🏆',
        headline: `**${trend.teamName}** scored ${Math.round(curPts)} pts in Week ${currentWeek} — a new all-time franchise record${yrsLabel}`,
        detail: undefined,
        teamIds: [trend.teamId],
      });
    } else if (trend.isSeasonHigh && !trend.isAllTimeHigh && trend.seasonHighLow) {
      bullets.push({
        priority: 72,
        category: 'trend',
        emoji: '📊',
        headline: `**${trend.teamName}** had their best week of the season — ${Math.round(curPts)} pts in Week ${currentWeek}`,
        detail: `All-time high: ${Math.round(trend.allTimeRecord?.highPoints ?? 0)} pts (${trend.allTimeRecord?.highYear ?? ''}).`,
        teamIds: [trend.teamId],
      });
    }
    if (trend.isAllTimeLow) {
      const yrsLabel = trend.allTimeRecord!.lowYear < currentSeason.year
        ? ` (prev worst: ${Math.round(trend.allTimeRecord!.lowPoints)} in ${trend.allTimeRecord!.lowYear})`
        : '';
      bullets.push({
        priority: 88,
        category: 'trend',
        emoji: '💀',
        headline: `**${trend.teamName}** scored only ${Math.round(curPts)} pts in Week ${currentWeek} — a new all-time franchise low${yrsLabel}`,
        detail: undefined,
        teamIds: [trend.teamId],
      });
    } else if (trend.isSeasonLow && !trend.isAllTimeLow && trend.seasonHighLow) {
      bullets.push({
        priority: 68,
        category: 'trend',
        emoji: '📉',
        headline: `**${trend.teamName}** had their worst week of the season — ${Math.round(curPts)} pts in Week ${currentWeek}`,
        detail: `All-time low: ${Math.round(trend.allTimeRecord?.lowPoints ?? 0)} pts (${trend.allTimeRecord?.lowYear ?? ''}).`,
        teamIds: [trend.teamId],
      });
    }
  }

  // ── PER-TEAM COVERAGE: at least 1 positive + 1 negative per team ─────────────

  // For each team, figure out what we can say positive/negative based on available data.
  // Priority: player signal > weekly score vs league median > EROSP pace > position group rank.
  const priorWeekScores = priorWeek > 0
    ? matchups
        .filter(m => m.week === priorWeek)
        .flatMap(m => [
          { teamId: m.home.teamId, pts: m.home.totalPoints },
          { teamId: m.away.teamId, pts: m.away.totalPoints },
        ])
    : [];
  const priorWeekMedian = (() => {
    const sorted = [...priorWeekScores].map(s => s.pts).sort((a, b) => a - b);
    if (sorted.length === 0) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  })();

  for (const tid of teamIds) {
    const tName = teamDisplayName(tid, teamMetadata);
    const trend = teamTrends.find(t => t.teamId === tid);
    const priorPts = priorWeekScores.find(s => s.teamId === tid)?.pts ?? 0;

    // ── POSITIVE bullet for this team ──
    const hasPositive = bullets.some(b => b.teamIds.includes(tid) &&
      (b.category === 'player_over' || b.category === 'roster' ||
       (b.category === 'trend' && (b.emoji === '📈' || b.emoji === '🔥' || b.emoji === '🏆' || b.emoji === '📊'))));

    if (!hasPositive) {
      // Try: player overperformer for this team
      const overSig = playerSignals.find(s => s.teamId === tid && s.signalType === 'overperforming');
      if (overSig) {
        bullets.push({
          priority: 42,
          category: 'player_over',
          emoji: '⭐',
          headline: `**${overSig.playerName}** (${tName}) is outperforming EROSP pace — ${overSig.totalPoints.toFixed(1)} pts vs ${overSig.erospPace.toFixed(1)} projected`,
          teamIds: [tid],
          playerName: overSig.playerName,
        });
      } else if (priorPts > 0 && priorWeekMedian > 0 && priorPts >= priorWeekMedian) {
        // Beat the median this week
        const delta = priorPts - priorWeekMedian;
        bullets.push({
          priority: 38,
          category: 'trend',
          emoji: '📊',
          headline: `**${tName}** scored ${priorPts.toFixed(1)} pts in Week ${priorWeek} — ${delta.toFixed(1)} above the league median`,
          teamIds: [tid],
        });
      } else if (trend && trend.vsErospPacePct > 0) {
        // Ahead of EROSP pace
        bullets.push({
          priority: 35,
          category: 'trend',
          emoji: '🔥',
          headline: `**${tName}** is scoring ahead of their EROSP projection (${Math.round(trend.actualPointsFor)} actual vs ${Math.round(trend.erospPace)} expected pace)`,
          teamIds: [tid],
        });
      } else {
        // Best position group
        const bestGroup = positionGroups
          .map(pg => ({ pg, entry: pg.teams.find(t => t.teamId === tid) }))
          .filter(x => x.entry && x.entry.rank <= 3)
          .sort((a, b) => (b.entry?.zScore ?? 0) - (a.entry?.zScore ?? 0))[0];
        if (bestGroup?.entry) {
          bullets.push({
            priority: 32,
            category: 'position',
            emoji: '💪',
            headline: `**${tName}** ranks ${ordinalStr(bestGroup.entry.rank)} in the league in projected ${bestGroup.pg.group} strength (${Math.round(bestGroup.entry.erospTotal)} EROSP pts)`,
            teamIds: [tid],
          });
        }
      }
    }

    // ── NEGATIVE bullet for this team ──
    const hasNegative = bullets.some(b => b.teamIds.includes(tid) &&
      (b.category === 'player_under' || b.category === 'injury' ||
       (b.category === 'trend' && (b.emoji === '📉' || b.emoji === '⚠️' || b.emoji === '💀'))));

    if (!hasNegative) {
      // Try: player underperformer
      const underSig = playerSignals.find(s => s.teamId === tid && s.signalType === 'underperforming');
      const injSig = playerSignals.find(s => s.teamId === tid && s.signalType === 'injury_watch');
      if (injSig) {
        const daysStr = injSig.ilDaysRemaining ? `~${injSig.ilDaysRemaining}d` : 'timeline unknown';
        bullets.push({
          priority: 44,
          category: 'injury',
          emoji: '🚨',
          headline: `**${injSig.playerName}** (${tName}) is on the ${injSig.ilType} IL (${daysStr}) — ${Math.round(injSig.erospRaw)} projected season pts at stake`,
          detail: injSig.injuryNote || undefined,
          teamIds: [tid],
          playerName: injSig.playerName,
        });
      } else if (underSig) {
        bullets.push({
          priority: 40,
          category: 'player_under',
          emoji: '🧊',
          headline: `**${underSig.playerName}** (${tName}) is underperforming EROSP pace — ${underSig.totalPoints.toFixed(1)} pts vs ${underSig.erospPace.toFixed(1)} projected`,
          teamIds: [tid],
          playerName: underSig.playerName,
        });
      } else if (priorPts > 0 && priorWeekMedian > 0 && priorPts < priorWeekMedian) {
        const delta = priorWeekMedian - priorPts;
        bullets.push({
          priority: 36,
          category: 'trend',
          emoji: '⚠️',
          headline: `**${tName}** scored ${priorPts.toFixed(1)} pts in Week ${priorWeek} — ${delta.toFixed(1)} below the league median`,
          teamIds: [tid],
        });
      } else if (trend && trend.vsErospPacePct < 0) {
        bullets.push({
          priority: 33,
          category: 'trend',
          emoji: '⚠️',
          headline: `**${tName}** is scoring below their EROSP projection (${Math.round(trend.actualPointsFor)} actual vs ${Math.round(trend.erospPace)} expected pace)`,
          teamIds: [tid],
        });
      } else {
        // Weakest position group
        const worstGroup = positionGroups
          .map(pg => ({ pg, entry: pg.teams.find(t => t.teamId === tid) }))
          .filter(x => x.entry && x.entry.rank >= positionGroups[0]?.teams.length - 2)
          .sort((a, b) => (a.entry?.zScore ?? 0) - (b.entry?.zScore ?? 0))[0];
        if (worstGroup?.entry) {
          bullets.push({
            priority: 30,
            category: 'position',
            emoji: '⚠️',
            headline: `**${tName}** ranks ${ordinalStr(worstGroup.entry.rank)} in projected ${worstGroup.pg.group} strength — a potential weak spot going forward`,
            teamIds: [tid],
          });
        }
      }
    }
  }

  // Margin analysis bullets
  if (priorWeekMatchupResults.length > 0) {
    const byMargin = [...priorWeekMatchupResults]
      .filter(m => m.winnerId !== undefined)
      .sort((a, b) => b.margin - a.margin);
    const biggest = byMargin[0];
    const closest = byMargin[byMargin.length - 1];

    if (biggest) {
      const winPts = Math.max(biggest.homePoints, biggest.awayPoints);
      const losePts = Math.min(biggest.homePoints, biggest.awayPoints);
      if (biggest.margin >= 100) {
        bullets.push({
          priority: 85,
          category: 'trend',
          emoji: '💥',
          headline: `**${biggest.winnerName}** dominated Week ${priorWeek} — won by ${biggest.margin.toFixed(1)} points`,
          detail: `${biggest.winnerName} ${winPts.toFixed(1)} – ${losePts.toFixed(1)} ${biggest.loserName}`,
          teamIds: [biggest.winnerId as number],
        });
      } else {
        bullets.push({
          priority: 78,
          category: 'trend',
          emoji: '🔨',
          headline: `**${biggest.winnerName}** had the biggest blowout of Week ${priorWeek} — won by ${biggest.margin.toFixed(1)} pts (${biggest.marginLabel})`,
          detail: `${biggest.winnerName} ${winPts.toFixed(1)} – ${losePts.toFixed(1)} ${biggest.loserName}`,
          teamIds: [biggest.winnerId as number],
        });
      }
    }

    if (closest && byMargin.length > 1) {
      const winPts = Math.max(closest.homePoints, closest.awayPoints);
      const losePts = Math.min(closest.homePoints, closest.awayPoints);
      bullets.push({
        priority: 75,
        category: 'trend',
        emoji: '⚔️',
        headline: `Closest matchup of Week ${priorWeek}: **${closest.winnerName}** edged **${closest.loserName}** by just ${closest.margin.toFixed(1)} pts`,
        detail: `${closest.winnerName} ${winPts.toFixed(1)} – ${losePts.toFixed(1)} ${closest.loserName}`,
        teamIds: [closest.winnerId as number],
      });
    }
  }

  // Week context bullets
  if (weekStats) {
    if (weekStats.vsSeasonAvg > 30) {
      bullets.push({
        priority: 70,
        category: 'trend',
        emoji: '🔥',
        headline: `High-scoring week — Week ${priorWeek} averaged ${weekStats.leagueAvg.toFixed(1)} pts/team, ${weekStats.vsSeasonAvg.toFixed(1)} above the season average`,
        detail: `High: ${weekStats.leagueHigh.toFixed(1)} · Low: ${weekStats.leagueLow.toFixed(1)} · Season avg: ${weekStats.seasonAvgToDate.toFixed(1)}`,
        teamIds: [],
      });
    } else if (weekStats.vsSeasonAvg < -30) {
      bullets.push({
        priority: 70,
        category: 'trend',
        emoji: '🧊',
        headline: `Low-scoring week — Week ${priorWeek} averaged ${weekStats.leagueAvg.toFixed(1)} pts/team, ${Math.abs(weekStats.vsSeasonAvg).toFixed(1)} below the season average`,
        detail: `High: ${weekStats.leagueHigh.toFixed(1)} · Low: ${weekStats.leagueLow.toFixed(1)} · Season avg: ${weekStats.seasonAvgToDate.toFixed(1)}`,
        teamIds: [],
      });
    }
    const topOut = weekStats.teamVsSeasonAvg.filter(t => t.delta >= 15).slice(0, 2);
    const bottomOut = [...weekStats.teamVsSeasonAvg].reverse().filter(t => t.delta <= -15).slice(0, 2);
    for (const t of topOut) {
      bullets.push({
        priority: 65,
        category: 'trend',
        emoji: '⬆️',
        headline: `**${t.teamName}** scored ${t.weekPoints.toFixed(1)} pts in Week ${priorWeek} — ${t.delta.toFixed(1)} above the season average`,
        teamIds: [t.teamId],
      });
    }
    for (const t of bottomOut) {
      bullets.push({
        priority: 62,
        category: 'trend',
        emoji: '⬇️',
        headline: `**${t.teamName}** scored only ${t.weekPoints.toFixed(1)} pts in Week ${priorWeek} — ${Math.abs(t.delta).toFixed(1)} below the season average`,
        teamIds: [t.teamId],
      });
    }
  }

  // ── SEASON STAT BULLETS ───────────────────────────────────────────────────────

  if (seasonCatStats && finalizedWeeks.length >= 3) {
    const weeksWithData = finalizedWeeks.length;

    const getCat = (catId: string, type: 'hitter' | 'pitcher') =>
      seasonCatStats!.categories.find(c => c.catId === catId && c.type === type);

    // Simple leader bullets (need gap ≥ 2 over #2)
    const simpleLeader = (catId: string, type: 'hitter' | 'pitcher', emoji: string, label: string, priority: number) => {
      const cat = getCat(catId, type);
      if (!cat || cat.teams.length < 2) return;
      const leader = cat.teams[0];
      const second = cat.teams[1];
      if (leader.value - second.value >= 2 && leader.value > 0) {
        bullets.push({
          priority,
          category: 'season_stats',
          emoji,
          headline: `**${leader.teamName}** leads the league in ${label} with ${leader.value} (${weeksWithData} weeks) — ${(leader.value - second.value).toFixed(0)} ahead of 2nd`,
          teamIds: [leader.teamId],
        });
      }
    };

    simpleLeader('12', 'hitter',  '💣', 'HR',       58);
    simpleLeader('23', 'hitter',  '💨', 'SB',       60);
    simpleLeader('48', 'pitcher', '🔥', 'pitcher K', 59);
    simpleLeader('64', 'pitcher', '⚾', 'QS',        57);

    // Batting K rate (high-risk offense — #1 in batting strikeouts)
    const bkCat = getCat('48', 'hitter');
    if (bkCat && bkCat.teams[0].value > 0) {
      const ldr = bkCat.teams[0];
      bullets.push({
        priority: 56,
        category: 'season_stats',
        emoji: '😬',
        headline: `**${ldr.teamName}** leads the league in batting strikeouts (${ldr.value} K over ${weeksWithData} weeks) — high-risk offense`,
        teamIds: [ldr.teamId],
      });
    }

    // Cross-stat narratives (≥3 finalized weeks)
    // SB/CS ratio: getting caught a lot
    const sbCat2 = getCat('23', 'hitter');
    const csCat  = getCat('24', 'hitter');
    if (sbCat2 && csCat) {
      for (const t of teamIds) {
        const sbTeam = sbCat2.teams.find(x => x.teamId === t);
        const csTeam = csCat.teams.find(x => x.teamId === t);
        if (!sbTeam || !csTeam) continue;
        const total = sbTeam.value + csTeam.value;
        if (total >= 5 && csTeam.value / total > 0.30) {
          bullets.push({
            priority: 63,
            category: 'season_stats',
            emoji: '🛑',
            headline: `**${teamDisplayName(t, teamMetadata)}** is aggressive on the bases but getting caught — ${csTeam.value} CS vs ${sbTeam.value} SB (${Math.round(csTeam.value / total * 100)}% caught)`,
            teamIds: [t],
          });
          break; // one bullet max
        }
      }
    }

    // HR/R gap: power without production
    const hrCat2 = getCat('12', 'hitter');
    const rCat   = getCat('5',  'hitter');
    if (hrCat2 && rCat) {
      const hrTop3  = new Set(hrCat2.teams.slice(0, 3).map(x => x.teamId));
      const rBot3   = new Set(rCat.teams.slice(-3).map(x => x.teamId));
      const overlap = [...hrTop3].filter(id => rBot3.has(id));
      if (overlap.length > 0) {
        const name = teamDisplayName(overlap[0], teamMetadata);
        const hrRank = hrCat2.teams.findIndex(x => x.teamId === overlap[0]) + 1;
        const rRank  = rCat.teams.findIndex(x => x.teamId === overlap[0]) + 1;
        bullets.push({
          priority: 66,
          category: 'season_stats',
          emoji: '💡',
          headline: `**${name}** is hitting for power but not producing runs — top ${hrRank} in HR, bottom ${11 - rRank} in R`,
          teamIds: [overlap[0]],
        });
      }
    }

    // SV/HD gap: closer depth but no setup
    const svCat = getCat('57', 'pitcher');
    const hdCat = getCat('63', 'pitcher');
    if (svCat && hdCat) {
      const svTop3 = new Set(svCat.teams.slice(0, 3).map(x => x.teamId));
      const hdBot3 = new Set(hdCat.teams.slice(-3).map(x => x.teamId));
      const overlap = [...svTop3].filter(id => hdBot3.has(id));
      if (overlap.length > 0) {
        const name = teamDisplayName(overlap[0], teamMetadata);
        bullets.push({
          priority: 65,
          category: 'season_stats',
          emoji: '🔒',
          headline: `**${name}** has elite closer production but no setup depth — top 3 in SV, bottom 3 in HD`,
          teamIds: [overlap[0]],
        });
      }
    }

    // K/QS gap: Ks without length
    const kCat2  = getCat('48', 'pitcher');
    const qsCat2 = getCat('64', 'pitcher');
    if (kCat2 && qsCat2) {
      const kTop3  = new Set(kCat2.teams.slice(0, 3).map(x => x.teamId));
      const qsBot3 = new Set(qsCat2.teams.slice(-3).map(x => x.teamId));
      const overlap = [...kTop3].filter(id => qsBot3.has(id));
      if (overlap.length > 0) {
        const name = teamDisplayName(overlap[0], teamMetadata);
        bullets.push({
          priority: 67,
          category: 'season_stats',
          emoji: '🎯',
          headline: `**${name}** is starter-dependent on strikeouts but not length — top 3 in pitcher K, bottom 3 in QS`,
          teamIds: [overlap[0]],
        });
      }
    }
  }

  // ── WEEK CATEGORIES ──────────────────────────────────────────────────────────

  let weekCategories: WeekCategoryStats | null = null;

  if (weekBreakdowns && weekBreakdowns.length > 0) {
    const HITTER_CATS: { catId: string; label: string; higherIsBetter: boolean }[] = [
      { catId: '12', label: 'HR', higherIsBetter: true },
      { catId: '13', label: 'RBI', higherIsBetter: true },
      { catId: '5', label: 'R', higherIsBetter: true },
      { catId: '23', label: 'SB', higherIsBetter: true },
      { catId: '6', label: 'H', higherIsBetter: true },
      { catId: '27', label: 'GIDP', higherIsBetter: false },
      { catId: '24', label: 'CS', higherIsBetter: false },
    ];
    const PITCHER_CATS: { catId: string; label: string; higherIsBetter: boolean }[] = [
      { catId: '48', label: 'K', higherIsBetter: true },
      { catId: '34', label: 'IP', higherIsBetter: true },
      { catId: '64', label: 'QS', higherIsBetter: true },
      { catId: '57', label: 'SV', higherIsBetter: true },
      { catId: '63', label: 'HD', higherIsBetter: true },
      { catId: '41', label: 'ER', higherIsBetter: false },
      { catId: '42', label: 'BB', higherIsBetter: false },
    ];

    const isPitcherSlot = (p: WeeklyPlayerEntry) => p.primarySlot === 'SP' || p.primarySlot === 'RP';

    const buildCatStats = (
      catId: string,
      label: string,
      type: 'hitter' | 'pitcher',
      higherIsBetter: boolean,
    ): StatCategoryStats | null => {
      const entries: CategoryPlayerEntry[] = [];
      for (const tb of weekBreakdowns!) {
        for (const p of tb.players) {
          if (!p.weeklyStats) continue;
          const isP = isPitcherSlot(p);
          if (type === 'pitcher' && !isP) continue;
          if (type === 'hitter' && isP) continue;
          let raw = p.weeklyStats[catId] ?? 0;
          if (catId === '34') raw = raw / 3; // IP: outs → innings
          if (raw === 0) continue;
          entries.push({
            playerName: p.playerName,
            teamId: tb.teamId,
            teamName: teamDisplayName(tb.teamId, teamMetadata),
            value: raw,
            photoUrl: p.photoUrl,
          });
        }
      }
      if (entries.length === 0) return null;
      const rawLeagueTotal = entries.reduce((s, e) => s + e.value, 0);
      if (rawLeagueTotal === 0) return null;
      const sorted = [...entries].sort((a, b) => b.value - a.value);
      return {
        catId, label, type, higherIsBetter,
        leagueTotal: rawLeagueTotal,
        top3: sorted.slice(0, 3),
        bottom3: higherIsBetter ? [] : sorted.slice(-3).reverse(),
      };
    };

    const catStats: StatCategoryStats[] = [];
    for (const c of HITTER_CATS) {
      const s = buildCatStats(c.catId, c.label, 'hitter', c.higherIsBetter);
      if (s) catStats.push(s);
    }
    for (const c of PITCHER_CATS) {
      const s = buildCatStats(c.catId, c.label, 'pitcher', c.higherIsBetter);
      if (s) catStats.push(s);
    }

    const oddityBullets: StorylineBullet[] = [];

    const hrCat = catStats.find(c => c.catId === '12');
    if (hrCat && hrCat.top3[0] && hrCat.top3[0].value >= 3) {
      const ldr = hrCat.top3[0];
      oddityBullets.push({
        priority: 72, category: 'player_over', emoji: '💣',
        headline: `**${ldr.playerName}** (${ldr.teamName}) hit ${ldr.value} HRs in Week ${detailWeek}`,
        teamIds: [ldr.teamId], playerName: ldr.playerName,
      });
    }

    const sbCat = catStats.find(c => c.catId === '23');
    if (sbCat && sbCat.top3[0] && sbCat.top3[0].value >= 3) {
      const ldr = sbCat.top3[0];
      oddityBullets.push({
        priority: 68, category: 'player_over', emoji: '💨',
        headline: `**${ldr.playerName}** (${ldr.teamName}) stole ${ldr.value} bases in Week ${detailWeek}`,
        teamIds: [ldr.teamId], playerName: ldr.playerName,
      });
    }

    const qsCat = catStats.find(c => c.catId === '64');
    if (qsCat && qsCat.top3[0] && qsCat.top3[0].value >= 2) {
      const ldr = qsCat.top3[0];
      oddityBullets.push({
        priority: 65, category: 'player_over', emoji: '⚾',
        headline: `**${ldr.playerName}** (${ldr.teamName}) had ${ldr.value} quality starts in Week ${detailWeek}`,
        teamIds: [ldr.teamId], playerName: ldr.playerName,
      });
    }

    weekCategories = { week: detailWeek, categories: catStats, oddityBullets };
    for (const ob of oddityBullets) bullets.push(ob);
  }

  // Deduplicate by headline and sort by priority
  const seen = new Set<string>();
  const dedupedBullets = bullets
    .filter(b => {
      if (seen.has(b.headline)) return false;
      seen.add(b.headline);
      return true;
    })
    .sort((a, b) => b.priority - a.priority);

  // ── WEEK DETAIL ──────────────────────────────────────────────────────────────
  // Uses priorWeek (the most recently finalized week) for editorial relevance.
  // detailWeek and weekBreakdowns are defined above (before bullets section).

  let weekDetail: WeekDetailStats | null = null;

  if (weekBreakdowns && weekBreakdowns.length > 0) {
    // Top individual performers (active only, sorted by weekPoints)
    const allActivePlayers = weekBreakdowns.flatMap(t =>
      t.players
        .filter(p => p.activeDays > 0)
        .map(p => ({ ...p, teamId: t.teamId, teamName: teamDisplayName(t.teamId, teamMetadata) }))
    );
    const topPerformers: WeekTopPerformer[] = allActivePlayers
      .sort((a, b) => b.weekPoints - a.weekPoints)
      .slice(0, 10)
      .map(p => ({
        playerName: p.playerName,
        teamId: p.teamId,
        teamName: p.teamName,
        slot: p.primarySlot,
        weekPoints: p.weekPoints,
        photoUrl: p.photoUrl,
      }));

    // Bench booms: players who scored big while mostly on bench
    const benchCandidates = weekBreakdowns.flatMap(t =>
      t.players
        .filter(p => p.benchPoints >= 5)
        .map(p => ({ ...p, teamId: t.teamId, teamName: teamDisplayName(t.teamId, teamMetadata) }))
    );
    const benchBooms: BenchBoom[] = benchCandidates
      .sort((a, b) => b.benchPoints - a.benchPoints)
      .slice(0, 8)
      .map(p => ({
        playerName: p.playerName,
        teamId: p.teamId,
        teamName: p.teamName,
        slot: p.primarySlot,
        benchPoints: p.benchPoints,
        photoUrl: p.photoUrl,
      }));

    // Slot unit breakdown for this week across all teams
    const weekSlotByTeam: Record<number, Record<string, { pts: number; players: { name: string; points: number; slot: string }[] }>> = {};
    for (const tb of weekBreakdowns) {
      weekSlotByTeam[tb.teamId] = {};
      for (const p of tb.players) {
        if (p.activeDays === 0) continue;
        const slot = p.primarySlot;
        if (!weekSlotByTeam[tb.teamId][slot]) weekSlotByTeam[tb.teamId][slot] = { pts: 0, players: [] };
        weekSlotByTeam[tb.teamId][slot].pts += p.activePoints;
        weekSlotByTeam[tb.teamId][slot].players.push({ name: p.playerName, points: p.activePoints, slot });
      }
    }

    const allSlots = [...new Set(weekBreakdowns.flatMap(t =>
      t.players.filter(p => p.activeDays > 0).map(p => p.primarySlot)
    ))].sort();

    const slotUnits: SlotUnitWeekStats[] = allSlots.map(slot => {
      const teamEntries: SlotUnitWeekEntry[] = weekBreakdowns.map(tb => ({
        teamId: tb.teamId,
        teamName: teamDisplayName(tb.teamId, teamMetadata),
        activePoints: weekSlotByTeam[tb.teamId]?.[slot]?.pts ?? 0,
        players: (weekSlotByTeam[tb.teamId]?.[slot]?.players ?? []).sort((a, b) => b.points - a.points),
      }));
      const avg = mean(teamEntries.map(t => t.activePoints));
      return {
        slot,
        label: slotDisplayLabel(slot),
        leagueAvg: avg,
        teams: teamEntries.sort((a, b) => b.activePoints - a.activePoints),
      };
    });

    // Per-team breakdowns
    const teamBreakdowns = weekBreakdowns.map(tb => ({
      teamId: tb.teamId,
      teamName: teamDisplayName(tb.teamId, teamMetadata),
      totalPoints: tb.totalPoints,
      benchTotal: tb.benchTotal,
      activePlayers: tb.players.filter(p => p.activeDays > 0).sort((a, b) => b.activePoints - a.activePoints),
      benchPlayers: tb.players.filter(p => p.benchDays > 0 && p.activeDays === 0).sort((a, b) => b.benchPoints - a.benchPoints),
    }));

    weekDetail = { week: detailWeek, topPerformers, benchBooms, slotUnits, teamBreakdowns };
  }

  // Build matchup results for every week that has completed matchups
  const allWeekMatchups: Record<number, PriorWeekMatchupResult[]> = {};
  for (const [wkStr, wkMatchups] of Object.entries(weeksByNum)) {
    const wk = Number(wkStr);
    const results: PriorWeekMatchupResult[] = wkMatchups
      .filter(m => m.home.totalPoints > 0 || m.away.totalPoints > 0)
      .map(m => {
        const homeWon = m.winner === m.home.teamId;
        const winnerPts = homeWon ? m.home.totalPoints : m.away.totalPoints;
        const loserPts = homeWon ? m.away.totalPoints : m.home.totalPoints;
        const margin = Math.round((winnerPts - loserPts) * 10) / 10;
        const marginLabel: PriorWeekMatchupResult['marginLabel'] =
          margin >= 80 ? 'Dominant' : margin >= 40 ? 'Clear' : margin >= 15 ? 'Close' : 'Nail-biter';
        return {
          homeTeamId: m.home.teamId,
          homeTeamName: teamDisplayName(m.home.teamId, teamMetadata),
          homePoints: m.home.totalPoints,
          awayTeamId: m.away.teamId,
          awayTeamName: teamDisplayName(m.away.teamId, teamMetadata),
          awayPoints: m.away.totalPoints,
          winnerId: m.winner,
          margin,
          marginLabel,
          winnerName: homeWon
            ? teamDisplayName(m.home.teamId, teamMetadata)
            : teamDisplayName(m.away.teamId, teamMetadata),
          loserName: homeWon
            ? teamDisplayName(m.away.teamId, teamMetadata)
            : teamDisplayName(m.home.teamId, teamMetadata),
        };
      });
    if (results.length > 0) allWeekMatchups[wk] = results;
  }

  return {
    currentWeek,
    priorWeek,
    priorWeekMatchupResults,
    completionFraction,
    teamTrends,
    playerSignals,
    positionGroups,
    unitStats,
    rosterMoves,
    bullets: dedupedBullets,
    rankingsThemes,
    seasonStats,
    weekDetail,
    weekStats,
    weekCategories,
    seasonCatStats,
    allWeekMatchups,
  };
}
