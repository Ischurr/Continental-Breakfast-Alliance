"""
Daily projection engine for EROSP.

For each player, computes:
  daily_ev_raw: expected fantasy points per team game day
  erosp_raw:    sum of daily_ev_raw over all remaining games
"""

from typing import Dict
import numpy as np
import pandas as pd

from .config import SCORING, FULL_SEASON_GAMES


# ---------------------------------------------------------------------------
# Expected FP per PA (hitters)
# ---------------------------------------------------------------------------

def fp_per_pa(rates: dict) -> float:
    """
    Compute expected fantasy points per plate appearance from per-PA talent rates.

    Scoring:
      Single: 2 pts (H+TB)
      Double: 3 pts
      Triple: 4 pts
      HR:     5 pts
      R:      1 pt  (separate — modeled via r_per_pa)
      RBI:    1 pt  (separate — modeled via rbi_per_pa)
      BB:     1 pt
      K:      -1 pt
      SB:     2 pts
      CS:     -1 pt
      GIDP:   -0.25 pts
    """
    ev = (
        rates.get("single_rate", 0) * SCORING["single"] +
        rates.get("double_rate", 0) * SCORING["double"] +
        rates.get("triple_rate", 0) * SCORING["triple"] +
        rates.get("hr_rate",     0) * SCORING["hr"]     +
        rates.get("r_per_pa",    0) * SCORING["r"]      +
        rates.get("rbi_per_pa",  0) * SCORING["rbi"]    +
        rates.get("bb_rate",     0) * SCORING["bb"]     +
        rates.get("k_rate",      0) * SCORING["k"]      +
        rates.get("sb_rate",     0) * SCORING["sb"]     +
        rates.get("cs_rate",     0) * SCORING["cs"]     +
        rates.get("gidp_rate",   0) * SCORING["gidp"]
    )
    return float(ev)


# ---------------------------------------------------------------------------
# Expected FP per start (SP)
# ---------------------------------------------------------------------------

def fp_per_start(rates: dict, ip_per_start: float) -> float:
    """
    Compute expected fantasy points per start.

    Scoring:
      IP:  3 pts each
      HA:  -1 per H allowed
      ER:  -2 per ER
      BBA: -1 per BB
      KP:  +1 per K
      W:   +3
      L:   -3   (modeled as implicit in W/G balance)
      QS:  +3
    """
    fp_pitching = (
        ip_per_start             * SCORING["ip"]  +
        rates.get("h_per_ip",  0) * ip_per_start * SCORING["ha"]  +
        rates.get("er_per_ip", 0) * ip_per_start * SCORING["er"]  +
        rates.get("bb_per_ip", 0) * ip_per_start * SCORING["bba"] +
        rates.get("k_per_ip",  0) * ip_per_start * SCORING["kp"]
    )

    # W/L: each start has ~w_per_gs win probability, ~(1 - w_per_gs) no-decision-or-loss
    # L probability is roughly (1 - w_per_gs) * 0.45 (not every non-win is a loss)
    w_prob = float(rates.get("w_per_gs", 0.33))
    l_prob = (1.0 - w_prob) * 0.45
    fp_wl = w_prob * SCORING["w"] + l_prob * SCORING["l"]

    # QS: probability per start × scoring
    qs_prob = float(rates.get("qs_per_gs", 0.44))
    fp_qs = qs_prob * SCORING["qs"]

    return float(fp_pitching + fp_wl + fp_qs)


# ---------------------------------------------------------------------------
# Expected FP per appearance (RP)
# ---------------------------------------------------------------------------

def fp_per_appearance(rates: dict, ip_per_app: float, rp_role: str = "middle") -> float:
    """
    Compute expected fantasy points per relief appearance.

    Scoring adds:
      SV: +5, HD: +3, BS: -2 (blown save)
    """
    fp_pitching = (
        ip_per_app               * SCORING["ip"]  +
        rates.get("h_per_ip",  0) * ip_per_app * SCORING["ha"]  +
        rates.get("er_per_ip", 0) * ip_per_app * SCORING["er"]  +
        rates.get("bb_per_ip", 0) * ip_per_app * SCORING["bba"] +
        rates.get("k_per_ip",  0) * ip_per_app * SCORING["kp"]
    )

    sv_per_g = float(rates.get("sv_per_g", 0.0))
    hd_per_g = float(rates.get("hd_per_g", 0.0))
    # BS ~ 10-15% of save opportunities
    bs_rate  = sv_per_g * 0.12

    fp_leverage = (
        sv_per_g * SCORING["sv"] +
        hd_per_g * SCORING["hd"] +
        bs_rate  * SCORING["bs"]
    )

    return float(fp_pitching + fp_leverage)


