// app/api/win-probability/live/route.ts
//
// GET /api/win-probability/live
//
// Returns win probabilities adjusted for today's live MLB scores.
// During game hours (11 AM – 11 PM ET):
//   1. Loads nightly WinProbabilityStore from KV (has ESPN base scores + adaptive correction)
//   2. Loads today's live team totals from the live-player-points KV cache
//   3. For each matchup: espnBase + todayLive → re-runs Monte Carlo offline simulation
//   4. Caches result 5 min, returns it
// Outside game hours: returns the nightly store unchanged (no simulation cost).
//
// Uses buildOfflineMatchupState (local file reads only, no ESPN API call)
// so this route is fast enough to run on every 5-min poll.

import { NextResponse } from 'next/server';
import { getWinProbability } from '@/lib/store';
import { calculateMatchupWinProbability } from '@/lib/fantasy/winProbability';
import { buildOfflineMatchupState } from '@/lib/fantasy/espnLoader';
import type { WinProbabilityStore } from '@/lib/fantasy/nightlyJob';
import type { LivePlayerPointsResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// ── Time helpers ──────────────────────────────────────────────────────────────

function getEasternHour(): number {
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
  }).format(new Date());
  const h = parseInt(s, 10);
  return isNaN(h) ? 0 : h % 24;
}

function getTodayET(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

// ── KV helpers ────────────────────────────────────────────────────────────────

async function getRedis() {
  if (!process.env.KV_REST_API_URL) return null;
  const { Redis } = await import('@upstash/redis');
  return new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET() {
  // Always load nightly store — it's the base for everything
  const nightlyStore = (await getWinProbability()) as WinProbabilityStore | null;
  if (!nightlyStore?.matchups?.length) {
    return NextResponse.json({ error: 'No win probability data' }, { status: 404 });
  }

  const hourET = getEasternHour();

  // Outside game hours: return nightly store as-is (no simulation needed)
  if (hourET < 11 || hourET >= 23) {
    return NextResponse.json(nightlyStore);
  }

  const todayET = getTodayET();
  const liveCacheKey = `win-probability-live-${todayET}`;

  // Check 5-min live cache
  const redis = await getRedis();
  if (redis) {
    try {
      const cached = await redis.get<WinProbabilityStore>(liveCacheKey);
      if (cached?.matchups?.length) {
        return NextResponse.json(cached, { headers: { 'Cache-Control': 'no-store' } });
      }
    } catch {
      // Cache miss — proceed
    }
  }

  // Load today's live team totals from KV (populated by /api/live-player-points)
  let liveTeams: Record<number, { totalTodayPoints: number }> | null = null;
  if (redis) {
    try {
      const liveData = await redis.get<LivePlayerPointsResponse>(`live-player-points-${todayET}`);
      if (liveData?.source === 'mlb_live' && liveData.teams) {
        liveTeams = liveData.teams as Record<number, { totalTodayPoints: number }>;
      }
    } catch {
      // No live player data cached yet
    }
  }

  // No live player data available → return nightly store unchanged
  if (!liveTeams) {
    return NextResponse.json(nightlyStore);
  }

  // Check if any team has a non-zero live delta — skip simulation if all zeros
  const seasonId = nightlyStore.seasonId ?? process.env.ESPN_SEASON_ID ?? '2026';
  const adaptiveCorrection = nightlyStore.learningStats?.adaptiveBiasCorrection ?? 0;

  // Re-run simulation for each matchup with live-adjusted scores
  // Uses buildOfflineMatchupState (reads local EROSP + roster files, no ESPN API)
  const updatedMatchups = await Promise.all(
    nightlyStore.matchups.map(async (m) => {
      const homeId = parseInt(m.homeTeamId, 10);
      const awayId = parseInt(m.awayTeamId, 10);

      // totalTodayPoints from live-player-points is today's MLB-derived delta
      // ESPN base (m.homeCurrentPoints) was set at nightly job time (10 PM last night)
      const homeDelta = liveTeams![homeId]?.totalTodayPoints ?? 0;
      const awayDelta = liveTeams![awayId]?.totalTodayPoints ?? 0;

      if (homeDelta === 0 && awayDelta === 0) {
        // No live activity for these teams today — reuse nightly result
        return m;
      }

      const homeAdjusted = m.homeCurrentPoints + homeDelta;
      const awayAdjusted = m.awayCurrentPoints + awayDelta;

      try {
        // Reduced simulation count (5k vs 20k) for speed — good enough for 5-min updates
        const state = await buildOfflineMatchupState(homeId, awayId, homeAdjusted, awayAdjusted, {
          seasonId,
        });
        return calculateMatchupWinProbability(state, 5_000, adaptiveCorrection);
      } catch (err) {
        console.warn(`[win-probability/live] Simulation failed for ${homeId} vs ${awayId}:`, err);
        return m; // Fallback to nightly result for this matchup
      }
    })
  );

  const result: WinProbabilityStore = {
    ...nightlyStore,
    updatedAt: new Date().toISOString(),
    matchups: updatedMatchups,
  };

  // Cache for 5 minutes
  if (redis) {
    try {
      await redis.set(liveCacheKey, result, { ex: 300 });
    } catch {
      // Non-fatal
    }
  }

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
