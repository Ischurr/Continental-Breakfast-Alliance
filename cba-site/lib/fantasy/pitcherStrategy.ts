// ============================================================
// lib/fantasy/pitcherStrategy.ts
//
// Pitcher start allocation strategy.
//
// CBA rule: max 7 SP appearances per team per matchup week count as "starts".
// Relief appearances never count against the cap.
// A pitcher can score without a start slot if they appear in relief.
//
// Strategy: greedily assign remaining start slots to the highest-value
// candidate starts, using expected value × start probability × recency discount.
//
// Key model decisions:
//   - Target slot = always the last active SP slot (SP6), not the best projection.
//     We want to know if we should burn a start slot on this player vs. waiting.
//   - Future starts are discounted slightly for uncertainty (rotation changes, injury).
//   - Manager rational behavior: won't start a ~0 EV pitcher when better options remain.
// ============================================================

import type {
  FantasyTeamMatchupState,
  PlayerProjectionInput,
  ScheduledGame,
} from "./types";
import { estimateSingleGameProjection } from "./playerProjection";
import { SP_DAYS_BETWEEN_STARTS } from "./constants";

// ---- Types ----

export interface PlannedStart {
  playerId: string;
  playerName: string;
  date: string;
  /** Projected points if this start is used */
  projectedPoints: number;
  /** Expected value = projectedPoints × startProbability */
  adjustedValue: number;
  /** Probability this pitcher will actually start this game */
  startProbability: number;
  /** Days until this game (0 = today/tomorrow) */
  daysAway: number;
}

export interface PitcherStrategyResult {
  /** Starts that will be allowed to count (ordered by expected value) */
  chosenStarts: PlannedStart[];
  /** Starts that exceed the cap and will score 0 as SP appearances */
  ignoredStarts: PlannedStart[];
  /** Start slots still available after existing chosen starts */
  remainingStartSlots: number;
}

// ---- Helpers ----

function daysUntil(dateStr: string): number {
  const now = new Date();
  const target = new Date(dateStr);
  const ms = target.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

/**
 * Effective start probability for a specific game, incorporating:
 *   - Game-level start probability (is pitcher scheduled to start?)
 *   - Injury / roster status
 *   - Day-of-week rotation uncertainty (increases for games 5+ days out)
 */
function effectiveStartProbability(
  game: ScheduledGame,
  player: PlayerProjectionInput
): number {
  let prob = game.startProbability ?? game.appearanceProbability * (1 / SP_DAYS_BETWEEN_STARTS);

  // Injury discount
  if (player.injured) prob *= 0.15;
  else if (player.questionable) prob *= 0.72;

  // Rotation uncertainty increases for games far in the future
  const days = daysUntil(game.date);
  const uncertaintyDiscount = Math.max(0.85, 1 - days * 0.03); // -3%/day, min 85%
  prob *= uncertaintyDiscount;

  return Math.max(0, Math.min(1, prob));
}

/**
 * Manager utility score for a candidate start.
 * Combines expected value with a small urgency bonus for games earlier in the week
 * (prefer not to waste start slots waiting for a better start that may not materialize).
 */
function managerUtility(
  projectedPoints: number,
  sp: number,
  game: ScheduledGame
): number {
  const ev = projectedPoints * sp;

  // Slight recency preference: earlier games get a small bonus because
  // the manager has less uncertainty about whether this game will happen.
  const days = daysUntil(game.date);
  const recencyBonus = Math.max(0.93, 1 - days * 0.015);

  // Matchup quality bonus for pitching into a weak lineup
  const oppBonus = game.opponentContext?.opponentVsPositionStrength != null
    ? 1 + (0.5 - game.opponentContext.opponentVsPositionStrength) * 0.10
    : 1.0;

  return ev * recencyBonus * oppBonus;
}

// ---- Candidate collection ----

interface CandidateStart {
  player: PlayerProjectionInput;
  game: ScheduledGame;
  projectedPoints: number;
  adjustedValue: number;
  startProbability: number;
  daysAway: number;
}

function collectCandidateStarts(team: FantasyTeamMatchupState): CandidateStart[] {
  const candidates: CandidateStart[] = [];

  for (const player of team.players) {
    if (player.role !== "starting_pitcher") continue;
    if (!player.active) continue;

    for (const game of player.scheduledGamesRemaining) {
      if (game.completed || game.locked) continue;
      if (!game.isStartingPitcherExpected) continue;

      const sp = effectiveStartProbability(game, player);
      if (sp < 0.05) continue; // very unlikely to start — skip

      const proj = estimateSingleGameProjection(player, game);
      const util = managerUtility(proj.mean, sp, game);

      candidates.push({
        player,
        game,
        projectedPoints: proj.mean,
        adjustedValue: util,
        startProbability: sp,
        daysAway: daysUntil(game.date),
      });
    }
  }

  return candidates;
}

// ---- Optimal assignment ----

/**
 * Selects which SP starts should use the remaining cap slots.
 *
 * Algorithm: Greedy by adjusted value (expected value × recency × matchup quality).
 * Cap binding constraint: remainingStartSlots = pitcherStartCap - usedPitcherStarts.
 *
 * Note: a pitcher who appears in relief (isStartingPitcherExpected = false on a game)
 * never competes for start slots and is handled separately in the simulation.
 */
export function chooseOptimalPitcherStarts(
  team: FantasyTeamMatchupState,
  pitcherStartCap: number
): PitcherStrategyResult {
  const remainingStartSlots = Math.max(
    0,
    pitcherStartCap - team.usedPitcherStarts
  );

  const candidates = collectCandidateStarts(team);

  // Sort: highest adjusted value first, tie-break by days away (prefer sooner)
  candidates.sort((a, b) => {
    if (Math.abs(b.adjustedValue - a.adjustedValue) > 0.1) {
      return b.adjustedValue - a.adjustedValue;
    }
    return a.daysAway - b.daysAway;
  });

  // Per-player start limit tracking: each player can start at most
  // ceil(remainingDays / SP_DAYS_BETWEEN_STARTS) times, but practically 1-2 times
  // in a 7-day period. We enforce max 2 starts per pitcher.
  const startsPerPlayer = new Map<string, number>();

  const chosen: CandidateStart[] = [];
  const ignored: CandidateStart[] = [];

  for (const c of candidates) {
    const playerStarts = startsPerPlayer.get(c.player.playerId) ?? 0;
    const canUseSlot = chosen.length < remainingStartSlots && playerStarts < 2;

    if (canUseSlot) {
      chosen.push(c);
      startsPerPlayer.set(c.player.playerId, playerStarts + 1);
    } else {
      ignored.push(c);
    }
  }

  return {
    chosenStarts: chosen.map((c) => ({
      playerId: c.player.playerId,
      playerName: c.player.name,
      date: c.game.date,
      projectedPoints: c.projectedPoints,
      adjustedValue: c.adjustedValue,
      startProbability: c.startProbability,
      daysAway: c.daysAway,
    })),
    ignoredStarts: ignored.map((c) => ({
      playerId: c.player.playerId,
      playerName: c.player.name,
      date: c.game.date,
      projectedPoints: c.projectedPoints,
      adjustedValue: c.adjustedValue,
      startProbability: c.startProbability,
      daysAway: c.daysAway,
    })),
    remainingStartSlots,
  };
}
