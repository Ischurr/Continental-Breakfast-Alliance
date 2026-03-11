"""
Talent estimation module for EROSP.

Produces per-PA (hitters) and per-IP (pitchers) true-talent rate estimates
by blending 3 years of historical FanGraphs data with age and Statcast adjustments.
"""

import re
import unicodedata
from typing import Dict, List, Optional
import numpy as np
import pandas as pd

from .config import (
    BLEND_WEIGHTS_3YR, BLEND_WEIGHTS_2YR, MEAN_REGRESSION,
    AGE_PEAK, AGE_CURVE_RATE, AGE_MOD_MIN, AGE_MOD_MAX,
    XWOBA_DAMP, XWOBA_LG_AVG,
    PARK_FACTORS, TEAM_NORMALIZE,
)

# ---------------------------------------------------------------------------
# Name normalization for Chadwick fallback lookup
# ---------------------------------------------------------------------------

def _norm_player_name(n: str) -> str:
    """
    Normalize a FanGraphs player name to match the Chadwick name_to_mlbam keys.
    Strips accents, lowercases, removes suffixes (Jr./Sr./II/III/IV).
    """
    n = unicodedata.normalize("NFKD", n).encode("ascii", "ignore").decode()
    n = re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?", "", n.lower())
    n = re.sub(r"[^a-z ]", "", n)
    return " ".join(n.split())


# ---------------------------------------------------------------------------
# League-average rate benchmarks (used for regression to mean)
# ---------------------------------------------------------------------------
# Approximate MLB league-average per-PA rates
LG_AVG = {
    "single_rate": 0.135,
    "double_rate": 0.045,
    "triple_rate": 0.004,
    "hr_rate":     0.033,
    "bb_rate":     0.085,
    "k_rate":      0.225,
    "sb_rate":     0.025,
    "cs_rate":     0.007,
    "r_per_pa":    0.140,
    "rbi_per_pa":  0.130,
    "gidp_rate":   0.040,
}

# Approximate MLB league-average per-IP rates
LG_AVG_PITCH = {
    "k_per_ip":    0.910,   # ~8.2 K/9
    "bb_per_ip":   0.330,   # ~3.0 BB/9
    "h_per_ip":    0.870,   # ~7.8 H/9
    "er_per_ip":   0.467,   # ERA ~4.20
    "w_per_gs":    0.330,   # ~1 W per 3 starts
    "qs_per_gs":   0.440,   # ~44% QS rate
    "ip_per_gs":   5.5,
    "sv_per_g":    0.070,
    "hd_per_g":    0.090,
    "ip_per_app":  0.67,
}


# ---------------------------------------------------------------------------
# Age adjustment
# ---------------------------------------------------------------------------

def age_modifier(age: float) -> float:
    """
    Returns a multiplicative modifier for talent relative to age.
    Peak at AGE_PEAK (28), ±0.6% per year, capped at ±10%.
    """
    raw = 1.0 + (AGE_PEAK - age) * AGE_CURVE_RATE
    return float(np.clip(raw, AGE_MOD_MIN, AGE_MOD_MAX))


def compute_ages(player_info_df: pd.DataFrame, target_season: int) -> pd.Series:
    """Compute age as of April 1 of the target season from birth date columns."""
    target_date = pd.Timestamp(target_season, 4, 1)
    ages = []
    for _, row in player_info_df.iterrows():
        try:
            bdate = pd.Timestamp(int(row["birth_year"]), int(row["birth_month"]), int(row["birth_day"]))
            age = (target_date - bdate).days / 365.25
        except Exception:
            age = np.nan
        ages.append(age)
    return pd.Series(ages, index=player_info_df.index)


# ---------------------------------------------------------------------------
# Hitter talent estimation
# ---------------------------------------------------------------------------

RATE_COLS = [
    "single_rate", "double_rate", "triple_rate", "hr_rate",
    "bb_rate", "k_rate", "sb_rate", "cs_rate",
    "r_per_pa", "rbi_per_pa", "gidp_rate",
]


