// ============================================================
// lib/fantasy/mlbSchedule.ts
//
// Fetches the real MLB game schedule from the public MLB Stats API.
// Used by the win-probability engine to give each player accurate
// remaining-game counts and per-game park factor context.
//
// One API call fetches ALL games league-wide for the date range.
// Results are cached in memory for the duration of a job run.
//
// Without this: every player gets GAME_SCHEDULED_PROB (0.89) per remaining
// day regardless of their team's actual schedule.
//
// With this: players with an off day get 0 games; doubleheader days get 2;
// and each game carries the home ballpark's park factor.
// ============================================================

// ---- Park factors ----
// Runs-based park factor relative to league average (1.0).
// Source: FanGraphs 5-year regressed park factors (2026 season).
// >1 = hitter-friendly; <1 = pitcher-friendly.
export const PARK_FACTORS: Record<string, number> = {
  COL: 1.13, // Coors Field
  BOS: 1.07, // Fenway Park
  CIN: 1.06, // Great American Ball Park
  CHC: 1.05, // Wrigley Field
  NYY: 1.04, // Yankee Stadium
  TEX: 1.03, // Globe Life Field
  ATL: 1.03, // Truist Park
  PHI: 1.02, // Citizens Bank Park
  BAL: 1.01, // Camden Yards
  HOU: 1.01, // Minute Maid Park
  MIL: 1.00, // American Family Field
  STL: 1.00, // Busch Stadium
  DET: 1.00, // Comerica Park
  MIA: 0.99, // loanDepot park
  CLE: 0.99, // Progressive Field
  MIN: 0.99, // Target Field
  NYM: 0.98, // Citi Field
  TOR: 0.98, // Rogers Centre
  TB:  0.97, // Tropicana Field
  LAD: 0.97, // Dodger Stadium
  SEA: 0.97, // T-Mobile Park
  ARI: 0.97, // Chase Field
  KC:  0.96, // Kauffman Stadium
  SD:  0.96, // Petco Park
  PIT: 0.96, // PNC Park
  CWS: 0.96, // Guaranteed Rate Field
  SF:  0.95, // Oracle Park
  LAA: 0.95, // Angel Stadium
  OAK: 0.95, // Sutter Health Park (Sacramento)
  WSH: 0.94, // Nationals Park
  // aliases
  ATH: 0.95, // A's (Sacramento)
};

// ---- Types ----

/** One MLB game from the schedule, from the perspective of one team. */
export interface MLBGameSlot {
  /** ISO date: "2026-04-03" */
  date: string;
  /** True if this team is the home team (plays in their own park) */
  isHome: boolean;
  /** The opposing team's abbreviation */
  opponentAbbr: string;
  /**
   * The home ballpark's park factor.
   * >1 favors hitters; <1 favors pitchers.
   * Used as MLBOpponentContext.parkFactor in the simulation.
   */
  parkFactor: number;
  /**
   * Strength of the opposing probable pitcher.
   * 0–1 scale: 0.5 = league average, <0.5 = weaker pitcher (good for hitters),
   * >0.5 = stronger pitcher (bad for hitters).
   * Formula: clamp(0.5 + (ERA - 4.20) * 0.05, 0.1, 0.9)
   * Only populated when a probable starter is announced.
   */
  opponentVsPositionStrength?: number;
  /**
   * Proxy for Vegas-implied runs scored by THIS team (home team's offense).
   * Derived from EROSP offensive strength, not actual betting markets.
   * Range: ~3.5–6.0
   */
  vegasImpliedRuns?: number;
  /**
   * Proxy for Vegas-implied runs allowed by THIS team (i.e., opponent's offense).
   * Used for pitcher projections.
   * Range: ~3.5–6.0
   */
  vegasImpliedAllowedRuns?: number;
}

// ---- In-memory cache (lives for the duration of one Node.js process) ----
// Key: `${startDate}:${endDate}`
const scheduleCache = new Map<string, Map<string, MLBGameSlot[]>>();

// ---- Pitcher stat cache (keyed by MLB person ID) ----
// Avoids redundant API calls when the same pitcher appears in multiple games.
const pitcherEraCache = new Map<number, number | null>();

