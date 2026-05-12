/**
 * Captures each day's per-player fantasy scores from ESPN while the data is fresh,
 * building a local authoritative record in data/current/daily-scores-{season}.json.
 *
 * Run daily via GitHub Actions (update-daily-scores.yml) at ~5 AM EST, after all
 * MLB games from the previous day are finalized in ESPN's system.
 *
 * Strategy: fetch both the current ESPN scoring period AND the previous one each run.
 * This gives double coverage — if the cron misfires one day, the next run catches it.
 * Already-captured periods are skipped (idempotent).
 *
 * Source: mMatchupScore view gives pre-computed per-player appliedTotal values that
 * match ESPN's official matchup scores exactly. mRoster is fetched alongside it to
 * supply player IDs and names (same entry order, joined by index).
 *
 * Run manually:    npx tsx scripts/fetch-daily-scores.ts
 * Backfill:        npx tsx scripts/fetch-daily-scores.ts --backfill
 * Force re-fetch:  npx tsx scripts/fetch-daily-scores.ts --backfill --force
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createESPNClient } from '../lib/espn-api';
import * as fs from 'fs';
import * as path from 'path';
import type { DailyPlayerScore, DailyScoresData } from '../lib/types';

const season = parseInt(process.env['ESPN_SEASON_ID'] ?? '2026', 10);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

const DEFAULT_POSITION_MAP: Record<number, string> = {
  1: 'SP', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS',
  7: 'OF', 8: 'OF', 9: 'OF', 10: 'DH', 11: 'RP',
};

const BENCH_SLOT_IDS = new Set([16]);
const IL_SLOT_ID = 17;

// Parses one scoring period using mMatchupScore (for accurate appliedTotal per player)
// and mRoster (for player IDs/names). Both views return entries in the same order,
// so we join them by index.
//
// mMatchupScore only populates rosterForCurrentScoringPeriod for the active matchup
// week — entries are empty for all other weeks in the schedule array.
function parsePeriod(
  schedule: AnyRecord[],
  teamsById: Map<number, AnyRecord[]>,
  period: number,
): Record<string, Record<string, DailyPlayerScore>> {
  const result: Record<string, Record<string, DailyPlayerScore>> = {};

  for (const matchup of schedule) {
    for (const side of [matchup.home as AnyRecord, matchup.away as AnyRecord]) {
      const teamId = side.teamId as number;
      const matchupEntries = (side.rosterForCurrentScoringPeriod?.entries ?? []) as AnyRecord[];

      // mMatchupScore only populates this for the active matchup period; skip others.
      if (matchupEntries.length === 0) continue;

      const rosterEntries = teamsById.get(teamId) ?? [];

      if (matchupEntries.length !== rosterEntries.length) {
        console.warn(`  [warn] period ${period} team ${teamId}: entry count mismatch (matchup=${matchupEntries.length} roster=${rosterEntries.length}) — skipping team`);
        continue;
      }

      result[String(teamId)] = {};

      for (let i = 0; i < matchupEntries.length; i++) {
        const me = matchupEntries[i];  // mMatchupScore: slot + appliedTotal
        const re = rosterEntries[i];   // mRoster: player ID, name, position

        const lineupSlotId = me.lineupSlotId as number;
        // appliedTotal is ESPN's pre-computed matchup score for this player/period.
        // It matches the official team score exactly and is unaffected by later stat corrections.
        const dayScore = (me.playerPoolEntry?.player?.stats?.[0]?.appliedTotal as number) ?? 0;

        const ppe = re?.playerPoolEntry as AnyRecord | undefined;
        const player = ppe?.player as AnyRecord | undefined;
        if (!player) continue;

        const playerId = String(player.id ?? ppe?.id ?? '');
        if (!playerId || playerId === 'undefined') continue;

        const defaultPositionId = player.defaultPositionId as number | undefined;
        const position = (defaultPositionId !== undefined ? DEFAULT_POSITION_MAP[defaultPositionId] : undefined) ?? 'UTIL';

        const incoming: DailyPlayerScore = {
          slotId: lineupSlotId,
          dayScore,
          playerName: (player.fullName as string) ?? 'Unknown',
          position,
          photoUrl: `https://a.espncdn.com/i/headshots/mlb/players/full/${playerId}.png`,
        };

        // When a player appears at multiple indices (rare: multi-position eligibility,
        // mid-transaction state), prefer active slot over bench/IL, then non-zero score.
        const existing = result[String(teamId)][playerId];
        if (!existing) {
          result[String(teamId)][playerId] = incoming;
        } else {
          const existingIsActive = !BENCH_SLOT_IDS.has(existing.slotId) && existing.slotId !== IL_SLOT_ID;
          const incomingIsActive = !BENCH_SLOT_IDS.has(lineupSlotId) && lineupSlotId !== IL_SLOT_ID;
          const keepIncoming =
            (!existingIsActive && incomingIsActive) ||
            (existingIsActive === incomingIsActive && incoming.dayScore !== 0 && existing.dayScore === 0);
          if (keepIncoming) result[String(teamId)][playerId] = incoming;
        }
      }
    }
  }

  return result;
}

async function main() {
  const backfill = process.argv.includes('--backfill');
  const force = process.argv.includes('--force');
  const client = createESPNClient(String(season));
  const outPath = path.join(__dirname, `../data/current/daily-scores-${season}.json`);

  // Load or initialise the accumulator file.
  let dailyData: DailyScoresData = { season, lastUpdated: '', periods: {} };
  if (fs.existsSync(outPath)) {
    dailyData = JSON.parse(fs.readFileSync(outPath, 'utf-8')) as DailyScoresData;
  }

  // Fetch without a specific period to get ESPN's current scoringPeriodId.
  console.log('Fetching current ESPN scoring period...');
  const leagueData = await client.fetchLeagueData(['mSettings']) as AnyRecord;
  const currentPeriod = leagueData.scoringPeriodId as number | undefined;

  if (!currentPeriod) {
    console.error('Could not determine current scoring period from ESPN response. Aborting.');
    process.exit(1);
  }
  console.log(`ESPN current scoring period: ${currentPeriod}`);

  // In backfill mode, capture every period from 1 to current.
  // In normal mode, capture current and the two preceding ones (triple coverage).
  let periodsToCapture: number[];
  if (backfill) {
    periodsToCapture = Array.from({ length: currentPeriod }, (_, i) => i + 1)
      .filter(p => force || !(String(p) in dailyData.periods));
    console.log(`Backfill mode: ${periodsToCapture.length} periods to fetch (out of ${currentPeriod} total)${force ? ' [force re-fetch]' : ''}.`);
  } else {
    // Always re-fetch yesterday (currentPeriod - 1) even if cached: the cron runs at 5-6 AM before
    // that day's games, so a period first captured as "current" has all-0 scores. The next morning
    // it's "yesterday" and finally has real scores — we must overwrite the stale 0s.
    periodsToCapture = [currentPeriod - 2, currentPeriod - 1, currentPeriod].filter(
      p => p >= 1 && (p >= currentPeriod - 1 || !(String(p) in dailyData.periods)),
    );
  }

  if (periodsToCapture.length === 0) {
    console.log('All periods already captured — nothing to do.');
    return;
  }

  console.log(`Capturing periods: ${periodsToCapture.join(', ')}`);

  for (let i = 0; i < periodsToCapture.length; i++) {
    const period = periodsToCapture[i];
    process.stdout.write(`  [${i + 1}/${periodsToCapture.length}] Fetching period ${period}...`);
    try {
      const data = await client.fetchLeagueData(['mMatchupScore', 'mRoster'], period) as AnyRecord;
      const schedule = (data.schedule ?? []) as AnyRecord[];
      const teams = (data.teams ?? []) as AnyRecord[];

      // Build teamId → roster entries map from mRoster data.
      const teamsById = new Map<number, AnyRecord[]>();
      for (const team of teams) {
        teamsById.set(team.id as number, (team.roster?.entries ?? []) as AnyRecord[]);
      }

      dailyData.periods[String(period)] = parsePeriod(schedule, teamsById, period);

      const teamCount = Object.keys(dailyData.periods[String(period)]).length;
      const playerCount = Object.values(dailyData.periods[String(period)])
        .reduce((s, t) => s + Object.keys(t).length, 0);
      console.log(` ${teamCount} teams, ${playerCount} player entries`);

      // Checkpoint every 10 periods during backfill so progress isn't lost on crash.
      if (backfill && (i + 1) % 10 === 0) {
        dailyData.lastUpdated = new Date().toISOString();
        fs.writeFileSync(outPath, JSON.stringify(dailyData, null, 2));
        console.log(`  [checkpoint] Saved after ${i + 1} periods.`);
      }

      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.error(`\n  Error fetching period ${period}:`, e);
    }
  }

  dailyData.lastUpdated = new Date().toISOString();
  fs.writeFileSync(outPath, JSON.stringify(dailyData, null, 2));

  const totalPeriods = Object.keys(dailyData.periods).length;
  console.log(`\nSaved ${outPath}`);
  console.log(`Total periods captured: ${totalPeriods}`);
}

main().catch(console.error);
