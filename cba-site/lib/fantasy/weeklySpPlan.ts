/**
 * Weekly SP start planner.
 *
 * Fetches probable pitchers for every day in the current matchup week,
 * matches them against a team's SP roster, scores each projected start,
 * and returns a ranked plan of which 7 starts to use.
 */

import fs from 'fs';
import path from 'path';

const MLB_BASE = 'https://statsapi.mlb.com/api/v1';
const SP_WEEKLY_CAP = 7;

// Park factors (pitcher perspective = inverse of hitter — pitching in COL hurts)
const PARK_FACTORS: Record<string, number> = {
  COL: 1.13, BOS: 1.07, CIN: 1.06, CHC: 1.05, NYY: 1.04, TEX: 1.03, ATL: 1.03,
  PHI: 1.02, BAL: 1.01, HOU: 1.01, MIL: 1.00, STL: 1.00, DET: 1.00, MIA: 0.99,
  CLE: 0.99, MIN: 0.99, NYM: 0.98, TOR: 0.98, TB: 0.97, LAD: 0.97, SEA: 0.97,
  ARI: 0.97, KC: 0.96, SD: 0.96, PIT: 0.96, CWS: 0.96, SF: 0.95, LAA: 0.95,
  OAK: 0.95, ATH: 0.95, WSH: 0.94,
};

export interface SpStartEntry {
  playerName: string;
  mlbamId: number;
  espnId: string;
  date: string;           // YYYY-MM-DD
  isToday: boolean;
  isPast: boolean;        // game already happened
  opponentAbbr: string;
  isHome: boolean;
  opponentPitcherName?: string;
  opponentPitcherMlbamId?: number;
  opponentPitcherEra?: number;
  projectedPoints: number;
  recommended: boolean;   // within the top SP_WEEKLY_CAP starts for the week
  fpPerStart: number;
}

export interface WeeklySpPlan {
  matchupWeek: number;
  weekStartDate: string;
  weekEndDate: string;
  startsUsed: number;
  startsAllowed: number;
  startsRemaining: number;
  entries: SpStartEntry[];  // all confirmed/probable starts this week, sorted by projectedPoints desc
}

// ── Schedule fetching ──────────────────────────────────────────────────────────

interface MlbProbablePitcher {
  mlbamId: number;
  fullName: string;
}

interface MlbGameSlot {
  homeTeamId: number;
  homeTeamName: string;
  awayTeamId: number;
  awayTeamName: string;
  homePitcher?: MlbProbablePitcher;
  awayPitcher?: MlbProbablePitcher;
  isFinal: boolean;
}

// MLB team id → abbreviation
const MLB_ID_TO_ABBREV: Record<number, string> = {
  108: 'LAA', 109: 'ARI', 110: 'BAL', 111: 'BOS', 112: 'CHC', 113: 'CIN',
  114: 'CLE', 115: 'COL', 116: 'DET', 117: 'HOU', 118: 'KC', 119: 'LAD',
  120: 'WSH', 121: 'NYM', 133: 'ATH', 134: 'PIT', 135: 'SD', 136: 'SEA',
  137: 'SF', 138: 'STL', 139: 'TB', 140: 'TEX', 141: 'TOR', 142: 'MIN',
  143: 'PHI', 144: 'ATL', 145: 'CWS', 146: 'MIA', 147: 'NYY', 158: 'MIL',
};

async function fetchDaySchedule(date: string): Promise<MlbGameSlot[]> {
  try {
    const url = `${MLB_BASE}/schedule?sportId=1&date=${date}&hydrate=probablePitcher(note),linescore`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const data = await res.json() as { dates?: Array<{ games?: unknown[] }> };
    const games = (data.dates?.[0]?.games ?? []) as Array<Record<string, unknown>>;

    return games.map(g => {
      const teams = g['teams'] as Record<string, Record<string, unknown>>;
      const home = teams['home'];
      const away = teams['away'];
      const status = (g['status'] as Record<string, string>)?.['detailedState'] ?? '';
      const homeTeam = home['team'] as Record<string, unknown>;
      const awayTeam = away['team'] as Record<string, unknown>;
      const hp = home['probablePitcher'] as Record<string, unknown> | undefined;
      const ap = away['probablePitcher'] as Record<string, unknown> | undefined;
      return {
        homeTeamId: homeTeam['id'] as number,
        homeTeamName: homeTeam['name'] as string,
        awayTeamId: awayTeam['id'] as number,
        awayTeamName: awayTeam['name'] as string,
        homePitcher: hp ? { mlbamId: hp['id'] as number, fullName: hp['fullName'] as string } : undefined,
        awayPitcher: ap ? { mlbamId: ap['id'] as number, fullName: ap['fullName'] as string } : undefined,
        isFinal: status === 'Final' || status === 'Game Over',
      };
    });
  } catch {
    return [];
  }
}

