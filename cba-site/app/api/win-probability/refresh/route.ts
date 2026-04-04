// app/api/win-probability/refresh/route.ts
//
// POST /api/win-probability/refresh
//
// Runs the full win-probability simulation and saves results.
// Called nightly at 10 PM EST by GitHub Actions.
//
// Authorization: Bearer ${WIN_PROBABILITY_SECRET} header required when
// WIN_PROBABILITY_SECRET env var is set.
//
// Self-improving calibration:
//   Each run records predictions in "win-probability-history-{year}" KV key.
//   After each week ends, outcomes are resolved and the model learns from
//   its mistakes — adjusting for any residual bias in the calibration.

import { NextRequest, NextResponse } from "next/server";
import { runNightlyWinProbabilityJob } from "@/lib/fantasy/nightlyJob";
import { setWinProbability, getPredictionHistory, setPredictionHistory } from "@/lib/store";
import type { PredictionHistory } from "@/lib/fantasy/outcomeTracking";
import type { Matchup } from "@/lib/types";

export async function POST(req: NextRequest) {
  const secret = process.env["WIN_PROBABILITY_SECRET"];
  if (secret) {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (token !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Load current season matchups for outcome resolution.
  // This is read at request time (not module load time) so it reflects
  // the latest ESPN data fetched by the update-stats workflow.
  let seasonMatchups: Matchup[] = [];
  try {
    const currentSeason = (await import("@/data/current/2026.json")).default as {
      matchups?: Matchup[];
    };
    seasonMatchups = currentSeason.matchups ?? [];
  } catch {
    console.warn("[refresh] Could not load season matchups for outcome resolution");
  }

  const seasonId = process.env.ESPN_SEASON_ID ?? "2026";

  const result = await runNightlyWinProbabilityJob({
    save: async (data) => {
      await setWinProbability(data);
    },
    loadHistory: async () => {
      const raw = await getPredictionHistory(seasonId);
      return (raw as PredictionHistory | null) ?? null;
    },
    saveHistory: async (history) => {
      await setPredictionHistory(seasonId, history);
    },
    getSeasonMatchups: () => seasonMatchups,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error, matchupsProcessed: result.matchupsProcessed },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    matchupsProcessed: result.matchupsProcessed,
    updatedAt: result.results?.updatedAt,
    predictionsResolved: result.predictionsResolved ?? 0,
    learningStats: result.learningStats ?? null,
  });
}
