/**
 * Suggested Moves Engine
 *
 * Multi-stage pipeline:
 *   1. Build team rosters (from EROSP team assignments or keeper overrides)
 *   2. Compute weighted positional strength per team
 *   3. Normalize against league distribution (z-score, rank)
 *   4. Detect weak positions (league-relative + internal)
 *   5. Find FA upgrade candidates per weak position
 *   6. Score, classify urgency, deduplicate, return top recommendations
 */

import type { EROSPPlayer } from '@/components/EROSPTable';

// ─────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────

export interface LeagueConfig {
  teamCount: number;
  /** Active starter slots per position group */
  starterSlots: Record<string, number>;
  /** Slot weights indexed from 0 (slot 1 = 1.00, slot 2 = 0.90, …) */
  slotWeights: number[];
  /** Minimum absolute EROSP gain to qualify as a recommendation */
  minUpgradeAbsolute: Record<string, number>;
  /** Minimum percentage gain to qualify (as a decimal, e.g. 0.08 = 8%) */
  minUpgradePct: Record<string, number>;
  /** Upgrade% thresholds for urgency labels */
  urgentPct: number;
  suggestedPct: number;
  watchlistPct: number;
  /** League z-score below which a position is flagged as weak */
  weaknessZThreshold: number;
  /** Denominator floor for upgrade% to prevent division-by-near-zero */
  erospFloor: number;
  maxRecommendations: number;
  maxFACandidatesPerPosition: number;
}

const DEFAULT_CONFIG: LeagueConfig = {
  teamCount: 10,
  starterSlots: {
    C:  1,
    '1B': 1,
    '2B': 1,
    '3B': 1,
    SS: 1,
    OF: 3,
    SP: 6,
    RP: 3,
  },
  slotWeights: [1.0, 0.90, 0.80, 0.70, 0.60, 0.50, 0.40, 0.30],
  minUpgradeAbsolute: {
    C:    20,
    '1B': 25,
    '2B': 25,
    '3B': 25,
    SS:   25,
    OF:   25,
    SP:   30,
    RP:   15,
  },
  minUpgradePct: {
    C:    0.08,
    '1B': 0.08,
    '2B': 0.08,
    '3B': 0.08,
    SS:   0.08,
    OF:   0.08,
    SP:   0.08,
    RP:   0.08,
  },
  urgentPct:    0.15,
  suggestedPct: 0.10,
  watchlistPct: 0.05,
  weaknessZThreshold: -0.50,
  erospFloor: 75,
  maxRecommendations: 5,
  maxFACandidatesPerPosition: 20,
};

// ─────────────────────────────────────────────────────────────────
// Output types
// ─────────────────────────────────────────────────────────────────

export type UrgencyLevel = 'watchlist' | 'suggested_add' | 'urgent_pickup';

export interface SuggestedMove {
  urgency: UrgencyLevel;
  position: string;
  targetSlot: string;         // e.g. "SP6", "OF3"
  addPlayerName: string;
  addPlayerMlbamId: number;
  addPlayerPhotoUrl?: string;
  replacePlayerName: string;  // "Empty slot" if none
  replacePlayerMlbamId: number;
  replacePlayerPhotoUrl?: string;
  faErosp: number;
  currentErosp: number;
  upgradeAbsolute: number;
  upgradePct: number;
  teamPositionRank: number;
  teamPositionRankTotal: number;
  teamPositionZ: number;
  faPoolZ: number;
  recommendationScore: number;
  explanation: string;
  /** Set when this recommendation involves repositioning a rostered player to free up a slot */
  internalMove?: {
    playerName: string;
    fromPosition: string;
    toPosition: string;
    mlbamId: number;
    photoUrl?: string;
  };
  debug: {
    teamWeightedStrength: number;
    leagueMeanStrength: number;
    leagueStdStrength: number;
    faPoolMean: number;
    faPoolStd: number;
    targetSlotRank: number;
    internalPositionRank: number;
  };
}

export interface PositionSummary {
  rank: number;
  rankTotal: number;
  z: number;
  weightedStrength: number;
  internalRank: number;
}

