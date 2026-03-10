#!/usr/bin/env python3
"""
Compute EROSP — Expected Rest of Season Fantasy Points
=======================================================
Orchestrates all EROSP sub-modules and writes data/erosp/latest.json.

Usage:
    python compute_erosp.py

Requirements:
    pip install pybaseball pandas numpy requests python-mlb-statsapi
"""

import os
import sys
import json
import time
import datetime
import warnings
from pathlib import Path

import pandas as pd
import numpy as np

warnings.filterwarnings("ignore")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR  = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR    = PROJECT_DIR / "data" / "erosp"
DATA_DIR.mkdir(exist_ok=True)

sys.path.insert(0, str(SCRIPT_DIR))

# ---------------------------------------------------------------------------
# Imports
# ---------------------------------------------------------------------------
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
    load_espn_data,
    build_name_to_mlbam, build_name_to_mlbam_from_chadwick,
    build_fangraphs_to_mlbam, espn_name_to_mlbam,
)
from erosp.talent import estimate_hitter_talent, estimate_pitcher_talent
from erosp.playing_time import build_playing_time
from erosp.projection import compute_all_erosp_raw
from erosp.startability import compute_replacement_levels, compute_erosp_startable


# ---------------------------------------------------------------------------
# Year logic
# ---------------------------------------------------------------------------
today         = datetime.date.today()
current_year  = today.year
current_month = today.month

# Target season: Nov/Dec → next year, else current year
if current_month >= 11:
    TARGET_SEASON    = current_year + 1
    HISTORICAL_YEARS = [current_year, current_year - 1, current_year - 2]
else:
    TARGET_SEASON    = current_year
    HISTORICAL_YEARS = [current_year - 1, current_year - 2, current_year - 3]

Y1, Y2, Y3 = HISTORICAL_YEARS

# Is the season in progress? (After March 27 and before Oct 5)
SEASON_STARTED = (
    datetime.date(TARGET_SEASON, 3, 27) <= today < datetime.date(TARGET_SEASON, 10, 5)
)

print(f"\n{'='*65}")
print(f"  EROSP — Expected Rest of Season Fantasy Points")
print(f"{'='*65}")
print(f"  Target season:  {TARGET_SEASON}")
print(f"  History years:  {Y1}, {Y2}, {Y3}")
print(f"  Season started: {SEASON_STARTED}")
print(f"  Run date:       {today.strftime('%B %d, %Y')}")
print(f"{'='*65}\n")


# ---------------------------------------------------------------------------
# STEP 1: ID mapping
# ---------------------------------------------------------------------------
print("─── Step 1: ID mapping ───────────────────────────────────────────")
id_map_df      = fetch_id_map()
fg_to_mlbam    = build_fangraphs_to_mlbam(id_map_df)
# Use raw Chadwick (no key_fangraphs dedup) so players with key_fangraphs=-1
# (e.g. James Wood, Paul Skenes, Nick Kurtz, Roman Anthony) are included.
name_to_mlbam  = build_name_to_mlbam_from_chadwick()
print()


# ---------------------------------------------------------------------------
# STEP 2: Batting statistics
# ---------------------------------------------------------------------------
print("─── Step 2: Batting statistics ──────────────────────────────────")
batting_by_year = fetch_batting_stats(HISTORICAL_YEARS, min_pa=100)
if SEASON_STARTED:
    cur_bat = fetch_batting_stats([TARGET_SEASON], min_pa=10)
    batting_by_year.update(cur_bat)

if not batting_by_year:
    print("ERROR: No batting data. Exiting.")
    sys.exit(1)
print()


# ---------------------------------------------------------------------------
# STEP 3: Pitching statistics
# ---------------------------------------------------------------------------
print("─── Step 3: Pitching statistics ─────────────────────────────────")
pitching_by_year = fetch_pitching_stats(HISTORICAL_YEARS, min_ip=20)
if SEASON_STARTED:
    cur_pit = fetch_pitching_stats([TARGET_SEASON], min_ip=5)
    pitching_by_year.update(cur_pit)
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
# STEP 6: Player info (birth dates + positions)
# ---------------------------------------------------------------------------
print("─── Step 6: Player info (ages + positions) ───────────────────────")
all_fgids   = set()
for df in batting_by_year.values():
    all_fgids |= set(df["IDfg"].dropna().astype(int).tolist())
