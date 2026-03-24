'use client';

import { useState, useMemo } from 'react';

export interface EROSPPlayer {
  mlbam_id: number;
  espn_id: string;
  name: string;
  position: string;
  mlb_team: string;
  role: string;           // 'H' | 'SP' | 'RP'
  fantasy_team_id: number;
  is_fa: boolean;
  erosp_raw: number;
  erosp_startable: number;
  erosp_per_game: number;
  games_remaining: number;
  start_probability: number;
  cap_factor: number;
  projected_starts?: number;
  fp_per_start?: number;
  rp_role?: string;
}

export interface EROSPMeta {
  generated_at: string;
  season: number;
  games_remaining: number;
  season_started: boolean;
  total_players: number;
}

// Normalize OF variants for display
function normalizePos(pos: string): string {
  if (['LF', 'CF', 'RF'].includes(pos)) return 'OF';
  return pos || '—';
}

const BATTER_POSITIONS  = ['C', '1B', '2B', '3B', 'SS', 'OF', 'DH'];
const PITCHER_POSITIONS = ['SP', 'RP'];
const ALL_POSITIONS     = ['All', ...BATTER_POSITIONS, ...PITCHER_POSITIONS];

type SortCol = 'erosp_startable' | 'erosp_raw' | 'erosp_per_game' | 'name';
type SortDir = 'asc' | 'desc';

interface Props {
  players: EROSPPlayer[];
  meta: EROSPMeta;
  /** If true, hides the "Team" column (used on team pages where all players are same team) */
  showTeamColumn?: boolean;
  /** Fantasy team names keyed by team ID (optional, for rostered player badges) */
  teamNames?: Record<number, string>;
  /** If non-zero, pre-filter to this fantasy team ID */
  fantasyTeamId?: number;
}

