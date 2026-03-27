// app/api/win-probability/refresh/route.ts
//
// POST /api/win-probability/refresh
//
// Runs the full win-probability simulation and saves results.
// Called nightly at 10 PM EST by GitHub Actions.
//
// Authorization: Bearer ${WIN_PROBABILITY_SECRET} header required when
// WIN_PROBABILITY_SECRET env var is set.

import { NextRequest, NextResponse } from "next/server";
import { runNightlyWinProbabilityJob } from "@/lib/fantasy/nightlyJob";
import { setWinProbability } from "@/lib/store";

export async function POST(req: NextRequest) {
  const secret = process.env["WIN_PROBABILITY_SECRET"];
  if (secret) {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (token !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await runNightlyWinProbabilityJob({
    save: async (data) => { await setWinProbability(data); },
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
  });
}
