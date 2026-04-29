/**
 * Generates two narrative paragraphs per player using Claude API:
 *   1. background   — career context, style, fantasy relevance (Claude Haiku, cached until force-refresh)
 *   2. recentAnalysis — L7/L14/season stats formatted as a stat line (MLB Stats API only, no AI cost, refreshed daily)
 *
 * Reads: data/erosp/latest.json (player list + injury info)
 * Writes: data/player-descriptions.json
 *
 * Run: npx tsx scripts/generate-player-descriptions.ts
 * Options:
 *   --force-background   Regenerate background for all players too (slow)
 *   --top N              Process top N players by EROSP (default 400)
 *   --player <name>      Process a single player by name (for testing)
 */

import fs from 'fs';
import path from 'path';
import { config as dotenvConfig } from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

// Load .env.local for local development
dotenvConfig({ path: path.join(path.dirname(new URL(import.meta.url).pathname), '..', '.env.local') });

const MLB_BASE = 'https://statsapi.mlb.com/api/v1';
const FRESH_DAYS = 0; // Regenerate recentAnalysis every run (daily cron)
const DEFAULT_TOP = 400;

const args = process.argv.slice(2);
const forceBackground = args.includes('--force-background');
const topN = (() => {
  const idx = args.indexOf('--top');
  return idx >= 0 ? parseInt(args[idx + 1] ?? '400', 10) : DEFAULT_TOP;
})();
const singlePlayer = (() => {
  const idx = args.indexOf('--player');
  return idx >= 0 ? args[idx + 1]?.toLowerCase() : null;
})();

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const EROSP_PATH = path.join(ROOT, 'data', 'erosp', 'latest.json');
const DESC_PATH = path.join(ROOT, 'data', 'player-descriptions.json');

interface EROSPPlayer {
  mlbam_id: number;
  name: string;
  position: string;
  mlb_team: string;
  role: 'H' | 'SP' | 'RP';
  erosp_raw: number;
  erosp_per_game?: number;
  il_type?: string;
  injury_note?: string;
}

interface PlayerDescription {
  name: string;
  background: string;
  backgroundGeneratedAt: string;
  recentAnalysis: string;
  recentAnalysisUpdatedAt: string;
}

type DescriptionCache = Record<string, PlayerDescription>;

function isStale(desc: PlayerDescription | undefined, forceBack: boolean): { needsBackground: boolean; needsRecent: boolean } {
  if (!desc) return { needsBackground: true, needsRecent: true };
  const daysSinceRecent = (Date.now() - new Date(desc.recentAnalysisUpdatedAt).getTime()) / 86_400_000;
  return {
    needsBackground: forceBack || !desc.background,
    needsRecent: daysSinceRecent > FRESH_DAYS,
  };
}

interface StatSplits {
  season: Record<string, unknown> | null;
  l14: Record<string, unknown> | null;
  l7: Record<string, unknown> | null;
}

async function fetchStatSplits(mlbamId: number, role: 'H' | 'SP' | 'RP'): Promise<StatSplits> {
  const group = role === 'H' ? 'hitting' : 'pitching';
  const base = `${MLB_BASE}/people/${mlbamId}/stats?season=2026&group=${group}&sportId=1`;

  async function fetchSplit(params: string): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetch(`${base}&stats=${params}`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const json = await res.json() as { stats?: Array<{ splits?: Array<{ stat: Record<string, unknown> }> }> };
      return json?.stats?.[0]?.splits?.[0]?.stat ?? null;
    } catch {
      return null;
    }
  }

  const [season, l14, l7] = await Promise.all([
    fetchSplit('season'),
    fetchSplit('lastXDays&days=14'),
    fetchSplit('lastXDays&days=7'),
  ]);

  return { season, l14, l7 };
}

function formatAvg(avg: unknown): string {
  if (!avg || avg === '---') return '—';
  const s = String(avg).replace('0.', '').replace('.', '');
  return `.${s.padStart(3, '0')}`;
}

