// ============================================================
// lib/fantasy/outcomeTracking.ts
//
// Outcome tracking and adaptive calibration for the win probability engine.
//
// Each night when predictions are made, they are recorded in persistent storage.
// After a week ends, the system looks up actual outcomes and compares them
// against what the model predicted. The residual bias (error after static
// calibration) is used to compute a small adaptive correction applied to
// future predictions — making the model self-improving over the season.
//
// Algorithm:
//   residualBias = mean(calibratedPred - actual) over all resolved matchups
//     (positive = model still over-predicts favorites after static calibration)
//   blendWeight  = N_resolved / (N_resolved + HISTORICAL_PRIOR)
//     (grows from ~0% at season start to ~20% at 105 matchups)
//   adaptiveCorrection = -residualBias × blendWeight
//     (applied to calibrated home win probability before final output)
// ============================================================

import type { Matchup } from "../types";
import type { MatchupWinProbabilityView } from "./winProbability";

// ---- Types ----

/**
 * One nightly snapshot of a matchup's win probability.
 * Accumulated throughout the week so mid-week accuracy can be evaluated.
 */
export interface DailySnapshot {
  /** ISO timestamp when this snapshot was recorded */
  recordedAt: string;
  /** Post-static-calibration probability BEFORE adaptive correction (0–100) */
  homeWinPct: number;
  awayWinPct: number;
  /** Points locked in at the time of this snapshot */
  homeCurrentPoints: number;
  awayCurrentPoints: number;
}

export interface PredictionRecord {
  /** ESPN matchup ID (e.g. "123456" or "1-2") */
  matchupId: string;
  /** ESPN week number (matchupPeriodId) */
  weekId: number;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  /**
   * Post-static-calibration win probability from the FIRST snapshot (start of week).
   * Used for the season-learning bias calculation — measuring against the pre-week
   * baseline keeps the learning signal clean from mid-week score noise.
   * Range: 0–100.
   */
  baselineHomeWinPct: number;
  baselineAwayWinPct: number;
  /** ISO timestamp when this record was first created */
  recordedAt: string;
  /**
   * All nightly snapshots for this matchup, oldest first.
   * Snapshot[0] is the start-of-week prediction; later entries reflect
   * mid-week live adjustments as actual scores accumulate.
   */
  snapshots: DailySnapshot[];

  // ---- Filled in after the week ends ----
  /** ISO timestamp when the outcome was resolved */
  resolvedAt?: string;
  /** True if the home team won; false if away team won */
  actualHomeWon?: boolean;
  finalHomePoints?: number;
  finalAwayPoints?: number;
}

export interface PredictionHistory {
  seasonId: string;
  predictions: PredictionRecord[];
  /** Most recently computed season-wide learning statistics */
  lastStats?: SeasonLearningStats;
}

export interface SeasonLearningStats {
  /** How many matchups have been resolved (outcome known) */
  totalResolved: number;
  /** % of matchup winners correctly predicted (0–100) */
  accuracy: number;
  /**
   * Residual bias AFTER static calibration.
   * Positive = model still over-predicts favorites.
   * Negative = model under-predicts favorites.
   * Target: near 0.
   */
  residualBias: number;
  /** Brier score: 0 = perfect, 0.25 = random coin flip */
  brierScore: number;
  /**
   * Probability correction (in 0–1 units) to add to the calibrated home win
   * probability. Negative when the model is over-predicting favorites.
   * Applied after static calibration, before the [3%, 97%] clamp.
   */
  adaptiveBiasCorrection: number;
  computedAt: string;
}

// ---- Constants ----

/**
 * Number of historical matchups used to derive the static calibration map.
 * Acts as a Bayesian prior — season data needs to "overcome" this weight
 * before the adaptive correction has meaningful impact.
 */
const HISTORICAL_PRIOR = 420;

/**
 * Minimum number of resolved predictions before applying any adaptive
 * correction. Prevents overfitting to a handful of early results.
 */
const MIN_SAMPLES_FOR_CORRECTION = 5;

// ---- Core functions ----

/**
 * Build prediction records from a week's simulation output.
 * Stores the baseline (pre-adaptive) calibrated probabilities for learning
 * and seeds the snapshots array with the current reading.
 * Call this immediately after running simulations for the current week.
 */
export function buildPredictionRecords(
  weekId: number,
  results: MatchupWinProbabilityView[],
): PredictionRecord[] {
  const now = new Date().toISOString();
  return results.map((r) => {
    const snapshot: DailySnapshot = {
      recordedAt: now,
      homeWinPct: r.baselineHomeWinPct,
      awayWinPct: r.baselineAwayWinPct,
      homeCurrentPoints: r.homeCurrentPoints,
      awayCurrentPoints: r.awayCurrentPoints,
    };
    return {
      matchupId: r.matchupId,
      weekId,
      homeTeamId: r.homeTeamId,
      awayTeamId: r.awayTeamId,
      homeTeamName: r.homeTeamName,
      awayTeamName: r.awayTeamName,
      baselineHomeWinPct: r.baselineHomeWinPct,
      baselineAwayWinPct: r.baselineAwayWinPct,
      recordedAt: now,
      snapshots: [snapshot],
    };
  });
}

