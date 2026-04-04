// ============================================================
// lib/fantasy/nightlyJob.ts
//
// Nightly 10 PM win-probability refresh job.
//
// Intended to run as a Next.js API route (app/api/win-probability/refresh/route.ts)
// triggered by a cron job or GitHub Actions at 10 PM EST.
//
// Flow:
//   1. Load prediction history from KV (or null if first run)
//   2. Load live matchup state from ESPN API + EROSP projections
//   3. Resolve any unresolved predictions from previous weeks
//   4. Compute adaptive bias correction from this season's outcomes
//   5. Run Monte Carlo simulation for each matchup (with adaptive correction)
//   6. Record new predictions for the current week
//   7. Save win-probability results to KV
//   8. Save updated prediction history to KV
//
// Storage keys in KV:
//   "win-probability-{year}"         → WinProbabilityStore (display data)
//   "win-probability-history-{year}" → PredictionHistory   (learning data)
// ============================================================

import { loadCurrentMatchupStates } from "./espnLoader";
import { calculateMatchupWinProbability } from "./winProbability";
import type { MatchupWinProbabilityView } from "./winProbability";
import {
  buildPredictionRecords,
  resolveMatchups,
  computeSeasonStats,
  mergePredictions,
  type PredictionHistory,
  type SeasonLearningStats,
} from "./outcomeTracking";
import { DEFAULT_SIMULATION_COUNT, ESPN_SEASON_ID } from "./constants";
import type { Matchup } from "../types";

// ---- Storage shape ----

export interface WinProbabilityStore {
  updatedAt: string;
  seasonId: string;
  matchupPeriodId: number;
  matchups: MatchupWinProbabilityView[];
  /** Season learning stats included for transparency / debugging */
  learningStats?: SeasonLearningStats;
}

// ---- Persistence adapters ----

type SaveFn = (data: WinProbabilityStore) => Promise<void>;
type LoadFn = () => Promise<WinProbabilityStore | null>;
type LoadHistoryFn = () => Promise<PredictionHistory | null>;
type SaveHistoryFn = (history: PredictionHistory) => Promise<void>;
/** Returns completed matchups from the current season file for outcome resolution */
type GetSeasonMatchupsFn = () => Matchup[];

// ---- Main nightly job ----

export interface NightlyJobOptions {
  seasonId?: string;
  simulationCount?: number;
  save: SaveFn;
  load?: LoadFn;
  /** Load prediction history for adaptive learning */
  loadHistory?: LoadHistoryFn;
  /** Save updated prediction history after recording outcomes */
  saveHistory?: SaveHistoryFn;
  /**
   * Return all season matchups (from data/current/{year}.json) so the job
   * can resolve predictions for weeks that have ended.
   */
  getSeasonMatchups?: GetSeasonMatchupsFn;
  /** If true, runs a quick sanity check on the results before saving */
  validateResults?: boolean;
}

export interface NightlyJobResult {
  success: boolean;
  matchupsProcessed: number;
  error?: string;
  results?: WinProbabilityStore;
  /** How many previous-week predictions were resolved this run */
  predictionsResolved?: number;
  learningStats?: SeasonLearningStats;
}

/**
 * Runs the nightly win-probability update job.
 *
 * Usage in an API route:
 * ```typescript
 * const result = await runNightlyWinProbabilityJob({
 *   save: async (data) => { await setWinProbability(data); },
 *   loadHistory:  async () => await getPredictionHistory('2026') as PredictionHistory | null,
 *   saveHistory:  async (h) => await setPredictionHistory('2026', h),
 *   getSeasonMatchups: () => (currentSeason as SeasonData).matchups ?? [],
 * });
 * ```
 */
