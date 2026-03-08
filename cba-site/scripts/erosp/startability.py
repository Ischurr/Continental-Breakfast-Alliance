"""
Startability module for EROSP.

Computes:
  1. Replacement levels by position (10-team league)
  2. Hitter start probability via sigmoid
  3. SP 7-start weekly cap adjustment
  4. RP start probability (top 3 daily)
  5. EROSP_startable = sum of daily_ev_raw × start_probability × cap_factor
"""

import math
from typing import Dict, List, Optional
import numpy as np
import pandas as pd

from .config import (
    HITTER_SLOTS, PITCHER_SLOTS, POSITION_ELIGIBILITY,
    LEAGUE_TEAMS, SP_WEEKLY_CAP, RP_DAILY_STARTS,
    SIGMOID_TAU, FULL_SEASON_GAMES,
)


# ---------------------------------------------------------------------------
# Sigmoid start probability
# ---------------------------------------------------------------------------

def sigmoid(x: float, tau: float = SIGMOID_TAU) -> float:
    """Logistic function for soft start probability."""
    return 1.0 / (1.0 + math.exp(-x / tau))


# ---------------------------------------------------------------------------
# Replacement level computation
# ---------------------------------------------------------------------------

def compute_replacement_levels(
    hitter_projection_df: pd.DataFrame,
    pitcher_projection_df: pd.DataFrame,
    hitter_talent_df: pd.DataFrame,
    pitcher_talent_df: pd.DataFrame,
) -> Dict[str, float]:
    """
    Compute replacement-level daily_ev_raw for each fantasy position.

    For each position slot, rank all eligible players by daily_ev_raw
    and take the Nth player's value (N = slot count = roster pool size).

    Returns dict: position → replacement_level_daily_ev
    """
    replacement: Dict[str, float] = {}

    # ── Hitter replacement levels ──────────────────────────────────────────
    if not hitter_projection_df.empty and not hitter_talent_df.empty:
        # Add position info to projection df
        pos_map = hitter_talent_df["mlb_position"].to_dict()
        h_proj = hitter_projection_df[hitter_projection_df["player_type"] == "hitter"].copy()
        h_proj["position"] = h_proj.index.map(lambda mid: str(pos_map.get(mid, "OF")))

        for slot, n_slots in HITTER_SLOTS.items():
            # Collect all players eligible for this slot
            eligible_ids = []
            for mlbam_id, row in h_proj.iterrows():
                pos = row["position"]
                eligible_slots = POSITION_ELIGIBILITY.get(pos, ["UTIL"])
                if slot in eligible_slots:
                    eligible_ids.append(mlbam_id)

            if not eligible_ids:
                replacement[slot] = 0.0
                continue

            eligible_evs = (
                h_proj.loc[eligible_ids, "daily_ev_raw"]
                .sort_values(ascending=False)
                .values
            )
            if len(eligible_evs) >= n_slots:
                replacement[slot] = float(eligible_evs[n_slots - 1])
            else:
                replacement[slot] = float(eligible_evs[-1]) if len(eligible_evs) > 0 else 0.0

    # ── Pitcher replacement levels ─────────────────────────────────────────
    if not pitcher_projection_df.empty:
        sp_proj = pitcher_projection_df[pitcher_projection_df["role"] == "SP"]
        rp_proj = pitcher_projection_df[pitcher_projection_df["role"] == "RP"]

        n_sp = PITCHER_SLOTS["SP"]   # 60
        n_rp = PITCHER_SLOTS["RP"]   # 30

        if not sp_proj.empty:
            sp_evs = sp_proj["daily_ev_raw"].sort_values(ascending=False).values
            replacement["SP"] = float(sp_evs[n_sp - 1]) if len(sp_evs) >= n_sp else (
                float(sp_evs[-1]) if len(sp_evs) > 0 else 0.0)

        if not rp_proj.empty:
            rp_evs = rp_proj["daily_ev_raw"].sort_values(ascending=False).values
            replacement["RP"] = float(rp_evs[n_rp - 1]) if len(rp_evs) >= n_rp else (
                float(rp_evs[-1]) if len(rp_evs) > 0 else 0.0)

    print(f"    Replacement levels:")
    for pos in ["C", "1B", "2B", "SS", "OF", "SP", "RP"]:
        if pos in replacement:
            print(f"      {pos:5s}: {replacement[pos]:.3f} daily EV")

    return replacement


# ---------------------------------------------------------------------------
# Hitter start probability (per game day)
# ---------------------------------------------------------------------------

def hitter_start_prob(
    daily_ev: float,
    replacement_level: float,
    tau: float = SIGMOID_TAU,
) -> float:
    """Soft probability that a hitter's daily production exceeds replacement level."""
    return sigmoid(daily_ev - replacement_level, tau)


def _best_slot_replacement(
    pos: str,
    replacement_levels: Dict[str, float],
) -> float:
    """Return the highest (most favorable) replacement level for a given position."""
    eligible_slots = POSITION_ELIGIBILITY.get(pos, ["UTIL"])
    levels = [replacement_levels.get(s, 0.0) for s in eligible_slots if s in replacement_levels]
    # Best slot = where replacement is lowest (easiest to beat)
    return min(levels) if levels else 0.0


# ---------------------------------------------------------------------------
# SP 6-start weekly cap factor
# ---------------------------------------------------------------------------

