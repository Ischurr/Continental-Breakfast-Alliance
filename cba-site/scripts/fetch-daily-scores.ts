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
 * The output file is consumed by fetch-weekly-player-scores.ts as its primary
 * data source for completed periods, replacing unreliable ESPN historical API queries.
 *
 * Run manually: npx tsx scripts/fetch-daily-scores.ts
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

function parsePeriod(
  teams: AnyRecord[],
  period: number,
): Record<string, Record<string, DailyPlayerScore>> {
  const result: Record<string, Record<string, DailyPlayerScore>> = {};

  for (const team of teams) {
    const teamId = String(team.id as number);
    result[teamId] = {};
    const entries = (team.roster?.entries ?? []) as AnyRecord[];

    for (const entry of entries) {
      const lineupSlotId = entry.lineupSlotId as number;
      const ppe = entry.playerPoolEntry as AnyRecord | undefined;
      const player = ppe?.player as AnyRecord | undefined;
      if (!player) continue;

      const playerId = String(player.id ?? entry.playerId);
      const defaultPositionId = player.defaultPositionId as number | undefined;
      const position = (defaultPositionId !== undefined ? DEFAULT_POSITION_MAP[defaultPositionId] : undefined) ?? 'UTIL';

      const dayStatEntry = (player.stats as AnyRecord[] | undefined)
        ?.find(s => s.statSourceId === 0 && s.statSplitTypeId === 5 && s.scoringPeriodId === period && s.seasonId === season);
      const dayScore = (dayStatEntry?.appliedTotal as number) ?? 0;

      const incoming: DailyPlayerScore = {
        slotId: lineupSlotId,
        dayScore,
        playerName: (player.fullName as string) ?? 'Unknown',
        position,
        photoUrl: `https://a.espncdn.com/i/headshots/mlb/players/full/${playerId}.png`,
      };

      // When a player appears twice (multi-position eligibility, mid-transaction),
      // prefer active slot over bench/IL, and non-zero score over zero.
      const existing = result[teamId][playerId];
      if (!existing) {
        result[teamId][playerId] = incoming;
      } else {
        const existingIsActive = !BENCH_SLOT_IDS.has(existing.slotId) && existing.slotId !== IL_SLOT_ID;
        const incomingIsActive = !BENCH_SLOT_IDS.has(lineupSlotId) && lineupSlotId !== IL_SLOT_ID;
        const keepIncoming =
          (!existingIsActive && incomingIsActive) ||
          (existingIsActive === incomingIsActive && incoming.dayScore !== 0 && existing.dayScore === 0);
        if (keepIncoming) result[teamId][playerId] = incoming;
      }
    }
  }

  return result;
}

async function main() {
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

  // Capture current period and the two preceding ones — triple coverage so a missed
  // cron day is always recovered the following run. Skip already-captured periods.
  const periodsToCapture = [currentPeriod - 2, currentPeriod - 1, currentPeriod].filter(
    p => p >= 1 && !(String(p) in dailyData.periods),
  );

  if (periodsToCapture.length === 0) {
    console.log('All periods already captured — nothing to do.');
    return;
  }

  console.log(`Capturing periods: ${periodsToCapture.join(', ')}`);

  for (const period of periodsToCapture) {
    process.stdout.write(`  Fetching period ${period}...`);
    try {
      const data = await client.fetchLeagueData(['mTeam', 'mRoster'], period) as AnyRecord;
      const teams = (data.teams ?? []) as AnyRecord[];
      dailyData.periods[String(period)] = parsePeriod(teams, period);

      const teamCount = Object.keys(dailyData.periods[String(period)]).length;
      const playerCount = Object.values(dailyData.periods[String(period)])
        .reduce((s, t) => s + Object.keys(t).length, 0);
      console.log(` ${teamCount} teams, ${playerCount} player entries`);

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
