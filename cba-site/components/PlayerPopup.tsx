'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import type { PlayerCardData, PlayerCardStats } from '@/lib/player-card-types';

interface Props {
  data: PlayerCardData | null;
  loading: boolean;
  mlbamId?: number;
  onClose: () => void;
}

function fmt(val: string | number | undefined, decimals = 0): string {
  if (val == null) return '—';
  if (typeof val === 'string') return val;
  return decimals > 0 ? val.toFixed(decimals) : String(Math.round(val));
}

function StatCell({ label, val, highlight }: { label: string; val?: string | number; highlight?: 'green' | 'red' | 'none' }) {
  const color = highlight === 'green' ? 'text-green-600' : highlight === 'red' ? 'text-red-500' : 'text-gray-800';
  return (
    <div className="text-center">
      <div className={`text-sm font-bold tabular-nums ${color}`}>{fmt(val)}</div>
      <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}

// Determine if a stat is "better" when higher (true) or lower (false)
function isHigherBetter(label: string): boolean {
  return !['ERA', 'WHIP', 'BB/9', 'K% (P)', 'BB%', 'FIP'].includes(label);
}

function trendColor(label: string, season?: string | number, recent?: string | number): 'green' | 'red' | 'none' {
  if (season == null || recent == null) return 'none';
  const s = parseFloat(String(season));
  const r = parseFloat(String(recent));
  if (isNaN(s) || isNaN(r) || s === 0) return 'none';
  const improved = r > s;
  return isHigherBetter(label) ? (improved ? 'green' : 'red') : (improved ? 'red' : 'green');
}

interface TrendRowProps {
  label: string;
  season?: string | number;
  l14?: string | number;
  l7?: string | number;
}

function TrendRow({ label, season, l14, l7 }: TrendRowProps) {
  if (season == null && l14 == null && l7 == null) return null;
  return (
    <tr className="border-b border-gray-50 last:border-0">
      <td className="py-1.5 pr-3 text-xs text-gray-500 font-medium whitespace-nowrap">{label}</td>
      <td className="py-1.5 px-2 text-xs tabular-nums text-center font-semibold text-gray-700">{fmt(season)}</td>
      <td className={`py-1.5 px-2 text-xs tabular-nums text-center font-semibold ${trendColor(label, season, l14) === 'green' ? 'text-green-600' : trendColor(label, season, l14) === 'red' ? 'text-red-500' : 'text-gray-600'}`}>
        {fmt(l14)}
      </td>
      <td className={`py-1.5 px-2 text-xs tabular-nums text-center font-semibold ${trendColor(label, season, l7) === 'green' ? 'text-green-600' : trendColor(label, season, l7) === 'red' ? 'text-red-500' : 'text-gray-600'}`}>
        {fmt(l7)}
      </td>
    </tr>
  );
}

function StatsSection({ season, l14, l7, isPitcher }: {
  season?: PlayerCardStats | null;
  l14?: PlayerCardStats | null;
  l7?: PlayerCardStats | null;
  isPitcher: boolean;
}) {
  const hasAny = season || l14 || l7;
  if (!hasAny) return <p className="text-xs text-gray-400 italic">No 2026 stats yet.</p>;

  if (!isPitcher) {
    return (
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="py-1 pr-3 text-[10px] text-gray-400 font-semibold uppercase"></th>
            <th className="py-1 px-2 text-[10px] text-gray-500 font-semibold uppercase text-center">Season</th>
            <th className="py-1 px-2 text-[10px] text-teal-600 font-semibold uppercase text-center">L14</th>
            <th className="py-1 px-2 text-[10px] text-sky-600 font-semibold uppercase text-center">L7</th>
          </tr>
        </thead>
        <tbody>
          <TrendRow label="AVG"  season={season?.avg}  l14={l14?.avg}  l7={l7?.avg} />
          <TrendRow label="OBP"  season={season?.obp}  l14={l14?.obp}  l7={l7?.obp} />
          <TrendRow label="SLG"  season={season?.slg}  l14={l14?.slg}  l7={l7?.slg} />
          <TrendRow label="OPS"  season={season?.ops}  l14={l14?.ops}  l7={l7?.ops} />
          <TrendRow label="HR"   season={season?.hr}   l14={l14?.hr}   l7={l7?.hr} />
          <TrendRow label="RBI"  season={season?.rbi}  l14={l14?.rbi}  l7={l7?.rbi} />
          <TrendRow label="SB"   season={season?.sb}   l14={l14?.sb}   l7={l7?.sb} />
          <TrendRow label="K%"   season={season?.kPct} l14={l14?.kPct} l7={l7?.kPct} />
          <TrendRow label="BB%"  season={season?.bbPct} l14={l14?.bbPct} l7={l7?.bbPct} />
          <TrendRow label="ISO"  season={season?.iso}  l14={l14?.iso}  l7={l7?.iso} />
        </tbody>
      </table>
    );
  }

  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-gray-200">
          <th className="py-1 pr-3 text-[10px] text-gray-400 font-semibold uppercase"></th>
          <th className="py-1 px-2 text-[10px] text-gray-500 font-semibold uppercase text-center">Season</th>
          <th className="py-1 px-2 text-[10px] text-teal-600 font-semibold uppercase text-center">L14</th>
          <th className="py-1 px-2 text-[10px] text-sky-600 font-semibold uppercase text-center">L7</th>
        </tr>
      </thead>
      <tbody>
        <TrendRow label="ERA"   season={season?.era}  l14={l14?.era}  l7={l7?.era} />
        <TrendRow label="WHIP"  season={season?.whip} l14={l14?.whip} l7={l7?.whip} />
        <TrendRow label="K/9"   season={season?.k9}   l14={l14?.k9}   l7={l7?.k9} />
        <TrendRow label="BB/9"  season={season?.bb9}  l14={l14?.bb9}  l7={l7?.bb9} />
        <TrendRow label="K%"    season={season?.kPct} l14={l14?.kPct} l7={l7?.kPct} />
        <TrendRow label="FIP"   season={season?.fip}  l14={l14?.fip}  l7={l7?.fip} />
        <TrendRow label="IP"    season={season?.ip}   l14={l14?.ip}   l7={l7?.ip} />
        <TrendRow label="QS"    season={season?.qualityStarts} l14={l14?.qualityStarts} l7={l7?.qualityStarts} />
        <TrendRow label="SV"    season={season?.saves}  l14={l14?.saves}  l7={l7?.saves} />
        <TrendRow label="HD"    season={season?.holds}  l14={l14?.holds}  l7={l7?.holds} />
      </tbody>
    </table>
  );
}

