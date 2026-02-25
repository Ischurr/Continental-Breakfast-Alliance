import Header from '@/components/Header';
import StandingsTable from '@/components/StandingsTable';
import { getAllSeasons, getCurrentSeason } from '@/lib/data-processor';
import Link from 'next/link';

export default function StandingsPage() {
  const seasons = getAllSeasons();
  const currentSeason = getCurrentSeason();

  // Sort standings by wins desc, then points for tie-break
  const sortedStandings = [...currentSeason.standings].sort(
    (a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor
  );

  return (
    <div className="min-h-screen bg-sky-50">
      <Header />

      <main className="container mx-auto px-4 py-12">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-1">Standings</h1>
            <p className="text-gray-500">{currentSeason.year} Season</p>
          </div>
          <Link
            href="/standings/all-time"
            className="mt-4 md:mt-0 text-sm text-teal-600 hover:text-teal-800 font-medium"
          >
            View All-Time Standings →
          </Link>
        </div>

        <div className="flex flex-wrap gap-4 mb-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-400"></div>
            <span className="text-gray-600">Playoff berth (Top 4)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-400"></div>
            <span className="text-gray-600">Saccko bracket (Bottom 2)</span>
          </div>
        </div>

        <StandingsTable
          standings={sortedStandings}
          teams={currentSeason.teams}
          showPlayoffLine
          playoffCount={4}
          loserCount={2}
        />

        {/* Year selector */}
        <div className="mt-10">
          <h2 className="text-lg font-bold mb-4 text-gray-700">Past Seasons</h2>
          <div className="flex gap-3 flex-wrap">
            {seasons.map(season => (
              <Link
                key={season.year}
                href={`/history#${season.year}`}
                className="bg-white border rounded-lg px-5 py-3 text-sm font-medium hover:border-teal-400 hover:text-teal-600 transition shadow-sm"
              >
                {season.year}
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
