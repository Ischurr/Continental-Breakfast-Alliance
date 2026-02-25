import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createESPNClient } from '../lib/espn-api';
import { SeasonData } from '../lib/types';
import * as fs from 'fs';
import * as path from 'path';

const POSITION_MAP: Record<number, string> = { 0: 'C', 1: '1B', 2: '2B', 3: '3B', 4: 'SS', 5: 'OF', 6: 'OF', 7: 'OF', 12: 'DH', 13: 'SP', 14: 'SP', 15: 'RP', 16: 'RP' };

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
      return {
        playerId,
        playerName: (player?.fullName as string) ?? 'Unknown',
        position,
        totalPoints: appliedStatTotal,
        photoUrl: `https://a.espncdn.com/i/headshots/mlb/players/full/${playerId}.png`,
        keeperValue: keeperValue > 0 ? keeperValue : undefined,
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
      logoUrl: team.logo,
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
    rosters: extractRostersFromTeams(data.teams as Record<string, unknown>[]),
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
