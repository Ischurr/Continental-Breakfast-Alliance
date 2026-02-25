'use client';

import { useState } from 'react';
import Image from 'next/image';

interface FreeAgent {
  playerId: string;
  playerName: string;
  position: string;
  totalPoints: number;
  photoUrl: string;
  percentOwned: number;
}

interface Props {
  pitchers: FreeAgent[];
  batters: FreeAgent[];
  fetchedAt: string;
  statSeason: number | null;
}

const PITCHER_POSITIONS = ['SP', 'RP'];
const BATTER_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'OF', 'DH'];

function PlayerTable({ players, positionOptions }: { players: FreeAgent[]; positionOptions: string[] }) {
  const [posFilter, setPosFilter] = useState('All');

  const filtered = posFilter === 'All' ? players : players.filter(p => p.position === posFilter);

  return (
    <div>
      {/* Position filter pills */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {['All', ...positionOptions].map(pos => (
          <button
            key={pos}
            onClick={() => setPosFilter(pos)}
            className={`text-xs px-3 py-1 rounded-full font-semibold transition ${
              posFilter === pos
                ? 'bg-teal-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-teal-400 hover:text-teal-600'
            }`}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* Scrollable table */}
      <div className="overflow-y-auto rounded-xl border border-gray-200 shadow-sm" style={{ maxHeight: '486px' }}>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-800 text-white sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2.5 text-left w-8">#</th>
              <th className="px-3 py-2.5 text-left">Player</th>
              <th className="px-3 py-2.5 text-left w-12">Pos</th>
              <th className="px-3 py-2.5 text-right w-20">Pts</th>
              <th className="px-3 py-2.5 text-right w-16">Own%</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {filtered.slice(0, 50).map((p, i) => (
              <tr key={p.playerId} className="hover:bg-sky-50 transition">
                <td className="px-3 py-2 text-gray-300 text-xs">{i + 1}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Image
                      src={p.photoUrl}
                      alt={p.playerName}
                      width={28}
                      height={28}
                      className="rounded-full object-cover bg-gray-100 flex-shrink-0"
                      unoptimized
                      onError={() => {}}
                    />
                    <span className="font-medium text-gray-800">{p.playerName}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-gray-500 text-xs font-semibold">{p.position}</td>
                <td className="px-3 py-2 text-right font-bold text-teal-600">
                  {Math.round(p.totalPoints).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right text-gray-400 text-xs">
                  {p.percentOwned.toFixed(1)}%
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-400 text-sm">
                  No players found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FreeAgentsTable({ pitchers, batters, fetchedAt, statSeason }: Props) {
  const date = new Date(fetchedAt);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const currentYear = new Date().getFullYear();
  const isPreseason = statSeason !== null && statSeason < currentYear;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Top Free Agents</h2>
        <span className="text-xs text-gray-400">Updated {dateStr}</span>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Highest-scoring available players not rostered by any team.{' '}
        {isPreseason
          ? <span className="text-orange-500 font-medium">Showing {statSeason} stats — {currentYear} season not yet started.</span>
          : 'Sorted by fantasy points this season.'}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
            <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full uppercase tracking-wide">Pitchers</span>
          </h3>
          <PlayerTable players={pitchers} positionOptions={PITCHER_POSITIONS} />
        </div>
        <div>
          <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
            <span className="text-xs font-semibold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full uppercase tracking-wide">Position Players</span>
          </h3>
          <PlayerTable players={batters} positionOptions={BATTER_POSITIONS} />
        </div>
      </div>
    </div>
  );
}
