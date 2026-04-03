// ============================================================
// lib/fantasy/playerProjection.ts
//
// Per-player projection engine.
//
// Primary signal: EROSP erosp_per_game (already incorporates 3-year talent
// blend, age curve, park factors, playing-time model, injury map, and the
// SP 7-start weekly cap).
//
// For a single remaining game:
//   hitter:   mean ≈ erosp_per_game / p_play  (unconditional per-game → conditional on playing)
//   SP:       mean ≈ erosp_per_game × SP_DAYS_BETWEEN_STARTS  (per-start value)
//   RP:       mean ≈ erosp_per_game / p_appear  (per-appearance value)
//
// Volatility is role-specific and calibrated to typical CBA weekly score spreads.
// ============================================================

import type {
  EROSPPlayerData,
  MLBOpponentContext,
  PlayerDistributionEstimate,
  PlayerProjectionInput,
  ScheduledGame,
} from "./types";
import {
  HITTER_P_PLAY_DEFAULT,
  OPP_ADJ_MAX,
  OPP_ADJ_MIN,
  RP_APPEARANCE_RATE_DEFAULT,
  SP_DAYS_BETWEEN_STARTS,
  VOLATILITY_COEFF,
} from "./constants";

// ---- Utility ----

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---- Baseline calculation ----

/**
 * Derive a per-game mean for a hitter, conditional on them playing.
 * EROSP per-game already folds in p_play, so divide it back out to get
 * the conditional score.
 */
function hitterConditionalPerGame(erosp: EROSPPlayerData): number {
  const pPlay = clamp(erosp.startProbability, 0.1, 0.99);
  if (erosp.erospPerGame <= 0) return 0;
  return erosp.erospPerGame / pPlay;
}

/**
 * Derive fp_per_start for a starting pitcher.
 * erosp_per_game ≈ (1 / SP_DAYS_BETWEEN_STARTS) × fp_per_start × cap_factor
 * → fp_per_start ≈ erosp_per_game × SP_DAYS_BETWEEN_STARTS / cap_factor
 *
 * cap_factor < 1 means the SP's team has too many starters and the cap
 * would be hit; their per-game EROSP already discounts for that.
 * We restore the full per-start value here so the pitcher-start strategy
 * module can compare starts head-to-head.
 */
function spFpPerStart(erosp: EROSPPlayerData): number {
  const capFactor = Math.max(erosp.capFactor, 0.1);
  return (erosp.erospPerGame * SP_DAYS_BETWEEN_STARTS) / capFactor;
}

/**
 * Derive fp_per_appearance for a relief pitcher.
 * erosp_per_game ≈ p_appear × fp_per_appearance
 */
function rpFpPerAppearance(erosp: EROSPPlayerData): number {
  const pAppear = RP_APPEARANCE_RATE_DEFAULT;
  if (erosp.erospPerGame <= 0) return 0;
  return erosp.erospPerGame / pAppear;
}

// ---- Fallback when EROSP not available ----

/**
 * Fallback baseline from ESPN season stats (minimal but better than nothing).
 * Used when EROSP is not available for a player.
 */
function fallbackBaseline(player: PlayerProjectionInput): number {
  const season = player.season.fantasyPointsPerGame ?? 0;
  const last7 = player.recent.last7Avg ?? season;
  const last14 = player.recent.last14Avg ?? season;
  const last30 = player.recent.last30Avg ?? season;
  // Recency-weighted blend: 40% season, 15% L30, 20% L14, 25% L7
  return season * 0.4 + last30 * 0.15 + last14 * 0.2 + last7 * 0.25;
}

// ---- Opponent quality adjustment ----

/**
 * Adjusts projection mean based on matchup context.
 * Returns a multiplier (typically 0.85–1.15).
 */
function opponentAdjustment(
  ctx: MLBOpponentContext | undefined,
  role: PlayerProjectionInput["role"]
): number {
  if (!ctx) return 1.0;

  let mult = 1.0;

  // Opponent pitcher/team strength vs. this batter's position
  if (ctx.opponentVsPositionStrength != null) {
    // 0.5 = average, <0.5 = weaker opponent (good for hitter), >0.5 = stronger
    mult *= 1 + (0.5 - ctx.opponentVsPositionStrength) * 0.12;
  }

  // Park factor: >1 = hitter-friendly, <1 = pitcher-friendly
  if (ctx.parkFactor != null) {
    if (role === "hitter") {
      mult *= 1 + (ctx.parkFactor - 1) * 0.18;
    } else {
      mult *= 1 - (ctx.parkFactor - 1) * 0.12;
    }
  }

  // Weather: positive = better conditions for offense
  if (ctx.weatherScore != null) {
    mult *= 1 + ctx.weatherScore * 0.04;
  }

  // Vegas implied runs: team expected to score more = better for hitters
  if (ctx.vegasImpliedRuns != null && role === "hitter") {
    mult *= 1 + (ctx.vegasImpliedRuns - 4.3) * 0.05;
  }

  // Vegas implied runs allowed: higher = harder to pitch well
  if (ctx.vegasImpliedAllowedRuns != null && role !== "hitter") {
    mult *= 1 - (ctx.vegasImpliedAllowedRuns - 4.3) * 0.05;
  }

  return clamp(mult, OPP_ADJ_MIN, OPP_ADJ_MAX);
}

