import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createESPNClient } from '../lib/espn-api';
import { SeasonData } from '../lib/types';
import * as fs from 'fs';
import * as path from 'path';
import teamsJson from '../data/teams.json';

const LOGO_OVERRIDES: Record<number, string> = Object.fromEntries(
  (teamsJson as Array<{ id: number; logoUrl?: string }>)
    .filter(t => t.logoUrl)
    .map(t => [t.id, t.logoUrl!])
);

const POSITION_MAP: Record<number, string> = { 0: 'C', 1: '1B', 2: '2B', 3: '3B', 4: 'SS', 5: 'OF', 6: 'OF', 7: 'OF', 12: 'DH', 13: 'SP', 14: 'SP', 15: 'RP', 16: 'RP' };

type PlayerAccum = {
  points: number;
  playerName: string;
  position: string;
  photoUrl: string;
  keeperValue?: number;
  acquisitionType?: string;
};

async function buildAccumulatedPoints(
  client: ReturnType<typeof createESPNClient>,
  maxPeriod: number,
): Promise<Map<number, Map<string, PlayerAccum>>> {
  // teamId → (playerId → accumulated season data)
  const result = new Map<number, Map<string, PlayerAccum>>();

  for (let period = 1; period <= maxPeriod; period++) {
    process.stdout.write(`\r  Scanning scoring period ${period}/${maxPeriod}...`);
    try {
      const data = await client.fetchLeagueData(['mRoster'], period);
      for (const team of (data.teams as Record<string, unknown>[])) {
        const teamId = team.id as number;
        if (!result.has(teamId)) result.set(teamId, new Map());
        const teamMap = result.get(teamId)!;

        const entries = ((team.roster as Record<string, unknown> | undefined)?.entries ?? []) as Record<string, unknown>[];
        for (const entry of entries) {
          const ppe = entry.playerPoolEntry as Record<string, unknown> | undefined;
          const player = ppe?.player as Record<string, unknown> | undefined;
          if (!player) continue;

          const playerId = String(player.id ?? entry.playerId);
          const stats = (player.stats as Record<string, unknown>[] | undefined) ?? [];

          // Full-season actual total (statSourceId=0, statSplitTypeId=0).
          // We always overwrite with the latest value — iterating periods in order means
          // the last time we see a player on this team gives their most up-to-date season
          // total, which equals points scored while on this team.
          const seasonStat = stats.find(s =>
            (s as Record<string, unknown>).statSourceId === 0 &&
            (s as Record<string, unknown>).statSplitTypeId === 0
          );
          const seasonTotal = ((seasonStat as Record<string, unknown> | undefined)?.appliedTotal as number) ?? 0;

          const eligibleSlots = (player.eligibleSlots as number[]) ?? [];
          const position = POSITION_MAP[eligibleSlots[0]] ?? 'UTIL';
          const keeperValue = (ppe?.keeperValue as number) ?? 0;
          const acquisitionType = entry.acquisitionType as string | undefined;

          const existing = teamMap.get(playerId);
          teamMap.set(playerId, {
            points: seasonTotal, // always take latest full-season total
            playerName: (player.fullName as string) ?? existing?.playerName ?? 'Unknown',
            position: existing?.position ?? position,
            photoUrl: `https://a.espncdn.com/i/headshots/mlb/players/full/${playerId}.png`,
            keeperValue: keeperValue > 0 ? keeperValue : existing?.keeperValue,
            acquisitionType: acquisitionType || existing?.acquisitionType,
          });
        }
      }
    } catch (err) {
      console.warn(`\n  Warning: failed to fetch period ${period}:`, (err as Error).message);
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  process.stdout.write('\n');
  return result;
}

function extractRostersFromTeams(teams: Record<string, unknown>[]) {
  return teams.map((team) => {
    const roster = team.roster as Record<string, unknown> | undefined;
    const entries = (roster?.entries ?? []) as Record<string, unknown>[];
    const players = entries.map((entry) => {
      const playerPoolEntry = entry.playerPoolEntry as Record<string, unknown> | undefined;
      const player = playerPoolEntry?.player as Record<string, unknown> | undefined;
      // Full-season actual stats: statSourceId=0, statSplitTypeId=0
      const seasonStat = (player?.stats as Record<string, unknown>[] | undefined)
        ?.find(s => (s as Record<string, unknown>).statSourceId === 0 && (s as Record<string, unknown>).statSplitTypeId === 0);
      const appliedStatTotal = (seasonStat?.appliedTotal as number) ?? 0;
      const eligibleSlots = (player?.eligibleSlots as number[]) ?? [];
      const position = POSITION_MAP[eligibleSlots[0]] ?? 'UTIL';
      const playerId = String(player?.id ?? entry.playerId);
      const keeperValue = (playerPoolEntry?.keeperValue as number) ?? 0;
      const acquisitionType = entry.acquisitionType as string | undefined;
      return {
        playerId,
        playerName: (player?.fullName as string) ?? 'Unknown',
        position,
        totalPoints: appliedStatTotal,
        photoUrl: `https://a.espncdn.com/i/headshots/mlb/players/full/${playerId}.png`,
        keeperValue: keeperValue > 0 ? keeperValue : undefined,
        acquisitionType: acquisitionType || undefined,
      };
    }).filter(p => p.totalPoints > 0 || (p.keeperValue ?? 0) > 0);
    return { teamId: team.id as number, players };
  });
}

async function fetchHistoricalData(year: number) {
  console.log(`\nFetching data for ${year}...`);

  const client = createESPNClient(year.toString());
  const data = await client.fetchLeagueData(['mTeam', 'mMatchup', 'mStandings', 'mSettings', 'mRoster']);

  // Build SWID → "First Last" map from the members array included in the response
  const members = (data.members ?? []) as Record<string, unknown>[];
  const memberMap = new Map(members.map(m => [m.id as string, `${m.firstName} ${m.lastName}`]));

  // Determine the last scoring period from the schedule
  const maxPeriod: number = data.schedule && (data.schedule as Record<string, unknown>[]).length > 0
    ? Math.max(...(data.schedule as Record<string, unknown>[]).map(m => (m.matchupPeriodId as number) ?? 0))
    : 26;

  console.log(`  Scanning ${maxPeriod} scoring periods for all rostered players...`);
  const accumulated = await buildAccumulatedPoints(client, maxPeriod);

  const endOfSeasonRosters = extractRostersFromTeams(data.teams as Record<string, unknown>[]);

  // Merge: add any player that appeared mid-season but is absent from the end-of-season snapshot
  const mergedRosters = endOfSeasonRosters.map(teamRoster => {
    const { teamId, players } = teamRoster;
    const accumMap = accumulated.get(teamId);
    if (!accumMap) return teamRoster;

    const existingIds = new Set(players.map(p => p.playerId));
    const extraPlayers = [];
    for (const [playerId, accum] of accumMap) {
      if (existingIds.has(playerId)) continue; // already captured in end-of-season snapshot
      if (accum.points <= 0) continue;          // never scored, skip
      extraPlayers.push({
        playerId,
        playerName: accum.playerName,
        position: accum.position,
        totalPoints: accum.points,
        photoUrl: accum.photoUrl,
        keeperValue: accum.keeperValue,
        acquisitionType: accum.acquisitionType,
      });
    }
    if (extraPlayers.length > 0) {
      console.log(`  Team ${teamId}: added ${extraPlayers.length} mid-season player(s): ${extraPlayers.map(p => p.playerName).join(', ')}`);
    }
    return { teamId, players: [...players, ...extraPlayers] };
  });

  const seasonData: SeasonData = {
    year,
    teams: data.teams.map((team: Record<string, unknown>) => ({
      id: team.id,
      name:
        team.name ||
        (team.location ? `${team.location} ${team.nickname}` : `Team ${team.id}`),
      owner: Array.isArray(team.owners) && team.owners.length > 0
        ? (memberMap.get(team.owners[0] as string) ?? team.owners[0])
        : 'Unknown',
      abbrev: team.abbrev,
      logoUrl: LOGO_OVERRIDES[team.id as number] ?? team.logo,
      divisionId: team.divisionId,
    })),
    standings: data.teams.map((team: Record<string, unknown>) => {
      const record = team.record as Record<string, Record<string, number>> | undefined;
      const overall = record?.overall;
      return {
        teamId: team.id,
        wins: overall?.wins ?? 0,
        losses: overall?.losses ?? 0,
        ties: overall?.ties ?? 0,
        pointsFor: overall?.pointsFor ?? 0,
        pointsAgainst: overall?.pointsAgainst ?? 0,
        streak: overall?.streak as string | undefined,
      };
    }),
    matchups: (data.schedule ?? []).map((matchup: Record<string, unknown>, index: number) => {
      const home = matchup.home as Record<string, unknown> | undefined;
      const away = matchup.away as Record<string, unknown> | undefined;
      return {
        id: `${year}-${index}`,
        week: matchup.matchupPeriodId as number,
        home: {
          teamId: home?.teamId as number,
          totalPoints: (home?.totalPoints as number) ?? 0,
        },
        away: {
          teamId: away?.teamId as number,
          totalPoints: (away?.totalPoints as number) ?? 0,
        },
        winner:
          matchup.winner === 'HOME'
            ? (home?.teamId as number)
            : matchup.winner === 'AWAY'
              ? (away?.teamId as number)
              : undefined,
      };
    }),
    weeklyStats: [],
    rosters: mergedRosters,
    playoffTeams: data.teams
      .filter((team: Record<string, unknown>) => {
        const ps = team.playoffSeed as number | undefined;
        return ps !== undefined && ps <= 4;
      })
      .map((team: Record<string, unknown>) => team.id as number),
    loserBracket: [...data.teams]
      .sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const aRecord = (a.record as Record<string, Record<string, number>> | undefined)?.overall;
        const bRecord = (b.record as Record<string, Record<string, number>> | undefined)?.overall;
        return (aRecord?.wins ?? 0) - (bRecord?.wins ?? 0) || (aRecord?.pointsFor ?? 0) - (bRecord?.pointsFor ?? 0);
      })
      .slice(0, 2)
      .map((team: Record<string, unknown>) => team.id as number),
    champion: data.teams.find(
      (team: Record<string, unknown>) => (team.rankCalculatedFinal as number | undefined) === 1
    )?.id as number | undefined,
  };

  const dataDir = path.join(__dirname, '../data/historical');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const filePath = path.join(dataDir, `${year}.json`);
  fs.writeFileSync(filePath, JSON.stringify(seasonData, null, 2));

  console.log(`Saved ${year} data to ${filePath}`);
  console.log(
    `  Teams: ${seasonData.teams.length} | Matchups: ${seasonData.matchups.length} | Champion: ${seasonData.champion ?? 'TBD'}`
  );
}

async function main() {
  const years = [2022, 2023, 2024, 2025];

  if (!process.env.ESPN_SWID || process.env.ESPN_SWID === 'your_swid_here') {
    console.error(
      '\nError: ESPN credentials not configured.\nPlease set ESPN_SWID and ESPN_S2 in .env.local before running this script.\n'
    );
    process.exit(1);
  }

  for (const year of years) {
    try {
      await fetchHistoricalData(year);
      // Brief pause between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error fetching ${year}:`, error);
    }
  }

  console.log('\nHistorical data fetch complete!');
}

main();
