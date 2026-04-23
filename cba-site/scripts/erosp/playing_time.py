"""
Playing time projection module for EROSP.

Estimates for each player:
  - Hitters: p_play (probability in lineup on a given game day), pa_per_game
  - Starters: p_start_per_day, ip_per_start
  - Relievers: p_appear_per_game, ip_per_app
"""

import datetime
from typing import Dict, Optional
import numpy as np
import pandas as pd

from .config import (
    DEFAULT_P_PLAY_HITTER, DEFAULT_PA_PER_GAME,
    DEFAULT_P_PLAY_CATCHER, DEFAULT_PA_PER_GAME_CATCHER,
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

    # Fix 4: Catchers play fewer games and bat lower in the order
    if "mlb_position" in talent_df.columns:
        catcher_mask = talent_df["mlb_position"].str.upper() == "C"
        result.loc[catcher_mask, "p_play"]      = DEFAULT_P_PLAY_CATCHER
        result.loc[catcher_mask, "pa_per_game"] = DEFAULT_PA_PER_GAME_CATCHER

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

    # Fix G (hitters): Healthy returnee PA floor.
    # If a hitter had 480+ PA in the most recently completed season, they were a
    # full-time starter and Steamer should not project them below 80% of that PA.
    # Addresses players like Story/Crawford who proved healthy in y0 but Steamer
    # still discounts due to earlier injury history.
    y0_year = current_season_year
    if y0_year in batting_by_year:
        y0_bat = batting_by_year[y0_year]
        healthy_hitter_count = 0
        for mlbam_id, row in talent_df.iterrows():
            fgid = int(row.get("fgid", 0))
            if not fgid:
                continue
            y0_match = y0_bat[y0_bat["IDfg"] == fgid]
            if y0_match.empty:
                continue
            y0_pa = float(y0_match.iloc[0].get("PA", 0))
            if y0_pa >= 480:
                pa_floor    = 0.80 * y0_pa
                p_play_floor = min(pa_floor / FULL_SEASON_GAMES / DEFAULT_PA_PER_GAME, 1.0)
                if result.at[mlbam_id, "p_play"] < p_play_floor:
                    result.at[mlbam_id, "p_play"] = round(float(p_play_floor), 4)
                    healthy_hitter_count += 1
        if healthy_hitter_count:
            print(f"    Fix G: {healthy_hitter_count} hitter(s) got healthy-returnee PA floor "
                  f"(≥480 PA in {y0_year}, floored at 80%).")

    return result


# ---------------------------------------------------------------------------
# Starter playing time
# ---------------------------------------------------------------------------

def estimate_sp_playing_time(
    pitcher_talent_df: pd.DataFrame,
    pitching_by_year: Dict,
    current_season_year: int,
    steamer_gs_map: Optional[Dict[int, float]] = None,
    steamer_ip_map: Optional[Dict[int, float]] = None,
) -> pd.DataFrame:
    """
    Returns DataFrame (same index as pitcher_talent_df, SP only) with:
      p_start_per_day: probability of starting on a given team-game day
      ip_per_start:    expected IP per start
      is_sp:           True if classified as a starting pitcher

    When steamer_gs_map / steamer_ip_map are provided, projected GS/IP override
    the rotation-tiering heuristic for pitchers that Steamer covers.
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

    # Override with Steamer projections where available — they're more accurate
    # than the rotation-tiering heuristic (account for depth chart, injuries, age).
    # p_start = projected_GS / FULL_SEASON (not games_remaining — the projection
    # formula scales to remaining games later via games_remaining * daily_ev).
    if steamer_gs_map or steamer_ip_map:
        for mlbam_id, row in sp_df.iterrows():
            fgid = int(row.get("fgid", 0))
            if not fgid:
                continue
            gs_proj = steamer_gs_map.get(fgid) if steamer_gs_map else None
            ip_proj = steamer_ip_map.get(fgid) if steamer_ip_map else None

            if gs_proj is not None and gs_proj > 0:
                p_start = float(gs_proj) / FULL_SEASON_GAMES
                # Cap at 1/ROTATION_DAYS — no pitcher can start every 4th game
                result.at[mlbam_id, "p_start_per_day"] = round(
                    float(min(p_start, 1.0 / ROTATION_DAYS)), 4
                )

            if gs_proj and ip_proj and float(gs_proj) > 0:
                ip_per_start = float(ip_proj) / float(gs_proj)
                result.at[mlbam_id, "ip_per_start"] = round(
                    float(np.clip(ip_per_start, 3.0, 9.0)), 2
                )

    # Fix H: In-season YTD pace anchor.
    # If a pitcher has ≥3 GS so far this season, their actual start pace is strong
    # evidence of rotation membership — use it as a p_start_per_day floor.  This
    # prevents healthy starters from being under-projected early in the season when
    # Fix C/G (which require 10+/28+ GS in the prior completed season) can't fire.
    # Also updates ip_per_start from YTD data when ≥5 starts are available.
    _today     = datetime.date.today()
    _open_year = _today.year if _today.month >= 4 else _today.year - 1
    _opening_day = datetime.date(_open_year, 3, 25)
    _days_elapsed = max((_today - _opening_day).days, 1)
    if current_season_year in pitching_by_year:
        ytd_sp_df = pitching_by_year[current_season_year]
        ytd_anchor_count = 0
        for mlbam_id, row in sp_df.iterrows():
            fgid = int(row.get("fgid", 0))
            if not fgid:
                continue
            ytd_match = ytd_sp_df[ytd_sp_df["IDfg"] == fgid]
            if ytd_match.empty:
                continue
            ytd_gs = float(ytd_match.iloc[0].get("GS", 0))
            if ytd_gs >= 3:
                pace_floor = round(min(ytd_gs / _days_elapsed, 1.0 / ROTATION_DAYS), 4)
                if result.at[mlbam_id, "p_start_per_day"] < pace_floor:
                    result.at[mlbam_id, "p_start_per_day"] = pace_floor
                    ytd_anchor_count += 1
                # Update ip_per_start from YTD data when sample is large enough
                if ytd_gs >= 5:
                    ytd_ip = float(ytd_match.iloc[0].get("IP", 0))
                    if ytd_ip > 0:
                        ytd_ip_per_start = ytd_ip / ytd_gs
                        result.at[mlbam_id, "ip_per_start"] = round(
                            float(np.clip(ytd_ip_per_start, 3.0, 9.0)), 2
                        )
        if ytd_anchor_count:
            print(f"    Fix H: {ytd_anchor_count} SP(s) got YTD-pace floor "
                  f"(≥3 GS in {current_season_year}, floored at actual start pace).")

    # Fix C: Floor for known starters — any SP with 10+ GS in the most recently
    # completed season (y0 = current_season_year) gets at least a 6th-starter slot
    # (p_start_per_day >= 15/162 ≈ 0.0926).
    # NOTE: uses current_season_year (e.g. 2025) not current_season_year-1 (2024),
    # because we want to check the last completed season, not the one before it.
    y0_year = current_season_year  # most recently completed season
    if y0_year in pitching_by_year:
        y0_df = pitching_by_year[y0_year]
        for mlbam_id, row in sp_df.iterrows():
            fgid = int(row.get("fgid", 0))
            if not fgid:
                continue
            y0_match = y0_df[y0_df["IDfg"] == fgid]
            if y0_match.empty:
                continue
            y0_gs = float(y0_match.iloc[0].get("GS", 0))
            if y0_gs >= 10:
                floor = round(15.0 / FULL_SEASON_GAMES, 4)
                if result.at[mlbam_id, "p_start_per_day"] < floor:
                    result.at[mlbam_id, "p_start_per_day"] = floor

    # Fix G: Healthy returnee GS floor.
    # If a pitcher made 28+ GS in the most recently completed season, they
    # demonstrated full health — Steamer should not be able to project fewer
    # than 80% of that regardless of injury history in prior years.
    # Addresses pitchers like Rodon (TJ 2024, healthy 30+ GS 2025) whose
    # Steamer projections are still discounted by the full injury history.
    if y0_year in pitching_by_year:
        y0_df = pitching_by_year[y0_year]
        healthy_returnee_count = 0
        for mlbam_id, row in sp_df.iterrows():
            fgid = int(row.get("fgid", 0))
            if not fgid:
                continue
            y0_match = y0_df[y0_df["IDfg"] == fgid]
            if y0_match.empty:
                continue
            y0_gs = float(y0_match.iloc[0].get("GS", 0))
            if y0_gs >= 28:
                gs_floor = round(0.80 * y0_gs / FULL_SEASON_GAMES, 4)
                if result.at[mlbam_id, "p_start_per_day"] < gs_floor:
                    result.at[mlbam_id, "p_start_per_day"] = gs_floor
                    healthy_returnee_count += 1
        if healthy_returnee_count:
            print(f"    Fix G: {healthy_returnee_count} SP(s) got healthy-returnee GS floor "
                  f"(≥28 GS in {y0_year}, floored at 80%).")

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
            # Fix 3: High-K middle relievers — bump appearance rate (closer-candidate tier)
            if float(row.get("k_per_ip", 0.0)) > 1.1:
                result.at[mlbam_id, "p_appear_per_game"] = 0.35

    # Fix F: Multi-year closer certainty — players with sv/g >= 0.30 in BOTH
    # prior two years get forced to closer-tier regardless of blended sv_per_g.
    # Targets confirmed closers whose blended rate dipped due to injury/team change.
    y1_year = current_season_year - 1
    y2_year = current_season_year - 2
    y1_df = pitching_by_year.get(y1_year, pd.DataFrame())
    y2_df = pitching_by_year.get(y2_year, pd.DataFrame())

    if not y1_df.empty and not y2_df.empty:
        confirmed_closer_count = 0
        for mlbam_id, row in rp_df.iterrows():
            fgid = int(row.get("fgid", 0))
            if not fgid:
                continue
            y1_match = y1_df[y1_df["IDfg"] == fgid]
            y2_match = y2_df[y2_df["IDfg"] == fgid]
            if y1_match.empty or y2_match.empty:
                continue
            y1_r = y1_match.iloc[0]
            y2_r = y2_match.iloc[0]
            y1_g = max(float(y1_r.get("G", 1) or 1), 1)
            y2_g = max(float(y2_r.get("G", 1) or 1), 1)
            y1_svpg = float(y1_r.get("SV", 0) or 0) / y1_g
            y2_svpg = float(y2_r.get("SV", 0) or 0) / y2_g
            if y1_svpg >= 0.30 and y2_svpg >= 0.30:
                result.at[mlbam_id, "rp_role"]           = "closer"
                result.at[mlbam_id, "p_appear_per_game"] = 0.40
                confirmed_closer_count += 1
        if confirmed_closer_count:
            print(f"    Fix F: {confirmed_closer_count} confirmed multi-year closers (sv/g≥0.30 in y1+y2).")

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
    steamer_gs_map: Optional[Dict[int, float]] = None,
    steamer_ip_map: Optional[Dict[int, float]] = None,
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
        sp = estimate_sp_playing_time(
            pitcher_talent_df, pitching_by_year, current_season_year,
            steamer_gs_map=steamer_gs_map,
            steamer_ip_map=steamer_ip_map,
        )
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
