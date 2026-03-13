#!/usr/bin/env python3
"""
Benchmark Steamer pre-season projections vs. actual CBA fantasy points.

Fetches Steamer projections for the target year from FanGraphs API,
converts counting stats → CBA scoring, then compares accuracy head-to-head
with the EROSP backtest numbers.

Usage:
    cd /path/to/cba-site/scripts
    python3 benchmark_steamer.py [--target-year 2025]

Output:
    data/erosp/steamer_benchmark_{year}.csv  — matched comparison table
    Summary stats + EROSP head-to-head printed to stdout
"""

import re
import sys
import json
import argparse
import datetime
import warnings
import unicodedata
from pathlib import Path

import pandas as pd
import numpy as np
import requests

warnings.filterwarnings("ignore")

SCRIPT_DIR  = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent

# ---------------------------------------------------------------------------
# Args
# ---------------------------------------------------------------------------
parser = argparse.ArgumentParser(description="Benchmark Steamer vs. actual CBA results")
parser.add_argument("--target-year", type=int, default=2025,
                    help="Season year to benchmark (default: 2025)")
args = parser.parse_args()

TARGET_SEASON = args.target_year

# EROSP backtest results to compare against (update if you re-run the backtest)
EROSP_STATS = {
    "n":          388,
    "pearson_r":  0.420,
    "spearman":   0.410,
    "rmse":       160.1,
    "bias":       +0.9,
}

print(f"\n{'='*65}")
print(f"  STEAMER BENCHMARK  vs.  {TARGET_SEASON} CBA ACTUAL RESULTS")
print(f"{'='*65}")
print(f"  Target season:  {TARGET_SEASON}")
print(f"  Run date:       {datetime.date.today().strftime('%B %d, %Y')}")
print(f"{'='*65}\n")

# ---------------------------------------------------------------------------
# CBA scoring (mirrors config.py)
# ---------------------------------------------------------------------------
SCORING = {
    "single": 2.0, "double": 3.0, "triple": 4.0, "hr": 5.0,
    "r":  1.0, "rbi": 1.0, "bb": 1.0, "hbp": 1.0,
    "k": -1.0, "sb": 2.0,  "cs": -1.0, "gidp": -0.25,
    # pitching
    "ip": 3.0, "ha": -1.0, "er": -2.0, "bba": -1.0, "kp": 1.0,
    "w":  3.0, "l":  -3.0, "sv":  5.0, "bs":  -2.0,
    "hd": 3.0, "qs":  3.0,
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def norm_name(n: str) -> str:
    """Normalize player name: strip diacritics, lowercase, alphanumeric only."""
    # Strip diacritics (é→e, á→a, í→i, etc.) before regex so accented FanGraphs
    # names match unaccented ESPN names (e.g. "José Ramírez" → "joseramirez")
    n = unicodedata.normalize("NFD", str(n))
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    n = n.lower().replace("jr.", "").replace("sr.", "")
    return re.sub(r"[^a-z0-9]", "", n)


def safe_float(val, default: float = 0.0) -> float:
    try:
        f = float(val)
        return default if (f != f) else f   # NaN guard
    except (TypeError, ValueError):
        return default


def row_get(row, col: str, default: float = 0.0) -> float:
    return safe_float(row.get(col, default), default)


def steamer_batter_fp(row) -> float:
    """Convert Steamer batting projection row → CBA fantasy points.

    FanGraphs Steamer provides 1B directly, so no need to derive singles.
    BB is total walks (includes IBB) — matches CBA scoring where IBB = +1 same as BB.
    """
    return (
        row_get(row, "1B")    * SCORING["single"] +
        row_get(row, "2B")    * SCORING["double"] +
        row_get(row, "3B")    * SCORING["triple"] +
        row_get(row, "HR")    * SCORING["hr"]     +
        row_get(row, "R")     * SCORING["r"]      +
        row_get(row, "RBI")   * SCORING["rbi"]    +
        row_get(row, "BB")    * SCORING["bb"]     +
        row_get(row, "HBP")   * SCORING["hbp"]    +
        row_get(row, "SO")    * SCORING["k"]      +
        row_get(row, "SB")    * SCORING["sb"]     +
        row_get(row, "CS")    * SCORING["cs"]     +
        row_get(row, "GDP")   * SCORING["gidp"]
    )


def steamer_pitcher_fp(row) -> float:
    """Convert Steamer pitching projection row → CBA fantasy points."""
    sv  = row_get(row, "SV")
    hld = row_get(row, "HLD")
    qs  = row_get(row, "QS")
    # BS: use explicit col if Steamer provides it, else estimate 12% of save opps
    bs  = row_get(row, "BS") if ("BS" in row and row_get(row, "BS") > 0) else sv * 0.12
    return (
        row_get(row, "IP")  * SCORING["ip"]  +
        row_get(row, "H")   * SCORING["ha"]  +
        row_get(row, "ER")  * SCORING["er"]  +
        row_get(row, "BB")  * SCORING["bba"] +
        row_get(row, "SO")  * SCORING["kp"]  +
        row_get(row, "W")   * SCORING["w"]   +
        row_get(row, "L")   * SCORING["l"]   +
        sv                  * SCORING["sv"]  +
        bs                  * SCORING["bs"]  +
        hld                 * SCORING["hd"]  +
        qs                  * SCORING["qs"]
    )


def pearson_r(x: pd.Series, y: pd.Series) -> float:
    xm, ym = x - x.mean(), y - y.mean()
    denom = (np.sqrt((xm**2).sum()) * np.sqrt((ym**2).sum()))
    return float((xm * ym).sum() / denom) if denom > 0 else 0.0


def spearman_r(x: pd.Series, y: pd.Series) -> float:
    return pearson_r(x.rank(), y.rank())


# ---------------------------------------------------------------------------
# Fetch Steamer from FanGraphs
# ---------------------------------------------------------------------------
FG_BASE   = "https://www.fangraphs.com/api/projections"
FG_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; CBA-benchmarker/1.0)"}