def sp_cap_factor(
    projected_starts: float,
    team_total_projected_starts: float,
    cap: int = SP_WEEKLY_CAP,
    games_remaining: int = FULL_SEASON_GAMES,
) -> float:
    """
    Fraction of this SP's starts that would count under the 7-start weekly cap.

    Logic:
      - If the entire team's SP corps projects ≤6 starts/week, all starts count → 1.0
      - If team projects > 6 starts/week, only the top-6 per week count.
      - Approximation: cap_factor = min(1.0, cap_per_week / team_starts_per_week)
        applied uniformly to all SPs on the team (assumes equal quality — conservative).
        Better SPs will be in the cap more often; this is a simplification.

    For a more accurate per-player estimate, we'd need to know each SP's relative
    quality ranking within their fantasy team. We'll use a soft ranking via
    projected_starts / team_total_projected_starts as a quality proxy.
    """
    if games_remaining <= 0 or team_total_projected_starts <= 0:
        return 1.0

    # Convert starts to per-week
    weeks_remaining = games_remaining / 7.0
    if weeks_remaining <= 0:
        return 1.0

    team_starts_per_week = team_total_projected_starts / weeks_remaining
    if team_starts_per_week <= cap:
        return 1.0

    # This player's share of team starts
    player_share = projected_starts / team_total_projected_starts

    # Approximate: we assume top pitchers fill the cap slots first.
    # If team has 8 starts/week on average, the top 6/8 = 75% of starts count.
    # This player counts all their starts that fall within the cap.
    cap_fraction = cap / team_starts_per_week
    return float(min(cap_fraction, 1.0))


# ---------------------------------------------------------------------------
# RP daily start probability
# ---------------------------------------------------------------------------

def rp_start_prob(
    daily_ev: float,
    replacement_level_rp: float,
    tau: float = SIGMOID_TAU,
) -> float:
    """Soft probability that this RP is among the top-3 started each day."""
    return sigmoid(daily_ev - replacement_level_rp, tau)


# ---------------------------------------------------------------------------
# Compute EROSP_startable for all players
# ---------------------------------------------------------------------------

def compute_erosp_startable(
    projection_df: pd.DataFrame,
    hitter_talent_df: pd.DataFrame,
    pitcher_talent_df: pd.DataFrame,
    espn_roster_map: Dict[str, int],       # mlbam_id (str) → fantasy_team_id
    replacement_levels: Dict[str, float],
) -> pd.DataFrame:
    """
    Augment projection_df with erosp_startable and start_probability columns.

    SP 6-start weekly cap is computed per MLB team (not fantasy team, since we
    don't always have fantasy roster data). We group all projected SP starts
    by MLB team and apply the cap there.
    """
    df = projection_df.copy()
    df["start_probability"] = 1.0
    df["cap_factor"]        = 1.0
    df["erosp_startable"]   = 0.0

    # Build position map from talent DataFrames
    hitter_pos = hitter_talent_df["mlb_position"].to_dict() if not hitter_talent_df.empty else {}
    pitcher_pos = pitcher_talent_df["mlb_position"].to_dict() if not pitcher_talent_df.empty else {}

    # ── SP cap factor computation ─────────────────────────────────────────
    # Sum projected starts per MLB team
    sp_rows = df[df["role"] == "SP"].copy()
    if not sp_rows.empty:
        team_starts = sp_rows.groupby("mlb_team")["projected_starts"].sum().to_dict()
        # Apply cap factor per SP based on their team's total projected starts
        for mlbam_id, row in sp_rows.iterrows():
            proj_starts = float(row.get("projected_starts", 0))
            team_total  = float(team_starts.get(str(row.get("mlb_team", "")), proj_starts))
            games_rem   = int(row.get("games_remaining", FULL_SEASON_GAMES))
            cf = sp_cap_factor(proj_starts, team_total, cap=SP_WEEKLY_CAP, games_remaining=games_rem)
            df.at[mlbam_id, "cap_factor"] = round(cf, 4)

    # ── Per-player startability ────────────────────────────────────────────
    for mlbam_id, row in df.iterrows():
        player_type = str(row.get("player_type", "hitter"))
        daily_ev    = float(row.get("daily_ev_raw", 0.0))
        games_rem   = int(row.get("games_remaining", FULL_SEASON_GAMES))
        cap_f       = float(row.get("cap_factor", 1.0))

        if player_type == "hitter":
            pos = str(hitter_pos.get(mlbam_id, "OF"))
            repl_level = _best_slot_replacement(pos, replacement_levels)
            p_start    = hitter_start_prob(daily_ev, repl_level)

        elif player_type == "sp":
            repl_sp = replacement_levels.get("SP", 0.0)
            # For SPs, start_probability is the per-day probability of being an active starter
            # (already encoded in p_start_per_day). Here we model whether the roster slot is used.
            p_start = hitter_start_prob(daily_ev, repl_sp)

        elif player_type == "rp":
            repl_rp = replacement_levels.get("RP", 0.0)
            p_start = rp_start_prob(daily_ev, repl_rp)

        else:
            p_start = 1.0

        erosp_startable = daily_ev * p_start * cap_f * games_rem

        df.at[mlbam_id, "start_probability"] = round(float(p_start), 4)
        df.at[mlbam_id, "erosp_startable"]   = round(float(max(erosp_startable, 0)), 2)

    print(f"    EROSP startable: "
          f"mean={df['erosp_startable'].mean():.1f}, "
          f"max={df['erosp_startable'].max():.1f}")
    return df