export interface SuggestedMovesResult {
  teamId: number;
  suggestedMoves: SuggestedMove[];
  positionSummary: Record<string, PositionSummary>;
  /** True when EROSP has no post-draft team assignments — analysis is keeper-only */
  isPreDraft: boolean;
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Map EROSP player to a canonical position group, or null to skip. */
function getPositionGroup(player: EROSPPlayer): string | null {
  const role = player.role?.toUpperCase() ?? '';
  const pos  = player.position?.toUpperCase() ?? '';

  if (role === 'SP') return 'SP';
  if (role === 'RP') return 'RP';

  // Hitters
  if (pos === 'C')  return 'C';
  if (pos === '1B') return '1B';
  if (pos === '2B') return '2B';
  if (pos === '3B') return '3B';
  if (pos === 'SS') return 'SS';
  if (['OF', 'LF', 'CF', 'RF'].includes(pos)) return 'OF';
  // DH counts toward OF/UTIL group for FA comparison but skip in v1
  // TWP (Ohtani) — count toward OF if we have non-trivial EROSP
  if (pos === 'TWP') return player.erosp_raw > 50 ? 'OF' : null;

  return null;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[], avg?: number): number {
  if (arr.length < 2) return 1; // avoid division by zero downstream
  const m = avg ?? mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance) || 1;
}

function zScore(value: number, m: number, s: number): number {
  return (value - m) / (s || 1);
}

function rankDesc(values: number[], target: number): number {
  // 1-indexed rank (highest value = rank 1)
  return values.filter(v => v > target).length + 1;
}

function posOrdinal(pos: string, slotIdx: number): string {
  // e.g. OF + 2 → "OF3", SP + 5 → "SP6"
  if (['C', '1B', '2B', '3B', 'SS'].includes(pos)) return pos;
  return `${pos}${slotIdx + 1}`;
}

// ─────────────────────────────────────────────────────────────────
// Stage 1 — Assign players to teams
// ─────────────────────────────────────────────────────────────────

/**
 * Returns a map of mlbam_id → fantasy teamId.
 * Uses EROSP fantasy_team_id when available (post-draft),
 * falls back to keeper overrides (pre-draft).
 * If leagueRosters is provided, any EROSP player that still has
 * fantasy_team_id=0 post-draft is resolved via ESPN roster name matching.
 */
function buildPlayerTeamMap(
  erospPlayers: EROSPPlayer[],
  keeperOverrides: Record<string, string[]>,
  leagueRosters?: Array<{ teamId: number; players: Array<{ playerName: string }> }>,
): { teamMap: Map<number, number>; isPreDraft: boolean } {
  const hasTeamAssignments = erospPlayers.some(p => p.fantasy_team_id !== 0);

  const teamMap = new Map<number, number>();

  if (hasTeamAssignments) {
    for (const p of erospPlayers) {
      if (p.fantasy_team_id !== 0) {
        teamMap.set(p.mlbam_id, p.fantasy_team_id);
      }
    }

    // Fallback: assign unmatched EROSP players via ESPN roster name matching.
    // This catches players whose names didn't match during the EROSP pipeline run
    // (e.g. accent differences, suffix mismatches) so they're not mistaken for FAs.
    if (leagueRosters) {
      const rosterNameToTeam = new Map<string, number>();
      for (const teamRoster of leagueRosters) {
        for (const player of teamRoster.players) {
          rosterNameToTeam.set(normalizeName(player.playerName), teamRoster.teamId);
        }
      }
      for (const p of erospPlayers) {
        if (teamMap.has(p.mlbam_id)) continue; // already assigned via fantasy_team_id
        const teamId = rosterNameToTeam.get(normalizeName(p.name));
        if (teamId) {
          teamMap.set(p.mlbam_id, teamId);
        }
      }
    }

    return { teamMap, isPreDraft: false };
  }

  // Pre-draft: use keeper overrides
  // Build name → teamId lookup
  const nameToTeam = new Map<string, number>();
  for (const [teamIdStr, names] of Object.entries(keeperOverrides)) {
    const teamId = parseInt(teamIdStr, 10);
    for (const name of names) {
      nameToTeam.set(normalizeName(name), teamId);
    }
  }

  for (const p of erospPlayers) {
    const key = normalizeName(p.name);
    const teamId = nameToTeam.get(key);
    if (teamId) {
      teamMap.set(p.mlbam_id, teamId);
    }
  }

  return { teamMap, isPreDraft: true };
}

// ─────────────────────────────────────────────────────────────────
// Stage 2 — Weighted positional strength per team
// ─────────────────────────────────────────────────────────────────

interface TeamPositionStrength {
  weightedStrength: number;
  players: EROSPPlayer[];   // top players used in calculation
}

