#!/usr/bin/env python3
"""
Fantasy Baseball Projection System
===================================
Generates projected fantasy points for the upcoming MLB season using:
  - Weighted 3-year historical performance
  - Age adjustments (peak = 28)
  - Park factors
  - Statcast expected stats (xwOBA regression)
  - Sprint speed metrics

Usage:
    python generate_projections.py

Requirements:
    pip install pybaseball pandas numpy matplotlib requests
"""

import os
import sys
import time
import datetime
import warnings
from pathlib import Path

import pandas as pd
import numpy as np

warnings.filterwarnings("ignore")

try:
    import requests
except ImportError:
    print("ERROR: requests not installed. Run: pip install requests")
    sys.exit(1)

try:
    import pybaseball
    from pybaseball import (
        batting_stats,
        statcast_batter_expected_stats,
        statcast_sprint_speed,
        chadwick_register,
    )
    pybaseball.cache.enable()
except ImportError:
    print("ERROR: pybaseball not installed. Run: pip install pybaseball pandas numpy")
    sys.exit(1)


# ──────────────────────────────────────────────────────────────────────────────
# DYNAMIC YEAR LOGIC
# ──────────────────────────────────────────────────────────────────────────────

today = datetime.date.today()
current_year = today.year
current_month = today.month

if current_month >= 11:          # November / December → project next year
    TARGET_SEASON = current_year + 1
    HISTORICAL_YEARS = [current_year, current_year - 1, current_year - 2]
else:                            # January – October → project current year
    TARGET_SEASON = current_year
    HISTORICAL_YEARS = [current_year - 1, current_year - 2, current_year - 3]

Y1, Y2, Y3 = HISTORICAL_YEARS   # Y1 = most recent completed, Y3 = oldest

print(f"\n{'='*65}")
print(f"  Fantasy Baseball Projection System")
print(f"{'='*65}")
print(f"  Projecting for {TARGET_SEASON} season using data from {Y1}, {Y2}, and {Y3}.")
print(f"  Run date: {today.strftime('%B %d, %Y')}")
print(f"{'='*65}\n")


# ──────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ──────────────────────────────────────────────────────────────────────────────

# Fantasy scoring weights — adjust here without touching core logic
SCORING = {
    "single":      1.0,
    "double":      2.0,
    "triple":      3.0,
    "home_run":    4.0,
    "rbi":         1.0,
    "run":         1.0,
    "stolen_base": 2.0,
    "walk":        1.0,
    "strikeout":  -0.5,
}

# 5-year regressed park factors (runs). 1.00 = neutral.
# Source: Fangraphs Park Factors (2024 data, most recent available)
PARK_FACTORS = {
    # Hitter-friendly
    "COL": 1.15,  "CIN": 1.08,  "TEX": 1.05,  "BOS": 1.04,
    "MIL": 1.03,  "ARI": 1.03,  "CHC": 1.02,  "PHI": 1.02,
    "ATL": 1.01,  "HOU": 1.01,
    # Neutral
    "NYY": 1.00,  "LAD": 1.00,  "STL": 0.99,  "TB":  0.98,
    "CLE": 0.98,
    # Pitcher-friendly
    "OAK": 0.97,  "KC":  0.97,  "DET": 0.97,  "WSH": 0.97,
    "PIT": 0.97,  "SD":  0.96,  "LAA": 0.96,  "MIN": 0.96,
    "SEA": 0.96,  "TOR": 0.96,  "BAL": 0.95,  "NYM": 0.95,
    "CWS": 0.95,  "SF":  0.94,  "MIA": 0.93,
}

# Team abbreviation normalization (Fangraphs → PARK_FACTORS keys)
TEAM_NORMALIZE = {
    "WSN": "WSH", "CHW": "CWS", "KCR": "KC", "SFG": "SF",
    "SDP": "SD",  "TBR": "TB",  "ANA": "LAA",
}

# Pitcher fantasy scoring — adjust to match your league settings
PITCHER_SCORING = {
    "strikeout":      2.0,
    "inning_pitched": 3.0,   # per full inning pitched
    "walk":          -1.0,
    "hit_allowed":   -1.0,
    "earned_run":    -2.0,
    "win":            5.0,
    "save":           5.0,
}

LEAGUE_AVG_FP       = 260.0  # Approximate average fantasy points for a qualified batter
LEAGUE_AVG_PITCH_FP = 280.0  # Approximate average fantasy points for a qualified pitcher
MIN_PA  = 200                # Minimum PA qualifier for batting_stats() pull
MIN_IP  = 30                 # Minimum IP qualifier for pitching_stats() pull

# ──────────────────────────────────────────────────────────────────────────────
# PATHS
# ──────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
CACHE_DIR  = SCRIPT_DIR / "projection_cache"
CACHE_DIR.mkdir(exist_ok=True)


# ──────────────────────────────────────────────────────────────────────────────
# UTILITY FUNCTIONS
# ──────────────────────────────────────────────────────────────────────────────

def retry_fetch(func, *args, max_retries=3, delay=3, label="", **kwargs):
    """Call func(*args, **kwargs) with retries and delay on failure."""
    for attempt in range(max_retries):
        try:
            result = func(*args, **kwargs)
            if result is not None:
                return result
        except Exception as exc:
            if attempt < max_retries - 1:
                print(f"    Attempt {attempt+1} failed ({exc}). Retrying in {delay}s…")
                time.sleep(delay)
            else:
                print(f"    All {max_retries} attempts failed for {label or func.__name__}: {exc}")
    return None


def cached_fetch(cache_path: Path, fetch_func, *args, label="", **kwargs):
    """Load DataFrame from CSV cache if it exists, otherwise fetch and cache."""
    if cache_path.exists():
        print(f"    Cache hit  → {cache_path.name}")
        return pd.read_csv(cache_path, low_memory=False)
    print(f"    Fetching   → {cache_path.name}")
    df = retry_fetch(fetch_func, *args, label=label, **kwargs)
    if df is not None and not df.empty:
        df.to_csv(cache_path, index=False)
    return df


def normalize_team(team_raw) -> str:
    t = str(team_raw).strip().upper()
    return TEAM_NORMALIZE.get(t, t)


