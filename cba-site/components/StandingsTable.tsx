'use client';

import { StandingEntry, Team, Matchup } from '@/lib/types';
import Link from 'next/link';
import { useState, useEffect } from 'react';

interface Props {
  standings: StandingEntry[];
  teams: Team[];
  matchups?: Matchup[];
  weekLengths?: Record<number, number>;
  showPlayoffLine?: boolean;
  playoffCount?: number;
  loserCount?: number;
}

type ColKey = 'rank' | 'team' | 'w' | 'l' | 't' | 'pct' | 'pf' | 'pfrank' | 'pa' | 'diff' | 'xwl';

const COL_INFO: Record<ColKey, { label: string; desc: string }> = {
  rank:   { label: 'Rank',    desc: 'Current standings position, sorted by wins then total points scored.' },
  team:   { label: 'Team',    desc: 'Fantasy team — click to visit the team page.' },
  w:      { label: 'W',       desc: 'Wins from head-to-head matchups.' },
  l:      { label: 'L',       desc: 'Losses from head-to-head matchups.' },
  t:      { label: 'T',       desc: 'Ties from head-to-head matchups.' },
  pct:    { label: 'PCT',     desc: 'Win percentage (W / total games played).' },
  pf:     { label: 'PF',      desc: 'Total fantasy points scored this season.' },
  pfrank: { label: 'PF Rank', desc: 'Where this team ranks in total scoring, independent of their W-L record. ↑ means they score better than their record suggests; ↓ means the opposite.' },
  pa:     { label: 'PA',      desc: 'Total fantasy points scored against this team.' },
  diff:   { label: 'DIFF',    desc: 'Points scored minus points allowed.' },
  xwl:    { label: 'xW-L',   desc: 'Expected W-L. Each week, scores are normalized to a 7-day equivalent, then compared to the league median. At or above median = xW, below = xL. Amber = luckier than expected, blue = unluckier.' },
};

function computeXRecord(matchups: Matchup[], weekLengths: Record<number, number> = {}) {
  const xWins = new Map<number, number>();
  const xLosses = new Map<number, number>();

  const byWeek = new Map<number, Matchup[]>();
  for (const m of matchups) {
    if (m.winner === undefined) continue;
    if (!byWeek.has(m.week)) byWeek.set(m.week, []);
    byWeek.get(m.week)!.push(m);
  }

  for (const weekMatchups of byWeek.values()) {
    if (!weekMatchups.every(m => m.winner !== undefined)) continue;

    const week = weekMatchups[0].week;
    const days = weekLengths[week];
    const normalize = (pts: number) => days && days !== 7 ? pts * 7 / days : pts;

    const weekScores = weekMatchups
      .flatMap(m => [normalize(m.home.totalPoints), normalize(m.away.totalPoints)])
      .sort((a, b) => a - b);
    const mid = Math.floor(weekScores.length / 2);
    const threshold = weekScores.length % 2 === 0
      ? (weekScores[mid - 1] + weekScores[mid]) / 2
      : weekScores[mid];

    for (const m of weekMatchups) {
      for (const side of [m.home, m.away]) {
        const key = side.teamId;
        if (normalize(side.totalPoints) >= threshold) {
          xWins.set(key, (xWins.get(key) ?? 0) + 1);
        } else {
          xLosses.set(key, (xLosses.get(key) ?? 0) + 1);
        }
      }
    }
  }

  return { xWins, xLosses };
}