// ── Week date helpers ──────────────────────────────────────────────────────────

function getWeekDates(today: string): { matchupWeek: number; dates: string[]; startDate: string; endDate: string } {
  try {
    const scheduleRaw = fs.readFileSync(
      path.join(process.cwd(), 'data', 'fantasy', 'schedule-2026.json'), 'utf-8'
    );
    const schedule = JSON.parse(scheduleRaw) as {
      seasonStartDate: string;
      matchupPeriods: Record<string, number[]>;
    };

    const seasonStart = new Date(schedule.seasonStartDate + 'T12:00:00');
    const todayDate = new Date(today + 'T12:00:00');
    const dayOffset = Math.round((todayDate.getTime() - seasonStart.getTime()) / 86_400_000);
    const scoringPeriod = dayOffset + 1;

    for (const [week, periods] of Object.entries(schedule.matchupPeriods)) {
      if (periods.includes(scoringPeriod)) {
        const dates = periods.map(p => {
          const d = new Date(seasonStart);
          d.setDate(d.getDate() + p - 1);
          return d.toISOString().slice(0, 10);
        });
        return {
          matchupWeek: parseInt(week, 10),
          dates,
          startDate: dates[0],
          endDate: dates[dates.length - 1],
        };
      }
    }
  } catch { /* fall through */ }

  // Fallback: 7-day window around today
  const base = new Date(today + 'T12:00:00');
  const dow = base.getDay(); // 0=Sun
  const monday = new Date(base);
  monday.setDate(base.getDate() - ((dow + 6) % 7));
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
  return { matchupWeek: 0, dates, startDate: dates[0], endDate: dates[6] };
}

// ── ERA fetch (best-effort) ────────────────────────────────────────────────────

async function fetchPitcherEra(mlbamId: number): Promise<number | undefined> {
  try {
    const url = `${MLB_BASE}/people/${mlbamId}/stats?stats=season&group=pitching&season=2026`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return undefined;
    const data = await res.json() as { stats?: Array<{ splits?: Array<{ stat?: { era?: string } }> }> };
    const era = data.stats?.[0]?.splits?.[0]?.stat?.era;
    return era ? parseFloat(era) : undefined;
  } catch {
    return undefined;
  }
}

// ── Main export ────────────────────────────────────────────────────────────────

export interface SpRosterPlayer {
  name: string;
  mlbamId: number;
  espnId: string;
  mlbTeam: string;          // current MLB team abbreviation
  fpPerStart: number;       // from EROSP
}