for df in pitching_by_year.values():
    all_fgids |= set(df["IDfg"].dropna().astype(int).tolist())

all_mlbam_ids = [fg_to_mlbam[fgid] for fgid in all_fgids if fgid in fg_to_mlbam]
# Also include MLBAM IDs from the name fallback (players with key_fangraphs=-1)
name_fallback_ids = list(name_to_mlbam.values())
all_mlbam_ids = list(set(all_mlbam_ids) | set(name_fallback_ids))
player_info_df = fetch_player_info(all_mlbam_ids)
print()


# ---------------------------------------------------------------------------
# STEP 7: MLB schedule summary
# ---------------------------------------------------------------------------
print("─── Step 7: MLB schedule ─────────────────────────────────────────")
schedule_summary = fetch_schedule_summary(TARGET_SEASON)
# Build abbrev → MLB team ID reverse map
abbrev_to_team_id = {v["abbrev"]: k for k, v in schedule_summary.items()}
print()


# ---------------------------------------------------------------------------
# STEP 8: Talent estimation
# ---------------------------------------------------------------------------
print("─── Step 8: Talent estimation ────────────────────────────────────")
print("  Hitters:")
hitter_talent_df = estimate_hitter_talent(
    batting_by_year    = batting_by_year,
    historical_years   = HISTORICAL_YEARS,
    player_info_df     = player_info_df,
    xwoba_by_year      = xwoba_by_year,
    sprint_speed_df    = sprint_speed_df,
    target_season      = TARGET_SEASON,
    fg_to_mlbam        = fg_to_mlbam,
    name_to_mlbam      = name_to_mlbam,
)

print("  Pitchers:")
pitcher_talent_df = estimate_pitcher_talent(
    pitching_by_year = pitching_by_year,
    historical_years = HISTORICAL_YEARS,
    player_info_df   = player_info_df,
    target_season    = TARGET_SEASON,
    fg_to_mlbam      = fg_to_mlbam,
    name_to_mlbam    = name_to_mlbam,
)
print()


# ---------------------------------------------------------------------------
# STEP 9: Playing time
# ---------------------------------------------------------------------------
print("─── Step 9: Playing time ────────────────────────────────────────")

# Steamer PA projections (optional — same fetch as generate_projections.py)
steamer_pa_map: dict = {}
try:
    import requests
    steamer_url = (
        "https://www.fangraphs.com/api/projections"
        "?type=steamer&stats=bat&pos=all&team=0&players=0&lg=all"
    )
    resp = requests.get(steamer_url, timeout=12,
                        headers={"User-Agent": "Mozilla/5.0"})
    if resp.status_code == 200:
        proj_data = resp.json()
        if proj_data and isinstance(proj_data, list) and len(proj_data) > 50:
            proj_df = pd.DataFrame(proj_data)
            if "PA" in proj_df.columns and "playerid" in proj_df.columns:
                proj_df["playerid"] = pd.to_numeric(proj_df["playerid"], errors="coerce")
                proj_df["PA"]       = pd.to_numeric(proj_df["PA"], errors="coerce")
                steamer_pa_map = dict(
                    zip(proj_df["playerid"].dropna().astype(int),
                        proj_df["PA"].fillna(0))
                )
                print(f"  Steamer PA projections: {len(steamer_pa_map):,} players.")
except Exception as exc:
    print(f"  Steamer projections unavailable ({exc}); using defaults.")

playing_time_df = build_playing_time(
    hitter_talent_df  = hitter_talent_df,
    pitcher_talent_df = pitcher_talent_df,
    batting_by_year   = batting_by_year,
    pitching_by_year  = pitching_by_year,
    target_season     = TARGET_SEASON,
    steamer_pa_map    = steamer_pa_map if steamer_pa_map else None,
)
print()