// ---- Injury adjustment ----

function injuryAdjustment(player: PlayerProjectionInput): number {
  if (player.injured) return 0.1;       // Almost certainly not playing
  if (player.questionable) return 0.78; // ~78% chance of playing
  return 1.0;
}

// ---- Volatility estimation ----

/**
 * Estimates the standard deviation for a single-game projection.
 * Uses a role-specific coefficient of variation (std/mean) with a minimum floor.
 */
function estimateStdDev(
  mean: number,
  role: PlayerProjectionInput["role"],
  erosp?: EROSPPlayerData
): number {
  // Prefer known per-game std dev from recent form
  if (erosp === undefined && role === "hitter") {
    const seasonStd = 3.5; // typical hitter per-game stddev
    return Math.max(seasonStd, mean * VOLATILITY_COEFF.hitter);
  }

  const coeff = VOLATILITY_COEFF[role] ?? 0.7;
  const floors: Record<string, number> = {
    hitter: 3.5,           // real per-game σ: 0-4 with K = -1pt; HR+R+RBI+H = 8+pt
    starting_pitcher: 4.0,
    relief_pitcher: 1.0,
  };

  return Math.max(floors[role] ?? 1.5, mean * coeff);
}

// ---- Main projection function ----

/**
 * Estimates the projection distribution for a player in a single game.
 *
 * The returned mean represents:
 *   - Hitter: conditional on being in the lineup (caller should apply p_play)
 *   - SP:     conditional on starting (caller should apply start probability)
 *   - RP:     conditional on appearing (caller should apply appearance probability)
 *
 * The appearance probabilities live on ScheduledGame, not here.
 */
export function estimateSingleGameProjection(
  player: PlayerProjectionInput,
  game: ScheduledGame
): PlayerDistributionEstimate {
  const { erosp, role } = player;
  const injAdj = injuryAdjustment(player);
  const oppAdj = opponentAdjustment(game.opponentContext, role);

  let meanConditional: number;

  if (erosp && erosp.erospPerGame > 0) {
    // EROSP-based projection
    if (role === "hitter") {
      meanConditional = hitterConditionalPerGame(erosp);
    } else if (role === "starting_pitcher") {
      meanConditional = spFpPerStart(erosp);
    } else {
      meanConditional = rpFpPerAppearance(erosp);
    }
  } else {
    // Fallback to season/recent stats
    const fb = fallbackBaseline(player);
    if (role === "starting_pitcher" && game.isStartingPitcherExpected) {
      meanConditional = fb * SP_DAYS_BETWEEN_STARTS;
    } else if (role === "starting_pitcher") {
      meanConditional = fb * 0.4; // relief appearance
    } else if (role === "relief_pitcher") {
      meanConditional = fb / RP_APPEARANCE_RATE_DEFAULT;
    } else {
      meanConditional = fb / HITTER_P_PLAY_DEFAULT;
    }
  }

  // Apply adjustments
  const mean = Math.max(0, meanConditional * oppAdj * injAdj);
  const stdDev = estimateStdDev(mean, role, erosp);

  return {
    playerId: player.playerId,
    mean,
    stdDev,
    floor: Math.max(0, mean - 2 * stdDev),
    ceiling: mean + 2.5 * stdDev,
  };
}

/**
 * Aggregated projection across all remaining games this matchup week.
 * Used for display purposes (not the sim — the sim uses per-game sampling).
 */
export function estimateWeekRemainingProjection(
  player: PlayerProjectionInput
): PlayerDistributionEstimate {
  if (player.scheduledGamesRemaining.length === 0) {
    return {
      playerId: player.playerId,
      mean: 0,
      stdDev: 0,
      floor: 0,
      ceiling: 0,
    };
  }

  let totalMean = 0;
  let totalVar = 0;

  for (const game of player.scheduledGamesRemaining) {
    const g = estimateSingleGameProjection(player, game);
    const pAct = game.appearanceProbability;
    // E[X] = p × mean_conditional
    const gameMean = pAct * g.mean;
    // Var[X] = p × (Var_cond + mean_cond²) - (p × mean_cond)²
    //        = p × (sd² + mean²) - p² × mean² (law of total variance)
    const gameVar = pAct * (g.stdDev ** 2 + g.mean ** 2) - gameMean ** 2;

    totalMean += gameMean;
    totalVar += Math.max(0, gameVar);
  }

  const totalStdDev = Math.sqrt(totalVar);
  return {
    playerId: player.playerId,
    mean: totalMean,
    stdDev: totalStdDev,
    floor: Math.max(0, totalMean - 2 * totalStdDev),
    ceiling: totalMean + 2.5 * totalStdDev,
  };
}
