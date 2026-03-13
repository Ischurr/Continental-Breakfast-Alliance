#!/usr/bin/env python3
"""
Backtest EROSP projections against actual season fantasy points.

Runs the EROSP pipeline as a pre-season projection for the target year
(using the 3 prior years of data), then compares erosp_raw/startable against
actual fantasy points from data/historical/{year}.json.

Usage:
    python backtest_erosp.py [--target-year 2025]

Output:
    data/erosp/backtest_{year}.json   — projection output
    data/erosp/backtest_{year}.csv    — matched comparison table
    Summary stats printed to stdout
"""

import os
import re
import sys
import json
import argparse
import datetime
import warnings
from pathlib import Path

import pandas as pd
import numpy as np

warnings.filterwarnings("ignore")

SCRIPT_DIR  = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(SCRIPT_DIR))

try:
    import pybaseball
    pybaseball.cache.enable()
except ImportError:
    print("ERROR: pybaseball not installed. Run: pip install pybaseball pandas numpy requests")
    sys.exit(1)

from erosp.config import (
    PARK_FACTORS, TEAM_NORMALIZE, MLB_TEAM_ID_TO_ABBREV, FULL_SEASON_GAMES,
)
from erosp.ingest import (
    fetch_id_map, fetch_player_info,
    fetch_batting_stats, fetch_pitching_stats,
    fetch_statcast_xwoba, fetch_sprint_speed,
    fetch_schedule_summary,
    build_name_to_mlbam_from_chadwick,
    build_fangraphs_to_mlbam,
)
from erosp.talent import estimate_hitter_talent, estimate_pitcher_talent, LG_AVG_PITCH, PITCH_RATE_COLS
from erosp.playing_time import build_playing_time
from erosp.projection import compute_all_erosp_raw
from erosp.startability import compute_replacement_levels, compute_erosp_startable


# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
parser = argparse.ArgumentParser(description="Backtest EROSP against actual season results")
parser.add_argument("--target-year", type=int, default=2025,
                    help="Season year to backtest (default: 2025)")
args = parser.parse_args()

TARGET_SEASON       = args.target_year
HISTORICAL_YEARS    = [TARGET_SEASON - 1, TARGET_SEASON - 2, TARGET_SEASON - 3]
Y1, Y2, Y3          = HISTORICAL_YEARS
PITCHER_EXTRA_YEARS = [TARGET_SEASON - 4, TARGET_SEASON - 5]   # Fix 2: 5yr lookback
Y4, Y5              = PITCHER_EXTRA_YEARS
SEASON_STARTED      = False  # pre-season projection

print(f"\n{'='*65}")
print(f"  EROSP BACKTEST")
print(f"{'='*65}")
print(f"  Target season:  {TARGET_SEASON}")
print(f"  History years:  {Y1}, {Y2}, {Y3}")
print(f"  Mode:           Pre-season (no current-year stats, no injuries)")
print(f"  Run date:       {datetime.date.today().strftime('%B %d, %Y')}")
print(f"{'='*65}\n")


# ---------------------------------------------------------------------------
# STEP 1: ID mapping
# ---------------------------------------------------------------------------
print("─── Step 1: ID mapping ───────────────────────────────────────────")
id_map_df     = fetch_id_map()
fg_to_mlbam   = build_fangraphs_to_mlbam(id_map_df)
name_to_mlbam = build_name_to_mlbam_from_chadwick()
print()


# ---------------------------------------------------------------------------
# STEP 2: Batting statistics
# ---------------------------------------------------------------------------
print("─── Step 2: Batting statistics ──────────────────────────────────")
batting_by_year = fetch_batting_stats(HISTORICAL_YEARS, min_pa=100)
if not batting_by_year:
    print("ERROR: No batting data fetched. Exiting.")
    sys.exit(1)
print()


# ---------------------------------------------------------------------------
# STEP 3: Pitching statistics
# ---------------------------------------------------------------------------
print("─── Step 3: Pitching statistics ─────────────────────────────────")
pitching_by_year = fetch_pitching_stats(HISTORICAL_YEARS, min_ip=20)
# Fix 2: fetch extra years (y4, y5) for extended pitcher lookback
pitcher_extra = fetch_pitching_stats(PITCHER_EXTRA_YEARS, min_ip=20)
pitching_by_year.update(pitcher_extra)
extra_rows = sum(len(v) for v in pitcher_extra.values())
print(f"  Extra pitcher years ({Y4}, {Y5}): {extra_rows:,} entries fetched.")
print()