export async function runNightlyWinProbabilityJob(
  options: NightlyJobOptions
): Promise<NightlyJobResult> {
  const {
    seasonId = process.env.ESPN_SEASON_ID ?? ESPN_SEASON_ID,
    simulationCount = DEFAULT_SIMULATION_COUNT,
    save,
    loadHistory,
    saveHistory,
    getSeasonMatchups,
    validateResults = true,
  } = options;

  const now = new Date();
  console.log(`[nightlyJob] Starting win-probability run at ${now.toISOString()}`);

  try {
    // ---- 1. Load prediction history ----
    let history: PredictionHistory | null = null;
    let predictionsResolved = 0;

    if (loadHistory && saveHistory && getSeasonMatchups) {
      console.log("[nightlyJob] Loading prediction history...");
      const raw = await loadHistory();
      history = raw ?? { seasonId, predictions: [] };

      // ---- 2. Resolve outcomes from previous weeks ----
      const seasonMatchups = getSeasonMatchups();
      if (seasonMatchups.length > 0) {
        predictionsResolved = resolveMatchups(history, seasonMatchups);
        if (predictionsResolved > 0) {
          console.log(`[nightlyJob] Resolved ${predictionsResolved} prediction outcome(s)`);
        }
      }
    } else {
      console.log(
        "[nightlyJob] No history functions provided — running without adaptive learning"
      );
    }

    // ---- 3. Compute adaptive bias correction from this season's outcomes ----
    const learningStats = history ? computeSeasonStats(history) : null;

    if (learningStats && learningStats.totalResolved > 0) {
      console.log(
        `[nightlyJob] Learning stats: ${learningStats.totalResolved} resolved, ` +
        `accuracy=${learningStats.accuracy.toFixed(1)}%, ` +
        `residualBias=${(learningStats.residualBias * 100).toFixed(1)}pp, ` +
        `adaptiveCorrection=${(learningStats.adaptiveBiasCorrection * 100).toFixed(2)}pp`
      );
    } else {
      console.log("[nightlyJob] No resolved predictions yet — using static calibration only");
    }

    const adaptiveCorrection = learningStats?.adaptiveBiasCorrection ?? 0;

    // ---- 4. Load live matchup states ----
    console.log("[nightlyJob] Loading matchup states from ESPN + EROSP...");
    const matchupStates = await loadCurrentMatchupStates({ seasonId, now });

    if (matchupStates.length === 0) {
      console.warn("[nightlyJob] No active matchups found. Season may be over.");
      return { success: true, matchupsProcessed: 0, predictionsResolved };
    }

    console.log(`[nightlyJob] Processing ${matchupStates.length} matchups...`);

    // ---- 5. Run simulations with adaptive correction ----
    const matchupResults: MatchupWinProbabilityView[] = [];

    for (const matchup of matchupStates) {
      console.log(
        `[nightlyJob]   ${matchup.home.name} vs ${matchup.away.name} ` +
        `(current: ${matchup.home.currentPoints.toFixed(1)} - ${matchup.away.currentPoints.toFixed(1)})`
      );

      const result = calculateMatchupWinProbability(matchup, simulationCount, adaptiveCorrection);
      matchupResults.push(result);

      console.log(
        `[nightlyJob]   → ${result.homeTeamName} ${result.homeWinPct}% vs ` +
        `${result.awayTeamName} ${result.awayWinPct}%` +
        (adaptiveCorrection !== 0
          ? ` (adaptive adj: ${(adaptiveCorrection * 100).toFixed(2)}pp)`
          : "")
      );
    }

    // ---- 6. Validate results ----
    if (validateResults) {
      for (const r of matchupResults) {
        const total = r.homeWinPct + r.awayWinPct;
        if (Math.abs(total - 100) > 1) {
          console.warn(
            `[nightlyJob] ⚠ Probabilities don't sum to ~100%: ` +
            `${r.homeTeamName}=${r.homeWinPct}% + ${r.awayTeamName}=${r.awayWinPct}% = ${total.toFixed(1)}%`
          );
        }
        if (r.homeWinPct > 95 || r.awayWinPct > 95) {
          console.log(
            `[nightlyJob] 📌 Extreme probability: ${r.homeTeamName} ${r.homeWinPct}% ` +
            `vs ${r.awayTeamName} ${r.awayWinPct}% — check if lead is decisive`
          );
        }
      }
    }

    // ---- 7. Record new predictions in history ----
    const matchupPeriodId = matchupStates[0]?.matchup.matchupPeriodId ?? 1;

    if (history && saveHistory) {
      const newRecords = buildPredictionRecords(matchupPeriodId, matchupResults);
      mergePredictions(history, newRecords);
      if (learningStats) {
        history.lastStats = learningStats;
      }
      await saveHistory(history);
      console.log(
        `[nightlyJob] ✓ Saved ${newRecords.length} prediction record(s) ` +
        `(${history.predictions.length} total in history)`
      );
    }

    // ---- 8. Save win-probability results ----
    const store: WinProbabilityStore = {
      updatedAt: now.toISOString(),
      seasonId,
      matchupPeriodId,
      matchups: matchupResults,
      ...(learningStats ? { learningStats } : {}),
    };

    await save(store);
    console.log(
      `[nightlyJob] ✓ Saved ${matchupResults.length} matchup win probabilities`
    );

    return {
      success: true,
      matchupsProcessed: matchupResults.length,
      predictionsResolved,
      learningStats: learningStats ?? undefined,
      results: store,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[nightlyJob] ✗ Job failed: ${msg}`);
    return { success: false, matchupsProcessed: 0, error: msg };
  }
}

// ---- Convenience function for simple matchup-state-based batch run ----

/**
 * Simpler version: takes already-loaded matchup states and returns results.
 * Useful when you want to control the loading step separately.
 */
export async function runMatchupSimulations(
  matchupStates: Awaited<ReturnType<typeof loadCurrentMatchupStates>>,
  simulationCount: number = DEFAULT_SIMULATION_COUNT
): Promise<MatchupWinProbabilityView[]> {
  return matchupStates.map((m) =>
    calculateMatchupWinProbability(m, simulationCount)
  );
}
