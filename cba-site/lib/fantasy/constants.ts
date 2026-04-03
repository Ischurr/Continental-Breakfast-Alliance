// ============================================================
// lib/fantasy/constants.ts
//
// CBA league constants verified from:
//   - scripts/erosp/config.py (scoring weights, roster slots)
//   - CLAUDE.md (SP start cap, keeper rules, schedule)
// ============================================================

import type { LeagueScoring } from "./types";

// ----- CBA Scoring Settings -----
// Hitter: singles=2 (H+TB), doubles=3, triples=4, HRs=5
//         R=1, RBI=1, BB=1, K=-1, SB=2, CS=-1, HBP=1, GIDP=-0.25
// Pitcher: IP=3, HA=-1, ER=-2, BBA=-1, K=1, W=3, L=-3, SV=5, BS=-2, HD=3, QS=3
export const CBA_SCORING: LeagueScoring = {
  hitter: {
    H: 1,
    TB: 1,       // combined with H: single=2, double=3, triple=4, HR=5
    R: 1,
    RBI: 1,
    BB: 1,
    K: -1,
    SB: 2,
    CS: -1,
    HBP: 1,
    GIDP: -0.25,
  },
  pitcher: {
    IP: 3,       // per inning — backbone of pitcher scoring
    HA: -1,
    ER: -2,
    BBA: -1,
    KP: 1,
    W: 3,
    L: -3,
    SV: 5,
    BS: -2,
    HD: 3,
    QS: 3,
  },
};

// ----- Roster Slot Counts -----
// C:1, 1B:1, 2B:1, 3B:1, SS:1, MI:1, CI:1, OF:3, DH:1, UTIL:1, SP:6, RP:3
export const CBA_ROSTER_SLOTS: Record<string, number> = {
  C: 1,
  "1B": 1,
  "2B": 1,
  "3B": 1,
  SS: 1,
  MI: 1,
  CI: 1,
  OF: 3,
  DH: 1,
  UTIL: 1,
  SP: 6,
  RP: 3,
};

// ----- Pitcher Start Cap -----
export const CBA_PITCHER_START_CAP = 7; // max SP appearances counted as starts per week

// ----- Probability constants -----

// Fraction of days that have at least one MLB game (162 games / ~183 day season)
export const GAME_SCHEDULED_PROB = 0.89;

// For starting pitchers: probability of starting on any given scheduled game day
// A full-rotation starter starts every ~5 days ≈ 0.2 per day
export const SP_START_RATE_PER_GAME = 0.2;

// For relief pitchers: appearance probability per team game day
// Elite closers: ~0.40; typical setup: ~0.33; middle: ~0.28
export const RP_APPEARANCE_RATE_DEFAULT = 0.33;
export const RP_CLOSER_APPEARANCE_RATE = 0.40;
export const RP_MIDDLE_APPEARANCE_RATE = 0.28;

// Hitter playing-time probability (fraction of games they start)
export const HITTER_P_PLAY_DEFAULT = 0.85;

// ----- Projection volatility coefficients -----
// Standard deviation relative to mean for each role.
// Calibrated empirically: SPs have large per-start spread due to QS/W bonuses.
export const VOLATILITY_COEFF: Record<string, number> = {
  hitter: 1.00,            // per-game CV — high due to binary hit outcomes (0-4 with K vs HR+R+RBI)
  starting_pitcher: 0.75,  // per-start CV — log-normal right tail
  relief_pitcher: 1.10,    // per-appearance CV (high: 0 or big save/hold night)
};

// Minimum and maximum per-game multiplier for opponent quality adjustments
export const OPP_ADJ_MIN = 0.80;
export const OPP_ADJ_MAX = 1.20;

// ----- Simulation defaults -----
export const DEFAULT_SIMULATION_COUNT = 20_000;
export const BACKTEST_SIMULATION_COUNT = 10_000;

// ----- ESPN league / season -----
export const ESPN_LEAGUE_ID = "1562795298";
export const ESPN_SEASON_ID = "2026";

// Days of the week CBA matchup weeks run (Monday=0 through Sunday=6)
export const MATCHUP_WEEK_START_DAY = 1; // Monday (JS getDay: 0=Sun, 1=Mon, ..., 6=Sat)
export const MATCHUP_WEEK_LENGTH_DAYS = 7;

// Typical SP fp_per_start estimate when back-calculating from erosp_per_game:
// erosp_per_game ≈ p_start_per_day × fp_per_start
// For a full-rotation starter: p_start_per_day ≈ 0.2
// So fp_per_start ≈ erosp_per_game / 0.2 = erosp_per_game × 5
export const SP_DAYS_BETWEEN_STARTS = 5;

// ----- ESPN stat field IDs (for parsing mRoster responses) -----
// Only the ones we need for pitcher start counting
export const ESPN_STAT_GS = 34; // games started
export const ESPN_STAT_G = 33;  // games pitched
