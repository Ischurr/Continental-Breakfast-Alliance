// ============================================================
// lib/fantasy/backtest.ts
//
// Historical backtesting pipeline.
//
// Since we don't store mid-week snapshots, the backtest evaluates
// "start-of-week" predictions:
//   - For each historical matchup week, use the teams' average weekly
//     score up to that point as the projected mean.
//   - Simulate the week's outcome with a team-level Gaussian.
//   - Compare predicted winner to actual winner.
//
// This tests the calibration of the win probability model, not EROSP.
// A separate EROSP backtest lives in scripts/backtest_erosp.py.
//
// Metrics reported:
//   - Winner accuracy (target: > 75%)
//   - Brier score (lower = better, perfect = 0)
//   - Log loss
//   - Expected Calibration Error (ECE)
//   - Per-bucket calibration table
//
// Data sources:
//   - data/historical/2022-2025.json (completed seasons)
//   - data/current/2026.json (current season, in-progress weeks only)
// ============================================================

import * as fs from "fs";
import * as path from "path";
import type {
  BacktestPrediction,
  BacktestSummary,
  CalibrationBucket,
} from "./types";
import { simulateTeamWeekFromMeanStd } from "./simulation";
import { BACKTEST_SIMULATION_COUNT } from "./constants";

// ---- Historical data shapes ----

interface HistoricalMatchup {
  id: string;
  week: number;
  home: { teamId: number; totalPoints: number };
  away: { teamId: number; totalPoints: number };
  winner?: number;
}

interface HistoricalWeeklyStats {
  week: number;
  teamId: number;
  points: number;
}

interface HistoricalSeason {
  year: number;
  matchups: HistoricalMatchup[];
  weeklyStats?: HistoricalWeeklyStats[];
}

// ---- Core backtesting logic ----

/**
 * Runs a single matchup prediction given:
 *   - Pre-week mean and stdDev for each team (from historical averages)
 *   - Points already scored (0 at week start)
 *   - Actual final scores
 *
 * Uses team-level Gaussian simulation to estimate win probability.
 */
function predictMatchupWinProbability(
  homeMean: number,
  homeStdDev: number,
  awayMean: number,
  awayStdDev: number,
  currentHomePts: number,
  currentAwayPts: number,
  simulationCount: number
): { homeWinProb: number; awayWinProb: number; tieProb: number } {
  const homeTotals = simulateTeamWeekFromMeanStd(
    homeMean,
    homeStdDev,
    currentHomePts,
    simulationCount
  );
  const awayTotals = simulateTeamWeekFromMeanStd(
    awayMean,
    awayStdDev,
    currentAwayPts,
    simulationCount
  );

  let homeWins = 0;
  let awayWins = 0;
  let ties = 0;

  for (let i = 0; i < simulationCount; i++) {
    if (homeTotals[i] > awayTotals[i]) homeWins++;
    else if (awayTotals[i] > homeTotals[i]) awayWins++;
    else ties++;
  }

  return {
    homeWinProb: homeWins / simulationCount,
    awayWinProb: awayWins / simulationCount,
    tieProb: ties / simulationCount,
  };
}

// ---- Team average calculation ----

interface TeamStats {
  weeklyPoints: number[];
  mean: number;
  stdDev: number;
}

// League-average priors for Bayesian shrinkage.
// Based on CBA historical scoring (typical weekly range: 200-500 pts, median ~310).
const LEAGUE_PRIOR_MEAN = 310;
const LEAGUE_PRIOR_STD = 65;
// Number of "virtual prior weeks" to blend in — higher = more shrinkage
const PRIOR_WEIGHT = 4;

