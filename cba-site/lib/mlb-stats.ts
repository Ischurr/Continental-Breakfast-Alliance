// MLB Stats API helper — fetches current season stats for display on the stats page.
// Uses the public MLB Stats API (no auth required).
// Results are not cached server-side; Next.js fetch cache handles deduplication per build.

const BASE = 'https://statsapi.mlb.com/api/v1';

// Full team name → abbreviation lookup (all 30 MLB teams)
const TEAM_ABBREV: Record<string, string> = {
  'Arizona Diamondbacks': 'ARI',
  'Atlanta Braves': 'ATL',
  'Baltimore Orioles': 'BAL',
  'Boston Red Sox': 'BOS',
  'Chicago Cubs': 'CHC',
  'Chicago White Sox': 'CWS',
  'Cincinnati Reds': 'CIN',
  'Cleveland Guardians': 'CLE',
  'Colorado Rockies': 'COL',
  'Detroit Tigers': 'DET',
  'Houston Astros': 'HOU',
  'Kansas City Royals': 'KC',
  'Los Angeles Angels': 'LAA',
  'Los Angeles Dodgers': 'LAD',
  'Miami Marlins': 'MIA',
  'Milwaukee Brewers': 'MIL',
  'Minnesota Twins': 'MIN',
  'New York Mets': 'NYM',
  'New York Yankees': 'NYY',
  'Athletics': 'ATH',
  'Oakland Athletics': 'OAK',
  'Philadelphia Phillies': 'PHI',
  'Pittsburgh Pirates': 'PIT',
  'San Diego Padres': 'SD',
  'San Francisco Giants': 'SF',
  'Seattle Mariners': 'SEA',
  'St. Louis Cardinals': 'STL',
  'Tampa Bay Rays': 'TB',
  'Texas Rangers': 'TEX',
  'Toronto Blue Jays': 'TOR',
  'Washington Nationals': 'WSH',
};

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
  team?: { name: string; abbreviation?: string };
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
  return splits.map((s, i) => {
    const fullName = s.team?.name ?? '';
    const abbrev = s.team?.abbreviation ?? TEAM_ABBREV[fullName] ?? fullName.split(' ').pop() ?? '—';
    return {
      rank: s.rank ?? i + 1,
      playerName: s.player.fullName,
      teamName: abbrev,
      value: format(s.stat),
    };
  });
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
