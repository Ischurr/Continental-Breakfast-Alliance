import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getEmailOptouts, getWinProbability } from '@/lib/store';
import type { MatchupWinProbabilityView } from '@/lib/fantasy/winProbability';
import type { WinProbabilityStore } from '@/lib/fantasy/nightlyJob';
import type { DailyLineupResponse, LineupPlayer } from '@/app/api/daily-lineup/[teamId]/route';
import type { WeeklySpPlan, SpStartEntry } from '@/lib/fantasy/weeklySpPlan';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

// ── Types ──────────────────────────────────────────────────────────────────────

interface OwnerEmail { teamId: number; owner: string; email: string; }
interface TeamMeta { id: number; displayName: string; primaryColor: string; }

interface LiveScoreMatchup {
  week: number;
  homeTeamId: number;
  homeScore: number;
  awayTeamId: number;
  awayScore: number;
  winner?: string;
}

// ── Auth ───────────────────────────────────────────────────────────────────────

function isAuthorized(request: Request): boolean {
  const auth = request.headers.get('authorization') ?? '';
  const wpSecret = process.env['WIN_PROBABILITY_SECRET'];
  if (wpSecret && auth === `Bearer ${wpSecret}`) return true;
  // Also accept RESEND_API_KEY for local testing (both are server-side secrets)
  const resendKey = process.env['RESEND_API_KEY'];
  if (resendKey && auth === `Bearer ${resendKey}`) return true;
  return false;
}

// ── Data helpers ───────────────────────────────────────────────────────────────

function readJson<T>(relPath: string): T {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8')) as T;
}