def fetch_steamer(stats: str, season: int) -> pd.DataFrame:
    url = (f"{FG_BASE}?type=steamer&stats={stats}&pos=all"
           f"&team=0&players=0&lg=all&season={season}")
    print(f"  GET {url}")
    resp = requests.get(url, timeout=25, headers=FG_HEADERS)
    resp.raise_for_status()
    data = resp.json()
    if not data:
        raise ValueError(f"Empty response — FanGraphs may not archive {season} Steamer projections.")
    df = pd.DataFrame(data)
    print(f"  → {len(df):,} rows")
    return df


print("─── Step 1: Steamer batting projections ──────────────────────────")
try:
    bat_df = fetch_steamer("bat", TARGET_SEASON)
except Exception as exc:
    print(f"  ERROR fetching batting: {exc}")
    sys.exit(1)
print()

print("─── Step 2: Steamer pitching projections ─────────────────────────")
try:
    pit_df = fetch_steamer("pit", TARGET_SEASON)
except Exception as exc:
    print(f"  ERROR fetching pitching: {exc}")
    sys.exit(1)
print()

# ---------------------------------------------------------------------------
# Convert to CBA fantasy points
# ---------------------------------------------------------------------------
print("─── Step 3: Convert counting stats → CBA fantasy points ──────────")

bat_df["steamer_fp"] = bat_df.apply(steamer_batter_fp, axis=1)
pit_df["steamer_fp"] = pit_df.apply(steamer_pitcher_fp, axis=1)

# Pitcher role: GS/(total games) >= 0.5 → SP, else RP
pit_df["_gs"]   = pit_df.get("GS", pd.Series(0, index=pit_df.index)).fillna(0).astype(float)
pit_df["_g"]    = pit_df.get("G",  pd.Series(1, index=pit_df.index)).fillna(1).astype(float).clip(lower=1)
pit_df["role"]  = (pit_df["_gs"] / pit_df["_g"] >= 0.5).map({True: "SP", False: "RP"})

