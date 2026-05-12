/**
 * Retrospective mid-week win-probability accuracy analysis.
 *
 * For each completed week, replays the matchup day-by-day using actual cumulative
 * scores from daily-scores-2026.json. At each day, simulates the remaining week
 * and checks whether the predicted winner matches the actual winner.
 *
 * Answers: "As the week progresses and real scores come in, how fast does our
 * model converge to the right answer?"
 *
 * Run: npx tsx scripts/analyze-midweek-accuracy.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as fs from 'fs';
import * as path from 'path';

const BENCH_SLOT_IDS = new Set([16, 17]);
const SIM_COUNT = 10_000;
const LEAGUE_PRIOR_MEAN = 310;
const LEAGUE_PRIOR_STD = 65;
const PRIOR_WEIGHT = 4;

// ---- Simulation (mirrors lib/fantasy/backtest.ts) ----

function randomNormal(mean: number, stdDev: number): number {
  const u1 = Math.max(Math.random(), 1e-12);
  const u2 = Math.random();
  return mean + stdDev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function simulateHomeWinProb(
  homeMean: number, homeStd: number, homePts: number,
  awayMean: number,  awayStd: number,  awayPts: number,
): number {
  let homeWins = 0;
  for (let i = 0; i < SIM_COUNT; i++) {
    const homeRem = Math.max(0, randomNormal(Math.max(0, homeMean - homePts), homeStd * 0.7));
    const awayRem = Math.max(0, randomNormal(Math.max(0, awayMean - awayPts), awayStd * 0.7));
    if (homePts + homeRem > awayPts + awayRem) homeWins++;
  }
  return homeWins / SIM_COUNT;
}

function teamStats(priorTotals: number[]): { mean: number; stdDev: number } {
  const n = priorTotals.length;
  if (n === 0) return { mean: LEAGUE_PRIOR_MEAN, stdDev: LEAGUE_PRIOR_STD };
  const rawMean = priorTotals.reduce((s, v) => s + v, 0) / n;
  const shrink = PRIOR_WEIGHT / (PRIOR_WEIGHT + n);
  const mean = shrink * LEAGUE_PRIOR_MEAN + (1 - shrink) * rawMean;
  const variance = n >= 3
    ? priorTotals.reduce((s, v) => s + (v - rawMean) ** 2, 0) / (n - 1)
    : LEAGUE_PRIOR_STD ** 2;
  return { mean, stdDev: Math.max(60, Math.sqrt(variance)) };
}

// ---- Types ----

interface PlayerDay {
  slotId: number;
  dayScore: number;
  playerName: string;
  position: string;
}

interface Matchup {
  week: number;
  home: { teamId: number; totalPoints: number };
  away: { teamId: number; totalPoints: number };
  winner?: number;
}

// ---- Main ----

function main() {
  const dataDir = path.join(__dirname, '../data');

  const schedule = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'fantasy/schedule-2026.json'), 'utf8')
  ) as { matchupPeriods: Record<string, number[]> };

  const dailyRaw = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'current/daily-scores-2026.json'), 'utf8')
  ) as { periods: Record<string, Record<string, Record<string, PlayerDay>>> };

  const season = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'current/2026.json'), 'utf8')
  ) as { matchups: Matchup[] };

  const { matchupPeriods } = schedule;
  const { periods } = dailyRaw;
  const { matchups } = season;

  // Determine which weeks are fully resolved
  const completedWeeks = [1, 2, 3, 4, 5, 6, 7].filter((w) => {
    const wm = matchups.filter((m) => m.week === w);
    return wm.length > 0 && wm.every((m) => m.winner !== undefined);
  });

  if (completedWeeks.length === 0) {
    console.log('No completed weeks found in 2026 season data.');
    return;
  }
  console.log(`\nCompleted weeks: ${completedWeeks.join(', ')}\n`);

  // Results per (week, day)
  interface DayEntry {
    week: number;
    day: number;         // 1-indexed day within the week
    numPeriods: number;  // scoring periods accumulated so far
    totalPeriods: number;
    correct: number;
    total: number;
    avgFavProb: number;
    details: Array<{
      homeTeamId: number; awayTeamId: number;
      homePts: number; awayPts: number;
      homeWinProb: number; actualHomeWon: boolean; correct: boolean;
    }>;
  }

  const allDayEntries: DayEntry[] = [];

  for (const week of completedWeeks) {
    const weekMatchups = matchups.filter((m) => m.week === week && m.winner !== undefined);
    const weekPeriods = matchupPeriods[String(week)];
    if (!weekPeriods || weekPeriods.length === 0) continue;

    const totalPeriods = weekPeriods.length;

    // Cumulative scoring period team score[periodIndex][teamId]
    // Build incrementally
    const cumulativeByTeam = new Map<number, number>();

    for (let dayIdx = 0; dayIdx < totalPeriods; dayIdx++) {
      const periodId = weekPeriods[dayIdx];
      const periodData = periods[String(periodId)] ?? {};

      // Add this period's active-slot scores
      for (const [teamIdStr, players] of Object.entries(periodData)) {
        const teamId = parseInt(teamIdStr, 10);
        let periodPts = 0;
        for (const p of Object.values(players)) {
          if (!BENCH_SLOT_IDS.has(p.slotId)) periodPts += p.dayScore;
        }
        cumulativeByTeam.set(teamId, (cumulativeByTeam.get(teamId) ?? 0) + periodPts);
      }

      const day = dayIdx + 1;
      let correct = 0;
      let favProbSum = 0;
      const details: DayEntry['details'] = [];

      for (const m of weekMatchups) {
        const homeId = m.home.teamId;
        const awayId = m.away.teamId;

        // Prior: this team's actual total in all weeks before this one
        const homePrior = matchups
          .filter((x) => x.week < week && (x.home.teamId === homeId || x.away.teamId === homeId) && x.winner !== undefined)
          .map((x) => (x.home.teamId === homeId ? x.home.totalPoints : x.away.totalPoints));

        const awayPrior = matchups
          .filter((x) => x.week < week && (x.home.teamId === awayId || x.away.teamId === awayId) && x.winner !== undefined)
          .map((x) => (x.home.teamId === awayId ? x.home.totalPoints : x.away.totalPoints));

        const homeS = teamStats(homePrior);
        const awayS = teamStats(awayPrior);

        const homePts = cumulativeByTeam.get(homeId) ?? 0;
        const awayPts = cumulativeByTeam.get(awayId) ?? 0;

        const homeWinProb = simulateHomeWinProb(
          homeS.mean, homeS.stdDev, homePts,
          awayS.mean, awayS.stdDev, awayPts,
        );

        const actualHomeWon = m.winner === homeId;
        const predicted = homeWinProb >= 0.5 ? 'home' : 'away';
        const isCorrect = (predicted === 'home') === actualHomeWon;
        if (isCorrect) correct++;
        favProbSum += Math.max(homeWinProb, 1 - homeWinProb);
        details.push({ homeTeamId: homeId, awayTeamId: awayId, homePts, awayPts, homeWinProb, actualHomeWon, correct: isCorrect });
      }

      allDayEntries.push({
        week,
        day,
        numPeriods: dayIdx + 1,
        totalPeriods,
        correct,
        total: weekMatchups.length,
        avgFavProb: favProbSum / weekMatchups.length,
        details,
      });
    }
  }

  // ---- Print per-week table ----
  const pad = (s: string | number, n: number) => String(s).padEnd(n);
  console.log('Per-week accuracy by day:\n');
  console.log(pad('Week', 6) + pad('Day', 5) + pad('Periods', 9) + pad('Correct', 9) + pad('Total', 7) + pad('Accuracy', 10) + 'AvgFavProb');
  console.log('─'.repeat(54));
  for (const e of allDayEntries) {
    const pct = `${(e.correct / e.total * 100).toFixed(0)}%`;
    const frac = `${e.numPeriods}/${e.totalPeriods}`;
    console.log(
      pad(e.week, 6) + pad(e.day, 5) + pad(frac, 9) +
      pad(e.correct, 9) + pad(e.total, 7) + pad(pct, 10) +
      `${(e.avgFavProb * 100).toFixed(1)}%`
    );
  }

  // ---- Aggregate: normalize to "fraction of week complete" buckets ----
  console.log('\n─'.repeat(54));
  console.log('\nAggregate by fraction of week complete (all completed weeks):\n');

  const fractionBuckets = [
    { label: '0% (before any games)',    min: 0,    max: 0.001 },
    { label: '~25%',                      min: 0.001, max: 0.30 },
    { label: '~50%',                      min: 0.30,  max: 0.60 },
    { label: '~75%',                      min: 0.60,  max: 0.85 },
    { label: '~100% (final period done)', min: 0.85,  max: 1.01 },
  ];

  for (const bucket of fractionBuckets) {
    const entries = allDayEntries.filter((e) => {
      const frac = e.numPeriods / e.totalPeriods;
      return frac > bucket.min && frac <= bucket.max;
    });
    if (entries.length === 0) continue;
    const totalC = entries.reduce((s, e) => s + e.correct, 0);
    const totalN = entries.reduce((s, e) => s + e.total, 0);
    const avgConf = entries.reduce((s, e) => s + e.avgFavProb, 0) / entries.length;
    console.log(`  ${bucket.label.padEnd(30)} ${totalC}/${totalN} (${(totalC / totalN * 100).toFixed(0)}%)   avg confidence: ${(avgConf * 100).toFixed(1)}%`);
  }

  // ---- Worst misses at high confidence (mid-week) ----
  const highConfWrong = allDayEntries
    .flatMap((e) => e.details.map((d) => ({ ...d, week: e.week, day: e.day, frac: e.numPeriods / e.totalPeriods })))
    .filter((d) => !d.correct && Math.max(d.homeWinProb, 1 - d.homeWinProb) > 0.75);

  if (highConfWrong.length > 0) {
    console.log('\nHigh-confidence wrong calls (>75% confidence, any day):\n');
    for (const d of highConfWrong) {
      const favProb = Math.max(d.homeWinProb, 1 - d.homeWinProb);
      console.log(
        `  W${d.week} day ${d.day} (${(d.frac * 100).toFixed(0)}% complete): ` +
        `team ${d.homeWinProb > 0.5 ? d.homeTeamId : d.awayTeamId} favored at ${(favProb * 100).toFixed(1)}% — UPSET` +
        ` (scores: ${d.homePts.toFixed(1)} vs ${d.awayPts.toFixed(1)})`
      );
    }
  }

  console.log();
}

main();
