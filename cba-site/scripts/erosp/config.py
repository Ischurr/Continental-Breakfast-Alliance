"""
League configuration and scoring constants for EROSP computation.

CBA League Scoring:
  Hitters: H+1, R+1, TB+1, RBI+1, BB+1, IBB+1, K-1, SB+2, CS-1, GIDP-0.25
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
}

# ---------------------------------------------------------------------------
# League settings
# ---------------------------------------------------------------------------
LEAGUE_TEAMS     = 10
SP_WEEKLY_CAP    = 7
RP_DAILY_STARTS  = 3   # start top 3 RPs each day

# ---------------------------------------------------------------------------
# Historical data weighting
# ---------------------------------------------------------------------------
BLEND_WEIGHTS_3YR = [0.50, 0.30, 0.20]
BLEND_WEIGHTS_2YR = [0.60, 0.40]
MEAN_REGRESSION   = 0.15   # pull 1-year samples 15% toward league mean

# ---------------------------------------------------------------------------
# Age curve
# ---------------------------------------------------------------------------
AGE_PEAK       = 28.0
AGE_CURVE_RATE = 0.006   # ±0.6% per year from peak
AGE_MOD_MIN    = 0.90
AGE_MOD_MAX    = 1.10

# ---------------------------------------------------------------------------
# Statcast adjustments
# ---------------------------------------------------------------------------
XWOBA_DAMP      = 0.3   # (player_xwOBA / lg_xwOBA)^0.3 — dampened multiplicative adj
XWOBA_LG_AVG    = 0.320  # approximate MLB league-average xwOBA

# ---------------------------------------------------------------------------
# Startability sigmoid
# ---------------------------------------------------------------------------
SIGMOID_TAU = 0.3

# ---------------------------------------------------------------------------
# Season/playing-time defaults (used pre-season or for players with no data)
# ---------------------------------------------------------------------------
DEFAULT_P_PLAY_HITTER = 0.85   # fraction of games a lineup starter plays
DEFAULT_PA_PER_GAME   = 4.0    # plate appearances per game for a lineup starter
DEFAULT_P_PLAY_BENCH  = 0.35   # non-starter / platoon player
DEFAULT_IP_PER_START  = 5.5    # IP per start for average SP
DEFAULT_P_APPEAR_RP   = 0.35   # RP appearance probability per team game
DEFAULT_IP_PER_APP    = 0.67   # RP IP per appearance (~2 IP every 3 games)

# Games per rotation cycle (5-man rotation)
ROTATION_DAYS       = 5.0
FULL_SEASON_GAMES   = 162

# Minimum qualifying thresholds for rate computations
MIN_PA_QUALIFIER  = 100   # minimum PA for per-PA rate to be considered reliable
MIN_IP_QUALIFIER  = 20    # minimum IP for per-IP rate

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
