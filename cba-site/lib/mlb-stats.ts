// MLB Stats API helper — fetches 2025 season stats for display on the stats page.
// Uses the public MLB Stats API (no auth required).
// Results are not cached server-side; Next.js fetch cache handles deduplication per build.

const BASE = 'https://statsapi.mlb.com/api/v1';

export interface MlbStatRow {
  rank: number;
  playerName: string;
  teamName: string;
  value: string; // pre-formatted for display
}

interface Split {
  season?: string;
  rank?: number;
  player: { fullName: string };
  team?: { name: string };
  stat: Record<string, number | string>;
}

async function fetchStats(
  group: 'hitting' | 'pitching',
  sortStat: string,
  season = 2025,
  limit = 10,
): Promise<Split[]> {
  const url =
    `${BASE}/stats?stats=season&group=${group}&season=${season}` +
    `&sortStat=${sortStat}&limit=${limit}&sportId=1`;
  try {
    const res = await fetch(url, { next: { revalidate: 7200 } }); // 2-hour cache
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.stats?.[0]?.splits ?? []) as Split[];
  } catch {
    return [];
  }
}

function toRows(splits: Split[], format: (stat: Record<string, number | string>) => string): MlbStatRow[] {
  return splits.map((s, i) => ({
    rank: s.rank ?? i + 1,
    playerName: s.player.fullName,
    teamName: s.team?.name ?? '—',
    value: format(s.stat),
  }));
}

export async function getBattingAvgLeaders(season = 2025, limit = 10): Promise<MlbStatRow[]> {
  const splits = await fetchStats('hitting', 'avg', season, limit);
  return toRows(splits, s => Number(s.avg).toFixed(3));
}

export async function getHitsLeaders(season = 2025, limit = 10): Promise<MlbStatRow[]> {
  const splits = await fetchStats('hitting', 'hits', season, limit);
  return toRows(splits, s => String(s.hits));
}

export async function getHomeRunLeaders(season = 2025, limit = 10): Promise<MlbStatRow[]> {
  const splits = await fetchStats('hitting', 'homeRuns', season, limit);
  return toRows(splits, s => String(s.homeRuns));
}

export async function getStolenBaseLeaders(season = 2025, limit = 10): Promise<MlbStatRow[]> {
  const splits = await fetchStats('hitting', 'stolenBases', season, limit);
  return toRows(splits, s => String(s.stolenBases));
}

export async function getEraLeaders(season = 2025, limit = 10): Promise<MlbStatRow[]> {
  // Lower ERA = better; MLB API returns ascending for ERA when sortStat=era
  const splits = await fetchStats('pitching', 'era', season, limit);
  return toRows(splits, s => Number(s.era).toFixed(2));
}

export async function getSavesLeaders(season = 2025, limit = 10): Promise<MlbStatRow[]> {
  const splits = await fetchStats('pitching', 'saves', season, limit);
  return toRows(splits, s => String(s.saves));
}

export async function getStrikeoutLeaders(season = 2025, limit = 10): Promise<MlbStatRow[]> {
  const splits = await fetchStats('pitching', 'strikeOuts', season, limit);
  return toRows(splits, s => String(s.strikeOuts));
}

export async function getWhipLeaders(season = 2025, limit = 10): Promise<MlbStatRow[]> {
  const splits = await fetchStats('pitching', 'whip', season, limit);
  return toRows(splits, s => Number(s.whip).toFixed(2));
}