// League-average ERA used for opponent strength formula.
const LEAGUE_AVG_ERA = 4.20;

/**
 * Fetches 2026 season ERA for a pitcher from the MLB Stats API.
 * Returns null if stats are not available (e.g. new pitcher, API error).
 * Results are cached in memory.
 */
async function fetchPitcherEra(personId: number): Promise<number | null> {
  if (pitcherEraCache.has(personId)) return pitcherEraCache.get(personId)!;

  try {
    const url =
      `https://statsapi.mlb.com/api/v1/people/${personId}/stats` +
      `?stats=season&season=2026&group=pitching&sportId=1`;

    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (!resp.ok) {
      pitcherEraCache.set(personId, null);
      return null;
    }

    const data = await resp.json() as {
      stats?: Array<{
        splits?: Array<{
          stat?: { era?: string };
        }>;
      }>;
    };

    const era = data.stats?.[0]?.splits?.[0]?.stat?.era;
    const eraNum = era != null ? parseFloat(era) : null;
    const result = eraNum != null && isFinite(eraNum) ? eraNum : null;
    pitcherEraCache.set(personId, result);
    return result;
  } catch {
    pitcherEraCache.set(personId, null);
    return null;
  }
}

/**
 * Converts a pitcher's ERA to an opponentVsPositionStrength value.
 * 0.5 = league average, <0.5 = weaker (good for hitters), >0.5 = stronger.
 * Formula: clamp(0.5 + (ERA - leagueAvg) * 0.05, 0.1, 0.9)
 */
function eraToOpponentStrength(era: number): number {
  const raw = 0.5 + (era - LEAGUE_AVG_ERA) * 0.05;
  return Math.max(0.1, Math.min(0.9, raw));
}

// ---- Main export ----

/**
 * Fetches all MLB regular-season games for the given date range in ONE API call.
 * Also hydrates probable starting pitchers and fetches their season ERA to
 * compute per-game opponentVsPositionStrength values.
 *
 * Returns a map from MLB team abbreviation (e.g. "NYY", "LAD") to the list
 * of games that team plays in the range, from that team's perspective.
 *
 * On any network failure, returns an empty map so callers can fall back
 * to the probabilistic game-count model.
 *
 * @param startDate - ISO date "YYYY-MM-DD" (inclusive)
 * @param endDate   - ISO date "YYYY-MM-DD" (inclusive)
 * @param teamOffensiveEROSP - optional map of MLB team abbr → avg hitter EROSP/game,
 *                             used to populate vegasImpliedRuns proxy values.
 */
