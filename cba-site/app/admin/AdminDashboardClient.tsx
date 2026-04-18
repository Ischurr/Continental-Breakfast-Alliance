'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAdminMode } from '@/hooks/useAdminMode';
import type { AdminAnalytics } from '@/lib/admin-analytics';
import type { AdminNotes } from '@/lib/store';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  analytics: AdminAnalytics;
  adminNotes: AdminNotes;
}

type Tab = 'bullets' | 'teams' | 'players' | 'positions' | 'units' | 'moves' | 'storylines' | 'notes' | 'export';

const CATEGORY_COLORS: Record<string, string> = {
  trend: 'border-blue-400',
  player_over: 'border-green-400',
  player_under: 'border-orange-400',
  position: 'border-purple-400',
  roster: 'border-teal-400',
  injury: 'border-red-400',
};

const CATEGORY_BG: Record<string, string> = {
  trend: 'bg-blue-50',
  player_over: 'bg-green-50',
  player_under: 'bg-orange-50',
  position: 'bg-purple-50',
  roster: 'bg-teal-50',
  injury: 'bg-red-50',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function trendIcon(dir: string) {
  if (dir === 'rising') return <span className="text-green-600 font-bold">↑</span>;
  if (dir === 'falling') return <span className="text-red-500 font-bold">↓</span>;
  if (dir === 'stable') return <span className="text-gray-500">→</span>;
  return <span className="text-gray-300">—</span>;
}

function impactBadge(impact: string) {
  if (impact === 'strong') return <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800 font-semibold">Strong</span>;
  if (impact === 'moderate') return <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-800 font-semibold">Moderate</span>;
  return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">Watch</span>;
}

function statusBadge(status: string) {
  if (status === 'new') return <span className="px-2 py-0.5 text-xs rounded-full bg-teal-100 text-teal-800 font-semibold">New</span>;
  if (status === 'continuing') return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 font-semibold">Continuing</span>;
  return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500">Fading</span>;
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Lock screen ───────────────────────────────────────────────────────────────

function LockScreen({ unlock }: { unlock: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-10 text-center max-w-sm w-full">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
        <p className="text-gray-500 mb-6 text-sm">Editorial intelligence for weekly rankings posts.</p>
        <button
          onClick={unlock}
          className="w-full py-3 px-6 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold transition text-sm"
        >
          Unlock with PIN
        </button>
      </div>
    </div>
  );
}

// ── Bullets tab ───────────────────────────────────────────────────────────────

function BulletsTab({ analytics, onCopy }: { analytics: AdminAnalytics; onCopy: () => void }) {
  const { bullets, priorWeek, priorWeekMatchupResults } = analytics;

  return (
    <div className="space-y-4">
      {/* Prior week matchup results */}
      {priorWeek > 0 && priorWeekMatchupResults.length > 0 && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <h3 className="text-sm font-bold text-indigo-800 mb-3">📋 Week {priorWeek} Results</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {priorWeekMatchupResults
              .sort((a, b) => Math.max(b.homePoints, b.awayPoints) - Math.max(a.homePoints, a.awayPoints))
              .map((m, i) => {
                const homeWon = m.winnerId === m.homeTeamId;
                const awayWon = m.winnerId === m.awayTeamId;
                return (
                  <div key={i} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 text-xs border border-indigo-100">
                    <span className={`font-semibold ${homeWon ? 'text-gray-900' : 'text-gray-400'} truncate flex-1`}>
                      {homeWon ? '✓ ' : ''}{m.homeTeamName}
                    </span>
                    <span className={`font-bold tabular-nums ${homeWon ? 'text-gray-900' : 'text-gray-400'}`}>
                      {m.homePoints.toFixed(1)}
                    </span>
                    <span className="text-gray-300 mx-1">–</span>
                    <span className={`font-bold tabular-nums ${awayWon ? 'text-gray-900' : 'text-gray-400'}`}>
                      {m.awayPoints.toFixed(1)}
                    </span>
                    <span className={`font-semibold ${awayWon ? 'text-gray-900' : 'text-gray-400'} truncate flex-1 text-right`}>
                      {awayWon ? '✓ ' : ''}{m.awayTeamName}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {bullets.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          No significant signals detected yet — check back after more games.
        </div>
      ) : (
      <div className="space-y-3">
      {bullets.map((b, i) => (
        <div
          key={i}
          className={`flex gap-3 rounded-xl border-l-4 p-4 ${CATEGORY_COLORS[b.category] || 'border-gray-300'} ${CATEGORY_BG[b.category] || 'bg-gray-50'}`}
        >
          <span className="text-xl flex-shrink-0 mt-0.5">{b.emoji}</span>
          <div className="min-w-0">
            <p
              className="text-sm text-gray-800 leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: b.headline.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'),
              }}
            />
            {b.detail && (
              <p className="text-xs text-gray-500 mt-1">{b.detail}</p>
            )}
          </div>
          <span className="ml-auto text-xs text-gray-400 flex-shrink-0 self-start mt-0.5">
            {b.priority}
          </span>
        </div>
      ))}
      <div className="pt-4 border-t border-gray-200">
        <button
          onClick={onCopy}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition"
        >
          Copy bullets to clipboard
        </button>
      </div>
    </div>
      )}
    </div>
  );
}

// ── Teams tab ─────────────────────────────────────────────────────────────────

function TeamsTab({ analytics }: { analytics: AdminAnalytics }) {
  const sorted = [...analytics.teamTrends].sort((a, b) => b.actualPointsFor - a.actualPointsFor);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Team</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Owner</th>
              <th className="text-center px-3 py-3 font-semibold text-gray-700">W-L</th>
              <th className="text-right px-3 py-3 font-semibold text-gray-700">Points</th>
              <th className="text-right px-3 py-3 font-semibold text-gray-700">Wk Scores</th>
              <th className="text-center px-3 py-3 font-semibold text-gray-700">Trend</th>
              <th className="text-right px-3 py-3 font-semibold text-gray-700">vs EROSP</th>
              <th className="text-right px-3 py-3 font-semibold text-gray-700">Season Hi/Lo</th>
              <th className="text-right px-3 py-3 font-semibold text-gray-700">All-Time Hi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map(t => {
              const pacePct = t.vsErospPacePct;
              const paceColor =
                pacePct > 5 ? 'text-green-600' : pacePct < -5 ? 'text-red-500' : 'text-gray-500';
              const atr = t.allTimeRecord;
              const shl = t.seasonHighLow;

              return (
                <tr key={t.teamId} className="hover:bg-gray-50 transition">
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <div className="flex items-center gap-1.5">
                      {t.isAllTimeHigh && <span title="All-time franchise high this week!">🏆</span>}
                      {t.isAllTimeLow && <span title="All-time franchise low this week!">💀</span>}
                      {t.isSeasonHigh && !t.isAllTimeHigh && <span title="Season high this week">📈</span>}
                      {t.isSeasonLow && !t.isAllTimeLow && <span title="Season low this week">📉</span>}
                      {t.teamName}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{t.owner}</td>
                  <td className="px-3 py-3 text-center text-gray-700">{t.record}</td>
                  <td className="px-3 py-3 text-right font-mono text-gray-900">
                    {t.actualPointsFor.toFixed(1)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-gray-600 text-xs">
                    {t.weeklyScores.length > 0 ? (
                      <div className="text-gray-400 text-[10px]">
                        {t.weeklyScores.map(w => `W${w.week}:${w.points.toFixed(0)}`).join(' ')}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-3 text-center">{trendIcon(t.trendDirection)}</td>
                  <td className={`px-3 py-3 text-right font-mono text-xs ${paceColor}`}>
                    {pacePct > 0 ? '+' : ''}
                    {pacePct.toFixed(1)}%
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs text-gray-600">
                    {shl ? (
                      <div className="space-y-0.5">
                        <div className="text-green-700">↑ {Math.round(shl.highPoints)} <span className="text-gray-400">W{shl.highWeek}</span></div>
                        <div className="text-red-500">↓ {Math.round(shl.lowPoints)} <span className="text-gray-400">W{shl.lowWeek}</span></div>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-xs text-gray-500">
                    {atr ? (
                      <div className="space-y-0.5">
                        <div className={`font-semibold ${t.isAllTimeHigh ? 'text-amber-600' : 'text-gray-700'}`}>
                          {Math.round(atr.highPoints)}
                          <span className="text-gray-400 font-normal ml-1">'{String(atr.highYear).slice(2)} W{atr.highWeek}</span>
                        </div>
                        <div className={`text-[10px] ${t.isAllTimeLow ? 'text-red-600' : 'text-gray-400'}`}>
                          Lo: {Math.round(atr.lowPoints)} '{String(atr.lowYear).slice(2)} W{atr.lowWeek}
                        </div>
                      </div>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        🏆 = all-time franchise high this week · 💀 = all-time franchise low · 📈/📉 = season high/low · Banshees records from 2025 only
      </p>
    </div>
  );
}

// helper used in TeamsTab
function mean(arr: number[]) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

// ── Players tab ───────────────────────────────────────────────────────────────

function PlayersTab({ analytics }: { analytics: AdminAnalytics }) {
  const over = analytics.playerSignals.filter(s => s.signalType === 'overperforming');
  const under = analytics.playerSignals.filter(s => s.signalType === 'underperforming');
  const injury = analytics.playerSignals.filter(s => s.signalType === 'injury_watch');

  function PlayerCard({ sig }: { sig: (typeof analytics.playerSignals)[0] }) {
    const isOver = sig.signalType === 'overperforming';
    const isInjury = sig.signalType === 'injury_watch';
    const devPct = sig.deviationPct;

    const borderColor = isInjury ? 'border-red-300' : isOver ? 'border-green-300' : 'border-orange-300';
    const badgeBg = isInjury ? 'bg-red-100 text-red-700' : isOver ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700';

    return (
      <div className={`rounded-xl border-2 ${borderColor} bg-white p-4`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="font-semibold text-gray-900 text-sm">{sig.playerName}</span>
            <span className="ml-2 text-xs text-gray-400">{sig.position}</span>
            {isInjury && sig.ilType && (
              <span className="ml-2 text-xs font-semibold text-red-600">{sig.ilType}</span>
            )}
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badgeBg}`}>
            {isInjury
              ? `IL${sig.ilDaysRemaining ? ` ~${sig.ilDaysRemaining}d` : ''}`
              : `${devPct > 0 ? '+' : ''}${devPct.toFixed(0)}%`}
          </span>
        </div>
        <div className="text-xs text-gray-500 mt-0.5">{sig.teamName}</div>
        {sig.injuryNote && (
          <div className="text-xs text-red-500 mt-1 italic">{sig.injuryNote}</div>
        )}
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div className="text-center">
            <div className="font-mono font-semibold text-gray-900">{sig.totalPoints.toFixed(1)}</div>
            <div className="text-gray-400">actual pts</div>
          </div>
          <div className="text-center">
            <div className="font-mono font-semibold text-gray-600">{sig.erospPace.toFixed(1)}</div>
            <div className="text-gray-400">pace</div>
          </div>
          <div className="text-center">
            <div className="font-mono font-semibold text-indigo-600">{Math.round(sig.erospRaw)}</div>
            <div className="text-gray-400">EROSP proj</div>
          </div>
        </div>
      </div>
    );
  }

  function Section({ title, signals, empty }: { title: string; signals: typeof analytics.playerSignals; empty: string }) {
    return (
      <div>
        <h3 className="font-semibold text-gray-700 mb-3">{title}</h3>
        {signals.length === 0 ? (
          <p className="text-sm text-gray-400 italic">{empty}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {signals.map((s, i) => <PlayerCard key={i} sig={s} />)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Section title="⭐ Outperforming Pace" signals={over} empty="Not enough data yet" />
      <Section title="🧊 Underperforming Pace" signals={under} empty="Not enough data yet" />
      <Section title="🚨 Injury Watch" signals={injury} empty="No significant IL players flagged" />
    </div>
  );
}

// ── Positions tab ─────────────────────────────────────────────────────────────

function PositionsTab({ analytics }: { analytics: AdminAnalytics }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {analytics.positionGroups.map(pg => {
        const top3 = pg.teams.slice(0, 3);
        const bottom3 = pg.teams.slice(-3).reverse();
        return (
          <div key={pg.group} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
              <span className="font-bold text-gray-900">{pg.group}</span>
              <span className="text-xs text-gray-400">
                avg {Math.round(pg.leagueAvg)} pts · σ {Math.round(pg.leagueStdDev)}
              </span>
            </div>
            <div className="p-3 space-y-1">
              <div className="text-xs font-semibold text-green-700 mb-1">Top</div>
              {top3.map(t => (
                <div key={t.teamId} className="flex items-start gap-2 text-xs py-0.5">
                  <span className="font-bold text-green-700 w-6 flex-shrink-0">{ordinal(t.rank)}</span>
                  <div className="min-w-0">
                    <span className="font-medium text-gray-800">{t.teamName}</span>
                    <span className="text-gray-400 ml-1">
                      {Math.round(t.erospTotal)} pts
                      {t.zScore !== 0 && ` (z${t.zScore > 0 ? '+' : ''}${t.zScore.toFixed(1)})`}
                    </span>
                    {t.players.slice(0, 2).length > 0 && (
                      <div className="text-gray-400 truncate">
                        {t.players.slice(0, 2).map(p => p.name).join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div className="border-t border-gray-100 my-2" />
              <div className="text-xs font-semibold text-red-600 mb-1">Bottom</div>
              {bottom3.map(t => (
                <div key={t.teamId} className="flex items-start gap-2 text-xs py-0.5">
                  <span className="font-bold text-red-500 w-6 flex-shrink-0">{ordinal(t.rank)}</span>
                  <div className="min-w-0">
                    <span className="font-medium text-gray-800">{t.teamName}</span>
                    <span className="text-gray-400 ml-1">
                      {Math.round(t.erospTotal)} pts
                      {t.zScore !== 0 && ` (z${t.zScore > 0 ? '+' : ''}${t.zScore.toFixed(1)})`}
                    </span>
                    {t.players.slice(0, 2).length > 0 && (
                      <div className="text-gray-400 truncate">
                        {t.players.slice(0, 2).map(p => p.name).join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Units tab ─────────────────────────────────────────────────────────────────

function UnitsTab({ analytics }: { analytics: AdminAnalytics }) {
  const { unitStats, priorWeek, currentWeek } = analytics;
  const displayWeek = priorWeek || currentWeek;
  const hasData = unitStats.some(u => u.teams.some(t => t.actualPts > 0));

  if (!hasData) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        No scoring data yet — unit breakdown available once games are recorded.
      </div>
    );
  }

  function rankColor(rank: number, total: number) {
    if (rank <= 2) return 'text-green-700 font-bold';
    if (rank >= total - 1) return 'text-red-500 font-bold';
    return 'text-gray-700';
  }

  function zBadge(z: number) {
    if (z >= 1.5) return <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-green-100 text-green-800">+{z.toFixed(1)}σ</span>;
    if (z >= 0.5) return <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-green-50 text-green-700">+{z.toFixed(1)}σ</span>;
    if (z <= -1.5) return <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-red-100 text-red-700">{z.toFixed(1)}σ</span>;
    if (z <= -0.5) return <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-red-50 text-red-600">{z.toFixed(1)}σ</span>;
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400 mb-4">
        Actual 2026 fantasy points scored by position group through Week {displayWeek}. Uses EROSP role (SP/RP) to correctly split pitchers.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {unitStats.map(ug => {
          const teamsWithData = ug.teams.filter(t => t.actualPts > 0);
          const total = ug.teams.length;
          return (
            <div key={ug.group} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <span className="font-bold text-gray-900 text-sm">{ug.group}</span>
                  <span className="ml-2 text-xs text-gray-500">{ug.label}</span>
                </div>
                <span className="text-xs text-gray-400">
                  avg {Math.round(ug.leagueAvg)} pts
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {ug.teams.map(t => (
                  <div key={t.teamId} className={`px-3 py-2 flex items-start gap-2 ${t.actualPts === 0 ? 'opacity-40' : ''}`}>
                    <span className={`text-xs w-5 flex-shrink-0 ${rankColor(t.rank, total)}`}>{t.rank}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-medium text-gray-800 truncate">{t.teamName}</span>
                        {t.actualPts > 0 && zBadge(t.zScore)}
                      </div>
                      {t.players.slice(0, 3).length > 0 && (
                        <div className="text-[10px] text-gray-400 truncate mt-0.5">
                          {t.players.slice(0, 3).map(p => `${p.name.split(' ').slice(-1)[0]} ${p.pts.toFixed(0)}`).join(' · ')}
                        </div>
                      )}
                    </div>
                    <span className={`text-xs font-mono flex-shrink-0 ${rankColor(t.rank, total)}`}>
                      {t.actualPts > 0 ? Math.round(t.actualPts) : '—'}
                    </span>
                  </div>
                ))}
                {teamsWithData.length === 0 && (
                  <div className="px-3 py-3 text-xs text-gray-400 italic">No scoring data yet</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Moves tab ─────────────────────────────────────────────────────────────────

function MovesTab({ analytics }: { analytics: AdminAnalytics }) {
  const adds = analytics.rosterMoves.filter(m => m.acquisitionType === 'ADD');
  const trades = analytics.rosterMoves.filter(m => m.acquisitionType === 'TRADE');

  function MoveRow({ mv }: { mv: (typeof analytics.rosterMoves)[0] }) {
    return (
      <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
        <div className="flex-1 min-w-0">
          <span className="font-medium text-gray-900 text-sm">{mv.playerName}</span>
          <span className="ml-2 text-xs text-gray-400">{mv.teamName}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {impactBadge(mv.impact)}
          <span className="font-mono text-xs text-indigo-600 font-semibold">
            {Math.round(mv.erospRaw)} pts
          </span>
        </div>
        <div className="text-xs text-gray-400 hidden sm:block max-w-[200px] truncate">
          {mv.note}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-700 mb-3">Free Agent Adds</h3>
        {adds.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No notable FA adds found in roster data.</p>
        ) : (
          <div>{adds.map((mv, i) => <MoveRow key={i} mv={mv} />)}</div>
        )}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-700 mb-3">Trades</h3>
        {trades.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No trades found in roster data.</p>
        ) : (
          <div>{trades.map((mv, i) => <MoveRow key={i} mv={mv} />)}</div>
        )}
      </div>
    </div>
  );
}

// ── Storylines tab ────────────────────────────────────────────────────────────

function StorylinesTab({ analytics }: { analytics: AdminAnalytics }) {
  const { rankingsThemes } = analytics;

  if (rankingsThemes.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">
          No rankings posted yet. Themes will appear here once articles are published.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {rankingsThemes.map((theme, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-medium text-gray-900 text-sm">{theme.name}</div>
              <div className="text-xs text-gray-400 mt-0.5">
                {theme.type === 'player' ? '🏃 Player' : '🏟️ Team'} ·{' '}
                {theme.mentionCount} mention{theme.mentionCount !== 1 ? 's' : ''}
              </div>
            </div>
            {statusBadge(theme.currentStatus)}
          </div>
          {theme.lastSeen && (
            <div className="text-xs text-gray-400 mt-2">
              Last: {formatDate(theme.lastSeen)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Notes tab ─────────────────────────────────────────────────────────────────

function NotesTab({
  analytics,
  adminNotes,
  onCopyAll,
}: {
  analytics: AdminAnalytics;
  adminNotes: AdminNotes;
  onCopyAll: (text: string) => void;
}) {
  const week = analytics.priorWeek || analytics.currentWeek;
  const weekKey = String(week);
  const savedNote = adminNotes.weeks[weekKey];

  const [text, setText] = useState(savedNote?.text ?? '');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  async function handleSave() {
    if (!pin) { setSaveMsg('Enter your admin PIN'); return; }
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch('/api/admin/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, week, text }),
      });
      if (res.ok) {
        setSaveMsg('Saved!');
      } else {
        const d = await res.json();
        setSaveMsg(d.error || 'Save failed');
      }
    } catch {
      setSaveMsg('Network error');
    } finally {
      setSaving(false);
    }
  }

  function buildCopyAll() {
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const bulletLines = analytics.bullets
      .map(b => `• ${b.headline.replace(/\*\*(.+?)\*\*/g, '$1')}`)
      .join('\n');
    return `=== CBA Week ${week} Editorial Notes ===\nGenerated: ${today}\n\nAUTO-GENERATED SIGNALS:\n${bulletLines}\n\nMANUAL NOTES:\n${text}`;
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-gray-700">Week {week} Notes</h3>
        {savedNote?.updatedAt && (
          <span className="text-xs text-gray-400">
            Last saved {formatDate(savedNote.updatedAt)}
          </span>
        )}
      </div>
      <textarea
        rows={8}
        value={text}
        onChange={e => setText(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
        placeholder="Your editorial notes for this week..."
      />
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="password"
          value={pin}
          onChange={e => setPin(e.target.value)}
          placeholder="Admin PIN"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-teal-400"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-300 text-white text-sm font-medium rounded-lg transition"
        >
          {saving ? 'Saving…' : 'Save Notes'}
        </button>
        <button
          onClick={() => onCopyAll(buildCopyAll())}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition"
        >
          Copy All (bullets + notes)
        </button>
        {saveMsg && (
          <span className={`text-sm ${saveMsg === 'Saved!' ? 'text-green-600' : 'text-red-500'}`}>
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function AdminDashboardClient({ analytics, adminNotes }: Props) {
  const { isAdmin, unlock } = useAdminMode();
  const [activeTab, setActiveTab] = useState<Tab>('bullets');
  const [copyMsg, setCopyMsg] = useState('');

  if (!isAdmin) return <LockScreen unlock={unlock} />;

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
  });

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopyMsg('Copied!');
      setTimeout(() => setCopyMsg(''), 2000);
    });
  }

  function buildBulletsCopyText() {
    return analytics.bullets
      .map(b => `• ${b.emoji} ${b.headline.replace(/\*\*(.+?)\*\*/g, '$1')}`)
      .join('\n');
  }

  function buildAiExport(): string {
    const week = analytics.priorWeek || analytics.currentWeek;
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const lines: string[] = [];

    lines.push(`=== CBA FANTASY LEAGUE — WEEK ${week} EDITORIAL DATA ===`);
    lines.push(`Generated: ${today}`);
    lines.push(`Context: 10-team keeper fantasy baseball league (ESPN). Use this data to write weekly power rankings.`);
    lines.push('');

    // Prior week results
    if (analytics.priorWeek > 0 && analytics.priorWeekMatchupResults.length > 0) {
      lines.push(`--- WEEK ${analytics.priorWeek} MATCHUP RESULTS ---`);
      for (const m of [...analytics.priorWeekMatchupResults].sort((a, b) =>
        Math.max(b.homePoints, b.awayPoints) - Math.max(a.homePoints, a.awayPoints)
      )) {
        const homeWon = m.winnerId === m.homeTeamId;
        lines.push(`${homeWon ? '[W]' : '   '} ${m.homeTeamName} ${m.homePoints.toFixed(1)} — ${m.awayPoints.toFixed(1)} ${m.awayTeamName} ${homeWon ? '' : '[W]'}`);
      }
      lines.push('');
    }

    // Bullets
    lines.push('--- AUTO-GENERATED SIGNALS ---');
    for (const b of analytics.bullets) {
      const plain = b.headline.replace(/\*\*(.+?)\*\*/g, '$1');
      lines.push(`${b.emoji} [${b.category}] ${plain}`);
      if (b.detail) lines.push(`   ${b.detail}`);
    }
    lines.push('');

    // Teams
    lines.push('--- TEAMS (sorted by total points) ---');
    const sortedTeams = [...analytics.teamTrends].sort((a, b) => b.actualPointsFor - a.actualPointsFor);
    for (const t of sortedTeams) {
      const weekScores = t.weeklyScores.map(w => `W${w.week}:${w.points.toFixed(0)}`).join(' ');
      const pace = `${t.vsErospPacePct > 0 ? '+' : ''}${t.vsErospPacePct.toFixed(1)}% vs EROSP`;
      lines.push(`${t.teamName} (${t.owner}) | ${t.record} | ${t.actualPointsFor.toFixed(1)} pts | trend:${t.trendDirection} | ${pace}`);
      if (weekScores) lines.push(`  Weekly: ${weekScores}`);
    }
    lines.push('');

    // Players
    lines.push('--- PLAYER SIGNALS ---');
    const over = analytics.playerSignals.filter(s => s.signalType === 'overperforming');
    const under = analytics.playerSignals.filter(s => s.signalType === 'underperforming');
    const inj = analytics.playerSignals.filter(s => s.signalType === 'injury_watch');
    if (over.length) {
      lines.push('Overperforming:');
      for (const s of over) lines.push(`  ${s.playerName} (${s.teamName}, ${s.position}) — ${s.totalPoints.toFixed(1)} actual vs ${s.erospPace.toFixed(1)} pace (${Math.round(s.erospRaw)} EROSP)`);
    }
    if (under.length) {
      lines.push('Underperforming:');
      for (const s of under) lines.push(`  ${s.playerName} (${s.teamName}, ${s.position}) — ${s.totalPoints.toFixed(1)} actual vs ${s.erospPace.toFixed(1)} pace (${Math.round(s.erospRaw)} EROSP)`);
    }
    if (inj.length) {
      lines.push('Injury Watch:');
      for (const s of inj) lines.push(`  ${s.playerName} (${s.teamName}) — ${s.ilType} IL, ${s.ilDaysRemaining ?? '?'}d remaining, ${Math.round(s.erospRaw)} EROSP${s.injuryNote ? `: ${s.injuryNote}` : ''}`);
    }
    lines.push('');

    // Positions (EROSP)
    lines.push('--- POSITION GROUP STRENGTH (EROSP projected pts) ---');
    for (const pg of analytics.positionGroups) {
      lines.push(`${pg.group} — league avg: ${Math.round(pg.leagueAvg)} pts`);
      for (const t of pg.teams) {
        const z = t.zScore !== 0 ? ` (z${t.zScore > 0 ? '+' : ''}${t.zScore.toFixed(1)})` : '';
        const players = t.players.slice(0, 3).map(p => p.name).join(', ');
        lines.push(`  ${t.rank}. ${t.teamName}: ${Math.round(t.erospTotal)} pts${z}${players ? ` — ${players}` : ''}`);
      }
    }
    lines.push('');

    // Units (Actual)
    const hasUnits = analytics.unitStats.some(u => u.teams.some(t => t.actualPts > 0));
    if (hasUnits) {
      lines.push('--- UNIT STATS (actual 2026 pts scored) ---');
      for (const ug of analytics.unitStats) {
        const teamsWithData = ug.teams.filter(t => t.actualPts > 0);
        if (teamsWithData.length === 0) continue;
        lines.push(`${ug.group} (${ug.label}) — avg: ${Math.round(ug.leagueAvg)} pts`);
        for (const t of ug.teams) {
          if (t.actualPts === 0) continue;
          const players = t.players.slice(0, 3).map(p => `${p.name.split(' ').slice(-1)[0]} ${p.pts.toFixed(0)}`).join(', ');
          lines.push(`  ${t.rank}. ${t.teamName}: ${Math.round(t.actualPts)} pts${players ? ` — ${players}` : ''}`);
        }
      }
      lines.push('');
    }

    // Moves
    const adds = analytics.rosterMoves.filter(m => m.acquisitionType === 'ADD');
    const trades = analytics.rosterMoves.filter(m => m.acquisitionType === 'TRADE');
    if (adds.length || trades.length) {
      lines.push('--- ROSTER MOVES ---');
      if (adds.length) {
        lines.push('FA Adds:');
        for (const mv of adds) lines.push(`  ${mv.teamName} added ${mv.playerName} — ${Math.round(mv.erospRaw)} projected pts [${mv.impact}]`);
      }
      if (trades.length) {
        lines.push('Trades:');
        for (const mv of trades) lines.push(`  ${mv.teamName} acquired ${mv.playerName} — ${Math.round(mv.erospRaw)} projected pts`);
      }
      lines.push('');
    }

    lines.push('=== END OF DATA ===');
    lines.push('Please write weekly power rankings covering all 10 teams with analysis, rankings (1-10), and compelling narrative using the above data.');
    return lines.join('\n');
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'bullets', label: 'Bullets' },
    { id: 'teams', label: 'Teams' },
    { id: 'players', label: 'Players' },
    { id: 'positions', label: 'Positions (EROSP)' },
    { id: 'units', label: 'Units (Actual)' },
    { id: 'moves', label: 'Moves' },
    { id: 'storylines', label: 'Storylines' },
    { id: 'notes', label: 'Notes' },
    { id: 'export', label: '🤖 AI Export' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-400 hover:text-gray-600 transition text-sm">
              ← Home
            </Link>
            <div>
              <h1 className="text-lg font-bold text-gray-900">📊 Editorial Intelligence Dashboard</h1>
              <p className="text-xs text-gray-400">
                {today} · {analytics.priorWeek > 0
                  ? <>Covering <strong>Week {analytics.priorWeek}</strong> results{analytics.currentWeek > analytics.priorWeek ? ` · Week ${analytics.currentWeek} in progress` : ''}</>
                  : `Week ${analytics.currentWeek}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {copyMsg && <span className="text-xs text-green-600 font-medium">{copyMsg}</span>}
            <button
              onClick={() => copyToClipboard(buildBulletsCopyText())}
              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded-lg transition"
            >
              📋 Copy Bullets
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition ${
                  activeTab === tab.id
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'bullets' && (
          <BulletsTab analytics={analytics} onCopy={() => copyToClipboard(buildBulletsCopyText())} />
        )}
        {activeTab === 'teams' && <TeamsTab analytics={analytics} />}
        {activeTab === 'players' && <PlayersTab analytics={analytics} />}
        {activeTab === 'positions' && <PositionsTab analytics={analytics} />}
        {activeTab === 'units' && <UnitsTab analytics={analytics} />}
        {activeTab === 'moves' && <MovesTab analytics={analytics} />}
        {activeTab === 'storylines' && <StorylinesTab analytics={analytics} />}
        {activeTab === 'notes' && (
          <NotesTab
            analytics={analytics}
            adminNotes={adminNotes}
            onCopyAll={copyToClipboard}
          />
        )}
        {activeTab === 'export' && (
          <AiExportTab exportText={buildAiExport()} onCopy={copyToClipboard} />
        )}
      </div>
    </div>
  );
}

// ── AI Export tab ─────────────────────────────────────────────────────────────

function AiExportTab({ exportText, onCopy }: { exportText: string; onCopy: (text: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">AI Export</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            All data from Bullets, Teams, Players, Positions, Units, and Moves — formatted for pasting into Claude or ChatGPT.
          </p>
        </div>
        <button
          onClick={() => onCopy(exportText)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition flex-shrink-0"
        >
          📋 Copy All to Clipboard
        </button>
      </div>
      <textarea
        readOnly
        value={exportText}
        rows={30}
        className="w-full font-mono text-xs text-gray-700 border border-gray-200 rounded-xl px-4 py-3 bg-gray-50 focus:outline-none resize-none"
        onClick={e => (e.target as HTMLTextAreaElement).select()}
      />
      <p className="text-xs text-gray-400">Click the text area to select all, or use the Copy button above.</p>
    </div>
  );
}
