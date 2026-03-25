import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createESPNClient } from '../lib/espn-api';
import * as fs from 'fs';
import * as path from 'path';

const POSITION_MAP: Record<number, string> = {
  0: 'C', 1: '1B', 2: '2B', 3: '3B', 4: 'SS',
  5: 'OF', 6: 'OF', 7: 'OF', 12: 'DH', 13: 'SP', 14: 'SP', 15: 'RP', 16: 'RP',
};

// Slot IDs that correspond to real lineup positions (excludes bench/IL/UTIL generic slots)
const LINEUP_SLOTS = new Set([0, 1, 2, 3, 4, 5, 6, 7, 12, 13, 14, 15, 16]);

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
