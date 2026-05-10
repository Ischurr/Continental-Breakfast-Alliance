'use client';

import { useEffect, useState } from 'react';
import type { LineupPlayer, DailyLineupResponse } from '@/app/api/daily-lineup/[teamId]/route';
import type { WeeklySpPlan, SpStartEntry } from '@/lib/fantasy/weeklySpPlan';

// Slot display order (batters then pitchers)
const BATTER_SLOTS = ['C', '1B', '2B', '3B', 'SS', 'MI', 'CI', 'OF', 'DH', 'UTIL'];
const PITCHER_SLOTS = ['SP', 'RP'];

const SLOT_COLORS: Record<string, string> = {
  C:    'bg-blue-100 text-blue-800',
  '1B': 'bg-orange-100 text-orange-800',
  '2B': 'bg-green-100 text-green-800',
  '3B': 'bg-purple-100 text-purple-800',
  SS:   'bg-indigo-100 text-indigo-800',
  MI:   'bg-teal-100 text-teal-800',
  CI:   'bg-amber-100 text-amber-800',
  OF:   'bg-lime-100 text-lime-800',
  DH:   'bg-rose-100 text-rose-800',
  UTIL: 'bg-slate-100 text-slate-700',
  SP:   'bg-sky-100 text-sky-800',
  RP:   'bg-cyan-100 text-cyan-800',
};

function parkLabel(pf: number): string | null {
  if (pf >= 1.05) return `↑ ${pf.toFixed(2)}`;
  if (pf <= 0.96) return `↓ ${pf.toFixed(2)}`;
  return null;
}

function eraColor(era: number): string {
  if (era < 3.0) return 'text-red-600 font-semibold';
  if (era < 3.75) return 'text-orange-600';
  if (era > 5.0) return 'text-green-600';
  return 'text-gray-500';
}

function formatPoints(pts: number): string {
  if (pts <= 0) return '—';
  return pts.toFixed(1);
}

// ── PlayerRow ─────────────────────────────────────────────────────────────────

function injuryBadge(player: LineupPlayer): { label: string; cls: string } | null {
  if (player.ilType) return { label: player.ilType, cls: 'text-red-500 font-medium' };
  const s = player.injuryStatus;
  if (s === 'OUT') return { label: 'OUT', cls: 'text-red-600 font-bold' };
  if (s === 'DOUBTFUL') return { label: 'DTF', cls: 'text-red-500 font-medium' };
  if (s === 'SUSPENSION') return { label: 'SUSP', cls: 'text-red-500 font-medium' };
  if (s === 'QUESTIONABLE') return { label: 'Q', cls: 'text-amber-600 font-medium' };
  if (s === 'DAY_TO_DAY') return { label: 'DTD', cls: 'text-amber-600 font-medium' };
  return null;
}