function computeTeamStats(
  teamId: number,
  weeklyStats: HistoricalWeeklyStats[],
  upToWeek: number // exclusive: only use weeks < upToWeek
): TeamStats {
  const points = weeklyStats
    .filter((s) => s.teamId === teamId && s.week < upToWeek && s.points > 0)
    .map((s) => s.points);

  if (points.length === 0) {
    // No history — use league prior
    return { weeklyPoints: [], mean: LEAGUE_PRIOR_MEAN, stdDev: LEAGUE_PRIOR_STD };
  }

  const n = points.length;
  const rawMean = points.reduce((s, p) => s + p, 0) / n;

  // Bayesian shrinkage toward league average: the fewer weeks of data, the more
  // we trust the prior. With PRIOR_WEIGHT=4 and n=2 weeks, mean is (4×prior + 2×raw)/6.
  const shrinkWeight = PRIOR_WEIGHT / (PRIOR_WEIGHT + n);
  const mean = shrinkWeight * LEAGUE_PRIOR_MEAN + (1 - shrinkWeight) * rawMean;

  // Sample variance (if enough data), otherwise use prior variance
  const variance =
    n >= 3
      ? points.reduce((s, p) => s + (p - rawMean) ** 2, 0) / (n - 1)
      : LEAGUE_PRIOR_STD ** 2;

  // Floor at 60 pts — fantasy baseball weeks have genuine week-to-week variance
  // (pitchers may have 2 starts one week, 1 the next; injury luck; etc.)
  // Using too-low stdDev causes overconfidence at extreme probability buckets.
  const stdDev = Math.max(60, Math.sqrt(variance));

  return { weeklyPoints: points, mean, stdDev };
}

// ---- Season loading ----

function loadSeasonData(dataDir: string): HistoricalSeason[] {
  const seasons: HistoricalSeason[] = [];

  // Load completed historical seasons
  const historicalFile = path.join(dataDir, "historical", "2022-2025.json");
  if (fs.existsSync(historicalFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(historicalFile, "utf-8"));
      // Historical file may be an array of seasons or a single object
      if (Array.isArray(data)) {
        seasons.push(...data);
      } else if (data.seasons) {
        seasons.push(...data.seasons);
      } else {
        // Single year
        seasons.push(data);
      }
    } catch {
      console.warn("[backtest] Could not load historical data");
    }
  }

  // Also look for per-year files (2022.json, 2023.json, etc.)
  for (const year of [2022, 2023, 2024, 2025]) {
    const yearFile = path.join(dataDir, "historical", `${year}.json`);
    if (fs.existsSync(yearFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(yearFile, "utf-8"));
        if (!seasons.find((s) => s.year === year)) {
          seasons.push(data);
        }
      } catch {
        // skip
      }
    }
  }

  return seasons;
}

// ---- Calibration buckets ----

function buildCalibrationBuckets(
  predictions: BacktestPrediction[],
  bucketSize = 0.05
): CalibrationBucket[] {
  // Buckets from 0.50 to 1.00 (favorite's perspective)
  const numBuckets = Math.round(0.5 / bucketSize);
  const buckets: Array<{
    predSum: number;
    actualSum: number;
    count: number;
    start: number;
    end: number;
  }> = [];

  for (let i = 0; i < numBuckets; i++) {
    buckets.push({
      predSum: 0,
      actualSum: 0,
      count: 0,
      start: Math.round((0.5 + i * bucketSize) * 100) / 100,
      end: Math.round((0.5 + (i + 1) * bucketSize) * 100) / 100,
    });
  }

  for (const p of predictions) {
    const favoriteProb = Math.max(
      p.predictedHomeWinProbability,
      p.predictedAwayWinProbability
    );
    const idx = Math.min(
      numBuckets - 1,
      Math.floor((favoriteProb - 0.5) / bucketSize)
    );
    if (idx < 0 || idx >= buckets.length) continue;

    buckets[idx].predSum += favoriteProb;
    buckets[idx].actualSum += p.favoriteWon ? 1 : 0;
    buckets[idx].count += 1;
  }

  return buckets.map((b) => {
    const avgPred = b.count > 0 ? b.predSum / b.count : 0;
    const actualRate = b.count > 0 ? b.actualSum / b.count : 0;
    const error = Math.abs(avgPred - actualRate);

    return {
      bucketStart: b.start,
      bucketEnd: b.end,
      predictionCount: b.count,
      averagePredictedProbability: avgPred,
      actualWinRate: actualRate,
      calibrationError: error,
    };
  });
}