# Normalize names; keep highest FP row when player appears multiple times (multi-team split)
bat_df["norm_name"] = bat_df["PlayerName"].apply(norm_name)
pit_df["norm_name"] = pit_df["PlayerName"].apply(norm_name)
bat_df = bat_df.sort_values("steamer_fp", ascending=False).drop_duplicates("norm_name", keep="first")
pit_df = pit_df.sort_values("steamer_fp", ascending=False).drop_duplicates("norm_name", keep="first")

print(f"  Batters:  {len(bat_df):,} unique | FP [{bat_df['steamer_fp'].min():.0f}, {bat_df['steamer_fp'].max():.0f}]")
print(f"  Pitchers: {len(pit_df):,} unique | FP [{pit_df['steamer_fp'].min():.0f}, {pit_df['steamer_fp'].max():.0f}]")

# Cache raw playing-time columns so backtest_erosp.py can use them without re-fetching
output_dir = PROJECT_DIR / "data" / "erosp"
output_dir.mkdir(exist_ok=True)
_bat_cache_path = output_dir / f"steamer_raw_bat_{TARGET_SEASON}.csv"
_pit_cache_path = output_dir / f"steamer_raw_pit_{TARGET_SEASON}.csv"
if "playerid" in bat_df.columns and "PA" in bat_df.columns:
    bat_df[["playerid", "PA"]].dropna(subset=["playerid"]).to_csv(_bat_cache_path, index=False)
    print(f"  Cached Steamer bat raw → {_bat_cache_path.name}")
if "playerid" in pit_df.columns and "GS" in pit_df.columns and "IP" in pit_df.columns:
    pit_df[["playerid", "GS", "IP"]].dropna(subset=["playerid"]).to_csv(_pit_cache_path, index=False)
    print(f"  Cached Steamer pit raw → {_pit_cache_path.name}")
print()

# Build unified pool with two fixes:
#   1. TWP (e.g. Ohtani): in both batting + pitching with meaningful PA + IP → sum FP
#   2. Name collision guard: pitcher entry only added/overwrites if it has >= 15 proj IP
#      (prevents minor-league "Juan Soto" pitcher from erasing star hitter)
MIN_PITCHER_IP = 15.0

steamer_pool: dict = {}

# Load batters first
for _, r in bat_df.iterrows():
    steamer_pool[r["norm_name"]] = {
        "name":       r["PlayerName"],
        "steamer_fp": float(r["steamer_fp"]),
        "role":       "H",
        "_bat_fp":    float(r["steamer_fp"]),
    }

# Merge pitchers
twp_count = 0
for _, r in pit_df.iterrows():
    nm = r["norm_name"]
    ip = float(r.get("IP", 0) or 0)
    if ip < MIN_PITCHER_IP:
        continue   # fringe arm — skip to avoid name collisions
    pit_fp = float(r["steamer_fp"])
    role   = str(r["role"])

    if nm in steamer_pool:
        bat_fp = steamer_pool[nm]["_bat_fp"]
        if bat_fp >= 200.0:
            # Almost certainly TWP (star-level batting + real pitching) — sum both
            steamer_pool[nm]["steamer_fp"] = bat_fp + pit_fp
            steamer_pool[nm]["role"]       = role
            twp_count += 1
        elif bat_fp < 50.0 and ip >= 100.0:
            # Low-PA batter with same name as a real ace — pitcher wins (e.g. Luis Castillo)
            steamer_pool[nm] = {
                "name":       r["PlayerName"],
                "steamer_fp": pit_fp,
                "role":       role,
                "_bat_fp":    0.0,
            }
        # else: real batter with moderate projection — keep batter; skip ambiguous pitcher
    else:
        steamer_pool[nm] = {
            "name":       r["PlayerName"],
            "steamer_fp": pit_fp,
            "role":       role,
            "_bat_fp":    0.0,
        }

print(f"  Combined pool: {len(steamer_pool):,} unique players ({twp_count} TWP summed)")
print()

# ---------------------------------------------------------------------------
# Load actual 2025 fantasy results
# ---------------------------------------------------------------------------
print("─── Step 4: Load actual fantasy results ──────────────────────────")
hist_path = PROJECT_DIR / "data" / "historical" / f"{TARGET_SEASON}.json"
if not hist_path.exists():
    print(f"  ERROR: {hist_path} not found")
    sys.exit(1)

