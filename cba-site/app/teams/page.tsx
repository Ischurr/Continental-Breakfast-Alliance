import Header from '@/components/Header';
import HeroHelmets from '@/components/HeroHelmets';
import TeamCard from '@/components/TeamCard';
import { getAllSeasons, getCurrentSeason, calculateAllTimeStandings } from '@/lib/data-processor';
import teamsMetadata from '@/data/teams.json';

export default function TeamsPage() {
  const seasons = getAllSeasons();
  const currentSeason = getCurrentSeason();
  const allTimeStandings = calculateAllTimeStandings();

  const getMetadata = (teamId: number) =>
    teamsMetadata.teams.find(t => t.id === teamId);

  const getStats = (teamId: number) =>
    allTimeStandings.find(t => t.teamId === teamId);

  return (
    <div className="min-h-screen bg-sky-50">
      <Header />

      {/* Helmet grid hero */}
      <div className="relative h-72 md:h-[480px] bg-slate-900 overflow-hidden">
        <HeroHelmets />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/70 via-slate-900/30 to-transparent" />
        <div className="relative z-10 container mx-auto px-4 pt-10 md:pt-14 text-white">
          <p className="text-teal-300 text-xs font-semibold uppercase tracking-widest mb-2">Continental Breakfast Alliance</p>
          <h1 className="text-3xl md:text-4xl font-bold">All Teams</h1>
        </div>
      </div>

      <main className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {currentSeason.teams.map(team => {
            const meta = getMetadata(team.id);
            const stats = getStats(team.id);

            return (
              <TeamCard
                key={team.id}
                team={team}
                wins={stats?.totalWins}
                losses={stats?.totalLosses}
                championships={stats?.championships}
                primaryColor={meta?.primaryColor}
              />
            );
          })}
        </div>
      </main>
    </div>
  );
}