function PlayerRow({ player, index }: { player: LineupPlayer; index: number }) {
  const slot = player.slot ?? '?';
  const isPitcher = player.role === 'SP' || player.role === 'RP';
  const isOnIL = !!player.ilType;
  const noGame = !player.hasGame;
  const notStarting = player.role === 'SP' && player.hasGame && !player.isStartingToday;
  const badge = injuryBadge(player);

  const rowBg = index % 2 === 0 ? 'bg-white' : 'bg-slate-50/60';
  const dimmed = noGame || notStarting || isOnIL;

  return (
    <tr className={`${rowBg} ${dimmed ? 'opacity-60' : ''}`}>
      {/* Slot badge */}
      <td className="pl-3 pr-2 py-2 w-12">
        <span className={`inline-flex items-center justify-center text-[11px] font-bold px-1.5 py-0.5 rounded ${SLOT_COLORS[slot] ?? 'bg-gray-100 text-gray-700'}`}>
          {slot}
        </span>
      </td>

      {/* Player photo + name */}
      <td className="py-2 pr-4">
        <div className="flex items-center gap-2 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={player.photoUrl}
            alt=""
            className="w-8 h-8 rounded-full object-cover bg-gray-100 flex-shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{player.name}</p>
            <p className="text-[11px] text-gray-500 leading-tight">
              {player.mlbTeam || player.primaryPosition}
              {player.rpRole === 'closer' && (
                <span className="ml-1 text-emerald-600 font-medium">CL</span>
              )}
              {badge && (
                <span className={`ml-1 ${badge.cls}`}>{badge.label}</span>
              )}
            </p>
          </div>
        </div>
      </td>

      {/* Matchup info (opponent + pitcher) */}
      <td className="py-2 pr-2">
        {noGame ? (
          <span className="text-[11px] text-gray-400 italic">No game</span>
        ) : isPitcher ? (
          <div>
            {player.role === 'SP' && (
              player.isStartingToday ? (
                <span className="text-[11px] font-medium text-emerald-700">
                  ✓ Starting {player.isHome ? 'vs' : '@'} {player.opponentAbbr}
                </span>
              ) : (
                <span className="text-[11px] text-gray-400 italic">
                  Not starting — {player.isHome ? 'vs' : '@'} {player.opponentAbbr}
                </span>
              )
            )}
            {player.role === 'RP' && (
              <span className="text-[11px] text-gray-600">
                {player.isHome ? 'vs' : '@'} {player.opponentAbbr}
              </span>
            )}
          </div>
        ) : (
          <div>
            {player.probablePitcherName ? (
              <>
                <p className="text-sm font-bold text-gray-800 leading-tight">
                  {player.probablePitcherName.split(' ').slice(-1)[0]}
                  {player.probablePitcherEra != null && (
                    <span className={`ml-1.5 text-xs font-semibold ${eraColor(player.probablePitcherEra)}`}>
                      {player.probablePitcherEra.toFixed(2)}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-gray-400 leading-tight">
                  {player.isHome ? 'vs' : '@'} {player.opponentAbbr}
                </p>
              </>
            ) : player.hasGame ? (
              <>
                <p className="text-sm font-medium text-gray-400 leading-tight italic">TBD starter</p>
                <p className="text-[11px] text-gray-400 leading-tight">
                  {player.isHome ? 'vs' : '@'} {player.opponentAbbr}
                </p>
              </>
            ) : null}
          </div>
        )}
      </td>

      {/* Career vs opposing starter */}
      <td className="py-2 pr-2 hidden sm:table-cell text-center">
        {!isPitcher && player.probablePitcherMlbamId && player.vsOpponentAB != null && player.vsOpponentAB >= 5 ? (
          (() => {
            const avg = player.vsOpponentHits! / player.vsOpponentAB;
            const avgStr = avg.toFixed(3).replace(/^0/, '');
            const avgColor = avg >= 0.300 ? 'text-emerald-600' : avg < 0.200 ? 'text-red-500' : 'text-gray-600';
            return (
              <div>
                <p className={`text-sm font-bold tabular-nums leading-tight ${avgColor}`}>{avgStr}</p>
                <p className="text-[10px] text-gray-400 leading-tight tabular-nums">
                  {player.vsOpponentHits}/{player.vsOpponentAB}
                </p>
              </div>
            );
          })()
        ) : (
          <span className="text-[11px] text-gray-300">—</span>
        )}
      </td>

      {/* Park factor */}
      <td className="py-2 pr-2 hidden md:table-cell w-14 text-center">
        {player.hasGame && !isPitcher ? (
          <span className={`text-[11px] font-medium ${
            player.parkFactor >= 1.05 ? 'text-emerald-600' :
            player.parkFactor <= 0.96 ? 'text-red-500' : 'text-gray-400'
          }`}>
            {parkLabel(player.parkFactor) ?? '—'}
          </span>
        ) : <span className="text-gray-300">—</span>}
      </td>

      {/* Estimated today points */}
      <td className="py-2 pr-3 w-16 text-right">
        <span className={`text-sm font-bold tabular-nums ${
          player.estimatedTodayPoints >= 10 ? 'text-emerald-700' :
          player.estimatedTodayPoints >= 5  ? 'text-gray-700' :
          player.estimatedTodayPoints > 0   ? 'text-gray-500' : 'text-gray-300'
        }`}>
          {formatPoints(player.estimatedTodayPoints)}
        </span>
        {player.estimatedTodayPoints > 0 && (
          <span className="text-[10px] text-gray-400 ml-0.5">pts</span>
        )}
      </td>
    </tr>
  );
}

// ── BenchRow ──────────────────────────────────────────────────────────────────

function BenchRow({ player, index }: { player: LineupPlayer; index: number }) {
  const rowBg = index % 2 === 0 ? 'bg-white' : 'bg-slate-50/60';
  const badge = injuryBadge(player);
  const isUnavailable = !!player.ilType
    || player.injuryStatus === 'OUT'
    || player.injuryStatus === 'DOUBTFUL'
    || player.injuryStatus === 'SUSPENSION';

  return (
    <tr className={`${rowBg} opacity-70`}>
      <td className="pl-3 pr-2 py-1.5 w-12">
        <span className="text-[10px] text-gray-400 font-medium">BN</span>
      </td>
      <td className="py-1.5 pr-2">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={player.photoUrl}
            alt=""
            className="w-6 h-6 rounded-full object-cover bg-gray-100 flex-shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div>
            <p className="text-xs font-medium text-gray-700 leading-tight">{player.name}</p>
            <p className="text-[10px] text-gray-400 leading-tight">
              {player.primaryPosition}
              {badge && <span className={`ml-1 ${badge.cls}`}>{badge.label}</span>}
            </p>
          </div>
        </div>
      </td>
      <td className="py-1.5 pr-2">
        <span className="text-[11px] text-gray-400 italic">
          {isUnavailable
            ? 'Unavailable'
            : !player.hasGame
            ? 'No game today'
            : player.role === 'SP' && !player.isStartingToday
            ? 'Not starting'
            : 'Lower projected value'}
        </span>
      </td>
      <td className="py-1.5 pr-2 hidden sm:table-cell" />
      <td className="py-1.5 pr-2 hidden md:table-cell" />
      <td className="py-1.5 pr-3 text-right">
        <span className="text-xs text-gray-400 tabular-nums">
          {formatPoints(player.estimatedTodayPoints)}
        </span>
      </td>
    </tr>
  );
}

// ── Section table ─────────────────────────────────────────────────────────────

function LineupSection({
  title,
  players,
  slotGroup,
}: {
  title: string;
  players: LineupPlayer[];
  slotGroup: string[];
}) {
  const filtered = players.filter(p => {
    const slot = p.slot ?? '';
    return slotGroup.some(s => slot === s || slot.startsWith(s));
  });

  if (filtered.length === 0) return null;

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 px-3 pt-3 pb-1">
        {title}
      </p>
      <table className="w-full text-left border-collapse">
        <colgroup>
          <col className="w-12" />
          <col className="w-40" />
          <col />
          <col className="hidden sm:table-column w-20" />
          <col className="hidden md:table-column w-14" />
          <col className="w-16" />
        </colgroup>
        <thead>
          <tr className="border-b border-gray-100">
            <th className="pl-3 pr-2 py-1 text-[10px] font-medium text-gray-400 uppercase tracking-wide">Slot</th>
            <th className="py-1 pr-4 text-[10px] font-medium text-gray-400 uppercase tracking-wide">Player</th>
            <th className="py-1 pr-2 text-[10px] font-medium text-gray-400 uppercase tracking-wide">Opposing Starter</th>
            <th className="py-1 pr-2 hidden sm:table-cell text-[10px] font-medium text-gray-400 uppercase tracking-wide text-center">vs SP</th>
            <th className="py-1 pr-2 hidden md:table-cell text-[10px] font-medium text-gray-400 uppercase tracking-wide text-center">Park</th>
            <th className="py-1 pr-3 text-[10px] font-medium text-gray-400 uppercase tracking-wide text-right">Est.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {filtered.map((p, i) => <PlayerRow key={p.espnId} player={p} index={i} />)}
        </tbody>
      </table>
    </div>
  );
}

// ── Weekly SP Plan ─────────────────────────────────────────────────────────────

function dayLabel(date: string, isToday: boolean): string {
  if (isToday) return 'Today';
  const d = new Date(date + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function SpPlanRow({ entry }: { entry: SpStartEntry }) {
  const ha = entry.isHome ? 'vs' : '@';
  const badge = entry.isPast
    ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-400">DONE</span>
    : entry.recommended
    ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700">START</span>
    : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-500">SKIP</span>;

  return (
    <tr className={`border-b border-gray-50 ${entry.isToday ? 'bg-indigo-50/40' : ''}`}>
      <td className="pl-3 pr-2 py-2 w-14">{badge}</td>
      <td className="py-2 pr-3">
        <p className={`text-xs font-semibold ${entry.isPast ? 'text-gray-400' : 'text-gray-800'}`}>
          {entry.playerName}
        </p>
        <p className="text-[11px] text-gray-400">
          {dayLabel(entry.date, entry.isToday)} · {ha} {entry.opponentAbbr}
          {entry.opponentPitcherName && <span className="text-gray-300"> · {entry.opponentPitcherName}</span>}
        </p>
      </td>
      <td className="py-2 pr-3 text-right w-16">
        <span className={`text-xs font-bold tabular-nums ${entry.recommended && !entry.isPast ? 'text-green-600' : 'text-gray-400'}`}>
          ~{entry.projectedPoints.toFixed(1)}
        </span>
      </td>
    </tr>
  );
}

function WeeklySpPlanSection({ plan }: { plan: WeeklySpPlan }) {
  const [open, setOpen] = useState(true);
  const future = plan.entries.filter(e => !e.isPast);
  const past   = plan.entries.filter(e => e.isPast);
  const urgencyWarning = plan.startsRemaining <= 1 && future.some(e => !e.recommended);

  return (
    <div className="border-t border-gray-100">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">📅</span>
          <span className="text-xs font-bold text-gray-700">Week {plan.matchupWeek} SP Plan</span>
          {urgencyWarning && (
            <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
              {plan.startsRemaining} start{plan.startsRemaining === 1 ? '' : 's'} left
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-gray-400">
            {plan.startsUsed} used · {plan.startsRemaining} remaining
          </span>
          <span className="text-[10px] text-gray-400">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <table className="w-full text-left border-collapse border-t border-gray-100">
          <tbody>
            {future.length > 0 && future.map(e => <SpPlanRow key={`${e.playerName}-${e.date}`} entry={e} />)}
            {past.length > 0 && (
              <>
                <tr><td colSpan={3} className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide bg-gray-50">Already used this week</td></tr>
                {past.map(e => <SpPlanRow key={`${e.playerName}-${e.date}`} entry={e} />)}
              </>
            )}
            {future.length === 0 && past.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-3 text-xs text-gray-400 text-center">No probable starters found this week yet.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DailyLineupSuggestion({ teamId }: { teamId: number }) {
  const [data, setData] = useState<DailyLineupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showBench, setShowBench] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/daily-lineup/${teamId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('fetch failed');
        const json = await res.json() as DailyLineupResponse;
        if (!cancelled) { setData(json); setLoading(false); }
      } catch {
        if (!cancelled) { setError(true); setLoading(false); }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [teamId]);

  if (loading) {
    return (
      <div className="mt-2 rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-6 text-center">
        <span className="text-sm text-gray-400 animate-pulse">Building lineup…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mt-2 rounded-xl border border-gray-200 bg-white shadow-sm px-4 py-4 text-center">
        <span className="text-sm text-gray-400">Lineup unavailable — try again later.</span>
      </div>
    );
  }

  const { starters, bench, date, weeklySpPlan } = data;

  // Split starters into batters and pitchers for display
  const batterStarters = starters.filter(p => p.role === 'H');
  const pitcherStarters = starters.filter(p => p.role === 'SP' || p.role === 'RP');

  // Total estimated points for starters with games
  const totalEstimated = starters.reduce((s, p) => s + p.estimatedTodayPoints, 0);
  const playersWithGames = starters.filter(p => p.hasGame).length;
  const startingPitchers = starters.filter(p => p.role === 'SP' && p.isStartingToday);

  const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });

  return (
    <div className="mt-2 rounded-xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-gradient-to-r from-indigo-50 to-slate-50 border-b border-indigo-100">
        <div className="flex items-center gap-2">
          <span className="text-base">📋</span>
          <div>
            <p className="text-sm font-bold text-gray-900">Suggested Lineup · {dateLabel}</p>
            <p className="text-[11px] text-gray-500">
              {playersWithGames} of {starters.length} players active
              {startingPitchers.length > 0 && ` · ${startingPitchers.length} SP starting`}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-indigo-700 tabular-nums">{totalEstimated.toFixed(1)}</p>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">est. pts</p>
        </div>
      </div>

      {/* Pitcher matchup callout — show if any SP is starting today */}
      {startingPitchers.length === 0 && pitcherStarters.filter(p => p.hasGame).length > 0 && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-700">
          ⚠️ No probable starters set yet for today — check back closer to first pitch.
        </div>
      )}

      {/* Lineup tables */}
      <LineupSection
        title="Batters"
        players={batterStarters}
        slotGroup={BATTER_SLOTS}
      />

      <LineupSection
        title="Pitchers"
        players={pitcherStarters}
        slotGroup={PITCHER_SLOTS}
      />

      {/* Weekly SP Plan */}
      {weeklySpPlan && (weeklySpPlan.entries.length > 0) && (
        <WeeklySpPlanSection plan={weeklySpPlan} />
      )}

      {/* Bench toggle */}
      {bench.length > 0 && (
        <div>
          <button
            onClick={() => setShowBench(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-slate-50 border-t border-gray-100 transition-colors"
          >
            <span>Bench ({bench.length} players)</span>
            <span className="text-[10px]">{showBench ? '▲' : '▼'}</span>
          </button>
          {showBench && (
            <table className="w-full text-left border-collapse border-t border-gray-100">
              <colgroup>
                <col className="w-12" />
                <col className="w-40" />
                <col />
                <col className="hidden sm:table-column w-20" />
                <col className="hidden md:table-column w-14" />
                <col className="w-16" />
              </colgroup>
              <tbody className="divide-y divide-gray-50">
                {bench.map((p, i) => <BenchRow key={p.espnId} player={p} index={i} />)}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Footer disclaimer */}
      <div className="px-3 py-1.5 border-t border-gray-100 bg-slate-50">
        <p className="text-[10px] text-gray-400">
          Estimates based on EROSP pace, probable pitchers, and park factors. Pitcher matchup data from MLB.
        </p>
      </div>
    </div>
  );
}
