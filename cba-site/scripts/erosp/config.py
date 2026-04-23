"""
League configuration and scoring constants for EROSP computation.

CBA League Scoring:
  Hitters: H+1, R+1, TB+1, RBI+1, BB+1, IBB+1, HBP+1, K-1, SB+2, CS-1, GIDP-0.25
  Pitchers: IP+3, H-1, ER-2, BB-1, K+1, W+3, L-3, SV+5, BS-2, HD+3, QS+3
  (Ignored in v1: GWRBI, CYC, OFAST, DPT, PKO, E, NH, PG, CG, SO bonus, GWRBI)
"""

from typing import Dict, List

# ---------------------------------------------------------------------------
# Per-event scoring values
# ---------------------------------------------------------------------------
# Note: "single" = H(1) + TB(1) = 2 pts total, "double" = H(1) + TB(2) = 3, etc.
SCORING: Dict[str, float] = {
    # Hitter per-event
    "single":  2.0,   # H(1) + TB(1)
    "double":  3.0,   # H(1) + TB(2)
    "triple":  4.0,   # H(1) + TB(3)
    "hr":      5.0,   # H(1) + TB(4)
    "r":       1.0,
    "rbi":     1.0,
    "bb":      1.0,   # includes IBB (lumped together)
    "k":      -1.0,
    "sb":      2.0,
    "cs":     -1.0,
    "gidp":   -0.25,
    "hbp":     1.0,   # hit by pitch (+1 pt, same as BB)
    # Pitcher per-event
    "ip":      3.0,   # per full inning
    "ha":     -1.0,   # H allowed
    "er":     -2.0,   # earned run
    "bba":    -1.0,   # BB allowed
    "kp":      1.0,   # K by pitcher
    "w":       3.0,
    "l":      -3.0,
    "sv":      5.0,
    "bs":     -2.0,
    "hd":      3.0,   # hold
    "qs":      3.0,   # quality start
}

# ---------------------------------------------------------------------------
# Roster slot counts (per position across all 10 teams)
# Determines replacement-level thresholds.
# ---------------------------------------------------------------------------
HITTER_SLOTS: Dict[str, int] = {
    "C":    10,   # 1 per team
    "1B":   10,
    "2B":   10,
    "3B":   10,
    "SS":   10,
    "MI":   10,   # flex 2B/SS slot
    "CI":   10,   # flex 1B/3B slot
    "OF":   30,   # 3 per team (LF + CF + RF)
    "DH":   10,
    "UTIL": 10,   # any non-pitcher
}

PITCHER_SLOTS: Dict[str, int] = {
    "SP": 60,   # 6 per team
    "RP": 30,   # 3 per team
}

# Which roster slots can a given MLB position fill?
POSITION_ELIGIBILITY: Dict[str, List[str]] = {
    "C":   ["C", "UTIL"],
    "1B":  ["1B", "CI", "UTIL"],
    "2B":  ["2B", "MI", "UTIL"],
    "3B":  ["3B", "CI", "UTIL"],
    "SS":  ["SS", "MI", "UTIL"],
    "OF":  ["OF", "UTIL"],
    "LF":  ["OF", "UTIL"],
    "CF":  ["OF", "UTIL"],
    "RF":  ["OF", "UTIL"],
    "DH":  ["DH", "UTIL"],
    "SP":  ["SP"],
    "RP":  ["RP"],
    "P":   ["SP", "RP"],    # generic pitcher — treat as SP/RP based on role
    "TWP": ["SP", "OF", "UTIL"],  # two-way player (Ohtani)
    "IF":  ["1B", "2B", "3B", "SS", "MI", "CI", "UTIL"],  # FanGraphs generic infield
    "MIF": ["2B", "SS", "MI", "UTIL"],   # middle infield
    "CIF": ["1B", "3B", "CI", "UTIL"],   # corner infield
}

# ---------------------------------------------------------------------------
# League settings
# ---------------------------------------------------------------------------
LEAGUE_TEAMS     = 10
SP_WEEKLY_CAP    = 7
RP_DAILY_STARTS  = 3   # start top 3 RPs each day

# Replacement level pool multiplier.
# We use the (N * MULTIPLIER)-th best player rather than the N-th best.
# In a keeper league ~260 of ~900 MLB players are drafted, so the true
# waiver-wire replacement player sits deeper in the pool than slot count alone
# implies.  1.4 ≈ using the 28th-best SS (10+10 slots × 1.4) instead of 20th.
REPLACEMENT_POOL_MULTIPLIER = 1.4

# ---------------------------------------------------------------------------
# Historical data weighting
# ---------------------------------------------------------------------------
BLEND_WEIGHTS_3YR = [0.60, 0.25, 0.15]
BLEND_WEIGHTS_2YR = [0.60, 0.40]
BLEND_WEIGHTS_5YR = [0.50, 0.30, 0.20, 0.05, 0.05]   # Fix 2: extended lookback (y4/y5 low-weight)
# Fix I: when current-season YTD data is included as y0, it gets this base weight before
# PA/IP sample-size scaling (which will discount it heavily early in the season).
BLEND_WEIGHT_YTD  = 0.45
MEAN_REGRESSION   = 0.15   # pull 1-year samples 15% toward league mean

