import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MLB_BASE = 'https://statsapi.mlb.com/api/v1';
const DATA_DIR = path.join(process.cwd(), 'data');

// ── Helpers ───────────────────────────────────────────────────────────────────

function getTodayET(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
  }).format(new Date());
}

function formatGameTimeET(utcString: string): string {
  try {
    const date = new Date(utcString);
    return (
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(date) + ' ET'
    );
  } catch {
    return '';
  }
}

type GameStatus = 'Scheduled' | 'In Progress' | 'Final' | 'Postponed';

function normalizeGameStatus(detailedState: string): GameStatus {
  const s = (detailedState ?? '').toLowerCase();
  if (s.includes('final') || s.includes('game over') || s.includes('completed')) return 'Final';
  if (s.includes('progress')) return 'In Progress';
  if (s.includes('postponed') || s.includes('cancelled') || s.includes('suspended'))
    return 'Postponed';
  return 'Scheduled';
}

// Some EROSP abbreviations differ from MLB API abbreviations.
// Map EROSP → MLB API where they diverge.
const ABBR_NORMALIZE: Record<string, string> = {
  // add overrides here if discovered (e.g. WSH→WSN)
};

function normalizeAbbr(abbr: string): string {
  const upper = (abbr ?? '').toUpperCase();
  return ABBR_NORMALIZE[upper] ?? upper;
}

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface GameSlot {
  /** Unique key per (game × mlb-team side). Use for React keys and grouping. */
  groupKey: string;
  gamePk: number;
  playerName: string;
  mlbamId: number;
  /** Player's MLB team abbreviation */
  mlbTeam: string;
  opponentAbbr: string;
  isHome: boolean;
  gameTime: string;
  gameStatus: GameStatus;
  /** e.g. "Top 3rd", "Bot 7th" — only set when In Progress */
  inning?: string;
  /** Formatted score e.g. "3-1" (mlbTeam score first) — set when In Progress or Final */
  score?: string;
  /** Probable starter for the player's MLB team */
  pitcherName?: string;
  /** 'H' | 'SP' | 'RP' */
  role: string;
}

interface EROSPPlayer {
  mlbam_id: number;
  name: string;
  mlb_team: string;
  role: string;
  fantasy_team_id: number;
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const teamIdStr = searchParams.get('teamId');
  const teamId = teamIdStr ? parseInt(teamIdStr, 10) : NaN;