export default function PlayerPopup({ data, loading, mlbamId, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const isPitcher = data ? (data.role === 'SP' || data.role === 'RP') : false;
  const photoUrl = mlbamId
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${mlbamId}/headshot/67/current`
    : null;

  // Normalize position display
  function displayPos(pos: string, role: string) {
    if (['LF', 'CF', 'RF'].includes(pos)) return 'OF';
    if (pos === 'P') return role;
    return pos || role;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={cardRef}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-y-auto"
        style={{ maxHeight: '88vh' }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-700 transition"
          aria-label="Close"
        >
          ×
        </button>

        {loading && !data ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
          </div>
        ) : data ? (
          <>
            {/* ── Header ── */}
            <div className={`px-5 pt-5 pb-4 ${data.ilType ? 'border-b border-red-100' : 'border-b border-gray-100'}`}>
              <div className="flex items-center gap-3 pr-8">
                {photoUrl && (
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-100 flex-shrink-0">
                    <Image
                      src={photoUrl}
                      alt={data.name}
                      width={48}
                      height={48}
                      className="object-cover w-full h-full"
                      unoptimized
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-gray-900 leading-tight">{data.name}</h2>
                    {data.ilType && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                        {data.ilType}
                        {data.ilDaysRemaining != null && data.ilDaysRemaining > 0 && (
                          <span className="ml-1 font-normal">~{data.ilDaysRemaining}d</span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    {displayPos(data.position, data.role)} · {data.mlbTeam || '—'}
                  </div>
                  {data.mentions && data.mentions.length > 0 && (
                    <div className="mt-2 flex flex-col gap-1">
                      {data.mentions.map((m, i) => (
                        <a
                          key={i}
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] text-teal-700 hover:text-teal-900 hover:underline leading-tight"
                          onClick={e => e.stopPropagation()}
                        >
                          <span className="text-teal-400">📰</span>
                          <span className="truncate">{m.title}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Injury box ── */}
            {data.ilType && (
              <div className="mx-5 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                {data.injuryNote && (
                  <p className="text-sm text-red-700 font-medium mb-1">
                    📍 {data.injuryNote}
                  </p>
                )}
                {data.injuryNews && (
                  <p className="text-xs text-gray-600 leading-snug">
                    {data.injuryNews}
                    {data.injuryNewsSource && (
                      <span className="ml-1.5 text-gray-400">
                        — {data.injuryNewsSource}
                        {data.injuryNewsDate ? ` ${data.injuryNewsDate.slice(5).replace('-', '/')}` : ''}
                      </span>
                    )}
                  </p>
                )}
                {!data.injuryNote && !data.injuryNews && (
                  <p className="text-xs text-red-500">On {data.ilType} injured list</p>
                )}
              </div>
            )}

            {/* ── Fantasy Points Context ── */}
            {(data.fantasyPoints2025 != null || data.fantasyPoints2026 != null || data.erospRaw != null) && (
              <div className="mx-5 mt-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Fantasy Points</h3>
                <div className="grid grid-cols-3 gap-2">
                  {data.fantasyPoints2025 != null && (
                    <div className="bg-gray-50 rounded-xl p-3 text-center">
                      <div className="text-base font-bold text-gray-800">{Math.round(data.fantasyPoints2025).toLocaleString()}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">2025 Actual</div>
                    </div>
                  )}
                  {data.fantasyPoints2026 != null ? (
                    <div className="bg-sky-50 rounded-xl p-3 text-center">
                      <div className="text-base font-bold text-sky-700">{data.fantasyPoints2026.toFixed(1)}</div>
                      <div className="text-[10px] text-sky-400 mt-0.5">2026 YTD</div>
                    </div>
                  ) : (
                    <div className="bg-sky-50 rounded-xl p-3 text-center">
                      <div className="text-base font-bold text-sky-400">—</div>
                      <div className="text-[10px] text-sky-300 mt-0.5">2026 YTD</div>
                    </div>
                  )}
                  {data.erospRaw != null && (
                    <div className="bg-teal-50 rounded-xl p-3 text-center">
                      <div className="text-base font-bold text-teal-700">{Math.round(data.erospRaw).toLocaleString()}</div>
                      <div className="text-[10px] text-teal-400 mt-0.5">EROSP (proj)</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Stats Trends ── */}
            {(data.seasonStats || data.last14Stats || data.last7Stats) && (
              <div className="mx-5 mt-4">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {isPitcher ? 'Pitching Trends' : 'Hitting Trends'} — 2026
                  </h3>
                  {data.seasonStats?.gamesPlayed ? (
                    <span className="text-[10px] text-gray-300">{data.seasonStats.gamesPlayed}G played</span>
                  ) : null}
                </div>
                <StatsSection
                  season={data.seasonStats}
                  l14={data.last14Stats}
                  l7={data.last7Stats}
                  isPitcher={isPitcher}
                />
              </div>
            )}

            {/* ── Recent Games ── */}
            {data.recentGames && data.recentGames.length > 0 && (
              <div className="mx-5 mt-4">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Recent Games</h3>
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-gray-400 font-semibold">Date</th>
                        <th className="px-3 py-2 text-left text-gray-400 font-semibold">vs</th>
                        <th className="px-3 py-2 text-left text-gray-400 font-semibold">Stats</th>
                        <th className="px-3 py-2 text-right text-gray-400 font-semibold">FP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.recentGames.map((g, i) => (
                        <tr key={i} className="hover:bg-sky-50 transition">
                          <td className="px-3 py-2 text-gray-600 font-medium whitespace-nowrap">{g.date}</td>
                          <td className="px-3 py-2 text-gray-400">{g.opponent ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-600">
                            {g.statLine}
                            {g.isQS && <span className="ml-1 text-[10px] bg-green-100 text-green-700 font-bold px-1 py-0.5 rounded">QS</span>}
                          </td>
                          <td className={`px-3 py-2 text-right font-bold tabular-nums ${
                            g.fantasyPoints >= 20 ? 'text-teal-600'
                            : g.fantasyPoints < 0 ? 'text-red-400'
                            : 'text-gray-700'
                          }`}>
                            {g.fantasyPoints > 0 ? '+' : ''}{g.fantasyPoints.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* No stats at all */}
            {!data.seasonStats && !data.last14Stats && !data.last7Stats && (!data.recentGames || data.recentGames.length === 0) && (
              <div className="mx-5 mt-4 text-center py-4">
                <p className="text-xs text-gray-400 italic">No 2026 MLB stats yet — season may not have started.</p>
              </div>
            )}

            <div className="h-5" />
          </>
        ) : (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">Could not load player data.</div>
        )}
      </div>
    </div>
  );
}
