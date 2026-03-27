// ============================================================
// lib/fantasy/nightlyJob.ts
//
// Nightly 10 PM win-probability refresh job.
//
// Intended to run as a Next.js API route (app/api/win-probability/update/route.ts)
// triggered by a cron job or GitHub Actions at 10 PM EST.
//
// Flow:
//   1. Load live matchup state from ESPN API + EROSP projections
//   2. Run Monte Carlo simulation for each matchup
//   3. Save results to the data store (KV in production, JSON in dev)
//   4. Optionally run a quick backtest check and log warnings
//
// Storage key in KV: "win-probability-{year}" → WinProbabilityStore
// ============================================================

import { loadCurrentMatchupStates } from "./espnLoader";
import { calculateMatchupWinProbability } from "./winProbability";
import type { MatchupWinProbabilityView } from "./winProbability";
import { DEFAULT_SIMULATION_COUNT, ESPN_SEASON_ID } from "./constants";

// ---- Storage shape ----

export interface WinProbabilityStore {
  updatedAt: string;
  seasonId: string;
  matchupPeriodId: number;
  matchups: MatchupWinProbabilityView[];
}

// ---- Persistence adapters ----

type SaveFn = (data: WinProbabilityStore) => Promise<void>;
type LoadFn = () => Promise<WinProbabilityStore | null>;

// ---- Main nightly job ----

export interface NightlyJobOptions {
  seasonId?: string;
  simulationCount?: number;
  save: SaveFn;
  load?: LoadFn;
  /** If true, runs a quick sanity check on the results before saving */
  validateResults?: boolean;
}

export interface NightlyJobResult {
  success: boolean;
  matchupsProcessed: number;
  error?: string;
  results?: WinProbabilityStore;
}

/**
 * Runs the nightly win-probability update job.
 *
 * Usage in an API route:
 * ```typescript
 * const result = await runNightlyWinProbabilityJob({
 *   save: async (data) => {
 *     await kv.set("win-probability-2026", JSON.stringify(data));
 *   }
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
    validateResults = true,
  } = options;

  const now = new Date();
  console.log(`[nightlyJob] Starting win-probability run at ${now.toISOString()}`);

  try {
    // 1. Load live matchup states
    console.log("[nightlyJob] Loading matchup states from ESPN + EROSP...");
    const matchupStates = await loadCurrentMatchupStates({ seasonId, now });

    if (matchupStates.length === 0) {
      console.warn("[nightlyJob] No active matchups found. Season may be over.");
      return { success: true, matchupsProcessed: 0 };
    }

    console.log(`[nightlyJob] Processing ${matchupStates.length} matchups...`);

    // 2. Run simulations
    const matchupResults: MatchupWinProbabilityView[] = [];

    for (const matchup of matchupStates) {
      console.log(
        `[nightlyJob]   ${matchup.home.name} vs ${matchup.away.name} ` +
        `(current: ${matchup.home.currentPoints.toFixed(1)} - ${matchup.away.currentPoints.toFixed(1)})`
      );

      const result = calculateMatchupWinProbability(matchup, simulationCount);
      matchupResults.push(result);

      console.log(
        `[nightlyJob]   → ${result.homeTeamName} ${result.homeWinPct}% vs ` +
        `${result.awayTeamName} ${result.awayWinPct}%`
      );
    }

    // 3. Validate results (sanity check)
    if (validateResults) {
      for (const r of matchupResults) {
        const total = r.homeWinPct + r.awayWinPct;
        if (Math.abs(total - 100) > 1) {
          console.warn(
            `[nightlyJob] ⚠ Probabilities don't sum to ~100%: ` +
            `${r.homeTeamName}=${r.homeWinPct}% + ${r.awayTeamName}=${r.awayWinPct}% = ${total.toFixed(1)}%`
          );
        }
        // Flag extreme probabilities (>95%) for review — unusual mid-week
        if (r.homeWinPct > 95 || r.awayWinPct > 95) {
          console.log(
            `[nightlyJob] 📌 Extreme probability: ${r.homeTeamName} ${r.homeWinPct}% ` +
            `vs ${r.awayTeamName} ${r.awayWinPct}% — check if lead is decisive`
          );
        }
      }
    }

    // 4. Save results
    const matchupPeriodId = matchupStates[0]?.matchup.matchupPeriodId ?? 1;
    const store: WinProbabilityStore = {
      updatedAt: now.toISOString(),
      seasonId,
      matchupPeriodId,
      matchups: matchupResults,
    };

    await save(store);
    console.log(
      `[nightlyJob] ✓ Saved ${matchupResults.length} matchup win probabilities`
    );

    return {
      success: true,
      matchupsProcessed: matchupResults.length,
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