export default function StandingsTable({
  standings,
  teams,
  matchups,
  weekLengths,
  showPlayoffLine = true,
  playoffCount = 4,
  loserCount = 2,
}: Props) {
  const getTeam = (teamId: number) => teams.find(t => t.id === teamId);

  const pfSorted = [...standings].sort((a, b) => b.pointsFor - a.pointsFor);
  const pfRankMap = new Map(pfSorted.map((s, i) => [s.teamId, i + 1]));

  const { xWins, xLosses } = matchups && matchups.length > 0
    ? computeXRecord(matchups, weekLengths)
    : { xWins: new Map<number, number>(), xLosses: new Map<number, number>() };
  const showXRecord = matchups != null && xWins.size > 0 && [...xWins.values()].some(v => v > 0);

  const [tooltip, setTooltip] = useState<{ col: ColKey; x: number; y: number } | null>(null);

  function openTooltip(col: ColKey, e: React.MouseEvent<HTMLTableCellElement>) {
    e.stopPropagation();
    if (tooltip?.col === col) { setTooltip(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ col, x: Math.min(rect.left, window.innerWidth - 340), y: rect.bottom + 6 });
  }

  useEffect(() => {
    if (!tooltip) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setTooltip(null); };
    const onClick = () => setTooltip(null);
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [tooltip]);

  const thBase = 'cursor-pointer select-none hover:bg-gray-700 transition-colors';

  return (
    <>
      {/* ── Mobile card list ── */}
      <div className="md:hidden space-y-2">
        {standings.map((standing, index) => {
          const team = getTeam(standing.teamId);
          const isPlayoff = showPlayoffLine && index < playoffCount;
          const isLoser = showPlayoffLine && index >= standings.length - loserCount;
          const pfRank = pfRankMap.get(standing.teamId)!;
          const rankDiff = (index + 1) - pfRank;
          const xW = xWins.get(standing.teamId) ?? 0;
          const xL = xLosses.get(standing.teamId) ?? 0;
          const luckDiff = standing.wins - xW;
          const xwlColor = luckDiff > 0 ? 'text-amber-600' : luckDiff < 0 ? 'text-blue-600' : 'text-gray-500';

          return (
            <Link
              key={standing.teamId}
              href={`/teams/${standing.teamId}`}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 active:opacity-70 transition ${
                isPlayoff ? 'bg-green-50 border-green-200' :
                isLoser   ? 'bg-red-50 border-red-200' :
                            'bg-white border-gray-200'
              }`}
            >
              {/* Rank */}
              <span className="text-base font-bold text-gray-400 w-5 shrink-0 text-center">{index + 1}</span>

              {/* Team name + streak */}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900 truncate leading-tight">
                  {team?.name || `Team ${standing.teamId}`}
                </div>
                {standing.streak && (
                  <div className="text-xs text-gray-400 mt-0.5">{standing.streak}</div>
                )}
              </div>

              {/* W-L and PF */}
              <div className="text-right shrink-0">
                <div className="font-semibold text-gray-900 tabular-nums">
                  {standing.wins}–{standing.losses}{standing.ties > 0 ? `–${standing.ties}` : ''}
                </div>
                <div className="text-xs text-gray-400 mt-0.5 tabular-nums">
                  {standing.pointsFor.toFixed(1)} PF
                  <span className={`ml-1.5 ${rankDiff > 0 ? 'text-green-600' : rankDiff < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    #{pfRank}{rankDiff !== 0 ? (rankDiff > 0 ? ` ↑${rankDiff}` : ` ↓${Math.abs(rankDiff)}`) : ''}
                  </span>
                </div>
              </div>

              {/* xW-L */}
              {showXRecord && (
                <div className={`text-right shrink-0 w-12 ${xwlColor}`}>
                  <div className="font-semibold tabular-nums">{xW}–{xL}</div>
                  <div className="text-xs text-gray-400">xW-L</div>
                </div>
              )}
            </Link>
          );
        })}

        {/* Legend */}
        <div className="flex gap-4 text-xs text-gray-500 pt-1 px-1">
          {showPlayoffLine && <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-green-100 border border-green-300" /> Playoff</span>}
          {showPlayoffLine && <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-100 border border-red-300" /> Loser bracket</span>}
          {showXRecord && <span><span className="text-amber-600 font-medium">amber</span> = lucky · <span className="text-blue-600 font-medium">blue</span> = unlucky</span>}
        </div>
      </div>

      {/* ── Desktop full table ── */}
      <div className="hidden md:block overflow-x-auto overflow-y-hidden">
        <table className="min-w-full bg-white shadow-md rounded-lg overflow-hidden text-sm">
          <thead className="bg-gray-800 text-white">
            <tr>
              <th className={`px-4 py-3 text-left w-12 ${thBase}`} onClick={e => openTooltip('rank', e)}>Rank</th>
              <th className={`px-4 py-3 text-left ${thBase}`} onClick={e => openTooltip('team', e)}>Team</th>
              <th className={`px-6 py-3 text-center w-16 ${thBase}`} onClick={e => openTooltip('w', e)}>W</th>
              <th className={`px-6 py-3 text-center w-16 ${thBase}`} onClick={e => openTooltip('l', e)}>L</th>
              <th className={`px-6 py-3 text-center w-16 ${thBase}`} onClick={e => openTooltip('t', e)}>T</th>
              <th className={`px-4 py-3 text-center w-20 ${thBase}`} onClick={e => openTooltip('pct', e)}>PCT</th>
              <th className={`px-4 py-3 text-right w-24 ${thBase}`} onClick={e => openTooltip('pf', e)}>PF</th>
              <th className={`px-4 py-3 text-center w-24 ${thBase}`} onClick={e => openTooltip('pfrank', e)}>PF Rank</th>
              <th className={`px-4 py-3 text-right w-24 ${thBase}`} onClick={e => openTooltip('pa', e)}>PA</th>
              <th className={`px-4 py-3 text-center w-24 ${thBase}`} onClick={e => openTooltip('diff', e)}>DIFF</th>
              {showXRecord && (
                <th className={`px-4 py-3 text-center w-24 ${thBase}`} onClick={e => openTooltip('xwl', e)}>xW-L</th>
              )}
            </tr>
          </thead>
          <tbody>
            {standings.map((standing, index) => {
              const total = standing.wins + standing.losses + standing.ties;
              const winPct = total > 0 ? standing.wins / total : 0;
              const diff = standing.pointsFor - standing.pointsAgainst;
              const team = getTeam(standing.teamId);
              const isPlayoff = showPlayoffLine && index < playoffCount;
              const isLoser = showPlayoffLine && index >= standings.length - loserCount;
              const pfRank = pfRankMap.get(standing.teamId)!;
              const rankDiff = (index + 1) - pfRank;

              return (
                <tr
                  key={standing.teamId}
                  className={`border-b hover:bg-sky-50 transition ${
                    isPlayoff ? 'bg-green-50' : isLoser ? 'bg-red-50' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-semibold text-gray-700">{index + 1}</td>
                  <td className="px-4 py-3">
                    <Link href={`/teams/${standing.teamId}`} className="font-medium hover:text-teal-600 transition">
                      {team?.name || `Team ${standing.teamId}`}
                    </Link>
                    {standing.streak && (
                      <span className="ml-2 text-xs text-gray-500">{standing.streak}</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-center">{standing.wins}</td>
                  <td className="px-6 py-3 text-center">{standing.losses}</td>
                  <td className="px-6 py-3 text-center">{standing.ties}</td>
                  <td className="px-4 py-3 text-center">{winPct.toFixed(3)}</td>
                  <td className="px-4 py-3 text-right">{standing.pointsFor.toFixed(1)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1">
                      <span className="font-medium w-4 text-right">{pfRank}</span>
                      <span className={`text-xs w-6 text-left ${rankDiff > 0 ? 'text-green-600' : rankDiff < 0 ? 'text-red-500' : 'invisible'}`}>
                        {rankDiff > 0 ? `↑${rankDiff}` : rankDiff < 0 ? `↓${Math.abs(rankDiff)}` : '↑0'}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">{standing.pointsAgainst.toFixed(1)}</td>
                  <td className={`px-4 py-3 text-center font-semibold ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                    {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                  </td>
                  {showXRecord && (() => {
                    const xW = xWins.get(standing.teamId) ?? 0;
                    const xL = xLosses.get(standing.teamId) ?? 0;
                    const luckDiff = standing.wins - xW;
                    const color = luckDiff > 0 ? 'text-amber-600' : luckDiff < 0 ? 'text-blue-600' : 'text-gray-700';
                    const title = luckDiff > 0
                      ? `+${luckDiff.toFixed(1)} lucky (actual record better than expected)`
                      : luckDiff < 0
                      ? `${luckDiff.toFixed(1)} unlucky (actual record worse than expected)`
                      : 'On pace with expected record';
                    return (
                      <td className={`px-4 py-3 text-center font-medium ${color}`} title={title}>
                        {xW}-{xL}
                      </td>
                    );
                  })()}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {tooltip && (
        <div
          className="fixed z-50 bg-white rounded-lg border border-gray-200 shadow-xl p-3 max-w-xs text-sm"
          style={{ left: tooltip.x, top: tooltip.y }}
          onClick={e => e.stopPropagation()}
        >
          <p className="font-semibold text-gray-800 mb-1">{COL_INFO[tooltip.col].label}</p>
          <p className="text-gray-600 leading-relaxed">{COL_INFO[tooltip.col].desc}</p>
        </div>
      )}
    </>
  );
}
