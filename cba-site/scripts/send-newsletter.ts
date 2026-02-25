#!/usr/bin/env tsx
/**
 * CBA Weekly Newsletter
 *
 * Generates and sends personalized weekly emails to all 10 league members.
 * Each email has:
 *   - A shared league-wide section (top storylines, hot streaks, drama)
 *   - A personalized team section (how YOUR team is doing)
 *   - Suggested waiver/lineup moves for that team
 *   - Any commissioner notes dropped in data/commissioner-notes.json
 *
 * Usage:
 *   npm run send-newsletter
 *
 * Schedule (macOS launchd) — see README at bottom of this file.
 *
 * Required env vars in .env.local:
 *   ANTHROPIC_API_KEY
 *   RESEND_API_KEY
 *   NEWSLETTER_FROM_EMAIL   (e.g. "CBA <newsletter@yourdomain.com>")
 *   NEWSLETTER_SITE_URL     (e.g. "http://localhost:3000" or your deployed URL)
 */

import Anthropic from '@anthropic-ai/sdk';
import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// ─── Data imports ────────────────────────────────────────────────────────────
// Using require() so tsx doesn't need --experimental-json-import
// eslint-disable-next-line @typescript-eslint/no-require-imports
const season2025 = require('../data/historical/2025.json');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const teamsMetaRaw = require('../data/teams.json');

const CURRENT_SEASON = season2025;
const TEAMS_META: TeamMeta[] = teamsMetaRaw.teams;

// ─── Types ───────────────────────────────────────────────────────────────────
interface TeamMeta {
  id: number;
  displayName: string;
  owner: string;
  primaryColor: string;
  bio?: string;
  strengths?: string;
  weaknesses?: string;
}

interface OwnerEmail {
  teamId: number;
  owner: string;
  email: string;
}

interface CommissionerNotes {
  weekLabel: string;
  notes: string[];
}

interface TeamNewsletterContent {
  teamSection: string;
  suggestedMoves: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function readJson<T>(relPath: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8')
  ) as T;
}

function getLastCompletedWeek(): number | null {
  const completed = CURRENT_SEASON.matchups
    .filter((m: { winner?: number }) => m.winner !== undefined)
    .map((m: { week: number }) => m.week);
  return completed.length > 0 ? Math.max(...completed) : null;
}

// ─── Context builders ─────────────────────────────────────────────────────────

function buildLeagueContext(notes: CommissionerNotes): string {
  const teams = CURRENT_SEASON.teams;

  // Current standings
  const sortedStandings = [...CURRENT_SEASON.standings].sort(
    (a: { wins: number; pointsFor: number }, b: { wins: number; pointsFor: number }) =>
      b.wins - a.wins || b.pointsFor - a.pointsFor
  );
  const standingsText = sortedStandings
    .map((s: { teamId: number; wins: number; losses: number; pointsFor: number }, i: number) => {
      const team = teams.find((t: { id: number; name: string }) => t.id === s.teamId);
      return `  ${i + 1}. ${team?.name} (${s.wins}-${s.losses}) — ${s.pointsFor.toFixed(1)} PF`;
    })
    .join('\n');

  // Last completed week's matchups
  const lastWeek = getLastCompletedWeek();
  let matchupText = 'No completed matchups yet this season.';
  if (lastWeek !== null) {
    const weekMatchups = CURRENT_SEASON.matchups.filter((m: { week: number }) => m.week === lastWeek);
    matchupText =
      `Week ${lastWeek} results:\n` +
      weekMatchups
        .map((m: { home: { teamId: number; totalPoints: number }; away: { teamId: number; totalPoints: number }; winner?: number }) => {
          const home = teams.find((t: { id: number; name: string }) => t.id === m.home.teamId)?.name ?? `Team ${m.home.teamId}`;
          const away = teams.find((t: { id: number; name: string }) => t.id === m.away.teamId)?.name ?? `Team ${m.away.teamId}`;
          const winner =
            m.winner === m.home.teamId ? home
            : m.winner === m.away.teamId ? away
            : 'Tie';
          return `  ${home} ${m.home.totalPoints.toFixed(1)} vs ${away} ${m.away.totalPoints.toFixed(1)} — ${winner} wins`;
        })
        .join('\n');
  }

  // Recent 4-week trends
  const lastWeekNum = lastWeek ?? 0;
  const recentWeekNums = [lastWeekNum, lastWeekNum - 1, lastWeekNum - 2, lastWeekNum - 3].filter(w => w > 0);
  const trendText = teams
    .map((team: { id: number; name: string }) => {
      const recent = CURRENT_SEASON.matchups.filter(
        (m: { week: number; home: { teamId: number }; away: { teamId: number } }) =>
          recentWeekNums.includes(m.week) &&
          (m.home.teamId === team.id || m.away.teamId === team.id)
      );
      const wins = recent.filter((m: { winner?: number }) => m.winner === team.id).length;
      const pts = recent.reduce((sum: number, m: { home: { teamId: number; totalPoints: number }; away: { teamId: number; totalPoints: number } }) => {
        return sum + (m.home.teamId === team.id ? m.home.totalPoints : m.away.totalPoints);
      }, 0);
      return `  ${team.name}: ${wins}-${recent.length - wins} last ${recent.length} wks, ${pts.toFixed(1)} pts`;
    })
    .join('\n');

  // Commissioner notes
  const notesText =
    notes.notes.length > 0
      ? notes.notes.map(n => `  - ${n}`).join('\n')
      : '  (none this week)';

  return `CURRENT STANDINGS — ${CURRENT_SEASON.year} Season
${standingsText}

${matchupText}

RECENT FORM (last 4 weeks)
${trendText}

COMMISSIONER NOTES
${notesText}`.trim();
}