with open(hist_path) as f:
    hist_data = json.load(f)

actual_by_norm: dict = {}
for roster in hist_data.get("rosters", []):
    for p in roster.get("players", []):
        nm  = p.get("playerName", "")
        pts = float(p.get("totalPoints", 0))
        key = norm_name(nm)
        if key not in actual_by_norm or pts > actual_by_norm[key]["pts"]:
            actual_by_norm[key] = {"name": nm, "pts": pts}

print(f"  {len(actual_by_norm):,} unique rostered players in {TARGET_SEASON}")
print()

# ---------------------------------------------------------------------------
# Match and build comparison DataFrame
# ---------------------------------------------------------------------------
print("─── Step 5: Match Steamer → actual ──────────────────────────────")
matched = []
for norm_key, entry in steamer_pool.items():
    if norm_key in actual_by_norm:
        act = actual_by_norm[norm_key]
        matched.append({
            "name":       entry["name"],
            "role":       entry["role"],
            "steamer_fp": entry["steamer_fp"],
            "actual_pts": act["pts"],
        })

df_m = pd.DataFrame(matched)
df_m = df_m[df_m["actual_pts"] > 0].copy()
df_m["error"]     = df_m["steamer_fp"] - df_m["actual_pts"]
df_m["abs_error"] = df_m["error"].abs()
df_m["proj_rank"] = df_m["steamer_fp"].rank(ascending=False).astype(int)
df_m["act_rank"]  = df_m["actual_pts"].rank(ascending=False).astype(int)

unmatched_steamer = [e["name"] for k, e in steamer_pool.items() if k not in actual_by_norm]
unmatched_actual  = [v["name"] for k, v in actual_by_norm.items() if k not in steamer_pool]
print(f"  Matched (>0 actual pts): {len(df_m):,}")
print(f"  Steamer-only (FA/prospects): {len(unmatched_steamer):,}")
print(f"  Actual-only (no Steamer proj): {len(unmatched_actual):,}")
print()

if len(df_m) < 20:
    print(f"  Not enough matched players ({len(df_m)}).")
    print(f"  FanGraphs may not have archived {TARGET_SEASON} Steamer projections.")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Accuracy stats
# ---------------------------------------------------------------------------
x   = df_m["steamer_fp"]
y   = df_m["actual_pts"]
r   = pearson_r(x, y)
rho = spearman_r(x, y)
rmse = float(np.sqrt(((x - y) ** 2).mean()))
mae  = float((x - y).abs().mean())
bias = float((x - y).mean())

print(f"\n{'='*65}")
print(f"  RESULTS  (n={len(df_m)})")
print(f"{'='*65}\n")

print("  ── Steamer Overall ─────────────────────────────────────────────")
print(f"    Pearson  r  = {r:.3f}")
print(f"    Spearman ρ  = {rho:.3f}")
print(f"    RMSE        = {rmse:.1f} pts")
print(f"    MAE         = {mae:.1f} pts")
print(f"    Bias        = {bias:+.1f} pts  ({'over' if bias > 0 else 'under'}-projected on average)")
print()

# ── Head-to-head vs EROSP ──
print("  ── Head-to-Head: Steamer vs. EROSP Backtest ───────────────────")
print(f"  {'Metric':<14}  {'EROSP':>8}  {'Steamer':>8}  {'Better':>8}")
print(f"  {'-'*48}")

def winner(erosp_val, stm_val, lower_is_better=False):
    if lower_is_better:
        return "EROSP" if erosp_val < stm_val else "Steamer"
    return "EROSP" if erosp_val > stm_val else "Steamer"

print(f"  {'Pearson r':<14}  {EROSP_STATS['pearson_r']:>8.3f}  {r:>8.3f}  "
      f"{winner(EROSP_STATS['pearson_r'], r):>8}")
print(f"  {'Spearman ρ':<14}  {EROSP_STATS['spearman']:>8.3f}  {rho:>8.3f}  "
      f"{winner(EROSP_STATS['spearman'], rho):>8}")