function buildRecentAnalysis(role: 'H' | 'SP' | 'RP', splits: StatSplits, ilNote: string): string {
  const { season, l14, l7 } = splits;

  if (!season && !l14 && !l7) {
    return ilNote
      ? `${ilNote.trim().replace(/^\(/, '').replace(/\)$/, '')} — no 2026 stats yet.`
      : 'No 2026 MLB stats yet — may be pre-debut or recently acquired.';
  }

  if (role === 'H') {
    const fmtH = (s: Record<string, unknown> | null) => {
      if (!s) return null;
      const avg = formatAvg(s.avg);
      const ops = s.ops ?? '—';
      const hr = Number(s.homeRuns ?? 0);
      const rbi = Number(s.rbi ?? 0);
      const sb = Number(s.stolenBases ?? 0);
      const pa = Number(s.plateAppearances ?? 0);
      return { avg, ops: String(ops), hr, rbi, sb, pa };
    };
    const s = fmtH(season); const f14 = fmtH(l14); const f7 = fmtH(l7);

    const parts: string[] = [];
    if (f7) parts.push(`L7: ${f7.avg}/${f7.ops} OPS, ${f7.hr} HR, ${f7.rbi} RBI${f7.sb ? `, ${f7.sb} SB` : ''} in ${f7.pa} PA`);
    if (f14) parts.push(`L14: ${f14.avg}/${f14.ops} OPS, ${f14.hr} HR, ${f14.rbi} RBI${f14.sb ? `, ${f14.sb} SB` : ''} in ${f14.pa} PA`);
    if (s) parts.push(`2026 season: ${s.avg}/${s.ops} OPS, ${s.hr} HR, ${s.rbi} RBI`);
    if (ilNote) parts.push(ilNote.trim().replace(/^\(/, '').replace(/\)$/, ''));
    return parts.join(' · ');
  } else {
    const fmtP = (s: Record<string, unknown> | null) => {
      if (!s) return null;
      const era = s.era ?? '—';
      const whip = s.whip ?? '—';
      const k = Number(s.strikeOuts ?? 0);
      const ip = s.inningsPitched ?? '0';
      const sv = Number(s.saves ?? 0);
      const qs = Number(s.qualityStarts ?? 0);
      return { era: String(era), whip: String(whip), k, ip: String(ip), sv, qs };
    };
    const s = fmtP(season); const f14 = fmtP(l14); const f7 = fmtP(l7);

    const parts: string[] = [];
    if (f7) parts.push(`L7: ${f7.era} ERA/${f7.whip} WHIP, ${f7.k} K in ${f7.ip} IP${f7.sv ? `, ${f7.sv} SV` : ''}${f7.qs ? `, ${f7.qs} QS` : ''}`);
    if (f14) parts.push(`L14: ${f14.era} ERA/${f14.whip} WHIP, ${f14.k} K in ${f14.ip} IP`);
    if (s) parts.push(`2026 season: ${s.era} ERA/${s.whip} WHIP, ${s.k} K`);
    if (ilNote) parts.push(ilNote.trim().replace(/^\(/, '').replace(/\)$/, ''));
    return parts.join(' · ');
  }
}

async function generateDescriptions(
  player: EROSPPlayer,
  existing: PlayerDescription | undefined,
  client: Anthropic | null,
  needsBackground: boolean,
  needsRecent: boolean,
): Promise<{ background: string; recentAnalysis: string }> {
  const roleLabel = player.role === 'SP' ? 'starting pitcher' : player.role === 'RP' ? 'relief pitcher' : 'hitter';
  const ilNote = player.il_type ? `(currently on ${player.il_type} IL${player.injury_note ? `: ${player.injury_note}` : ''})` : '';

  // recentAnalysis is built directly from MLB Stats API — no Claude call needed.
  let recentAnalysis = existing?.recentAnalysis ?? '';
  if (needsRecent) {
    const splits = await fetchStatSplits(player.mlbam_id, player.role);
    recentAnalysis = buildRecentAnalysis(player.role, splits, ilNote);
  }

  // background is the only field that uses Claude, and only when missing or force-refreshed.
  let background = existing?.background ?? '';
  if (needsBackground && client) {
    const prompt = `You are a fantasy baseball analyst writing concise player profiles for a fantasy baseball league website. The audience is serious fantasy baseball managers who want quick, useful insight.

Player: ${player.name}
Position: ${player.position} | Team: ${player.mlb_team} | Role: ${roleLabel}${ilNote ? ` ${ilNote}` : ''}

BACKGROUND (2-3 sentences): Write about ${player.name}'s career history, playing style, key strengths or weaknesses, and why they matter in fantasy baseball. Be specific. Present tense for active aspects.

Respond with ONLY a valid JSON object, no markdown, no explanation, no code block:
{"background": "..."}`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '{}';
    try {
      const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(clean) as { background?: string };
      background = parsed.background ?? background;
    } catch {
      console.warn(`  ⚠ JSON parse failed for ${player.name}, raw: ${text.slice(0, 100)}`);
    }
  }

  return { background, recentAnalysis };
}

