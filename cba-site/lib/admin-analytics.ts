/**
 * Admin Editorial Intelligence — pure analytics functions.
 * No async, no server/client directives. Takes pre-loaded data, returns insights.
 */

import type { SeasonData, StandingEntry, PlayerSeason } from './types';

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
  category: 'trend' | 'player_over' | 'player_under' | 'position' | 'roster' | 'injury';
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

export interface PriorWeekMatchupResult {
  homeTeamId: number;
  homeTeamName: string;
  homePoints: number;
  awayTeamId: number;
  awayTeamName: string;
  awayPoints: number;
  winnerId: number | undefined;
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

// Classify a roster player into a unit group using EROSP role when available
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

// ── Main function ─────────────────────────────────────────────────────────────

export function computeAdminAnalytics(input: AdminAnalyticsInput): AdminAnalytics {
  const { currentSeason, erospPlayers, teamMetadata, rankingsArticles, TOTAL_WEEKS, historicalSeasons } = input;
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
    ? (weeksByNum[priorWeek] ?? []).map(m => ({
        homeTeamId: m.home.teamId,
        homeTeamName: teamDisplayName(m.home.teamId, teamMetadata),
        homePoints: m.home.totalPoints,
        awayTeamId: m.away.teamId,
        awayTeamName: teamDisplayName(m.away.teamId, teamMetadata),
        awayPoints: m.away.totalPoints,
        winnerId: m.winner,
      }))
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

  // Build EROSP role lookup by normalized name
  const erospRoleByName: Record<string, 'H' | 'SP' | 'RP'> = {};
  for (const ep of erospPlayers) {
    erospRoleByName[normalizeName(ep.name)] = ep.role;
  }

  const unitGroups: UnitGroup[] = ['SP', 'RP', 'C', 'MIF', 'CIF', 'OF', 'DH'];

  // Collect actual pts per team per unit from current rosters
  const unitByTeam: Record<number, Partial<Record<UnitGroup, { total: number; players: { name: string; pts: number; position: string }[] }>>> = {};
  for (const tid of teamIds) unitByTeam[tid] = {};

  if (rosters && rosters.length > 0) {
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

  // ── STORYLINE BULLETS ─────────────────────────────────────────────────────────

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

  // Deduplicate by headline and sort by priority
  const seen = new Set<string>();
  const dedupedBullets = bullets
    .filter(b => {
      if (seen.has(b.headline)) return false;
      seen.add(b.headline);
      return true;
    })
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 12);

  // Ensure at least 1 per category if data allows
  const categorySeen = new Set(dedupedBullets.map(b => b.category));
  const missingCategoryBullets = bullets
    .filter(b => !categorySeen.has(b.category) && !seen.has(b.headline))
    .filter((b, i, arr) => arr.findIndex(x => x.category === b.category) === i)
    .slice(0, 3);
  dedupedBullets.push(...missingCategoryBullets);
  dedupedBullets.sort((a, b) => b.priority - a.priority);

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
  };
}