print(f"  {'RMSE':<14}  {EROSP_STATS['rmse']:>8.1f}  {rmse:>8.1f}  "
      f"{winner(EROSP_STATS['rmse'], rmse, lower_is_better=True):>8}")
print(f"  {'|Bias|':<14}  {abs(EROSP_STATS['bias']):>8.1f}  {abs(bias):>8.1f}  "
      f"{winner(abs(EROSP_STATS['bias']), abs(bias), lower_is_better=True):>8}")
print(f"  {'n (matched)':<14}  {EROSP_STATS['n']:>8}  {len(df_m):>8}")
print()

# ── By role ──
print("  ── Accuracy by Role ────────────────────────────────────────────")
print(f"  {'Role':<4}  {'n':>4}  {'Pearson r':>9}  {'Spearman ρ':>10}  {'RMSE':>6}  {'MAE':>6}  {'Bias':>7}")
print(f"  {'-'*58}")
for role in ["H", "SP", "RP"]:
    sub = df_m[df_m["role"] == role]
    if len(sub) < 5:
        continue
    sx, sy = sub["steamer_fp"], sub["actual_pts"]
    pr   = pearson_r(sx, sy)
    sr   = spearman_r(sx, sy)
    rmse_ = float(np.sqrt(((sx - sy) ** 2).mean()))
    mae_  = float((sx - sy).abs().mean())
    bias_ = float((sx - sy).mean())
    print(f"  {role:<4}  {len(sub):>4}  {pr:>9.3f}  {sr:>10.3f}  {rmse_:>6.1f}  {mae_:>6.1f}  {bias_:>+7.1f}")
print()

# ── Top 20 by Steamer ──
print("  ── Top 20 by Steamer — rank accuracy ──────────────────────────")
print(f"  {'#':>3}  {'Name':<26} {'Role':<4} {'Steamer':>7}  {'Actual':>7}  {'Err':>7}  {'ActRk':>6}")
print(f"  {'-'*68}")
for i, (_, row) in enumerate(df_m.nlargest(20, "steamer_fp").iterrows(), 1):
    print(f"  #{i:>2}  {row['name']:<26} {row['role']:<4} "
          f"{row['steamer_fp']:>7.0f}  {row['actual_pts']:>7.0f}  "
          f"{row['error']:>+7.0f}  #{row['act_rank']:>4}")
print()

# ── Biggest over-projections ──
print("  ── Biggest OVER-projections ────────────────────────────────────")
print(f"  {'Name':<26} {'Role':<4} {'Steamer':>7}  {'Actual':>7}  {'Error':>7}")
print(f"  {'-'*58}")
for _, row in df_m.nlargest(12, "error").iterrows():
    note = " (injury?)" if row["actual_pts"] < row["steamer_fp"] * 0.4 else ""
    print(f"  {row['name']:<26} {row['role']:<4} {row['steamer_fp']:>7.0f}  "
          f"{row['actual_pts']:>7.0f}  {row['error']:>+7.0f}{note}")
print()

# ── Biggest under-projections ──
print("  ── Biggest UNDER-projections ───────────────────────────────────")
print(f"  {'Name':<26} {'Role':<4} {'Steamer':>7}  {'Actual':>7}  {'Error':>7}")
print(f"  {'-'*58}")
for _, row in df_m.nsmallest(12, "error").iterrows():
    print(f"  {row['name']:<26} {row['role']:<4} {row['steamer_fp']:>7.0f}  "
          f"{row['actual_pts']:>7.0f}  {row['error']:>+7.0f}")
print()

# ── Save CSV ──
out_dir  = PROJECT_DIR / "data" / "erosp"
out_dir.mkdir(exist_ok=True)
csv_path = out_dir / f"steamer_benchmark_{TARGET_SEASON}.csv"
df_m.sort_values("steamer_fp", ascending=False).to_csv(csv_path, index=False)
print(f"  ✓ Saved → {csv_path.relative_to(PROJECT_DIR)}")

print(f"\n{'='*65}")
print(f"  ✓ Steamer benchmark complete for {TARGET_SEASON}")
print(f"    {len(df_m):,} matched players")
print(f"{'='*65}\n")
