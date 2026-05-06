/**
 * Fetches per-scoring-period roster data for all completed weeks of the current season.
 * For each player per team per day, captures:
 *   - lineupSlotId (which slot they were in — bench=16, DH=12, SP=13/14, etc.)
 *   - season cumulative total (statSplitTypeId=0) — diffed across periods for per-day points
 *
 * Output: data/current/weekly-player-scores-{season}.json
 * Run: npx tsx scripts/fetch-weekly-player-scores.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createESPNClient } from '../lib/espn-api';
import * as fs from 'fs';
import * as path from 'path';
import type { WeeklyPlayerEntry, WeeklyTeamBreakdown, WeeklyScoresData } from '../lib/types';

const season = parseInt(process.env['ESPN_SEASON_ID'] ?? '2026', 10);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

const DEFAULT_POSITION_MAP: Record<number, string> = {
  1: 'SP', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS',
  7: 'OF', 8: 'OF', 9: 'OF', 10: 'DH', 11: 'RP',
};

// lineupSlotId → fantasy slot label for display
// Confirmed via live roster inspection (period 40):
//   17 = IL (Lindor, Snell, Bieber — confirmed injured)
//   16 = Bench
//   11 = UTIL/DH active slot (Judge, Trout, Schwarber)
//   12 = DH/UTIL active slot (Basallo, Paredes, McLain)
//   IMPORTANT: eligibleSlots uses 11=IL, but lineupSlotId 11 ≠ IL
const SLOT_LABEL_MAP: Record<number, string> = {
  0: 'C', 1: '1B', 2: '2B', 3: '3B', 4: 'SS',
  5: 'OF',
  6: 'MIF',  // MI flex
  7: 'CIF',  // CI flex
  8: 'OF', 9: 'OF', 10: 'OF',
  11: 'UTIL',
  12: 'DH',
  13: 'SP', 14: 'SP',
  15: 'RP',
  19: 'UTIL',
};

const BENCH_SLOT_IDS = new Set([16]);
const IL_SLOT_ID = 17;

interface PerPeriodPlayerSnapshot {
  slotId: number;
  dayScore: number;      // FP scored specifically on this scoring period (statSplitTypeId=5, scoringPeriodId===period)
  playerName: string;
  position: string;      // primary MLB position
  photoUrl: string;
}

// period → teamId → playerId → snapshot
type PeriodCache = Record<number, Record<number, Record<string, PerPeriodPlayerSnapshot>>>;

function parsePeriodSnapshot(
  teams: AnyRecord[],
  currentPeriod: number,
): Record<number, Record<string, PerPeriodPlayerSnapshot>> {
  const result: Record<number, Record<string, PerPeriodPlayerSnapshot>> = {};

  for (const team of teams) {
    const teamId = team.id as number;
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

      // ESPN returns statSplitTypeId=5 entries as per-day scores, each tagged with their scoringPeriodId.
      // A given period query returns entries for the current and previous period.
      // We extract only the entry matching currentPeriod — that's today's fantasy points.
      // statSplitTypeId=0 (season cumulative) and statSplitTypeId=5 with wrong period are NOT period-aware
      // and always reflect the current date's totals, making them useless for historical week breakdowns.
      const dayStatEntry = (player.stats as AnyRecord[] | undefined)
        ?.find(s => s.statSourceId === 0 && s.statSplitTypeId === 5 && s.scoringPeriodId === currentPeriod && s.seasonId === season);
      const dayScore = (dayStatEntry?.appliedTotal as number) ?? 0;

      result[teamId][playerId] = {
        slotId: lineupSlotId,
        dayScore,
        playerName: (player.fullName as string) ?? 'Unknown',
        position,
        photoUrl: `https://a.espncdn.com/i/headshots/mlb/players/full/${playerId}.png`,
      };
    }
  }

  return result;
}

function computeWeekBreakdowns(
  periodCache: PeriodCache,
  weekPeriods: number[],
): WeeklyTeamBreakdown[] {
  // Collect all team IDs
  const allTeamIds = new Set<number>();
  for (const snap of Object.values(periodCache)) {
    for (const teamId of Object.keys(snap)) allTeamIds.add(Number(teamId));
  }

  const result: WeeklyTeamBreakdown[] = [];

  for (const teamId of allTeamIds) {
    // Collect all players seen this week across all periods
    const playerIds = new Set<string>();
    for (const period of weekPeriods) {
      const snap = periodCache[period]?.[teamId];
      if (snap) {
        for (const pid of Object.keys(snap)) playerIds.add(pid);
      }
    }

    const playerEntries: WeeklyPlayerEntry[] = [];

    for (const playerId of playerIds) {
      // Get the last snapshot this week (for metadata: name, position, photo, final slot)
      let lastSnap: PerPeriodPlayerSnapshot | undefined;
      for (let i = weekPeriods.length - 1; i >= 0; i--) {
        const snap = periodCache[weekPeriods[i]]?.[teamId]?.[playerId];
        if (snap) { lastSnap = snap; break; }
      }
      if (!lastSnap) continue;

      // Sum per-day scores and attribute each day to active vs bench based on actual slot.
      // dayScore is the FP scored specifically on that scoring period (statSplitTypeId=5,
      // scoringPeriodId===period). This is accurate for both historical and current weeks.
      let weekPoints = 0;
      let activePoints = 0;
      let benchPoints = 0;
      let activeDays = 0;
      let benchDays = 0;
      const slotCountsActive: Record<number, number> = {};

      for (const period of weekPeriods) {
        const snap = periodCache[period]?.[teamId]?.[playerId];
        if (!snap) continue;

        const slotId = snap.slotId;
        const pts = snap.dayScore;
        weekPoints += pts;

        if (BENCH_SLOT_IDS.has(slotId)) {
          benchDays++;
          benchPoints += pts;
        } else if (slotId === IL_SLOT_ID) {
          // On IL — points don't count toward team score; skip
        } else {
          activeDays++;
          activePoints += pts;
          slotCountsActive[slotId] = (slotCountsActive[slotId] ?? 0) + 1;
        }
      }

      // Primary slot = most common active slot; if never active, use last known slot
      let primarySlotId = 16; // default bench
      let maxCount = 0;
      for (const [sid, cnt] of Object.entries(slotCountsActive)) {
        if (cnt > maxCount) { maxCount = cnt; primarySlotId = Number(sid); }
      }
      if (maxCount === 0) {
        primarySlotId = lastSnap.slotId;
      }

      const primarySlot = SLOT_LABEL_MAP[primarySlotId] ?? lastSnap.position;

      // Only include players who appeared on the roster at some point this week
      if (weekPoints === 0 && activeDays === 0 && benchDays === 0) continue;

      playerEntries.push({
        playerId,
        playerName: lastSnap.playerName,
        position: lastSnap.position,
        primarySlot,
        primarySlotId,
        weekPoints: Math.round(weekPoints * 10) / 10,
        activePoints: Math.round(activePoints * 10) / 10,
        benchPoints: Math.round(benchPoints * 10) / 10,
        activeDays,
        benchDays,
        photoUrl: lastSnap.photoUrl,
      });
    }

    // Sort: active players first (by activePoints desc), then bench-only by benchPoints desc
    playerEntries.sort((a, b) => {
      if (a.activeDays > 0 && b.activeDays === 0) return -1;
      if (a.activeDays === 0 && b.activeDays > 0) return 1;
      return b.activePoints - a.activePoints;
    });

    const benchTotal = playerEntries.reduce((s, p) => s + p.benchPoints, 0);
    const activeTotal = playerEntries.reduce((s, p) => s + p.activePoints, 0);

    result.push({
      teamId,
      week: 0, // filled in by caller
      totalPoints: Math.round(activeTotal * 10) / 10,
      benchTotal: Math.round(benchTotal * 10) / 10,
      players: playerEntries,
    });
  }

  return result;
}

async function main() {
  const client = createESPNClient(String(season));

  // Load schedule config
  const schedulePath = path.join(__dirname, `../data/fantasy/schedule-${season}.json`);
  const scheduleJson = JSON.parse(fs.readFileSync(schedulePath, 'utf-8')) as {
    matchupPeriods: Record<string, number[]>;
  };
  const matchupPeriods = scheduleJson.matchupPeriods;

  // Load current season to identify completed weeks
  const currentPath = path.join(__dirname, `../data/current/${season}.json`);
  const currentSeason = JSON.parse(fs.readFileSync(currentPath, 'utf-8')) as {
    matchups: { week: number; winner?: unknown }[];
  };

  const weeksByNum: Record<number, typeof currentSeason.matchups> = {};
  for (const m of currentSeason.matchups) {
    if (!weeksByNum[m.week]) weeksByNum[m.week] = [];
    weeksByNum[m.week].push(m);
  }

  // Find the highest completed week (all matchups have winner) + the current in-progress week
  const completedWeeks = new Set<number>();
  let highestActiveWeek = 0;
  for (const [weekStr, matchups] of Object.entries(weeksByNum)) {
    const week = Number(weekStr);
    const anyActivity = matchups.some(m => (m as { home?: { totalPoints?: number } }).home?.totalPoints ?? 0 > 0);
    if (anyActivity) highestActiveWeek = Math.max(highestActiveWeek, week);
    if (matchups.length > 0 && matchups.every(m => m.winner !== undefined)) {
      completedWeeks.add(week);
    }
  }

  // Process all completed weeks + the current in-progress week
  const weeksToProcess = new Set([...completedWeeks]);
  if (highestActiveWeek > 0) weeksToProcess.add(highestActiveWeek);

  console.log(`Processing weeks: ${[...weeksToProcess].sort((a, b) => a - b).join(', ')}`);

  // Determine which scoring periods we need (all periods up through last period of highest active week)
  const maxWeek = Math.max(...weeksToProcess);
  const maxPeriod = Math.max(...(matchupPeriods[String(maxWeek)] ?? [0]));

  if (maxPeriod === 0) {
    console.log('No scoring periods found — season not started?');
    return;
  }

  console.log(`Fetching scoring periods 1–${maxPeriod}...`);

  // Fetch all periods (including period 0 as baseline = all zeros)
  const periodCache: PeriodCache = {};

  for (let period = 1; period <= maxPeriod; period++) {
    process.stdout.write(`  Period ${period}/${maxPeriod}...\r`);
    try {
      const data = await client.fetchLeagueData(['mTeam', 'mRoster'], period);
      const teams = (data.teams ?? []) as AnyRecord[];
      periodCache[period] = parsePeriodSnapshot(teams, period);
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      console.error(`\n  Error fetching period ${period}:`, e);
    }
  }
  console.log('\nAll periods fetched.');

  // Build output
  const weeksOutput: Record<string, WeeklyTeamBreakdown[]> = {};

  // Sort weeks in ascending order
  const sortedWeeks = [...weeksToProcess].sort((a, b) => a - b);

  for (const week of sortedWeeks) {
    const weekPeriods = matchupPeriods[String(week)];
    if (!weekPeriods || weekPeriods.length === 0) continue;

    const breakdowns = computeWeekBreakdowns(periodCache, weekPeriods);
    for (const b of breakdowns) b.week = week;

    weeksOutput[String(week)] = breakdowns;
    console.log(`  Week ${week}: ${breakdowns.length} teams processed`);
  }

  const output: WeeklyScoresData = {
    season,
    lastUpdated: new Date().toISOString(),
    weeks: weeksOutput,
  };

  const outPath = path.join(__dirname, `../data/current/weekly-player-scores-${season}.json`);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nSaved to ${outPath}`);

  // Summary
  for (const [week, teams] of Object.entries(weeksOutput)) {
    const totalBench = teams.reduce((s, t) => s + t.benchTotal, 0);
    const topBench = teams
      .flatMap(t => t.players.filter(p => p.benchPoints > 5))
      .sort((a, b) => b.benchPoints - a.benchPoints)
      .slice(0, 3)
      .map(p => `${p.playerName} (${p.benchPoints} bench pts)`);
    console.log(`  Week ${week}: total bench waste = ${totalBench.toFixed(1)} pts | Top bench: ${topBench.join(', ') || 'none'}`);
  }
}

main().catch(console.error);
