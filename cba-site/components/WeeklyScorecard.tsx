'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { WeeklyTeamBreakdown, WeeklyPlayerEntry } from '@/lib/types';

interface Props {
  breakdown: WeeklyTeamBreakdown;
  week: number;
}

const SLOT_COLORS: Record<string, string> = {
  SP: 'bg-indigo-100 text-indigo-700',
  RP: 'bg-purple-100 text-purple-700',
  C: 'bg-blue-100 text-blue-700',
  '1B': 'bg-sky-100 text-sky-700',
  '2B': 'bg-cyan-100 text-cyan-700',
  '3B': 'bg-teal-100 text-teal-700',
  SS: 'bg-emerald-100 text-emerald-700',
  MIF: 'bg-green-100 text-green-700',
  CIF: 'bg-lime-100 text-lime-700',
  OF: 'bg-orange-100 text-orange-700',
  DH: 'bg-rose-100 text-rose-700',
  UTIL: 'bg-pink-100 text-pink-700',
};

function slotColor(slot: string): string {
  return SLOT_COLORS[slot] ?? 'bg-gray-100 text-gray-600';
}

function PlayerRow({ player, isBench }: { player: WeeklyPlayerEntry; isBench: boolean }) {
  const pts = isBench ? player.benchPoints : player.activePoints;
  return (
    <div className={`flex items-center gap-2 py-1.5 px-3 ${isBench ? 'opacity-75' : ''}`}>
      <div className="w-7 h-7 flex-shrink-0">
        {player.photoUrl ? (
          <Image
            src={player.photoUrl}
            alt={player.playerName}
            width={28}
            height={28}
            className="rounded-full object-cover w-7 h-7"
            unoptimized
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-xs">⚾</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm text-gray-800 truncate block">{player.playerName}</span>
      </div>
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${isBench ? 'bg-gray-100 text-gray-500' : slotColor(player.primarySlot)}`}>
        {isBench ? 'BN' : player.primarySlot}
      </span>
      <span className={`text-sm font-bold tabular-nums w-14 text-right flex-shrink-0 ${isBench ? 'text-amber-600' : pts > 0 ? 'text-teal-600' : 'text-gray-400'}`}>
        {pts.toFixed(1)}
      </span>
    </div>
  );
}

export default function WeeklyScorecard({ breakdown, week }: Props) {
  const [showBench, setShowBench] = useState(false);

  const activePlayers = breakdown.players
    .filter(p => p.activeDays > 0)
    .sort((a, b) => b.activePoints - a.activePoints);

  const benchPlayers = breakdown.players
    .filter(p => p.benchDays > 0 && p.activeDays === 0)
    .sort((a, b) => b.benchPoints - a.benchPoints);

  const hasBench = benchPlayers.length > 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">Week {week} Lineup</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            <span className="text-teal-600 font-medium">{breakdown.totalPoints.toFixed(1)} active pts</span>
            {breakdown.benchTotal > 0 && (
              <span className="ml-2 text-amber-500">{breakdown.benchTotal.toFixed(1)} left on bench</span>
            )}
          </p>
        </div>
      </div>

      {/* Active players */}
      <div className="divide-y divide-gray-50">
        {activePlayers.map((p, i) => (
          <PlayerRow key={`${p.playerId}-${i}`} player={p} isBench={false} />
        ))}
      </div>

      {/* Bench toggle */}
      {hasBench && (
        <>
          <button
            onClick={() => setShowBench(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2 bg-amber-50 border-t border-amber-100 hover:bg-amber-100 transition text-xs font-medium text-amber-700"
          >
            <span>🛋️ Bench ({benchPlayers.length} players · {breakdown.benchTotal.toFixed(1)} pts)</span>
            <span>{showBench ? '▲' : '▼'}</span>
          </button>
          {showBench && (
            <div className="divide-y divide-gray-50 bg-amber-50/40">
              {benchPlayers.map((p, i) => (
                <PlayerRow key={`bench-${p.playerId}-${i}`} player={p} isBench={true} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