function buildTeamContext(teamId: number): string {
  const teams = CURRENT_SEASON.teams;
  const team = teams.find((t: { id: number; name: string; owner: string }) => t.id === teamId);
  const standing = CURRENT_SEASON.standings.find((s: { teamId: number }) => s.teamId === teamId);
  const allSorted = [...CURRENT_SEASON.standings].sort(
    (a: { wins: number; pointsFor: number }, b: { wins: number; pointsFor: number }) =>
      b.wins - a.wins || b.pointsFor - a.pointsFor
  );
  const rank = allSorted.findIndex((s: { teamId: number }) => s.teamId === teamId) + 1;
  const meta = TEAMS_META.find(m => m.id === teamId);
  const roster = CURRENT_SEASON.rosters?.find((r: { teamId: number }) => r.teamId === teamId);

  // Last week's result
  const lastWeek = getLastCompletedWeek();
  let lastMatchup = 'No matchup data yet.';
  if (lastWeek !== null) {
    const m = CURRENT_SEASON.matchups.find(
      (m: { week: number; home: { teamId: number }; away: { teamId: number } }) =>
        m.week === lastWeek && (m.home.teamId === teamId || m.away.teamId === teamId)
    );
    if (m) {
      const myPts = m.home.teamId === teamId ? m.home.totalPoints : m.away.totalPoints;
      const oppId = m.home.teamId === teamId ? m.away.teamId : m.home.teamId;
      const oppPts = m.home.teamId === teamId ? m.away.totalPoints : m.home.totalPoints;
      const opp = teams.find((t: { id: number; name: string }) => t.id === oppId)?.name ?? `Team ${oppId}`;
      const result = m.winner === teamId ? 'WIN' : m.winner === undefined ? 'TIE' : 'LOSS';
      lastMatchup = `Week ${lastWeek}: ${result} — ${myPts.toFixed(1)} pts vs ${opp} (${oppPts.toFixed(1)})`;
    }
  }

  // Top players this season
  const topPlayers = roster
    ? [...roster.players]
        .filter((p: { totalPoints: number }) => p.totalPoints > 0)
        .sort((a: { totalPoints: number }, b: { totalPoints: number }) => b.totalPoints - a.totalPoints)
        .slice(0, 6)
        .map((p: { playerName: string; position: string; totalPoints: number }) =>
          `  ${p.playerName} (${p.position}): ${p.totalPoints.toFixed(1)} pts`
        )
        .join('\n')
    : '  (no roster data)';

  const playoffCutoff = Math.ceil(CURRENT_SEASON.teams.length / 2); // top half makes playoffs
  const playoffStatus =
    rank <= playoffCutoff
      ? `IN playoff position (#${rank})`
      : `OUT of playoffs (#${rank} of ${CURRENT_SEASON.teams.length})`;

  return `Team: ${team?.name}
Owner: ${team?.owner}
Record: ${standing?.wins ?? 0}-${standing?.losses ?? 0} | Rank: #${rank} — ${playoffStatus}
Points For: ${standing?.pointsFor?.toFixed(1) ?? 0} | Points Against: ${standing?.pointsAgainst?.toFixed(1) ?? 0}
Last Week: ${lastMatchup}
Known Strengths: ${meta?.strengths?.slice(0, 200) ?? 'N/A'}
Known Weaknesses: ${meta?.weaknesses?.slice(0, 200) ?? 'N/A'}
Top Players This Season:
${topPlayers}`.trim();
}