# ---------------------------------------------------------------------------
# Daily expected value
# ---------------------------------------------------------------------------

def daily_ev_hitter(
    talent: dict,
    p_play: float,
    pa_per_game: float,
    park_factor: float = 1.0,
    opp_factor: float  = 1.0,
) -> float:
    """Expected fantasy points for a hitter on a given game day."""
    base_fp = fp_per_pa(talent)
    return base_fp * pa_per_game * p_play * park_factor * opp_factor


def daily_ev_sp(
    talent: dict,
    p_start_per_day: float,
    ip_per_start: float,
    park_factor: float = 1.0,
    opp_factor: float  = 1.0,
) -> float:
    """Expected fantasy points for a SP on a given team game day."""
    base_fp = fp_per_start(talent, ip_per_start)
    return base_fp * p_start_per_day * park_factor * opp_factor


def daily_ev_rp(
    talent: dict,
    p_appear: float,
    ip_per_app: float,
    rp_role: str = "middle",
    park_factor: float = 1.0,
    opp_factor: float  = 1.0,
) -> float:
    """Expected fantasy points for a RP on a given team game day."""
    base_fp = fp_per_appearance(talent, ip_per_app, rp_role)
    return base_fp * p_appear * park_factor * opp_factor


# ---------------------------------------------------------------------------
# Compute EROSP_raw for all players
# ---------------------------------------------------------------------------

