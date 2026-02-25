'use client';

import Header from '@/components/Header';
import StandingsTable from '@/components/StandingsTable';
import { getAllSeasons, getCurrentSeason, calculateAllTimeStandings } from '@/lib/data-processor';
import Link from 'next/link';
import { useState } from 'react';

const seasons = getAllSeasons();
const allTimeStandings = calculateAllTimeStandings();
const allTeams = getCurrentSeason().teams;

const getTeamName = (teamId: number) =>
  allTeams.find(t => t.id === teamId)?.name ?? `Team ${teamId}`;

export default function HistoryPage() {
  const [selected, setSelected] = useState<'all-time' | 'every-season' | number>('all-time');

  const selectedSeason = typeof selected === 'number'
    ? seasons.find(s => s.year === selected) ?? null
    : null;

  return (
    <div className="min-h-screen bg-sky-50">
      <Header />

      <main className="container mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-2">League History</h1>
        <p className="text-gray-500 mb-8">All-time records and season-by-season breakdowns</p>

        {/* Selector */}
        <div className="flex flex-wrap gap-2 mb-10">
          {(['all-time', 'every-season'] as const).map(opt => (
            <button
              key={opt}
              onClick={() => setSelected(opt)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition ${
                selected === opt
                  ? 'bg-teal-700 text-white border-teal-700'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-teal-400 hover:text-teal-600'
              }`}
            >
              {opt === 'all-time' ? 'All-Time' : 'Every Season'}
            </button>
          ))}
          <span className="text-gray-300 self-center">|</span>
          {[...seasons].reverse().map(s => (
            <button
              key={s.year}
              onClick={() => setSelected(s.year)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition ${
                selected === s.year
                  ? 'bg-teal-700 text-white border-teal-700'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-teal-400 hover:text-teal-600'
              }`}
            >
              {s.year}
            </button>
          ))}
        </div>

        {/* All-Time View */}
        {selected === 'all-time' && (
          <>
            <div className="overflow-x-auto mb-14">
              <table className="min-w-full bg-white shadow-md rounded-lg overflow-hidden">
                <thead className="bg-gray-800 text-white text-sm">
                  <tr>
                    <th className="px-4 py-3 text-left w-10">#</th>
                    <th className="px-4 py-3 text-left">Team</th>
                    <th className="px-4 py-3 text-center">W</th>
                    <th className="px-4 py-3 text-center">L</th>
                    <th className="px-4 py-3 text-center">T</th>
                    <th className="px-4 py-3 text-center">PCT</th>
                    <th className="px-4 py-3 text-center">Titles</th>
                    <th className="px-4 py-3 text-center">Playoffs</th>
                    <th className="px-4 py-3 text-center">Saccko Finishes</th>
                    <th className="px-4 py-3 text-center">Avg Finish</th>
                    <th className="px-4 py-3 text-right">Total PF</th>
                  </tr>
                </thead>
                <tbody>
                  {allTimeStandings.map((team, index) => {
                    const total = team.totalWins + team.totalLosses + team.totalTies;
                    const winPct = total > 0 ? team.totalWins / total : 0;
                    return (
                      <tr key={team.teamId} className="border-b hover:bg-sky-50 transition text-sm">
                        <td className="px-4 py-3 font-semibold text-gray-500">{index + 1}</td>
                        <td className="px-4 py-3">
                          <Link href={`/teams/${team.teamId}`} className="font-semibold hover:text-teal-600 transition">
                            {getTeamName(team.teamId)}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-center">{team.totalWins}</td>
                        <td className="px-4 py-3 text-center">{team.totalLosses}</td>
                        <td className="px-4 py-3 text-center">{team.totalTies}</td>
                        <td className="px-4 py-3 text-center">{Math.round(winPct * 100)}%</td>
                        <td className="px-4 py-3 text-center">
                          {team.championships > 0 ? (
                            <span className="font-bold text-yellow-600">{'★'.repeat(team.championships)}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">{team.playoffAppearances}</td>
                        <td className="px-4 py-3 text-center text-red-500">
                          {team.loserBracketAppearances > 0 ? team.loserBracketAppearances : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">{team.averageFinish.toFixed(1)}</td>
                        <td className="px-4 py-3 text-right font-medium">
                          {Math.round(team.totalPointsFor).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <h2 className="text-2xl font-bold mb-6">Championship History</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[...seasons].reverse().map(season => {
                const champ = season.teams.find(t => t.id === season.champion);
                return (
                  <div key={season.year} className="bg-white p-6 rounded-xl shadow-sm border border-yellow-100">
                    <div className="text-4xl mb-3">★</div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                      {season.year} Champion
                    </p>
                    <p className="text-xl font-bold text-gray-800">{champ?.name ?? 'TBD'}</p>
                    <p className="text-gray-500 text-sm mt-1">{champ?.owner}</p>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Every Season View */}
        {selected === 'every-season' && [...seasons].reverse().map(season => {
          const sortedStandings = [...season.standings].sort(
            (a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor
          );
          const champion = season.teams.find(t => t.id === season.champion);
          const loserTeams = season.loserBracket.map(id => season.teams.find(t => t.id === id));
          const allScores = season.matchups.flatMap(m => [m.home.totalPoints, m.away.totalPoints]);
          const maxScore = allScores.length ? Math.max(...allScores) : 0;
          const minScore = allScores.length ? Math.min(...allScores) : 0;
          const avgScore = allScores.length ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;

          return (
            <section key={season.year} className="mb-16">
              <div className="bg-gradient-to-r from-teal-700 to-teal-900 text-white rounded-xl p-7 mb-6 shadow">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-3xl font-bold mb-1">{season.year} Season</h2>
                    <p className="text-teal-200 text-sm">
                      {season.teams.length} teams &bull; {season.matchups.length} matchups recorded
                    </p>
                  </div>
                  {champion && (
                    <div className="mt-4 md:mt-0 bg-yellow-400 text-yellow-900 rounded-lg px-5 py-3 text-center">
                      <p className="text-xs font-semibold uppercase tracking-wide">Champion</p>
                      <p className="text-lg font-bold">{champion.name}</p>
                      <p className="text-sm opacity-75">{champion.owner}</p>
                    </div>
                  )}
                </div>
              </div>

              <h3 className="text-lg font-bold mb-4 text-gray-700">Final Standings</h3>
              <StandingsTable
                standings={sortedStandings}
                teams={season.teams}
                showPlayoffLine
                playoffCount={4}
                loserCount={2}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
                <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                  <h4 className="font-semibold text-green-800 mb-3">Playoff Teams</h4>
                  <div className="space-y-2">
                    {season.playoffTeams.map((id, i) => {
                      const team = season.teams.find(t => t.id === id);
                      return (
                        <div key={id} className="flex items-center gap-2">
                          <span className="text-xs text-green-600 font-medium w-5">#{i + 1}</span>
                          <Link href={`/teams/${id}`} className="text-sm font-medium hover:text-teal-600 transition">
                            {team?.name}
                          </Link>
                          {season.champion === id && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">★</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                  <h4 className="font-semibold text-red-700 mb-3">Saccko Bracket</h4>
                  <div className="space-y-2">
                    {loserTeams.map((team, i) => team && (
                      <div key={team.id} className="flex items-center gap-2">
                        <span className="text-xs text-red-400 font-medium w-5">#{i + 1}</span>
                        <Link href={`/teams/${team.id}`} className="text-sm font-medium hover:text-teal-600 transition">
                          {team.name}
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {allScores.length > 0 && (
                <div className="mt-5 grid grid-cols-3 gap-4 text-center">
                  {[
                    { label: 'High Score', value: maxScore.toFixed(1) },
                    { label: 'Low Score', value: minScore.toFixed(1) },
                    { label: 'Avg Score', value: avgScore.toFixed(1) },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white rounded-xl p-4 shadow-sm border">
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">{label}</p>
                      <p className="text-xl font-bold text-teal-600">{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {/* Single Season View */}
        {selectedSeason && (() => {
          const season = selectedSeason;
          const sortedStandings = [...season.standings].sort(
            (a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor
          );
          const champion = season.teams.find(t => t.id === season.champion);
          const loserTeams = season.loserBracket.map(id => season.teams.find(t => t.id === id));
          const allScores = season.matchups.flatMap(m => [m.home.totalPoints, m.away.totalPoints]);
          const maxScore = allScores.length ? Math.max(...allScores) : 0;
          const minScore = allScores.length ? Math.min(...allScores) : 0;
          const avgScore = allScores.length ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;

          return (
            <section>
              <div className="bg-gradient-to-r from-teal-700 to-teal-900 text-white rounded-xl p-7 mb-6 shadow">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-3xl font-bold mb-1">{season.year} Season</h2>
                    <p className="text-teal-200 text-sm">
                      {season.teams.length} teams &bull; {season.matchups.length} matchups recorded
                    </p>
                  </div>
                  {champion && (
                    <div className="mt-4 md:mt-0 bg-yellow-400 text-yellow-900 rounded-lg px-5 py-3 text-center">
                      <p className="text-xs font-semibold uppercase tracking-wide">Champion</p>
                      <p className="text-lg font-bold">{champion.name}</p>
                      <p className="text-sm opacity-75">{champion.owner}</p>
                    </div>
                  )}
                </div>
              </div>

              <h3 className="text-lg font-bold mb-4 text-gray-700">Final Standings</h3>
              <StandingsTable
                standings={sortedStandings}
                teams={season.teams}
                showPlayoffLine
                playoffCount={4}
                loserCount={2}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-6">
                <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                  <h4 className="font-semibold text-green-800 mb-3">Playoff Teams</h4>
                  <div className="space-y-2">
                    {season.playoffTeams.map((id, i) => {
                      const team = season.teams.find(t => t.id === id);
                      return (
                        <div key={id} className="flex items-center gap-2">
                          <span className="text-xs text-green-600 font-medium w-5">#{i + 1}</span>
                          <Link href={`/teams/${id}`} className="text-sm font-medium hover:text-teal-600 transition">
                            {team?.name}
                          </Link>
                          {season.champion === id && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">★</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                  <h4 className="font-semibold text-red-700 mb-3">Saccko Bracket</h4>
                  <div className="space-y-2">
                    {loserTeams.map((team, i) => team && (
                      <div key={team.id} className="flex items-center gap-2">
                        <span className="text-xs text-red-400 font-medium w-5">#{i + 1}</span>
                        <Link href={`/teams/${team.id}`} className="text-sm font-medium hover:text-teal-600 transition">
                          {team.name}
                        </Link>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {allScores.length > 0 && (
                <div className="mt-5 grid grid-cols-3 gap-4 text-center">
                  {[
                    { label: 'High Score', value: maxScore.toFixed(1) },
                    { label: 'Low Score', value: minScore.toFixed(1) },
                    { label: 'Avg Score', value: avgScore.toFixed(1) },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white rounded-xl p-4 shadow-sm border">
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">{label}</p>
                      <p className="text-xl font-bold text-teal-600">{value}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })()}
      </main>
    </div>
  );
}