# ---------------------------------------------------------------------------
# STEP 4: Statcast xwOBA
# ---------------------------------------------------------------------------
print("─── Step 4: Statcast xwOBA ───────────────────────────────────────")
xwoba_by_year = fetch_statcast_xwoba([Y1, Y2] if Y1 else [Y2])
print()


# ---------------------------------------------------------------------------
# STEP 5: Sprint speed
# ---------------------------------------------------------------------------
print(f"─── Step 5: Sprint speed ({Y1}) ──────────────────────────────────")
sprint_speed_df = fetch_sprint_speed(Y1)
print()


# ---------------------------------------------------------------------------
# STEP 6: Player info
# ---------------------------------------------------------------------------
print("─── Step 6: Player info (ages + positions) ───────────────────────")
all_fgids = set()
for df in batting_by_year.values():
    all_fgids |= set(df["IDfg"].dropna().astype(int).tolist())
for df in pitching_by_year.values():
    all_fgids |= set(df["IDfg"].dropna().astype(int).tolist())

all_mlbam_ids = [fg_to_mlbam[fgid] for fgid in all_fgids if fgid in fg_to_mlbam]
name_fallback_ids = list(name_to_mlbam.values())
all_mlbam_ids = list(set(all_mlbam_ids) | set(name_fallback_ids))
player_info_df = fetch_player_info(all_mlbam_ids)
print()


# ---------------------------------------------------------------------------
# STEP 7: MLB schedule — override games_remaining to full season
# ---------------------------------------------------------------------------
print("─── Step 7: MLB schedule (overriding to 162 games for backtest) ──")
schedule_summary = fetch_schedule_summary(TARGET_SEASON)

if not schedule_summary:
    # Fallback: build dummy schedule with all MLB teams at 162 games
    print("  WARNING: No schedule returned for target year. Building fallback.")
    schedule_summary = {
        team_id: {
            "abbrev": abbrev,
            "games_remaining": FULL_SEASON_GAMES,
            "avg_park_factor_remaining": PARK_FACTORS.get(abbrev, 1.0),
        }
        for team_id, abbrev in MLB_TEAM_ID_TO_ABBREV.items()
    }
else:
    # Season is over — API returns 0 games remaining. Override to full season.
    n_teams = len(schedule_summary)
    for tid in schedule_summary:
        schedule_summary[tid]["games_remaining"] = FULL_SEASON_GAMES
    print(f"  Overrode games_remaining → {FULL_SEASON_GAMES} for {n_teams} teams.")

abbrev_to_team_id = {v["abbrev"]: k for k, v in schedule_summary.items()}
print()


# ---------------------------------------------------------------------------
# STEP 8: Talent estimation
# ---------------------------------------------------------------------------
print("─── Step 8: Talent estimation ────────────────────────────────────")
print("  Hitters:")
hitter_talent_df = estimate_hitter_talent(
    batting_by_year  = batting_by_year,
    historical_years = HISTORICAL_YEARS,
    player_info_df   = player_info_df,
    xwoba_by_year    = xwoba_by_year,
    sprint_speed_df  = sprint_speed_df,
    target_season    = TARGET_SEASON,
    fg_to_mlbam      = fg_to_mlbam,
    name_to_mlbam    = name_to_mlbam,
)

print("  Pitchers:")
pitcher_talent_df = estimate_pitcher_talent(
    pitching_by_year = pitching_by_year,
    historical_years = HISTORICAL_YEARS,
    player_info_df   = player_info_df,
    target_season    = TARGET_SEASON,
    fg_to_mlbam      = fg_to_mlbam,
    name_to_mlbam    = name_to_mlbam,
    extra_years      = PITCHER_EXTRA_YEARS,   # Fix 2: 5yr lookback for TJ returnees
)
print()