async function main() {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  // Claude is only needed for background generation; daily stats runs don't need it.
  const client = apiKey ? new Anthropic({ apiKey }) : null;

  if (!fs.existsSync(EROSP_PATH)) {
    console.error('❌ data/erosp/latest.json not found — run compute_erosp.py first');
    process.exit(1);
  }

  const erospRaw = JSON.parse(fs.readFileSync(EROSP_PATH, 'utf-8')) as { players?: EROSPPlayer[] };
  let players = (erospRaw.players ?? []).filter(p => p.mlbam_id);

  if (singlePlayer) {
    players = players.filter(p => p.name.toLowerCase().includes(singlePlayer));
    if (players.length === 0) {
      console.error(`❌ No player matching "${singlePlayer}"`);
      process.exit(1);
    }
    console.log(`🎯 Single-player mode: ${players.map(p => p.name).join(', ')}`);
  } else {
    // Sort by EROSP, take top N
    players.sort((a, b) => (b.erosp_raw ?? 0) - (a.erosp_raw ?? 0));
    players = players.slice(0, topN);
  }

  const cache: DescriptionCache = fs.existsSync(DESC_PATH)
    ? JSON.parse(fs.readFileSync(DESC_PATH, 'utf-8'))
    : {};

  const today = new Date().toISOString().slice(0, 10);
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  if (!client) {
    console.log('ℹ️  ANTHROPIC_API_KEY not set — background generation skipped; stats-only run.\n');
  }

  console.log(`\n🚀 Generating player descriptions for top ${players.length} players`);
  console.log(`   Force background: ${forceBackground && !!client} | Stats: MLB Stats API (L7/L14/season, no AI cost) | Fresh threshold: ${FRESH_DAYS} days\n`);

  for (let i = 0; i < players.length; i++) {
    const player = players[i]!;
    const key = String(player.mlbam_id);
    const existing = cache[key];
    const stale = isStale(existing, forceBackground);
    const needsBackground = stale.needsBackground && !!client;
    const needsRecent = stale.needsRecent;

    if (!needsBackground && !needsRecent) {
      skipped++;
      continue;
    }

    const whatNeeds = [needsBackground && 'background', needsRecent && 'recent'].filter(Boolean).join('+');
    process.stdout.write(`[${i + 1}/${players.length}] ${player.name} (${player.mlb_team}) — ${whatNeeds}... `);

    try {
      const result = await generateDescriptions(player, existing, client, needsBackground, needsRecent);

      cache[key] = {
        name: player.name,
        background: result.background || existing?.background || '',
        backgroundGeneratedAt: needsBackground ? today : (existing?.backgroundGeneratedAt ?? today),
        recentAnalysis: result.recentAnalysis || existing?.recentAnalysis || '',
        recentAnalysisUpdatedAt: needsRecent ? today : (existing?.recentAnalysisUpdatedAt ?? today),
      };

      process.stdout.write('✓\n');
      processed++;

      // Save every 25 players so progress isn't lost on crash
      if (processed % 25 === 0) {
        fs.writeFileSync(DESC_PATH, JSON.stringify(cache, null, 2));
        console.log(`  💾 Saved progress (${processed} processed so far)`);
      }

      // Rate-limit: ~300ms between calls to be kind to both APIs
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      process.stdout.write(`❌ ${String(err).slice(0, 80)}\n`);
      errors++;
      // Don't let one error kill the whole run
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  fs.writeFileSync(DESC_PATH, JSON.stringify(cache, null, 2));

  console.log(`\n✅ Done.`);
  console.log(`   Processed: ${processed} | Skipped (fresh): ${skipped} | Errors: ${errors}`);
  console.log(`   Total cached: ${Object.keys(cache).length} players`);
  console.log(`   Saved to ${DESC_PATH}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
