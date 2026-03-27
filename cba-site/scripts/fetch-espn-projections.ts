import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createESPNClient } from '../lib/espn-api';
import * as fs from 'fs';
import * as path from 'path';

// Position map from ESPN eligible slot IDs
// ESPN fantasy lineup slot IDs (empirically verified):
// 0=C, 1=1B, 2=2B, 3=3B, 4=SS, 5=OF(generic), 6=MI(2B/SS), 7=CI(1B/3B)
// 8=LF, 9=CF, 10=RF, 11=UTIL, 12=DH, 13=SP, 14=SP, 15=RP, 16=UTIL/bench, 17=bench
const POSITION_MAP: Record<number, string> = {
  0: 'C', 1: '1B', 2: '2B', 3: '3B', 4: 'SS',
  5: 'OF', 6: 'MI', 7: 'CI',
  8: 'OF', 9: 'OF', 10: 'OF',
  11: 'UTIL', 12: 'DH', 13: 'SP', 14: 'SP', 15: 'RP', 16: 'UTIL',
};

interface ProjectedPlayer {
  playerName: string;
  playerId: string;
  position: string;
  eligiblePositions: string[];  // all ESPN-eligible positions
  projectedFP: number;
  teamId: number;        // fantasy team (0 = free agent)
  fantasyTeamName: string;
}

function extractProjectedStats(
  teams: Record<string, unknown>[],
  teamNames: Record<number, string>
): ProjectedPlayer[] {
  const results: ProjectedPlayer[] = [];

  for (const team of teams) {
    const fantasyTeamId = team.id as number;
    const fantasyTeamName = teamNames[fantasyTeamId] ?? `Team ${fantasyTeamId}`;
    const roster = team.roster as Record<string, unknown> | undefined;
    const entries = (roster?.entries ?? []) as Record<string, unknown>[];

    for (const entry of entries) {
      const playerPoolEntry = entry.playerPoolEntry as Record<string, unknown> | undefined;
      const player = playerPoolEntry?.player as Record<string, unknown> | undefined;
      if (!player) continue;

      const stats = (player.stats as Record<string, unknown>[] | undefined) ?? [];

      // statSourceId=1 is ESPN projected stats; statSplitTypeId=0 is full-season.
      // ESPN returns two entries matching this filter: the first is the rolling
      // rest-of-season projection (0 for IL players), the second is the baseline
      // full-season projection. We want the last (highest-value) entry.
      const projStats = stats.filter(
        s => (s as Record<string, unknown>).statSourceId === 1 &&
             (s as Record<string, unknown>).statSplitTypeId === 0
      );
      const projStat = projStats.length > 1
        ? projStats.reduce((best, s) =>
            ((s as Record<string, unknown>).appliedTotal as number) >
            ((best as Record<string, unknown>).appliedTotal as number) ? s : best
          )
        : projStats[0];

      const projectedFP = (projStat?.appliedTotal as number) ?? 0;
      if (projectedFP <= 0) continue;

      const eligibleSlots = (player.eligibleSlots as number[]) ?? [];
      const position = POSITION_MAP[eligibleSlots[0]] ?? 'UTIL';
      const eligiblePositions = [...new Set(eligibleSlots.map(s => POSITION_MAP[s]).filter(Boolean))];
      const playerId = String(player.id ?? entry.playerId);

      results.push({
        playerName: (player.fullName as string) ?? 'Unknown',
        playerId,
        position,
        eligiblePositions,
        projectedFP: Math.round(projectedFP * 10) / 10,
        teamId: fantasyTeamId,
        fantasyTeamName,
      });
    }
  }

  return results;
}

