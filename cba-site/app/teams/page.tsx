import Header from '@/components/Header';
import HeroHelmets from '@/components/HeroHelmets';
import Link from 'next/link';
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
        {/* Memorial link for the defunct Dinwiddie Dinos */}
        <div className="mt-10 pt-8 border-t border-sky-200">
          <Link
            href="/dinos"
            className="flex items-center gap-4 bg-white rounded-xl border border-stone-200 px-6 py-4 shadow-sm hover:bg-stone-50 transition group w-fit"
          >
            <div className="text-stone-400 text-2xl leading-none">†</div>
            <div>
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-0.5">In Memoriam</p>
              <p className="font-semibold text-stone-700 group-hover:text-stone-900 transition">Dinwiddie Dinos (2022–2024)</p>
              <p className="text-xs text-stone-400">Andrew Sharpe · 2023 Champions <span className="text-red-400">(vacated)</span></p>
            </div>
            <span className="ml-2 text-stone-300 group-hover:text-stone-500 transition text-sm">→</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
