#!/usr/bin/env tsx
/**
 * editorial-dump.ts
 *
 * Produces a plain-text editorial brief for use in Claude Code analysis sessions.
 * Run this, then ask Claude to analyze the output alongside the rankings posts.
 *
 * Usage (from cba-site/):
 *   npx tsx scripts/editorial-dump.ts
 *
 * No API calls. Reads local data files + KV rankings.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const DATA = path.join(process.cwd(), 'data');

// ── Data loading ──────────────────────────────────────────────────────────────

function readJson<T>(rel: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf-8')) as T;
}

async function fetchRankings(): Promise<{ id: string; title: string; content: string; createdAt: string }[]> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (url && token) {
    const res = await fetch(`${url}/get/rankings`, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json() as { result: string };
    if (json.result) {
      const data = JSON.parse(json.result) as { articles: { id: string; title: string; content: string; createdAt: string }[] };
      return data.articles ?? [];
    }
  }
  const local = readJson<{ articles: { id: string; title: string; content: string; createdAt: string }[] }>('rankings.json');
  return local.articles ?? [];
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

// ── Types (inline to avoid import issues) ────────────────────────────────────

interface TeamMeta { id: number; name: string; displayName?: string; ownerName?: string }
interface Standing { teamId: number; wins: number; losses: number; ties: number; pointsFor: number; pointsAgainst: number }
interface Matchup { week: number; home: { teamId: number; totalPoints: number }; away: { teamId: number; totalPoints: number }; winner?: number }
interface WeekPlayer { playerName: string; position: string; primarySlot: string; weekPoints: number; activePoints: number; benchPoints: number; activeDays: number; playerId: string }
interface WeekTeam { teamId: number; week: number; totalPoints: number; benchTotal: number; players: WeekPlayer[] }
interface EROSPPlayer { espn_id: string; name: string; position: string; mlb_team: string; role: string; fantasy_team_id: number; erosp_raw: number; erosp_per_game: number; games_remaining: number; il_type?: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

function teamName(id: number, teams: TeamMeta[]): string {
  const t = teams.find(t => t.id === id);
  return t ? (t.displayName || t.name) : `Team ${id}`;
}

function pct(a: number, b: number): string {
  if (!b) return '—';
  return `${((a / b - 1) * 100) >= 0 ? '+' : ''}${((a / b - 1) * 100).toFixed(0)}%`;
}

function fmt(n: number): string { return n.toFixed(1); }

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Load data
  const teamsFile = readJson<{ teams: TeamMeta[] }>('teams.json');
  const teams = teamsFile.teams;

  const season = readJson<{ standings: Standing[]; matchups: Matchup[]; weeklyStats?: unknown }>('current/2026.json');
  const standings = season.standings;
  const matchups = season.matchups;

  const weeklyFile = readJson<{ weeks: Record<string, WeekTeam[]> }>('current/weekly-player-scores-2026.json');
  const allWeeks = weeklyFile.weeks;

  const erospFile = readJson<{ players: EROSPPlayer[]; generated_at: string; games_remaining: number }>('erosp/latest.json');
  const erospPlayers = erospFile.players;
  const erospByEspnId = new Map(erospPlayers.map(p => [p.espn_id, p]));

  const articles = await fetchRankings();
  const sortedArticles = [...articles].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  // Determine weeks available
  const weekNums = Object.keys(allWeeks).map(Number).sort((a, b) => a - b);

  // Find last COMPLETE week (all matchups for that week have a winner decided)
  const isWeekComplete = (wk: number) => {
    const wkMatchups = matchups.filter(m => m.week === wk);
    return wkMatchups.length > 0 && wkMatchups.every(m => m.winner !== undefined && m.winner !== null);
  };
  const completeWeeks = weekNums.filter(isWeekComplete);
  const inProgressWeeks = weekNums.filter(w => !isWeekComplete(w));
  const latestCompleteWeek = completeWeeks[completeWeeks.length - 1] ?? weekNums[weekNums.length - 2];
  const currentWeek = inProgressWeeks[0]; // may be undefined if all complete
  const latestWeek = latestCompleteWeek;
  const prevWeek = completeWeeks[completeWeeks.length - 2];

  // Build per-player season history: playerId → [{ week, pts }]
  const playerHistory: Map<string, { week: number; pts: number; name: string; position: string; teamId: number }[]> = new Map();
  for (const [wkStr, teams_] of Object.entries(allWeeks)) {
    const wkNum = Number(wkStr);
    for (const team of teams_) {
      for (const p of team.players) {
        if (p.primarySlot === 'BE' || p.primarySlot === 'IL') continue; // active starters only
        if (p.activeDays === 0 && p.weekPoints === 0) continue; // phantom injury week — player in active slot but never played
        if (!playerHistory.has(p.playerId)) playerHistory.set(p.playerId, []);
        playerHistory.get(p.playerId)!.push({ week: wkNum, pts: p.weekPoints, name: p.playerName, position: p.position, teamId: team.teamId });
      }
    }
  }

  // Per-player season avg and last week points
  interface PlayerSummary {
    playerId: string; name: string; position: string; teamId: number;
    lastWeekPts: number; seasonTotal: number; seasonAvg: number; weeksPlayed: number;
    vsSeasonAvg: number; trendDelta: number; // last2avg - prev2avg
    erosp?: EROSPPlayer; erospPace?: number; // actual pts/game_played / erosp_per_game
  }

  const playerSummaries: PlayerSummary[] = [];
  for (const [playerId, history] of playerHistory.entries()) {
    const sorted = [...history].sort((a, b) => a.week - b.week);
    const lastWeekEntry = sorted.find(h => h.week === latestWeek);
    if (!lastWeekEntry) continue; // not active last week

    const seasonTotal = sorted.reduce((s, h) => s + h.pts, 0);
    const seasonAvg = seasonTotal / sorted.length;
    const lastWeekPts = lastWeekEntry.pts;
    const vsSeasonAvg = lastWeekPts - seasonAvg;

    // Trend: last 2 weeks avg vs prior 2 weeks avg
    const recent = sorted.slice(-2).map(h => h.pts);
    const prior = sorted.slice(-4, -2).map(h => h.pts);
    const recentAvg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : seasonAvg;
    const priorAvg = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : seasonAvg;
    const trendDelta = recentAvg - priorAvg;

    const erosp = erospByEspnId.get(playerId);
    let erospPace: number | undefined;
    if (erosp && erosp.erosp_per_game > 0 && sorted.length > 0) {
      const actualPerGame = (seasonTotal / sorted.length) / 7; // rough weekly-to-daily
      erospPace = actualPerGame / erosp.erosp_per_game;
    }

    playerSummaries.push({
      playerId, name: lastWeekEntry.name, position: lastWeekEntry.position, teamId: lastWeekEntry.teamId,
      lastWeekPts, seasonTotal, seasonAvg, weeksPlayed: sorted.length, vsSeasonAvg, trendDelta, erosp, erospPace,
    });
  }

  const out: string[] = [];
  const line = (s = '') => out.push(s);

  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  line(`EDITORIAL BRIEF — ${today}`);
  const currentWkNote = currentWeek ? `  |  Week ${currentWeek} IN PROGRESS (partial scores)` : '';
  line(`Rankings posts: ${sortedArticles.length}  |  Last complete week: ${latestWeek}  |  EROSP as of: ${erospFile.generated_at?.slice(0, 10) ?? '?'}${currentWkNote}`);
  line('═'.repeat(90));

  // ── 1. TEAM STANDINGS + LAST WEEK ─────────────────────────────────────────
  line('\n1. TEAM STANDINGS + LAST WEEK PERFORMANCE');
  line('─'.repeat(90));

  // Build weekly team totals per team
  const teamWeeklyTotals: Map<number, number[]> = new Map();
  for (const [, wkTeams] of Object.entries(allWeeks)) {
    for (const t of wkTeams) {
      if (!teamWeeklyTotals.has(t.teamId)) teamWeeklyTotals.set(t.teamId, []);
      teamWeeklyTotals.get(t.teamId)!.push(t.totalPoints);
    }
  }

  const lastWeekTeams = allWeeks[String(latestWeek)] ?? [];
  const prevWeekTeams = allWeeks[String(prevWeek)] ?? [];

  // Sort by current standings (wins desc, then points)
  const sortedStandings = [...standings].sort((a, b) => (b.wins - a.wins) || (b.pointsFor - a.pointsFor));

  line(`${'Team'.padEnd(28)} ${'W-L'.padEnd(6)} ${'SeasonPts'.padEnd(10)} ${'SeasonAvg'.padEnd(10)} ${'Wk'.padEnd(3)}Pts ${'vs Wk-1'.padEnd(10)} ${'vsAvg'.padEnd(8)} Matchup Result`);
  for (const s of sortedStandings) {
    const tn = teamName(s.teamId, teams).padEnd(28);
    const record = `${s.wins}-${s.losses}`.padEnd(6);
    const seasonPts = fmt(s.pointsFor).padEnd(10);
    const wkTotals = teamWeeklyTotals.get(s.teamId) ?? [];
    const seasonAvg = wkTotals.length ? wkTotals.reduce((a, b) => a + b, 0) / wkTotals.length : 0;
    const lastWkEntry = lastWeekTeams.find(t => t.teamId === s.teamId);
    const prevWkEntry = prevWeekTeams.find(t => t.teamId === s.teamId);
    const lastWkPts = lastWkEntry?.totalPoints ?? 0;
    const prevWkPts = prevWkEntry?.totalPoints ?? 0;
    const vsAvg = lastWkPts - seasonAvg;
    const vsPrev = lastWkPts - prevWkPts;
    // Find matchup result for last complete week
    const mu = matchups.find(m => m.week === latestWeek && (m.home.teamId === s.teamId || m.away.teamId === s.teamId));
    let muResult = '';
    if (mu) {
      const mine = mu.home.teamId === s.teamId ? mu.home : mu.away;
      const opp = mu.home.teamId === s.teamId ? mu.away : mu.home;
      const won = mu.winner === s.teamId;
      muResult = `${won ? 'W' : 'L'} ${fmt(mine.totalPoints)}-${fmt(opp.totalPoints)} vs ${teamName(opp.teamId, teams).split(' ').slice(-1)[0]}`;
    }
    line(`${tn} ${record} ${seasonPts} ${fmt(seasonAvg).padEnd(10)} ${fmt(lastWkPts).padEnd(7)} ${(vsPrev >= 0 ? '+' : '') + fmt(vsPrev).padEnd(9)} ${(vsAvg >= 0 ? '+' : '') + fmt(vsAvg).padEnd(7)} ${muResult}`);
  }

  // ── 1b. CURRENT WEEK IN-PROGRESS SCORES (if applicable) ──────────────────
  if (currentWeek && allWeeks[String(currentWeek)]) {
    const cwTeams = allWeeks[String(currentWeek)];
    line(`\n  CURRENT WEEK ${currentWeek} (in progress — partial scores as of today)`);
    line(`  ${'Team'.padEnd(28)} ${'CurPts'.padEnd(9)} ${'Opponent'.padEnd(28)} ${'OppPts'.padEnd(9)} Margin`);
    const shown = new Set<number>();
    for (const t of cwTeams) {
      if (shown.has(t.teamId)) continue;
      const mu = matchups.find(m => m.week === currentWeek && (m.home.teamId === t.teamId || m.away.teamId === t.teamId));
      if (!mu) continue;
      const isMine = mu.home.teamId === t.teamId;
      const myPts = t.totalPoints;
      const oppId = isMine ? mu.away.teamId : mu.home.teamId;
      const oppTeam = cwTeams.find(x => x.teamId === oppId);
      const oppPts = oppTeam?.totalPoints ?? 0;
      const margin = myPts - oppPts;
      shown.add(t.teamId);
      shown.add(oppId);
      line(`  ${teamName(t.teamId, teams).padEnd(28)} ${fmt(myPts).padEnd(9)} ${teamName(oppId, teams).padEnd(28)} ${fmt(oppPts).padEnd(9)} ${margin >= 0 ? '+' : ''}${fmt(margin)}`);
    }
  }

  // ── 2. LAST WEEK PLAYER STANDOUTS ─────────────────────────────────────────
  line('\n\n2. LAST WEEK PLAYER STANDOUTS (Week ' + latestWeek + ')');
  line('─'.repeat(90));

  const sortedByLastWk = [...playerSummaries].sort((a, b) => b.lastWeekPts - a.lastWeekPts);

  line('\n  TOP 15 ACTIVE STARTERS — LAST WEEK');
  line(`  ${'Player'.padEnd(26)} ${'Pos'.padEnd(5)} ${'Team'.padEnd(22)} ${'WkPts'.padEnd(8)} ${'SeasonAvg'.padEnd(11)} ${'vsAvg'.padEnd(9)} ${'SeasonTotal'.padEnd(12)} Trend`);
  for (const p of sortedByLastWk.slice(0, 15)) {
    const tn = teamName(p.teamId, teams).split(' ').slice(-1)[0];
    const trend = p.trendDelta >= 15 ? '↑ Hot' : p.trendDelta <= -15 ? '↓ Cold' : '→';
    line(`  ${p.name.padEnd(26)} ${p.position.padEnd(5)} ${tn.padEnd(22)} ${fmt(p.lastWeekPts).padEnd(8)} ${fmt(p.seasonAvg).padEnd(11)} ${((p.vsSeasonAvg >= 0 ? '+' : '') + fmt(p.vsSeasonAvg)).padEnd(9)} ${fmt(p.seasonTotal).padEnd(12)} ${trend}`);
  }

  line('\n  BOTTOM 10 ACTIVE STARTERS — LAST WEEK (starters who disappointed)');
  line(`  ${'Player'.padEnd(26)} ${'Pos'.padEnd(5)} ${'Team'.padEnd(22)} ${'WkPts'.padEnd(8)} ${'SeasonAvg'.padEnd(11)} ${'vsAvg'.padEnd(9)} Trend`);
  for (const p of sortedByLastWk.slice(-10).reverse()) {
    const tn = teamName(p.teamId, teams).split(' ').slice(-1)[0];
    const trend = p.trendDelta >= 15 ? '↑ Hot' : p.trendDelta <= -15 ? '↓ Cold' : '→';
    line(`  ${p.name.padEnd(26)} ${p.position.padEnd(5)} ${tn.padEnd(22)} ${fmt(p.lastWeekPts).padEnd(8)} ${fmt(p.seasonAvg).padEnd(11)} ${((p.vsSeasonAvg >= 0 ? '+' : '') + fmt(p.vsSeasonAvg)).padEnd(9)} ${trend}`);
  }

  // ── 3. BIGGEST DEVIATIONS FROM PLAYER'S OWN SEASON NORM ──────────────────
  line('\n\n3. BIGGEST DEVIATIONS FROM PLAYER\'S OWN SEASON AVERAGE (Week ' + latestWeek + ')');
  line('   (Players whose week was dramatically different from what they normally do)');
  line('─'.repeat(90));

  // Only include players with ≥2 weeks of data so avg is meaningful
  const withHistory = playerSummaries.filter(p => p.weeksPlayed >= 2);
  const bigDevs = [...withHistory].sort((a, b) => Math.abs(b.vsSeasonAvg) - Math.abs(a.vsSeasonAvg)).slice(0, 20);

  line('\n  BIGGEST OVERPERFORMANCES vs own norm:');
  line(`  ${'Player'.padEnd(26)} ${'Pos'.padEnd(5)} ${'Team'.padEnd(22)} ${'WkPts'.padEnd(8)} ${'NormAvg'.padEnd(9)} ${'Delta'.padEnd(8)} Wks`);
  for (const p of [...bigDevs].filter(p => p.vsSeasonAvg > 0).slice(0, 8)) {
    const tn = teamName(p.teamId, teams).split(' ').slice(-1)[0];
    line(`  ${p.name.padEnd(26)} ${p.position.padEnd(5)} ${tn.padEnd(22)} ${fmt(p.lastWeekPts).padEnd(8)} ${fmt(p.seasonAvg).padEnd(9)} +${fmt(p.vsSeasonAvg).padEnd(7)} ${p.weeksPlayed}`);
  }

  line('\n  BIGGEST UNDERPERFORMANCES vs own norm:');
  line(`  ${'Player'.padEnd(26)} ${'Pos'.padEnd(5)} ${'Team'.padEnd(22)} ${'WkPts'.padEnd(8)} ${'NormAvg'.padEnd(9)} ${'Delta'.padEnd(8)} Wks`);
  for (const p of [...bigDevs].filter(p => p.vsSeasonAvg < 0).slice(0, 8)) {
    const tn = teamName(p.teamId, teams).split(' ').slice(-1)[0];
    line(`  ${p.name.padEnd(26)} ${p.position.padEnd(5)} ${tn.padEnd(22)} ${fmt(p.lastWeekPts).padEnd(8)} ${fmt(p.seasonAvg).padEnd(9)} -${fmt(Math.abs(p.vsSeasonAvg)).padEnd(7)} ${p.weeksPlayed}`);
  }

  // ── 4. SEASON TRAJECTORIES — RISERS & FALLERS ────────────────────────────
  line('\n\n4. SEASON TRAJECTORIES — WHO\'S TRENDING (need ≥3 weeks of data)');
  line('─'.repeat(90));

  const withTrend = playerSummaries.filter(p => p.weeksPlayed >= 3);
  const risers = [...withTrend].sort((a, b) => b.trendDelta - a.trendDelta).slice(0, 10);
  const fallers = [...withTrend].sort((a, b) => a.trendDelta - b.trendDelta).slice(0, 10);

  line('\n  RISING (last 2 weeks avg significantly above prior 2 weeks):');
  line(`  ${'Player'.padEnd(26)} ${'Pos'.padEnd(5)} ${'Team'.padEnd(22)} ${'Recent2Avg'.padEnd(12)} ${'Prior2Avg'.padEnd(11)} Delta`);
  for (const p of risers.filter(p => p.trendDelta > 10)) {
    const tn = teamName(p.teamId, teams).split(' ').slice(-1)[0];
    const recent = p.seasonAvg + p.trendDelta / 2;
    const prior = p.seasonAvg - p.trendDelta / 2;
    line(`  ${p.name.padEnd(26)} ${p.position.padEnd(5)} ${tn.padEnd(22)} ${fmt(recent).padEnd(12)} ${fmt(prior).padEnd(11)} +${fmt(p.trendDelta)}`);
  }

  line('\n  FALLING (last 2 weeks avg significantly below prior 2 weeks):');
  line(`  ${'Player'.padEnd(26)} ${'Pos'.padEnd(5)} ${'Team'.padEnd(22)} ${'Recent2Avg'.padEnd(12)} ${'Prior2Avg'.padEnd(11)} Delta`);
  for (const p of fallers.filter(p => p.trendDelta < -10)) {
    const tn = teamName(p.teamId, teams).split(' ').slice(-1)[0];
    const recent = p.seasonAvg + p.trendDelta / 2;
    const prior = p.seasonAvg - p.trendDelta / 2;
    line(`  ${p.name.padEnd(26)} ${p.position.padEnd(5)} ${tn.padEnd(22)} ${fmt(recent).padEnd(12)} ${fmt(prior).padEnd(11)} -${fmt(Math.abs(p.trendDelta))}`);
  }

  // ── 5. EROSP PACE — WHO'S BEATING/MISSING THEIR PROJECTION ──────────────
  line('\n\n5. EROSP PROJECTION PACE — ROSTERED PLAYERS (≥3 weeks active)');
  line('   (erospPace > 1.0 = tracking above projection; < 1.0 = below)');
  line('─'.repeat(90));

  const withErosp = playerSummaries.filter(p => p.erosp && p.weeksPlayed >= 3 && p.erospPace !== undefined);
  const overPerf = [...withErosp].sort((a, b) => (b.erospPace ?? 0) - (a.erospPace ?? 0)).slice(0, 12);
  const underPerf = [...withErosp].sort((a, b) => (a.erospPace ?? 0) - (b.erospPace ?? 0)).slice(0, 12);

  line('\n  OUTPACING THEIR EROSP PROJECTION:');
  line(`  ${'Player'.padEnd(26)} ${'Pos'.padEnd(5)} ${'Team'.padEnd(22)} ${'SeasonAvg/wk'.padEnd(14)} ${'ERospRaw'.padEnd(10)} Pace`);
  for (const p of overPerf.filter(p => (p.erospPace ?? 1) > 1.05)) {
    const tn = teamName(p.teamId, teams).split(' ').slice(-1)[0];
    const pace = ((p.erospPace ?? 1) * 100 - 100).toFixed(0);
    line(`  ${p.name.padEnd(26)} ${p.position.padEnd(5)} ${tn.padEnd(22)} ${fmt(p.seasonAvg).padEnd(14)} ${fmt(p.erosp!.erosp_raw).padEnd(10)} +${pace}%`);
  }

  line('\n  UNDERPERFORMING THEIR EROSP PROJECTION:');
  line(`  ${'Player'.padEnd(26)} ${'Pos'.padEnd(5)} ${'Team'.padEnd(22)} ${'SeasonAvg/wk'.padEnd(14)} ${'EROSPRaw'.padEnd(10)} Pace`);
  for (const p of underPerf.filter(p => (p.erospPace ?? 1) < 0.85)) {
    const tn = teamName(p.teamId, teams).split(' ').slice(-1)[0];
    const pace = ((p.erospPace ?? 1) * 100 - 100).toFixed(0);
    line(`  ${p.name.padEnd(26)} ${p.position.padEnd(5)} ${tn.padEnd(22)} ${fmt(p.seasonAvg).padEnd(14)} ${fmt(p.erosp!.erosp_raw).padEnd(10)} ${pace}%`);
  }

  // ── 6. RANKING POSTS — KEY CLAIMS ─────────────────────────────────────────
  line('\n\n6. RANKINGS POSTS — CHRONOLOGICAL SUMMARY');
  line('   (For cross-referencing claims against data above)');
  line('─'.repeat(90));

  for (const [i, a] of sortedArticles.entries()) {
    const date = new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const body = stripHtml(a.content);
    // Extract first ~800 chars as the "lede" (where rankings claims usually live)
    const lede = body.slice(0, 800).replace(/([.!?])\s+/g, '$1\n    ');
    line(`\n  POST ${i + 1} | ${date} | ${a.title}`);
    line(`  ${'─'.repeat(80)}`);
    line(`  ${lede}`);
    if (body.length > 800) line(`  [...${body.length - 800} more chars — full text available on request]`);
  }

  line('\n\n' + '═'.repeat(90));
  line('END OF EDITORIAL BRIEF');
  line('═'.repeat(90));

  console.log(out.join('\n'));
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
