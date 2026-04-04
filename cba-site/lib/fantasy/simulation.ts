// ============================================================
// lib/fantasy/simulation.ts
//
// Monte Carlo win probability simulation.
//
// Per-game sampling distributions:
//   Hitters:         Normal(mean, sd) — central-limit-theorem applies to ~3-4 PA
//   Starting Pitchers: Log-Normal(μ, σ) — right-skewed: possible QS/W bonuses,
//                    but also possible early-exit 0-point outcomes
//   Relief Pitchers: Bernoulli(p_appear) × HalfNormal(mean_cond, sd_cond) —
//                    either nothing (off night) or a meaningful appearance
//
// Start cap: chooseOptimalPitcherStarts() determines which SP game slots count
// as "starts" for the cap. SP slots beyond the cap contribute relief-pitcher
// level scoring (no W/QS bonus) at appearance probability only.
// ============================================================

import type {
  FantasyTeamMatchupState,
  MatchupState,
  PlayerProjectionInput,
  ScheduledGame,
  WinProbabilityResult,
} from "./types";
import { estimateSingleGameProjection } from "./playerProjection";
import { chooseOptimalPitcherStarts } from "./pitcherStrategy";
import { DEFAULT_SIMULATION_COUNT } from "./constants";

// ---- Random variate generators ----

/**
 * Box-Muller normal variate.
 */
function randomNormal(mean: number, stdDev: number): number {
  const u1 = Math.max(Math.random(), 1e-12);
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}

function nonNegativeNormal(mean: number, stdDev: number): number {
  return Math.max(0, randomNormal(mean, stdDev));
}

/**
 * Log-normal variate with the given mean and stdDev.
 * Converts (mean, stdDev) → (μ, σ) for the underlying normal.
 *
 * If X ~ LogNormal(μ, σ):
 *   E[X] = exp(μ + σ²/2)
 *   Var[X] = (exp(σ²) - 1) × exp(2μ + σ²)
 *
 * Given (m, s) where m = E[X], s = StdDev[X]:
 *   σ² = ln(s²/m² + 1)
 *   μ  = ln(m) - σ²/2
 */
function logNormal(mean: number, stdDev: number): number {
  if (mean <= 0) return 0;
  const cv2 = (stdDev / mean) ** 2;
  const sigma2 = Math.log(cv2 + 1);
  const mu = Math.log(mean) - sigma2 / 2;
  return Math.exp(randomNormal(mu, Math.sqrt(sigma2)));
}

/**
 * Bernoulli trial: returns true with probability p.
 */
function bernoulli(p: number): boolean {
  return Math.random() < p;
}

// ---- Per-game simulation ----

/**
 * Samples fantasy points for a player in a single game, respecting:
 *   - Appearance probability (does the player even play?)
 *   - Role-specific distribution
 *   - Whether this SP game slot is capped (→ scores as reliever instead)
 */
function sampleGamePoints(
  player: PlayerProjectionInput,
  game: ScheduledGame,
  isCapStart: boolean // true = this SP slot counts toward the cap (full start)
): number {
  const { role } = player;

  if (role === "hitter") {
    if (!bernoulli(game.appearanceProbability)) return 0;
    const proj = estimateSingleGameProjection(player, game);
    return nonNegativeNormal(proj.mean, proj.stdDev);
  }

  if (role === "starting_pitcher") {
    if (!game.isStartingPitcherExpected) {
      // Relief appearance by a SP — no start slot needed, score as RP
      if (!bernoulli(game.appearanceProbability * 0.5)) return 0; // lower appearance rate in relief
      const proj = estimateSingleGameProjection(player, game);
      // Relief scoring is roughly 30-40% of a full start
      return nonNegativeNormal(proj.mean * 0.35, proj.stdDev * 0.30);
    }

    if (!bernoulli(game.startProbability ?? game.appearanceProbability)) return 0;

    const proj = estimateSingleGameProjection(player, game);

    if (isCapStart) {
      // Full start: use log-normal for realistic right-skewed distribution
      // A great outing (7+ IP, 10K, QS, W) can score 35-45 points
      // A terrible outing (1 IP, 5 ER) can score -5 to 0 points
      return logNormal(proj.mean, proj.stdDev);
    } else {
      // Start slot is capped — this appearance scores only relief-level points
      // (the real-world manager should roster them on the bench, but model as RP scoring)
      return nonNegativeNormal(proj.mean * 0.30, proj.stdDev * 0.25);
    }
  }

  if (role === "relief_pitcher") {
    if (!bernoulli(game.appearanceProbability)) return 0;
    const proj = estimateSingleGameProjection(player, game);
    // RP scoring: bimodal — often 0 (blowout, no save opp), sometimes big (save, hold)
    // Model with a half-normal: conditional on appearing, use normal with floor 0
    return nonNegativeNormal(proj.mean, proj.stdDev);
  }

  return 0;
}

// ---- Team-day correlation factor ----