def calc_fantasy_points(df: pd.DataFrame) -> pd.Series:
    """Compute fantasy points row-by-row from standard batting columns."""
    h   = pd.to_numeric(df.get("H",  0), errors="coerce").fillna(0)
    d   = pd.to_numeric(df.get("2B", 0), errors="coerce").fillna(0)
    t   = pd.to_numeric(df.get("3B", 0), errors="coerce").fillna(0)
    hr  = pd.to_numeric(df.get("HR", 0), errors="coerce").fillna(0)
    rbi = pd.to_numeric(df.get("RBI",0), errors="coerce").fillna(0)
    r   = pd.to_numeric(df.get("R",  0), errors="coerce").fillna(0)
    sb  = pd.to_numeric(df.get("SB", 0), errors="coerce").fillna(0)
    bb  = pd.to_numeric(df.get("BB", 0), errors="coerce").fillna(0)
    # pybaseball uses 'SO' in most versions; fall back to 'K'
    so_col = "SO" if "SO" in df.columns else "K"
    so  = pd.to_numeric(df.get(so_col, 0), errors="coerce").fillna(0)

    singles = (h - d - t - hr).clip(lower=0)

    return (
        singles * SCORING["single"]      +
        d       * SCORING["double"]      +
        t       * SCORING["triple"]      +
        hr      * SCORING["home_run"]    +
        rbi     * SCORING["rbi"]         +
        r       * SCORING["run"]         +
        sb      * SCORING["stolen_base"] +
        bb      * SCORING["walk"]        +
        so      * SCORING["strikeout"]
    )


def calc_pitcher_fantasy_points(df: pd.DataFrame) -> pd.Series:
    """Compute fantasy points from standard pitching stat columns."""
    ip  = pd.to_numeric(df.get("IP",  0), errors="coerce").fillna(0)
    so_col = "SO" if "SO" in df.columns else "K"
    so  = pd.to_numeric(df.get(so_col, 0), errors="coerce").fillna(0)
    bb  = pd.to_numeric(df.get("BB",  0), errors="coerce").fillna(0)
    h   = pd.to_numeric(df.get("H",   0), errors="coerce").fillna(0)
    er  = pd.to_numeric(df.get("ER",  0), errors="coerce").fillna(0)
    w   = pd.to_numeric(df.get("W",   0), errors="coerce").fillna(0)
    sv  = pd.to_numeric(df.get("SV",  0), errors="coerce").fillna(0)
    return (
        ip  * PITCHER_SCORING["inning_pitched"] +
        so  * PITCHER_SCORING["strikeout"]      +
        bb  * PITCHER_SCORING["walk"]           +
        h   * PITCHER_SCORING["hit_allowed"]    +
        er  * PITCHER_SCORING["earned_run"]     +
        w   * PITCHER_SCORING["win"]            +
        sv  * PITCHER_SCORING["save"]
    )


# ──────────────────────────────────────────────────────────────────────────────
# STEP 1 — CHADWICK REGISTER (cross-ID mapping + birthdates)
# ──────────────────────────────────────────────────────────────────────────────

print("─── Step 1: Chadwick player registry ───────────────────────────")
chad_cache = CACHE_DIR / "chadwick_register.csv"
chad_raw = cached_fetch(chad_cache, chadwick_register, label="chadwick_register")

if chad_raw is None or chad_raw.empty:
    print("  ERROR: Could not load Chadwick register. Exiting.")
    sys.exit(1)

id_map = chad_raw[["key_fangraphs", "key_mlbam"]].copy().dropna(subset=["key_fangraphs", "key_mlbam"])
id_map["key_fangraphs"] = pd.to_numeric(id_map["key_fangraphs"], errors="coerce")
id_map["key_mlbam"]     = pd.to_numeric(id_map["key_mlbam"],     errors="coerce")
id_map = id_map.dropna(subset=["key_fangraphs", "key_mlbam"])
id_map["key_fangraphs"] = id_map["key_fangraphs"].astype(int)
id_map["key_mlbam"]     = id_map["key_mlbam"].astype(int)
id_map = id_map.drop_duplicates(subset=["key_fangraphs"])
print(f"  {len(id_map):,} player ID mappings loaded.\n")


def fetch_player_info(mlbam_ids: list[int]) -> pd.DataFrame:
    """Fetch birth dates + primary position from MLB Stats API in batches of 200.
    Cache is incrementally updated — new IDs are fetched and merged in."""
    cache_path = CACHE_DIR / "mlb_player_info.csv"

    # Load existing cache
    if cache_path.exists():
        cached = pd.read_csv(cache_path)
        cached_ids = set(cached["mlbam_id"].dropna().astype(int).tolist())
        new_ids = [x for x in mlbam_ids if x not in cached_ids]
        if not new_ids:
            print("    Cache hit  → mlb_player_info.csv")
            return cached
        print(f"    Cache hit  → mlb_player_info.csv; fetching {len(new_ids):,} new IDs…")
    else:
        cached = pd.DataFrame()
        new_ids = mlbam_ids
        print(f"    Fetching player info for {len(new_ids):,} players from MLB Stats API…")

    rows = []
    batch_size = 200
    for i in range(0, len(new_ids), batch_size):
        batch = new_ids[i:i + batch_size]
        ids_str = ",".join(str(x) for x in batch)
        url = (f"https://statsapi.mlb.com/api/v1/people?personIds={ids_str}"
               f"&fields=people,id,birthDate,primaryPosition,abbreviation")
        try:
            resp = requests.get(url, timeout=15)
            if resp.status_code == 200:
                for person in resp.json().get("people", []):
                    row: dict = {"mlbam_id": person["id"]}
                    bd = person.get("birthDate", "")
                    if bd:
                        parts = bd.split("-")
                        if len(parts) == 3:
                            row["birth_year"]  = int(parts[0])
                            row["birth_month"] = int(parts[1])
                            row["birth_day"]   = int(parts[2])
                    pos = person.get("primaryPosition", {}).get("abbreviation", "")
                    row["mlb_position"] = pos
                    rows.append(row)
            time.sleep(0.2)
        except Exception as exc:
            print(f"    Warning: batch {i//batch_size + 1} failed ({exc})")

    if rows:
        new_df = pd.DataFrame(rows)
        df = pd.concat([cached, new_df], ignore_index=True) if not cached.empty else new_df
        df.to_csv(cache_path, index=False)
        print(f"    {len(rows):,} new players fetched and cached (total: {len(df):,}).")
        return df

    return cached if not cached.empty else pd.DataFrame()


