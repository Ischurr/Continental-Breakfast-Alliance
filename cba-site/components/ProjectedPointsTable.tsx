'use client';

import { useState, useMemo } from 'react';

export interface ProjectedPlayer {
  playerName: string;
  position: string;
  totalPoints: number;
  actualPoints: number;
  delta: number | null;
  source: 'Rostered' | 'FA';
  isProjection: boolean;
}

// Normalize ESPN positions → display buckets
function normalizePos(pos: string): string {
  if (['LF', 'CF', 'RF'].includes(pos)) return 'OF';
  return pos;
}

const BATTER_POSITIONS  = ['C', '1B', '2B', '3B', 'SS', 'OF', 'DH'];
const PITCHER_POSITIONS = ['SP', 'RP'];
const ALL_POSITIONS     = ['All', ...BATTER_POSITIONS, ...PITCHER_POSITIONS];

interface Props {
  players: ProjectedPlayer[];
  isProjection: boolean;
  targetYear: number;
  recentYear: number;
}

export default function ProjectedPointsTable({ players, isProjection, targetYear, recentYear }: Props) {
  const [faOnly, setFaOnly]   = useState(false);
  const [posFilter, setPosFilter] = useState('All');

  const filtered = useMemo(() => {
    return players.filter(p => {
      if (faOnly && p.source !== 'FA') return false;
      if (posFilter !== 'All' && normalizePos(p.position) !== posFilter) return false;
      return true;
    });
  }, [players, faOnly, posFilter]);

  return (
    <div className="mb-8">
      {/* ── Heading row with FA toggle ── */}
      <div className="flex items-center justify-between mb-3 gap-4 flex-wrap">
        <h3 className="text-lg font-bold text-gray-700">
          {isProjection ? 'Projected Fantasy Points' : 'Expected Fantasy Points'}
        </h3>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-semibold flex-shrink-0">
          <button
            onClick={() => setFaOnly(false)}
            className={`px-4 py-1.5 transition ${!faOnly ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            All Players
          </button>
          <button
            onClick={() => setFaOnly(true)}
            className={`px-4 py-1.5 transition ${faOnly ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            Free Agents
          </button>
        </div>
      </div>

      {/* ── Sidebar + Table ── */}
      <div className="flex gap-3 items-start">

        {/* Position sidebar */}
        <div className="flex flex-col gap-1 flex-shrink-0 w-14">
          {ALL_POSITIONS.map(pos => (
            <button
              key={pos}
              onClick={() => setPosFilter(pos)}
              className={`text-xs font-semibold px-2 py-1.5 rounded-lg text-center transition ${
                posFilter === pos
                  ? 'bg-gray-800 text-white'
                  : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="flex-1 min-w-0 bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-y-auto" style={{ maxHeight: '400px' }}>
            <table className="min-w-full text-sm">
              <thead className="bg-gray-800 text-white sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-left w-8">#</th>
                  <th className="px-4 py-2.5 text-left">Player</th>
                  <th className="px-4 py-2.5 text-left w-12">Pos</th>
                  <th className="px-4 py-2.5 text-center w-20">Status</th>
                  {isProjection && <th className="px-4 py-2.5 text-right w-24">{recentYear} Actual</th>}
                  {isProjection && <th className="px-4 py-2.5 text-right w-16">Δ%</th>}
                  <th className="px-4 py-2.5 text-right w-28">
                    {isProjection ? `${targetYear} Proj` : `${recentYear} Pts`}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={isProjection ? 7 : 5} className="px-4 py-8 text-center text-gray-400 text-sm">
                      No players found
                    </td>
                  </tr>
                ) : (
                  filtered.map((p, i) => (
                    <tr key={`${p.playerName}-${i}`} className="hover:bg-sky-50 transition">
                      <td className="px-4 py-2.5 text-gray-300 text-xs">{i + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-800">{p.playerName}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs font-semibold">
                        {normalizePos(p.position)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          p.source === 'FA'
                            ? 'bg-orange-100 text-orange-600'
                            : 'bg-teal-100 text-teal-700'
                        }`}>
                          {p.source === 'FA' ? 'Free Agent' : 'Rostered'}
                        </span>
                      </td>
                      {isProjection && (
                        <td className="px-4 py-2.5 text-right text-gray-400 text-xs">
                          {p.actualPoints != null ? Math.round(p.actualPoints).toLocaleString() : '—'}
                        </td>
                      )}
                      {isProjection && (
                        <td className="px-4 py-2.5 text-right text-xs font-semibold">
                          {p.delta != null ? (
                            <span className={p.delta > 0 ? 'text-green-600' : p.delta < 0 ? 'text-red-500' : 'text-gray-400'}>
                              {p.delta > 0 ? '+' : ''}{p.delta.toFixed(1)}%
                            </span>
                          ) : '—'}
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-right font-bold text-teal-600">
                        {Math.round(p.totalPoints).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
