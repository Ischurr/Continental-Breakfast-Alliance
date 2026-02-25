import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createESPNClient } from '../lib/espn-api';
import * as fs from 'fs';
import * as path from 'path';

// Maps defaultPositionId (the player's actual MLB position) from kona_player_info
const POSITION_MAP: Record<number, string> = {
  1: 'SP',  // Starting Pitcher
  2: 'C',
  3: '1B',
  4: '2B',
  5: '3B',
  6: 'SS',
  7: 'OF',  // LF
  8: 'OF',  // CF
  9: 'OF',  // RF
  10: 'DH',
  11: 'RP', // Relief Pitcher
};

async function fetchFreeAgents() {
  if (!process.env.ESPN_SWID || process.env.ESPN_SWID === 'your_swid_here') {
    console.error('\nError: ESPN credentials not configured.\n');
    process.exit(1);
  }

  const seasonId = process.env.ESPN_SEASON_ID ?? '2026';
  console.log(`\nFetching free agents for ${seasonId}...`);

  const client = createESPNClient(seasonId);

  // Use current scoring period; default to 1 in preseason
  const now = new Date();
  const startOfSeason = new Date(now.getFullYear(), 2, 20); // ~March 20
  const weeksSinceStart = Math.ceil((now.getTime() - startOfSeason.getTime()) / (7 * 24 * 60 * 60 * 1000));
  const scoringPeriodId = Math.max(1, Math.min(weeksSinceStart, 26));

  const data = await client.fetchFreeAgents(scoringPeriodId, 100);
  const rawPlayers = (data.players ?? []) as Record<string, unknown>[];

  const players = rawPlayers.map((entry) => {
    // Player data is directly at entry.player (not nested under playerPoolEntry)
    const player = entry.player as Record<string, unknown> | undefined;
    const defaultPositionId = (player?.defaultPositionId as number) ?? -1;
    const position = POSITION_MAP[defaultPositionId] ?? 'UTIL';
    const playerId = String(player?.id ?? entry.id);
    const ownership = player?.ownership as Record<string, unknown> | undefined;
    const percentOwned = (ownership?.percentOwned as number) ?? 0;

    // Get the most recent full-season actual stats (statSourceId=0, statSplitTypeId=0)
    const stats = (player?.stats as Record<string, unknown>[]) ?? [];
    const seasonStat = stats.find(s => s.statSourceId === 0 && s.statSplitTypeId === 0);
    const totalPoints = (seasonStat?.appliedTotal as number) ?? 0;
    const statSeasonId = (seasonStat?.seasonId as number) ?? null;

    return {
      playerId,
      playerName: (player?.fullName as string) ?? 'Unknown',
      position,
      totalPoints,
      statSeasonId,
      photoUrl: `https://a.espncdn.com/i/headshots/mlb/players/full/${playerId}.png`,
      percentOwned,
    };
  }).filter(p => p.playerName !== 'Unknown' && p.playerName !== '');

  // Sort by totalPoints desc; fall back to percentOwned if all pts are 0 (preseason)
  const allZero = players.every(p => p.totalPoints === 0);
  players.sort((a, b) => allZero
    ? b.percentOwned - a.percentOwned
    : b.totalPoints - a.totalPoints
  );

  // Figure out what season the stats represent (for UI labeling)
  const statSeason = players[0]?.statSeasonId ?? null;

  const output = {
    fetchedAt: new Date().toISOString(),
    scoringPeriodId,
    statSeason,
    players,
  };

  const dir = path.join(__dirname, '../data/current');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, 'free-agents.json');
  fs.writeFileSync(filePath, JSON.stringify(output, null, 2));

  const pitchers = players.filter(p => p.position === 'SP' || p.position === 'RP').length;
  const batters = players.length - pitchers;
  console.log(`Saved ${players.length} free agents (${pitchers} pitchers, ${batters} hitters) to ${filePath}`);
  console.log(`Stats season: ${statSeason ?? 'none'} | Fetched at: ${output.fetchedAt}`);
}

fetchFreeAgents();
