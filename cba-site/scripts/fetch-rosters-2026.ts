import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createESPNClient } from '../lib/espn-api';
import * as fs from 'fs';
import * as path from 'path';

// Confirmed slot IDs from ESPN API inspection:
//   0=C  1=1B  2=2B  3=3B  4=SS
//   5=flex/UTIL(OF-eligible)  6=MI(middle infield)  7=CI(corner infield)
//   8=OF  9=OF  10=OF   ← the 3 actual OF lineup slots
//   11=IL  12=DH  13=SP  14=SP  15=RP  16=bench  17=bench  19=UTIL(INF)
// Slots 5/6/7/19 are flex slots — excluded to avoid false eligibility tags.
// (MI/CI players already have their primary slot 1-4; OF players have 8/9/10.)
const POSITION_MAP: Record<number, string> = {
  0: 'C', 1: '1B', 2: '2B', 3: '3B', 4: 'SS',
  8: 'OF', 9: 'OF', 10: 'OF',
  12: 'DH', 13: 'SP', 14: 'SP', 15: 'RP',
};

// Only include real lineup position slots — excludes bench(16,17), IL(11), UTIL flex(5,6,7,19).
const LINEUP_SLOTS = new Set([0, 1, 2, 3, 4, 8, 9, 10, 12, 13, 14, 15]);

function extractRostersFromTeams(teams: Record<string, unknown>[]) {
  return teams.map((team) => {
    const roster = team.roster as Record<string, unknown> | undefined;
    const entries = (roster?.entries ?? []) as Record<string, unknown>[];
    const players = entries.map((entry) => {
      const playerPoolEntry = entry.playerPoolEntry as Record<string, unknown> | undefined;
      const player = playerPoolEntry?.player as Record<string, unknown> | undefined;
      const seasonStat = (player?.stats as Record<string, unknown>[] | undefined)
        ?.find(s => (s as Record<string, unknown>).statSourceId === 0 && (s as Record<string, unknown>).statSplitTypeId === 0);
      const appliedStatTotal = (seasonStat?.appliedTotal as number) ?? 0;
      const eligibleSlots = (player?.eligibleSlots as number[]) ?? [];
      // Use eligibleSlots[0] (player's primary eligible position) not lineupSlotId
      // (which is where the manager placed them — can be wrong, e.g. a 3B slotted into an SP slot).
      const position = POSITION_MAP[eligibleSlots[0]] ?? 'UTIL';
      const eligiblePositions = [...new Set(
        eligibleSlots
          .filter(s => LINEUP_SLOTS.has(s))
          .map(s => POSITION_MAP[s])
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
  console.log('\nFetching 2026 rosters + keepers...');
  const client = createESPNClient('2026');
  const data = await client.fetchLeagueData(['mTeam', 'mRoster']);
  const rosters = extractRostersFromTeams(data.teams as Record<string, unknown>[]);

  const filePath = path.join(__dirname, '../data/current/2026.json');
  const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  existing.rosters = rosters;
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
  console.log('\nRosters merged into data/current/2026.json');
}

main().catch(console.error);
