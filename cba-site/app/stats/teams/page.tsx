import Header from '@/components/Header';
import { getAllSeasons, getCurrentSeason, calculateAllTimeStandings, getBiggestWins, getHighestScores, getTeamHeadToHead } from '@/lib/data-processor';

export default function TeamStatsPage() {
  const seasons = getAllSeasons();
  const currentSeason = getCurrentSeason();
  const allTimeStandings = calculateAllTimeStandings();
  const biggestWins = getBiggestWins(10);
  const highestScores = getHighestScores(10);

  const getTeamName = (teamId: number) =>
    currentSeason.teams.find(t => t.id === teamId)?.name ?? `Team ${teamId}`;

  return (
    <div className="min-h-screen bg-sky-50">
      <Header />

      <main className="container mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-2">Team Stats</h1>
        <p className="text-gray-500 mb-10">Historical records, rivalries, and memorable moments</p>

        {/* Leader cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-12">
          {(() => {
            const mostWins = [...allTimeStandings].sort((a, b) => b.totalWins - a.totalWins)[0];
            const mostPF = [...allTimeStandings].sort((a, b) => b.totalPointsFor - a.totalPointsFor)[0];
            const mostChamp = [...allTimeStandings].sort((a, b) => b.championships - a.championships)[0];
            const mostLoser = [...allTimeStandings].sort((a, b) => b.loserBracketAppearances - a.loserBracketAppearances)[0];
            return [
              { label: 'Most All-Time Wins', team: mostWins, stat: `${mostWins?.totalWins} wins` },
              { label: 'Most Points Scored', team: mostPF, stat: `${mostPF?.totalPointsFor.toFixed(0)} pts` },
              { label: 'Most Championships', team: mostChamp, stat: `${mostChamp?.championships} titles` },
              { label: 'Most Saccko Finishes', team: mostLoser, stat: `${mostLoser?.loserBracketAppearances}x Saccko` },
            ];
          })().map(({ label, team, stat }) => (
            <div key={label} className="bg-white rounded-xl p-6 shadow-sm border">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{label}</p>
              <p className="text-xl font-bold text-gray-800">{getTeamName(team?.teamId)}</p>
              <p className="text-teal-600 font-semibold text-sm mt-1">{stat}</p>
            </div>
          ))}
        </div>

        {/* Biggest wins */}
        <h2 className="text-2xl font-bold mb-5">Biggest Blowouts</h2>
        {biggestWins.length > 0 ? (
          <div className="overflow-x-auto mb-12">
            <table className="min-w-full bg-white shadow-md rounded-lg overflow-hidden">
              <thead className="bg-gray-800 text-white text-sm">
                <tr>
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Winner</th>
                  <th className="px-4 py-3 text-left">Loser</th>
                  <th className="px-4 py-3 text-center">Season</th>
                  <th className="px-4 py-3 text-center">Week</th>
                  <th className="px-4 py-3 text-right">Score</th>
                  <th className="px-4 py-3 text-right">Margin</th>
                </tr>
              </thead>
              <tbody>
                {biggestWins.map((win, i) => (
                  <tr key={`${win.year}-${win.week}-${win.winnerId}`} className="border-b hover:bg-sky-50 text-sm">
                    <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-green-700">{getTeamName(win.winnerId)}</td>
                    <td className="px-4 py-3 text-gray-600">{getTeamName(win.loserId)}</td>
                    <td className="px-4 py-3 text-center text-gray-500">{win.year}</td>
                    <td className="px-4 py-3 text-center text-gray-500">Wk {win.week}</td>
                    <td className="px-4 py-3 text-right">
                      {win.winnerPoints.toFixed(1)} - {win.loserPoints.toFixed(1)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-teal-600">
                      +{win.margin.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-sm mb-12">No matchup data available yet.</p>
        )}

        {/* Highest scores */}
        <h2 className="text-2xl font-bold mb-5">All-Time High Scores</h2>
        {highestScores.length > 0 ? (
          <div className="overflow-x-auto mb-12">
            <table className="min-w-full bg-white shadow-md rounded-lg overflow-hidden">
              <thead className="bg-gray-800 text-white text-sm">
                <tr>
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Team</th>
                  <th className="px-4 py-3 text-center">Season</th>
                  <th className="px-4 py-3 text-center">Week</th>
                  <th className="px-4 py-3 text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {highestScores.map((score, i) => (
                  <tr key={`${score.teamId}-${score.year}-${score.week}`} className="border-b hover:bg-sky-50 text-sm">
                    <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3 font-medium">{getTeamName(score.teamId)}</td>
                    <td className="px-4 py-3 text-center text-gray-500">{score.year}</td>
                    <td className="px-4 py-3 text-center text-gray-500">Wk {score.week}</td>
                    <td className="px-4 py-3 text-right font-bold text-teal-600">{score.points.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-400 text-sm mb-12">No matchup data available yet.</p>
        )}

        {/* All-time scoring leaders */}
        <h2 className="text-2xl font-bold mb-5">All-Time Scoring Leaders</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white shadow-md rounded-lg overflow-hidden">
            <thead className="bg-gray-800 text-white text-sm">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Team</th>
                <th className="px-4 py-3 text-right">Total PF</th>
                <th className="px-4 py-3 text-right">Total PA</th>
                <th className="px-4 py-3 text-right">Diff</th>
                <th className="px-4 py-3 text-center">Saccko</th>
              </tr>
            </thead>
            <tbody>
              {[...allTimeStandings]
                .sort((a, b) => b.totalPointsFor - a.totalPointsFor)
                .map((team, i) => {
                  const paData = seasons.reduce((sum, season) => {
                    const standing = season.standings.find(s => s.teamId === team.teamId);
                    return sum + (standing?.pointsAgainst ?? 0);
                  }, 0);
                  const scoreDiff = team.totalPointsFor - paData;

                  return (
                    <tr key={team.teamId} className="border-b hover:bg-sky-50 text-sm">
                      <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                      <td className="px-4 py-3 font-medium">{getTeamName(team.teamId)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-teal-600">
                        {team.totalPointsFor.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">{paData.toFixed(1)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${scoreDiff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {scoreDiff >= 0 ? '+' : ''}{scoreDiff.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {team.loserBracketAppearances > 0
                          ? <span className="text-red-500 font-semibold">{team.loserBracketAppearances}x</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
