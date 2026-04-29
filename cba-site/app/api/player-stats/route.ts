import fs from 'fs';
import path from 'path';
import type { EROSPPlayer } from '@/components/EROSPTable';
import type { PlayerCardData, PlayerCardStats, RecentGame } from '@/lib/player-card-types';
import { fetchBaseballNews } from '@/lib/news-fetcher';

export const dynamic = 'force-dynamic';

const MLB_BASE = 'https://statsapi.mlb.com/api/v1';

interface PlayerDescription {
  background?: string;
  recentAnalysis?: string;
}

function loadPlayerDescription(mlbamId: number | null): PlayerDescription {
  try {
    const descPath = path.join(process.cwd(), 'data', 'player-descriptions.json');
    if (!mlbamId || !fs.existsSync(descPath)) return {};
    const cache = JSON.parse(fs.readFileSync(descPath, 'utf-8')) as Record<string, PlayerDescription>;
    return cache[String(mlbamId)] ?? {};
  } catch {
    return {};
  }
}

function norm(name: string): string {
  return name.toLowerCase().replace(/[^a-z ]/g, '').trim();
}

function parseIP(ip: string | number): number {
  const s = String(ip ?? '0');
  const [whole, frac] = s.split('.');
  return parseInt(whole || '0') + (frac ? parseInt(frac) / 3 : 0);
}

function calcHitterFP(stat: Record<string, number | string>): number {
  const h = Number(stat.hits ?? 0);
  const d2 = Number(stat.doubles ?? 0);
  const d3 = Number(stat.triples ?? 0);
  const hr = Number(stat.homeRuns ?? 0);
  const tb = h + d2 + 2 * d3 + 3 * hr; // singles*1 + doubles*2 + triples*3 + hr*4, then +h for H scoring
  return (h + tb)
    + Number(stat.runs ?? 0)
    + Number(stat.rbi ?? 0)
    + Number(stat.baseOnBalls ?? 0)
    - Number(stat.strikeOuts ?? 0)
    + 2 * Number(stat.stolenBases ?? 0)
    - Number(stat.caughtStealing ?? 0)
    - 0.25 * Number(stat.groundIntoDoublePlay ?? 0);
}

function calcPitcherFP(stat: Record<string, number | string>): number {
  const ip = parseIP(stat.inningsPitched ?? 0);
  const er = Number(stat.earnedRuns ?? 0);
  const isQS = ip >= 6 && er <= 3;
  return ip * 3
    - Number(stat.hits ?? 0)
    - 2 * er
    - Number(stat.baseOnBalls ?? 0)
    + Number(stat.strikeOuts ?? 0)
    + 3 * Number(stat.wins ?? 0)
    - 3 * Number(stat.losses ?? 0)
    + 5 * Number(stat.saves ?? 0)
    - 2 * Number(stat.blownSaves ?? 0)
    + 3 * Number(stat.holds ?? 0)
    + (isQS ? 3 : 0);
}

function formatStatLine(stat: Record<string, number | string>, isPitcher: boolean): string {
  if (isPitcher) {
    const ip = parseIP(stat.inningsPitched ?? 0);
    const er = Number(stat.earnedRuns ?? 0);
    const k = Number(stat.strikeOuts ?? 0);
    const parts = [`${ip % 1 === 0 ? ip.toFixed(0) : ip.toFixed(1)} IP`];
    if (k) parts.push(`${k}K`);
    parts.push(`${er} ER`);
    if (Number(stat.saves ?? 0)) parts.push('SV');
    if (Number(stat.holds ?? 0)) parts.push('HD');
    const isQS = ip >= 6 && er <= 3;
    if (isQS) parts.push('QS');
    return parts.join(', ');
  } else {
    const ab = Number(stat.atBats ?? 0);
    const h = Number(stat.hits ?? 0);
    const hr = Number(stat.homeRuns ?? 0);
    const rbi = Number(stat.rbi ?? 0);
    const sb = Number(stat.stolenBases ?? 0);
    const bb = Number(stat.baseOnBalls ?? 0);
    const parts = [`${h}-${ab}`];
    if (hr) parts.push(`${hr} HR`);
    if (rbi) parts.push(`${rbi} RBI`);
    if (sb) parts.push(`${sb} SB`);
    if (bb) parts.push(`BB`);
    return parts.join(', ');
  }
}