/**
 * Samples a shared environment multiplier for all hitters on a team on a given day.
 * Drawn from Normal(1.0, 0.12) — represents shared game-level variance:
 * a hot offense day lifts all hitters; a shut-out day depresses all hitters together.
 *
 * This correctly increases uncertainty in close matchups (a team can get shut out
 * as a unit). Pitchers are NOT affected — their variance is already independent.
 */
function sampleTeamDayFactor(): number {
  return Math.max(0.40, randomNormal(1.0, 0.12));
}

// ---- Team simulation ----

/**
 * Simulates one team's total fantasy points for the rest of the matchup week.
 * Returns the projected FINAL total (currentPoints + simulated remaining).
 *
 * Includes intra-team correlation: all hitters on the same team sharing the same
 * game day draw a shared teamDayFactor multiplier (Normal(1.0, σ=0.12)).
 */
function simulateTeamFinalPoints(
  team: FantasyTeamMatchupState,
  matchup: MatchupState
): number {
  // Build set of game slots that are capped starts (SP slots within the cap)
  const strategy = chooseOptimalPitcherStarts(team, matchup.matchup.pitcherStartCap);
  const cappedStartKeys = new Set(
    strategy.chosenStarts.map((s) => `${s.playerId}:${s.date}`)
  );

  // Pre-draw one teamDayFactor per calendar date for hitters.
  // Collects all unique dates that have at least one hitter game.
  const hitterDates = new Set<string>();
  for (const player of team.players) {
    if (player.role !== "hitter") continue;
    for (const game of player.scheduledGamesRemaining) {
      if (!game.completed && !game.locked) hitterDates.add(game.date);
    }
  }
  const teamDayFactors = new Map<string, number>();
  for (const date of hitterDates) {
    teamDayFactors.set(date, sampleTeamDayFactor());
  }

  // team.currentPoints is the team's weekly total so far (from ESPN mMatchupScore).
  // player.alreadyScoredPointsThisMatchup is the per-player breakdown — already
  // included in team.currentPoints, so we do NOT add it again here.
  let total = team.currentPoints;

  for (const player of team.players) {
    for (const game of player.scheduledGamesRemaining) {
      if (game.completed || game.locked) continue;

      const key = `${player.playerId}:${game.date}`;
      // For SPs: isCapStart = true if this game slot was chosen as one of the capped starts
      const isCapStart =
        player.role === "starting_pitcher" && cappedStartKeys.has(key);

      let points = sampleGamePoints(player, game, isCapStart);

      // Apply shared team-day multiplier to hitters only.
      if (player.role === "hitter" && points > 0) {
        const factor = teamDayFactors.get(game.date) ?? 1.0;
        points *= factor;
      }

      total += points;
    }
  }

  return total;
}

// ---- Main simulation ----

/**
 * Runs N Monte Carlo simulations of the matchup.
 * Returns win probabilities and projected score ranges.
 */
export function runMatchupSimulation(
  matchup: MatchupState,
  simulationCount: number = DEFAULT_SIMULATION_COUNT
): WinProbabilityResult {
  let homeWins = 0;
  let awayWins = 0;
  let ties = 0;

  const homeTotals: number[] = new Array(simulationCount);
  const awayTotals: number[] = new Array(simulationCount);

  for (let i = 0; i < simulationCount; i++) {
    const homeTotal = simulateTeamFinalPoints(matchup.home, matchup);
    const awayTotal = simulateTeamFinalPoints(matchup.away, matchup);

  homeTotals.sort((a, b) => a - b);
  awayTotals.sort((a, b) => a - b);

  function avg(arr: number[]): number {
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  function pct(arr: number[], p: number): number {
    return arr[Math.floor((arr.length - 1) * p)];
  }

  return {
    homeWinProbability: homeWins / simulationCount,
    awayWinProbability: awayWins / simulationCount,
    tieProbability: ties / simulationCount,
    homeSummary: {
      projectedFinalPoints: avg(homeTotals),
      lowerRange: pct(homeTotals, 0.1),
      upperRange: pct(homeTotals, 0.9),
    },
    awaySummary: {
      projectedFinalPoints: avg(awayTotals),
      lowerRange: pct(awayTotals, 0.1),
      upperRange: pct(awayTotals, 0.9),
    },
    simulationCount,
  };
}

// ---- Season-level team simulation (for backtesting) ----

/**
 * Simulates a full week's points for a team given:
 *   - Their weekly mean score (from historical data)
 *   - Their weekly score standard deviation
 *
 * Used by the backtesting module where we don't have per-player data.
 */
export function simulateTeamWeekFromMeanStd(
  mean: number,
  stdDev: number,
  currentPoints: number,
  simulationCount: number = DEFAULT_SIMULATION_COUNT
): number[] {
  const remainingMean = Math.max(0, mean - currentPoints);
  const totals: number[] = new Array(simulationCount);

  for (let i = 0; i < simulationCount; i++) {
    const remaining = nonNegativeNormal(remainingMean, stdDev * 0.7);
    totals[i] = currentPoints + remaining;
  }

  return totals;
}