async function fetchFreeAgentProjections(
  client: ReturnType<typeof createESPNClient>
): Promise<ProjectedPlayer[]> {
  // Fetch top 300 free agents with projected stats
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/seasons/2026/segments/0/leagues/${process.env.ESPN_LEAGUE_ID}`;

  const filter = JSON.stringify({
    players: {
      filterStatus: { value: ['FREEAGENT', 'WAIVERS'] },
      limit: 300,
      sortDraftRanks: {
        sortPriority: 100,
        sortAsc: true,
        value: 'PPR',
      },
    },
  });

  const axios = (await import('axios')).default;
  const swid = process.env.ESPN_SWID ?? '';
  const s2 = process.env.ESPN_S2 ?? '';

  try {
    const resp = await axios.get(url, {
      headers: {
        Cookie: `SWID=${swid}; espn_s2=${s2}`,
        'X-Fantasy-Filter': filter,
      },
      params: new URLSearchParams([
        ['view', 'kona_player_info'],
        ['scoringPeriodId', '1'],
      ]),
    });

    const players = (resp.data?.players ?? []) as Record<string, unknown>[];
    const results: ProjectedPlayer[] = [];

    for (const entry of players) {
      const playerPoolEntry = entry.playerPoolEntry as Record<string, unknown> | undefined;
      const player = playerPoolEntry?.player as Record<string, unknown> | undefined;
      if (!player) continue;

      const stats = (player.stats as Record<string, unknown>[] | undefined) ?? [];
      const projStats = stats.filter(
        s => (s as Record<string, unknown>).statSourceId === 1 &&
             (s as Record<string, unknown>).statSplitTypeId === 0
      );
      const projStat = projStats.length > 1
        ? projStats.reduce((best, s) =>
            ((s as Record<string, unknown>).appliedTotal as number) >
            ((best as Record<string, unknown>).appliedTotal as number) ? s : best
          )
        : projStats[0];

      const projectedFP = (projStat?.appliedTotal as number) ?? 0;
      if (projectedFP <= 0) continue;

      const eligibleSlots = (player.eligibleSlots as number[]) ?? [];
      const position = POSITION_MAP[eligibleSlots[0]] ?? 'UTIL';
      const eligiblePositions = [...new Set(eligibleSlots.map(s => POSITION_MAP[s]).filter(Boolean))];
      const playerId = String(player.id ?? '');

      results.push({
        playerName: (player.fullName as string) ?? 'Unknown',
        playerId,
        position,
        eligiblePositions,
        projectedFP: Math.round(projectedFP * 10) / 10,
        teamId: 0,
        fantasyTeamName: 'Free Agent',
        eligiblePositions,
      });
    }

    return results;
  } catch (err) {
    console.warn('  Could not fetch free agent projections:', (err as Error).message);
    return [];
  }
}

async function main() {
  console.log('\nFetching ESPN 2026 projected fantasy points...');
  const client = createESPNClient('2026');

  // Fetch all rosters with projected stats (statSourceId=1 is returned automatically)
  const data = await client.fetchLeagueData(['mTeam', 'mRoster']);
  const teams = data.teams as Record<string, unknown>[];
  const teamNames: Record<number, string> = {};
  for (const t of teams) {
    teamNames[t.id as number] = (t.name as string) ?? `Team ${t.id}`;
  }

  const rostered = extractProjectedStats(teams, teamNames);
  console.log(`  Found projected stats for ${rostered.length} rostered players`);

  // Also fetch top free agents
  console.log('  Fetching free agent projections...');
  const fas = await fetchFreeAgentProjections(client);
  console.log(`  Found projected stats for ${fas.length} free agents`);

  const allPlayers = [...rostered, ...fas];

  // Sort by projectedFP desc
  allPlayers.sort((a, b) => b.projectedFP - a.projectedFP);

  const output = {
    generatedAt: new Date().toISOString(),
    source: 'ESPN Fantasy API (statSourceId=1, statSplitTypeId=0)',
    totalPlayers: allPlayers.length,
    players: allPlayers,
  };

  const outPath = path.join(__dirname, '../data/espn-projections/2026.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log(`\nSaved ${allPlayers.length} players to data/espn-projections/2026.json`);

  // Print top 20 + per-team summary
  console.log('\nTop 20 by ESPN projected FP:');
  allPlayers.slice(0, 20).forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.playerName} (${p.position}, ${p.fantasyTeamName}): ${p.projectedFP}`);
  });

  console.log('\nPer-team projected starter totals (top 21 by position-optimized):');
  const byTeam: Record<number, ProjectedPlayer[]> = {};
  for (const p of rostered) {
    (byTeam[p.teamId] ??= []).push(p);
  }
  const teamTotals: { name: string; total: number }[] = [];
  for (const [tid, players] of Object.entries(byTeam)) {
    const sorted = [...players].sort((a, b) => b.projectedFP - a.projectedFP);
    const total = sorted.slice(0, 21).reduce((s, p) => s + p.projectedFP, 0);
    teamTotals.push({ name: teamNames[Number(tid)], total: Math.round(total) });
  }
  teamTotals.sort((a, b) => b.total - a.total);
  teamTotals.forEach((t, i) => console.log(`  ${i + 1}. ${t.name}: ${t.total}`));
}

main().catch(console.error);
