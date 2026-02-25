import Header from '@/components/Header';
import { calculateAllTimeStandings, getAllSeasons } from '@/lib/data-processor';
import Link from 'next/link';

export default function AllTimeStandingsPage() {
  const allTimeStandings = calculateAllTimeStandings();
  const seasons = getAllSeasons();
  const allTeams = seasons[seasons.length - 1].teams;

  const getTeamName = (teamId: number) =>
    allTeams.find(t => t.id === teamId)?.name ?? `Team ${teamId}`;

  return (
    <div className="min-h-screen bg-sky-50">
      <Header />

      <main className="container mx-auto px-4 py-12">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-1">All-Time Standings</h1>
            <p className="text-gray-500">
              Franchise records across all {seasons.length} seasons (
              {seasons[0].year}&ndash;{seasons[seasons.length - 1].year})
            </p>
          </div>
          <Link
            href="/standings"
            className="mt-4 md:mt-0 text-sm text-teal-600 hover:text-teal-800 font-medium"
          >
            ← Current Season
          </Link>
        </div>

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
                      <Link
                        href={`/teams/${team.teamId}`}
                        className="font-semibold hover:text-teal-600 transition"
                      >
                        {getTeamName(team.teamId)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-center">{team.totalWins}</td>
                    <td className="px-4 py-3 text-center">{team.totalLosses}</td>
                    <td className="px-4 py-3 text-center">{team.totalTies}</td>
                    <td className="px-4 py-3 text-center">{Math.round(winPct * 100)}%</td>
                    <td className="px-4 py-3 text-center">
                      {team.championships > 0 ? (
                        <span className="font-bold text-yellow-600">
                          {'★'.repeat(team.championships)}
                        </span>
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

        {/* Championship History */}
        <h2 className="text-2xl font-bold mb-6">Championship History</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {seasons.map(season => {
            const champ = season.teams.find(t => t.id === season.champion);
            return (
              <div
                key={season.year}
                className="bg-white p-6 rounded-xl shadow-sm border border-yellow-100"
              >
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
      </main>
    </div>
  );
}
