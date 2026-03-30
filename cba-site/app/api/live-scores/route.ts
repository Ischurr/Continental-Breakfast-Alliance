import { NextResponse } from 'next/server';
import { createESPNClient } from '@/lib/espn-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // always fetch fresh from ESPN

export async function GET() {
  try {
    const client = createESPNClient('2026');
    const data = await client.fetchLeagueData(['mMatchup']);

    const schedule: Record<string, unknown>[] = data.schedule ?? [];

    // ESPN returns winner: null for unplayed matchups — must check for 'HOME'/'AWAY' strings,
    // not just !== undefined (null !== undefined is true, which broke week detection).
    const isFinalized = (m: Record<string, unknown>) =>
      m.winner === 'HOME' || m.winner === 'AWAY';

    // Find the current week: highest week with any scoring activity.
    // If that week is fully final (all matchups have winners), advance to the next week.
    let lastActiveWeek = 1;
    for (const m of schedule) {
      const home = m.home as Record<string, unknown> | undefined;
      const away = m.away as Record<string, unknown> | undefined;
      if (
        isFinalized(m) ||
        (home?.totalPoints as number ?? 0) > 0 ||
        (away?.totalPoints as number ?? 0) > 0
      ) {
        const week = m.matchupPeriodId as number;
        if (week > lastActiveWeek) lastActiveWeek = week;
      }
    }
    const lastActiveMatchups = schedule.filter(m => m.matchupPeriodId === lastActiveWeek);
    const lastWeekFullyFinal = lastActiveMatchups.length > 0 &&
      lastActiveMatchups.every(m => isFinalized(m));
    const currentWeek = lastWeekFullyFinal ? lastActiveWeek + 1 : lastActiveWeek;

    // Return all matchups for the current week
    const currentMatchups = schedule
      .filter(m => m.matchupPeriodId === currentWeek)
      .map(m => {
        const home = m.home as Record<string, unknown> | undefined;
        const away = m.away as Record<string, unknown> | undefined;
        return {
          week: currentWeek,
          homeTeamId: home?.teamId as number,
          homeScore: (home?.totalPoints as number) ?? 0,
          awayTeamId: away?.teamId as number,
          awayScore: (away?.totalPoints as number) ?? 0,
          winner: m.winner as string | undefined,
        };
      });

    return NextResponse.json(
      { week: currentWeek, matchups: currentMatchups },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[live-scores] ESPN fetch failed:', err);
    return NextResponse.json({ error: 'Failed to fetch live scores' }, { status: 500 });
  }
}