# ──────────────────────────────────────────────────────────────────────────────
# STEP 2 — BATTING STATISTICS (3 historical seasons)
# ──────────────────────────────────────────────────────────────────────────────

print("─── Step 2: Batting statistics ─────────────────────────────────")
batting_by_year: dict[int, pd.DataFrame] = {}
data_available_years: list[int] = []

for year in HISTORICAL_YEARS:
    print(f"  {year}:")
    cache_path = CACHE_DIR / f"batting_stats_{year}.csv"
    df = cached_fetch(cache_path, batting_stats, year, qual=MIN_PA, label=f"batting_stats({year})")

    if df is None or df.empty:
        print(f"    WARNING: No batting data for {year}. Skipping.")
        continue

    # Normalize column names (pybaseball versions can differ slightly)
    df.columns = [c.strip() for c in df.columns]

    required = ["Name", "IDfg", "Team", "G", "PA", "H", "2B", "3B",
                "HR", "R", "RBI", "SB", "BB"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        print(f"    WARNING: Missing columns {missing} for {year}. Skipping.")
        continue

    df["IDfg"] = pd.to_numeric(df["IDfg"], errors="coerce")
    df = df.dropna(subset=["IDfg"])
    df["IDfg"] = df["IDfg"].astype(int)

    # Pull wOBA (column name varies)
    for woba_col in ["wOBA", "woba", "wOBA_x", "woba_x"]:
        if woba_col in df.columns:
            df["wOBA"] = pd.to_numeric(df[woba_col], errors="coerce")
            break
    else:
        df["wOBA"] = np.nan

    df["fantasy_points"] = calc_fantasy_points(df)
    df["year"] = year
    batting_by_year[year] = df
    data_available_years.append(year)
    print(f"    {len(df):,} qualified players loaded.")

if not data_available_years:
    print("\nERROR: No batting data could be loaded. Exiting.")
    sys.exit(1)

# If the most-recent year is unavailable, shift the Y1/Y2/Y3 references back
if Y1 not in batting_by_year:
    available = sorted(batting_by_year.keys(), reverse=True)
    old_y1 = Y1
    Y1 = available[0] if len(available) > 0 else None
    Y2 = available[1] if len(available) > 1 else None
    Y3 = available[2] if len(available) > 2 else None
    print(f"\n  WARNING: {old_y1} data not available. Shifted references → {Y1}, {Y2}, {Y3}")
    print(f"  NOTE: Output filename will reflect this (projections based on older data).\n")

print()


# ──────────────────────────────────────────────────────────────────────────────
# STEP 3 — STATCAST EXPECTED STATS (xwOBA)
# ──────────────────────────────────────────────────────────────────────────────

print("─── Step 3: Statcast xwOBA ──────────────────────────────────────")
xwoba_by_year: dict[int, pd.DataFrame] = {}

for year in [Y1, Y2]:
    if year is None:
        continue
    print(f"  {year}:")
    cache_path = CACHE_DIR / f"statcast_xwoba_{year}.csv"
    df = cached_fetch(
        cache_path,
        statcast_batter_expected_stats,
        year,
        minPA=25,
        label=f"statcast_expected({year})"
    )

    if df is None or df.empty:
        print(f"    WARNING: No xwOBA data for {year}.")
        continue

    df.columns = [c.strip() for c in df.columns]

    # Normalize column names across Baseball Savant API versions
    rename_map = {}
    for src, dst in [("player_id", "mlbam_id"),
                     ("est_woba",  "xwOBA"),
                     ("woba",      "wOBA_savant")]:
        if src in df.columns:
            rename_map[src] = dst
    df = df.rename(columns=rename_map)

    if "xwOBA" not in df.columns:
        print(f"    WARNING: xwOBA column not found for {year}. Skipping.")
        continue

    df["mlbam_id"] = pd.to_numeric(df.get("mlbam_id", pd.Series(dtype=float)), errors="coerce")
    df = df.dropna(subset=["mlbam_id"])
    df["mlbam_id"] = df["mlbam_id"].astype(int)

    keep = ["mlbam_id", "xwOBA"]
    if "wOBA_savant" in df.columns:
        keep.append("wOBA_savant")
    xwoba_by_year[year] = df[keep].copy()
    print(f"    {len(df):,} players loaded.")

print()


# ──────────────────────────────────────────────────────────────────────────────
# STEP 4 — SPRINT SPEED
# ──────────────────────────────────────────────────────────────────────────────

print(f"─── Step 4: Sprint speed ({Y1}) ─────────────────────────────────")
speed_df = None

if Y1:
    cache_path = CACHE_DIR / f"sprint_speed_{Y1}.csv"
    raw_speed = cached_fetch(
        cache_path,
        statcast_sprint_speed,
        Y1,
        min_opp=0,
        label=f"sprint_speed({Y1})"
    )

    if raw_speed is not None and not raw_speed.empty and "sprint_speed" in raw_speed.columns:
        raw_speed["player_id"] = pd.to_numeric(
            raw_speed.get("player_id", pd.Series(dtype=float)), errors="coerce"
        )
        raw_speed = raw_speed.dropna(subset=["player_id"])
        raw_speed["player_id"] = raw_speed["player_id"].astype(int)

        # Compute percentile from the raw speed distribution
        raw_speed["speed_pct"] = raw_speed["sprint_speed"].rank(pct=True) * 100
        speed_df = raw_speed[["player_id", "sprint_speed", "speed_pct"]].copy()
        league_med = speed_df["sprint_speed"].median()
        print(f"  {len(speed_df):,} players. League median: {league_med:.1f} ft/sec")
    else:
        print(f"  WARNING: Sprint speed data unavailable for {Y1}.")

print()


# ──────────────────────────────────────────────────────────────────────────────
# STEP 5 — LEAGUE-WIDE STOLEN BASES (Y1)
# ──────────────────────────────────────────────────────────────────────────────

print(f"─── Step 5: League SB total ({Y1}) ──────────────────────────────")
if Y1 and Y1 in batting_by_year:
    qual_sb = batting_by_year[Y1]["SB"].sum()
    # Qualified players (200+ PA) represent ~72% of league SB total
    league_sb = int(qual_sb / 0.72)
    print(f"  Qualified SB: {qual_sb:,}  →  Estimated league total: {league_sb:,}\n")
else:
    league_sb = 3000   # Conservative estimate for a high-SB era
    print(f"  Using fallback estimate: {league_sb:,}\n")


# ──────────────────────────────────────────────────────────────────────────────
# STEP 6 — PLAYING TIME PROJECTIONS
# ──────────────────────────────────────────────────────────────────────────────

print(f"─── Step 6: Playing time projections ({TARGET_SEASON}) ──────────")
proj_pa_map: dict[int, float] = {}
using_pt_fallback = False

# Attempt to pull Steamer projections from Fangraphs API
try:
    steamer_url = (
        "https://www.fangraphs.com/api/projections"
        "?type=steamer&stats=bat&pos=all&team=0&players=0&lg=all"
    )
    resp = requests.get(
        steamer_url, timeout=12,
        headers={"User-Agent": "Mozilla/5.0 (compatible; FantasyProjections/1.0)"}
    )
    if resp.status_code == 200:
        proj_data = resp.json()
        if proj_data and isinstance(proj_data, list) and len(proj_data) > 50:
            proj_df = pd.DataFrame(proj_data)
            if "PA" in proj_df.columns and "playerid" in proj_df.columns:
                proj_df["playerid"] = pd.to_numeric(proj_df["playerid"], errors="coerce")
                proj_df["PA"]       = pd.to_numeric(proj_df["PA"],       errors="coerce")
                proj_pa_map = dict(
                    zip(proj_df["playerid"].dropna().astype(int),
                        proj_df["PA"].fillna(0))
                )
                print(f"  Steamer projections loaded: {len(proj_pa_map):,} players.")
            else:
                raise ValueError("Expected columns (PA, playerid) not found in Steamer data.")
        else:
            raise ValueError("Empty or undersized Steamer response.")
    else:
        raise ValueError(f"HTTP {resp.status_code}")

except Exception as exc:
    print(f"  Steamer projections unavailable: {exc}")
    print(f"  FALLBACK: Using {Y1} actual PA (capped at 700).")
    using_pt_fallback = True
    if Y1 and Y1 in batting_by_year:
        for _, row in batting_by_year[Y1].iterrows():
            proj_pa_map[int(row["IDfg"])] = min(float(row["PA"]), 700.0)

print()


# ──────────────────────────────────────────────────────────────────────────────
# STEP 7 — BUILD MASTER PLAYER DATASET
# ──────────────────────────────────────────────────────────────────────────────

print("─── Step 7: Building master dataset ────────────────────────────")

if Y1 not in batting_by_year:
    print("ERROR: Primary year data missing. Cannot build projections.")
    sys.exit(1)

# Base = Y1 batting stats
base = batting_by_year[Y1].copy()
base = base.rename(columns={
    "fantasy_points": "fp_y1",
    "PA": "pa_y1",
    "Team": "team_y1",
    "wOBA": "woba_y1",
})

# Merge Y2
if Y2 and Y2 in batting_by_year:
    y2 = (batting_by_year[Y2][["IDfg", "fantasy_points", "PA", "wOBA"]]
          .rename(columns={"fantasy_points": "fp_y2",
                            "PA": "pa_y2",
                            "wOBA": "woba_y2"}))
    base = base.merge(y2, on="IDfg", how="left")
else:
    base["fp_y2"] = np.nan
    base["pa_y2"] = np.nan
    base["woba_y2"] = np.nan

# Merge Y3
if Y3 and Y3 in batting_by_year:
    y3 = (batting_by_year[Y3][["IDfg", "fantasy_points", "PA"]]
          .rename(columns={"fantasy_points": "fp_y3", "PA": "pa_y3"}))
    base = base.merge(y3, on="IDfg", how="left")
else:
    base["fp_y3"] = np.nan
    base["pa_y3"] = np.nan

# Add MLBAM ID from Chadwick
base = base.merge(
    id_map[["key_fangraphs", "key_mlbam"]],
    left_on="IDfg", right_on="key_fangraphs",
    how="left"
)
base["mlbam_id"] = pd.to_numeric(base["key_mlbam"], errors="coerce")

# Fetch birth dates + position from MLB Stats API
print("  Fetching player info (birth dates + positions)…")
mlbam_ids = base["mlbam_id"].dropna().astype(int).unique().tolist()
player_info_df = fetch_player_info(mlbam_ids)
if not player_info_df.empty:
    base = base.merge(player_info_df, on="mlbam_id", how="left")
else:
    base["birth_year"]   = np.nan
    base["birth_month"]  = np.nan
    base["birth_day"]    = np.nan
    base["mlb_position"] = np.nan

# Merge xwOBA — Y1
if Y1 in xwoba_by_year:
    xw = (xwoba_by_year[Y1]
          .rename(columns={"xwOBA": "xwoba_y1",
                            "wOBA_savant": "woba_savant_y1"}))
    base = base.merge(xw, on="mlbam_id", how="left")
else:
    base["xwoba_y1"] = np.nan
    base["woba_savant_y1"] = np.nan

# Merge xwOBA — Y2
if Y2 and Y2 in xwoba_by_year:
    xw = (xwoba_by_year[Y2]
          .rename(columns={"xwOBA": "xwoba_y2",
                            "wOBA_savant": "woba_savant_y2"}))
    base = base.merge(xw, on="mlbam_id", how="left")
else:
    base["xwoba_y2"] = np.nan
    base["woba_savant_y2"] = np.nan

# Merge sprint speed
if speed_df is not None:
    base = base.merge(
        speed_df.rename(columns={"player_id": "mlbam_id"}),
        on="mlbam_id",
        how="left"
    )
    base["speed_pct"] = base["speed_pct"].fillna(50.0)
else:
    base["speed_pct"]    = 50.0
    base["sprint_speed"] = np.nan

# Projected PA (Steamer uses FG IDs; fallback already maps FG IDs too)
base["proj_pa"] = base["IDfg"].map(proj_pa_map).fillna(base["pa_y1"].clip(upper=700))
base["proj_pa"] = pd.to_numeric(base["proj_pa"], errors="coerce").clip(lower=0, upper=700).fillna(0)

print(f"  Master dataset: {len(base):,} players.\n")


# ──────────────────────────────────────────────────────────────────────────────
# STEP 8 — AGE CALCULATION
# ──────────────────────────────────────────────────────────────────────────────

print(f"─── Step 8: Player ages as of April 1, {TARGET_SEASON} ──────────")
target_date = datetime.date(TARGET_SEASON, 4, 1)

def calc_age(row) -> float:
    try:
        bdate = datetime.date(
            int(row["birth_year"]),
            int(row["birth_month"]),
            int(row["birth_day"])
        )
        return round((target_date - bdate).days / 365.25, 1)
    except Exception:
        return np.nan

base["age"] = base.apply(calc_age, axis=1)
median_age = base["age"].median()
missing_age = base["age"].isna().sum()
if missing_age:
    base["age"] = base["age"].fillna(median_age)
    print(f"  {missing_age} players missing birth date → filled with median ({median_age:.1f})")
print(f"  Age range: {base['age'].min():.0f}–{base['age'].max():.0f}  "
      f"median: {base['age'].median():.1f}\n")


# ──────────────────────────────────────────────────────────────────────────────
# STEP 9 — WEIGHTED BASE FANTASY POINTS
# ──────────────────────────────────────────────────────────────────────────────

print("─── Step 9: Weighted historical fantasy points ───────────────")

def weighted_fp(row) -> float:
    y1 = row.get("fp_y1", np.nan)
    y2 = row.get("fp_y2", np.nan)
    y3 = row.get("fp_y3", np.nan)

    has = [pd.notna(v) and v > 0 for v in [y1, y2, y3]]
    n   = sum(has)

    if n == 3:
        return 0.50 * y1 + 0.33 * y2 + 0.17 * y3
    elif n == 2:
        if has[0] and has[1]:
            return 0.60 * y1 + 0.40 * y2
        elif has[0] and has[2]:
            return 0.60 * y1 + 0.40 * y3
        else:
            return 0.60 * y2 + 0.40 * y3
    elif n == 1:
        val = y1 if has[0] else (y2 if has[1] else y3)
        # 15% regression toward league average for limited sample
        return val * 0.85 + LEAGUE_AVG_FP * 0.15
    else:
        return np.nan

base["WeightedBase"] = base.apply(weighted_fp, axis=1)
before = len(base)
base = base.dropna(subset=["WeightedBase"])
print(f"  {len(base):,} players with valid weighted base "
      f"({before - len(base)} dropped).\n")


# ──────────────────────────────────────────────────────────────────────────────
# STEP 10 — PROJECTION MODIFIERS
# ──────────────────────────────────────────────────────────────────────────────

print("─── Step 10: Projection modifiers ───────────────────────────────")

# Age modifier: +0.6% per year under 28, -0.6% per year over 28, capped ±10%
base["AgeMod"] = (1 + ((28 - base["age"]) * 0.006)).clip(0.90, 1.10)

# Park factor
base["team_norm"]  = base["team_y1"].apply(normalize_team)
base["ParkFactor"] = base["team_norm"].map(PARK_FACTORS).fillna(1.00)

# Playing time modifier (relative to 600 PA baseline)
base["PlayingTimeMod"] = (base["proj_pa"] / 600.0).clip(lower=0)

# xwOBA adjustment: captures regression toward expected contact quality
# Formula: [(0.6 × gap_y1 + 0.4 × gap_y2)] × 150
# Positive gap → player underperformed their Statcast metrics → positive adj
def xwoba_adjustment(row) -> float:
    adj, w_sum = 0.0, 0.0

    xw1 = row.get("xwoba_y1", np.nan)
    # Prefer Baseball Savant's wOBA; fall back to Fangraphs wOBA
    w1  = row.get("woba_savant_y1", np.nan)
    if pd.isna(w1):
        w1 = row.get("woba_y1", np.nan)
    if pd.notna(xw1) and pd.notna(w1) and w1 > 0:
        adj   += 0.6 * (xw1 - w1)
        w_sum += 0.6

    xw2 = row.get("xwoba_y2", np.nan)
    w2  = row.get("woba_savant_y2", np.nan)
    if pd.isna(w2):
        w2 = row.get("woba_y2", np.nan)
    if pd.notna(xw2) and pd.notna(w2) and w2 > 0:
        adj   += 0.4 * (xw2 - w2)
        w_sum += 0.4

    return (adj / w_sum * 150) if w_sum > 0 else 0.0

base["xwOBA_Adjustment"] = base.apply(xwoba_adjustment, axis=1)

# Speed bonus: credits fast players with additional projected stolen base value
# SpeedBonus = (pct/100) × 0.4 × (league_sb / 450) × 30
base["SpeedBonus"] = (base["speed_pct"] / 100.0) * 0.4 * (league_sb / 450.0) * 30.0

print(f"  AgeMod:         range {base['AgeMod'].min():.3f}–{base['AgeMod'].max():.3f}")
print(f"  ParkFactor:     range {base['ParkFactor'].min():.3f}–{base['ParkFactor'].max():.3f}")
print(f"  PlayingTimeMod: range {base['PlayingTimeMod'].min():.2f}–{base['PlayingTimeMod'].max():.2f}")
print(f"  xwOBA_Adj:      range {base['xwOBA_Adjustment'].min():.1f}–{base['xwOBA_Adjustment'].max():.1f}")
print(f"  SpeedBonus:     range {base['SpeedBonus'].min():.1f}–{base['SpeedBonus'].max():.1f}\n")


# ──────────────────────────────────────────────────────────────────────────────
# STEP 11 — FINAL PROJECTIONS
# ──────────────────────────────────────────────────────────────────────────────

print("─── Step 11: Final projections ──────────────────────────────────")

base["ProjectedFP"] = (
    base["WeightedBase"]
    * base["AgeMod"]
    * base["ParkFactor"]
    * base["PlayingTimeMod"]
    + base["xwOBA_Adjustment"]
    + base["SpeedBonus"]
)

base = base.sort_values("ProjectedFP", ascending=False).reset_index(drop=True)
base["FP_MostRecentYear"] = base["fp_y1"].fillna(0)
base["Projection_vs_MostRecent"] = (
    (base["ProjectedFP"] - base["FP_MostRecentYear"])
    / base["FP_MostRecentYear"].replace(0, np.nan) * 100
).round(1)
base["Percentile"] = (base["ProjectedFP"].rank(pct=True) * 100).round(1)

# Assign batter position from MLB Stats API; normalize OF variants
POS_NORMALIZE = {"LF": "OF", "CF": "OF", "RF": "OF", "DH": "DH"}
def resolve_pos(row) -> str:
    mlb = str(row.get("mlb_position", "") or "").strip()
    if mlb:
        return POS_NORMALIZE.get(mlb, mlb)
    return "—"
base["Position"] = base.apply(resolve_pos, axis=1)

print(f"  Projections complete: {len(base):,} batters.\n")


# ──────────────────────────────────────────────────────────────────────────────
# STEP 11b — PITCHER PROJECTIONS
# ──────────────────────────────────────────────────────────────────────────────

print("─── Step 11b: Pitcher projections ───────────────────────────────")

try:
    from pybaseball import pitching_stats
    pitch_by_year: dict[int, pd.DataFrame] = {}
    for year in HISTORICAL_YEARS:
        print(f"  {year}:")
        cache_path = CACHE_DIR / f"pitching_stats_{year}.csv"
        df = cached_fetch(cache_path, pitching_stats, year, qual=MIN_IP, label=f"pitching_stats({year})")
        if df is None or df.empty:
            print(f"    WARNING: No pitching data for {year}.")
            continue
        df.columns = [c.strip() for c in df.columns]
        df["IDfg"] = pd.to_numeric(df.get("IDfg", pd.Series(dtype=float)), errors="coerce")
        df = df.dropna(subset=["IDfg"])
        df["IDfg"] = df["IDfg"].astype(int)
        df["fantasy_points"] = calc_pitcher_fantasy_points(df)
        df["year"] = year
        pitch_by_year[year] = df
        print(f"    {len(df):,} qualified pitchers loaded.")

    if pitch_by_year and Y1 in pitch_by_year:
        # Build pitcher base dataset
        pb = pitch_by_year[Y1].copy()
        pb = pb.rename(columns={"fantasy_points": "fp_y1", "IP": "pa_y1", "Team": "team_y1"})
        if Y2 and Y2 in pitch_by_year:
            py2 = pitch_by_year[Y2][["IDfg", "fantasy_points", "IP"]].rename(
                columns={"fantasy_points": "fp_y2", "IP": "pa_y2"})
            pb = pb.merge(py2, on="IDfg", how="left")
        else:
            pb["fp_y2"] = np.nan; pb["pa_y2"] = np.nan
        if Y3 and Y3 in pitch_by_year:
            py3 = pitch_by_year[Y3][["IDfg", "fantasy_points"]].rename(columns={"fantasy_points": "fp_y3"})
            pb = pb.merge(py3, on="IDfg", how="left")
        else:
            pb["fp_y3"] = np.nan

        pb = pb.merge(id_map[["key_fangraphs", "key_mlbam"]],
                      left_on="IDfg", right_on="key_fangraphs", how="left")
        pb["mlbam_id"] = pd.to_numeric(pb["key_mlbam"], errors="coerce")

        # Player info (birthdates + positions)
        pitch_mlbam = pb["mlbam_id"].dropna().astype(int).unique().tolist()
        # Reuse same cache (already fetched for batters if IDs overlap)
        pinfo = fetch_player_info(pitch_mlbam)
        if not pinfo.empty:
            pb = pb.merge(pinfo, on="mlbam_id", how="left")
        else:
            pb["birth_year"] = pb["birth_month"] = pb["birth_day"] = pb["mlb_position"] = np.nan

        # Age
        def pcalc_age(row) -> float:
            try:
                return round((target_date - datetime.date(
                    int(row["birth_year"]), int(row["birth_month"]), int(row["birth_day"])
                )).days / 365.25, 1)
            except Exception:
                return np.nan
        pb["age"] = pb.apply(pcalc_age, axis=1)
        pb["age"] = pb["age"].fillna(pb["age"].median() if not pb["age"].isna().all() else 28)

        # Weighted base
        pb["WeightedBase"] = pb.apply(weighted_fp, axis=1)
        pb = pb.dropna(subset=["WeightedBase"])

        # SP vs RP: use GS (games started) vs G ratio
        gs_col = "GS" if "GS" in pb.columns else None
        g_col  = "G"  if "G"  in pb.columns else None
        def assign_pitcher_pos(row) -> str:
            # Only trust explicit SP/RP from MLB API; 'P' is too generic
            mlb = str(row.get("mlb_position", "") or "").strip()
            if mlb in ("SP", "RP"):
                return mlb
            # Use GS/G ratio from actual stats
            if gs_col and g_col:
                gs = row.get(gs_col, 0) or 0
                g  = row.get(g_col, 1) or 1
                return "SP" if (gs / max(g, 1)) >= 0.5 else "RP"
            return "SP"
        pb["Position"] = pb.apply(assign_pitcher_pos, axis=1)

        # Modifiers — pitchers use inverse park factor (pitcher-friendly park = better)
        pb["AgeMod"] = (1 + ((28 - pb["age"]) * 0.006)).clip(0.90, 1.10)
        pb["team_norm"] = pb["team_y1"].apply(normalize_team)
        pb["ParkFactor"] = pb["team_norm"].map(PARK_FACTORS).apply(
            lambda x: 2.0 - x if pd.notna(x) else 1.0)  # invert: COL 1.15 → 0.85 for pitchers
        pb["proj_pa"] = pb["IDfg"].map(proj_pa_map).fillna(pb["pa_y1"].clip(upper=250))
        pb["PlayingTimeMod"] = (pb["proj_pa"] / 180.0).clip(lower=0, upper=1.6)
        pb["xwOBA_Adjustment"] = 0.0
        pb["SpeedBonus"] = 0.0

        pb["ProjectedFP"] = (
            pb["WeightedBase"] * pb["AgeMod"] * pb["ParkFactor"] * pb["PlayingTimeMod"])
        pb["FP_MostRecentYear"] = pb["fp_y1"].fillna(0)
        pb["Projection_vs_MostRecent"] = (
            (pb["ProjectedFP"] - pb["FP_MostRecentYear"])
            / pb["FP_MostRecentYear"].replace(0, np.nan) * 100).round(1)
        pb["Percentile"] = 0.0  # recalculated after merge

        print(f"  {len(pb):,} pitchers projected.")

        # Merge with batter projections
        shared = ["Name", "mlbam_id", "Position", "team_y1", "age", "proj_pa",
                  "WeightedBase", "AgeMod", "ParkFactor", "PlayingTimeMod",
                  "xwOBA_Adjustment", "SpeedBonus", "ProjectedFP",
                  "FP_MostRecentYear", "Projection_vs_MostRecent", "Percentile"]
        pb_out = pb[[c for c in shared if c in pb.columns]].copy()
        base   = pd.concat([base[shared], pb_out], ignore_index=True)
        base   = base.sort_values("ProjectedFP", ascending=False).reset_index(drop=True)
        base["Percentile"] = (base["ProjectedFP"].rank(pct=True) * 100).round(1)
        print(f"  Combined total: {len(base):,} players.\n")
    else:
        print("  No pitcher data available — skipping pitcher projections.\n")
except Exception as exc:
    print(f"  Pitcher projections failed: {exc} — continuing with batters only.\n")


# ──────────────────────────────────────────────────────────────────────────────
# STEP 12 — OUTPUT: MAIN PROJECTIONS CSV
# ──────────────────────────────────────────────────────────────────────────────

print("─── Step 12: Writing output files ───────────────────────────────")

# Suffix if we had to fall back to older data
year_suffix = f"_based_on_{Y1}" if Y1 != HISTORICAL_YEARS[0] else ""
base_name   = f"fantasy_projections_{TARGET_SEASON}{year_suffix}"

output_cols = {
    "Name":                    "Player Name",
    "mlbam_id":                "MLBAM ID",
    "Position":                "Position",
    "team_y1":                 "Team",
    "age":                     "Age",
    "proj_pa":                 "Projected PA",
    "WeightedBase":            "WeightedBase",
    "AgeMod":                  "AgeMod",
    "ParkFactor":              "ParkFactor",
    "PlayingTimeMod":          "PlayingTimeMod",
    "xwOBA_Adjustment":        "xwOBA_Adjustment",
    "SpeedBonus":              "SpeedBonus",
    "ProjectedFP":             "ProjectedFP",
    "FP_MostRecentYear":       "FP_MostRecentYear",
    "Projection_vs_MostRecent":"Projection_vs_MostRecent",
    "Percentile":              "Percentile",
}

out = base[list(output_cols.keys())].rename(columns=output_cols).copy()
for col in ["WeightedBase", "AgeMod", "ParkFactor", "PlayingTimeMod",
            "xwOBA_Adjustment", "SpeedBonus", "ProjectedFP",
            "FP_MostRecentYear", "Projection_vs_MostRecent", "Percentile"]:
    out[col] = out[col].round(1)

main_path = SCRIPT_DIR / f"{base_name}.csv"
out.to_csv(main_path, index=False)
print(f"  Main CSV:    {main_path.name}  ({len(out):,} rows)")


# ─── Flags CSV ────────────────────────────────────────────────────────────────

flag_frames = []

# < 300 PA (or IP) in Y1 — use proj_pa as proxy since pa_y1 may not exist post-merge
if "proj_pa" in base.columns:
    lpa = base[base["proj_pa"] < 300].copy()
    lpa["flag"] = f"Low projected PA/IP (injury/role concern)"
    flag_frames.append(
        lpa[["Name", "ProjectedFP", "flag"]]
          .assign(IDfg=lpa.get("IDfg", "—"), flag_value=lpa["proj_pa"])
    )

# Large xwOBA adjustment
lx = base[base["xwOBA_Adjustment"].abs() > 30].copy()
lx["flag"] = lx["xwOBA_Adjustment"].apply(
    lambda x: f"Large positive xwOBA adj (+{x:.1f}) — due for positive regression"
    if x > 0 else f"Large negative xwOBA adj ({x:.1f}) — may underperform"
)
flag_frames.append(
    lx[["Name", "xwOBA_Adjustment", "ProjectedFP", "flag"]]
      .rename(columns={"xwOBA_Adjustment": "flag_value"})
)

# Age 35+
old = base[base["age"] >= 35].copy()
old["flag"] = old["age"].apply(lambda a: f"Age {a:.0f} — heightened decline risk")
flag_frames.append(
    old[["Name", "age", "ProjectedFP", "flag"]]
       .rename(columns={"age": "flag_value"})
)

# Fewer than 2 years of MLB data
if "fp_y2" in base.columns:
    ltd = base[base["fp_y2"].isna() | (base["fp_y2"] == 0)].copy()
    ltd["flag"] = "Limited sample — fewer than 2 years of data"
    flag_frames.append(
        ltd[["Name", "ProjectedFP", "flag"]]
           .assign(flag_value=ltd.get("fp_y1", 0))
    )

if flag_frames:
    flags_df = (pd.concat(flag_frames, ignore_index=True)
                  .sort_values("ProjectedFP", ascending=False))
    flags_path = SCRIPT_DIR / f"projection_flags_{TARGET_SEASON}{year_suffix}.csv"
    flags_df.to_csv(flags_path, index=False)
    print(f"  Flags CSV:   {flags_path.name}  ({len(flags_df):,} entries)")


# ─── Breakout Candidates & Decline Risks ──────────────────────────────────────

spd = base.get("speed_pct", pd.Series(50, index=base.index))
breakouts = (
    base[(base["age"] < 27) &
         (base["xwOBA_Adjustment"] > 0) &
         (spd >= 70)]
    .sort_values("ProjectedFP", ascending=False)
    .head(20)
)
declines = (
    base[(base["age"] > 32) & (base["xwOBA_Adjustment"] < 0)]
    .sort_values("ProjectedFP", ascending=False)
    .head(20)
)

bo_path = SCRIPT_DIR / f"breakout_candidates_{TARGET_SEASON}{year_suffix}.csv"
dc_path = SCRIPT_DIR / f"decline_risks_{TARGET_SEASON}{year_suffix}.csv"

breakouts[["Name", "age", "xwOBA_Adjustment", "ProjectedFP"]].to_csv(bo_path, index=False)
declines[ ["Name", "age", "xwOBA_Adjustment", "ProjectedFP"]].to_csv(dc_path, index=False)
print(f"  Breakouts:   {bo_path.name}  ({len(breakouts)} players)")
print(f"  Declines:    {dc_path.name}  ({len(declines)} players)")


# ─── Scatter Plot ─────────────────────────────────────────────────────────────

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(10, 8))
    sc = ax.scatter(
        base["FP_MostRecentYear"],
        base["ProjectedFP"],
        alpha=0.5, s=30,
        c=base["age"], cmap="RdYlGn_r",
        vmin=22, vmax=38
    )
    lim = max(base["FP_MostRecentYear"].max(), base["ProjectedFP"].max()) + 50
    ax.plot([0, lim], [0, lim], "k--", alpha=0.3, linewidth=1, label="No change")

    base["_variance"] = (base["ProjectedFP"] - base["FP_MostRecentYear"]).abs()
    for _, row in base.nlargest(12, "_variance").iterrows():
        ax.annotate(
            row["Name"].split()[-1],
            (row["FP_MostRecentYear"], row["ProjectedFP"]),
            fontsize=7, ha="left", va="bottom",
            xytext=(3, 3), textcoords="offset points",
        )

    plt.colorbar(sc, ax=ax, label="Player Age")
    ax.set_xlabel(f"{Y1} Actual Fantasy Points", fontsize=11)
    ax.set_ylabel(f"{TARGET_SEASON} Projected Fantasy Points", fontsize=11)
    ax.set_title(f"{TARGET_SEASON} Fantasy Baseball Projections vs {Y1} Actuals",
                 fontsize=13, fontweight="bold")
    ax.legend(fontsize=9)
    ax.grid(True, alpha=0.2)

    scatter_path = SCRIPT_DIR / f"projection_scatter_{TARGET_SEASON}{year_suffix}.png"
    plt.savefig(scatter_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"  Scatter:     {scatter_path.name}")