# ---------------------------------------------------------------------------
# STEP 8b: 40-man floor for returning/prospect pitchers (Fix 1)
# ---------------------------------------------------------------------------
print("─── Step 8b: Pitcher floor (TJ returnees / prospects) ───────────")
if not pitcher_talent_df.empty:
    _mlbam_to_total_ip: dict = {}
    for _yr, _pit_df in pitching_by_year.items():
        if _yr >= TARGET_SEASON:
            continue
        for _, _row in _pit_df.iterrows():
            _fgid  = int(_row.get("IDfg", 0) or 0)
            _mlbam = fg_to_mlbam.get(_fgid)
            if _mlbam:
                _mlbam_to_total_ip[_mlbam] = (
                    _mlbam_to_total_ip.get(_mlbam, 0.0) + float(_row.get("IP", 0) or 0)
                )

    _pitcher_pos_set: set = set()
    if not player_info_df.empty and "mlb_position" in player_info_df.columns:
        for _, _prow in player_info_df.iterrows():
            _mid = int(_prow.get("mlbam_id", 0) or 0)
            if _mid and str(_prow.get("mlb_position", "")).upper() in {"P", "SP", "RP"}:
                _pitcher_pos_set.add(_mid)

    # Build set of MLBAM IDs with recent activity (y1 or y2) — skip these for the floor
    _recent_activity_set: set = set()
    for _yr in [Y1, Y2]:
        if _yr and _yr in pitching_by_year:
            for _, _row in pitching_by_year[_yr].iterrows():
                _fgid = int(_row.get("IDfg", 0) or 0)
                _m = fg_to_mlbam.get(_fgid)
                if _m:
                    _recent_activity_set.add(_m)

    _floor_count = 0
    for _mid in list(pitcher_talent_df.index):
        if int(_mid) not in _pitcher_pos_set:
            continue
        if _mlbam_to_total_ip.get(int(_mid), 0.0) >= 30.0:
            continue
        if pitcher_talent_df.at[_mid, "role"] != "SP":
            continue                                # relievers stay as-is
        if int(_mid) in _recent_activity_set:
            continue                                # had recent activity — not TJ returnee
        for _col in PITCH_RATE_COLS:
            if _col in pitcher_talent_df.columns:
                pitcher_talent_df.at[_mid, _col] = round(LG_AVG_PITCH[_col], 6)
        _floor_count += 1

    print(f"  Floor applied to {_floor_count} pitcher(s) with < 30 total IP (SP, absent y1/y2).")
print()


# ---------------------------------------------------------------------------
# STEP 9: Playing time (with Steamer pre-season projections for target year)
# ---------------------------------------------------------------------------
print("─── Step 9: Playing time (Steamer pre-season projections) ───────")

import requests as _requests

# Steamer PA projections (batting) — uses season= param for historical archives.
# Falls back to data/erosp/steamer_raw_bat_{year}.csv if API is rate-limited.
steamer_pa_map: dict = {}
_bat_cache = PROJECT_DIR / "data" / "erosp" / f"steamer_raw_bat_{TARGET_SEASON}.csv"

def _load_steamer_bat_from_cache(path: Path) -> dict:
    df = pd.read_csv(path)
    df["playerid"] = pd.to_numeric(df["playerid"], errors="coerce")
    df["PA"]       = pd.to_numeric(df["PA"],       errors="coerce")
    return dict(zip(df["playerid"].dropna().astype(int), df["PA"].fillna(0)))

try:
    steamer_bat_url = (
        f"https://www.fangraphs.com/api/projections"
        f"?type=steamer&stats=bat&pos=all&team=0&players=0&lg=all&season={TARGET_SEASON}"
    )
    resp_bat = _requests.get(steamer_bat_url, timeout=20,
                             headers={"User-Agent": "Mozilla/5.0"})
    if resp_bat.status_code == 200:
        bat_data = resp_bat.json()
        if bat_data and isinstance(bat_data, list) and len(bat_data) > 50:
            bat_df = pd.DataFrame(bat_data)
            if "PA" in bat_df.columns and "playerid" in bat_df.columns:
                bat_df["playerid"] = pd.to_numeric(bat_df["playerid"], errors="coerce")
                bat_df["PA"]       = pd.to_numeric(bat_df["PA"],       errors="coerce")
                steamer_pa_map = dict(
                    zip(bat_df["playerid"].dropna().astype(int),
                        bat_df["PA"].fillna(0))
                )
                print(f"  Steamer {TARGET_SEASON} PA projections: {len(steamer_pa_map):,} players (live).")
    else:
        raise ValueError(f"HTTP {resp_bat.status_code}")