# ---------------------------------------------------------------------------
# STEP 10: EROSP raw
# ---------------------------------------------------------------------------
print("─── Step 10: EROSP raw ──────────────────────────────────────────")
projection_df = compute_all_erosp_raw(
    hitter_talent_df    = hitter_talent_df,
    pitcher_talent_df   = pitcher_talent_df,
    playing_time_df     = playing_time_df,
    schedule_summary    = schedule_summary,
    mlb_team_abbrev_to_id = abbrev_to_team_id,
)
print()


# ---------------------------------------------------------------------------
# STEP 11: Replacement levels + startability
# ---------------------------------------------------------------------------
print("─── Step 11: Replacement levels + startability ──────────────────")
h_proj = projection_df[projection_df["player_type"] == "hitter"] if not projection_df.empty else pd.DataFrame()
p_proj = projection_df[projection_df["player_type"].isin(["sp", "rp"])] if not projection_df.empty else pd.DataFrame()

replacement_levels = compute_replacement_levels(
    hitter_projection_df = h_proj,
    pitcher_projection_df = p_proj,
    hitter_talent_df     = hitter_talent_df,
    pitcher_talent_df    = pitcher_talent_df,
)

# Load ESPN data for fantasy team assignments
rostered_players, free_agents, espn_to_team = load_espn_data()
print()

# Build ESPN player ID → mlbam_id mapping (name-based)
espn_id_to_mlbam: dict = {}
mlbam_to_fantasy_team: dict = {}
mlbam_to_espn_id: dict = {}
mlbam_to_fa_status: dict = {}

all_espn_players = [
    {"playerName": p.get("playerName", ""), "playerId": p.get("playerId", ""),
     "fantasyTeamId": p.get("fantasyTeamId"), "position": p.get("position", "")}
    for p in rostered_players
] + [
    {"playerName": p.get("playerName", ""), "playerId": p.get("playerId", ""),
     "fantasyTeamId": None, "position": p.get("position", "")}
    for p in free_agents
]

for p in all_espn_players:
    espn_name  = str(p.get("playerName", ""))
    espn_id    = str(p.get("playerId", ""))
    team_id    = p.get("fantasyTeamId")
    is_fa      = team_id is None

    mlbam = espn_name_to_mlbam(espn_name, name_to_mlbam)
    if mlbam:
        mlbam_to_fantasy_team[mlbam] = team_id if team_id else 0
        mlbam_to_espn_id[mlbam]      = espn_id
        mlbam_to_fa_status[mlbam]    = is_fa

print(f"  ESPN name→MLBAM: {len(mlbam_to_espn_id):,} players matched.")

projection_df = compute_erosp_startable(
    projection_df    = projection_df,
    hitter_talent_df = hitter_talent_df,
    pitcher_talent_df = pitcher_talent_df,
    espn_roster_map  = {str(k): v for k, v in mlbam_to_fantasy_team.items()},
    replacement_levels = replacement_levels,
)
print()


# ---------------------------------------------------------------------------
# STEP 12: Attach position + fantasy team info
# ---------------------------------------------------------------------------
print("─── Step 12: Attach metadata ────────────────────────────────────")

position_map: dict = {}
if not hitter_talent_df.empty:
    position_map.update(hitter_talent_df["mlb_position"].to_dict())
if not pitcher_talent_df.empty:
    for mid, row in pitcher_talent_df.iterrows():
        pos = str(row.get("mlb_position", row.get("role", "SP"))).upper()
        # Normalize: generic 'P' from MLB API → use fantasy role (SP/RP)
        if pos == "P":
            pos = str(row.get("role", "SP")).upper()
        if pos in ("SP", "RP"):
            position_map[mid] = pos
        elif pos not in position_map:
            position_map[mid] = pos

POS_NORMALIZE = {"LF": "OF", "CF": "OF", "RF": "OF"}

projection_df["position"]       = projection_df.index.map(
    lambda mid: POS_NORMALIZE.get(str(position_map.get(mid, "—")),
                                   str(position_map.get(mid, "—")))
)
projection_df["fantasy_team_id"] = projection_df.index.map(
    lambda mid: mlbam_to_fantasy_team.get(mid, 0)
)
projection_df["espn_id"]         = projection_df.index.map(
    lambda mid: mlbam_to_espn_id.get(mid, "")
)
projection_df["is_fa"]           = projection_df.index.map(
    lambda mid: mlbam_to_fa_status.get(mid, True)
)

