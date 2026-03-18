import fs from 'fs';
import path from 'path';
import Header from '@/components/Header';
import StandingsTable from '@/components/StandingsTable';
import { getAllSeasons, getCurrentSeason } from '@/lib/data-processor';
import Link from 'next/link';

export default function StandingsPage() {
  const seasons = getAllSeasons();
  const currentSeason = getCurrentSeason();

  // Use projected sort until week 1 is over (i.e. no team has any recorded win/loss yet)
  const seasonStarted = currentSeason.standings.some(s => s.wins > 0 || s.losses > 0);

  // Load projections + keeper data to compute projected team scores pre-season
  // Uses data/projections/2026.json — same source as the team page "Total Projected" number
  let projectedByTeam: Map<number, number> | null = null;
  if (!seasonStarted) {
    try {
      const projPath = path.join(process.cwd(), 'data', 'projections', '2026.json');
      const keepersPath = path.join(process.cwd(), 'data', 'keeper-overrides.json');
      if (fs.existsSync(projPath) && fs.existsSync(keepersPath)) {
        const projRaw = JSON.parse(fs.readFileSync(projPath, 'utf-8'));
        const keeperOverrides: Record<string, string[]> = JSON.parse(fs.readFileSync(keepersPath, 'utf-8'));

        // Same normalize fn as getSuggestedKeepers in data-processor.ts
        const normalize = (name: string) => name.toLowerCase().replace(/[^a-z ]/g, '').trim();

        // Build normalized-name → projectedFP map
        const nameToFP = new Map<string, number>();
        for (const p of (projRaw.players ?? []) as Array<{ playerName: string; projectedFP: number | null }>) {
          if (p.projectedFP !== null) {
            nameToFP.set(normalize(p.playerName), p.projectedFP);
          }
        }

        // Sum projectedFP for each team's keepers (all 6 start — no bench pre-draft)
        projectedByTeam = new Map();
        for (const [teamIdStr, keeperNames] of Object.entries(keeperOverrides)) {
          const teamId = Number(teamIdStr);
          let total = 0;
          for (const name of keeperNames) {
            total += nameToFP.get(normalize(name)) ?? 0;
          }
          projectedByTeam.set(teamId, Math.round(total));
        }
      }
    } catch {
      // Projections not available — fall back to normal sort
    }
  }

  const useProjectedSort = !seasonStarted && projectedByTeam !== null;

  // Sort standings: projected EROSP pre-season, wins/PF once games are played
  const sortedStandings = [...currentSeason.standings].sort((a, b) => {
    if (useProjectedSort) {
      return (projectedByTeam!.get(b.teamId) ?? 0) - (projectedByTeam!.get(a.teamId) ?? 0);
    }
    return b.wins - a.wins || b.pointsFor - a.pointsFor;
  });

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

        {useProjectedSort && (
          <div className="mb-5 flex items-start gap-3 bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 text-sm text-indigo-800">
            <span className="mt-0.5">📊</span>
            <div>
              <span className="font-semibold">Pre-season projected order</span>
              <span className="text-indigo-600"> · Ranked by keeper EROSP (projected full-season startable points). Switches to win-loss standings after Week 1.</span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-4 mb-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-400"></div>
            <span className="text-gray-600">Playoff berth (Top 4)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-400"></div>
            <span className="text-gray-600">Saccko bracket (Bottom 2)</span>
          </div>
          {useProjectedSort && projectedByTeam && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-gray-500 italic">Proj. pts shown in PF column</span>
            </div>
          )}
        </div>

        <StandingsTable
          standings={sortedStandings.map(s =>
            useProjectedSort && projectedByTeam
              ? { ...s, pointsFor: projectedByTeam.get(s.teamId) ?? 0 }
              : s
          )}
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
