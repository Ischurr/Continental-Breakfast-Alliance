// ============================================================
// lib/fantasy/winProbability.ts
//
// API-facing win probability calculator.
// Runs the simulation and returns a clean output for the frontend.
// ============================================================

import type { MatchupState, WinProbabilityResult } from "./types";
import { runMatchupSimulation } from "./simulation";
import { calibrateWinProbability } from "./calibration";
import { DEFAULT_SIMULATION_COUNT } from "./constants";

// ---- Output shape ----

export interface MatchupWinProbabilityView {
  matchupId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  /** 0–100, one decimal place. Final display value (adaptive correction applied). */
  homeWinPct: number;
  awayWinPct: number;
  /**
   * Post-static-calibration win probability BEFORE adaptive correction (0–100).
   * Stored in PredictionHistory to measure residual bias for the learning loop.
   */
  baselineHomeWinPct: number;
  baselineAwayWinPct: number;
  /** Projected final total, one decimal place */
  projectedHomePoints: number;
  projectedAwayPoints: number;
  /** [P10, P90] projected range */
  homeRange: [number, number];
  awayRange: [number, number];
  /** Current locked-in points */
  homeCurrentPoints: number;
  awayCurrentPoints: number;
  /** Points still to be scored (projected) */
  homeProjectedRemaining: number;
  awayProjectedRemaining: number;
  /** ISO timestamp */
  updatedAt: string;
  simulationCount: number;
  /** True if any games are still in progress or upcoming */
  isLive: boolean;
}

// ---- Formatting ----

function roundPct(value: number): number {
  return Math.round(value * 1000) / 10; // 0.723 → 72.3
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// ---- Main function ----

/**
 * Calculates win probability for a matchup.
 *
 * Probability pipeline:
 *   1. Monte Carlo simulation → raw win probabilities
 *   2. Static calibration    → compresses overconfidence (piecewise linear map)
 *   3. Adaptive correction   → adjusts for residual bias learned this season
 *   4. [3%, 97%] clamp       → applied only while games remain
 *
 * @param matchup               Current matchup state (use espnLoader to build this)
 * @param simulationCount       Number of Monte Carlo iterations (default 20,000)
 * @param adaptiveBiasCorrection In probability units (0–1). Learned from this
 *                               season's resolved outcomes. Negative = decrease
 *                               home win prob (model over-predicted favorites).
 *                               Defaults to 0 (no adaptive correction).
 */
export function calculateMatchupWinProbability(
  matchup: MatchupState,
  simulationCount: number = DEFAULT_SIMULATION_COUNT,
  adaptiveBiasCorrection: number = 0,
): MatchupWinProbabilityView {
  const rawResult: WinProbabilityResult = runMatchupSimulation(
    matchup,
    simulationCount
  );

  // ---- Step 1: Static calibration ----
  // Corrects the historical +4.1% overconfidence bias via a piecewise linear map
  // (derived from 2022–2025 backtest of 424 matchups).
  const calibratedHome = calibrateWinProbability(rawResult.homeWinProbability);
  const calibratedAway = calibrateWinProbability(rawResult.awayWinProbability);
  const calibratedSum = calibratedHome + calibratedAway + rawResult.tieProbability;

  // Normalize after static calibration — these are the "baseline" probabilities
  // stored for outcome tracking and residual-bias measurement.
  const baselineHome = calibratedHome / calibratedSum;
  const baselineAway = calibratedAway / calibratedSum;
  const baselineTie  = rawResult.tieProbability / calibratedSum;

  // ---- Step 2: Adaptive bias correction ----
  // Adjusts for any residual systematic error the static calibration didn't
  // catch for the current season. Starts at 0 and grows as outcomes accumulate.
  // Applied symmetrically: adding to home decreases away by the same amount.
  const correctedHome = baselineHome + adaptiveBiasCorrection;
  const correctedAway = baselineAway - adaptiveBiasCorrection;

  // Clamp to a sensible range before renormalizing (avoids negative probabilities
  // if the correction is unexpectedly large early in the season)
  const clampedHome = Math.max(0.01, Math.min(0.99, correctedHome));
  const clampedAway = Math.max(0.01, Math.min(0.99, correctedAway));
  const correctedSum = clampedHome + clampedAway + baselineTie;

  let homeWinProbability = clampedHome / correctedSum;
  let awayWinProbability = clampedAway / correctedSum;
  let tieProbability     = baselineTie  / correctedSum;

  // ---- Step 3: Remaining-game clamp ----
  // While games are still remaining, clamp to [3%, 97%] — 100% is only valid once
  // all games are complete and the outcome is decided.
  const hasRemainingGames =
    matchup.home.players.some((p) => p.scheduledGamesRemaining.length > 0) ||
    matchup.away.players.some((p) => p.scheduledGamesRemaining.length > 0);

  if (hasRemainingGames) {
    const MIN_PROB = 0.03;
    const MAX_PROB = 0.97;
    const clampedH = Math.max(MIN_PROB, Math.min(MAX_PROB, homeWinProbability));
    const clampedA = Math.max(MIN_PROB, Math.min(MAX_PROB, awayWinProbability));
    const clampedS = clampedH + clampedA + tieProbability;
    homeWinProbability = clampedH / clampedS;
    awayWinProbability = clampedA / clampedS;
    tieProbability     = tieProbability / clampedS;
  }

  const result: WinProbabilityResult = {
    ...rawResult,
    homeWinProbability,
    awayWinProbability,
    tieProbability,
  };

  const homeCurrentPoints = matchup.home.currentPoints;
  const awayCurrentPoints = matchup.away.currentPoints;
  const homeProjectedRemaining =
    result.homeSummary.projectedFinalPoints - homeCurrentPoints;
  const awayProjectedRemaining =
    result.awaySummary.projectedFinalPoints - awayCurrentPoints;

  return {
    matchupId: matchup.matchup.matchupId,
    homeTeamId: matchup.home.fantasyTeamId,
    awayTeamId: matchup.away.fantasyTeamId,
    homeTeamName: matchup.home.name,
    awayTeamName: matchup.away.name,
    homeWinPct:        roundPct(homeWinProbability),
    awayWinPct:        roundPct(awayWinProbability),
    baselineHomeWinPct: roundPct(baselineHome),
    baselineAwayWinPct: roundPct(baselineAway),
    projectedHomePoints: round1(result.homeSummary.projectedFinalPoints),
    projectedAwayPoints: round1(result.awaySummary.projectedFinalPoints),
    homeRange: [
      round1(result.homeSummary.lowerRange),
      round1(result.homeSummary.upperRange),
    ],
    awayRange: [
      round1(result.awaySummary.lowerRange),
      round1(result.awaySummary.upperRange),
    ],
    homeCurrentPoints: round1(homeCurrentPoints),
    awayCurrentPoints: round1(awayCurrentPoints),
    homeProjectedRemaining: round1(Math.max(0, homeProjectedRemaining)),
    awayProjectedRemaining: round1(Math.max(0, awayProjectedRemaining)),
    updatedAt: new Date().toISOString(),
    simulationCount,
    isLive: hasRemainingGames,
  };
}

/**
 * Batch processes multiple matchups and returns an array of results.
 * Used by the nightly job to process all current-week matchups.
 */
export function calculateAllMatchupsWinProbability(
  matchups: MatchupState[],
  simulationCount: number = DEFAULT_SIMULATION_COUNT,
  adaptiveBiasCorrection: number = 0,
): MatchupWinProbabilityView[] {
  return matchups.map((m) =>
    calculateMatchupWinProbability(m, simulationCount, adaptiveBiasCorrection),
  );
}