/**
 * Attempt to resolve unresolved predictions using completed season matchup data.
 * Reads the `winner` field from each `Matchup` — set by ESPN once the week ends.
 *
 * @param history   The full prediction history for this season (mutated in-place)
 * @param seasonMatchups  All matchups from data/current/{year}.json
 * @returns Number of newly resolved predictions
 */
export function resolveMatchups(
  history: PredictionHistory,
  seasonMatchups: Matchup[],
): number {
  const now = new Date().toISOString();
  let resolvedCount = 0;

  for (const pred of history.predictions) {
    if (pred.actualHomeWon !== undefined) continue; // already resolved

    // Match by week number + team IDs (team IDs stored as strings in predictions,
    // as numbers in the season data)
    const found = seasonMatchups.find(
      (m) =>
        m.week === pred.weekId &&
        m.home.teamId === parseInt(pred.homeTeamId, 10) &&
        m.away.teamId === parseInt(pred.awayTeamId, 10),
    );

    if (found?.winner !== undefined) {
      pred.actualHomeWon = found.winner === found.home.teamId;
      pred.finalHomePoints = found.home.totalPoints;
      pred.finalAwayPoints = found.away.totalPoints;
      pred.resolvedAt = now;
      resolvedCount++;
    }
  }

  return resolvedCount;
}

/**
 * Compute season-wide learning statistics from the prediction history.
 *
 * The `adaptiveBiasCorrection` field is the key output — it tells the
 * simulation how much to adjust calibrated probabilities to reduce the
 * residual systematic error observed this season.
 */
export function computeSeasonStats(history: PredictionHistory): SeasonLearningStats {
  const resolved = history.predictions.filter((p) => p.actualHomeWon !== undefined);

  if (resolved.length === 0) {
    return {
      totalResolved: 0,
      accuracy: 0,
      residualBias: 0,
      brierScore: 0,
      adaptiveBiasCorrection: 0,
      computedAt: new Date().toISOString(),
    };
  }

  let correct = 0;
  let biasSum = 0;
  let brierSum = 0;

  for (const r of resolved) {
    const p = r.baselineHomeWinPct / 100; // normalize to 0–1
    const actual = r.actualHomeWon ? 1 : 0;

    // Correct if the predicted winner matched reality
    if ((p >= 0.5) === r.actualHomeWon) correct++;

    // Brier decomposition: bias = mean(pred - actual)
    biasSum += p - actual;
    brierSum += (p - actual) ** 2;
  }

  const n = resolved.length;
  const accuracy = (correct / n) * 100;
  const residualBias = biasSum / n;
  const brierScore = brierSum / n;

  // Blend weight: grows from ~0% at season start toward ~20% at 105 matchups.
  // The historical prior (420 matchups) keeps the correction conservative
  // early in the season when we have limited data.
  const blendWeight =
    n >= MIN_SAMPLES_FOR_CORRECTION ? n / (n + HISTORICAL_PRIOR) : 0;

  // Negative sign: if residualBias > 0 (over-predicting), we need to decrease.
  // This additive correction is applied to the home team's probability.
  const adaptiveBiasCorrection = -residualBias * blendWeight;

  return {
    totalResolved: n,
    accuracy,
    residualBias,
    brierScore,
    adaptiveBiasCorrection,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Merge new prediction records into the history, deduplicating by matchupId.
 *
 * If the nightly job runs multiple times in the same week (daily re-runs),
 * the most recent prediction replaces the older one. Already-resolved records
 * (from previous weeks) are always preserved.
 *
 * Mutates `history.predictions` in-place.
 */
function matchupKey(r: { weekId: number; homeTeamId: string; awayTeamId: string }): string {
  return `${r.weekId}:${r.homeTeamId}:${r.awayTeamId}`;
}

/**
 * Merge new prediction records into the history.
 *
 * For unresolved matchups that already have a record:
 *   - Append the new snapshot to the existing `snapshots` array.
 *   - Preserve the original `baselineHomeWinPct` (start-of-week baseline).
 *   - Do NOT replace the whole record — we want the full daily history.
 *
 * For matchups with no existing record, create a new one.
 * Resolved records (outcome known) are never modified.
 *
 * Deduplication key: weekId + homeTeamId + awayTeamId — immune to
 * matchupId differences between runs.
 */
export function mergePredictions(
  history: PredictionHistory,
  newRecords: PredictionRecord[],
): void {
  const newByKey = new Map(newRecords.map((r) => [matchupKey(r), r]));
  const appended = new Set<string>();

  history.predictions = history.predictions.map((p) => {
    // Resolved records are immutable
    if (p.actualHomeWon !== undefined) return p;

    const incoming = newByKey.get(matchupKey(p));
    if (!incoming) return p;

    appended.add(matchupKey(p));

    // Append the latest reading as a new snapshot
    const newSnapshot: DailySnapshot = incoming.snapshots[0] ?? {
      recordedAt: incoming.recordedAt,
      homeWinPct: incoming.baselineHomeWinPct,
      awayWinPct: incoming.baselineAwayWinPct,
      homeCurrentPoints: 0,
      awayCurrentPoints: 0,
    };

    return {
      ...p,
      snapshots: [...(p.snapshots ?? []), newSnapshot],
    };
  });

  // Add records for matchups we haven't seen before
  for (const [key, r] of newByKey) {
    if (!appended.has(key)) {
      history.predictions.push(r);
    }
  }
}
