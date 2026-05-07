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
  if (player.ilType) return `<span style="background:#b45309;color:#fef3c7;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600;">IL</span> `;
  if (player.injuryStatus === 'OUT') return `<span style="background:#7f1d1d;color:#fca5a5;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600;">OUT</span> `;
  if (player.injuryStatus === 'DOUBTFUL') return `<span style="background:#7f1d1d;color:#fca5a5;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600;">DBTF</span> `;
  if (player.injuryStatus === 'DAY_TO_DAY' || player.injuryStatus === 'QUESTIONABLE') return `<span style="background:#78350f;color:#fde68a;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600;">D2D</span> `;
  return '';
}

function gameContext(player: LineupPlayer): string {
  if (!player.hasGame) return `<span style="color:#6b7280;font-size:12px;">No game</span>`;
  const ha = player.isHome ? 'vs' : '@';
  const opp = player.opponentAbbr ?? '—';
  let line = `<span style="color:#9ca3af;font-size:12px;">${ha} ${opp}`;
  if (player.role === 'SP' && player.isStartingToday) {
    line += ` <span style="background:#1d4ed8;color:#bfdbfe;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:700;">▶ STARTING</span>`;
  } else if (player.role === 'SP' && !player.isStartingToday) {
    line += ` <span style="color:#6b7280;font-size:10px;">not starting</span>`;
  }
  if (player.role === 'H' && player.probablePitcherName) {
    const era = player.probablePitcherEra != null ? ` (${player.probablePitcherEra.toFixed(2)} ERA)` : '';
    line += ` · <span style="font-size:11px;">${player.probablePitcherName}${era}</span>`;
  }
  line += `</span>`;
  return line;
}

function ptsDisplay(pts: number): string {
  if (pts <= 0) return `<span style="color:#4b5563;">—</span>`;
  return `<span style="color:#34d399;font-size:13px;font-weight:600;">~${pts.toFixed(1)}</span>`;
}