except ImportError:
    print("  Scatter:     skipped (matplotlib not installed — run: pip install matplotlib)")
except Exception as exc:
    print(f"  Scatter:     skipped ({exc})")

print()


# ──────────────────────────────────────────────────────────────────────────────
# STEP 13 — VALIDATION CHECKS
# ──────────────────────────────────────────────────────────────────────────────

print("─── Step 13: Validation ─────────────────────────────────────────")

# Top 20 visual check
print(f"\nTop 20 projected players for {TARGET_SEASON}:\n")
header = f"{'#':<4} {'Name':<24} {'Team':<5} {'Age':<5} {'ProjFP':<8} {'ActFP':<8} {'Δ%':<8} {'Pct'}"
print(header)
print("-" * len(header))
for i, row in base.head(20).iterrows():
    delta = f"{row['Projection_vs_MostRecent']:+.1f}%" if pd.notna(row["Projection_vs_MostRecent"]) else "N/A"
    print(f"{i+1:<4} {row['Name']:<24} {str(row['team_y1']):<5} "
          f"{row['age']:<5.1f} {row['ProjectedFP']:<8.1f} "
          f"{row['FP_MostRecentYear']:<8.1f} {delta:<8} {row['Percentile']:.0f}th")

# Mean FP check
mean_fp = base["ProjectedFP"].mean()
status  = "✓" if 250 <= mean_fp <= 400 else "⚠ WARNING"
print(f"\n{status}  Mean projected FP: {mean_fp:.1f}  (expected 250–400)")