  if (isNaN(teamId)) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }

  // ── Load EROSP rostered players for this fantasy team ─────────────────────
  let erospPlayers: EROSPPlayer[] = [];
  try {
    const erospPath = path.join(DATA_DIR, 'erosp', 'latest.json');
    if (fs.existsSync(erospPath)) {
      const raw = JSON.parse(fs.readFileSync(erospPath, 'utf-8'));
      erospPlayers = (raw?.players ?? raw) as EROSPPlayer[];
    }
  } catch { /* EROSP not yet generated */ }

  const teamPlayers = erospPlayers.filter(p => p.fantasy_team_id === teamId);
  if (teamPlayers.length === 0) {
    return NextResponse.json([]);
  }

  // Build lookup: MLB team abbr (normalized) → list of fantasy players
  const playersByMlbTeam = new Map<string, EROSPPlayer[]>();
  for (const p of teamPlayers) {
    const abbr = normalizeAbbr(p.mlb_team);
    const existing = playersByMlbTeam.get(abbr) ?? [];
    existing.push(p);
    playersByMlbTeam.set(abbr, existing);
  }
  const mlbTeamAbbrSet = new Set(playersByMlbTeam.keys());

  // ── Fetch today's MLB schedule ────────────────────────────────────────────
  const todayET = getTodayET();
  type RawGame = Record<string, unknown>;
  let scheduleGames: RawGame[] = [];
  try {
    const url = `${MLB_BASE}/schedule?sportId=1&gameType=R&date=${todayET}&hydrate=linescore,probablePitcher,team`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const data = await res.json();
      scheduleGames = (data?.dates?.[0]?.games ?? []) as RawGame[];
    }
  } catch { /* No schedule / network error */ }

  // ── Build game slots ───────────────────────────────────────────────────────
  const result: GameSlot[] = [];

  for (const game of scheduleGames) {
    const gamePk = game.gamePk as number;
    const gameDate = game.gameDate as string;
    const detailedState = ((game.status as Record<string, unknown>)?.detailedState as string) ?? '';
    const gameStatus = normalizeGameStatus(detailedState);
    const gameTime = formatGameTimeET(gameDate);

    const teams = (game.teams as Record<string, unknown>) ?? {};
    const homeData = (teams.home as Record<string, unknown>) ?? {};
    const awayData = (teams.away as Record<string, unknown>) ?? {};
    const homeTeamInfo = (homeData.team as Record<string, unknown>) ?? {};
    const awayTeamInfo = (awayData.team as Record<string, unknown>) ?? {};

    const homeAbbr = normalizeAbbr((homeTeamInfo.abbreviation as string) ?? '');
    const awayAbbr = normalizeAbbr((awayTeamInfo.abbreviation as string) ?? '');

    // Parse linescore
    const linescore = (game.linescore as Record<string, unknown>) ?? null;
    let inning: string | undefined;
    let homeRuns: number | undefined;
    let awayRuns: number | undefined;

    if (linescore && (gameStatus === 'In Progress' || gameStatus === 'Final')) {
      const half = ((linescore.inningHalf as string) ?? '').toLowerCase();
      const halfLabel = half === 'bottom' ? 'Bot' : 'Top';
      const inningOrdinal = (linescore.currentInningOrdinal as string) ?? String(linescore.currentInning ?? '');
      if (inningOrdinal && gameStatus === 'In Progress') {
        inning = `${halfLabel} ${inningOrdinal}`;
      }
      const linescoreTeams = (linescore.teams as Record<string, Record<string, number>>) ?? {};
      homeRuns = linescoreTeams.home?.runs;
      awayRuns = linescoreTeams.away?.runs;
    }

    // Probable pitchers
    const homeProbablePitcher = ((homeData.probablePitcher as Record<string, unknown>)?.fullName as string) ?? undefined;
    const awayProbablePitcher = ((awayData.probablePitcher as Record<string, unknown>)?.fullName as string) ?? undefined;

    // Emit one group slot per side that has fantasy players
    const sides: Array<{
      abbr: string;
      oppAbbr: string;
      isHome: boolean;
      myRuns: number | undefined;
      oppRuns: number | undefined;
      probablePitcher: string | undefined;
    }> = [];

    if (mlbTeamAbbrSet.has(homeAbbr)) {
      sides.push({
        abbr: homeAbbr,
        oppAbbr: awayAbbr,
        isHome: true,
        myRuns: homeRuns,
        oppRuns: awayRuns,
        probablePitcher: homeProbablePitcher,
      });
    }
    if (mlbTeamAbbrSet.has(awayAbbr)) {
      sides.push({
        abbr: awayAbbr,
        oppAbbr: homeAbbr,
        isHome: false,
        myRuns: awayRuns,
        oppRuns: homeRuns,
        probablePitcher: awayProbablePitcher,
      });
    }

    for (const side of sides) {
      const players = playersByMlbTeam.get(side.abbr) ?? [];
      const groupKey = `${gamePk}-${side.abbr}`;

      // Build score string: "myScore-oppScore"
      let score: string | undefined;
      if (side.myRuns !== undefined && side.oppRuns !== undefined) {
        score = `${side.myRuns}-${side.oppRuns}`;
      }

      for (const p of players) {
        result.push({
          groupKey,
          gamePk,
          playerName: p.name,
          mlbamId: p.mlbam_id,
          mlbTeam: side.abbr,
          opponentAbbr: side.oppAbbr,
          isHome: side.isHome,
          gameTime,
          gameStatus,
          inning,
          score,
          pitcherName: side.probablePitcher,
          role: p.role,
        });
      }
    }
  }

  // Sort groups: In Progress → Scheduled → Final → Postponed
  const statusOrder: Record<string, number> = {
    'In Progress': 0,
    Scheduled: 1,
    Final: 2,
    Postponed: 3,
  };
  result.sort((a, b) => (statusOrder[a.gameStatus] ?? 4) - (statusOrder[b.gameStatus] ?? 4));

  return NextResponse.json(result);
}