def compute_all_erosp_raw(
    hitter_talent_df: pd.DataFrame,
    pitcher_talent_df: pd.DataFrame,
    playing_time_df: pd.DataFrame,
    schedule_summary: Dict[int, dict],
    mlb_team_abbrev_to_id: Dict[str, int],
) -> pd.DataFrame:
    """
    Compute EROSP_raw (unconditional expected rest-of-season fantasy points) for all players.

    Returns DataFrame indexed by mlbam_id with columns:
      erosp_raw, daily_ev_raw, games_remaining, fp_per_pa_or_ip, park_factor
    """
    # Build reverse mapping: abbrev → schedule entry
    abbrev_to_schedule = {}
    for team_id, info in schedule_summary.items():
        abbrev = info.get("abbrev", "")
        if abbrev:
            abbrev_to_schedule[abbrev] = info

    rows = []

    # ── Hitters ──────────────────────────────────────────────────────────────
    if not hitter_talent_df.empty:
        pt_hitters = playing_time_df[playing_time_df["player_type"] == "hitter"]
        for mlbam_id, talent_row in hitter_talent_df.iterrows():
            if mlbam_id not in pt_hitters.index:
                continue
            pt_row = pt_hitters.loc[mlbam_id]

            team_abbrev = str(talent_row.get("mlb_team", ""))
            sched = abbrev_to_schedule.get(team_abbrev, {})
            games_remaining = int(sched.get("games_remaining", FULL_SEASON_GAMES))
            avg_pf = float(sched.get("avg_park_factor_remaining", talent_row.get("park_factor", 1.0)))

            talent_dict = talent_row.to_dict()
            ev_per_game = daily_ev_hitter(
                talent=talent_dict,
                p_play=float(pt_row.get("p_play", 0.85)),
                pa_per_game=float(pt_row.get("pa_per_game", 4.0)),
                park_factor=avg_pf,
            )

            erosp_raw = ev_per_game * games_remaining

            rows.append({
                "mlbam_id":       mlbam_id,
                "name":           str(talent_row.get("name", "")),
                "player_type":    "hitter",
                "role":           "H",
                "mlb_team":       team_abbrev,
                "park_factor":    avg_pf,
                "games_remaining": games_remaining,
                "daily_ev_raw":   round(float(ev_per_game), 4),
                "erosp_raw":      round(float(max(erosp_raw, 0)), 2),
                "fp_per_pa":      round(float(fp_per_pa(talent_dict)), 4),
            })

    # ── Starting Pitchers ─────────────────────────────────────────────────────
    if not pitcher_talent_df.empty:
        sp_talent = pitcher_talent_df[pitcher_talent_df["role"] == "SP"]
        pt_sps    = playing_time_df[playing_time_df["player_type"] == "sp"]

        for mlbam_id, talent_row in sp_talent.iterrows():
            if mlbam_id not in pt_sps.index:
                continue
            pt_row = pt_sps.loc[mlbam_id]

            team_abbrev = str(talent_row.get("mlb_team", ""))
            sched = abbrev_to_schedule.get(team_abbrev, {})
            games_remaining = int(sched.get("games_remaining", FULL_SEASON_GAMES))
            avg_pf = float(sched.get("avg_park_factor_remaining",
                                     talent_row.get("park_factor", 1.0)))

            p_start_per_day = float(pt_row.get("p_start_per_day", 1.0 / 5.0))
            ip_per_start    = float(pt_row.get("ip_per_start", 5.5))
            talent_dict     = talent_row.to_dict()

            ev_per_game = daily_ev_sp(
                talent=talent_dict,
                p_start_per_day=p_start_per_day,
                ip_per_start=ip_per_start,
                park_factor=avg_pf,
            )

            projected_starts = p_start_per_day * games_remaining
            erosp_raw = ev_per_game * games_remaining

            rows.append({
                "mlbam_id":          mlbam_id,
                "name":              str(talent_row.get("name", "")),
                "player_type":       "sp",
                "role":              "SP",
                "mlb_team":          team_abbrev,
                "park_factor":       avg_pf,
                "games_remaining":   games_remaining,
                "projected_starts":  round(float(projected_starts), 1),
                "daily_ev_raw":      round(float(ev_per_game), 4),
                "erosp_raw":         round(float(max(erosp_raw, 0)), 2),
                "fp_per_start":      round(float(fp_per_start(talent_dict, ip_per_start)), 2),
            })

    # ── Relief Pitchers ───────────────────────────────────────────────────────
        rp_talent = pitcher_talent_df[pitcher_talent_df["role"] == "RP"]
        pt_rps    = playing_time_df[playing_time_df["player_type"] == "rp"]

        for mlbam_id, talent_row in rp_talent.iterrows():
            if mlbam_id not in pt_rps.index:
                continue
            pt_row = pt_rps.loc[mlbam_id]

            team_abbrev = str(talent_row.get("mlb_team", ""))
            sched = abbrev_to_schedule.get(team_abbrev, {})
            games_remaining = int(sched.get("games_remaining", FULL_SEASON_GAMES))
            avg_pf = float(sched.get("avg_park_factor_remaining",
                                     talent_row.get("park_factor", 1.0)))

            p_appear  = float(pt_row.get("p_appear_per_game", 0.35))
            ip_per_app = float(pt_row.get("ip_per_app", 0.67))
            rp_role   = str(pt_row.get("rp_role", "middle"))
            talent_dict = talent_row.to_dict()

            ev_per_game = daily_ev_rp(
                talent=talent_dict,
                p_appear=p_appear,
                ip_per_app=ip_per_app,
                rp_role=rp_role,
                park_factor=avg_pf,
            )

            erosp_raw = ev_per_game * games_remaining

            rows.append({
                "mlbam_id":       mlbam_id,
                "name":           str(talent_row.get("name", "")),
                "player_type":    "rp",
                "role":           "RP",
                "mlb_team":       team_abbrev,
                "park_factor":    avg_pf,
                "games_remaining": games_remaining,
                "daily_ev_raw":   round(float(ev_per_game), 4),
                "erosp_raw":      round(float(max(erosp_raw, 0)), 2),
                "rp_role":        rp_role,
            })

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows).set_index("mlbam_id")
    df = df.fillna(0)
    print(f"    EROSP raw: {len(df):,} players. "
          f"Mean raw={df['erosp_raw'].mean():.1f}, "
          f"Max raw={df['erosp_raw'].max():.1f}")
    return df