def _blend_hitter_rates(year_dfs: List[Optional[pd.DataFrame]]) -> pd.Series:
    """
    Blend per-PA rates across up to 3 years.
    year_dfs: [current_year_df (or None), y2_df (or None), y3_df (or None)]
    """
    valid = [(df, w) for df, w in zip(year_dfs, BLEND_WEIGHTS_3YR) if df is not None]
    if not valid:
        return pd.Series({col: LG_AVG[col] for col in RATE_COLS})

    if len(valid) == 1:
        df, _ = valid[0]
        # Regression to mean for single-year samples
        result = {}
        for col in RATE_COLS:
            val = float(df.get(col, LG_AVG[col]))
            result[col] = val * (1 - MEAN_REGRESSION) + LG_AVG[col] * MEAN_REGRESSION
        return pd.Series(result)

    # Renormalize weights for available years
    total_w = sum(w for _, w in valid)
    result = {}
    for col in RATE_COLS:
        blended = sum(float(df.get(col, LG_AVG[col])) * w for df, w in valid) / total_w
        result[col] = blended

    return pd.Series(result)


def estimate_hitter_talent(
    batting_by_year: Dict[int, pd.DataFrame],
    historical_years: List[int],           # [y1, y2, y3], y1 = most recent
    player_info_df: pd.DataFrame,
    xwoba_by_year: Dict[int, pd.DataFrame],
    sprint_speed_df: Optional[pd.DataFrame],
    target_season: int,
    fg_to_mlbam: Dict[int, int],
    name_to_mlbam: Optional[Dict[str, int]] = None,
) -> pd.DataFrame:
    """
    Returns DataFrame indexed by MLBAM ID with talent rate columns.
    One row per player, representing their true-talent per-PA rates.
    """
    y1, y2, y3 = (historical_years + [None, None, None])[:3]

    # Only include years that have data
    base_year = next((y for y in [y1, y2, y3] if y and y in batting_by_year), None)
    if base_year is None:
        return pd.DataFrame()

    # Build base roster from most recent year, then fill in prior-year players
    # (handles injury cases: batters who missed the most recent season entirely)
    base_df = batting_by_year[base_year].copy()
    seen_fgids = set(base_df["IDfg"].dropna().astype(int).tolist())
    for fallback_year in [y for y in [y1, y2, y3] if y and y != base_year and y in batting_by_year]:
        fb_df = batting_by_year[fallback_year].copy()
        new_players = fb_df[~fb_df["IDfg"].isin(seen_fgids)]
        if not new_players.empty:
            base_df = pd.concat([base_df, new_players], ignore_index=True)
            seen_fgids |= set(new_players["IDfg"].dropna().astype(int).tolist())

    base_df["mlbam_id"] = base_df["IDfg"].map(fg_to_mlbam)

    # Fix 1: name-based fallback for newer players missing from Chadwick fg→mlbam mapping
    if name_to_mlbam:
        n_before = base_df["mlbam_id"].notna().sum()
        mask = base_df["mlbam_id"].isna()
        for idx in base_df[mask].index:
            norm = _norm_player_name(str(base_df.at[idx, "Name"]))
            if norm in name_to_mlbam:
                base_df.at[idx, "mlbam_id"] = name_to_mlbam[norm]
        n_after = base_df["mlbam_id"].notna().sum()
        if n_after > n_before:
            print(f"    Name fallback resolved {n_after - n_before} hitter(s) missing from Chadwick.")

    # Merge player info (age, position)
    if not player_info_df.empty:
        info_cols = ["mlbam_id"] + [c for c in ["birth_year", "birth_month", "birth_day", "mlb_position"]
                                    if c in player_info_df.columns]
        base_df = base_df.merge(player_info_df[info_cols], on="mlbam_id", how="left")

    # Compute age
    if "birth_year" in base_df.columns:
        target_date = pd.Timestamp(target_season, 4, 1)
        def _age(row):
            try:
                bd = pd.Timestamp(int(row["birth_year"]), int(row["birth_month"]), int(row["birth_day"]))
                return (target_date - bd).days / 365.25
            except Exception:
                return np.nan
        base_df["age"] = base_df.apply(_age, axis=1)
    else:
        base_df["age"] = np.nan

    median_age = base_df["age"].median()
    base_df["age"] = base_df["age"].fillna(median_age if not np.isnan(median_age) else 28.0)

    # Merge xwOBA (most recent year)
    xw_year = next((y for y in [y1, y2] if y and y in xwoba_by_year), None)
    if xw_year:
        xw_df = xwoba_by_year[xw_year].rename(columns={"xwOBA": "xwoba_latest"})
        base_df = base_df.merge(xw_df[["mlbam_id", "xwoba_latest"]], on="mlbam_id", how="left")
    else:
        base_df["xwoba_latest"] = np.nan

    # Merge sprint speed
    if sprint_speed_df is not None:
        base_df = base_df.merge(
            sprint_speed_df.rename(columns={"mlbam_id": "mlbam_id"})[["mlbam_id", "speed_pct"]],
            on="mlbam_id", how="left"
        )
    base_df["speed_pct"] = base_df.get("speed_pct", pd.Series(50.0, index=base_df.index)).fillna(50.0)

    rows = []
    for _, row in base_df.iterrows():
        fgid = int(row["IDfg"])
        mlbam = row.get("mlbam_id")
        if pd.isna(mlbam):
            continue

        # Collect per-PA rates for each available year
        yr_rates = []
        for year in [y1, y2, y3]:
            if not year or year not in batting_by_year:
                yr_rates.append(None)
                continue
            yr_df = batting_by_year[year]
            match = yr_df[yr_df["IDfg"] == fgid]
            if match.empty:
                yr_rates.append(None)
            else:
                yr_rates.append(match.iloc[0][RATE_COLS].to_dict())

        # Blend rates
        blended = _blend_hitter_rates([
            pd.Series(r) if r is not None else None
            for r in yr_rates
        ])

        # Age modifier
        age     = float(row.get("age", 28.0))
        age_mod = age_modifier(age)

        # xwOBA adjustment (multiplicative, dampened)
        xwoba = float(row.get("xwoba_latest", np.nan))
        if not np.isnan(xwoba) and xwoba > 0:
            xwoba_adj = (xwoba / XWOBA_LG_AVG) ** XWOBA_DAMP
        else:
            xwoba_adj = 1.0

        # Speed adjustment on SB rates (above-median speed → higher SB attempt rate)
        speed_pct = float(row.get("speed_pct", 50.0))
        speed_factor = 0.5 + (speed_pct / 100.0)  # 0.5 to 1.5

        adjusted = dict(blended)
        # Apply age to all contact/power rates (hits, walks, strikeouts)
        for col in ["single_rate", "double_rate", "triple_rate", "hr_rate",
                    "bb_rate", "r_per_pa", "rbi_per_pa"]:
            adjusted[col] = blended[col] * age_mod * xwoba_adj
        # K rate inversely affected by age for young players
        adjusted["k_rate"] = blended["k_rate"] * (2.0 - age_mod)
        # Speed-based adjustments
        adjusted["sb_rate"]   = blended["sb_rate"]   * age_mod * speed_factor
        adjusted["cs_rate"]   = blended["cs_rate"]   * age_mod * speed_factor
        adjusted["gidp_rate"] = blended["gidp_rate"] * (2.0 - age_mod)  # older players GIDP more

        # Clip rates to reasonable ranges
        adjusted["k_rate"]      = np.clip(adjusted["k_rate"],      0.05, 0.45)
        adjusted["bb_rate"]     = np.clip(adjusted["bb_rate"],      0.03, 0.20)
        adjusted["hr_rate"]     = np.clip(adjusted["hr_rate"],      0.00, 0.12)
        adjusted["single_rate"] = np.clip(adjusted["single_rate"],  0.05, 0.25)
        adjusted["sb_rate"]     = np.clip(adjusted["sb_rate"],      0.00, 0.08)
        adjusted["gidp_rate"]   = np.clip(adjusted["gidp_rate"],    0.00, 0.10)

        # For multi-team players FanGraphs uses "- - -"; fall back to prior years for a real team
        park_abbrev = str(row.get("team_norm", ""))
        if park_abbrev in ("- - -", ""):
            for fallback_year in [y2, y3]:
                if not fallback_year or fallback_year not in batting_by_year:
                    continue
                prior = batting_by_year[fallback_year]
                prior_match = prior[prior["IDfg"] == fgid]
                if not prior_match.empty:
                    candidate = str(prior_match.iloc[0].get("team_norm", ""))
                    if candidate not in ("- - -", ""):
                        park_abbrev = candidate
                        break
        park_factor = PARK_FACTORS.get(str(park_abbrev), 1.00)

        rows.append({
            "mlbam_id":    int(mlbam),
            "fgid":        fgid,
            "name":        str(row.get("Name", "")),
            "age":         age,
            "age_mod":     age_mod,
            "xwoba_adj":   xwoba_adj,
            "mlb_team":    park_abbrev,
            "park_factor": park_factor,
            "mlb_position": str(row.get("mlb_position", "")),
            **{k: round(v, 6) for k, v in adjusted.items()},
        })

    if not rows:
        return pd.DataFrame()

    result_df = pd.DataFrame(rows).drop_duplicates(subset=["mlbam_id"], keep="first").set_index("mlbam_id")
    print(f"    Hitter talent: {len(result_df):,} players estimated.")
    return result_df