async function fetchLineup(teamId: number, siteUrl: string): Promise<DailyLineupResponse | null> {
  try {
    const res = await fetch(`${siteUrl}/api/daily-lineup/${teamId}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return res.json() as Promise<DailyLineupResponse>;
  } catch {
    return null;
  }
}

async function fetchLiveScores(siteUrl: string): Promise<LiveScoreMatchup[]> {
  try {
    const res = await fetch(`${siteUrl}/api/live-scores`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { matchups?: LiveScoreMatchup[] };
    return data.matchups ?? [];
  } catch {
    return [];
  }
}

// ── HTML template ──────────────────────────────────────────────────────────────

function statusBadge(player: LineupPlayer): string {
  if (player.ilType) return `<span style="background:#92400e;color:#fde68a;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.5px;">IL</span>&nbsp;`;
  if (player.injuryStatus === 'OUT') return `<span style="background:#7f1d1d;color:#fca5a5;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.5px;">OUT</span>&nbsp;`;
  if (player.injuryStatus === 'DOUBTFUL') return `<span style="background:#7f1d1d;color:#fca5a5;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.5px;">DBTFL</span>&nbsp;`;
  if (player.injuryStatus === 'DAY_TO_DAY' || player.injuryStatus === 'QUESTIONABLE') return `<span style="background:#78350f;color:#fde68a;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.5px;">D2D</span>&nbsp;`;
  return '';
}

function gameContext(player: LineupPlayer): string {
  if (!player.hasGame) return `<span style="color:#6b7280;font-size:12px;">No game today</span>`;
  const ha = player.isHome ? 'vs' : '@';
  const opp = player.opponentAbbr ?? '—';
  let line = `<span style="color:#9ca3af;font-size:12px;">${ha} <strong style="color:#c9d1d9;">${opp}</strong>`;
  if (player.role === 'SP' && player.isStartingToday) {
    line += `&nbsp;<span style="background:#1d4ed8;color:#bfdbfe;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:0.3px;">▶ STARTING</span>`;
  } else if (player.role === 'SP' && !player.isStartingToday) {
    line += `&nbsp;<span style="color:#6b7280;font-size:11px;">not starting</span>`;
  }
  if (player.role === 'H' && player.probablePitcherName) {
    const era = player.probablePitcherEra != null ? ` <span style="color:#6b7280;">(${player.probablePitcherEra.toFixed(2)} ERA)</span>` : '';
    line += ` &middot; <span style="font-size:11px;color:#8b949e;">${player.probablePitcherName}${era}</span>`;
  }
  line += `</span>`;
  return line;
}

function ptsDisplay(pts: number): string {
  if (pts <= 0) return `<span style="color:#4b5563;font-size:13px;">—</span>`;
  return `<span style="color:#34d399;font-size:14px;font-weight:700;">~${pts.toFixed(1)}</span>`;
}

function playerRow(player: LineupPlayer, isStarter: boolean): string {
  const slotLabel = isStarter ? (player.slot ?? '—') : player.primaryPosition;
  const slotBg = isStarter ? '#21262d' : '#161b22';
  const slotColor = isStarter ? '#8b949e' : '#4b5563';
  const photoUrl = player.photoUrl || `https://a.espncdn.com/i/headshots/mlb/players/full/${player.espnId}.png`;
  const dimmed = player.estimatedTodayPoints === 0;

  return `
<tr style="border-bottom:1px solid #21262d;${dimmed ? 'opacity:0.55;' : ''}">
  <td style="padding:11px 12px 11px 16px;width:48px;vertical-align:middle;">
    <span style="background:${slotBg};color:${slotColor};padding:3px 7px;border-radius:5px;font-size:11px;font-weight:700;letter-spacing:0.3px;white-space:nowrap;border:1px solid #30363d;">${slotLabel}</span>
  </td>
  <td class="photo-cell" style="padding:11px 8px;width:40px;vertical-align:middle;">
    <img src="${photoUrl}" width="34" height="34" style="border-radius:50%;display:block;border:2px solid #30363d;" />
  </td>
  <td style="padding:11px 6px;vertical-align:middle;">
    <div style="font-size:14px;font-weight:600;color:#e6edf3;line-height:1.3;">${statusBadge(player)}${player.name}</div>
    <div style="margin-top:3px;">${gameContext(player)}</div>
  </td>
  <td style="padding:11px 16px 11px 8px;text-align:right;vertical-align:middle;white-space:nowrap;">
    ${ptsDisplay(player.estimatedTodayPoints)}
  </td>
</tr>`;
}

function buildActionItems(starters: LineupPlayer[], bench: LineupPlayer[], weeklySpPlan?: WeeklySpPlan): string {
  // Determine if a bench player is eligible to fill a given starter slot.
  // slot examples: "C", "1B", "2B", "3B", "SS", "OF", "MI", "CI", "DH", "UTIL", "SP1"…"SP6", "RP1"…"RP3"
  function canFillSlot(bench: LineupPlayer, slotRaw: string): boolean {
    const slot = slotRaw.replace(/\d+$/, ''); // strip trailing number: "SP2" → "SP", "OF1" → "OF"
    const pos = bench.eligiblePositions ?? [];
    if (slot === 'SP') return bench.role === 'SP';
    if (slot === 'RP') return bench.role === 'RP';
    if (slot === 'MI') return pos.includes('2B') || pos.includes('SS');
    if (slot === 'CI') return pos.includes('1B') || pos.includes('3B');
    if (slot === 'UTIL' || slot === 'DH') return bench.role === 'H';
    return pos.includes(slot); // C, 1B, 2B, 3B, SS, OF
  }

  function deadReason(p: LineupPlayer): string {
    if (p.ilType) return `On IL (${p.ilType})`;
    if (p.injuryStatus === 'OUT' || p.injuryStatus === 'DOUBTFUL') return p.injuryStatus ?? 'Injured';
    if (!p.hasGame) return 'No game today';
    if (p.role === 'SP' && !p.isStartingToday) return 'Not starting today';
    return 'Not active';
  }

  // Eligible bench candidates sorted best-first; each can only be used once
  const availableBench = bench
    .filter(p => p.hasGame && p.estimatedTodayPoints >= 1.5)
    .sort((a, b) => b.estimatedTodayPoints - a.estimatedTodayPoints);

  const usedBenchIds = new Set<string>();

  // For each dead starter, try to find the best eligible bench replacement
  const swaps: Array<{ out: LineupPlayer; in: LineupPlayer }> = [];
  for (const starter of starters.filter(p => p.estimatedTodayPoints === 0)) {
    const slot = starter.slot ?? starter.primaryPosition ?? '';
    const replacement = availableBench.find(
      b => !usedBenchIds.has(b.espnId) && canFillSlot(b, slot)
    );
    if (!replacement) continue; // no valid swap — skip entirely
    usedBenchIds.add(replacement.espnId);
    swaps.push({ out: starter, in: replacement });
  }

  // SP starting today but marked SKIP — better starts are coming later this week
  const skipAlerts: Array<{ sp: LineupPlayer; entry: SpStartEntry; betterStarts: SpStartEntry[] }> = [];
  if (weeklySpPlan) {
    const todaySkips = weeklySpPlan.entries.filter(e => e.isToday && !e.recommended && !e.isPast);
    for (const skippedEntry of todaySkips) {
      const sp = starters.find(p => p.role === 'SP' && p.espnId === skippedEntry.espnId);
      if (!sp) continue;
      const betterStarts = weeklySpPlan.entries
        .filter(e => !e.isToday && !e.isPast && e.recommended && e.projectedPoints > skippedEntry.projectedPoints)
        .sort((a, b) => b.projectedPoints - a.projectedPoints);
      skipAlerts.push({ sp, entry: skippedEntry, betterStarts });
    }
  }

  // Bench hitter who projects meaningfully better than a live starter they could replace
  const HITTER_UPGRADE_MIN_DIFF = 2.5;
  const hitterUpgrades: Array<{ out: LineupPlayer; in: LineupPlayer; diff: number }> = [];
  const usedUpgradeIds = new Set<string>();
  const liveHitterStarters = starters
    .filter(p => p.role === 'H' && p.estimatedTodayPoints > 0)
    .sort((a, b) => a.estimatedTodayPoints - b.estimatedTodayPoints); // weakest first
  const benchHitters = bench
    .filter(p => p.role === 'H' && p.hasGame && p.estimatedTodayPoints > 0)
    .sort((a, b) => b.estimatedTodayPoints - a.estimatedTodayPoints); // best first
  for (const benchPlayer of benchHitters) {
    for (const starter of liveHitterStarters) {
      const slot = starter.slot ?? starter.primaryPosition ?? '';
      const diff = benchPlayer.estimatedTodayPoints - starter.estimatedTodayPoints;
      if (diff < HITTER_UPGRADE_MIN_DIFF) continue;
      if (usedUpgradeIds.has(benchPlayer.espnId) || usedUpgradeIds.has(starter.espnId)) continue;
      if (!canFillSlot(benchPlayer, slot)) continue;
      usedUpgradeIds.add(benchPlayer.espnId);
      usedUpgradeIds.add(starter.espnId);
      hitterUpgrades.push({ out: starter, in: benchPlayer, diff });
      break; // each bench player can only displace one starter
    }
    if (hitterUpgrades.length >= 2) break; // cap at 2 to avoid email noise
  }

  if (swaps.length === 0 && skipAlerts.length === 0 && hitterUpgrades.length === 0) return '';

  const skipRows = skipAlerts.map(({ sp, entry, betterStarts }) => {
    const ha = entry.isHome ? 'vs' : '@';
    const topBetter = betterStarts.slice(0, 2);
    const betterDesc = topBetter.map(e => {
      const d = new Date(e.date + 'T12:00:00');
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const eha = e.isHome ? 'vs' : '@';
      return `${e.playerName} (${dayLabel} ${eha} ${e.opponentAbbr}, ~${e.projectedPoints.toFixed(1)} pts)`;
    }).join(' · ');
    return `
    <tr>
      <td style="padding:8px 12px 8px 16px;vertical-align:middle;">
        <div style="font-size:12px;color:#f59e0b;font-weight:600;">CONSIDER BENCHING</div>
        <div style="font-size:13px;font-weight:600;color:#e6edf3;">${sp.name}</div>
        <div style="font-size:11px;color:#8b949e;margin-top:1px;">${ha} ${entry.opponentAbbr} today · ~${entry.projectedPoints.toFixed(1)} pts</div>
      </td>
      <td style="padding:8px 8px;vertical-align:middle;text-align:center;width:28px;">
        <span style="color:#6b7280;font-size:14px;">→</span>
      </td>
      <td style="padding:8px 16px 8px 4px;vertical-align:middle;">
        <div style="font-size:12px;color:#f59e0b;font-weight:600;">BETTER STARTS COMING</div>
        <div style="font-size:11px;color:#8b949e;margin-top:2px;line-height:1.5;">${betterDesc || 'Higher-projected starts later this week'}</div>
      </td>
    </tr>
    <tr><td colspan="3" style="padding:0 16px;"><div style="height:1px;background:#21262d;"></div></td></tr>`;
  }).join('');

  const hitterUpgradeRows = hitterUpgrades.map(({ out: o, in: r, diff }) => {
    const oHa = o.isHome ? 'vs' : '@';
    const rHa = r.isHome ? 'vs' : '@';
    return `
    <tr>
      <td style="padding:8px 12px 8px 16px;vertical-align:middle;">
        <div style="font-size:12px;color:#f59e0b;font-weight:600;">CONSIDER BENCHING</div>
        <div style="font-size:13px;font-weight:600;color:#e6edf3;">${o.name}</div>
        <div style="font-size:11px;color:#8b949e;margin-top:1px;">${oHa} ${o.opponentAbbr ?? '?'} · ~${o.estimatedTodayPoints.toFixed(1)} pts</div>
      </td>
      <td style="padding:8px 8px;vertical-align:middle;text-align:center;width:28px;">
        <span style="color:#6b7280;font-size:14px;">→</span>
      </td>
      <td style="padding:8px 16px 8px 4px;vertical-align:middle;">
        <div style="font-size:12px;color:#34d399;font-weight:600;">START INSTEAD (+${diff.toFixed(1)} pts)</div>
        <div style="font-size:13px;font-weight:600;color:#e6edf3;">${r.name}</div>
        <div style="font-size:11px;color:#8b949e;margin-top:1px;">${rHa} ${r.opponentAbbr ?? '?'} · <span style="color:#34d399;">~${r.estimatedTodayPoints.toFixed(1)} pts</span></div>
      </td>
    </tr>
    <tr><td colspan="3" style="padding:0 16px;"><div style="height:1px;background:#21262d;"></div></td></tr>`;
  }).join('');

  const rows = swaps.map(({ out: o, in: r }) => {
    const ha = r.isHome ? 'vs' : '@';
    const opp = r.opponentAbbr ?? '?';
    return `
    <tr>
      <td style="padding:8px 12px 8px 16px;vertical-align:middle;">
        <div style="font-size:12px;color:#f87171;font-weight:600;">BENCH</div>
        <div style="font-size:13px;font-weight:600;color:#e6edf3;">${o.name}</div>
        <div style="font-size:11px;color:#f87171;margin-top:1px;">${deadReason(o)}</div>
      </td>
      <td style="padding:8px 8px;vertical-align:middle;text-align:center;width:28px;">
        <span style="color:#6b7280;font-size:16px;">→</span>
      </td>
      <td style="padding:8px 16px 8px 4px;vertical-align:middle;">
        <div style="font-size:12px;color:#34d399;font-weight:600;">START</div>
        <div style="font-size:13px;font-weight:600;color:#e6edf3;">${r.name}</div>
        <div style="font-size:11px;color:#8b949e;margin-top:1px;">${ha} ${opp} &middot; <span style="color:#34d399;">~${r.estimatedTodayPoints.toFixed(1)} pts</span></div>
      </td>
    </tr>
    <tr><td colspan="3" style="padding:0 16px;"><div style="height:1px;background:#21262d;"></div></td></tr>`;
  }).join('');

  const hasHardSwaps = swaps.length > 0;
  const hasSoftAlerts = skipAlerts.length > 0 || hitterUpgrades.length > 0;
  const sectionTitle = hasSoftAlerts && !hasHardSwaps
    ? '📋 Lineup Heads-Up'
    : '📋 Today\'s Lineup Changes';

  return `
  <tr><td class="outer-pad" style="padding:14px 16px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #30363d;border-radius:10px;overflow:hidden;">
      <tr><td colspan="3" style="background:#1c2128;padding:10px 16px;border-bottom:1px solid #30363d;">
        <span style="font-size:11px;font-weight:700;letter-spacing:1px;color:#c9d1d9;text-transform:uppercase;">${sectionTitle}</span>
      </td></tr>
      <tr><td colspan="3" style="padding:4px 0 4px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${skipRows}
          ${hitterUpgradeRows}
          ${rows}
        </table>
      </td></tr>
    </table>
  </td></tr>`;
}

function buildSpPlanHtml(plan: WeeklySpPlan | undefined): string {
  if (!plan || plan.entries.length === 0) return '';

  const future = plan.entries.filter(e => !e.isPast);
  const past   = plan.entries.filter(e => e.isPast);
  if (future.length === 0 && past.length === 0) return '';

  const todaySkips = future.filter(e => e.isToday && !e.recommended);
  const todayStarts = future.filter(e => e.isToday && e.recommended);

  function dayLabel(date: string, isToday: boolean): string {
    if (isToday) return 'Today';
    const d = new Date(date + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function entryRow(e: SpStartEntry, showBadge: boolean): string {
    const ha = e.isHome ? 'vs' : '@';
    const badge = showBadge && e.recommended
      ? `<span style="background:#052e16;color:#86efac;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.3px;margin-right:6px;">START</span>`
      : showBadge
      ? `<span style="background:#2d1515;color:#f87171;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.3px;margin-right:6px;">SKIP</span>`
      : `<span style="background:#1c2128;color:#6b7280;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.3px;margin-right:6px;">DONE</span>`;
    const pts = `<span style="color:${e.recommended ? '#34d399' : '#6b7280'};font-weight:700;">~${e.projectedPoints.toFixed(1)}</span>`;
    return `
    <tr style="border-bottom:1px solid #21262d;">
      <td style="padding:9px 8px 9px 16px;vertical-align:middle;white-space:nowrap;">${badge}</td>
      <td style="padding:9px 8px;vertical-align:middle;">
        <div style="font-size:13px;font-weight:600;color:#e6edf3;">${e.playerName}</div>
        <div style="font-size:11px;color:#8b949e;margin-top:1px;">${dayLabel(e.date, e.isToday)} · ${ha} ${e.opponentAbbr}${e.opponentPitcherName ? ` · <span style="color:#6b7280;">${e.opponentPitcherName}</span>` : ''}</div>
      </td>
      <td style="padding:9px 16px 9px 8px;text-align:right;vertical-align:middle;white-space:nowrap;">${pts} pts</td>
    </tr>`;
  }

  const startsLabel = `${plan.startsUsed} used · ${plan.startsRemaining} remaining`;
  const urgency = plan.startsRemaining <= 1 && todaySkips.length > 0
    ? `<span style="color:#f59e0b;font-size:11px;font-weight:600;"> ⚠ Only ${plan.startsRemaining} start${plan.startsRemaining === 1 ? '' : 's'} left</span>`
    : '';

  const futureRows = future.map(e => entryRow(e, true)).join('');
  const pastRows = past.length > 0
    ? `<tr><td colspan="3" style="padding:8px 16px 4px;font-size:10px;font-weight:700;letter-spacing:0.8px;color:#4b5563;text-transform:uppercase;">Already started this week</td></tr>
       ${past.map(e => entryRow(e, false)).join('')}`
    : '';

  return `
  <tr><td class="outer-pad" style="padding:14px 16px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #30363d;border-radius:10px;overflow:hidden;">
      <tr><td style="background:#1c2128;padding:10px 16px;border-bottom:1px solid #30363d;">
        <span style="font-size:11px;font-weight:700;letter-spacing:1px;color:#c9d1d9;text-transform:uppercase;">📅 Week ${plan.matchupWeek} SP Plan</span>
        <span style="font-size:11px;color:#6b7280;margin-left:10px;">${startsLabel}${urgency}</span>
      </td></tr>
      <tr><td style="padding:4px 0 4px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${futureRows}
          ${pastRows}
        </table>
      </td></tr>
    </table>
  </td></tr>`;
}

function buildEmailHtml(params: {
  teamName: string;
  teamColor: string;
  ownerName: string;
  date: string;
  myTeamId: number;
  matchup: LiveScoreMatchup | null;
  oppTeamName: string;
  winProb: MatchupWinProbabilityView | null;
  matchupWeek: number | null;
  lineup: DailyLineupResponse;
  siteUrl: string;
  optOutUrl: string;
}): string {
  const { teamName, teamColor, ownerName, date, matchup, oppTeamName, winProb, matchupWeek, lineup, siteUrl, optOutUrl, myTeamId } = params;

  const myScore = matchup
    ? (matchup.homeTeamId === myTeamId ? matchup.homeScore : matchup.awayScore)
    : 0;
  const oppScore = matchup
    ? (matchup.homeTeamId === myTeamId ? matchup.awayScore : matchup.homeScore)
    : 0;

  const isHome = matchup?.homeTeamId === myTeamId;
  const myWinPct = winProb
    ? (isHome ? winProb.homeWinPct : winProb.awayWinPct)
    : null;
  const myProjFinal = winProb
    ? (isHome ? winProb.projectedHomePoints : winProb.projectedAwayPoints)
    : null;
  const oppProjFinal = winProb
    ? (isHome ? winProb.projectedAwayPoints : winProb.projectedHomePoints)
    : null;
  const week = matchup?.week ?? matchupWeek ?? '—';

  const winBarWidth = myWinPct != null ? Math.max(3, Math.min(97, myWinPct)) : 50;
  const winBarColor = myWinPct != null
    ? (myWinPct >= 60 ? '#22c55e' : myWinPct <= 40 ? '#ef4444' : '#f59e0b')
    : '#6366f1';

  const batters = lineup.starters.filter(p => p.role === 'H');
  const pitchers = lineup.starters.filter(p => p.role === 'SP' || p.role === 'RP');
  const benchWithGames = lineup.bench.filter(p => p.hasGame && p.estimatedTodayPoints > 0).slice(0, 5);
  const totalEstPts = lineup.starters.reduce((s, p) => s + p.estimatedTodayPoints, 0);
  const spStartingToday = lineup.starters.filter(p => p.role === 'SP' && p.isStartingToday);

  const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const actionItemsHtml = buildActionItems(lineup.starters, lineup.bench, lineup.weeklySpPlan);
  const spPlanHtml = buildSpPlanHtml(lineup.weeklySpPlan);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Daily CBA Lineup — ${formattedDate}</title>
  <style>
    @media only screen and (max-width: 600px) {
      .outer-pad { padding-left: 12px !important; padding-right: 12px !important; }
      .header-pad { padding: 20px 16px 18px !important; }
      .score-num  { font-size: 32px !important; }
      .team-name  { font-size: 11px !important; }
      .btn-full   { display: block !important; text-align: center !important; }
      .unsub-right { display: block !important; text-align: center !important; padding-top: 12px !important; }
      .pill-wrap  { display: block !important; padding-bottom: 6px !important; }
      .photo-cell { display: none !important; width: 0 !important; padding: 0 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;padding:16px 0 28px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

  <!-- Accent bar -->
  <tr><td style="height:4px;background:${teamColor};border-radius:4px 4px 0 0;"></td></tr>

  <!-- Header -->
  <tr><td class="header-pad" style="background:#161b22;padding:24px 24px 20px;border-left:1px solid #30363d;border-right:1px solid #30363d;">
    <div style="font-size:10px;font-weight:700;letter-spacing:2px;color:#6b7280;text-transform:uppercase;margin-bottom:6px;">Continental Breakfast Alliance</div>
    <div style="font-size:22px;font-weight:800;color:#e6edf3;letter-spacing:-0.5px;">⚾ Daily Lineup</div>
    <div style="font-size:15px;color:${teamColor};font-weight:700;margin-top:4px;">${teamName}</div>
    <div style="font-size:12px;color:#6b7280;margin-top:6px;">${formattedDate}</div>
  </td></tr>

  <!-- Matchup card -->
  <tr><td class="outer-pad" style="background:#0d1117;padding:14px 16px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #30363d;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#1c2128;padding:10px 16px;border-bottom:1px solid #30363d;">
        <span style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:#8b949e;text-transform:uppercase;">Week ${week} Matchup</span>
      </td></tr>
      <tr><td style="padding:16px 20px 14px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="text-align:center;width:42%;vertical-align:middle;">
              <div class="team-name" style="font-size:12px;font-weight:700;color:${teamColor};letter-spacing:0.3px;">${teamName}</div>
              <div class="score-num" style="font-size:36px;font-weight:800;color:#e6edf3;line-height:1;margin-top:4px;letter-spacing:-1px;">${myScore.toFixed(1)}</div>
              ${myProjFinal != null ? `<div style="font-size:11px;color:#6b7280;margin-top:3px;">proj. ${myProjFinal.toFixed(1)}</div>` : ''}
            </td>
            <td style="text-align:center;width:16%;vertical-align:middle;">
              <div style="font-size:11px;color:#4b5563;font-weight:800;letter-spacing:1px;">VS</div>
            </td>
            <td style="text-align:center;width:42%;vertical-align:middle;">
              <div class="team-name" style="font-size:12px;font-weight:700;color:#8b949e;letter-spacing:0.3px;">${oppTeamName}</div>
              <div class="score-num" style="font-size:36px;font-weight:800;color:#e6edf3;line-height:1;margin-top:4px;letter-spacing:-1px;">${oppScore.toFixed(1)}</div>
              ${oppProjFinal != null ? `<div style="font-size:11px;color:#6b7280;margin-top:3px;">proj. ${oppProjFinal.toFixed(1)}</div>` : ''}
            </td>
          </tr>
        </table>
        ${myWinPct != null ? `
        <div style="margin-top:14px;">
          <div style="background:#21262d;border-radius:8px;height:8px;overflow:hidden;">
            <div style="background:${winBarColor};width:${winBarWidth}%;height:100%;border-radius:8px;"></div>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">
            <tr>
              <td style="font-size:12px;color:${winBarColor};font-weight:700;">${myWinPct}% win probability</td>
              <td align="right" style="font-size:12px;color:#6b7280;">${(100 - myWinPct).toFixed(1)}%</td>
            </tr>
          </table>
        </div>` : `<div style="margin-top:12px;text-align:center;font-size:12px;color:#6b7280;">Win probability unavailable</div>`}
      </td></tr>
    </table>
  </td></tr>

  <!-- Summary pills -->
  <tr><td class="outer-pad" style="padding:10px 16px 0;">
    <table cellpadding="0" cellspacing="0">
      <tr>
        <td class="pill-wrap" style="padding-right:8px;">
          <span style="background:#0d2044;color:#93c5fd;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:600;border:1px solid #1e3a5f;white-space:nowrap;">~${totalEstPts.toFixed(1)} est. pts today</span>
        </td>
        ${spStartingToday.length > 0 ? `
        <td class="pill-wrap">
          <span style="background:#052e16;color:#86efac;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:600;border:1px solid #14532d;white-space:nowrap;">${spStartingToday.length} SP starting today</span>
        </td>` : ''}
      </tr>
    </table>
  </td></tr>

  <!-- Action items -->
  ${actionItemsHtml}

  <!-- Weekly SP plan -->
  ${spPlanHtml}

  <!-- Batters section -->
  <tr><td class="outer-pad" style="padding:18px 16px 0;">
    <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#6b7280;text-transform:uppercase;margin-bottom:8px;">Batters</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #30363d;border-radius:10px;overflow:hidden;">
      ${batters.map(p => playerRow(p, true)).join('')}
      ${batters.length === 0 ? '<tr><td colspan="4" style="padding:20px;text-align:center;color:#6b7280;font-size:13px;">No batters in lineup</td></tr>' : ''}
    </table>
  </td></tr>

  <!-- Pitchers section -->
  <tr><td class="outer-pad" style="padding:18px 16px 0;">
    <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#6b7280;text-transform:uppercase;margin-bottom:8px;">Pitchers</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #30363d;border-radius:10px;overflow:hidden;">
      ${pitchers.map(p => playerRow(p, true)).join('')}
      ${pitchers.length === 0 ? '<tr><td colspan="4" style="padding:20px;text-align:center;color:#6b7280;font-size:13px;">No pitchers in lineup</td></tr>' : ''}
    </table>
  </td></tr>

  <!-- Bench section -->
  ${benchWithGames.length > 0 ? `
  <tr><td class="outer-pad" style="padding:18px 16px 0;">
    <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:#6b7280;text-transform:uppercase;margin-bottom:8px;">Bench — Playing Today</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #21262d;border-radius:10px;overflow:hidden;">
      ${benchWithGames.map(p => playerRow(p, false)).join('')}
    </table>
  </td></tr>` : ''}

  <!-- Footer -->
  <tr><td class="outer-pad" style="padding:20px 16px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #30363d;border-radius:10px;">
      <tr><td style="padding:18px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td class="btn-full">
              <a href="${siteUrl}/teams/${myTeamId}" class="btn-full" style="background:${teamColor};color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700;display:inline-block;">View My Team →</a>
            </td>
            <td class="unsub-right" align="right" valign="middle">
              <a href="${optOutUrl}" style="font-size:12px;color:#6b7280;text-decoration:none;">Unsubscribe</a>
            </td>
          </tr>
        </table>
        <div style="margin-top:14px;font-size:11px;color:#4b5563;line-height:1.6;">
          Hi ${ownerName} — scores as of this morning · est. pts from EROSP + today's MLB schedule<br/>
          <a href="${siteUrl}" style="color:#6b7280;text-decoration:none;">${siteUrl.replace('https://', '')}</a>
        </div>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="height:28px;"></td></tr>

</table>
</td></tr>
</table>

</body>
</html>`;
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resendKey = process.env['RESEND_API_KEY'];
  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 });
  }

  const siteUrl = (process.env['NEWSLETTER_SITE_URL'] ?? 'https://continentalpressbox.com').replace(/\/$/, '');
  const fromEmail = process.env['NEWSLETTER_FROM_EMAIL'] ?? 'CBA <newsletter@continentalpressbox.com>';

  const { searchParams } = new URL(request.url);
  const filterTeamId = searchParams.get('teamId') ? parseInt(searchParams.get('teamId')!, 10) : null;
  const overrideEmail = searchParams.get('email') ?? null;

  // Load static data
  const ownerEmails = readJson<OwnerEmail[]>('data/owner-emails.json');
  const teamsMeta = readJson<{ teams: TeamMeta[] }>('data/teams.json').teams;
  const optouts = await getEmailOptouts();
  const winProbRaw = await getWinProbability() as WinProbabilityStore | null;
  const winProbMatchups: MatchupWinProbabilityView[] = winProbRaw?.matchups ?? [];

  // Fetch live scores once
  const liveScores = await fetchLiveScores(siteUrl);

  const recipients = ownerEmails.filter(o => {
    if (filterTeamId && o.teamId !== filterTeamId) return false;
    if (!filterTeamId && optouts.optedOut.includes(o.teamId)) return false;
    return true;
  });

  const resend = new Resend(resendKey);
  const results: { teamId: number; success: boolean; error?: string }[] = [];

  for (const recipient of recipients) {
    const team = teamsMeta.find(t => t.id === recipient.teamId);
    if (!team) continue;

    // Find opponent from live scores
    const myMatchup = liveScores.find(
      m => m.homeTeamId === recipient.teamId || m.awayTeamId === recipient.teamId
    ) ?? null;
    const oppTeamId = myMatchup
      ? (myMatchup.homeTeamId === recipient.teamId ? myMatchup.awayTeamId : myMatchup.homeTeamId)
      : null;
    const oppTeam = oppTeamId ? teamsMeta.find(t => t.id === oppTeamId) : null;
    const oppTeamName = oppTeam?.displayName ?? 'Opponent';

    // Find win probability for this matchup
    const winProb = winProbMatchups.find(
      m => m.homeTeamId === String(recipient.teamId) || m.awayTeamId === String(recipient.teamId)
    ) ?? null;

    // Fetch lineup (live MLB schedule data)
    const lineup = await fetchLineup(recipient.teamId, siteUrl);
    if (!lineup) {
      results.push({ teamId: recipient.teamId, success: false, error: 'lineup fetch failed' });
      continue;
    }

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    const optOutUrl = `${siteUrl}/api/email-optout?teamId=${recipient.teamId}`;

    const html = buildEmailHtml({
      teamName: team.displayName,
      teamColor: team.primaryColor,
      ownerName: recipient.owner.split(' ')[0],
      date: today,
      myTeamId: recipient.teamId,
      matchup: myMatchup,
      oppTeamName,
      winProb,
      matchupWeek: winProbRaw?.matchupPeriodId ?? null,
      lineup,
      siteUrl,
      optOutUrl,
    });

    const toEmail = overrideEmail ?? recipient.email;
    const subject = `⚾ Your CBA Lineup — ${new Date(today + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`;

    const { error } = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject,
      html,
    });

    if (error) {
      results.push({ teamId: recipient.teamId, success: false, error: String(error) });
    } else {
      results.push({ teamId: recipient.teamId, success: true });
    }

    // Brief pause between sends to avoid rate-limiting
    if (recipients.indexOf(recipient) < recipients.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  const sent = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`[daily-lineup-email] Sent ${sent}, failed ${failed}`);

  return NextResponse.json({ sent, failed, results });
}