except Exception as exc:
    if _bat_cache.exists():
        steamer_pa_map = _load_steamer_bat_from_cache(_bat_cache)
        print(f"  Steamer {TARGET_SEASON} PA projections: {len(steamer_pa_map):,} players (cache).")
    else:
        print(f"  Steamer batting unavailable ({exc}); using playing-time defaults.")

# Steamer GS/IP projections (pitching) — overrides rotation-tiering heuristic.
# Falls back to data/erosp/steamer_raw_pit_{year}.csv if API is rate-limited.
steamer_gs_map: dict = {}
steamer_ip_map: dict = {}
_pit_cache = PROJECT_DIR / "data" / "erosp" / f"steamer_raw_pit_{TARGET_SEASON}.csv"

def _load_steamer_pit_from_cache(path: Path) -> tuple:
    df = pd.read_csv(path)
    df["playerid"] = pd.to_numeric(df["playerid"], errors="coerce")
    df["GS"]       = pd.to_numeric(df["GS"],       errors="coerce")
    df["IP"]       = pd.to_numeric(df["IP"],       errors="coerce")
    valid = df.dropna(subset=["playerid", "GS"])
    gs_map = dict(zip(valid["playerid"].astype(int), valid["GS"].fillna(0)))
    ip_map = dict(zip(valid["playerid"].astype(int), valid["IP"].fillna(0)))
    return gs_map, ip_map

try:
    steamer_pit_url = (
        f"https://www.fangraphs.com/api/projections"
        f"?type=steamer&stats=pit&pos=all&team=0&players=0&lg=all&season={TARGET_SEASON}"
    )
    resp_pit = _requests.get(steamer_pit_url, timeout=20,
                             headers={"User-Agent": "Mozilla/5.0"})
    if resp_pit.status_code == 200:
        pit_data = resp_pit.json()
        if pit_data and isinstance(pit_data, list) and len(pit_data) > 50:
            pit_df = pd.DataFrame(pit_data)
            if "GS" in pit_df.columns and "IP" in pit_df.columns and "playerid" in pit_df.columns:
                pit_df["playerid"] = pd.to_numeric(pit_df["playerid"], errors="coerce")
                pit_df["GS"]       = pd.to_numeric(pit_df["GS"],       errors="coerce")
                pit_df["IP"]       = pd.to_numeric(pit_df["IP"],       errors="coerce")
                valid_pit = pit_df.dropna(subset=["playerid", "GS"])
                steamer_gs_map = dict(zip(valid_pit["playerid"].astype(int), valid_pit["GS"].fillna(0)))
                steamer_ip_map = dict(zip(valid_pit["playerid"].astype(int), valid_pit["IP"].fillna(0)))
                print(f"  Steamer {TARGET_SEASON} GS/IP projections: {len(steamer_gs_map):,} pitchers (live).")
    else:
        raise ValueError(f"HTTP {resp_pit.status_code}")
except Exception as exc:
    if _pit_cache.exists():
        steamer_gs_map, steamer_ip_map = _load_steamer_pit_from_cache(_pit_cache)
        print(f"  Steamer {TARGET_SEASON} GS/IP projections: {len(steamer_gs_map):,} pitchers (cache).")
    else:
        print(f"  Steamer pitching unavailable ({exc}); using rotation heuristic.")

playing_time_df = build_playing_time(
    hitter_talent_df  = hitter_talent_df,
    pitcher_talent_df = pitcher_talent_df,
    batting_by_year   = batting_by_year,
    pitching_by_year  = pitching_by_year,
    target_season     = TARGET_SEASON,
    steamer_pa_map    = steamer_pa_map if steamer_pa_map else None,
    steamer_gs_map    = steamer_gs_map if steamer_gs_map else None,
    steamer_ip_map    = steamer_ip_map if steamer_ip_map else None,
)
print()


# ---------------------------------------------------------------------------
# STEP 10: EROSP raw (no injury map — pre-season)
# ---------------------------------------------------------------------------
print("─── Step 10: EROSP raw (no injury deductions) ───────────────────")
projection_df = compute_all_erosp_raw(
    hitter_talent_df      = hitter_talent_df,
    pitcher_talent_df     = pitcher_talent_df,
    playing_time_df       = playing_time_df,
    schedule_summary      = schedule_summary,
    mlb_team_abbrev_to_id = abbrev_to_team_id,
    injury_map            = None,
)
print()