export async function fetchLeagueSchedule(
  startDate: string,
  endDate: string,
  teamOffensiveEROSP?: Record<string, number>
): Promise<Map<string, MLBGameSlot[]>> {
  const cacheKey = `${startDate}:${endDate}`;
  const cached = scheduleCache.get(cacheKey);
  if (cached) return cached;

  // Hydrate probable pitcher IDs in the schedule request.
  const url =
    `https://statsapi.mlb.com/api/v1/schedule` +
    `?sportId=1&gameType=R` +
    `&startDate=${startDate}&endDate=${endDate}` +
    `&hydrate=probablePitcher` +
    `&fields=dates,date,games,teams,home,away,team,abbreviation,probablePitcher,id,fullName`;

  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json() as {
      dates?: Array<{
        date: string;
        games?: Array<{
          teams: {
            home: {
              team: { abbreviation: string };
              probablePitcher?: { id: number; fullName: string };
            };
            away: {
              team: { abbreviation: string };
              probablePitcher?: { id: number; fullName: string };
            };
          };
        }>;
      }>;
    };

    // Collect all unique probable pitcher IDs for parallel ERA fetching.
    const pitcherIds = new Set<number>();
    for (const dateEntry of data.dates ?? []) {
      for (const game of dateEntry.games ?? []) {
        const homeId = game.teams.home.probablePitcher?.id;
        const awayId = game.teams.away.probablePitcher?.id;
        if (homeId) pitcherIds.add(homeId);
        if (awayId) pitcherIds.add(awayId);
      }
    }

    // Fetch all pitcher ERAs in parallel (cached after first call).
    if (pitcherIds.size > 0) {
      await Promise.all([...pitcherIds].map((id) => fetchPitcherEra(id)));
      console.log(`[mlbSchedule] Fetched ERA for ${pitcherIds.size} probable pitchers`);
    }

    // Compute league-average EROSP for implied runs normalization.
    let leagueAvgEROSP = 2.5; // fallback if no data
    if (teamOffensiveEROSP) {
      const vals = Object.values(teamOffensiveEROSP).filter((v) => v > 0);
      if (vals.length > 0) {
        leagueAvgEROSP = vals.reduce((s, v) => s + v, 0) / vals.length;
      }
    }

    const result = new Map<string, MLBGameSlot[]>();

    function addSlot(abbr: string, slot: MLBGameSlot) {
      if (!abbr) return;
      const list = result.get(abbr) ?? [];
      list.push(slot);
      result.set(abbr, list);
    }

    for (const dateEntry of data.dates ?? []) {
      for (const game of dateEntry.games ?? []) {
        const homeAbbr = game.teams.home.team.abbreviation ?? "";
        const awayAbbr = game.teams.away.team.abbreviation ?? "";
        const pf = PARK_FACTORS[homeAbbr] ?? 1.0;

        // Opponent strength: from the batter's perspective, the OPPOSING pitcher is what matters.
        // Home hitters face the away probable pitcher; away hitters face the home probable pitcher.
        const homePitcherId = game.teams.home.probablePitcher?.id;
        const awayPitcherId = game.teams.away.probablePitcher?.id;

        const homePitcherEra = homePitcherId != null ? pitcherEraCache.get(homePitcherId) ?? null : null;
        const awayPitcherEra = awayPitcherId != null ? pitcherEraCache.get(awayPitcherId) ?? null : null;

        // Away hitters face home pitcher → home pitcher ERA = opponentStrength for away team
        const awayHitterOppStrength =
          homePitcherEra != null ? eraToOpponentStrength(homePitcherEra) : undefined;
        // Home hitters face away pitcher → away pitcher ERA = opponentStrength for home team
        const homeHitterOppStrength =
          awayPitcherEra != null ? eraToOpponentStrength(awayPitcherEra) : undefined;

        // Vegas proxy implied runs from EROSP offensive strength.
        // Scale factor: 0.8 per erosp_per_game unit above/below league average; clamped [3.5, 6.0].
        const SCALE_FACTOR = 0.8;
        function impliedRuns(teamAbbr: string): number | undefined {
          if (!teamOffensiveEROSP) return undefined;
          const teamEROSP = teamOffensiveEROSP[teamAbbr];
          if (teamEROSP == null) return undefined;
          const raw = 4.3 + (teamEROSP - leagueAvgEROSP) * SCALE_FACTOR;
          return Math.max(3.5, Math.min(6.0, raw));
        }

        addSlot(homeAbbr, {
          date: dateEntry.date,
          isHome: true,
          opponentAbbr: awayAbbr,
          parkFactor: pf,
          opponentVsPositionStrength: homeHitterOppStrength,
          vegasImpliedRuns: impliedRuns(homeAbbr),
          vegasImpliedAllowedRuns: impliedRuns(awayAbbr),
        });
        addSlot(awayAbbr, {
          date: dateEntry.date,
          isHome: false,
          opponentAbbr: homeAbbr,
          parkFactor: pf,
          opponentVsPositionStrength: awayHitterOppStrength,
          vegasImpliedRuns: impliedRuns(awayAbbr),
          vegasImpliedAllowedRuns: impliedRuns(homeAbbr),
        });
      }
    }

    scheduleCache.set(cacheKey, result);
    console.log(
      `[mlbSchedule] Fetched ${data.dates?.length ?? 0} days, ` +
      `${result.size} teams (${startDate} → ${endDate})`
    );
    return result;
  } catch (e) {
    console.warn("[mlbSchedule] Schedule fetch failed, using probabilistic fallback:", e);
    const empty = new Map<string, MLBGameSlot[]>();
    scheduleCache.set(cacheKey, empty);
    return empty;
  }
}
