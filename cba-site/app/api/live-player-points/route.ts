import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import type {
  LivePlayerPointsResponse,
  LiveTeamPoints,
  LivePlayerPoints,
  LiveStatLine,
  LiveBreakdown,
} from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MLB_BASE = 'https://statsapi.mlb.com/api/v1';
const DATA_DIR = path.join(process.cwd(), 'data');

// ── Scoring helpers ───────────────────────────────────────────────────────────

/**
 * Parse an MLB "inningsPitched" string like "6.1" where the decimal is thirds, not tenths.
 * "6.1" = 6 + 1/3 = 6.333..., "3.2" = 3 + 2/3 = 3.667...
 */
function parseIP(ipStr: string | number): number {
  const s = String(ipStr ?? '0');
  const [whole, frac] = s.split('.');
  return parseInt(whole || '0', 10) + (frac ? parseInt(frac, 10) / 3 : 0);
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z ]/g, '').trim();
}

/** Get current hour (0–23) in US Eastern time. */
function getEasternHour(): number {
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
  }).format(new Date());
  const h = parseInt(s, 10);
  // Intl returns "24" for midnight in some locales; normalize
  return isNaN(h) ? 0 : h % 24;
}

/** Get today's date in ET as "YYYY-MM-DD". */
function getTodayET(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
  }).format(new Date());
}

/** Normalize MLB API detailedState to one of our four status strings. */
function normalizeGameStatus(detailedState: string): string {
  const s = (detailedState ?? '').toLowerCase();
  if (s.includes('final') || s.includes('game over') || s.includes('completed')) return 'Final';
  if (s.includes('progress')) return 'In Progress';
  if (s.includes('postponed') || s.includes('cancelled') || s.includes('suspended')) return 'No Game';
  return 'Not Started';
}

// ── Fantasy point computation ────────────────────────────────────────────────

function computeHitterStats(
  batting: Record<string, number | string>
): { points: number; lines: LiveStatLine[] } {
  const h = Number(batting.hits ?? 0);
  const d2 = Number(batting.doubles ?? 0);
  const d3 = Number(batting.triples ?? 0);
  const hr = Number(batting.homeRuns ?? 0);
  const r = Number(batting.runs ?? 0);
  const rbi = Number(batting.rbi ?? 0);
  const bb = Number(batting.baseOnBalls ?? 0);
  const hbp = Number(batting.hitByPitch ?? 0);
  const k = Number(batting.strikeOuts ?? 0);
  const sb = Number(batting.stolenBases ?? 0);
  const cs = Number(batting.caughtStealing ?? 0);
  const gidp = Number(batting.groundIntoDoublePlay ?? 0);

  const singles = Math.max(0, h - d2 - d3 - hr);
  const lines: LiveStatLine[] = [];

  // Hits: each hit = +1, each base = +1, so 1B=2, 2B=3, 3B=4, HR=5
  if (singles > 0) lines.push({ stat: '1B', value: singles, points: singles * 2 });
  if (d2 > 0) lines.push({ stat: '2B', value: d2, points: d2 * 3 });
  if (d3 > 0) lines.push({ stat: '3B', value: d3, points: d3 * 4 });
  if (hr > 0) lines.push({ stat: 'HR', value: hr, points: hr * 5 });
  if (r > 0) lines.push({ stat: 'R', value: r, points: r * 1 });
  if (rbi > 0) lines.push({ stat: 'RBI', value: rbi, points: rbi * 1 });
  if (bb > 0) lines.push({ stat: 'BB', value: bb, points: bb * 1 });
  if (hbp > 0) lines.push({ stat: 'HBP', value: hbp, points: hbp * 1 });
  if (sb > 0) lines.push({ stat: 'SB', value: sb, points: sb * 2 });
  if (k > 0) lines.push({ stat: 'K', value: k, points: k * -1 });
  if (cs > 0) lines.push({ stat: 'CS', value: cs, points: cs * -1 });
  if (gidp > 0) lines.push({ stat: 'GIDP', value: gidp, points: gidp * -0.25 });

  return { points: lines.reduce((s, l) => s + l.points, 0), lines };
}