# ---------------------------------------------------------------------------
# STEP 11: Replacement levels + startability (no ESPN roster)
# ---------------------------------------------------------------------------
print("─── Step 11: Replacement levels + startability ──────────────────")
h_proj = projection_df[projection_df["player_type"] == "hitter"] if not projection_df.empty else pd.DataFrame()
p_proj = projection_df[projection_df["player_type"].isin(["sp", "rp"])] if not projection_df.empty else pd.DataFrame()

replacement_levels = compute_replacement_levels(
    hitter_projection_df  = h_proj,
    pitcher_projection_df = p_proj,
    hitter_talent_df      = hitter_talent_df,
    pitcher_talent_df     = pitcher_talent_df,
)

# No ESPN roster → pass empty map; all players get fantasy_team_id=0
projection_df = compute_erosp_startable(
    projection_df      = projection_df,
    hitter_talent_df   = hitter_talent_df,
    pitcher_talent_df  = pitcher_talent_df,
    espn_roster_map    = {},
    replacement_levels = replacement_levels,
)
print()


# ---------------------------------------------------------------------------
# STEP 12: Attach position metadata
# ---------------------------------------------------------------------------
print("─── Step 12: Attach metadata ────────────────────────────────────")
position_map: dict = {}
if not hitter_talent_df.empty:
    position_map.update(hitter_talent_df["mlb_position"].to_dict())
if not pitcher_talent_df.empty:
    for mid, row in pitcher_talent_df.iterrows():
        pos = str(row.get("mlb_position", row.get("role", "SP"))).upper()
        if pos == "P":
            pos = str(row.get("role", "SP")).upper()
        position_map[mid] = pos

POS_NORMALIZE = {"LF": "OF", "CF": "OF", "RF": "OF"}
projection_df["position"] = projection_df.index.map(
    lambda mid: POS_NORMALIZE.get(str(position_map.get(mid, "—")), str(position_map.get(mid, "—")))
)
projection_df["games_remaining"] = projection_df["games_remaining"].fillna(FULL_SEASON_GAMES).astype(int)
projection_df["erosp_per_game"]  = (
    projection_df["erosp_startable"] / projection_df["games_remaining"].clip(lower=1)
).round(3)
print()


# ---------------------------------------------------------------------------
# STEP 13: Write backtest projection JSON
# ---------------------------------------------------------------------------
print("─── Step 13: Writing backtest projection ────────────────────────")
output_dir = PROJECT_DIR / "data" / "erosp"
output_dir.mkdir(exist_ok=True)

output_players = []
seen_mlbam: set = set()
for mlbam_id, row in projection_df.sort_values("erosp_startable", ascending=False).iterrows():
    if mlbam_id in seen_mlbam:
        continue
    seen_mlbam.add(mlbam_id)
    erosp_startable = float(row.get("erosp_startable", 0))
    erosp_raw       = float(row.get("erosp_raw", 0))
    if erosp_startable < 5.0 and erosp_raw < 5.0:
        continue

    player: dict = {
        "mlbam_id":        int(mlbam_id),
        "name":            str(row.get("name", "")),
        "position":        str(row.get("position", "—")),
        "mlb_team":        str(row.get("mlb_team", "")),
        "role":            str(row.get("role", "H")),
        "erosp_raw":       round(erosp_raw, 1),
        "erosp_startable": round(erosp_startable, 1),
        "erosp_per_game":  round(float(row.get("erosp_per_game", 0)), 3),
        "games_remaining": int(row.get("games_remaining", FULL_SEASON_GAMES)),
        "start_probability": round(float(row.get("start_probability", 1.0)), 3),
        "cap_factor":      round(float(row.get("cap_factor", 1.0)), 3),
    }
    output_players.append(player)

backtest_json_path = output_dir / f"backtest_{TARGET_SEASON}.json"
with open(backtest_json_path, "w") as f:
    json.dump({
        "generated_at":  datetime.datetime.utcnow().isoformat() + "Z",
        "season":        TARGET_SEASON,
        "target_type":   "backtest_preseason",
        "history_years": HISTORICAL_YEARS,
        "total_players": len(output_players),
        "players":       output_players,
    }, f, indent=2)