function buildTeamPositionalStrength(
  teamPlayers: EROSPPlayer[],
  config: LeagueConfig,
): Record<string, TeamPositionStrength> {
  const groups = Object.keys(config.starterSlots);
  const result: Record<string, TeamPositionStrength> = {};

  for (const pos of groups) {
    const eligible = teamPlayers
      .filter(p => getPositionGroup(p) === pos)
      .sort((a, b) => b.erosp_raw - a.erosp_raw);

    const starterCount = config.starterSlots[pos];
    let weightedStrength = 0;

    for (let i = 0; i < eligible.length && i < starterCount; i++) {
      const w = config.slotWeights[i] ?? 0.30;
      weightedStrength += eligible[i].erosp_raw * w;
    }

    result[pos] = { weightedStrength, players: eligible.slice(0, starterCount + 2) };
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────
// Stage 3 — League-wide distributions per position
// ─────────────────────────────────────────────────────────────────

interface PositionLeagueStats {
  mean: number;
  std: number;
  allValues: number[];
}

function computeLeagueDistributions(
  allTeamStrengths: Map<number, Record<string, TeamPositionStrength>>,
  config: LeagueConfig,
): Record<string, PositionLeagueStats> {
  const result: Record<string, PositionLeagueStats> = {};

  for (const pos of Object.keys(config.starterSlots)) {
    const values = Array.from(allTeamStrengths.values()).map(
      s => s[pos]?.weightedStrength ?? 0
    );
    result[pos] = { mean: mean(values), std: std(values), allValues: values };
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────
// Stage 4 — Weakness detection
// ─────────────────────────────────────────────────────────────────

interface WeakPosition {
  pos: string;
  leagueZ: number;
  leagueRank: number;
  internalRank: number;
  teamStrength: number;
  targetPlayer: EROSPPlayer | null;
  targetSlotIndex: number;
  targetSlotLabel: string;
}

function detectWeakPositions(
  teamStrengths: Record<string, TeamPositionStrength>,
  leagueStats: Record<string, PositionLeagueStats>,
  config: LeagueConfig,
): WeakPosition[] {
  const positions = Object.keys(config.starterSlots);
  const totalTeams = config.teamCount;

  // Compute z-score and rank for each position
  const posStats = positions.map(pos => {
    const strength = teamStrengths[pos]?.weightedStrength ?? 0;
    const stats = leagueStats[pos];
    const z = zScore(strength, stats.mean, stats.std);
    const rank = rankDesc(stats.allValues, strength - 0.001); // -0.001 handles ties
    return { pos, z, rank, strength };
  });

  // Internal ranking: compare this team's positions against each other
  // Use z-scores for fair cross-position comparison
  const sortedByZ = [...posStats].sort((a, b) => a.z - b.z);
  const internalRankMap = new Map(sortedByZ.map((p, i) => [p.pos, i + 1]));

  const weak: WeakPosition[] = [];

  for (const { pos, z, rank, strength } of posStats) {
    const internalRank = internalRankMap.get(pos) ?? 1;
    const isLeagueWeak = z <= config.weaknessZThreshold;
    const isInternallyWeak = internalRank <= 2 && z <= 0;
    const isBottomThird = rank > Math.floor(totalTeams * 0.67);

    if (!isLeagueWeak && !isInternallyWeak && !isBottomThird) continue;

    // Find the replaceable target slot — always use the LAST starter slot
    // (e.g. OF3, SP6) regardless of how many players the team has.
    // If the team has fewer players than starter slots, that slot is empty (null).
    const playersAtPos = teamStrengths[pos]?.players ?? [];
    const starterSlots = config.starterSlots[pos];
    const targetSlotIndex = starterSlots - 1; // 0-indexed last starter slot
    const targetPlayer = playersAtPos[targetSlotIndex] ?? null;
    const targetSlotLabel = posOrdinal(pos, targetSlotIndex);

    weak.push({
      pos, leagueZ: z, leagueRank: rank, internalRank, teamStrength: strength,
      targetPlayer, targetSlotIndex, targetSlotLabel,
    });
  }

  // Sort by severity (most weak first)
  return weak.sort((a, b) => a.leagueZ - b.leagueZ);
}

// ─────────────────────────────────────────────────────────────────
// Stage 5 — FA candidate search & scoring
// ─────────────────────────────────────────────────────────────────

interface FACandidate {
  player: EROSPPlayer;
  photoUrl?: string;
  upgradeAbsolute: number;
  upgradePct: number;
  faPoolZ: number;
  recommendationScore: number;
  urgency: UrgencyLevel;
}

function scoreFACandidates(
  faPlayers: EROSPPlayer[],
  pos: string,
  targetErosp: number,
  weakPos: WeakPosition,
  leagueStats: Record<string, PositionLeagueStats>,
  faPhotoLookup: Map<string, string>,
  config: LeagueConfig,
  totalTeams: number,
  faEligibilityMap?: Map<string, string[]>,
): FACandidate[] {
  const eligible = faPlayers
    .filter(p => {
      if (getPositionGroup(p) === pos) return true;
      // Also include FAs who have ESPN multi-position eligibility at this position
      const espnEligible = faEligibilityMap?.get(normalizeName(p.name));
      return espnEligible?.includes(pos) ?? false;
    })
    .sort((a, b) => b.erosp_raw - a.erosp_raw)
    .slice(0, config.maxFACandidatesPerPosition);

  if (eligible.length === 0) return [];

  // FA pool stats for this position
  const faErosps = eligible.map(p => p.erosp_raw);
  const faPoolMean = mean(faErosps);
  const faPoolStd  = std(faErosps, faPoolMean);

  const minAbsolute = config.minUpgradeAbsolute[pos] ?? config.minUpgradeAbsolute['SP'] ?? 15;

  const candidates: FACandidate[] = [];

  for (const fa of eligible) {
    const upgradeAbsolute = fa.erosp_raw - targetErosp;
    const upgradePct = upgradeAbsolute / Math.max(targetErosp, config.erospFloor);

    // Must clear minimum thresholds to be a watchlist candidate
    if (upgradeAbsolute < minAbsolute * 0.5 || upgradePct < config.watchlistPct) continue;

    const faPoolZ = zScore(fa.erosp_raw, faPoolMean, faPoolStd);

    // Weakness component (0–1): how bad is the team at this position?
    const weaknessComponent = Math.min(1, Math.max(0,
      (-weakPos.leagueZ + 1.5) / 3.0
    ));

    // Upgrade component (0–1)
    const upgradeComponent = Math.min(1, upgradePct / 0.40);

    // Candidate quality component (0–1)
    const qualityComponent = Math.min(1, Math.max(0, (faPoolZ + 1) / 2));

    // Lineup relevance: does this immediately fill an active slot?
    const immediateStart = (weakPos.targetSlotIndex < config.starterSlots[pos]);
    const lineupRelevance = immediateStart ? 1.0 : 0.5;

    const rawScore =
      0.35 * weaknessComponent +
      0.40 * upgradeComponent +
      0.15 * qualityComponent +
      0.10 * lineupRelevance;

    const recommendationScore = Math.round(rawScore * 100);

    // Urgency classification
    let urgency: UrgencyLevel = 'watchlist';
    if (upgradePct >= config.urgentPct && upgradeAbsolute >= minAbsolute) {
      urgency = 'urgent_pickup';
    } else if (
      (upgradePct >= config.suggestedPct && upgradeAbsolute >= minAbsolute) ||
      (faPoolZ >= 1.0 && upgradeAbsolute >= minAbsolute) ||
      (weakPos.leagueZ <= -1.0 && upgradeAbsolute >= minAbsolute * 0.75)
    ) {
      urgency = 'suggested_add';
    } else if (upgradePct < config.watchlistPct) {
      continue; // below even watchlist
    }

    const photoUrl = faPhotoLookup.get(normalizeName(fa.name));

    candidates.push({
      player: fa,
      photoUrl,
      upgradeAbsolute,
      upgradePct,
      faPoolZ,
      recommendationScore,
      urgency,
    });
  }

  return candidates.sort((a, b) => b.recommendationScore - a.recommendationScore);
}

// ─────────────────────────────────────────────────────────────────
// Stage 6 — Explanation generation
// ─────────────────────────────────────────────────────────────────

function generateExplanation(
  pos: string,
  weakPos: WeakPosition,
  fa: EROSPPlayer,
  target: EROSPPlayer | null,
  upgradeAbsolute: number,
  upgradePct: number,
  urgency: UrgencyLevel,
  totalTeams: number,
): string {
  const posLabel = pos === 'SP' ? 'Starting pitcher' :
                   pos === 'RP' ? 'Relief pitcher' :
                   pos === 'OF' ? 'Outfield' :
                   pos === 'C'  ? 'Catcher' :
                   `${pos}`;

  const rankStr = `${weakPos.leagueRank} of ${totalTeams}`;
  const pctStr  = `${(upgradePct * 100).toFixed(1)}%`;
  const absStr  = upgradeAbsolute.toFixed(1);
  const targetLabel = weakPos.targetSlotLabel;

  const isEmptySlot = target === null;
  const targetName  = target ? target.name : 'an unfilled slot';
  const zDesc = weakPos.leagueZ <= -1.2 ? 'well below league average' :
                weakPos.leagueZ <= -0.7 ? 'below league average' :
                'slightly below average';

  if (isEmptySlot) {
    return `${posLabel} has no projected starter in your EROSP data at ${targetLabel}, leaving you ranked ${rankStr} in the league. ` +
      `${fa.name} (${fa.erosp_raw.toFixed(0)} EROSP) would be one of the stronger ${pos} options available on the waiver wire.`;
  }

  if (urgency === 'urgent_pickup') {
    return `${posLabel} is your weakest unit and ranks ${rankStr} in the league (${zDesc}). ` +
      `${fa.name} projects ${absStr} EROSP points higher than ${targetName} at ${targetLabel} — ` +
      `a ${pctStr} improvement and one of the strongest ${pos} free agents available.`;
  }

  if (urgency === 'suggested_add') {
    return `${posLabel} ranks ${rankStr} in the league. ` +
      `Adding ${fa.name} over ${targetName} at ${targetLabel} improves that slot by ${absStr} EROSP points (${pctStr}).`;
  }

  // watchlist
  return `${posLabel} is slightly ${zDesc} and ${targetName} is the weakest relevant slot. ` +
    `${fa.name} offers a modest ${absStr}-point upgrade (${pctStr}) — worth monitoring.`;
}

// ─────────────────────────────────────────────────────────────────
// Stage 7 — Slot-swap detection (multi-position eligibility)
// ─────────────────────────────────────────────────────────────────

/** Map ESPN position label to EROSP config position group key (null = skip) */
function espnToErospGroup(espnPos: string, config: LeagueConfig): string | null {
  // DH isn't a separate group in the EROSP config — players eligible at DH are already OF
  if (espnPos === 'DH') return null;
  // Only return positions that exist in the league config
  if (config.starterSlots[espnPos] !== undefined) return espnPos;
  return null;
}

function findSlotSwaps(
  targetTeamPlayers: EROSPPlayer[],
  rosterEligibilityMap: Map<string, string[]>,
  rosterPhotoLookup: Map<string, string>,
  leagueFAs: EROSPPlayer[],
  teamStrengths: Record<string, TeamPositionStrength>,
  leagueStats: Record<string, PositionLeagueStats>,
  faPhotoLookup: Map<string, string>,
  faEligibilityMap: Map<string, string[]>,
  config: LeagueConfig,
): SuggestedMove[] {
  const HITTER_POSITIONS = new Set(['C', '1B', '2B', '3B', 'SS', 'OF']);
  const swaps: SuggestedMove[] = [];
  const seenSwapKeys = new Set<string>();

  for (const player of targetTeamPlayers) {
    const posA = getPositionGroup(player);
    if (!posA || !HITTER_POSITIONS.has(posA)) continue;
    if (player.erosp_raw < config.erospFloor) continue;

    const espnEligible = rosterEligibilityMap.get(normalizeName(player.name));
    if (!espnEligible || espnEligible.length < 2) continue;

    for (const espnAltPos of espnEligible) {
      const posB = espnToErospGroup(espnAltPos, config);
      if (!posB || posB === posA || !HITTER_POSITIONS.has(posB)) continue;

      // Would this player help at posB? They must be better than the weakest B starter slot.
      const starterSlotsB = config.starterSlots[posB];
      const targetSlotBIndex = starterSlotsB - 1;
      const weakestBPlayer = teamStrengths[posB]?.players[targetSlotBIndex] ?? null;
      const weakestBErosp = weakestBPlayer?.erosp_raw ?? 0;
      if (player.erosp_raw < weakestBErosp) continue;

      // Find the best FA eligible at posA
      const faCandidatesAtA = leagueFAs
        .filter(fa => {
          if (getPositionGroup(fa) === posA) return true;
          return faEligibilityMap.get(normalizeName(fa.name))?.includes(posA) ?? false;
        })
        .sort((a, b) => b.erosp_raw - a.erosp_raw);

      if (faCandidatesAtA.length === 0) continue;
      const bestFA = faCandidatesAtA[0];

      // FA must be meaningfully better than the player at posA
      const upgradeAbsolute = bestFA.erosp_raw - player.erosp_raw;
      const minAbsolute = config.minUpgradeAbsolute[posA] ?? 25;
      if (upgradeAbsolute < minAbsolute) continue;

      const upgradePct = upgradeAbsolute / Math.max(player.erosp_raw, config.erospFloor);
      if (upgradePct < config.watchlistPct) continue;

      const swapKey = `${player.mlbam_id}-${posA}-${posB}-${bestFA.mlbam_id}`;
      if (seenSwapKeys.has(swapKey)) continue;
      seenSwapKeys.add(swapKey);

      // Urgency based on upgrade magnitude at posA
      let urgency: UrgencyLevel = 'watchlist';
      if (upgradePct >= config.urgentPct && upgradeAbsolute >= minAbsolute) {
        urgency = 'urgent_pickup';
      } else if (upgradePct >= config.suggestedPct && upgradeAbsolute >= minAbsolute) {
        urgency = 'suggested_add';
      }

      // League context for posA
      const strengthA = teamStrengths[posA]?.weightedStrength ?? 0;
      const statsA = leagueStats[posA];
      const leagueZA = zScore(strengthA, statsA.mean, statsA.std);
      const leagueRankA = rankDesc(statsA.allValues, strengthA - 0.001);

      const faErospsAtA = faCandidatesAtA.map(p => p.erosp_raw);
      const faPoolMeanA = mean(faErospsAtA);
      const faPoolStdA  = std(faErospsAtA, faPoolMeanA);
      const faPoolZ = zScore(bestFA.erosp_raw, faPoolMeanA, faPoolStdA);

      // Slightly higher base score for swaps since they address two positions
      const upgComp  = Math.min(1, upgradePct / 0.40);
      const weakComp = Math.min(1, Math.max(0, (-leagueZA + 1.5) / 3.0));
      const rawScore = 0.30 * weakComp + 0.45 * upgComp + 0.25;
      const recommendationScore = Math.round(rawScore * 100);

      const posALabel = posA === 'OF' ? 'outfield' : posA;
      const posBLabel = posB === 'OF' ? 'outfield' : posB;
      const explanation =
        `${player.name} qualifies at both ${posALabel} and ${posBLabel} per ESPN eligibility. ` +
        `Moving them to ${posBLabel} frees up the ${posALabel} slot for ${bestFA.name}, ` +
        `who projects ${upgradeAbsolute.toFixed(0)} EROSP points higher ` +
        `(${(upgradePct * 100).toFixed(1)}% improvement). ` +
        `This two-for-one move strengthens both positions at once.`;

      const playerPhotoUrl = rosterPhotoLookup.get(normalizeName(player.name));

      swaps.push({
        urgency,
        position:             posA,
        targetSlot:           posOrdinal(posA, (config.starterSlots[posA] ?? 1) - 1),
        addPlayerName:        bestFA.name,
        addPlayerMlbamId:     bestFA.mlbam_id,
        addPlayerPhotoUrl:    faPhotoLookup.get(normalizeName(bestFA.name)),
        replacePlayerName:    player.name,
        replacePlayerMlbamId: player.mlbam_id,
        replacePlayerPhotoUrl: playerPhotoUrl,
        faErosp:              Math.round(bestFA.erosp_raw * 10) / 10,
        currentErosp:         Math.round(player.erosp_raw * 10) / 10,
        upgradeAbsolute:      Math.round(upgradeAbsolute * 10) / 10,
        upgradePct:           Math.round(upgradePct * 10000) / 10000,
        teamPositionRank:     leagueRankA,
        teamPositionRankTotal: config.teamCount,
        teamPositionZ:        Math.round(leagueZA * 100) / 100,
        faPoolZ:              Math.round(faPoolZ * 100) / 100,
        recommendationScore,
        explanation,
        internalMove: {
          playerName:   player.name,
          fromPosition: posA,
          toPosition:   posB,
          mlbamId:      player.mlbam_id,
          photoUrl:     playerPhotoUrl,
        },
        debug: {
          teamWeightedStrength: Math.round(strengthA),
          leagueMeanStrength:   Math.round(statsA.mean),
          leagueStdStrength:    Math.round(statsA.std),
          faPoolMean:           Math.round(faPoolMeanA),
          faPoolStd:            Math.round(faPoolStdA),
          targetSlotRank:       config.starterSlots[posA] ?? 1,
          internalPositionRank: 0,
        },
      });
    }
  }

  return swaps;
}

// ─────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────

export interface SuggestedMovesInput {
  targetTeamId: number;
  erospPlayers: EROSPPlayer[];
  keeperOverrides: Record<string, string[]>;
  /** top FA players from free-agents.json, with photoUrl and ESPN eligible positions */
  faList: Array<{ playerName: string; photoUrl?: string; position: string; eligiblePositions?: string[] }>;
  /** ESPN roster data — used to catch EROSP pipeline name-match failures post-draft */
  leagueRosters?: Array<{ teamId: number; players: Array<{ playerName: string; photoUrl?: string; eligiblePositions?: string[] }> }>;
  config?: Partial<LeagueConfig>;
}

export function getSuggestedMoves(input: SuggestedMovesInput): SuggestedMovesResult {
  const { targetTeamId, erospPlayers, keeperOverrides, faList, leagueRosters } = input;
  const config: LeagueConfig = { ...DEFAULT_CONFIG, ...input.config };

  // ── Step 1: Assign players to teams ──────────────────────────────
  const { teamMap, isPreDraft } = buildPlayerTeamMap(erospPlayers, keeperOverrides, leagueRosters);

  // All team IDs in the league
  const leagueTeamIds = Array.from(
    new Set([...Object.keys(keeperOverrides).map(Number), targetTeamId])
  ).filter(Boolean);

  // ── Step 2: Build team positional strength for ALL teams ──────────
  const allTeamStrengths = new Map<number, Record<string, TeamPositionStrength>>();

  for (const tid of leagueTeamIds) {
    const roster = erospPlayers.filter(p => teamMap.get(p.mlbam_id) === tid);
    allTeamStrengths.set(tid, buildTeamPositionalStrength(roster, config));
  }

  // ── Step 3: League-wide distributions ────────────────────────────
  const leagueStats = computeLeagueDistributions(allTeamStrengths, config);

  // ── Step 4: Position summary for target team ──────────────────────
  const teamStrengths = allTeamStrengths.get(targetTeamId) ??
    buildTeamPositionalStrength([], config);

  const positions = Object.keys(config.starterSlots);
  const positionSummary: Record<string, PositionSummary> = {};

  // Internal ranks (comparing positions to each other within the team)
  const posZScores = positions.map(pos => ({
    pos,
    z: zScore(
      teamStrengths[pos]?.weightedStrength ?? 0,
      leagueStats[pos].mean,
      leagueStats[pos].std,
    ),
  }));
  const sortedByZAsc = [...posZScores].sort((a, b) => a.z - b.z);
  const internalRankMap = new Map(sortedByZAsc.map(({ pos }, i) => [pos, i + 1]));

  for (const pos of positions) {
    const strength  = teamStrengths[pos]?.weightedStrength ?? 0;
    const stats     = leagueStats[pos];
    const z         = zScore(strength, stats.mean, stats.std);
    const rank      = rankDesc(stats.allValues, strength - 0.001);
    positionSummary[pos] = {
      rank,
      rankTotal: config.teamCount,
      z,
      weightedStrength: strength,
      internalRank: internalRankMap.get(pos) ?? 1,
    };
  }

  // ── Step 5: Detect weak positions ─────────────────────────────────
  const weakPositions = detectWeakPositions(teamStrengths, leagueStats, config);

  if (weakPositions.length === 0) {
    return { teamId: targetTeamId, suggestedMoves: [], positionSummary, isPreDraft };
  }

  // ── Step 6: Build FA pool ─────────────────────────────────────────
  // FA = players not assigned to any team
  const faErospPlayers = erospPlayers.filter(p => !teamMap.has(p.mlbam_id) || teamMap.get(p.mlbam_id) === 0);

  // Restrict FA pool to players actually available in this league (from faList)
  const faListNameSet = new Set(faList.map(p => normalizeName(p.playerName)));
  const leagueFAs = faErospPlayers.filter(p => faListNameSet.has(normalizeName(p.name)));

  // Photo lookup
  const faPhotoLookup = new Map<string, string>();
  for (const fa of faList) {
    if (fa.photoUrl) faPhotoLookup.set(normalizeName(fa.playerName), fa.photoUrl);
  }

  // FA multi-position eligibility map (from ESPN eligible slot data)
  const faEligibilityMap = new Map<string, string[]>();
  for (const fa of faList) {
    if (fa.eligiblePositions?.length) {
      faEligibilityMap.set(normalizeName(fa.playerName), fa.eligiblePositions);
    }
  }

  // Roster eligibility + photo maps for the target team
  const rosterEligibilityMap = new Map<string, string[]>();
  const rosterPhotoLookup = new Map<string, string>();
  const targetTeamRosterData = leagueRosters?.find(r => r.teamId === targetTeamId);
  if (targetTeamRosterData) {
    for (const player of targetTeamRosterData.players) {
      const key = normalizeName(player.playerName);
      if (player.eligiblePositions?.length) rosterEligibilityMap.set(key, player.eligiblePositions);
      if (player.photoUrl) rosterPhotoLookup.set(key, player.photoUrl);
    }
  }

  // ── Step 7: Find recommendations for each weak position ───────────
  const allRecommendations: SuggestedMove[] = [];

  // Track which slots have been addressed to avoid duplicate recommendations
  const addressedSlots = new Set<string>();
  let midRankEmptySlotCount = 0;
  // Bottom-3 empty-slot recs always shown; middle-rank empty slots capped at 2
  const MAX_MID_RANK_EMPTY_SLOTS = 2;

  for (const weakPos of weakPositions) {
    const { pos, leagueZ, leagueRank, internalRank, targetPlayer, targetSlotLabel } = weakPos;

    const targetErosp = targetPlayer?.erosp_raw ?? 0;

    // For empty slots, limit mid-rank spam (bottom-3 positions always shown)
    if (!targetPlayer) {
      const isBottomThree = leagueRank >= config.teamCount - 2;
      if (!isBottomThree && midRankEmptySlotCount >= MAX_MID_RANK_EMPTY_SLOTS) continue;
    }

    const candidates = scoreFACandidates(
      leagueFAs,
      pos,
      targetErosp,
      weakPos,
      leagueStats,
      faPhotoLookup,
      config,
      config.teamCount,
      faEligibilityMap,
    );

    if (candidates.length === 0) continue;

    // Take the best candidate for this slot (one recommendation per position group)
    const best = candidates[0];
    const slotKey = `${pos}-${targetSlotLabel}`;
    if (addressedSlots.has(slotKey)) continue;
    addressedSlots.add(slotKey);

    const faErosps = leagueFAs
      .filter(p => getPositionGroup(p) === pos)
      .map(p => p.erosp_raw);
    const faPoolMean = mean(faErosps);
    const faPoolStd  = std(faErosps, faPoolMean);

    const explanation = generateExplanation(
      pos, weakPos, best.player, targetPlayer,
      best.upgradeAbsolute, best.upgradePct,
      best.urgency, config.teamCount,
    );

    const stats = leagueStats[pos];

    if (!targetPlayer) {
      const isBottomThree = leagueRank >= config.teamCount - 2;
      if (!isBottomThree) midRankEmptySlotCount++;
    }

    allRecommendations.push({
      urgency:              best.urgency,
      position:             pos,
      targetSlot:           targetSlotLabel,
      addPlayerName:        best.player.name,
      addPlayerMlbamId:     best.player.mlbam_id,
      addPlayerPhotoUrl:    best.photoUrl,
      replacePlayerName:    targetPlayer ? targetPlayer.name : 'No projection',
      replacePlayerMlbamId: targetPlayer?.mlbam_id ?? 0,
      faErosp:              Math.round(best.player.erosp_raw * 10) / 10,
      currentErosp:         Math.round(targetErosp * 10) / 10,
      upgradeAbsolute:      Math.round(best.upgradeAbsolute * 10) / 10,
      upgradePct:           Math.round(best.upgradePct * 10000) / 10000,
      teamPositionRank:     leagueRank,
      teamPositionRankTotal: config.teamCount,
      teamPositionZ:        Math.round(leagueZ * 100) / 100,
      faPoolZ:              Math.round(best.faPoolZ * 100) / 100,
      recommendationScore:  best.recommendationScore,
      explanation,
      debug: {
        teamWeightedStrength: Math.round(teamStrengths[pos]?.weightedStrength ?? 0),
        leagueMeanStrength:   Math.round(stats.mean),
        leagueStdStrength:    Math.round(stats.std),
        faPoolMean:           Math.round(faPoolMean),
        faPoolStd:            Math.round(faPoolStd),
        targetSlotRank:       weakPos.targetSlotIndex + 1,
        internalPositionRank: internalRank,
      },
    });

    if (allRecommendations.length >= config.maxRecommendations * 2) break;
  }

  // ── Step 8: Slot-swap recommendations ────────────────────────────
  // Find players on target team eligible at multiple ESPN positions and check
  // if repositioning them + adding a FA at their vacated slot helps two positions at once.
  if (rosterEligibilityMap.size > 0) {
    const targetTeamPlayers = erospPlayers.filter(p => teamMap.get(p.mlbam_id) === targetTeamId);
    const swapMoves = findSlotSwaps(
      targetTeamPlayers,
      rosterEligibilityMap,
      rosterPhotoLookup,
      leagueFAs,
      teamStrengths,
      leagueStats,
      faPhotoLookup,
      faEligibilityMap,
      config,
    );
    for (const swap of swapMoves) {
      if (allRecommendations.length >= config.maxRecommendations * 2) break;
      allRecommendations.push(swap);
    }
  }

  // ── Step 9: Sort by urgency then score, take top N ────────────────
  const urgencyOrder: Record<UrgencyLevel, number> = {
    urgent_pickup: 3,
    suggested_add: 2,
    watchlist:     1,
  };

  const sorted = allRecommendations.sort((a, b) => {
    const urgencyDiff = urgencyOrder[b.urgency] - urgencyOrder[a.urgency];
    if (urgencyDiff !== 0) return urgencyDiff;
    return b.recommendationScore - a.recommendationScore;
  });

  return {
    teamId:        targetTeamId,
    suggestedMoves: sorted.slice(0, config.maxRecommendations),
    positionSummary,
    isPreDraft,
  };
}