# ---------------------------------------------------------------------------
# Pitcher talent estimation
# ---------------------------------------------------------------------------

PITCH_RATE_COLS = [
    "k_per_ip", "bb_per_ip", "h_per_ip", "er_per_ip",
    "w_per_gs", "qs_per_gs", "ip_per_gs",
    "sv_per_g", "hd_per_g", "ip_per_app",
]


def _blend_pitcher_rates(year_dfs: List[Optional[pd.Series]]) -> pd.Series:
    """Blend per-IP pitcher rates across up to 3 years."""
    valid = [(df, w) for df, w in zip(year_dfs, BLEND_WEIGHTS_3YR) if df is not None]
    if not valid:
        return pd.Series({col: LG_AVG_PITCH[col] for col in PITCH_RATE_COLS})

    if len(valid) == 1:
        df, _ = valid[0]
        result = {}
        for col in PITCH_RATE_COLS:
            val = float(df.get(col, LG_AVG_PITCH[col]))
            result[col] = val * (1 - MEAN_REGRESSION) + LG_AVG_PITCH[col] * MEAN_REGRESSION
        return pd.Series(result)

    total_w = sum(w for _, w in valid)
    result = {}
    for col in PITCH_RATE_COLS:
        blended = sum(float(df.get(col, LG_AVG_PITCH[col])) * w for df, w in valid) / total_w
        result[col] = blended
    return pd.Series(result)


