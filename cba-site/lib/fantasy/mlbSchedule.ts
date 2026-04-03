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
}

// ---- In-memory cache (lives for the duration of one Node.js process) ----
// Key: `${startDate}:${endDate}`
const scheduleCache = new Map<string, Map<string, MLBGameSlot[]>>();

// ---- Main export ----

/**
 * Fetches all MLB regular-season games for the given date range in ONE API call.
 *
 * Returns a map from MLB team abbreviation (e.g. "NYY", "LAD") to the list
 * of games that team plays in the range, from that team's perspective.
 *
 * On any network failure, returns an empty map so callers can fall back
 * to the probabilistic game-count model.
 *
 * @param startDate - ISO date "YYYY-MM-DD" (inclusive)
 * @param endDate   - ISO date "YYYY-MM-DD" (inclusive)
 */
export async function fetchLeagueSchedule(
  startDate: string,
  endDate: string
): Promise<Map<string, MLBGameSlot[]>> {
  const cacheKey = `${startDate}:${endDate}`;
  const cached = scheduleCache.get(cacheKey);
  if (cached) return cached;

  const url =
    `https://statsapi.mlb.com/api/v1/schedule` +
    `?sportId=1&gameType=R` +
    `&startDate=${startDate}&endDate=${endDate}` +
    `&fields=dates,date,games,teams,home,away,team,abbreviation`;

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
            home: { team: { abbreviation: string } };
            away: { team: { abbreviation: string } };
          };
        }>;
      }>;
    };

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

        addSlot(homeAbbr, {
          date: dateEntry.date,
          isHome: true,
          opponentAbbr: awayAbbr,
          parkFactor: pf,
        });
        addSlot(awayAbbr, {
          date: dateEntry.date,
          isHome: false,
          opponentAbbr: homeAbbr,
          parkFactor: pf,
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
