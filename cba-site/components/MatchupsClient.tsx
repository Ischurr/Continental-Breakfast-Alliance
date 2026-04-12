'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import MatchupCard from '@/components/MatchupCard';
import { Matchup, Team } from '@/lib/types';

interface LiveScore {
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  winner?: string;
}

interface Props {
  matchupsByWeek: Record<number, Matchup[]>;
  weeks: number[];
  teams: Team[];
  currentWeek: number;
  nextWeek: number | null;
  /** teamId → win probability (%) for current week only */
  winProbByTeamId?: Record<number, number>;
}

export default function MatchupsClient({ matchupsByWeek, weeks, teams, currentWeek, nextWeek, winProbByTeamId }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  // keyed by "homeTeamId_awayTeamId"
  const [liveScores, setLiveScores] = useState<Record<string, LiveScore>>({});
  const [todayDeltaByTeamId, setTodayDeltaByTeamId] = useState<Record<number, number>>({});
  const [liveWinProbByTeamId, setLiveWinProbByTeamId] = useState<Record<number, number> | null>(null);

  useEffect(() => {
    async function fetchLive() {
      // 1. ESPN batch scores
      try {
        const res = await fetch('/api/live-scores', { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (json.week === currentWeek) {
            const map: Record<string, LiveScore> = {};
            for (const m of json.matchups as LiveScore[]) {
              map[`${m.homeTeamId}_${m.awayTeamId}`] = m;
            }
            setLiveScores(map);
          }
        }
      } catch { /* silent */ }

      // 2. Today's MLB-derived delta
      try {
        const res = await fetch('/api/live-player-points', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.source === 'mlb_live' && data.teams) {
            const deltas: Record<number, number> = {};
            for (const [id, team] of Object.entries(data.teams as Record<string, { totalTodayPoints: number }>)) {
              deltas[parseInt(id)] = team.totalTodayPoints;
            }
            setTodayDeltaByTeamId(deltas);
          }
        }
      } catch { /* silent */ }

      // 3. Live win probabilities (re-run with today's scores)
      try {
        const res = await fetch('/api/win-probability/live', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data.matchups?.length) {
            const probMap: Record<number, number> = {};
            for (const m of data.matchups as { homeTeamId: string; awayTeamId: string; homeWinPct: number; awayWinPct: number }[]) {
              probMap[parseInt(m.homeTeamId)] = m.homeWinPct;
              probMap[parseInt(m.awayTeamId)] = m.awayWinPct;
            }
            setLiveWinProbByTeamId(probMap);
          }
        }
      } catch { /* silent */ }
    }
    fetchLive();
    const interval = setInterval(fetchLive, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [currentWeek]);

  const pastWeeks = weeks.filter(w => w < currentWeek).sort((a, b) => b - a);
  const futureWeeks = weeks.filter(w => w > currentWeek).sort((a, b) => a - b);

  function filterMatchups(matchups: Matchup[]) {
    if (selectedTeamId === null) return matchups;
    return matchups.filter(
      m => m.home.teamId === selectedTeamId || m.away.teamId === selectedTeamId
    );
  }

  function applyLive(matchup: Matchup): Matchup {
    const live = liveScores[`${matchup.home.teamId}_${matchup.away.teamId}`];
    // Prefer MLB-derived today delta on top of ESPN batch; fall back to ESPN batch alone
    const homeBase = live ? live.homeScore : matchup.home.totalPoints;
    const awayBase = live ? live.awayScore : matchup.away.totalPoints;
    const homeDelta = todayDeltaByTeamId[matchup.home.teamId] ?? 0;
    const awayDelta = todayDeltaByTeamId[matchup.away.teamId] ?? 0;
    const hasAnyChange = live || homeDelta !== 0 || awayDelta !== 0;
    if (!hasAnyChange) return matchup;
    return {
      ...matchup,
      home: { ...matchup.home, totalPoints: homeBase + homeDelta },
      away: { ...matchup.away, totalPoints: awayBase + awayDelta },
      winner: live && (live.winner === 'HOME' || live.winner === 'AWAY') ? Number(live.winner) : matchup.winner,
    };
  }

  function matchupHref(matchup: Matchup): string {
    return `/matchups/${matchup.week}/${matchup.home.teamId}-${matchup.away.teamId}`;
  }

  function WeekSection({ week, label }: { week: number; label?: string }) {
    const isCurrentWeek = week === currentWeek;
    const raw = matchupsByWeek[week] ?? [];
    const patched = isCurrentWeek ? raw.map(applyLive) : raw;
    const filtered = filterMatchups(patched);
    if (filtered.length === 0) return null;
    return (
      <div className="mb-8">
        <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
          <span className="bg-teal-600 text-white text-sm px-3 py-1 rounded-full">
            {label ?? `Week ${week}`}
          </span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(matchup => {
            const probMap = liveWinProbByTeamId ?? winProbByTeamId;
            return (
              <Link key={matchup.id} href={matchupHref(matchup)} className="block hover:no-underline">
                <MatchupCard
                  matchup={matchup}
                  teams={teams}
                  homeWinPct={isCurrentWeek ? probMap?.[matchup.home.teamId] : undefined}
                  awayWinPct={isCurrentWeek ? probMap?.[matchup.away.teamId] : undefined}
                />
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Team filter */}
      <div className="mb-8 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-medium text-gray-500">Filter by team:</span>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setSelectedTeamId(null)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition ${
              selectedTeamId === null
                ? 'bg-teal-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-teal-400 hover:text-teal-600'
            }`}
          >
            All Teams
          </button>
          {teams.map(team => (
            <button
              key={team.id}
              onClick={() => setSelectedTeamId(selectedTeamId === team.id ? null : team.id)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                selectedTeamId === team.id
                  ? 'bg-teal-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-teal-400 hover:text-teal-600'
              }`}
            >
              {team.abbrev ?? team.name}
            </button>
          ))}
        </div>
      </div>

      {/* Current week */}
      <WeekSection week={currentWeek} label={`Week ${currentWeek} — Current`} />

      {/* No results state for team filter */}
      {selectedTeamId !== null &&
        filterMatchups(matchupsByWeek[currentWeek] ?? []).length === 0 && (
          <p className="text-gray-400 text-sm mb-8">
            No current-week matchups for this team.
          </p>
        )}

      {/* Collapsible: past weeks + next week */}
      {(pastWeeks.length > 0 || nextWeek !== null) && (
        <div className="mt-6">
          <button
            onClick={() => setHistoryOpen(o => !o)}
            className="flex items-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-900 transition mb-6"
          >
            <span
              className={`inline-block transition-transform duration-200 ${historyOpen ? 'rotate-90' : ''}`}
            >
              ▶
            </span>
            {historyOpen ? 'Hide' : 'Show'} previous weeks
            {nextWeek !== null ? ' & upcoming' : ''}
            <span className="text-gray-400 font-normal">
              ({pastWeeks.length} week{pastWeeks.length !== 1 ? 's' : ''} played
              {nextWeek !== null ? ', 1 upcoming' : ''})
            </span>
          </button>

          {historyOpen && (
            <div>
              {/* Next/upcoming week shown first */}
              {nextWeek !== null && (
                <WeekSection week={nextWeek} label={`Week ${nextWeek} — Upcoming`} />
              )}

              {/* Past weeks, most recent first */}
              {pastWeeks.map(week => (
                <WeekSection key={week} week={week} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Collapsible: full remaining schedule */}
      {futureWeeks.length > 1 && (
        <div className="mt-4">
          <button
            onClick={() => setScheduleOpen(o => !o)}
            className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 transition mb-6"
          >
            <span
              className={`inline-block transition-transform duration-200 ${scheduleOpen ? 'rotate-90' : ''}`}
            >
              ▶
            </span>
            {scheduleOpen ? 'Hide' : 'Show'} full schedule
            <span className="text-gray-400 font-normal">
              ({futureWeeks.length} weeks remaining)
            </span>
          </button>

          {scheduleOpen && (
            <div>
              {selectedTeamId !== null ? (
                // Team filtered: flat wrapping row, week label already in each card header
                <div className="flex flex-wrap justify-center gap-4">
                  {futureWeeks.flatMap(week =>
                    filterMatchups(matchupsByWeek[week] ?? []).map(matchup => (
                      <Link key={matchup.id} href={matchupHref(matchup)} className="flex-1 min-w-[220px] max-w-[320px] block hover:no-underline">
                        <MatchupCard matchup={matchup} teams={teams} />
                      </Link>
                    ))
                  )}
                </div>
              ) : (
                futureWeeks.map(week => (
                  <WeekSection key={week} week={week} />
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
