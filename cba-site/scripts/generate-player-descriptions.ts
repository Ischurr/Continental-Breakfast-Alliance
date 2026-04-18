/**
 * Generates two narrative paragraphs per player using Claude API:
 *   1. background   — career context, style, fantasy relevance (cached until force-refresh)
 *   2. recentAnalysis — 1-2 sentences on recent weeks/month of performance (refreshed weekly)
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
const FRESH_DAYS = 6; // Regenerate recentAnalysis if older than this many days
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

async function fetchStatSummary(mlbamId: number, role: 'H' | 'SP' | 'RP'): Promise<string> {
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

  const [seasonStat, l30Stat] = await Promise.all([
    fetchSplit('season'),
    fetchSplit('lastXDays&days=30'),
  ]);

  if (!seasonStat && !l30Stat) return '(No 2026 MLB stats yet — may be on IL or pre-debut)';

  if (role === 'H') {
    const fmtHitter = (s: Record<string, unknown> | null, label: string) => {
      if (!s) return `${label}: no data`;
      const avg = s.avg ?? '—'; const ops = s.ops ?? '—';
      const hr = s.homeRuns ?? 0; const rbi = s.rbi ?? 0;
      const sb = s.stolenBases ?? 0; const k = s.strikeOuts ?? 0;
      const pa = s.plateAppearances ?? 0;
      return `${label}: .${String(avg).replace('0.', '').replace('.', '')} AVG / ${ops} OPS / ${hr} HR / ${rbi} RBI / ${sb} SB / ${k} K in ${pa} PA`;
    };
    return [fmtHitter(seasonStat, '2026 season'), fmtHitter(l30Stat, 'Last 30 days')].join('\n');
  } else {
    const fmtPitcher = (s: Record<string, unknown> | null, label: string) => {
      if (!s) return `${label}: no data`;
      const era = s.era ?? '—'; const whip = s.whip ?? '—';
      const k = s.strikeOuts ?? 0; const ip = s.inningsPitched ?? '0';
      const w = s.wins ?? 0; const sv = s.saves ?? 0;
      const qs = s.qualityStarts ?? 0;
      return `${label}: ${era} ERA / ${whip} WHIP / ${k} K / ${ip} IP${w ? ` / ${w}W` : ''}${sv ? ` / ${sv} SV` : ''}${qs ? ` / ${qs} QS` : ''}`;
    };
    return [fmtPitcher(seasonStat, '2026 season'), fmtPitcher(l30Stat, 'Last 30 days')].join('\n');
  }
}

async function generateDescriptions(
  player: EROSPPlayer,
  existing: PlayerDescription | undefined,
  client: Anthropic,
  needsBackground: boolean,
  needsRecent: boolean,
): Promise<{ background: string; recentAnalysis: string }> {
  const roleLabel = player.role === 'SP' ? 'starting pitcher' : player.role === 'RP' ? 'relief pitcher' : 'hitter';
  const ilNote = player.il_type ? ` (currently on ${player.il_type} IL${player.injury_note ? `: ${player.injury_note}` : ''})` : '';

  let statsText = '';
  if (needsRecent) {
    statsText = await fetchStatSummary(player.mlbam_id, player.role);
  }

  const sections: string[] = [];
  if (needsBackground) {
    sections.push(`BACKGROUND (2-3 sentences): Write about ${player.name}'s career history, playing style, key strengths or weaknesses, and why they matter in fantasy baseball. Be specific. Present tense for active aspects.`);
  }
  if (needsRecent) {
    sections.push(`RECENT_ANALYSIS (1-2 sentences): Analyze ${player.name}'s performance over the last few weeks/month based on these 2026 stats:\n${statsText}\n${ilNote ? `Note: ${ilNote}` : ''}\nBe concrete about trends — hot, cold, improving, declining. If no stats, note they haven't played yet.`);
  }

  const prompt = `You are a fantasy baseball analyst writing concise player profiles for a fantasy baseball league website. The audience is serious fantasy baseball managers who want quick, useful insight.

Player: ${player.name}
Position: ${player.position} | Team: ${player.mlb_team} | Role: ${roleLabel}${ilNote}

${sections.join('\n\n')}

Respond with ONLY a valid JSON object, no markdown, no explanation, no code block:
{${needsBackground ? '"background": "..."' : ''}${needsBackground && needsRecent ? ', ' : ''}${needsRecent ? '"recentAnalysis": "..."' : ''}}`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '{}';

  let parsed: { background?: string; recentAnalysis?: string } = {};
  try {
    // Strip markdown code block if model added it anyway
    const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    console.warn(`  ⚠ JSON parse failed for ${player.name}, raw: ${text.slice(0, 100)}`);
  }

  return {
    background: parsed.background ?? existing?.background ?? '',
    recentAnalysis: parsed.recentAnalysis ?? existing?.recentAnalysis ?? '',
  };
}

async function main() {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY not set');
    process.exit(1);
  }
  const client = new Anthropic({ apiKey });

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

  console.log(`\n🚀 Generating player descriptions for top ${players.length} players`);
  console.log(`   Force background: ${forceBackground} | Fresh threshold: ${FRESH_DAYS} days\n`);

  for (let i = 0; i < players.length; i++) {
    const player = players[i]!;
    const key = String(player.mlbam_id);
    const existing = cache[key];
    const { needsBackground, needsRecent } = isStale(existing, forceBackground);

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