# erosp per remaining game
projection_df["games_remaining"] = projection_df["games_remaining"].fillna(FULL_SEASON_GAMES).astype(int)
projection_df["erosp_per_game"] = (
    projection_df["erosp_startable"] / projection_df["games_remaining"].clip(lower=1)
).round(3)


# ---------------------------------------------------------------------------
# STEP 13: Output
# ---------------------------------------------------------------------------
print("─── Step 13: Writing output ─────────────────────────────────────")

output_players = []
seen_mlbam: set = set()
for mlbam_id, row in projection_df.sort_values("erosp_startable", ascending=False).iterrows():
    if mlbam_id in seen_mlbam:
        continue
    seen_mlbam.add(mlbam_id)
    erosp_startable = float(row.get("erosp_startable", 0))
    erosp_raw       = float(row.get("erosp_raw", 0))

    # Only include players with meaningful projections (>5 startable pts)
    if erosp_startable < 5.0 and erosp_raw < 5.0:
        continue

    player: dict = {
        "mlbam_id":        int(mlbam_id),
        "espn_id":         str(row.get("espn_id", "")),
        "name":            str(row.get("name", "")),
        "position":        str(row.get("position", "—")),
        "mlb_team":        str(row.get("mlb_team", "")),
        "role":            str(row.get("role", "H")),
        "fantasy_team_id": int(row.get("fantasy_team_id", 0)) if row.get("fantasy_team_id") else 0,
        "is_fa":           bool(row.get("is_fa", True)),
        "erosp_raw":       round(erosp_raw, 1),
        "erosp_startable": round(erosp_startable, 1),
        "erosp_per_game":  round(float(row.get("erosp_per_game", 0)), 3),
        "games_remaining": int(row.get("games_remaining", FULL_SEASON_GAMES)),
        "start_probability": round(float(row.get("start_probability", 1.0)), 3),
        "cap_factor":      round(float(row.get("cap_factor", 1.0)), 3),
    }

    # Role-specific extras
    if row.get("player_type") == "hitter":
        player["pa_per_game"]  = round(float(row.get("daily_ev_raw", 0) / max(
            abs(float(row.get("fp_per_pa", 0.001))), 0.001)), 2)
        player["fp_per_pa"]    = round(float(row.get("fp_per_pa", 0)), 3)
    elif row.get("player_type") == "sp":
        player["projected_starts"] = round(float(row.get("projected_starts", 0)), 1)
        player["fp_per_start"]     = round(float(row.get("fp_per_start", 0)), 2)
    elif row.get("player_type") == "rp":
        player["rp_role"] = str(row.get("rp_role", "middle"))

    output_players.append(player)

# Season games remaining (average across all teams)
avg_games_remaining = int(
    projection_df["games_remaining"].median()
) if not projection_df.empty else FULL_SEASON_GAMES

output = {
    "generated_at":   datetime.datetime.utcnow().isoformat() + "Z",
    "season":         TARGET_SEASON,
    "games_remaining": avg_games_remaining,
    "season_started": SEASON_STARTED,
    "total_players":  len(output_players),
    "players":        output_players,
}

output_path = DATA_DIR / "latest.json"
with open(output_path, "w") as f:
    json.dump(output, f, indent=2)

print(f"  ✓ Wrote {len(output_players):,} players to {output_path}")
print(f"\n{'='*65}")
print(f"  ✓ EROSP computation complete!")
print(f"    Season:       {TARGET_SEASON}")
print(f"    Players:      {len(output_players):,}")
print(f"    Output:       {output_path.relative_to(PROJECT_DIR)}")
if output_players:
    top5 = output_players[:5]
    print(f"    Top 5 (startable):")
    for p in top5:
        print(f"      {p['name']:<24} {p['position']:<4} {p['mlb_team']:<4} "
              f"EROSP_S={p['erosp_startable']:.0f}  EROSP_R={p['erosp_raw']:.0f}")
print(f"{'='*65}\n")
