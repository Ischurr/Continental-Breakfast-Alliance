import Header from '@/components/Header';
import MatchupsClient from '@/components/MatchupsClient';
import { getAllSeasons, getCurrentSeason } from '@/lib/data-processor';
import { getWinProbability } from '@/lib/store';
import type { WinProbabilityStore } from '@/lib/fantasy/nightlyJob';

export default async function MatchupsPage() {
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

  // Determine the "current" week: last week with any scoring activity, else week 1
  const currentWeek = (() => {
    const active = weeks.find(w =>
      matchupsByWeek[w].some(
        m => m.winner !== undefined || m.home.totalPoints > 0 || m.away.totalPoints > 0
      )
    );
    return active ?? (weeks.length > 0 ? weeks[weeks.length - 1] : 1); // earliest week if nothing started
  })();

  // Next scheduled week (one after current)
  const allWeeksSorted = [...weeks].sort((a, b) => a - b);
  const nextWeek = allWeeksSorted.find(w => w > currentWeek) ?? null;

  // Win probability: build teamId → win% map for current week
  const winProbRaw = await getWinProbability() as WinProbabilityStore | null;
  const winProbByTeamId: Record<number, number> = {};
  if (winProbRaw?.matchups) {
    for (const m of winProbRaw.matchups) {
      winProbByTeamId[Number(m.homeTeamId)] = m.homeWinPct;
      winProbByTeamId[Number(m.awayTeamId)] = m.awayWinPct;
    }
  }

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
          <MatchupsClient
            matchupsByWeek={matchupsByWeek}
            weeks={weeks}
            teams={currentSeason.teams}
            currentWeek={currentWeek}
            nextWeek={nextWeek}
            winProbByTeamId={winProbByTeamId}
          />
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

              // Apply vacated championship override (2023: Dinos → Mega Rats)
              const VACATED: Record<number, number> = { 2023: 4 };
              const championId = VACATED[season.year] ?? season.champion;

              // Find regular season winner (best record, tiebreak by PF; exclude Dinos id=10 in 2024)
              const eligibleStandings = season.standings.filter(
                s => !(season.year === 2024 && s.teamId === 10)
              );
              const regularSeasonWinner = eligibleStandings.reduce((best, s) =>
                s.wins > best.wins || (s.wins === best.wins && s.pointsFor > best.pointsFor) ? s : best
              , eligibleStandings[0]);
              const regularSeasonTeam = season.teams.find(t => t.id === regularSeasonWinner?.teamId);
              const isSameAsChampion = regularSeasonWinner?.teamId === championId;

              return (
                <div key={season.year} className="bg-white rounded-xl p-6 shadow-sm border">
                  <h3 className="text-lg font-bold mb-2">{season.year} Season</h3>
                  <p className="text-sm text-gray-500 mb-3">
                    {season.matchups.length} matchups &bull; {totalWeeks} weeks
                  </p>
                  <div className="text-sm text-gray-600 mb-1">
                    Champion:{' '}
                    <span className="font-semibold">
                      {season.teams.find(t => t.id === championId)?.name ?? 'TBD'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    Regular Season:{' '}
                    <span className="font-semibold text-gray-600">
                      {!championId
                        ? 'TBD'
                        : isSameAsChampion
                        ? season.teams.find(t => t.id === championId)?.name ?? 'TBD'
                        : regularSeasonTeam?.name ?? 'TBD'}
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