# Park factor directional check
print("\nPark factor directional check:")
for team, expected in [("COL", ">1.00"), ("SF", "<1.00"), ("MIA", "<1.00")]:
    players = base[base["team_y1"].apply(normalize_team) == team].head(5)
    if players.empty:
        print(f"  — {team}: no players found")
        continue
    avg_pf = players["ParkFactor"].mean()
    direction = "above" if avg_pf > 1.00 else "below"
    expected_dir = "above" if ">" in expected else "below"
    icon = "✓" if direction == expected_dir else "⚠"
    print(f"  {icon} {team}: avg PF = {avg_pf:.3f}  (expected {expected})")
    for _, r in players.iterrows():
        print(f"      {r['Name']:<22} PF={r['ParkFactor']:.3f}")

# Age modifier directional check
young      = base[base["age"] < 27]
old        = base[base["age"] > 32]
young_bad  = young[young["AgeMod"] <= 1.00]
old_bad    = old[  old["AgeMod"]   >= 1.00]
print(f"\nAge modifier check:")
icon = "✓" if young_bad.empty else "⚠"
print(f"  {icon}  {len(young)} young players (<27): "
      f"{'all AgeMod > 1.00' if young_bad.empty else f'{len(young_bad)} exceptions'}")
icon = "✓" if old_bad.empty else "⚠"
print(f"  {icon}  {len(old)} veterans (>32): "
      f"{'all AgeMod < 1.00' if old_bad.empty else f'{len(old_bad)} exceptions'}")

# Data source summary
print(f"\nData sources confirmed:")
print(f"  Batting stats:    {', '.join(str(y) for y in data_available_years)}")
print(f"  xwOBA data:       {', '.join(str(y) for y in xwoba_by_year) or 'None'}")
print(f"  Sprint speed:     {Y1 if speed_df is not None else 'Not available'}")
print(f"  Playing time:     {'Steamer projections' if not using_pt_fallback else f'{Y1} actual PA (fallback)'}")

print(f"\n{'='*65}")
print(f"  ✓ Projections complete!")
print(f"    Target season:   {TARGET_SEASON}")
print(f"    Players ranked:  {len(base):,}")
print(f"    Main output:     {main_path.name}")
print(f"{'='*65}\n")