export async function buildWeeklySpPlan(
  spRoster: SpRosterPlayer[],
  today: string,
): Promise<WeeklySpPlan> {
  const { matchupWeek, dates, startDate, endDate } = getWeekDates(today);

  // Fetch schedule for every day of the week in parallel
  const daySchedules = await Promise.all(dates.map(d => fetchDaySchedule(d)));

  // Build mlbamId → SpRosterPlayer lookup
  const byMlbamId = new Map<number, SpRosterPlayer>();
  for (const sp of spRoster) {
    if (sp.mlbamId) byMlbamId.set(sp.mlbamId, sp);
  }

  // Also build name-normalised lookup as fallback
  function norm(s: string) { return s.toLowerCase().replace(/[^a-z]/g, ''); }
  const byName = new Map<number, SpRosterPlayer>(); // not used — mlbamId lookup is primary
  void byName;

  const allEntries: SpStartEntry[] = [];
  let startsUsed = 0;

  // Collect ERA fetches needed (opponent probable pitchers)
  const eraFetches = new Map<number, Promise<number | undefined>>();

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    const isPast = date < today;
    const isToday = date === today;
    const games = daySchedules[i];

    for (const game of games) {
      // Check home pitcher
      if (game.homePitcher) {
        const sp = byMlbamId.get(game.homePitcher.mlbamId);
        if (sp) {
          const oppId = game.awayTeamId;
          const oppAbbr = MLB_ID_TO_ABBREV[oppId] ?? '?';
          if (!eraFetches.has(game.awayPitcher?.mlbamId ?? 0) && game.awayPitcher) {
            eraFetches.set(game.awayPitcher.mlbamId, fetchPitcherEra(game.awayPitcher.mlbamId));
          }
          const parkFactor = PARK_FACTORS[MLB_ID_TO_ABBREV[game.homeTeamId] ?? ''] ?? 1.0;
          // Pitcher park factor: pitching at hitter-friendly park hurts
          const parkAdj = 2 - parkFactor; // inverse: COL 1.13 → 0.87 adj
          allEntries.push({
            playerName: sp.name,
            mlbamId: sp.mlbamId,
            espnId: sp.espnId,
            date,
            isToday,
            isPast,
            opponentAbbr: oppAbbr,
            isHome: true,
            opponentPitcherName: game.awayPitcher?.fullName,
            opponentPitcherMlbamId: game.awayPitcher?.mlbamId,
            projectedPoints: sp.fpPerStart * parkAdj, // ERA adj applied after ERA fetch
            recommended: false,
            fpPerStart: sp.fpPerStart,
          });
          if (isPast) startsUsed++;
        }
      }
      // Check away pitcher
      if (game.awayPitcher) {
        const sp = byMlbamId.get(game.awayPitcher.mlbamId);
        if (sp) {
          const oppAbbr = MLB_ID_TO_ABBREV[game.homeTeamId] ?? '?';
          if (!eraFetches.has(game.homePitcher?.mlbamId ?? 0) && game.homePitcher) {
            eraFetches.set(game.homePitcher.mlbamId, fetchPitcherEra(game.homePitcher.mlbamId));
          }
          const parkFactor = PARK_FACTORS[oppAbbr] ?? 1.0;
          const parkAdj = 2 - parkFactor;
          allEntries.push({
            playerName: sp.name,
            mlbamId: sp.mlbamId,
            espnId: sp.espnId,
            date,
            isToday,
            isPast,
            opponentAbbr: oppAbbr,
            isHome: false,
            opponentPitcherName: game.homePitcher?.fullName,
            opponentPitcherMlbamId: game.homePitcher?.mlbamId,
            projectedPoints: sp.fpPerStart * parkAdj,
            recommended: false,
            fpPerStart: sp.fpPerStart,
          });
          if (isPast) startsUsed++;
        }
      }
    }
  }

  // Resolve ERA adjustments
  const eraMap = new Map<number, number>();
  await Promise.all(
    Array.from(eraFetches.entries()).map(async ([id, p]) => {
      const era = await p;
      if (era != null) eraMap.set(id, era);
    })
  );

  // Apply ERA adjustment: low-ERA opponent → harder start → reduce projected pts.
  // Factor: 1 + (era - leagueAvg) * 0.05, clamped to [0.75, 1.25].
  // e.g. facing a 2.00 ERA ace → ×0.89; facing a 6.00 ERA arm → ×1.09.
  const LEAGUE_AVG_ERA = 4.20;
  for (const entry of allEntries) {
    const oppId = entry.opponentPitcherMlbamId;
    if (!oppId) continue;
    const era = eraMap.get(oppId);
    if (era == null) continue;
    const eraAdj = Math.max(0.75, Math.min(1.25, 1 + (era - LEAGUE_AVG_ERA) * 0.05));
    entry.projectedPoints *= eraAdj;
    entry.opponentPitcherEra = era;
  }

  // Sort: past starts first (chronological), then future by projectedPoints desc
  const pastEntries = allEntries.filter(e => e.isPast).sort((a, b) => a.date.localeCompare(b.date));
  const futureEntries = allEntries.filter(e => !e.isPast).sort((a, b) => b.projectedPoints - a.projectedPoints);

  // Mark top (startsAllowed - startsUsed) future starts as recommended
  const startsRemaining = Math.max(0, SP_WEEKLY_CAP - startsUsed);
  futureEntries.slice(0, startsRemaining).forEach(e => { e.recommended = true; });

  // Past starts are always "recommended" (already happened)
  pastEntries.forEach(e => { e.recommended = true; });

  const entries = [...futureEntries, ...pastEntries];

  return {
    matchupWeek,
    weekStartDate: startDate,
    weekEndDate: endDate,
    startsUsed,
    startsAllowed: SP_WEEKLY_CAP,
    startsRemaining,
    entries,
  };
}
