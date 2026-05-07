#!/usr/bin/env tsx
/**
 * CBA Daily Lineup Email — test/manual runner
 *
 * Fetches each manager's lineup + matchup + win probability and sends
 * a personalized HTML email via Resend.
 *
 * Usage:
 *   npx tsx scripts/send-daily-lineup-email.ts                       # all non-opted-out teams
 *   npx tsx scripts/send-daily-lineup-email.ts --teamId=1            # one team only
 *   npx tsx scripts/send-daily-lineup-email.ts --teamId=1 --email=test@example.com  # override address
 *
 * The GitHub Actions workflow hits the deployed API endpoint instead of running
 * this script directly.
 */

import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const SITE_URL = (process.env['NEWSLETTER_SITE_URL'] ?? 'https://continentalpressbox.com').replace(/\/$/, '');
const SECRET = process.env['WIN_PROBABILITY_SECRET'] ?? '';

async function main() {
  const args = process.argv.slice(2);
  const teamIdArg = args.find(a => a.startsWith('--teamId='))?.split('=')[1];
  const emailArg  = args.find(a => a.startsWith('--email='))?.split('=')[1];

  const params = new URLSearchParams();
  if (teamIdArg) params.set('teamId', teamIdArg);
  if (emailArg)  params.set('email', emailArg);

  const url = `${SITE_URL}/api/send-daily-lineup-emails?${params.toString()}`;
  console.log(`POST ${url}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${SECRET}` },
  });

  const body = await res.json() as { sent?: number; failed?: number; results?: unknown[]; error?: string };
  if (!res.ok) {
    console.error('Error:', body.error ?? res.statusText);
    process.exit(1);
  }
  console.log(`Sent: ${body.sent ?? 0}  Failed: ${body.failed ?? 0}`);
  if (body.results) {
    for (const r of body.results as { teamId: number; success: boolean; error?: string }[]) {
      console.log(`  Team ${r.teamId}: ${r.success ? '✓' : '✗ ' + (r.error ?? '')}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