// ─── Email HTML builder ───────────────────────────────────────────────────────
function buildEmailHtml({
  firstName,
  teamName,
  primaryColor,
  weekLabel,
  leagueSection,
  teamSection,
  suggestedMoves,
  notes,
  siteUrl,
}: {
  firstName: string;
  teamName: string;
  primaryColor: string;
  weekLabel: string;
  leagueSection: string;
  teamSection: string;
  suggestedMoves: string;
  notes: CommissionerNotes;
  siteUrl: string;
}): string {
  const paragraphStyle =
    'margin:0 0 14px;font-size:15px;line-height:1.7;color:#1f2937;';

  const toParagraphs = (text: string) =>
    text
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(Boolean)
      .map(p => `<p style="${paragraphStyle}">${p.replace(/\n/g, '<br>')}</p>`)
      .join('');

  const moveBullets = suggestedMoves
    .split('\n')
    .filter(l => l.trim())
    .map(l => `<p style="margin:5px 0;font-size:14px;color:#374151;">${l.trim()}</p>`)
    .join('');

  const notesHtml =
    notes.notes.length > 0
      ? `
      <tr>
        <td style="padding:0 28px 24px;">
          <div style="background:#f0fdfa;border-left:3px solid #2dd4bf;border-radius:0 8px 8px 0;padding:14px 18px;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#0d9488;">Commissioner's Corner</p>
            ${notes.notes.map(n => `<p style="margin:4px 0;font-size:14px;color:#374151;">• ${n}</p>`).join('')}
          </div>
        </td>
      </tr>`
      : '';

  const hex = primaryColor.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lightBg = `rgba(${r},${g},${b},0.08)`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>CBA ${weekLabel}</title>
</head>
<body style="margin:0;padding:0;background:#f0f9ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;padding:24px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f766e,#1e3a5f);border-radius:12px 12px 0 0;padding:28px 32px 24px;">
            <p style="margin:0 0 3px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:#5eead4;">Continental Breakfast Alliance</p>
            <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">${weekLabel} Newsletter</h1>
            <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.6);">Hey ${firstName} — here's what's going on around the league.</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;border-radius:0 0 12px 12px;">
            <table width="100%" cellpadding="0" cellspacing="0">

              <!-- League section -->
              <tr>
                <td style="padding:28px 28px 8px;">
                  <p style="margin:0 0 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;">Around the League</p>
                  ${toParagraphs(leagueSection)}
                </td>
              </tr>

              <!-- Divider -->
              <tr><td style="padding:8px 28px 16px;"><div style="border-top:1px solid #f3f4f6;"></div></td></tr>

              <!-- Your team section -->
              <tr>
                <td style="padding:0 28px 8px;">
                  <div style="background:${lightBg};border-left:3px solid ${primaryColor};border-radius:0 8px 8px 0;padding:12px 18px;margin-bottom:18px;">
                    <p style="margin:0 0 1px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${primaryColor};">Your Team</p>
                    <p style="margin:0;font-size:17px;font-weight:800;color:#111827;">${teamName}</p>
                  </div>
                  ${toParagraphs(teamSection)}
                </td>
              </tr>

              <!-- Suggested moves -->
              <tr>
                <td style="padding:0 28px 24px;">
                  <div style="background:#f8fafc;border-radius:8px;padding:16px 20px;">
                    <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#4b5563;">Suggested Moves</p>
                    ${moveBullets}
                  </div>
                </td>
              </tr>

              ${notesHtml}

              <!-- Footer -->
              <tr>
                <td style="background:#f8fafc;border-top:1px solid #f3f4f6;padding:18px 28px;border-radius:0 0 12px 12px;">
                  <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
                    Continental Breakfast Alliance &middot; Fantasy Baseball &middot;
                    <a href="${siteUrl}" style="color:#0d9488;text-decoration:none;">View the site</a>
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n📬  CBA Newsletter — starting up...\n');

  // Validate env vars
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌  ANTHROPIC_API_KEY not set in .env.local');
    process.exit(1);
  }
  if (!process.env.RESEND_API_KEY) {
    console.error('❌  RESEND_API_KEY not set in .env.local');
    process.exit(1);
  }

  const ownerEmails = readJson<OwnerEmail[]>('data/owner-emails.json');
  const notes = readJson<CommissionerNotes>('data/commissioner-notes.json');
  const lastWeek = getLastCompletedWeek();
  const weekLabel = notes.weekLabel || (lastWeek ? `Week ${lastWeek}` : 'Weekly Update');
  const siteUrl = process.env.NEWSLETTER_SITE_URL ?? 'http://localhost:3000';
  const fromEmail = process.env.NEWSLETTER_FROM_EMAIL ?? 'CBA Newsletter <newsletter@yourdomain.com>';

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resend = new Resend(process.env.RESEND_API_KEY);

  const leagueContext = buildLeagueContext(notes);

  // ── Step 1: League-wide section ───────────────────────────────────────────
  console.log('🤖  Generating league-wide content...');
  const leagueMsg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    system: [
      'You are the AI correspondent for the Continental Breakfast Alliance (CBA), a 10-team fantasy baseball keeper league.',
      'Write in a fun, slightly irreverent sports-journalism tone — like The Athletic meets a group chat.',
      'Be specific about teams and real results. Never be generic.',
      'Write exactly 2 paragraphs separated by a blank line. No headers, no bullet points — just flowing prose.',
    ].join(' '),
    messages: [{
      role: 'user',
      content: `Write the league-wide section of this week's CBA newsletter. Cover the top 2-3 storylines: hot streaks, surprising collapses, dominant scoring weeks, playoff picture shifts, anything compelling. Name specific teams.\n\n${leagueContext}`,
    }],
  });
  const leagueSection = (leagueMsg.content[0] as { text: string }).text;
  console.log('✅  League section done.\n');

  // ── Step 2: All 10 team sections in one call ───────────────────────────────
  console.log('🤖  Generating per-team content (all 10 in one call)...');
  const allTeamContext = CURRENT_SEASON.teams
    .map((team: { id: number }) => `--- TEAM ${team.id} ---\n${buildTeamContext(team.id)}`)
    .join('\n\n');

  const teamMsg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 5000,
    system: [
      'You are the AI correspondent for the Continental Breakfast Alliance (CBA), a fantasy baseball keeper league.',
      'Write personalized newsletter content for each team owner. Be specific, honest, and a little fun.',
      'For each team produce:',
      '  teamSection: 2 paragraphs of prose — current situation, recent performance, playoff outlook, what to watch. No headers.',
      '  suggestedMoves: exactly 3 bullet points starting with "• " — specific waiver pickups, lineup tweaks, or trade targets based on their weaknesses.',
      'Return ONLY valid JSON. The top-level keys are the teamId as a STRING (e.g. "1", "2"). Each value is an object with "teamSection" and "suggestedMoves". No markdown, no code fences, no explanation.',
    ].join(' '),
    messages: [{
      role: 'user',
      content: `Generate personalized newsletter content for all 10 CBA teams. League context and individual team data below.\n\n${leagueContext}\n\n${allTeamContext}`,
    }],
  });

  let teamContent: Record<string, TeamNewsletterContent> = {};
  try {
    const raw = (teamMsg.content[0] as { text: string }).text;
    // Strip markdown code fences if the model wraps it anyway
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    teamContent = JSON.parse(cleaned);
    console.log(`✅  Team sections done (${Object.keys(teamContent).length} teams).\n`);
  } catch (err) {
    console.error('❌  Failed to parse team content JSON. Raw output:');
    console.error((teamMsg.content[0] as { text: string }).text);
    process.exit(1);
  }

  // ── Step 3: Send emails ────────────────────────────────────────────────────
  console.log('✉️   Sending emails...\n');
  let sent = 0;
  let failed = 0;

  for (const entry of ownerEmails) {
    const { teamId, owner, email } = entry;
    const meta = TEAMS_META.find(m => m.id === teamId);
    const content = teamContent[String(teamId)];

    if (!content) {
      console.warn(`⚠️   No AI content for team ${teamId} (${owner}) — skipping.`);
      failed++;
      continue;
    }

    const firstName = owner.split(' ')[0];
    const html = buildEmailHtml({
      firstName,
      teamName: meta?.displayName ?? CURRENT_SEASON.teams.find((t: { id: number; name: string }) => t.id === teamId)?.name ?? 'Your Team',
      primaryColor: meta?.primaryColor ?? '#0d9488',
      weekLabel,
      leagueSection,
      teamSection: content.teamSection,
      suggestedMoves: content.suggestedMoves,
      notes,
      siteUrl,
    });

    try {
      await resend.emails.send({
        from: fromEmail,
        to: email,
        subject: `CBA ${weekLabel} — ${meta?.displayName ?? 'Your Team'}`,
        html,
      });
      console.log(`  ✓ ${owner.padEnd(20)} → ${email}`);
      sent++;
    } catch (err) {
      console.error(`  ✗ ${owner.padEnd(20)} → ${email}  (${(err as Error).message})`);
      failed++;
    }

    // Brief pause between sends to stay within Resend rate limits
    await new Promise(r => setTimeout(r, 350));
  }

  // ── Step 4: Auto-advance commissioner notes for next week ─────────────────
  const nextWeek = lastWeek ? `Week ${lastWeek + 1}` : 'Next Week';
  fs.writeFileSync(
    path.join(process.cwd(), 'data/commissioner-notes.json'),
    JSON.stringify({ weekLabel: nextWeek, notes: [] }, null, 2),
    'utf-8'
  );

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Done.  Sent: ${sent}  |  Failed: ${failed}
📝  Commissioner notes cleared — ready for ${nextWeek}.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