def estimate_pitcher_talent(
    pitching_by_year: Dict[int, pd.DataFrame],
    historical_years: List[int],
    player_info_df: pd.DataFrame,
    target_season: int,
    fg_to_mlbam: Dict[int, int],
    name_to_mlbam: Optional[Dict[str, int]] = None,
) -> pd.DataFrame:
    """
    Returns DataFrame indexed by MLBAM ID with pitcher talent rate columns.
    """
    y1, y2, y3 = (historical_years + [None, None, None])[:3]

    base_year = next((y for y in [y1, y2, y3] if y and y in pitching_by_year), None)
    if base_year is None:
        return pd.DataFrame()

    # Fix 2: include pitchers from prior years absent from the most recent year
    # (handles injury cases: pitchers who missed the most recent season entirely, e.g. Gerrit Cole)
    base_df = pitching_by_year[base_year].copy()
    seen_fgids = set(base_df["IDfg"].dropna().astype(int).tolist())
    for fallback_year in [y for y in [y1, y2, y3] if y and y != base_year and y in pitching_by_year]:
        fb_df = pitching_by_year[fallback_year].copy()
        new_players = fb_df[~fb_df["IDfg"].isin(seen_fgids)]
        if not new_players.empty:
            base_df = pd.concat([base_df, new_players], ignore_index=True)
            seen_fgids |= set(new_players["IDfg"].dropna().astype(int).tolist())
            print(f"    Added {len(new_players)} pitcher(s) from {fallback_year} not in {base_year}.")

    base_df["mlbam_id"] = base_df["IDfg"].map(fg_to_mlbam)

    # Fix 1: name-based fallback for newer players missing from Chadwick fg→mlbam mapping
    if name_to_mlbam:
        n_before = base_df["mlbam_id"].notna().sum()
        mask = base_df["mlbam_id"].isna()
        for idx in base_df[mask].index:
            norm = _norm_player_name(str(base_df.at[idx, "Name"]))
            if norm in name_to_mlbam:
                base_df.at[idx, "mlbam_id"] = name_to_mlbam[norm]
        n_after = base_df["mlbam_id"].notna().sum()
        if n_after > n_before:
            print(f"    Name fallback resolved {n_after - n_before} pitcher(s) missing from Chadwick.")

    # Merge player info
    if not player_info_df.empty:
        info_cols = ["mlbam_id"] + [c for c in ["birth_year", "birth_month", "birth_day", "mlb_position"]
                                    if c in player_info_df.columns]
        base_df = base_df.merge(player_info_df[info_cols], on="mlbam_id", how="left")

    if "birth_year" in base_df.columns:
        target_date = pd.Timestamp(target_season, 4, 1)
        def _age(row):
            try:
                bd = pd.Timestamp(int(row["birth_year"]), int(row["birth_month"]), int(row["birth_day"]))
                return (target_date - bd).days / 365.25
            except Exception:
                return np.nan
        base_df["age"] = base_df.apply(_age, axis=1)
    else:
        base_df["age"] = np.nan

    median_age = base_df["age"].median()
    base_df["age"] = base_df["age"].fillna(median_age if not np.isnan(median_age) else 28.0)

    # Classify role from most recent year
    base_df["role"] = base_df.get("role", "SP")

    rows = []
    for _, row in base_df.iterrows():
        fgid   = int(row["IDfg"])
        mlbam  = row.get("mlbam_id")
        if pd.isna(mlbam):
            continue

        yr_rates = []
        for year in [y1, y2, y3]:
            if not year or year not in pitching_by_year:
                yr_rates.append(None)
                continue
            yr_df = pitching_by_year[year]
            match = yr_df[yr_df["IDfg"] == fgid]
            if match.empty:
                yr_rates.append(None)
            else:
                yr_rates.append(match.iloc[0][PITCH_RATE_COLS].to_dict())

        blended = _blend_pitcher_rates([
            pd.Series(r) if r is not None else None for r in yr_rates
        ])

        age = float(row.get("age", 28.0))
        age_mod = age_modifier(age)

        # Apply age to K and ER rates
        adjusted = dict(blended)
        adjusted["k_per_ip"]  = blended["k_per_ip"]  * age_mod
        adjusted["bb_per_ip"] = blended["bb_per_ip"] * (2.0 - age_mod)  # walk rate rises with age
        adjusted["er_per_ip"] = blended["er_per_ip"] * (2.0 - age_mod)

        # Clip to reasonable ranges
        adjusted["k_per_ip"]  = np.clip(adjusted["k_per_ip"],  0.30, 1.60)
        adjusted["bb_per_ip"] = np.clip(adjusted["bb_per_ip"], 0.10, 0.70)
        adjusted["h_per_ip"]  = np.clip(adjusted["h_per_ip"],  0.50, 1.30)
        adjusted["er_per_ip"] = np.clip(adjusted["er_per_ip"], 0.20, 0.80)
        adjusted["ip_per_gs"] = np.clip(adjusted["ip_per_gs"], 3.0,  7.5)
        adjusted["ip_per_app"] = np.clip(adjusted["ip_per_app"], 0.20, 1.50)
        adjusted["qs_per_gs"] = np.clip(adjusted["qs_per_gs"], 0.0, 0.80)
        adjusted["w_per_gs"]  = np.clip(adjusted["w_per_gs"],  0.0, 0.50)

        # Role (SP or RP) — prefer MLB position data if available
        mlb_pos = str(row.get("mlb_position", row.get("role", "SP"))).upper()
        if mlb_pos in ("SP", "RP"):
            role = mlb_pos
        else:
            role = str(row.get("role", "SP"))

        # Park factor is inverse for pitchers (pitcher-friendly = better)
        # For multi-team players FanGraphs uses "- - -"; fall back to prior years for a real team
        park_abbrev = str(row.get("team_norm", ""))
        if park_abbrev in ("- - -", ""):
            for fallback_year in [y2, y3]:
                if not fallback_year or fallback_year not in pitching_by_year:
                    continue
                prior = pitching_by_year[fallback_year]
                prior_match = prior[prior["IDfg"] == fgid]
                if not prior_match.empty:
                    candidate = str(prior_match.iloc[0].get("team_norm", ""))
                    if candidate not in ("- - -", ""):
                        park_abbrev = candidate
                        break
        pf_raw = PARK_FACTORS.get(park_abbrev, 1.00)
        park_factor_pitcher = 2.0 - pf_raw   # invert: COL 1.15 → 0.85

        rows.append({
            "mlbam_id":            int(mlbam),
            "fgid":                fgid,
            "name":                str(row.get("Name", "")),
            "age":                 age,
            "age_mod":             age_mod,
            "mlb_team":            park_abbrev,
            "park_factor":         park_factor_pitcher,
            "role":                role,
            "mlb_position":        mlb_pos,
            **{k: round(v, 6) for k, v in adjusted.items()},
        })

    if not rows:
        return pd.DataFrame()

    result_df = pd.DataFrame(rows).drop_duplicates(subset=["mlbam_id"], keep="first").set_index("mlbam_id")
    print(f"    Pitcher talent: {len(result_df):,} pitchers estimated.")
    return result_df