print(f"  ✓ Wrote {len(output_players):,} players → {backtest_json_path.relative_to(PROJECT_DIR)}")
print()


# ---------------------------------------------------------------------------
# STEP 14: Compare vs. actual season results
# ---------------------------------------------------------------------------
print(f"\n{'='*65}")
print(f"  COMPARISON: EROSP Pre-Season vs. Actual {TARGET_SEASON} Fantasy Points")
print(f"{'='*65}\n")

hist_path = PROJECT_DIR / "data" / "historical" / f"{TARGET_SEASON}.json"
if not hist_path.exists():
    print(f"ERROR: No historical data at {hist_path}")
    sys.exit(1)

with open(hist_path) as f:
    hist_data = json.load(f)


def norm_name(n: str) -> str:
    """Normalize player name for fuzzy matching."""
    return re.sub(r'[^a-z0-9]', '', n.lower().replace("jr.", "").replace("sr.", ""))


# Build actual points map by normalized name (take max if player traded between teams)
actual_by_norm: dict = {}
for roster in hist_data.get("rosters", []):
    for p in roster.get("players", []):
        nm  = p.get("playerName", "")
        pts = float(p.get("totalPoints", 0))
        key = norm_name(nm)
        if key not in actual_by_norm or pts > actual_by_norm[key]["pts"]:
            actual_by_norm[key] = {
                "name":     nm,
                "pts":      pts,
                "espn_id":  str(p.get("playerId", "")),
                "position": p.get("position", ""),
            }

print(f"  Historical data:    {len(actual_by_norm):,} unique rostered players in {TARGET_SEASON}")
print(f"  EROSP projections:  {len(output_players):,} players")

# Match on normalized name
matched = []
unmatched_erosp = []
for p in output_players:
    key = norm_name(p["name"])
    if key in actual_by_norm:
        act = actual_by_norm[key]
        matched.append({
            "name":            p["name"],
            "position":        p["position"],
            "role":            p["role"],
            "erosp_raw":       p["erosp_raw"],
            "erosp_startable": p["erosp_startable"],
            "actual_pts":      act["pts"],
        })
    else:
        unmatched_erosp.append(p["name"])

print(f"  Matched:            {len(matched):,} players")
print(f"  EROSP-only (FA/minors/unrostered): {len(unmatched_erosp):,}")
unmatched_actual = [v["name"] for k, v in actual_by_norm.items()
                    if k not in {norm_name(p["name"]) for p in output_players}]
print(f"  Actual-only (no EROSP projection): {len(unmatched_actual):,}")
print()

df_m = pd.DataFrame(matched)
df_m = df_m[df_m["actual_pts"] > 0].copy()
print(f"  Matched with >0 actual pts: {len(df_m):,} players\n")

if len(df_m) < 20:
    print("Not enough matched players for meaningful analysis.")
    sys.exit(1)

# Add rank columns
df_m["proj_rank"]   = df_m["erosp_raw"].rank(ascending=False).astype(int)
df_m["actual_rank"] = df_m["actual_pts"].rank(ascending=False).astype(int)
df_m["error"]       = df_m["erosp_raw"] - df_m["actual_pts"]
df_m["abs_error"]   = df_m["error"].abs()
df_m["rank_diff"]   = df_m["proj_rank"] - df_m["actual_rank"]  # positive = projected too low


def pearson_r(x, y):
    xm = x - x.mean()
    ym = y - y.mean()
    return (xm * ym).sum() / (np.sqrt((xm**2).sum()) * np.sqrt((ym**2).sum()))


def spearman_r(x, y):
    rx = x.rank()
    ry = y.rank()
    return pearson_r(rx, ry)


# ── Overall stats ──
print("  ── Overall Accuracy ──────────────────────────────────────────")
for col, label in [("erosp_raw", "EROSP Raw"), ("erosp_startable", "EROSP Startable")]:
    x   = df_m[col]
    y   = df_m["actual_pts"]
    r   = pearson_r(x, y)
    rho = spearman_r(x, y)
    rmse = np.sqrt(((x - y) ** 2).mean())
    mae  = (x - y).abs().mean()
    bias = (x - y).mean()
    n    = len(df_m)
    print(f"\n  {label}  (n={n})")
    print(f"    Pearson  r  = {r:.3f}")
    print(f"    Spearman ρ  = {rho:.3f}")
    print(f"    RMSE        = {rmse:.1f} pts")
    print(f"    MAE         = {mae:.1f} pts")
    print(f"    Bias        = {bias:+.1f} pts  ({'over' if bias > 0 else 'under'}-projected on average)")
