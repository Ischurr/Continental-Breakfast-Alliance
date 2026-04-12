'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type {
  Matchup,
  PlayerSeason,
  LivePlayerPointsResponse,
  LivePlayerPoints,
  LiveStatLine,
} from '@/lib/types';

interface Props {
  matchup: Matchup;
  year: number;
  homeTeamName: string;
  awayTeamName: string;
  homePrimaryColor: string;
  awayPrimaryColor: string;
  homeRoster: PlayerSeason[];
  awayRoster: PlayerSeason[];
}

// ── Sub-components (stateless, defined outside to avoid re-creation) ──────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'Final') {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 flex-shrink-0">
        Final
      </span>
    );
  }
  if (status === 'In Progress') {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 flex items-center gap-1 flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
        Live
      </span>
    );
  }
  if (status === 'Not Started') {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-500 flex-shrink-0">
        Today
      </span>
    );
  }
  return null; // No Game — show nothing
}

function BreakdownPanel({ lines }: { lines: LiveStatLine[] }) {
  const total = lines.reduce((s, l) => s + l.points, 0);
  return (
    <div className="px-4 pt-1 pb-3 bg-gray-50 border-t border-gray-100">
      <table className="w-full text-xs">
        <tbody>
          {lines.map((line, i) => (
            <tr key={i} className="text-gray-600">
              <td className="py-0.5 font-mono w-12 text-gray-700 font-medium">{line.stat}</td>
              <td className="py-0.5 w-20 text-gray-400 text-center">
                {line.stat === 'IP'
                  ? `${line.value.toFixed(1)} IP`
                  : line.stat === 'QS'
                  ? '✓'
                  : `×${line.value}`}
              </td>
              <td
                className={`py-0.5 text-right font-semibold ${
                  line.points > 0 ? 'text-teal-700' : 'text-red-600'
                }`}
              >
                {line.points > 0 ? '+' : ''}
                {line.points % 1 === 0 ? line.points.toFixed(0) : line.points.toFixed(2)}
              </td>
            </tr>
          ))}
          <tr className="border-t border-gray-200">
            <td colSpan={2} className="pt-1 pb-0.5 text-gray-400 font-medium">
              Total
            </td>
            <td
              className={`pt-1 pb-0.5 text-right font-bold ${
                total > 0 ? 'text-teal-700' : total < 0 ? 'text-red-600' : 'text-gray-400'
              }`}
            >
              {total > 0 ? '+' : ''}
              {total % 1 === 0 ? total.toFixed(0) : total.toFixed(2)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function MatchupDetailClient({
  matchup,
  year,
  homeTeamName,
  awayTeamName,
  homePrimaryColor,
  awayPrimaryColor,
  homeRoster,
  awayRoster,
}: Props) {
  const [liveData, setLiveData] = useState<LivePlayerPointsResponse | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>('');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch('/api/live-player-points', { cache: 'no-store' });
      if (!res.ok) return;
      const data: LivePlayerPointsResponse = await res.json();
      setLiveData(data);
      if (data.source === 'mlb_live') {
        setLastRefresh(
          new Date().toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: 'America/New_York',
          })
        );
      }
    } catch {
      // Silent — keep showing previous data
    }
  }, []);

  useEffect(() => {
    fetchLive();
    const interval = setInterval(fetchLive, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchLive]);

  const isLive = liveData?.source === 'mlb_live';

  function toggleExpand(key: string) {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** Look up a roster player's live data by espnId. */
  function getLivePlayer(teamId: number, playerId: string): LivePlayerPoints | undefined {
    if (!isLive || !liveData?.teams) return undefined;
    const teamData = liveData.teams[teamId];
    if (!teamData) return undefined;
    return teamData.players.find(p => p.espnId.toString() === playerId);
  }

  // ── RosterColumn ─────────────────────────────────────────────────────────

  function RosterColumn({
    teamId,
    teamName,
    color,
    seasonScore,
    roster,
  }: {
    teamId: number;
    teamName: string;
    color: string;
    seasonScore: number;
    roster: PlayerSeason[];
  }) {
    const teamLiveData = isLive ? liveData?.teams?.[teamId] : undefined;
    const todayTotal = teamLiveData?.totalTodayPoints ?? 0;

    // Build roster rows with optional live data, sort by today's points when live
    const rows = roster.map(player => ({
      player,
      live: getLivePlayer(teamId, player.playerId),
    }));
    if (isLive) {
      rows.sort((a, b) => (b.live?.todayPoints ?? 0) - (a.live?.todayPoints ?? 0));
    }

    return (
      <div className="flex-1 min-w-0">
        {/* Team header */}
        <div className="rounded-t-xl p-4" style={{ backgroundColor: color }}>
          <h2 className="font-bold text-white text-base leading-tight">{teamName}</h2>
          <div className="text-white/70 text-sm mt-0.5">
            Season total: {seasonScore.toFixed(1)}
          </div>
          {isLive && (
            <div className="text-white font-bold text-sm mt-1">
              Today:{' '}
              <span className={todayTotal >= 0 ? 'text-green-200' : 'text-red-200'}>
                {todayTotal >= 0 ? '+' : ''}
                {todayTotal.toFixed(1)}
              </span>
            </div>
          )}
        </div>

        {/* Player rows */}
        <div className="border-x border-b border-gray-200 rounded-b-xl overflow-hidden bg-white divide-y divide-gray-100">
          {rows.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              No roster data available
            </div>
          )}
          {rows.map(({ player, live }) => {
            const key = `${teamId}-${player.playerId}`;
            const isExpanded = expandedKeys.has(key);
            const pts = live?.todayPoints;
            const status = live?.gameStatus ?? 'No Game';
            const hasBreakdown = (live?.breakdown?.lines?.length ?? 0) > 0;
            const canExpand = isLive && hasBreakdown;

            return (
              <div key={key}>
                <div
                  className={`flex items-center gap-2 px-4 py-2.5 ${
                    canExpand
                      ? 'cursor-pointer hover:bg-gray-50 transition-colors'
                      : ''
                  }`}
                  onClick={() => canExpand && toggleExpand(key)}
                >
                  {/* Name */}
                  <span className="flex-1 min-w-0 text-sm font-medium text-gray-800 truncate">
                    {player.playerName}
                  </span>

                  {/* Status badge (only during live window) */}
                  {isLive && status !== 'No Game' && <StatusBadge status={status} />}

                  {/* Today's points */}
                  {isLive && status !== 'No Game' && pts !== undefined ? (
                    <span
                      className={`text-sm font-bold flex-shrink-0 w-12 text-right ${
                        pts > 0
                          ? 'text-teal-700'
                          : pts < 0
                          ? 'text-red-600'
                          : 'text-gray-400'
                      }`}
                    >
                      {pts > 0 ? '+' : ''}
                      {pts % 1 === 0 ? pts.toFixed(0) : pts.toFixed(1)}
                    </span>
                  ) : isLive ? (
                    <span className="text-gray-300 text-sm flex-shrink-0 w-12 text-right">–</span>
                  ) : null}

                  {/* Expand chevron */}
                  {canExpand && (
                    <span
                      className={`text-gray-300 text-xs flex-shrink-0 transition-transform duration-150 ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    >
                      ▼
                    </span>
                  )}
                </div>

                {/* Inline breakdown panel */}
                {isExpanded && live?.breakdown && (
                  <BreakdownPanel lines={live.breakdown.lines} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Live-adjusted scores: ESPN base + today's MLB delta (if live data available)
  const homeLiveDelta = isLive ? (liveData?.teams?.[matchup.home.teamId]?.totalTodayPoints ?? 0) : 0;
  const awayLiveDelta = isLive ? (liveData?.teams?.[matchup.away.teamId]?.totalTodayPoints ?? 0) : 0;
  const displayHomeScore = matchup.home.totalPoints + homeLiveDelta;
  const displayAwayScore = matchup.away.totalPoints + awayLiveDelta;

  const homeWon = matchup.winner === matchup.home.teamId;
  const awayWon = matchup.winner === matchup.away.teamId;
  const isComplete = matchup.winner !== undefined;

  return (
    <main className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Back link */}
      <div className="mb-5">
        <Link
          href="/matchups"
          className="text-sm text-teal-600 hover:text-teal-800 transition-colors"
        >
          ← Back to Matchups
        </Link>
      </div>

      {/* Matchup header card */}
      <div className="bg-white rounded-xl border shadow-sm p-6 mb-5">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Week {matchup.week} · {year} Season
        </div>
        <div className="flex items-stretch gap-4">
          {/* Away team */}
          <div
            className={`flex-1 text-center py-4 rounded-xl ${
              awayWon ? 'bg-green-50' : isComplete ? 'bg-red-50' : 'bg-gray-50'
            }`}
          >
            <div
              className={`text-base font-bold mb-1 ${awayWon ? 'text-green-800' : 'text-gray-700'}`}
            >
              {awayWon && <span className="text-green-600 mr-1">W</span>}
              {awayTeamName}
            </div>
            <div
              className={`text-4xl font-bold tabular-nums ${
                awayWon ? 'text-green-700' : homeWon ? 'text-gray-400' : 'text-gray-800'
              }`}
            >
              {displayAwayScore.toFixed(1)}
            </div>
          </div>

          {/* VS separator */}
          <div className="flex items-center text-gray-300 text-xl font-light px-2">vs</div>

          {/* Home team */}
          <div
            className={`flex-1 text-center py-4 rounded-xl ${
              homeWon ? 'bg-green-50' : isComplete ? 'bg-red-50' : 'bg-gray-50'
            }`}
          >
            <div
              className={`text-base font-bold mb-1 ${homeWon ? 'text-green-800' : 'text-gray-700'}`}
            >
              {homeWon && <span className="text-green-600 mr-1">W</span>}
              {homeTeamName}
            </div>
            <div
              className={`text-4xl font-bold tabular-nums ${
                homeWon ? 'text-green-700' : awayWon ? 'text-gray-400' : 'text-gray-800'
              }`}
            >
              {displayHomeScore.toFixed(1)}
            </div>
          </div>
        </div>
      </div>

      {/* ⚡ Live Today banner */}
      {isLive && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <span className="font-semibold text-amber-800">⚡ Live Today</span>
          <span className="text-amber-600 text-sm">
            {lastRefresh ? `Updated ${lastRefresh} ET` : 'Loading…'} · auto-refreshes every 5 min
          </span>
        </div>
      )}

      {/* Two-column roster view */}
      <div className="flex flex-col md:flex-row gap-4">
        <RosterColumn
          teamId={matchup.away.teamId}
          teamName={awayTeamName}
          color={awayPrimaryColor}
          seasonScore={matchup.away.totalPoints}
          roster={awayRoster}
        />
        <RosterColumn
          teamId={matchup.home.teamId}
          teamName={homeTeamName}
          color={homePrimaryColor}
          seasonScore={matchup.home.totalPoints}
          roster={homeRoster}
        />
      </div>

      {/* Footer */}
      <p className="text-center text-xs text-gray-400 mt-6">
        {isLive
          ? 'Scores from MLB Stats API · updates every 5 min · ESPN season totals update overnight'
          : 'Live scores available 11 AM–11 PM ET on game days · ESPN season totals update overnight'}
      </p>
    </main>
  );
}

