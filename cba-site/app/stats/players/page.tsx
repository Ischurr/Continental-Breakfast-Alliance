import Header from '@/components/Header';
import { getAllSeasons, getCurrentSeason } from '@/lib/data-processor';
import Image from 'next/image';
import Link from 'next/link';
import FreeAgentsTable from '@/components/FreeAgentsTable';
import BaseballFieldLeaders from '@/components/BaseballFieldLeaders';
import freeAgentsData from '@/data/current/free-agents.json';
import {
  getBattingAvgLeaders,
  getHitsLeaders,
  getHomeRunLeaders,
  getStolenBaseLeaders,
  getEraLeaders,
  getSavesLeaders,
  getStrikeoutLeaders,
  getWhipLeaders,
} from '@/lib/mlb-stats';
import MlbStatsGrid from '@/components/MlbStatsGrid';
import ProjectedPointsTable from '@/components/ProjectedPointsTable';
import fs from 'fs';
import path from 'path';

interface ProjectionRow {
  'Player Name': string;
  'MLBAM ID': number;
  Team: string;
  Position: string;
  Age: number;
  'Projected PA': number;
  WeightedBase: number;
  AgeMod: number;
  ParkFactor: number;
  PlayingTimeMod: number;
  xwOBA_Adjustment: number;
  SpeedBonus: number;
  ProjectedFP: number;
  FP_MostRecentYear: number;
  Projection_vs_MostRecent: number;
  Percentile: number;
}

function loadProjectionsCsv(): ProjectionRow[] {
  const year = new Date().getMonth() >= 10
    ? new Date().getFullYear() + 1
    : new Date().getFullYear();
  const csvPath = path.join(process.cwd(), 'scripts', `fantasy_projections_${year}.csv`);
  if (!fs.existsSync(csvPath)) return [];
  try {
    const raw = fs.readFileSync(csvPath, 'utf-8');
    const [header, ...rows] = raw.trim().split('\n');
    const cols = header.split(',');
    return rows.map(line => {
      const vals = line.split(',');
      const obj: Record<string, string | number> = {};
      cols.forEach((c, i) => {
        const v = vals[i]?.trim() ?? '';
        obj[c] = isNaN(Number(v)) || v === '' ? v : Number(v);
      });
      return obj as unknown as ProjectionRow;
    });
  } catch {
    return [];
  }
}


