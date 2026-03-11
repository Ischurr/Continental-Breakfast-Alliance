"""
Playing time projection module for EROSP.

Estimates for each player:
  - Hitters: p_play (probability in lineup on a given game day), pa_per_game
  - Starters: p_start_per_day, ip_per_start
  - Relievers: p_appear_per_game, ip_per_app
"""

from typing import Dict, Optional
import numpy as np
import pandas as pd

from .config import (
    DEFAULT_P_PLAY_HITTER, DEFAULT_PA_PER_GAME,
    DEFAULT_IP_PER_START, DEFAULT_P_APPEAR_RP, DEFAULT_IP_PER_APP,
    ROTATION_DAYS, FULL_SEASON_GAMES,
)


# ---------------------------------------------------------------------------
# Hitter playing time
# ---------------------------------------------------------------------------

def estimate_hitter_playing_time(
    talent_df: pd.DataFrame,
    batting_by_year: Dict,
    current_season_year: int,
    steamer_pa_map: Optional[Dict[int, float]] = None,
) -> pd.DataFrame:
    """
    Returns DataFrame (same index as talent_df) with columns:
      p_play:      probability of being in the starting lineup on a given game day
      pa_per_game: expected plate appearances per game if playing
    """
    result = talent_df[["name", "age", "mlb_team"]].copy()
    result["p_play"]      = DEFAULT_P_PLAY_HITTER
    result["pa_per_game"] = DEFAULT_PA_PER_GAME

    # If current-season data available, use last-14-day start rate
    if current_season_year in batting_by_year:
        cur_df = batting_by_year[current_season_year]
        # Infer start rate from G / team_games (approximate)
        for mlbam_id, row in talent_df.iterrows():
            fgid = int(row.get("fgid", 0))
            match = cur_df[cur_df["IDfg"] == fgid] if fgid else pd.DataFrame()
            if match.empty:
                continue
            p = match.iloc[0]
            games = float(p.get("G", 0))
            pa    = float(p.get("PA", 0))
            # If player has played at least 14 games this season, use actual rate
            if games >= 14:
                team_games = games / DEFAULT_P_PLAY_HITTER  # rough estimate
                p_play = min(games / max(team_games, 1), 1.0)
                pa_per_g = pa / max(games, 1)
                result.at[mlbam_id, "p_play"]      = round(float(p_play), 4)
                result.at[mlbam_id, "pa_per_game"] = round(float(pa_per_g), 2)

    # Use Steamer projected PA to infer playing time if available
    if steamer_pa_map:
        for mlbam_id, row in talent_df.iterrows():
            fgid = int(row.get("fgid", 0))
            if fgid and fgid in steamer_pa_map:
                proj_pa   = float(steamer_pa_map[fgid])
                pa_per_g  = proj_pa / FULL_SEASON_GAMES
                p_play    = min(pa_per_g / DEFAULT_PA_PER_GAME, 1.0)
                if p_play > 0:
                    result.at[mlbam_id, "p_play"]      = round(float(p_play), 4)
                    result.at[mlbam_id, "pa_per_game"] = round(float(min(pa_per_g, 5.0)), 2)

    return result


# ---------------------------------------------------------------------------
# Starter playing time
# ---------------------------------------------------------------------------

def estimate_sp_playing_time(
    pitcher_talent_df: pd.DataFrame,
    pitching_by_year: Dict,
    current_season_year: int,
) -> pd.DataFrame:
    """
    Returns DataFrame (same index as pitcher_talent_df, SP only) with:
      p_start_per_day: probability of starting on a given team-game day
      ip_per_start:    expected IP per start
      is_sp:           True if classified as a starting pitcher
    """
    sp_df = pitcher_talent_df[pitcher_talent_df["role"] == "SP"].copy()
    result = sp_df[["name", "mlb_team"]].copy()

    # Set defaults
    result["p_start_per_day"] = 1.0 / ROTATION_DAYS   # 0.2 for 5-man rotation slot
    result["ip_per_start"]    = sp_df["ip_per_gs"].clip(lower=3.0, upper=9.0).fillna(DEFAULT_IP_PER_START)
    result["is_sp"]           = True

    # Adjust p_start based on rotation depth within team
    # Teams with many SPs → some pitchers get fewer starts
    team_sp_counts = sp_df.groupby("mlb_team").size()

    # Composite quality score: mirrors per-IP FP formula (K+1, ER-2, BB-1)
    sp_df = sp_df.copy()
    sp_df["_quality"] = (
        sp_df["k_per_ip"].fillna(0)
        - 2 * sp_df["er_per_ip"].fillna(0.467)
        - sp_df["bb_per_ip"].fillna(0.330)
    )

    for mlbam_id, row in sp_df.iterrows():
        team = str(row.get("mlb_team", ""))
        n_sp_on_team = int(team_sp_counts.get(team, 5))

        if n_sp_on_team <= 5:
            # Standard 5-man rotation: each gets ~32 starts / 162 games ≈ 0.198
            p_start = 1.0 / ROTATION_DAYS
        else:
            # 6+ SPs: rank by quality, give top 5 full rotation slots
            team_sps = sp_df[sp_df["mlb_team"] == team].sort_values("_quality", ascending=False)
            rank = list(team_sps.index).index(mlbam_id) if mlbam_id in team_sps.index else n_sp_on_team - 1
            if rank < 5:
                p_start = 1.0 / ROTATION_DAYS
            elif rank == 5:
                p_start = 15.0 / FULL_SEASON_GAMES   # spot/6th starter
            elif rank == 6:
                p_start = 8.0 / FULL_SEASON_GAMES
            else:
                p_start = 3.0 / FULL_SEASON_GAMES    # fringe/emergency starter

        result.at[mlbam_id, "p_start_per_day"] = round(float(p_start), 4)

    return result


