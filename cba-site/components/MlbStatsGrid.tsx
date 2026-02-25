'use client';

import { useState, useMemo } from 'react';
import type { MlbStatRow } from '@/lib/mlb-stats';

// ── Stat card ──────────────────────────────────────────────────────────────

function StatLeaderCard({
  title,
  subtitle,
  label,
  rows,
  accentClass = 'text-teal-600',
  faNames,
  faOnly,
}: {
  title: string;
  subtitle?: string;
  label: string;
  rows: MlbStatRow[];
  accentClass?: string;
  faNames: Set<string>;
  faOnly: boolean;
}) {
  const filtered = faOnly
    ? rows.filter(r => faNames.has(r.playerName)).slice(0, 10)
    : rows.slice(0, 10);

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <h3 className="font-bold text-gray-800">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: '320px' }}>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-800 text-white sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left w-8">#</th>
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-3 py-2 text-left text-xs font-normal text-gray-300">Team</th>
              <th className="px-3 py-2 text-right w-16">{label}</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-400 text-xs">
                  {faOnly ? 'No free agents in top 10' : 'Stats unavailable'}
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => (
                <tr key={`${row.playerName}-${row.rank}`} className="hover:bg-sky-50 transition">
                  <td className="px-3 py-2 text-gray-300 text-xs">{faOnly ? i + 1 : row.rank}</td>
                  <td className="px-3 py-2 font-medium text-gray-800 truncate max-w-[140px]">
                    {row.playerName}
                  </td>
                  <td className="px-3 py-2 text-gray-400 text-xs truncate max-w-[100px]">
                    {row.teamName}
                  </td>
                  <td className={`px-3 py-2 text-right font-bold ${accentClass}`}>
                    {row.value}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────

export interface MlbStatsGridProps {
  baLeaders: MlbStatRow[];
  hitsLeaders: MlbStatRow[];
  hrLeaders: MlbStatRow[];
  sbLeaders: MlbStatRow[];
  eraLeaders: MlbStatRow[];
  savesLeaders: MlbStatRow[];
  kLeaders: MlbStatRow[];
  whipLeaders: MlbStatRow[];
  freeAgentNames: string[];
}

export default function MlbStatsGrid({
  baLeaders,
  hitsLeaders,
  hrLeaders,
  sbLeaders,
  eraLeaders,
  savesLeaders,
  kLeaders,
  whipLeaders,
  freeAgentNames,
}: MlbStatsGridProps) {
  const [faOnly, setFaOnly] = useState(false);
  const faNames = useMemo(() => new Set(freeAgentNames), [freeAgentNames]);

  return (
    <div>
      {/* Toggle */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-semibold">
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
            Free Agents Only
          </button>
        </div>
        {faOnly && (
          <span className="text-xs text-orange-500 font-medium">
            Showing only players not rostered by any team
          </span>
        )}
      </div>

      {/* Hitting */}
      <h3 className="text-lg font-bold mb-3 text-gray-700">Hitting</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        <StatLeaderCard title="Batting Average" subtitle="2025 season leaders" label="AVG" rows={baLeaders} accentClass="text-blue-600" faNames={faNames} faOnly={faOnly} />
        <StatLeaderCard title="Hits" subtitle="2025 season leaders" label="H" rows={hitsLeaders} accentClass="text-violet-600" faNames={faNames} faOnly={faOnly} />
        <StatLeaderCard title="Home Runs" subtitle="2025 season leaders" label="HR" rows={hrLeaders} accentClass="text-red-500" faNames={faNames} faOnly={faOnly} />
        <StatLeaderCard title="Stolen Bases" subtitle="Speed &amp; fantasy SB points" label="SB" rows={sbLeaders} accentClass="text-amber-600" faNames={faNames} faOnly={faOnly} />
      </div>

      {/* Pitching */}
      <h3 className="text-lg font-bold mb-3 text-gray-700">Pitching</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <StatLeaderCard title="ERA" subtitle="Lowest ERA (min. innings)" label="ERA" rows={eraLeaders} accentClass="text-green-600" faNames={faNames} faOnly={faOnly} />
        <StatLeaderCard title="Saves" subtitle="2025 season leaders" label="SV" rows={savesLeaders} accentClass="text-teal-600" faNames={faNames} faOnly={faOnly} />
        <StatLeaderCard title="Strikeouts" subtitle="K leaders — SP &amp; RP" label="K" rows={kLeaders} accentClass="text-purple-600" faNames={faNames} faOnly={faOnly} />
        <StatLeaderCard title="WHIP" subtitle="Walks+Hits per inning (low = good)" label="WHIP" rows={whipLeaders} accentClass="text-sky-600" faNames={faNames} faOnly={faOnly} />
      </div>
    </div>
  );
}