function playerRow(player: LineupPlayer, isStarter: boolean): string {
  const slotLabel = isStarter ? (player.slot ?? '—') : player.primaryPosition;
  const slotColor = isStarter ? '#6366f1' : '#374151';
  const photoUrl = player.photoUrl || `https://a.espncdn.com/i/headshots/mlb/players/full/${player.espnId}.png`;

  return `
<tr style="border-bottom:1px solid #1f2937;">
  <td style="padding:8px 10px;width:44px;">
    <span style="background:${slotColor};color:white;padding:2px 7px;border-radius:4px;font-size:11px;font-weight:700;white-space:nowrap;">${slotLabel}</span>
  </td>
  <td style="padding:8px 6px;width:36px;">
    <img src="${photoUrl}" width="32" height="32" style="border-radius:50%;object-fit:cover;display:block;" onerror="this.style.display='none'" />
  </td>
  <td style="padding:8px 4px;">
    <div style="font-size:13px;font-weight:600;color:#e6edf3;">${statusBadge(player)}${player.name}</div>
    <div style="margin-top:2px;">${gameContext(player)}</div>
  </td>
  <td style="padding:8px 10px;text-align:right;white-space:nowrap;">
    ${ptsDisplay(player.estimatedTodayPoints)}
  </td>
</tr>`;
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Daily CBA Lineup — ${formattedDate}</title>
</head>
<body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">

<!-- Outer wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;padding:20px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- Accent bar -->
  <tr><td style="height:5px;background:${teamColor};border-radius:4px 4px 0 0;"></td></tr>

  <!-- Header -->
  <tr><td style="background:#161b22;padding:24px 28px 20px;border-left:1px solid #30363d;border-right:1px solid #30363d;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;color:#8b949e;text-transform:uppercase;margin-bottom:6px;">Continental Breakfast Alliance</div>
          <div style="font-size:22px;font-weight:700;color:#e6edf3;">⚾ Daily Lineup</div>
          <div style="font-size:16px;color:${teamColor};font-weight:600;margin-top:4px;">${teamName}</div>
        </td>
        <td align="right" valign="top">
          <div style="font-size:12px;color:#6b7280;">${formattedDate}</div>
          <div style="font-size:20px;color:#374151;margin-top:6px;">📬</div>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Matchup card -->
  <tr><td style="background:#0d1117;padding:12px 28px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #30363d;border-radius:10px;overflow:hidden;">
      <!-- Card header -->
      <tr><td style="background:#1c2128;padding:10px 16px;border-bottom:1px solid #30363d;">
        <span style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:#8b949e;text-transform:uppercase;">Week ${week} Matchup</span>
      </td></tr>
      <!-- Score row -->
      <tr><td style="padding:16px 20px 12px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="text-align:center;width:42%;">
              <div style="font-size:13px;font-weight:600;color:${teamColor};">${teamName}</div>
              <div style="font-size:32px;font-weight:700;color:#e6edf3;line-height:1.1;margin-top:4px;">${myScore.toFixed(1)}</div>
              ${myProjFinal != null ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">proj. ${myProjFinal.toFixed(1)}</div>` : ''}
            </td>
            <td style="text-align:center;width:16%;">
              <div style="font-size:13px;color:#4b5563;font-weight:600;">VS</div>
            </td>
            <td style="text-align:center;width:42%;">
              <div style="font-size:13px;font-weight:600;color:#9ca3af;">${oppTeamName}</div>
              <div style="font-size:32px;font-weight:700;color:#e6edf3;line-height:1.1;margin-top:4px;">${oppScore.toFixed(1)}</div>
              ${oppProjFinal != null ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">proj. ${oppProjFinal.toFixed(1)}</div>` : ''}
            </td>
          </tr>
        </table>
        <!-- Win probability bar -->
        ${myWinPct != null ? `
        <div style="margin-top:14px;">
          <div style="background:#21262d;border-radius:6px;height:10px;overflow:hidden;">
            <div style="background:${winBarColor};width:${winBarWidth}%;height:100%;border-radius:6px;"></div>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">
            <tr>
              <td style="font-size:12px;color:${winBarColor};font-weight:700;">${myWinPct}% win probability</td>
              <td align="right" style="font-size:12px;color:#6b7280;">${(100 - myWinPct).toFixed(1)}%</td>
            </tr>
          </table>
        </div>` : `<div style="margin-top:10px;text-align:center;font-size:12px;color:#6b7280;">Win probability unavailable</div>`}
      </td></tr>
    </table>
  </td></tr>

  <!-- Today summary pills -->
  <tr><td style="padding:10px 28px 0;">
    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding-right:8px;">
          <span style="background:#1e3a5f;color:#93c5fd;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">~${totalEstPts.toFixed(1)} est. pts today</span>
        </td>
        ${spStartingToday.length > 0 ? `
        <td>
          <span style="background:#14532d;color:#86efac;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">${spStartingToday.length} SP starting today</span>
        </td>` : ''}
      </tr>
    </table>
  </td></tr>

  <!-- Batters section -->
  <tr><td style="padding:14px 28px 0;">
    <div style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:#8b949e;text-transform:uppercase;margin-bottom:8px;">Lineup — Batters</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden;">
      ${batters.map(p => playerRow(p, true)).join('')}
      ${batters.length === 0 ? '<tr><td colspan="4" style="padding:16px;text-align:center;color:#6b7280;font-size:13px;">No batters in lineup</td></tr>' : ''}
    </table>
  </td></tr>

  <!-- Pitchers section -->
  <tr><td style="padding:12px 28px 0;">
    <div style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:#8b949e;text-transform:uppercase;margin-bottom:8px;">Lineup — Pitchers</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #30363d;border-radius:8px;overflow:hidden;">
      ${pitchers.map(p => playerRow(p, true)).join('')}
      ${pitchers.length === 0 ? '<tr><td colspan="4" style="padding:16px;text-align:center;color:#6b7280;font-size:13px;">No pitchers in lineup</td></tr>' : ''}
    </table>
  </td></tr>

  <!-- Bench section (only show if there are players with games) -->
  ${benchWithGames.length > 0 ? `
  <tr><td style="padding:12px 28px 0;">
    <div style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:#8b949e;text-transform:uppercase;margin-bottom:8px;">Bench (playing today)</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #21262d;border-radius:8px;overflow:hidden;opacity:0.8;">
      ${benchWithGames.map(p => playerRow(p, false)).join('')}
    </table>
  </td></tr>` : ''}

  <!-- Footer -->
  <tr><td style="background:#161b22;padding:20px 28px 24px;margin-top:16px;border-top:1px solid #30363d;border-left:1px solid #30363d;border-right:1px solid #30363d;border-bottom:1px solid #30363d;border-radius:0 0 4px 4px;margin-top:12px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <a href="${siteUrl}/teams/${myTeamId}" style="background:${teamColor};color:white;padding:9px 18px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;display:inline-block;">View My Team →</a>
        </td>
        <td align="right" valign="middle">
          <span style="font-size:11px;color:#6b7280;">Hi ${ownerName} · </span>
          <a href="${optOutUrl}" style="font-size:11px;color:#6b7280;text-decoration:underline;">Unsubscribe</a>
        </td>
      </tr>
    </table>
    <div style="margin-top:12px;font-size:11px;color:#4b5563;line-height:1.5;">
      Scores updated as of this morning. Estimated points based on EROSP projections + today's MLB schedule.<br/>
      <a href="${siteUrl}" style="color:#6b7280;">${siteUrl.replace('https://', '')}</a>
    </div>
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