main().catch(err => {
  console.error('\n💥  Fatal error:', err);
  process.exit(1);
});

/*
 * ─── SCHEDULING ON MACOS (launchd) ─────────────────────────────────────────
 *
 * To run automatically at 10:00 AM every Monday:
 *
 * 1. Create ~/Library/LaunchAgents/com.cba.newsletter.plist:
 *
 *   <?xml version="1.0" encoding="UTF-8"?>
 *   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 *     "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
 *   <plist version="1.0">
 *   <dict>
 *     <key>Label</key>
 *     <string>com.cba.newsletter</string>
 *     <key>ProgramArguments</key>
 *     <array>
 *       <string>/usr/local/bin/node</string>
 *       <string>/path/to/cba-site/node_modules/.bin/tsx</string>
 *       <string>/path/to/cba-site/scripts/send-newsletter.ts</string>
 *     </array>
 *     <key>WorkingDirectory</key>
 *     <string>/path/to/cba-site</string>
 *     <key>StartCalendarInterval</key>
 *     <dict>
 *       <key>Weekday</key><integer>1</integer>
 *       <key>Hour</key><integer>10</integer>
 *       <key>Minute</key><integer>0</integer>
 *     </dict>
 *     <key>StandardOutPath</key>
 *     <string>/tmp/cba-newsletter.log</string>
 *     <key>StandardErrorPath</key>
 *     <string>/tmp/cba-newsletter-err.log</string>
 *   </dict>
 *   </plist>
 *
 * 2. Load it:
 *   launchctl load ~/Library/LaunchAgents/com.cba.newsletter.plist
 *
 * 3. Test immediately:
 *   launchctl start com.cba.newsletter
 */