function computePitcherStats(
  pitching: Record<string, number | string>
): { points: number; lines: LiveStatLine[] } {
  const ipDecimal = parseIP(String(pitching.inningsPitched ?? '0'));
  const ha = Number(pitching.hits ?? 0);
  const er = Number(pitching.earnedRuns ?? 0);
  const bba = Number(pitching.baseOnBalls ?? 0);
  const kp = Number(pitching.strikeOuts ?? 0);
  const w = Number(pitching.wins ?? 0);
  const l = Number(pitching.losses ?? 0);
  const sv = Number(pitching.saves ?? 0);
  const bs = Number(pitching.blownSaves ?? 0);
  const hd = Number(pitching.holds ?? 0);
  const isQS = ipDecimal >= 6.0 && er <= 3;

  const lines: LiveStatLine[] = [];
  if (ipDecimal > 0) lines.push({ stat: 'IP', value: ipDecimal, points: ipDecimal * 3 });
  if (ha > 0) lines.push({ stat: 'HA', value: ha, points: ha * -1 });
  if (er > 0) lines.push({ stat: 'ER', value: er, points: er * -2 });
  if (bba > 0) lines.push({ stat: 'BBA', value: bba, points: bba * -1 });
  if (kp > 0) lines.push({ stat: 'KP', value: kp, points: kp * 1 });
  if (w > 0) lines.push({ stat: 'W', value: w, points: w * 3 });
  if (l > 0) lines.push({ stat: 'L', value: l, points: l * -3 });
  if (sv > 0) lines.push({ stat: 'SV', value: sv, points: sv * 5 });
  if (bs > 0) lines.push({ stat: 'BS', value: bs, points: bs * -2 });
  if (hd > 0) lines.push({ stat: 'HD', value: hd, points: hd * 3 });
  if (isQS) lines.push({ stat: 'QS', value: 1, points: 3 });

  return { points: lines.reduce((s, l) => s + l.points, 0), lines };
}

function buildBreakdown(lines: LiveStatLine[]): LiveBreakdown | null {
  const meaningful = lines.filter(l => l.points !== 0);
  if (meaningful.length === 0) return null;
  return { label: meaningful.map(l => l.stat).join(', '), lines: meaningful };
}

// ── Box score accumulation ────────────────────────────────────────────────────

interface PlayerBoxStats {
  batting: Record<string, number | string>;
  pitching: Record<string, number | string>;
  gamePk: number;
  gameStatus: string;
}

/** Merge stats across doubleheader games, summing counting stats. */
function mergeBoxStats(statsList: PlayerBoxStats[]): {
  batting: Record<string, number | string>;
  pitching: Record<string, number | string>;
  gameStatus: string;
} {
  const batting: Record<string, number> = {};
  const pitching: Record<string, number> = {};
  let ipTotal = 0;
  let gameStatus = 'No Game';

  for (const s of statsList) {
    // Later game's status wins (so In Progress > Final if DH game 2 is live)
    if (s.gameStatus !== 'No Game') gameStatus = s.gameStatus;
    for (const [k, v] of Object.entries(s.batting)) {
      batting[k] = (batting[k] ?? 0) + Number(v ?? 0);
    }
    for (const [k, v] of Object.entries(s.pitching)) {
      if (k === 'inningsPitched') {
        ipTotal += parseIP(String(v ?? '0'));
      } else {
        pitching[k] = (pitching[k] ?? 0) + Number(v ?? 0);
      }
    }
  }

  // Rebuild inningsPitched string from accumulated decimal value
  const ipWhole = Math.floor(ipTotal);
  const ipFrac = Math.round((ipTotal - ipWhole) * 3); // 0, 1, or 2
  const inningsPitchedStr = `${ipWhole}.${ipFrac}`;

  return {
    batting: batting as Record<string, number | string>,
    pitching: { ...(pitching as Record<string, number | string>), inningsPitched: inningsPitchedStr },
    gameStatus,
  };
}

// ── Main route handler ────────────────────────────────────────────────────────

interface EROSPPlayer {
  mlbam_id: number;
  espn_id: string;
  name: string;
  position: string;
  mlb_team: string;
  role: string; // 'H' | 'SP' | 'RP'
  fantasy_team_id: number;
  is_fa: boolean;
}