// ---- Summary calculation ----

function clampProb(p: number): number {
  return Math.max(1e-7, Math.min(1 - 1e-7, p));
}

function computeSummary(
  predictions: BacktestPrediction[],
  calibration: CalibrationBucket[]
): BacktestSummary {
  const n = predictions.length;
  if (n === 0) {
    return {
      totalPredictions: 0,
      winnerAccuracy: 0,
      brierScore: 0,
      logLoss: 0,
      expectedCalibrationError: 0,
      confidenceBias: 0,
      calibration: [],
      meetsAccuracyThreshold: false,
    };
  }

  const winnerAccuracy =
    predictions.filter((p) => p.favoriteWon).length / n;

  // Brier score: mean squared error of probability against outcome
  const brierScore =
    predictions.reduce((sum, p) => {
      const pred = clampProb(p.predictedHomeWinProbability);
      const actual = p.actualHomeWon ? 1 : 0;
      return sum + (pred - actual) ** 2;
    }, 0) / n;

  // Log loss (binary cross-entropy)
  const logLoss =
    predictions.reduce((sum, p) => {
      const pred = clampProb(p.predictedHomeWinProbability);
      const actual = p.actualHomeWon ? 1 : 0;
      return sum - (actual * Math.log(pred) + (1 - actual) * Math.log(1 - pred));
    }, 0) / n;

  // Expected Calibration Error: weighted average of bucket errors
  const totalPreds = calibration.reduce((s, b) => s + b.predictionCount, 0);
  const ece = totalPreds > 0
    ? calibration.reduce(
        (s, b) =>
          s + (b.predictionCount / totalPreds) * b.calibrationError,
        0
      )
    : 0;

  // Confidence bias: average (predicted - actual) for favorite's bucket
  // Positive = overconfident, negative = underconfident
  const confidenceBias =
    calibration.reduce((s, b) => {
      if (b.predictionCount === 0) return s;
      return s + (b.averagePredictedProbability - b.actualWinRate) * b.predictionCount;
    }, 0) / Math.max(1, totalPreds);

  return {
    totalPredictions: n,
    winnerAccuracy,
    brierScore,
    logLoss,
    expectedCalibrationError: ece,
    confidenceBias,
    calibration,
    meetsAccuracyThreshold: winnerAccuracy >= 0.75,
  };
}

// ---- Main backtest function ----

export interface BacktestOptions {
  /** Directory containing data/historical/ and data/current/ */
  dataDir?: string;
  simulationCount?: number;
  /** Minimum weeks of history required before making predictions */
  minWeeksHistory?: number;
  /** Only backtest matchups from this year and later */
  minYear?: number;
}

export interface BacktestResult {
  predictions: BacktestPrediction[];
  summary: BacktestSummary;
}

/**
 * Runs the backtest over all available historical matchup data.
 *
 * For each matchup week in each season:
 *   1. Compute each team's mean/stdDev weekly score from prior weeks this season.
 *   2. Simulate the matchup with a team-level Gaussian.
 *   3. Compare predicted winner to actual winner.
 *
 * Weeks with insufficient history (< minWeeksHistory) are skipped.
 */
