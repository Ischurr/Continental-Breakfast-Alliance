import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getEmailOptouts, getWinProbability } from '@/lib/store';
import type { MatchupWinProbabilityView } from '@/lib/fantasy/winProbability';
import type { WinProbabilityStore } from '@/lib/fantasy/nightlyJob';
import type { DailyLineupResponse, LineupPlayer } from '@/app/api/daily-lineup/[teamId]/route';
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
  <td style="padding:11px 8px;width:40px;vertical-align:middle;">
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

function buildActionItems(starters: LineupPlayer[], bench: LineupPlayer[]): string {
  // Players in lineup slots scoring 0 today
  const deadStarters = starters.filter(p => p.estimatedTodayPoints === 0);

  // Best bench options with meaningful projected pts
  const topBench = bench
    .filter(p => p.hasGame && p.estimatedTodayPoints >= 1.5)
    .sort((a, b) => b.estimatedTodayPoints - a.estimatedTodayPoints)
    .slice(0, 4);

  if (deadStarters.length === 0 && topBench.length === 0) return '';

  function deadReason(p: LineupPlayer): string {
    if (p.ilType) return `On IL (${p.ilType})`;
    if (p.injuryStatus === 'OUT' || p.injuryStatus === 'DOUBTFUL') return `${p.injuryStatus}`;
    if (!p.hasGame) return 'No game today';
    if (p.role === 'SP' && !p.isStartingToday) return 'Not starting today';
    return 'Not active';
  }

  const benchRows = topBench.map(p => {
    const ha = p.isHome ? 'vs' : '@';
    const opp = p.opponentAbbr ?? '?';
    return `
    <tr>
      <td style="padding:7px 12px 7px 16px;vertical-align:top;">
        <span style="color:#34d399;font-size:15px;line-height:1;">✦</span>
      </td>
      <td style="padding:7px 12px 7px 0;">
        <div style="font-size:13px;font-weight:600;color:#e6edf3;">${p.name} <span style="color:#6b7280;font-weight:400;">(${p.primaryPosition})</span></div>
        <div style="font-size:12px;color:#8b949e;margin-top:1px;">${ha} ${opp} &middot; <span style="color:#34d399;font-weight:600;">~${p.estimatedTodayPoints.toFixed(1)} pts</span></div>
      </td>
    </tr>`;
  }).join('');

  const deadRows = deadStarters.map(p => `
    <tr>
      <td style="padding:7px 12px 7px 16px;vertical-align:top;">
        <span style="color:#f87171;font-size:15px;line-height:1;">✕</span>
      </td>
      <td style="padding:7px 12px 7px 0;">
        <div style="font-size:13px;font-weight:600;color:#e6edf3;">${p.name} <span style="color:#6b7280;font-weight:400;">(${p.slot ?? p.primaryPosition})</span></div>
        <div style="font-size:12px;color:#f87171;margin-top:1px;">${deadReason(p)}</div>
      </td>
    </tr>`).join('');

  return `
  <tr><td style="padding:16px 28px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #30363d;border-radius:10px;overflow:hidden;">
      <tr><td style="background:#1c2128;padding:12px 16px;border-bottom:1px solid #30363d;">
        <span style="font-size:12px;font-weight:700;letter-spacing:1px;color:#c9d1d9;text-transform:uppercase;">📋 Today's Lineup Changes</span>
      </td></tr>
      <tr><td style="padding:4px 0 8px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${deadRows.length > 0 ? `
          <tr><td colspan="2" style="padding:10px 16px 4px;font-size:11px;font-weight:700;letter-spacing:0.8px;color:#6b7280;text-transform:uppercase;">Bench these (scoring 0 today)</td></tr>
          ${deadRows}` : ''}
          ${topBench.length > 0 ? `
          <tr><td colspan="2" style="padding:${deadRows.length > 0 ? '12px' : '10px'} 16px 4px;font-size:11px;font-weight:700;letter-spacing:0.8px;color:#6b7280;text-transform:uppercase;">Available off your bench</td></tr>
          ${benchRows}` : ''}
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

  const actionItemsHtml = buildActionItems(lineup.starters, lineup.bench);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Daily CBA Lineup — ${formattedDate}</title>
</head>
<body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;padding:24px 0 32px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- Accent bar -->
  <tr><td style="height:4px;background:${teamColor};border-radius:4px 4px 0 0;"></td></tr>

  <!-- Header -->
  <tr><td style="background:#161b22;padding:28px 32px 24px;border-left:1px solid #30363d;border-right:1px solid #30363d;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:#6b7280;text-transform:uppercase;margin-bottom:8px;">Continental Breakfast Alliance</div>
          <div style="font-size:26px;font-weight:800;color:#e6edf3;letter-spacing:-0.5px;">⚾ Daily Lineup</div>
          <div style="font-size:16px;color:${teamColor};font-weight:700;margin-top:6px;">${teamName}</div>
        </td>
        <td align="right" valign="top" style="padding-left:16px;">
          <div style="font-size:12px;color:#6b7280;white-space:nowrap;">${formattedDate}</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Matchup card -->
  <tr><td style="background:#0d1117;padding:16px 28px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #30363d;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#1c2128;padding:11px 20px;border-bottom:1px solid #30363d;">
        <span style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:#8b949e;text-transform:uppercase;">Week ${week} Matchup</span>
      </td></tr>
      <tr><td style="padding:20px 24px 18px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="text-align:center;width:42%;vertical-align:middle;">
              <div style="font-size:12px;font-weight:700;color:${teamColor};letter-spacing:0.3px;">${teamName}</div>
              <div style="font-size:38px;font-weight:800;color:#e6edf3;line-height:1;margin-top:6px;letter-spacing:-1px;">${myScore.toFixed(1)}</div>
              ${myProjFinal != null ? `<div style="font-size:11px;color:#6b7280;margin-top:4px;">proj. ${myProjFinal.toFixed(1)}</div>` : ''}
            </td>
            <td style="text-align:center;width:16%;vertical-align:middle;">
              <div style="font-size:12px;color:#4b5563;font-weight:800;letter-spacing:1px;">VS</div>
            </td>
            <td style="text-align:center;width:42%;vertical-align:middle;">
              <div style="font-size:12px;font-weight:700;color:#8b949e;letter-spacing:0.3px;">${oppTeamName}</div>
              <div style="font-size:38px;font-weight:800;color:#e6edf3;line-height:1;margin-top:6px;letter-spacing:-1px;">${oppScore.toFixed(1)}</div>
              ${oppProjFinal != null ? `<div style="font-size:11px;color:#6b7280;margin-top:4px;">proj. ${oppProjFinal.toFixed(1)}</div>` : ''}
            </td>
          </tr>
        </table>
        ${myWinPct != null ? `
        <div style="margin-top:18px;">
          <div style="background:#21262d;border-radius:8px;height:8px;overflow:hidden;">
            <div style="background:${winBarColor};width:${winBarWidth}%;height:100%;border-radius:8px;"></div>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:7px;">
            <tr>
              <td style="font-size:12px;color:${winBarColor};font-weight:700;">${myWinPct}% win probability</td>
              <td align="right" style="font-size:12px;color:#6b7280;">${(100 - myWinPct).toFixed(1)}%</td>
            </tr>
          </table>
        </div>` : `<div style="margin-top:14px;text-align:center;font-size:12px;color:#6b7280;">Win probability unavailable</div>`}
      </td></tr>
    </table>
  </td></tr>

  <!-- Summary pills -->
  <tr><td style="padding:12px 28px 0;">
    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-right:8px;">
          <span style="background:#0d2044;color:#93c5fd;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;border:1px solid #1e3a5f;">~${totalEstPts.toFixed(1)} est. pts today</span>
        </td>
        ${spStartingToday.length > 0 ? `
        <td>
          <span style="background:#052e16;color:#86efac;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:600;border:1px solid #14532d;">${spStartingToday.length} SP starting today</span>
        </td>` : ''}
      </tr>
    </table>
  </td></tr>

  <!-- Action items -->
  ${actionItemsHtml}

  <!-- Batters section -->
  <tr><td style="padding:20px 28px 0;">
    <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#6b7280;text-transform:uppercase;margin-bottom:10px;">Batters</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #30363d;border-radius:10px;overflow:hidden;">
      ${batters.map(p => playerRow(p, true)).join('')}
      ${batters.length === 0 ? '<tr><td colspan="4" style="padding:20px;text-align:center;color:#6b7280;font-size:13px;">No batters in lineup</td></tr>' : ''}
    </table>
  </td></tr>

  <!-- Pitchers section -->
  <tr><td style="padding:20px 28px 0;">
    <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#6b7280;text-transform:uppercase;margin-bottom:10px;">Pitchers</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #30363d;border-radius:10px;overflow:hidden;">
      ${pitchers.map(p => playerRow(p, true)).join('')}
      ${pitchers.length === 0 ? '<tr><td colspan="4" style="padding:20px;text-align:center;color:#6b7280;font-size:13px;">No pitchers in lineup</td></tr>' : ''}
    </table>
  </td></tr>

  <!-- Bench section -->
  ${benchWithGames.length > 0 ? `
  <tr><td style="padding:20px 28px 0;">
    <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#6b7280;text-transform:uppercase;margin-bottom:10px;">Bench — Playing Today</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #21262d;border-radius:10px;overflow:hidden;">
      ${benchWithGames.map(p => playerRow(p, false)).join('')}
    </table>
  </td></tr>` : ''}

  <!-- Footer -->
  <tr><td style="padding:24px 28px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #30363d;border-radius:10px;padding:20px 24px;">
      <tr><td style="padding:20px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td>
              <a href="${siteUrl}/teams/${myTeamId}" style="background:${teamColor};color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700;display:inline-block;">View My Team →</a>
            </td>
            <td align="right" valign="middle">
              <a href="${optOutUrl}" style="font-size:12px;color:#6b7280;text-decoration:none;">Unsubscribe</a>
            </td>
          </tr>
        </table>
        <div style="margin-top:16px;font-size:11px;color:#4b5563;line-height:1.6;">
          Hi ${ownerName} — scores as of this morning · est. pts from EROSP + today's MLB schedule<br/>
          <a href="${siteUrl}" style="color:#6b7280;text-decoration:none;">${siteUrl.replace('https://', '')}</a>
        </div>
      </td></tr>
    </table>
  </td></tr>

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
