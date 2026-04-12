'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Matchup, StandingEntry } from '@/lib/types';

interface Team {
  id: number;
  name: string;
}

interface Props {
  matchup: Matchup;
  week: number;
  useHistorical: boolean;
  teams: Team[];
  standings: StandingEntry[];
}

export default function HomepageMatchupCard({ matchup, week, useHistorical, teams, standings }: Props) {
  const [homeScore, setHomeScore] = useState(matchup.home.totalPoints);
  const [awayScore, setAwayScore] = useState(matchup.away.totalPoints);

  useEffect(() => {
    async function fetchLive() {
      // 1. ESPN batch scores
      let espnHome = matchup.home.totalPoints;
      let espnAway = matchup.away.totalPoints;
      try {
        const res = await fetch('/api/live-scores', { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (json.week === week) {
            const m = json.matchups?.find(
              (m: { homeTeamId: number; awayTeamId: number }) =>
                m.homeTeamId === matchup.home.teamId && m.awayTeamId === matchup.away.teamId
            );
            if (m) {
              espnHome = m.homeScore;
              espnAway = m.awayScore;
            }
          }
        }
      } catch { /* silent */ }

      // 2. Today's MLB-derived delta
      let homeDelta = 0;
      let awayDelta = 0;
      try {
        const res = await fetch('/api/live-player-points', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.source === 'mlb_live' && data.teams) {
            homeDelta = data.teams[String(matchup.home.teamId)]?.totalTodayPoints ?? 0;
            awayDelta = data.teams[String(matchup.away.teamId)]?.totalTodayPoints ?? 0;
          }
        }
      } catch { /* silent */ }

      setHomeScore(espnHome + homeDelta);
      setAwayScore(espnAway + awayDelta);
    }

    fetchLive();
    const interval = setInterval(fetchLive, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [matchup.home.teamId, matchup.away.teamId, matchup.home.totalPoints, matchup.away.totalPoints, week]);

  const homeTeam = teams.find(t => t.id === matchup.home.teamId);
  const awayTeam = teams.find(t => t.id === matchup.away.teamId);
  const homeStanding = standings.find(s => s.teamId === matchup.home.teamId);
  const awayStanding = standings.find(s => s.teamId === matchup.away.teamId);
  const isComplete = matchup.winner !== undefined;
  const hasActivity = homeScore > 0 || awayScore > 0;

  const getRecord = (standing: typeof homeStanding) =>
    standing ? `${standing.wins}-${standing.losses}` : '—';

  const rows = [
    { team: awayTeam, standing: awayStanding, score: awayScore, won: matchup.winner === matchup.away.teamId },
    { team: homeTeam, standing: homeStanding, score: homeScore, won: matchup.winner === matchup.home.teamId },
  ];

  return (
    <Link href="/matchups" className="flex flex-col flex-1 group">
      <p className="text-xs text-gray-400 mb-3">
        Week {week} &bull;{' '}
        {isComplete
          ? 'Final'
          : hasActivity
          ? `Scores updated as of morning of ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
          : useHistorical
          ? 'Top all-time records'
          : 'Best combined record'}
      </p>
      <div className="space-y-2 flex-1">
        {rows.map(({ team, standing, score, won }) => (
          <div
            key={team?.id}
            className={`flex items-center justify-between p-3 rounded-lg ${
              won
                ? 'bg-green-50 border border-green-200'
                : isComplete
                ? 'bg-red-50 border border-red-100'
                : 'bg-sky-50 border border-sky-100'
            }`}
          >
            <div>
              <p className={`font-semibold text-sm ${won ? 'text-green-700' : 'text-gray-800'}`}>
                {team?.name ?? '—'}
              </p>
              <p className="text-xs text-gray-400">{getRecord(standing)} this season</p>
            </div>
            {(isComplete || hasActivity) && (
              <span className={`text-lg font-bold ${won ? 'text-green-700' : isComplete ? 'text-gray-400' : 'text-sky-600'}`}>
                {score.toFixed(1)}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-teal-600 mt-3 font-medium group-hover:underline">See all matchups →</p>
    </Link>
  );
}