export default async function PlayerStatsPage() {
  const seasons = getAllSeasons();
  const currentSeason = getCurrentSeason();

  // Build a flat list of all rostered players with their team
  const allPlayers = (currentSeason.rosters ?? []).flatMap(roster => {
    const team = currentSeason.teams.find(t => t.id === roster.teamId);
    return roster.players.map(p => ({ ...p, teamId: roster.teamId, teamName: team?.name ?? '—' }));
  });

  // Free agents data
  const freeAgents = freeAgentsData.players ?? [];
  const faPitchers = freeAgents.filter((p: { position: string }) => p.position === 'SP' || p.position === 'RP');
  const faBatters = freeAgents.filter((p: { position: string }) => p.position !== 'SP' && p.position !== 'RP');
  const hasFreeAgents = freeAgents.length > 0;

  // Top 25 overall rostered players
  const top25 = [...allPlayers]
    .filter(p => p.totalPoints > 0)
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, 25);

  // Expected fantasy points — use projections CSV if available, else fall back to ESPN 2025 data
  const rawProjections = loadProjectionsCsv();

  // Merge duplicate rows for the same player (two-way players like Ohtani appear as TWP + SP).
  // Sum ProjectedFP and FP_MostRecentYear; keep the non-pitcher position label.
  const projectionsData = (() => {
    const map = new Map<string, ProjectionRow>();
    for (const row of rawProjections) {
      const existing = map.get(row['Player Name']);
      if (existing) {
        existing.ProjectedFP += row.ProjectedFP;
        existing.FP_MostRecentYear += row.FP_MostRecentYear;
        if (row.Position !== 'SP' && row.Position !== 'RP' && row.Position !== 'nan') {
          existing.Position = row.Position;
        }
      } else {
        map.set(row['Player Name'], { ...row });
      }
    }
    // Recalculate delta% after merging
    for (const row of map.values()) {
      row.Projection_vs_MostRecent = row.FP_MostRecentYear > 0
        ? ((row.ProjectedFP - row.FP_MostRecentYear) / row.FP_MostRecentYear) * 100
        : 0;
    }
    return [...map.values()];
  })();

  const hasProjections = projectionsData.length > 0;
  // Projection year matches the CSV filename logic (same as generate_projections.py)
  const projectionYear = new Date().getMonth() >= 10
    ? new Date().getFullYear() + 1
    : new Date().getFullYear();

  const faNameSet = new Set(freeAgents.map((p: { playerName: string }) => p.playerName));

  // Build name → position lookup from ESPN roster + FA data
  const positionByName: Record<string, string> = {};
  for (const p of allPlayers) positionByName[p.playerName] = p.position;
  for (const p of freeAgents as { playerName: string; position: string }[]) {
    if (!positionByName[p.playerName]) positionByName[p.playerName] = p.position;
  }

  const allCombined = hasProjections
    ? projectionsData.map(p => ({
        playerName: p['Player Name'],
        position: (p.Position && p.Position !== 'nan') ? p.Position : (positionByName[p['Player Name']] || '—'),
        totalPoints: p.ProjectedFP,
        actualPoints: p.FP_MostRecentYear,
        delta: p.Projection_vs_MostRecent,
        source: faNameSet.has(p['Player Name']) ? 'FA' as const : 'Rostered' as const,
        isProjection: true as const,
      }))
    : [
        ...allPlayers.map(p => ({ playerName: p.playerName, position: p.position, totalPoints: p.totalPoints, actualPoints: p.totalPoints, delta: null, source: 'Rostered' as const, isProjection: false as const })),
        ...freeAgents.map((p: { playerName: string; position: string; totalPoints: number }) => ({ playerName: p.playerName, position: p.position, totalPoints: p.totalPoints, actualPoints: p.totalPoints, delta: null, source: 'FA' as const, isProjection: false as const })),
      ]
        .filter(p => p.totalPoints > 0)
        .sort((a, b) => b.totalPoints - a.totalPoints);

  // Fetch MLB Stats API data in parallel
  const [baLeaders, hitsLeaders, hrLeaders, sbLeaders, eraLeaders, savesLeaders, kLeaders, whipLeaders] =
    await Promise.all([
      getBattingAvgLeaders(2025, 100),
      getHitsLeaders(2025, 100),
      getHomeRunLeaders(2025, 100),
      getStolenBaseLeaders(2025, 100),
      getEraLeaders(2025, 100),
      getSavesLeaders(2025, 100),
      getStrikeoutLeaders(2025, 100),
      getWhipLeaders(2025, 100),
    ]);

  return (
    <div className="min-h-screen bg-sky-50">
      <Header />

      <main className="container mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-2">Player Stats</h1>
        <p className="text-gray-500 mb-10">{currentSeason.year} Season &mdash; Top Individual Performances</p>

        {allPlayers.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border p-10 text-center">
            <div className="text-5xl mb-4">⚾</div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">No Player Data Yet</h2>
            <p className="text-gray-500 text-sm">Roster data hasn&apos;t been loaded for this season.</p>
          </div>
        ) : (
          <>
            {/* Position Leaders — Baseball Field */}
            <h2 className="text-2xl font-bold mb-4">Position Leaders</h2>
            <div className="mb-12">
              <BaseballFieldLeaders rosteredPlayers={allPlayers} freeAgents={freeAgents} />
            </div>

            {/* Top 25 Overall */}
            <h2 className="text-2xl font-bold mb-4">Top 25 Overall</h2>
            <div className="rounded-xl shadow-sm border overflow-hidden mb-12">
              <div className="overflow-y-auto" style={{ maxHeight: '530px' }}>
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-800 text-white sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left w-10">#</th>
                      <th className="px-4 py-3 text-left">Player</th>
                      <th className="px-4 py-3 text-left">Pos</th>
                      <th className="px-4 py-3 text-left">Team</th>
                      <th className="px-4 py-3 text-right">Fantasy Pts</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {top25.map((p, i) => (
                      <tr key={p.playerId} className="border-b hover:bg-sky-50 transition">
                        <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {p.photoUrl && (
                              <Image
                                src={p.photoUrl}
                                alt={p.playerName}
                                width={36}
                                height={36}
                                className="rounded-full object-cover bg-gray-100 flex-shrink-0"
                                unoptimized
                              />
                            )}
                            <span className="font-medium">{p.playerName}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{p.position}</td>
                        <td className="px-4 py-3">
                          <Link href={`/teams/${p.teamId}`} className="hover:text-teal-600 transition">
                            {p.teamName}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-teal-600">
                          {Math.round(p.totalPoints).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Free Agents */}
            {hasFreeAgents ? (
              <div className="mb-12">
                <FreeAgentsTable
                  pitchers={faPitchers}
                  batters={faBatters}
                  fetchedAt={freeAgentsData.fetchedAt}
                  statSeason={(freeAgentsData as { statSeason?: number }).statSeason ?? null}
                />
              </div>
            ) : (
              <div className="mb-12 bg-white rounded-xl border border-dashed border-gray-200 p-8 text-center">
                <p className="text-gray-400 text-sm font-medium">Free agent data not yet loaded</p>
                <p className="text-gray-300 text-xs mt-1">Run <code className="bg-gray-100 px-1.5 py-0.5 rounded">npm run fetch-free-agents</code> to populate this section</p>
              </div>
            )}

            {/* ── Projections / MLB Stats ───────────────────────────────── */}
            <h2 className="text-2xl font-bold mb-1">
              {hasProjections ? `${projectionYear} Fantasy Projections` : '2025 MLB Stats'}
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              {hasProjections
                ? 'Model-based projections using weighted 3-year history, age curves, park factors, Statcast xwOBA, and sprint speed.'
                : 'Real MLB stats from last season — the best predictor for 2026 fantasy performance.'}
            </p>

            <ProjectedPointsTable
              players={allCombined}
              isProjection={hasProjections}
              targetYear={projectionYear}
              recentYear={projectionYear - 1}
            />

            <MlbStatsGrid
              baLeaders={baLeaders}
              hitsLeaders={hitsLeaders}
              hrLeaders={hrLeaders}
              sbLeaders={sbLeaders}
              eraLeaders={eraLeaders}
              savesLeaders={savesLeaders}
              kLeaders={kLeaders}
              whipLeaders={whipLeaders}
              freeAgentNames={freeAgents.map((p: { playerName: string }) => p.playerName)}
            />
          </>
        )}
      </main>
    </div>
  );
}