print()

# ── Top 25 players by EROSP Raw ──
print("  ── Top 25 by EROSP Raw — did we rank them correctly? ──────────")
print(f"  {'#':>3}  {'Name':<26} {'Pos':<4} {'Proj':>6}  {'Actual':>6}  {'Err':>7}  {'ActRank':>7}")
print(f"  {'-'*70}")
top25 = df_m.nlargest(25, "erosp_raw")
for i, (idx, r) in enumerate(top25.iterrows(), 1):
    err_str = f"{r['error']:+.0f}"
    print(f"  #{i:>2}  {r['name']:<26} {r['position']:<4} {r['erosp_raw']:>6.0f}  {r['actual_pts']:>6.0f}  {err_str:>7}  #{r['actual_rank']:>3}")
print()

# ── Biggest over-projections ──
print("  ── Biggest OVER-projections (too optimistic) ───────────────────")
print(f"  {'Name':<26} {'Pos':<4} {'Proj':>6}  {'Actual':>6}  {'Error':>7}  {'Note'}")
print(f"  {'-'*72}")
over = df_m.nlargest(15, "error")
for _, r in over.iterrows():
    note = "injury" if r["actual_pts"] < r["erosp_raw"] * 0.4 else ""
    print(f"  {r['name']:<26} {r['position']:<4} {r['erosp_raw']:>6.0f}  {r['actual_pts']:>6.0f}  {r['error']:>+7.0f}  {note}")
print()

# ── Biggest under-projections ──
print("  ── Biggest UNDER-projections (too conservative) ────────────────")
print(f"  {'Name':<26} {'Pos':<4} {'Proj':>6}  {'Actual':>6}  {'Error':>7}")
print(f"  {'-'*65}")
under = df_m.nsmallest(15, "error")
for _, r in under.iterrows():
    print(f"  {r['name']:<26} {r['position']:<4} {r['erosp_raw']:>6.0f}  {r['actual_pts']:>6.0f}  {r['error']:>+7.0f}")
print()

# ── Accuracy by position ──
print("  ── Rank Accuracy by Position ───────────────────────────────────")
print(f"  {'Pos':<4} {'n':>4}  {'Pearson r':>9}  {'Spearman ρ':>10}  {'RMSE':>6}  {'MAE':>6}  {'Bias':>7}")
print(f"  {'-'*60}")
for pos in ["C", "1B", "2B", "3B", "SS", "OF", "SP", "RP", "DH"]:
    if pos in ("SP", "RP"):
        sub = df_m[df_m["role"] == pos]
    else:
        sub = df_m[df_m["position"] == pos]
    if len(sub) < 5:
        continue
    x   = sub["erosp_raw"]
    y   = sub["actual_pts"]
    r   = pearson_r(x, y)
    rho = spearman_r(x, y)
    rmse = np.sqrt(((x - y) ** 2).mean())
    mae  = (x - y).abs().mean()
    bias = (x - y).mean()
    print(f"  {pos:<4} {len(sub):>4}  {r:>9.3f}  {rho:>10.3f}  {rmse:>6.1f}  {mae:>6.1f}  {bias:>+7.1f}")
print()

# ── Save comparison CSV ──
csv_path = output_dir / f"backtest_{TARGET_SEASON}.csv"
df_m.sort_values("erosp_raw", ascending=False).to_csv(csv_path, index=False)
print(f"  ✓ Saved comparison CSV → {csv_path.relative_to(PROJECT_DIR)}")

print(f"\n{'='*65}")
print(f"  ✓ Backtest complete for {TARGET_SEASON}")
print(f"    n={len(df_m):,} matched players")
top5 = output_players[:5]
print(f"    Top 5 projected:")
for p in top5:
    print(f"      {p['name']:<24} {p['position']:<4} EROSP_R={p['erosp_raw']:.0f}")
print(f"{'='*65}\n")
