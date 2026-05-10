/**
 * Validates the accuracy of data/current/daily-scores-{season}.json by comparing
 * our aggregated weekly team totals against ESPN's official matchup scores.
 *
 * Only completed weeks are included (partial weeks have different denominators on both sides).
 *
 * Sources of expected discrepancy:
 *   Under-counts (ours < ESPN): players added mid-week who weren't in our roster
 *     snapshot for all days (the [gap] warnings in fetch-weekly-scores).
 *   Over-counts (ours > ESPN): players dropped mid-week who appear in our snapshot
 *     for days after the drop, or lineup slot captured at 5 AM vs actual game-time slot.
 *
 * Run: npx tsx scripts/validate-daily-scores.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as fs from 'fs';
import * as path from 'path';

const season = parseInt(process.env['ESPN_SEASON_ID'] ?? '2026', 10);

interface MatchupTeam { teamId: number; totalPoints: number; }
interface Matchup { week: number; home: MatchupTeam; away: MatchupTeam; winner?: number; }
interface WeeklyTeamBreakdown { teamId: number; week: number; totalPoints: number; }

interface Row {
  week: number;
  teamId: number;
  ours: number;
  espn: number;
  diff: number;
}

function pct(diff: number, base: number): string {
  return `${diff >= 0 ? '+' : ''}${((diff / base) * 100).toFixed(1)}%`;
}

function main() {
  const weeklyPath = path.join(__dirname, `../data/current/weekly-player-scores-${season}.json`);
  const currentPath = path.join(__dirname, `../data/current/${season}.json`);

  if (!fs.existsSync(weeklyPath)) {
    console.error('weekly-player-scores not found — run npm run fetch-weekly-scores first.');
    process.exit(1);
  }

  const weekly = JSON.parse(fs.readFileSync(weeklyPath, 'utf-8')) as {
    lastUpdated: string;
    weeks: Record<string, WeeklyTeamBreakdown[]>;
  };
  const current = JSON.parse(fs.readFileSync(currentPath, 'utf-8')) as { matchups: Matchup[] };

  // Find completed weeks (all 5 matchups have a winner)
  const byWeek: Record<number, Matchup[]> = {};
  for (const m of current.matchups) {
    if (!byWeek[m.week]) byWeek[m.week] = [];
    byWeek[m.week].push(m);
  }
  const completedWeeks = new Set(
    Object.entries(byWeek)
      .filter(([, ms]) => ms.length > 0 && ms.every(m => m.winner !== undefined))
      .map(([w]) => Number(w))
  );

  // Build ESPN official lookup: week-teamId → pts
  const espnOfficial: Record<string, number> = {};
  for (const m of current.matchups) {
    if (!completedWeeks.has(m.week)) continue;
    if (m.home.totalPoints > 0) espnOfficial[`${m.week}-${m.home.teamId}`] = m.home.totalPoints;
    if (m.away.totalPoints > 0) espnOfficial[`${m.week}-${m.away.teamId}`] = m.away.totalPoints;
  }

  // Compare
  const rows: Row[] = [];
  for (const [weekStr, teams] of Object.entries(weekly.weeks)) {
    const week = Number(weekStr);
    if (!completedWeeks.has(week)) continue;
    for (const entry of teams) {
      const key = `${week}-${entry.teamId}`;
      const espn = espnOfficial[key];
      if (espn === undefined) continue;
      rows.push({ week, teamId: entry.teamId, ours: entry.totalPoints, espn, diff: entry.totalPoints - espn });
    }
  }

  if (rows.length === 0) {
    console.log('No completed weeks with matching data found.');
    return;
  }

  // Summary stats
  const diffs = rows.map(r => r.diff);
  const absDiffs = diffs.map(Math.abs);
  const mae = absDiffs.reduce((s, d) => s + d, 0) / absDiffs.length;
  const rmse = Math.sqrt(diffs.map(d => d * d).reduce((s, d) => s + d, 0) / diffs.length);
  const bias = diffs.reduce((s, d) => s + d, 0) / diffs.length;
  const exact = rows.filter(r => r.diff === 0).length;
  const within5 = rows.filter(r => Math.abs(r.diff) <= 5).length;
  const within15 = rows.filter(r => Math.abs(r.diff) <= 15).length;
  const over = rows.filter(r => r.diff > 0).length;
  const under = rows.filter(r => r.diff < 0).length;

  console.log(`\nDaily scores accuracy vs ESPN official (completed weeks only)`);
  console.log(`  Source: weekly-player-scores updated ${weekly.lastUpdated.slice(0, 10)}`);
  console.log(`  Weeks: ${[...completedWeeks].sort((a,b)=>a-b).join(', ')}`);
  console.log(`  Comparisons: ${rows.length} (${rows.length / 10} weeks × 10 teams)\n`);
  console.log(`  MAE:       ${mae.toFixed(2)} pts`);
  console.log(`  RMSE:      ${rmse.toFixed(2)} pts`);
  console.log(`  Bias:      ${bias >= 0 ? '+' : ''}${bias.toFixed(2)} pts (${bias > 0 ? 'we over-count on average' : 'we under-count on average'})`);
  console.log(`  Exact:     ${exact}/${rows.length} (${((exact/rows.length)*100).toFixed(0)}%)`);
  console.log(`  Within 5:  ${within5}/${rows.length} (${((within5/rows.length)*100).toFixed(0)}%)`);
  console.log(`  Within 15: ${within15}/${rows.length} (${((within15/rows.length)*100).toFixed(0)}%)`);
  console.log(`  Over-counted: ${over} | Under-counted: ${under} | Exact: ${exact}`);

  // Per-week summary
  console.log('\nPer-week accuracy:');
  const weekNums = [...completedWeeks].sort((a, b) => a - b);
  for (const week of weekNums) {
    const weekRows = rows.filter(r => r.week === week);
    const weekMAE = weekRows.map(r => Math.abs(r.diff)).reduce((s,d)=>s+d,0) / weekRows.length;
    const weekBias = weekRows.map(r => r.diff).reduce((s,d)=>s+d,0) / weekRows.length;
    const weekExact = weekRows.filter(r => r.diff === 0).length;
    console.log(`  Week ${week}: MAE=${weekMAE.toFixed(1)}  bias=${weekBias>=0?'+':''}${weekBias.toFixed(1)}  exact=${weekExact}/${weekRows.length}`);
  }

  // Worst mismatches
  const worst = [...rows].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 10);
  console.log('\nWorst mismatches:');
  console.log('  Wk  Team   Ours     ESPN    Diff    Pct');
  for (const r of worst) {
    const dir = r.diff > 0 ? '(over)' : '(under)';
    console.log(`  ${String(r.week).padEnd(3)} ${String(r.teamId).padEnd(6)} ${r.ours.toFixed(2).padEnd(8)} ${r.espn.toFixed(2).padEnd(8)} ${(r.diff >= 0 ? '+' : '') + r.diff.toFixed(2).padEnd(7)} ${pct(r.diff, r.espn).padEnd(7)} ${dir}`);
  }

  // Per-team bias (are specific teams consistently off?)
  console.log('\nPer-team bias across all weeks:');
  const teamIds = [...new Set(rows.map(r => r.teamId))].sort((a,b)=>a-b);
  for (const tid of teamIds) {
    const teamRows = rows.filter(r => r.teamId === tid);
    const teamBias = teamRows.map(r => r.diff).reduce((s,d)=>s+d,0) / teamRows.length;
    const teamMAE = teamRows.map(r => Math.abs(r.diff)).reduce((s,d)=>s+d,0) / teamRows.length;
    console.log(`  Team ${String(tid).padEnd(3)}: avg diff=${teamBias>=0?'+':''}${teamBias.toFixed(1).padEnd(6)}  MAE=${teamMAE.toFixed(1)}`);
  }
}

main();