export default function EROSPTable({
  players,
  meta,
  showTeamColumn = true,
  teamNames,
  fantasyTeamId,
}: Props) {
  const [faFilter, setFaFilter]     = useState<'all' | 'fa' | 'rostered'>('all');
  const [posFilter, setPosFilter]   = useState('All');
  const [sortCol, setSortCol]       = useState<SortCol>('erosp_raw');
  const [sortDir, setSortDir]       = useState<SortDir>('desc');
  const [showRaw, setShowRaw]       = useState(true);

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortCol(col);
      setSortDir(col === 'name' ? 'asc' : 'desc');
    }
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) {
      return <span className="opacity-30 ml-1">↕</span>;
    }
    return <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>;
  }

  const filtered = useMemo(() => {
    let list = [...players];

    // Fantasy team filter (for team page usage)
    if (fantasyTeamId && fantasyTeamId !== 0) {
      list = list.filter(p => p.fantasy_team_id === fantasyTeamId);
    }

    // FA / rostered filter
    if (faFilter === 'fa')       list = list.filter(p => p.is_fa);
    if (faFilter === 'rostered') list = list.filter(p => !p.is_fa);

    // Position filter
    if (posFilter !== 'All') {
      list = list.filter(p => {
        const pos = normalizePos(p.position);
        // Generic 'P' from older JSON — fall back to role for SP/RP filter buttons
        if (pos === 'P') return p.role === posFilter;
        return pos === posFilter;
      });
    }

    // Sort
    list.sort((a, b) => {
      let va: number | string, vb: number | string;
      switch (sortCol) {
        case 'name':             va = a.name;             vb = b.name;             break;
        case 'erosp_startable':  va = a.erosp_startable;  vb = b.erosp_startable;  break;
        case 'erosp_per_game':   va = a.erosp_per_game;   vb = b.erosp_per_game;   break;
        default:                 va = a.erosp_raw;        vb = b.erosp_raw;        break;
      }
      if (typeof va === 'string') {
        return sortDir === 'asc'
          ? va.localeCompare(vb as string)
          : (vb as string).localeCompare(va);
      }
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });

    return list;
  }, [players, faFilter, posFilter, fantasyTeamId, sortCol, sortDir]);

  // Format timestamp
  const generatedAt = meta.generated_at
    ? new Date(meta.generated_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        timeZoneName: 'short',
      })
    : null;

  const thClass = (col: SortCol) =>
    `px-4 py-2.5 text-right cursor-pointer select-none hover:bg-gray-700 transition ${
      sortCol === col ? 'text-sky-300' : 'text-white'
    }`;

  return (
    <div className="mb-8">
      {/* ── Header row ── */}
      <div className="flex items-center justify-between mb-2 gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          {/* FA / Rostered toggle (only show if not pre-filtered by team) */}
          {!fantasyTeamId && (
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-semibold">
              {(['all', 'rostered', 'fa'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFaFilter(f)}
                  className={`px-3 py-1.5 transition capitalize ${
                    faFilter === f
                      ? f === 'fa' ? 'bg-orange-500 text-white'
                        : 'bg-gray-800 text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {f === 'all' ? 'All' : f === 'fa' ? 'Free Agents' : 'Rostered'}
                </button>
              ))}
            </div>
          )}

          {/* Raw vs Startable toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-semibold">
            <button
              onClick={() => setShowRaw(false)}
              className={`px-3 py-1.5 transition ${
                !showRaw ? 'bg-teal-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              Startable
            </button>
            <button
              onClick={() => setShowRaw(true)}
              className={`px-3 py-1.5 transition ${
                showRaw ? 'bg-teal-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              Raw
            </button>
          </div>
        </div>

        {/* Metadata */}
        {generatedAt && (
          <p className="text-xs text-gray-700">
            Updated {generatedAt} · Updates daily
          </p>
        )}
      </div>

      {/* ── Sidebar + Table ── */}
      <div className="flex flex-col md:flex-row gap-3 md:items-start">

        {/* Position sidebar — horizontal pill row on mobile, vertical column on desktop */}
        <div className="flex flex-row flex-wrap gap-1 md:flex-col md:flex-shrink-0 md:w-14">
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
          <div className="overflow-y-auto overflow-x-auto" style={{ maxHeight: '460px' }}>
            <table className="min-w-full text-sm">
              <thead className="bg-gray-800 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2.5 text-left text-white w-8">#</th>
                  <th
                    className="px-4 py-2.5 text-left text-white cursor-pointer select-none hover:bg-gray-700 transition"
                    onClick={() => handleSort('name')}
                  >
                    Player <SortIcon col="name" />
                  </th>
                  <th className="px-4 py-2.5 text-left text-white w-12">Pos</th>
                  {showTeamColumn && (
                    <th className="hidden md:table-cell px-4 py-2.5 text-left text-white w-14">Team</th>
                  )}
                  <th className="hidden md:table-cell px-4 py-2.5 text-center text-white w-20">Status</th>
                  <th className={`hidden md:table-cell ${thClass('erosp_per_game')}`} onClick={() => handleSort('erosp_per_game')}>
                    /Game <SortIcon col="erosp_per_game" />
                  </th>
                  <th className={`hidden md:table-cell ${thClass('erosp_startable')}`} onClick={() => handleSort('erosp_startable')}>
                    Startable <SortIcon col="erosp_startable" />
                  </th>
                  <th className={thClass('erosp_raw')} onClick={() => handleSort('erosp_raw')}>
                    {showRaw ? 'EROSP' : 'Startable'} <SortIcon col="erosp_raw" />
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={showTeamColumn ? 8 : 7} className="px-4 py-10 text-center text-gray-400 text-sm">
                      No players found
                    </td>
                  </tr>
                ) : (
                  filtered.map((p, i) => {
                    const primaryValue = showRaw ? p.erosp_raw : p.erosp_startable;
                    return (
                      <tr key={p.mlbam_id} className="hover:bg-sky-50 transition">
                        <td className="px-4 py-2.5 text-gray-300 text-xs">{i + 1}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-800">
                          {p.name}
                          {p.role === 'SP' && p.projected_starts != null && (
                            <span className="ml-1.5 text-xs text-gray-400 font-normal">
                              ({Math.round(p.projected_starts)} starts)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs font-semibold">
                          {normalizePos(p.position) === 'P' ? p.role : normalizePos(p.position)}
                        </td>
                        {showTeamColumn && (
                          <td className="hidden md:table-cell px-4 py-2.5 text-gray-500 text-xs font-semibold">
                            {p.mlb_team || '—'}
                          </td>
                        )}
                        <td className="hidden md:table-cell px-4 py-2.5 text-center">
                          {p.is_fa ? (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600">
                              Free Agent
                            </span>
                          ) : (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">
                              {teamNames?.[p.fantasy_team_id] ?? 'Rostered'}
                            </span>
                          )}
                        </td>
                        <td className="hidden md:table-cell px-4 py-2.5 text-right text-gray-500 text-xs">
                          {p.erosp_per_game.toFixed(2)}
                        </td>
                        <td className="hidden md:table-cell px-4 py-2.5 text-right text-gray-400 text-xs">
                          {Math.round(p.erosp_startable).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-teal-600">
                          {Math.round(showRaw ? p.erosp_raw : p.erosp_startable).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer: result count + explanation */}
          <div className="px-4 py-2 bg-gray-50 border-t flex items-center justify-between text-xs text-gray-400">
            <span>{filtered.length.toLocaleString()} player{filtered.length !== 1 ? 's' : ''}</span>
            <span className="hidden md:inline">
              <strong>EROSP</strong> = projected season pts · <strong>Startable</strong> = value above replacement · 7-SP-start cap
            </span>
            <span className="md:hidden">7-start SP cap applied</span>
          </div>
        </div>
      </div>

      {/* Pre-season note */}
      {!meta.season_started && (
        <p className="mt-2 text-xs text-gray-700 italic">
          Pre-season: projections based on 3-year historical rates. Will update with in-season data after Opening Day.
        </p>
      )}
    </div>
  );
}
