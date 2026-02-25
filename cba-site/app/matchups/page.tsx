import Header from '@/components/Header';
import MatchupCard from '@/components/MatchupCard';
import { getAllSeasons, getCurrentSeason } from '@/lib/data-processor';

export default function MatchupsPage() {
  const seasons = getAllSeasons();
  const currentSeason = getCurrentSeason();

  // Group matchups by week
  const matchupsByWeek = currentSeason.matchups.reduce<Record<number, typeof currentSeason.matchups>>(
    (acc, matchup) => {
      if (!acc[matchup.week]) acc[matchup.week] = [];
      acc[matchup.week].push(matchup);
      return acc;
    },
    {}
  );

  const weeks = Object.keys(matchupsByWeek)
    .map(Number)
    .sort((a, b) => b - a); // Most recent first

  return (
    <div className="min-h-screen bg-sky-50">
      <Header />

      <main className="container mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-2">Matchups</h1>
        <p className="text-gray-500 mb-10">{currentSeason.year} Season &mdash; Week by Week</p>

        {weeks.length === 0 ? (
          <div className="bg-white rounded-xl p-10 text-center shadow-sm border">
            <p className="text-gray-400 text-lg">No matchup data available yet.</p>
            <p className="text-gray-400 text-sm mt-2">Run the data fetch script to populate matchup history.</p>
          </div>
        ) : (
          weeks.map(week => (
            <div key={week} className="mb-10">
              <h2 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
                <span className="bg-teal-600 text-white text-sm px-3 py-1 rounded-full">
                  Week {week}
                </span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {matchupsByWeek[week].map(matchup => (
                  <MatchupCard
                    key={matchup.id}
                    matchup={matchup}
                    teams={currentSeason.teams}
                  />
                ))}
              </div>
            </div>
          ))
        )}

        {/* Historical seasons */}
        <div className="mt-12 border-t pt-10">
          <h2 className="text-xl font-bold mb-6">Browse by Season</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {seasons.map(season => {
              const seasonMatchupsByWeek = season.matchups.reduce<Record<number, number>>(
                (acc, m) => {
                  acc[m.week] = (acc[m.week] ?? 0) + 1;
                  return acc;
                },
                {}
              );
              const totalWeeks = Object.keys(seasonMatchupsByWeek).length;

              return (
                <div key={season.year} className="bg-white rounded-xl p-6 shadow-sm border">
                  <h3 className="text-lg font-bold mb-2">{season.year} Season</h3>
                  <p className="text-sm text-gray-500 mb-3">
                    {season.matchups.length} matchups &bull; {totalWeeks} weeks
                  </p>
                  <div className="text-sm text-gray-600">
                    Champion:{' '}
                    <span className="font-semibold">
                      {season.teams.find(t => t.id === season.champion)?.name ?? 'TBD'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