# ---------------------------------------------------------------------------
# Age curve  (asymmetric; research-based)
# ---------------------------------------------------------------------------
AGE_PEAK                   = 27.0   # hitters and pitchers both peak ~27
AGE_GROWTH_RATE            = 0.009  # +0.9%/yr below peak
AGE_DECLINE_EARLY          = 0.010  # -1.0%/yr from peak through 32
AGE_DECLINE_LATE           = 0.025  # -2.5%/yr after 32 (steeper attrition)
AGE_DECLINE_FAST_THRESHOLD = 32.0   # age where decline rate accelerates
AGE_PITCHER_DECLINE_MULT   = 1.4    # pitchers decline ~40% faster post-peak
AGE_MOD_MIN                = 0.65   # floor (prevents absurd projections for old players)
AGE_MOD_MAX                = 1.15   # ceiling

# ---------------------------------------------------------------------------
# Statcast adjustments
# ---------------------------------------------------------------------------
XWOBA_DAMP      = 0.5   # (player_xwOBA / lg_xwOBA)^0.5 — dampened multiplicative adj
                        # raised from 0.3: xwOBA is meaningfully predictive; 0.3 was too flat
XWOBA_LG_AVG    = 0.320  # approximate MLB league-average xwOBA

# ---------------------------------------------------------------------------
# Startability sigmoid
# ---------------------------------------------------------------------------
SIGMOID_TAU = 0.3

# ---------------------------------------------------------------------------
# Season/playing-time defaults (used pre-season or for players with no data)
# ---------------------------------------------------------------------------
DEFAULT_P_PLAY_HITTER       = 0.85   # fraction of games a lineup starter plays
DEFAULT_PA_PER_GAME         = 4.0    # plate appearances per game for a lineup starter
DEFAULT_P_PLAY_BENCH        = 0.35   # non-starter / platoon player
DEFAULT_P_PLAY_CATCHER      = 0.74   # Fix 4: catchers play ~120/162 games
DEFAULT_PA_PER_GAME_CATCHER = 3.6    # Fix 4: catchers bat 7th-8th (~3.6 PA/game)
DEFAULT_IP_PER_START        = 5.8    # Fix 5: IP per start (real MLB avg 5.7–5.9; was 5.5)
DEFAULT_P_APPEAR_RP   = 0.35   # RP appearance probability per team game
DEFAULT_IP_PER_APP    = 0.67   # RP IP per appearance (~2 IP every 3 games)

# Games per rotation cycle (5-man rotation)
ROTATION_DAYS       = 5.0
FULL_SEASON_GAMES   = 162

# Minimum qualifying thresholds for rate computations
MIN_PA_QUALIFIER  = 100   # minimum PA for per-PA rate to be considered reliable
MIN_IP_QUALIFIER  = 20    # minimum IP for per-IP rate

# ---------------------------------------------------------------------------
# Sample-size weighting for multi-year blending
# ---------------------------------------------------------------------------
# Year weights (50/30/20) are scaled by actual_pa / PA_FULL_SEASON before renorm.
# Single-year samples get more regression when PA is low.
PA_FULL_SEASON        = 600    # PA threshold for full year-weight (hitters)
IP_FULL_SEASON        = 150    # IP threshold for full year-weight (pitchers)
MEAN_REGRESSION_HIGH  = 0.15   # regression at full PA (600)
MEAN_REGRESSION_LOW   = 0.35   # regression at minimum PA (200)

# ---------------------------------------------------------------------------
# Park factors (5-year regressed, from generate_projections.py)
# 1.00 = neutral; >1.00 = hitter-friendly; <1.00 = pitcher-friendly
# ---------------------------------------------------------------------------
PARK_FACTORS: Dict[str, float] = {
    # Hitter-friendly
    "COL": 1.15, "CIN": 1.08, "TEX": 1.05, "BOS": 1.04,
    "MIL": 1.03, "ARI": 1.03, "CHC": 1.02, "PHI": 1.02,
    "ATL": 1.01, "HOU": 1.01,
    # Neutral
    "NYY": 1.00, "LAD": 1.00, "STL": 0.99, "TB":  0.98,
    "CLE": 0.98,
    # Pitcher-friendly
    "OAK": 0.97, "KC":  0.97, "DET": 0.97, "WSH": 0.97,
    "PIT": 0.97, "SD":  0.96, "LAA": 0.96, "MIN": 0.96,
    "SEA": 0.96, "TOR": 0.96, "BAL": 0.95, "NYM": 0.95,
    "CWS": 0.95, "SF":  0.94, "MIA": 0.93,
}

TEAM_NORMALIZE: Dict[str, str] = {
    "WSN": "WSH", "CHW": "CWS", "KCR": "KC", "SFG": "SF",
    "SDP": "SD",  "TBR": "TB",  "ANA": "LAA", "FLA": "MIA",
}

# MLB team ID → abbreviation (from StatsAPI)
MLB_TEAM_ID_TO_ABBREV: Dict[int, str] = {
    108: "LAA", 109: "ARI", 110: "BAL", 111: "BOS", 112: "CHC",
    113: "CIN", 114: "CLE", 115: "COL", 116: "DET", 117: "HOU",
    118: "KC",  119: "LAD", 120: "WSH", 121: "NYM", 133: "OAK",
    134: "PIT", 135: "SD",  136: "SEA", 137: "SF",  138: "STL",
    139: "TB",  140: "TEX", 141: "TOR", 142: "MIN", 143: "PHI",
    144: "ATL", 145: "CWS", 146: "MIA", 147: "NYY", 158: "MIL",
}
