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
  /** 0–100, one decimal place */
  homeWinPct: number;
  awayWinPct: number;
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
 * @param matchup - Current matchup state (use espnLoader to build this)
 * @param simulationCount - Number of Monte Carlo iterations (default 20,000)
 */
export function calculateMatchupWinProbability(
  matchup: MatchupState,
  simulationCount: number = DEFAULT_SIMULATION_COUNT
): MatchupWinProbabilityView {
  const rawResult: WinProbabilityResult = runMatchupSimulation(
    matchup,
    simulationCount
  );

  // Apply calibration to correct the observed +4.1% overconfidence bias.
  // Ties are rare and not compressed (they're already near zero).
  const calibratedHome = calibrateWinProbability(rawResult.homeWinProbability);
  const calibratedAway = calibrateWinProbability(rawResult.awayWinProbability);
  // Re-normalize so home + away + tie = 1 after calibration
  const calibratedSum = calibratedHome + calibratedAway + rawResult.tieProbability;
  const hasRemainingGames =
    matchup.home.players.some((p) => p.scheduledGamesRemaining.length > 0) ||
    matchup.away.players.some((p) => p.scheduledGamesRemaining.length > 0);

  let homeWinProbability = calibratedHome / calibratedSum;
  let awayWinProbability = calibratedAway / calibratedSum;
  let tieProbability = rawResult.tieProbability / calibratedSum;

  // While games are still remaining, clamp to [3%, 97%] — 100% is only valid once
  // all games are complete and the outcome is decided. The calibration map already
  // caps at ~92%, but this explicit guard survives any future calibration changes.
  if (hasRemainingGames) {
    const MIN_PROB = 0.03;
    const MAX_PROB = 0.97;
    const clampedHome = Math.max(MIN_PROB, Math.min(MAX_PROB, homeWinProbability));
    const clampedAway = Math.max(MIN_PROB, Math.min(MAX_PROB, awayWinProbability));
    const clampedSum = clampedHome + clampedAway + tieProbability;
    homeWinProbability = clampedHome / clampedSum;
    awayWinProbability = clampedAway / clampedSum;
    tieProbability = tieProbability / clampedSum;
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

  const hasRemainingGames =
    matchup.home.players.some((p) => p.scheduledGamesRemaining.length > 0) ||
    matchup.away.players.some((p) => p.scheduledGamesRemaining.length > 0);

  return {
    matchupId: matchup.matchup.matchupId,
    homeTeamId: matchup.home.fantasyTeamId,
    awayTeamId: matchup.away.fantasyTeamId,
    homeTeamName: matchup.home.name,
    awayTeamName: matchup.away.name,
    homeWinPct: roundPct(result.homeWinProbability),
    awayWinPct: roundPct(result.awayWinProbability),
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
  simulationCount: number = DEFAULT_SIMULATION_COUNT
): MatchupWinProbabilityView[] {
  return matchups.map((m) => calculateMatchupWinProbability(m, simulationCount));
}
