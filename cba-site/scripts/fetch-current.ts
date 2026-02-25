import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createESPNClient } from '../lib/espn-api';
import { SeasonData } from '../lib/types';
import * as fs from 'fs';
import * as path from 'path';

async function fetchCurrentSeason() {
  const seasonId = process.env.ESPN_SEASON_ID ?? '2025';
  console.log(`\nFetching current season data (${seasonId})...`);

  if (!process.env.ESPN_SWID || process.env.ESPN_SWID === 'your_swid_here') {
    console.error(
      '\nError: ESPN credentials not configured.\nPlease set ESPN_SWID and ESPN_S2 in .env.local before running this script.\n'
    );
    process.exit(1);
  }

  const client = createESPNClient(seasonId);

  // Fetch main league data
  const data = await client.fetchLeagueData(['mTeam', 'mMatchup', 'mStandings', 'mSettings']);

  const seasonData: SeasonData = {
    year: parseInt(seasonId, 10),
    teams: data.teams.map((team: Record<string, unknown>) => ({
      id: team.id,
      name:
        team.name ||
        (team.location ? `${team.location} ${team.nickname}` : `Team ${team.id}`),
      owner:
        Array.isArray(team.owners) && team.owners.length > 0 ? team.owners[0] : 'Unknown',
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
        id: `${seasonId}-${index}`,
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
    playoffTeams: data.teams
      .filter((team: Record<string, unknown>) => {
        const ps = team.playoffSeed as number | undefined;
        return ps !== undefined && ps <= 4;
      })
      .map((team: Record<string, unknown>) => team.id as number),
    loserBracket: [],
    champion: data.teams.find(
      (team: Record<string, unknown>) => (team.rankCalculatedFinal as number | undefined) === 1
    )?.id as number | undefined,
  };

  // Save to data/current/
  const dataDir = path.join(__dirname, '../data/current');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const filePath = path.join(dataDir, `${seasonId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(seasonData, null, 2));

  console.log(`Saved ${seasonId} data to ${filePath}`);
  console.log(
    `  Teams: ${seasonData.teams.length} | Matchups: ${seasonData.matchups.length} | Playoff teams: ${seasonData.playoffTeams.length}`
  );
  console.log('\nCurrent season data fetch complete!');
  console.log(
    `\nNote: To use this live data in the site, update lib/data-processor.ts to also import data/current/${seasonId}.json`
  );
}

fetchCurrentSeason();