export async function GET(): Promise<NextResponse> {
  // ── Time gate: only run between 11 AM – 11 PM ET ──────────────────────────
  const hourET = getEasternHour();
  if (hourET < 11 || hourET >= 23) {
    return NextResponse.json({ source: 'espn_only' } satisfies LivePlayerPointsResponse);
  }

  const todayET = getTodayET();
  const cacheKey = `live-player-points-${todayET}`;

  // ── KV cache check ────────────────────────────────────────────────────────
  if (process.env.KV_REST_API_URL) {
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.KV_REST_API_URL!,
        token: process.env.KV_REST_API_TOKEN!,
      });
      const cached = await redis.get<LivePlayerPointsResponse>(cacheKey);
      if (cached) return NextResponse.json(cached);
    } catch {
      // Cache miss or error — proceed to compute
    }
  }

  // ── Load EROSP data ───────────────────────────────────────────────────────
  let erospPlayers: EROSPPlayer[] = [];
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, 'erosp', 'latest.json'), 'utf-8')
    );
    erospPlayers = (raw?.players ?? raw) as EROSPPlayer[];
  } catch {
    // EROSP not available yet
  }

  // Build lookup maps for rostered players only
  const mlbamToErosp = new Map<number, EROSPPlayer>();
  const nameToErosp = new Map<string, EROSPPlayer>();
  for (const p of erospPlayers) {
    if (p.fantasy_team_id === 0) continue;
    mlbamToErosp.set(p.mlbam_id, p);
    const norm = normalizeName(p.name);
    if (norm) nameToErosp.set(norm, p);
  }

  // ── Load ESPN rosters (fallback for players not in EROSP) ─────────────────
  // teamId → players array
  interface RosterPlayer {
    playerId: string;
    playerName: string;
    position: string;
  }
  const rosterByTeam = new Map<number, RosterPlayer[]>();
  let currentWeek = 1;
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, 'current', '2026.json'), 'utf-8')
    );
    // Rosters
    const rosters = raw?.rosters ?? [];
    for (const r of rosters) {
      rosterByTeam.set(r.teamId as number, r.players as RosterPlayer[]);
    }
    // Current week from matchups
    const matchups: Array<{
      week: number;
      home: { totalPoints: number };
      away: { totalPoints: number };
      winner?: string;
    }> = raw?.matchups ?? [];
    let lastActive = 1;
    for (const m of matchups) {
      if (
        m.winner === 'HOME' ||
        m.winner === 'AWAY' ||
        m.home.totalPoints > 0 ||
        m.away.totalPoints > 0
      ) {
        if (m.week > lastActive) lastActive = m.week;
      }
    }
    currentWeek = lastActive;
  } catch {
    // Use defaults
  }

  // ── Fetch today's MLB schedule ────────────────────────────────────────────
  const gamePks: number[] = [];
  const gamePkStatus = new Map<number, string>();
  try {
    const res = await fetch(
      `${MLB_BASE}/schedule?sportId=1&gameType=R&date=${todayET}`,
      { signal: AbortSignal.timeout(10_000) }
    );
    if (res.ok) {
      const data = await res.json();
      for (const dateEntry of data?.dates ?? []) {
        for (const game of dateEntry?.games ?? []) {
          const pk = game.gamePk as number;
          gamePks.push(pk);
          gamePkStatus.set(pk, normalizeGameStatus(game.status?.detailedState ?? ''));
        }
      }
    }
  } catch {
    // No schedule — likely non-game day
  }

  // ── Fetch all box scores in parallel ─────────────────────────────────────
  const boxResults = await Promise.allSettled(
    gamePks.map(pk =>
      fetch(`${MLB_BASE}/game/${pk}/boxscore`, { signal: AbortSignal.timeout(10_000) })
        .then(r => (r.ok ? r.json() : null))
        .then(data => ({ pk, data }))
        .catch(() => ({ pk, data: null }))
    )
  );

  // ── Build per-player box score accumulator ────────────────────────────────
  // mlbam_id → accumulated stats across all their games today
  const playerStatsAccum = new Map<number, PlayerBoxStats[]>();
  // normalized name → accumulated stats (fallback for players not in EROSP)
  const nameStatsAccum = new Map<string, PlayerBoxStats[]>();

  for (const result of boxResults) {
    if (result.status !== 'fulfilled') continue;
    const { pk, data } = result.value;
    if (!data?.teams) continue;
    const gameStatus = gamePkStatus.get(pk) ?? 'Not Started';

    for (const side of ['home', 'away'] as const) {
      const teamData = data.teams[side];
      if (!teamData?.players) continue;
      for (const [, rawEntry] of Object.entries(teamData.players)) {
        const entry = rawEntry as Record<string, unknown>;
        const person = entry.person as Record<string, unknown> | undefined;
        if (!person?.id) continue;
        const mlbamId = person.id as number;
        const fullName = (person.fullName as string) ?? '';
        const stats = entry.stats as Record<string, Record<string, number | string>> | undefined;
        const boxStat: PlayerBoxStats = {
          batting: (stats?.batting ?? {}) as Record<string, number | string>,
          pitching: (stats?.pitching ?? {}) as Record<string, number | string>,
          gamePk: pk,
          gameStatus,
        };

        const existing = playerStatsAccum.get(mlbamId);
        if (existing) existing.push(boxStat);
        else playerStatsAccum.set(mlbamId, [boxStat]);

        const norm = normalizeName(fullName);
        if (norm) {
          const existingName = nameStatsAccum.get(norm);
          if (existingName) existingName.push(boxStat);
          else nameStatsAccum.set(norm, [boxStat]);
        }
      }
    }
  }

  // ── Build per-team fantasy results ────────────────────────────────────────
  const teamResults = new Map<number, LiveTeamPoints>();

  function ensureTeam(teamId: number): LiveTeamPoints {
    if (!teamResults.has(teamId)) {
      teamResults.set(teamId, { totalTodayPoints: 0, players: [] });
    }
    return teamResults.get(teamId)!;
  }

  function processStats(
    statsList: PlayerBoxStats[],
    role: string
  ): { todayPoints: number; gameStatus: string; breakdown: LiveBreakdown | null } {
    const { batting, pitching, gameStatus } = mergeBoxStats(statsList);
    const isPitcher = role === 'SP' || role === 'RP';
    const { points, lines } = isPitcher
      ? computePitcherStats(pitching)
      : computeHitterStats(batting);
    return { todayPoints: points, gameStatus, breakdown: buildBreakdown(lines) };
  }

  // Pass 1: EROSP rostered players (covers ~245/260 rostered players)
  for (const p of erospPlayers) {
    if (p.fantasy_team_id === 0) continue;
    const team = ensureTeam(p.fantasy_team_id);
    const statsList = playerStatsAccum.get(p.mlbam_id);

    let todayPoints = 0;
    let gameStatus = 'No Game';
    let breakdown: LiveBreakdown | null = null;

    if (statsList && statsList.length > 0) {
      ({ todayPoints, gameStatus, breakdown } = processStats(statsList, p.role));
    }

    team.totalTodayPoints += todayPoints;
    team.players.push({
      name: p.name,
      mlbamId: p.mlbam_id,
      espnId: parseInt(p.espn_id, 10) || 0,
      position: p.role,
      todayPoints,
      gameStatus,
      breakdown,
    });
  }

  // Pass 2: ESPN roster players NOT in EROSP (recently added, etc.)
  for (const [teamId, rosterPlayers] of rosterByTeam.entries()) {
    const team = ensureTeam(teamId);
    const existingEspnIds = new Set(team.players.map(p => p.espnId.toString()));

    for (const rp of rosterPlayers) {
      if (existingEspnIds.has(rp.playerId)) continue;
      // Try name match in box scores
      const norm = normalizeName(rp.playerName);
      const statsList = nameStatsAccum.get(norm);
      if (!statsList || statsList.length === 0) continue;

      const isPitcher = rp.position === 'SP' || rp.position === 'RP';
      const role = isPitcher ? rp.position : 'H';
      const { todayPoints, gameStatus, breakdown } = processStats(statsList, role);

      team.totalTodayPoints += todayPoints;
      team.players.push({
        name: rp.playerName,
        mlbamId: 0,
        espnId: parseInt(rp.playerId, 10) || 0,
        position: role,
        todayPoints,
        gameStatus,
        breakdown,
      });
    }
  }

  // Sort each team's players by todayPoints descending
  for (const teamData of teamResults.values()) {
    teamData.players.sort((a, b) => b.todayPoints - a.todayPoints);
  }

  // Build typed teams record
  const teams: Record<number, LiveTeamPoints> = {};
  for (const [teamId, data] of teamResults.entries()) {
    teams[teamId] = data;
  }

  const response: LivePlayerPointsResponse = {
    source: 'mlb_live',
    asOf: new Date().toISOString(),
    week: currentWeek,
    teams,
  };

  // ── Cache in KV with 5-minute TTL ─────────────────────────────────────────
  if (process.env.KV_REST_API_URL) {
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.KV_REST_API_URL!,
        token: process.env.KV_REST_API_TOKEN!,
      });
      await redis.set(cacheKey, JSON.stringify(response), { ex: 300 });
    } catch {
      // Non-fatal — serve fresh data without caching
    }
  }

  return NextResponse.json(response);
}