export function runHistoricalBacktest(
  options: BacktestOptions = {}
): BacktestResult {
  const {
    dataDir = path.join(process.cwd(), "data"),
    simulationCount = BACKTEST_SIMULATION_COUNT,
    minWeeksHistory = 2,
    minYear = 2022,
  } = options;

  const seasons = loadSeasonData(dataDir);
  const predictions: BacktestPrediction[] = [];

  for (const season of seasons) {
    if (season.year < minYear) continue;

    const weeklyStats = season.weeklyStats ?? [];

    // If no weekly stats, try to reconstruct from matchups
    const statsToUse: HistoricalWeeklyStats[] =
      weeklyStats.length > 0
        ? weeklyStats
        : reconstructWeeklyStats(season.matchups);

    // Sort matchups by week
    const matchupsByWeek = new Map<number, HistoricalMatchup[]>();
    for (const m of season.matchups) {
      const existing = matchupsByWeek.get(m.week) ?? [];
      existing.push(m);
      matchupsByWeek.set(m.week, existing);
    }

    const weeks = [...matchupsByWeek.keys()].sort((a, b) => a - b);

    for (const week of weeks) {
      const weekMatchups = matchupsByWeek.get(week) ?? [];

      for (const m of weekMatchups) {
        // Skip if we don't know the actual result
        if (m.winner === undefined) continue;

        const homeTeamId = m.home.teamId;
        const awayTeamId = m.away.teamId;

        const homeStats = computeTeamStats(homeTeamId, statsToUse, week);
        const awayStats = computeTeamStats(awayTeamId, statsToUse, week);

        if (
          homeStats.weeklyPoints.length < minWeeksHistory ||
          awayStats.weeklyPoints.length < minWeeksHistory
        ) {
          continue; // skip — not enough history
        }

        const { homeWinProb, awayWinProb } = predictMatchupWinProbability(
          homeStats.mean,
          homeStats.stdDev,
          awayStats.mean,
          awayStats.stdDev,
          0, // pre-week: no points scored yet
          0,
          simulationCount
        );

        const actualHomeWon = m.winner === homeTeamId;
        const actualAwayWon = m.winner === awayTeamId;
        const actualTie = !actualHomeWon && !actualAwayWon;

        const favoredTeam =
          homeWinProb >= awayWinProb ? "home" : "away";
        const favoriteWon =
          (favoredTeam === "home" && actualHomeWon) ||
          (favoredTeam === "away" && actualAwayWon);

        predictions.push({
          snapshotId: `${season.year}-w${week}-${homeTeamId}-${awayTeamId}`,
          capturedAt: new Date().toISOString(),
          predictedHomeWinProbability: homeWinProb,
          predictedAwayWinProbability: awayWinProb,
          actualHomeWon,
          actualAwayWon,
          actualTie,
          favoredTeam,
          favoriteWon,
        });
      }
    }
  }

  const calibration = buildCalibrationBuckets(predictions);
  const summary = computeSummary(predictions, calibration);

  return { predictions, summary };
}

/**
 * Reconstructs weekly stats from matchup totals when weeklyStats array
 * is not present in the season data (older data format).
 */
function reconstructWeeklyStats(
  matchups: HistoricalMatchup[]
): HistoricalWeeklyStats[] {
  const stats: HistoricalWeeklyStats[] = [];
  for (const m of matchups) {
    if (m.home.totalPoints > 0) {
      stats.push({
        week: m.week,
        teamId: m.home.teamId,
        points: m.home.totalPoints,
      });
    }
    if (m.away.totalPoints > 0) {
      stats.push({
        week: m.week,
        teamId: m.away.teamId,
        points: m.away.totalPoints,
      });
    }
  }
  return stats;
}

// ---- Quick check: does model meet 75% accuracy threshold? ----

/**
 * Prints a brief pass/fail report. Returns true if the model passes.
 */
export function checkAccuracyThreshold(result: BacktestResult): boolean {
  const { summary } = result;
  console.log(
    `[backtest] ${summary.totalPredictions} predictions | ` +
    `accuracy=${(summary.winnerAccuracy * 100).toFixed(1)}% | ` +
    `brier=${summary.brierScore.toFixed(4)} | ` +
    `ECE=${(summary.expectedCalibrationError * 100).toFixed(1)}% | ` +
    `bias=${summary.confidenceBias > 0 ? "+" : ""}${(summary.confidenceBias * 100).toFixed(1)}%`
  );

  if (summary.meetsAccuracyThreshold) {
    console.log("[backtest] ✓ PASS — winner accuracy >= 75%");
  } else {
    console.warn(
      `[backtest] ✗ FAIL — winner accuracy ${(summary.winnerAccuracy * 100).toFixed(1)}% < 75%`
    );
  }

  return summary.meetsAccuracyThreshold;
}