// MLB team ID → abbreviation (30 teams)
const MLB_TEAM_ABBREV: Record<number, string> = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC',
  113: 'CIN', 114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU',
  118: 'KC',  119: 'LAD', 120: 'WSH', 121: 'NYM', 133: 'OAK',
  134: 'PIT', 135: 'SD',  136: 'SEA', 137: 'SF',  138: 'STL',
  139: 'TB',  140: 'TEX', 141: 'TOR', 142: 'MIN', 143: 'PHI',
  144: 'ATL', 145: 'CWS', 146: 'MIA', 147: 'NYY', 158: 'MIL',
  159: 'ATH',
};

type RawSplit = { stat: Record<string, number | string>; gamesPlayed?: number; date?: string; game?: { officialDate?: string }; opponent?: { id?: number; abbreviation?: string } };

async function fetchMlbSplits(mlbamId: number, group: string, statsType: string, extra = ''): Promise<RawSplit[] | null> {
  try {
    const url = `${MLB_BASE}/people/${mlbamId}/stats?stats=${statsType}&season=2026&group=${group}&sportId=1${extra}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const json = await res.json() as { stats?: Array<{ splits?: RawSplit[] }> };
    return (json?.stats?.[0]?.splits ?? null) as RawSplit[] | null;
  } catch {
    return null;
  }
}

function buildStats(split: RawSplit | null, isPitcher: boolean): PlayerCardStats | null {
  if (!split) return null;
  const stat = split.stat;
  const gp = Number(stat.gamesPlayed ?? 0);

  if (!isPitcher) {
    const pa = Number(stat.plateAppearances ?? 0);
    const k = Number(stat.strikeOuts ?? 0);
    const bb = Number(stat.baseOnBalls ?? 0);
    const avg = parseFloat(String(stat.avg ?? '0')) || 0;
    const slg = parseFloat(String(stat.slg ?? '0')) || 0;
    return {
      gamesPlayed: gp,
      avg: stat.avg != null ? String(stat.avg) : undefined,
      obp: stat.obp != null ? String(stat.obp) : undefined,
      slg: stat.slg != null ? String(stat.slg) : undefined,
      ops: stat.ops != null ? String(stat.ops) : undefined,
      hr: Number(stat.homeRuns ?? 0),
      rbi: Number(stat.rbi ?? 0),
      sb: Number(stat.stolenBases ?? 0),
      strikeOuts: k,
      baseOnBalls: bb,
      plateAppearances: pa,
      kPct: pa > 0 ? (k / pa * 100).toFixed(1) + '%' : undefined,
      bbPct: pa > 0 ? (bb / pa * 100).toFixed(1) + '%' : undefined,
      iso: (slg > 0 && avg > 0) ? (slg - avg).toFixed(3) : undefined,
    };
  } else {
    const ip = parseIP(stat.inningsPitched ?? 0);
    const k = Number(stat.strikeOuts ?? 0);
    const bb = Number(stat.baseOnBalls ?? 0);
    const hr = Number(stat.homeRuns ?? 0);
    const er = Number(stat.earnedRuns ?? 0);
    const tbf = Number(stat.battersFaced ?? 0);
    const fipVal = ip > 0 ? ((13 * hr + 3 * bb - 2 * k) / ip + 3.2) : null;
    return {
      gamesPlayed: gp,
      era: stat.era != null ? String(stat.era) : undefined,
      whip: stat.whip != null ? String(stat.whip) : undefined,
      k9: ip > 0 ? (k / ip * 9).toFixed(2) : undefined,
      bb9: ip > 0 ? (bb / ip * 9).toFixed(2) : undefined,
      ip: ip > 0 ? (ip % 1 === 0 ? ip.toFixed(0) + '.0' : ip.toFixed(1)) : '0.0',
      wins: Number(stat.wins ?? 0),
      losses: Number(stat.losses ?? 0),
      saves: Number(stat.saves ?? 0),
      holds: Number(stat.holds ?? 0),
      qualityStarts: Number(stat.qualityStarts ?? 0),
      gamesStarted: Number(stat.gamesStarted ?? 0),
      strikeOuts: k,
      baseOnBalls: bb,
      kPct: tbf > 0 ? (k / tbf * 100).toFixed(1) + '%' : undefined,
      bbPct: tbf > 0 ? (bb / tbf * 100).toFixed(1) + '%' : undefined,
      fip: fipVal != null ? fipVal.toFixed(2) : undefined,
    };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mlbamIdStr = searchParams.get('mlbamId');
  const espnIdStr = searchParams.get('espnId');
  const playerNameParam = searchParams.get('name');

  let mlbamId: number | null = mlbamIdStr ? parseInt(mlbamIdStr) : null;
  let erospPlayer: EROSPPlayer | null = null;

  // Load EROSP data for injury + projection info
  try {
    const erospPath = path.join(process.cwd(), 'data', 'erosp', 'latest.json');
    if (fs.existsSync(erospPath)) {
      const raw = JSON.parse(fs.readFileSync(erospPath, 'utf-8')) as { players?: EROSPPlayer[] };
      const players = raw.players ?? [];
      if (mlbamId) {
        erospPlayer = players.find(p => p.mlbam_id === mlbamId) ?? null;
      } else if (espnIdStr) {
        erospPlayer = players.find(p => String(p.espn_id) === espnIdStr) ?? null;
        if (erospPlayer) mlbamId = erospPlayer.mlbam_id;
      } else if (playerNameParam) {
        const n = norm(playerNameParam);
        erospPlayer = players.find(p => norm(p.name) === n) ?? null;
        if (erospPlayer) mlbamId = erospPlayer.mlbam_id;
      }
    }
  } catch { /* ignore */ }

  // Load 2026 YTD fantasy points from current roster
  let fantasyPoints2026: number | undefined;
  try {
    const currentPath = path.join(process.cwd(), 'data', 'current', '2026.json');
    if (fs.existsSync(currentPath)) {
      const raw = JSON.parse(fs.readFileSync(currentPath, 'utf-8')) as {
        rosters?: Array<{ players?: Array<{ playerName: string; totalPoints: number }> }>;
      };
      const nameToFind = norm(erospPlayer?.name ?? playerNameParam ?? '');
      for (const roster of raw.rosters ?? []) {
        for (const player of roster.players ?? []) {
          if (norm(player.playerName) === nameToFind && player.totalPoints > 0) {
            fantasyPoints2026 = player.totalPoints;
          }
        }
      }
    }
  } catch { /* ignore */ }

  // Load 2025 actual points from historical data
  let fantasyPoints2025: number | undefined;
  try {
    const histPath = path.join(process.cwd(), 'data', 'historical', '2022-2025.json');
    if (fs.existsSync(histPath)) {
      const raw = JSON.parse(fs.readFileSync(histPath, 'utf-8')) as Array<{
        year: number;
        rosters?: Array<{ players?: Array<{ playerName: string; totalPoints: number }> }>;
      }>;
      const season2025 = raw.find(s => s.year === 2025);
      if (season2025) {
        const nameToFind = norm(erospPlayer?.name ?? playerNameParam ?? '');
        for (const roster of season2025.rosters ?? []) {
          for (const player of roster.players ?? []) {
            if (norm(player.playerName) === nameToFind) {
              fantasyPoints2025 = player.totalPoints;
            }
          }
        }
      }
    }
  } catch { /* ignore */ }

  const name = erospPlayer?.name ?? playerNameParam ?? 'Unknown';
  const role = erospPlayer?.role ?? 'H';
  const isPitcher = role === 'SP' || role === 'RP';
  const group = isPitcher ? 'pitching' : 'hitting';

  let seasonStats: PlayerCardStats | null = null;
  let last14Stats: PlayerCardStats | null = null;
  let last7Stats: PlayerCardStats | null = null;
  let recentGames: RecentGame[] = [];

  if (mlbamId) {
    const [seasonSplits, last14Splits, last7Splits, gameLogSplits] = await Promise.all([
      fetchMlbSplits(mlbamId, group, 'season'),
      fetchMlbSplits(mlbamId, group, 'lastXGames', '&limit=14'),
      fetchMlbSplits(mlbamId, group, 'lastXGames', '&limit=7'),
      fetchMlbSplits(mlbamId, group, 'gameLog'),
    ]);

    seasonStats = buildStats(seasonSplits?.[0] ?? null, isPitcher);
    last14Stats = buildStats(last14Splits?.[0] ?? null, isPitcher);
    last7Stats = buildStats(last7Splits?.[0] ?? null, isPitcher);

    if (gameLogSplits && Array.isArray(gameLogSplits)) {
      recentGames = (gameLogSplits as RawSplit[])
        .slice(-5)
        .reverse()
        .map(split => {
          const stat = split.stat;
          const fp = isPitcher ? calcPitcherFP(stat) : calcHitterFP(stat);
          const rawDate = split.date ?? split.game?.officialDate ?? '';
          const dateDisplay = rawDate
            ? new Date(rawDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '—';
          const isQS = isPitcher && parseIP(stat.inningsPitched ?? 0) >= 6 && Number(stat.earnedRuns ?? 0) <= 3;
          const oppId = split.opponent?.id;
          const oppAbbrev = split.opponent?.abbreviation ?? (oppId ? MLB_TEAM_ABBREV[oppId] : undefined);
          return {
            date: dateDisplay,
            opponent: oppAbbrev,
            fantasyPoints: Math.round(fp * 10) / 10,
            statLine: formatStatLine(stat, isPitcher),
            isQS,
          };
        })
        .filter(g => g.statLine !== '0-0' && g.statLine !== '0.0 IP');
    }
  }

  // Find the 2 most recent news articles mentioning this player
  const mentions: PlayerCardData['mentions'] = [];
  const playerNameNorm = norm(name);

  try {
    const articles = await fetchBaseballNews();
    for (const article of articles) {
      if (norm(article.title).includes(playerNameNorm) || norm(article.summary).includes(playerNameNorm)) {
        mentions.push({ title: article.title, url: article.link, date: article.pubDate });
        if (mentions.length >= 2) break;
      }
    }
  } catch { /* ignore — mentions are optional */ }

  const descriptions = loadPlayerDescription(mlbamId);

  const result: PlayerCardData = {
    name,
    position: erospPlayer?.position ?? '—',
    mlbTeam: erospPlayer?.mlb_team ?? '—',
    mlbamId: mlbamId ?? undefined,
    role: role as 'H' | 'SP' | 'RP',

    ilType: erospPlayer?.il_type,
    ilDaysRemaining: erospPlayer?.il_days_remaining,
    injuryNote: erospPlayer?.injury_note,
    injuryNews: erospPlayer?.injury_news,
    injuryNewsSource: erospPlayer?.injury_news_source,
    injuryNewsDate: erospPlayer?.injury_news_date,

    erospRaw: erospPlayer?.erosp_raw,
    erospStartable: erospPlayer?.erosp_startable,
    fantasyPoints2025,
    fantasyPoints2026,

    seasonStats,
    last14Stats,
    last7Stats,
    recentGames,
    mentions: mentions.length > 0 ? mentions : undefined,

    background: descriptions.background || undefined,
    recentAnalysis: descriptions.recentAnalysis || undefined,
  };

  return Response.json(result);
}