# ---------------------------------------------------------------------------
# Reliever playing time
# ---------------------------------------------------------------------------

def estimate_rp_playing_time(
    pitcher_talent_df: pd.DataFrame,
    pitching_by_year: Dict,
    current_season_year: int,
) -> pd.DataFrame:
    """
    Returns DataFrame for RP-role pitchers with:
      p_appear_per_game: probability of appearing in a given team game
      ip_per_app:        expected IP per appearance
      rp_role:           "closer", "setup", "middle"
    """
    rp_df = pitcher_talent_df[pitcher_talent_df["role"] == "RP"].copy()
    result = rp_df[["name", "mlb_team"]].copy()

    # Default playing time
    result["p_appear_per_game"] = DEFAULT_P_APPEAR_RP
    result["ip_per_app"]        = rp_df["ip_per_app"].clip(lower=0.2, upper=1.5).fillna(DEFAULT_IP_PER_APP)
    result["rp_role"]           = "middle"

    # Classify closer vs setup vs middle based on SV and HD rates
    for mlbam_id, row in rp_df.iterrows():
        sv_rate = float(row.get("sv_per_g", 0.0))
        hd_rate = float(row.get("hd_per_g", 0.0))

        if sv_rate >= 0.25:    # saves in 25%+ of appearances → closer
            result.at[mlbam_id, "rp_role"]           = "closer"
            result.at[mlbam_id, "p_appear_per_game"] = 0.40
        elif hd_rate >= 0.25 or sv_rate >= 0.10:  # frequent high-leverage
            result.at[mlbam_id, "rp_role"]           = "setup"
            result.at[mlbam_id, "p_appear_per_game"] = 0.38
        else:
            result.at[mlbam_id, "rp_role"]           = "middle"
            result.at[mlbam_id, "p_appear_per_game"] = 0.30

    return result


# ---------------------------------------------------------------------------
# Combine into unified playing time DataFrame
# ---------------------------------------------------------------------------

def build_playing_time(
    hitter_talent_df: pd.DataFrame,
    pitcher_talent_df: pd.DataFrame,
    batting_by_year: Dict,
    pitching_by_year: Dict,
    target_season: int,
    steamer_pa_map: Optional[Dict[int, float]] = None,
) -> pd.DataFrame:
    """
    Returns a combined DataFrame indexed by mlbam_id with all playing time columns.
    """
    # Determine current season year (only matters if season is in progress)
    import datetime
    today = datetime.date.today()
    current_season_year = today.year if today.month >= 4 else today.year - 1

    frames = []

    # Hitters
    if not hitter_talent_df.empty:
        ht = estimate_hitter_playing_time(
            hitter_talent_df, batting_by_year,
            current_season_year, steamer_pa_map
        )
        ht["player_type"]    = "hitter"
        ht["is_sp"]          = False
        ht["is_rp"]          = False
        ht["p_start_per_day"] = 0.0
        ht["ip_per_start"]   = 0.0
        ht["p_appear_per_game"] = 0.0
        ht["ip_per_app"]     = 0.0
        ht["rp_role"]        = ""
        frames.append(ht)

    # SPs
    sp_talent = pitcher_talent_df[pitcher_talent_df["role"] == "SP"] if not pitcher_talent_df.empty else pd.DataFrame()
    if not sp_talent.empty:
        sp = estimate_sp_playing_time(pitcher_talent_df, pitching_by_year, current_season_year)
        sp["player_type"]   = "sp"
        sp["is_sp"]         = True
        sp["is_rp"]         = False
        sp["p_play"]        = 1.0   # pitchers always "in lineup" on start day
        sp["pa_per_game"]   = 0.0
        sp["p_appear_per_game"] = 0.0
        sp["ip_per_app"]    = 0.0
        sp["rp_role"]       = ""
        frames.append(sp)

    # RPs
    rp_talent = pitcher_talent_df[pitcher_talent_df["role"] == "RP"] if not pitcher_talent_df.empty else pd.DataFrame()
    if not rp_talent.empty:
        rp = estimate_rp_playing_time(pitcher_talent_df, pitching_by_year, current_season_year)
        rp["player_type"]   = "rp"
        rp["is_sp"]         = False
        rp["is_rp"]         = True
        rp["p_play"]        = 1.0
        rp["pa_per_game"]   = 0.0
        rp["p_start_per_day"] = 0.0
        rp["ip_per_start"]  = 0.0
        frames.append(rp)

    if not frames:
        return pd.DataFrame()

    combined = pd.concat(frames)

    # Ensure all columns exist
    for col, default in [
        ("p_play", DEFAULT_P_PLAY_HITTER),
        ("pa_per_game", DEFAULT_PA_PER_GAME),
        ("p_start_per_day", 0.0),
        ("ip_per_start", DEFAULT_IP_PER_START),
        ("p_appear_per_game", DEFAULT_P_APPEAR_RP),
        ("ip_per_app", DEFAULT_IP_PER_APP),
        ("rp_role", "middle"),
        ("is_sp", False),
        ("is_rp", False),
        ("player_type", "hitter"),
    ]:
        if col not in combined.columns:
            combined[col] = default

    print(f"    Playing time: {len(combined):,} total players "
          f"({combined['player_type'].value_counts().to_dict()}).")
    return combined
