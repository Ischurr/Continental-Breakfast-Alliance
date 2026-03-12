'use client';

import { useState } from 'react';
import MatchupCard from '@/components/MatchupCard';
import { Matchup, Team } from '@/lib/types';

interface Props {
  matchupsByWeek: Record<number, Matchup[]>;
  weeks: number[];
  teams: Team[];
  currentWeek: number;
  nextWeek: number | null;
}

export default function MatchupsClient({ matchupsByWeek, weeks, teams, currentWeek, nextWeek }: Props) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  const pastWeeks = weeks.filter(w => w < currentWeek).sort((a, b) => b - a);
  const futureWeeks = weeks.filter(w => w > currentWeek).sort((a, b) => a - b);

  function filterMatchups(matchups: Matchup[]) {
    if (selectedTeamId === null) return matchups;
    return matchups.filter(
      m => m.home.teamId === selectedTeamId || m.away.teamId === selectedTeamId
    );
  }

  function WeekSection({ week, label }: { week: number; label?: string }) {
    const filtered = filterMatchups(matchupsByWeek[week] ?? []);
    if (filtered.length === 0) return null;
    return (
      <div className="mb-8">
        <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
          <span className="bg-teal-600 text-white text-sm px-3 py-1 rounded-full">
            {label ?? `Week ${week}`}
          </span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(matchup => (
            <MatchupCard key={matchup.id} matchup={matchup} teams={teams} />
          ))}
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
                      <div key={matchup.id} className="flex-1 min-w-[220px] max-w-[320px]">
                        <MatchupCard matchup={matchup} teams={teams} />
                      </div>
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
