/**
 * Fetches draft order data from ESPN for 2023-2025 and joins to historical
 * fantasy point totals. Outputs data/draft-rounds.json with per-round averages.
 *
 * "Effective round" remaps ESPN round numbers to real draft position:
 *   2023–2025: 5 keepers → ESPN Rd 6 = Effective Rd 1, Rd 7 = Rd 2, etc.
 *   2026+:     6 keepers → ESPN Rd 7 = Effective Rd 1, Rd 8 = Rd 2, etc.
 *
 * 2022 excluded — inaugural year had no keepers (true open draft, not comparable).
 *
 * Run: npx tsx scripts/fetch-draft-rounds.ts
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const LEAGUE_ID = process.env.ESPN_LEAGUE_ID!;
const SWID = process.env.ESPN_SWID!;
const S2 = process.env.ESPN_S2!;
const ESPN_BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/flb/seasons';

// Years to include. 2022 excluded (no keepers — not a keeper-league draft).
const YEARS = [2023, 2024, 2025];

// How many keeper rounds each year uses. Rounds 1..N are keeper rounds and skipped.
// ESPN Rd (N+1) = Effective Rd 1.
const KEEPER_ROUNDS: Record<number, number> = {
  2023: 5,
  2024: 5,
  2025: 5,
  2026: 6, // 6-keeper rule starts 2026
};

interface DraftPick {
  overallPickNumber: number;
  roundId: number;
  roundPickNumber: number;
  playerId: number;
  teamId: number;
  keeper: boolean;
}

interface PlayerSeason {
  playerId: string;
  playerName: string;
  totalPoints: number;
}

interface PickRecord {
  year: number;
  espnRound: number;
  effectiveRound: number;
  playerName: string;
  playerId: number;
  teamId: number;
  overallPick: number;
  totalPoints: number;
}

interface RoundBucket {
  effectiveRound: number;
  picks: PickRecord[];
}

async function fetchDraftPicks(year: number): Promise<DraftPick[]> {
  const url = `${ESPN_BASE}/${year}/segments/0/leagues/${LEAGUE_ID}?view=mDraftDetail`;
  const response = await axios.get(url, {
    headers: { Cookie: `SWID=${SWID}; espn_s2=${S2}` },
  });
  return response.data.draftDetail?.picks ?? [];
}

function loadHistoricalPoints(year: number): Map<number, { name: string; points: number }> {
  const filePath = path.join(__dirname, '..', 'data', 'historical', `${year}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const map = new Map<number, { name: string; points: number }>();
  for (const team of data.rosters as Array<{ players: PlayerSeason[] }>) {
    for (const player of team.players) {
      const id = parseInt(player.playerId);
      if (!map.has(id)) {
        map.set(id, { name: player.playerName, points: player.totalPoints });
      }
    }
  }
  return map;
}

async function main() {
  const buckets = new Map<number, RoundBucket>();

  for (const year of YEARS) {
    const keeperRounds = KEEPER_ROUNDS[year] ?? 5;
    console.log(`Fetching ${year} draft picks (${keeperRounds} keeper rounds)...`);
    const picks = await fetchDraftPicks(year);
    console.log(`  ${picks.length} total picks`);

    const pointsMap = loadHistoricalPoints(year);
    let skipped = 0;
    let added = 0;

    for (const pick of picks) {
      // Skip keeper rounds entirely
      if (pick.roundId <= keeperRounds) { skipped++; continue; }
      // Skip any stray keeper-flagged picks outside keeper rounds
      if (pick.keeper) { skipped++; continue; }

      const effectiveRound = pick.roundId - keeperRounds;
      const pointsData = pointsMap.get(pick.playerId);
      const totalPoints = pointsData?.points ?? 0;
      const playerName = pointsData?.name ?? `Player ${pick.playerId}`;

      if (!buckets.has(effectiveRound)) {
        buckets.set(effectiveRound, { effectiveRound, picks: [] });
      }
      buckets.get(effectiveRound)!.picks.push({
        year,
        espnRound: pick.roundId,
        effectiveRound,
        playerName,
        playerId: pick.playerId,
        teamId: pick.teamId,
        overallPick: pick.overallPickNumber,
        totalPoints,
      });
      added++;
    }
    console.log(`  Skipped ${skipped} keeper-round picks, kept ${added} real picks`);
  }

  // Sort buckets by effective round
  const rounds = Array.from(buckets.values()).sort((a, b) => a.effectiveRound - b.effectiveRound);

  const roundSummary = rounds.map((r) => {
    const picks = r.picks;
    const avgPoints = picks.length > 0
      ? picks.reduce((s, p) => s + p.totalPoints, 0) / picks.length
      : 0;

    const top3 = [...picks].sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 3);
    const years = [...new Set(picks.map((p) => p.year))].sort();

    return {
      effectiveRound: r.effectiveRound,
      totalPicks: picks.length,
      years,
      avgPoints: Math.round(avgPoints),
      top3: top3.map((p) => ({
        name: p.playerName,
        year: p.year,
        espnRound: p.espnRound,
        points: p.totalPoints,
      })),
    };
  });

  // Per-year breakdown
  const byYear: Record<number, Array<{ effectiveRound: number; avgPoints: number; picks: number }>> = {};
  for (const year of YEARS) {
    byYear[year] = rounds
      .map((r) => {
        const yp = r.picks.filter((p) => p.year === year);
        if (yp.length === 0) return null;
        return {
          effectiveRound: r.effectiveRound,
          avgPoints: Math.round(yp.reduce((s, p) => s + p.totalPoints, 0) / yp.length),
          picks: yp.length,
        };
      })
      .filter(Boolean) as Array<{ effectiveRound: number; avgPoints: number; picks: number }>;
  }

  const output = {
    generatedAt: new Date().toISOString(),
    years: YEARS,
    note: [
      '2022 excluded (inaugural year, no keepers — not a keeper-league draft).',
      '2023–2025: 5 keeper rounds, so ESPN Rd 6 = Effective Rd 1.',
      '2026+: 6 keeper rounds, so ESPN Rd 7 = Effective Rd 1.',
      'All keeper-flagged picks excluded. Points are full-season ESPN fantasy points.',
    ].join(' '),
    rounds: roundSummary,
    byYear,
  };

  const outPath = path.join(__dirname, '..', 'data', 'draft-rounds.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nWrote ${outPath}`);

  console.log('\n=== Draft Round Value — Effective Rounds (2023–2025) ===\n');
  console.log('Eff Rd | Picks | Avg pts | Top player');
  console.log('-------+-------+---------+-----------');
  for (const r of roundSummary) {
    const top = r.top3[0];
    const topStr = top ? `${top.name} ${top.year} (${top.points}pts, ESPN Rd${top.espnRound})` : '—';
    console.log(
      `Rd ${String(r.effectiveRound).padStart(2)}   | ${String(r.totalPicks).padStart(5)} | ${String(r.avgPoints).padStart(7)} | ${topStr}`
    );
  }
}

main().catch(console.error);
