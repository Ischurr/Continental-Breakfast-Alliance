import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createESPNClient } from '../lib/espn-api';
import * as fs from 'fs';
import * as path from 'path';

const season = parseInt(process.env['ESPN_SEASON_ID'] ?? '2026', 10);

// ESPN defaultPositionId — the player's actual MLB position, confirmed from API:
//   1=SP  2=C  3=1B  4=2B  5=3B  6=SS  7=LF  8=CF  9=RF  10=DH  11=RP
// LF/CF/RF all map to 'OF' for fantasy purposes.
const DEFAULT_POSITION_MAP: Record<number, string> = {
  1: 'SP', 2: 'C', 3: '1B', 4: '2B', 5: '3B', 6: 'SS',
  7: 'OF', 8: 'OF', 9: 'OF',
  10: 'DH', 11: 'RP',
};

// eligibleSlots lineup slot IDs — used only for multi-position eligibility array.
// Confirmed from API: 0=C 1=1B 2=2B 3=3B 4=SS  8/9/10=OF  12=DH  13/14=SP  15=RP
// Excluded: 5(UTIL/OF-flex) 6(MI) 7(CI) 11(IL) 16(bench) 17(bench) 19(UTIL-INF)
const SLOT_POSITION_MAP: Record<number, string> = {
  0: 'C', 1: '1B', 2: '2B', 3: '3B', 4: 'SS',
  8: 'OF', 9: 'OF', 10: 'OF',
  12: 'DH', 13: 'SP', 14: 'SP', 15: 'RP',
};
const LINEUP_SLOTS = new Set(Object.keys(SLOT_POSITION_MAP).map(Number));

function extractRostersFromTeams(teams: Record<string, unknown>[]) {
  return teams.map((team) => {
    const roster = team.roster as Record<string, unknown> | undefined;
    const entries = (roster?.entries ?? []) as Record<string, unknown>[];
    const players = entries.map((entry) => {
      const playerPoolEntry = entry.playerPoolEntry as Record<string, unknown> | undefined;
      const player = playerPoolEntry?.player as Record<string, unknown> | undefined;
      const seasonStat = (player?.stats as Record<string, unknown>[] | undefined)
        ?.find(s => (s as Record<string, unknown>).statSourceId === 0
          && (s as Record<string, unknown>).statSplitTypeId === 0
          && (s as Record<string, unknown>).seasonId === season);
      const appliedStatTotal = (seasonStat?.appliedTotal as number) ?? 0;
      const eligibleSlots = (player?.eligibleSlots as number[]) ?? [];
      const defaultPositionId = player?.defaultPositionId as number | undefined;
      // Primary position from ESPN's defaultPositionId — the player's actual position.
      const position = (defaultPositionId !== undefined ? DEFAULT_POSITION_MAP[defaultPositionId] : undefined) ?? 'UTIL';
      // Multi-position eligibility from lineup slots the player has earned.
      const eligiblePositions = [...new Set(
        eligibleSlots
          .filter(s => LINEUP_SLOTS.has(s))
          .map(s => SLOT_POSITION_MAP[s])
          .filter(Boolean)
      )] as string[];
      const playerId = String(player?.id ?? entry.playerId);
      const keeperValue = (playerPoolEntry?.keeperValue as number) ?? 0;
      const acquisitionType = (entry.acquisitionType as string) ?? undefined;
      return {
        playerId,
        playerName: (player?.fullName as string) ?? 'Unknown',
        position,
        eligiblePositions: eligiblePositions.length > 0 ? eligiblePositions : undefined,
        totalPoints: appliedStatTotal,
        photoUrl: `https://a.espncdn.com/i/headshots/mlb/players/full/${playerId}.png`,
        keeperValue: keeperValue > 0 ? keeperValue : undefined,
        acquisitionType,
      };
    }).filter(p => p.totalPoints > 0 || (p.keeperValue ?? 0) > 0 || p.acquisitionType === 'DRAFT' || p.acquisitionType === 'ADD');

    const keeperCount = players.filter(p => p.acquisitionType === 'KEEPER').length;
    const draftCount = players.filter(p => p.acquisitionType === 'DRAFT').length;
    console.log(`  Team ${team.id}: ${players.length} players, ${keeperCount} keepers, ${draftCount} drafted`);
    return { teamId: team.id as number, players };
  });
}

async function main() {
  console.log(`\nFetching ${season} rosters + keepers...`);
  const client = createESPNClient(String(season));
  const data = await client.fetchLeagueData(['mTeam', 'mRoster']);
  const rosters = extractRostersFromTeams(data.teams as Record<string, unknown>[]);

  const filePath = path.join(__dirname, `../data/current/${season}.json`);
  const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  existing.rosters = rosters;
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
  console.log(`\nRosters merged into data/current/${season}.json`);
}

main().catch(console.error);
