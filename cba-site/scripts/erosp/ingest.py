"""
Data ingestion layer for EROSP.

Fetches and caches:
  - FanGraphs batting + pitching stats (pybaseball)
  - Statcast xwOBA and sprint speed (pybaseball)
  - MLB schedule for the rest of season (python-mlb-statsapi)
  - ESPN fantasy roster + free agent data (local JSON files)
  - MLBAM ↔ FanGraphs ID mapping (Chadwick register via pybaseball)
"""

import json
import time
import datetime
import warnings
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import pandas as pd
import numpy as np

warnings.filterwarnings("ignore")

from .config import (
    PARK_FACTORS, TEAM_NORMALIZE, MLB_TEAM_ID_TO_ABBREV,
    FULL_SEASON_GAMES,
)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPTS_DIR = Path(__file__).parent.parent          # cba-site/scripts/
DATA_DIR    = SCRIPTS_DIR.parent / "data" / "current"
CACHE_DIR   = SCRIPTS_DIR / "erosp_cache"
CACHE_DIR.mkdir(exist_ok=True)

ESPN_ROSTERS_PATH    = DATA_DIR / "2026.json"
ESPN_FREE_AGENTS_PATH = DATA_DIR / "free-agents.json"


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def _retry(func, *args, retries: int = 3, delay: float = 3.0, label: str = "", **kwargs):
    """Call func with retries on failure."""
    for attempt in range(retries):
        try:
            result = func(*args, **kwargs)
            if result is not None:
                return result
        except Exception as exc:
            if attempt < retries - 1:
                print(f"    Attempt {attempt+1} failed ({exc}). Retrying in {delay}s…")
                time.sleep(delay)
            else:
                print(f"    All {retries} attempts failed for {label or func.__name__}: {exc}")
    return None


def _cached_df(cache_path: Path, fetch_func, *args, label: str = "", **kwargs) -> Optional[pd.DataFrame]:
    """Load DataFrame from CSV cache; fetch and cache if missing."""
    if cache_path.exists():
        print(f"    Cache hit  → {cache_path.name}")
        return pd.read_csv(cache_path, low_memory=False)
    print(f"    Fetching   → {cache_path.name}")
    df = _retry(fetch_func, *args, label=label, **kwargs)
    if df is not None and not df.empty:
        df.to_csv(cache_path, index=False)
    return df


def _normalize_team(team_raw) -> str:
    t = str(team_raw).strip().upper()
    return TEAM_NORMALIZE.get(t, t)


# ---------------------------------------------------------------------------
# Chadwick register (FanGraphs ID ↔ MLBAM ID ↔ name)
# ---------------------------------------------------------------------------

def fetch_id_map() -> pd.DataFrame:
    """Return DataFrame with columns: name_first, name_last, key_fangraphs, key_mlbam."""
    from pybaseball import chadwick_register
    cache_path = CACHE_DIR / "chadwick_register.csv"
    df = _cached_df(cache_path, chadwick_register, label="chadwick_register")
    if df is None or df.empty:
        raise RuntimeError("Could not load Chadwick register.")

    df = df[["name_first", "name_last", "key_fangraphs", "key_mlbam"]].copy()
    df["key_fangraphs"] = pd.to_numeric(df["key_fangraphs"], errors="coerce")
    df["key_mlbam"]     = pd.to_numeric(df["key_mlbam"],     errors="coerce")
    df = df.dropna(subset=["key_fangraphs", "key_mlbam"])
    df["key_fangraphs"] = df["key_fangraphs"].astype(int)
    df["key_mlbam"]     = df["key_mlbam"].astype(int)
    df = df.drop_duplicates(subset=["key_fangraphs"])

    # Build full name for matching
    df["full_name"] = (
        df["name_first"].fillna("").str.strip() + " " +
        df["name_last"].fillna("").str.strip()
    ).str.strip().str.lower()

    print(f"    Chadwick: {len(df):,} ID mappings loaded.")
    return df


# ---------------------------------------------------------------------------
# Player info (birthdate + MLB position) from StatsAPI
# ---------------------------------------------------------------------------

def fetch_player_info(mlbam_ids: List[int]) -> pd.DataFrame:
    """Batch-fetch birth date + primary position from MLB Stats API."""
    import requests

    cache_path = CACHE_DIR / "mlb_player_info.csv"
    if cache_path.exists():
        cached = pd.read_csv(cache_path)
        cached_ids = set(cached["mlbam_id"].dropna().astype(int).tolist())
        new_ids = [x for x in mlbam_ids if x not in cached_ids]
        if not new_ids:
            print("    Cache hit  → mlb_player_info.csv")
            return cached
        print(f"    Fetching player info for {len(new_ids):,} new IDs…")
    else:
        cached = pd.DataFrame()
        new_ids = mlbam_ids
        print(f"    Fetching player info for {len(new_ids):,} players…")

    rows = []
    for i in range(0, len(new_ids), 200):
        batch = new_ids[i : i + 200]
        url = (
            f"https://statsapi.mlb.com/api/v1/people"
            f"?personIds={','.join(str(x) for x in batch)}"
            f"&fields=people,id,birthDate,primaryPosition,abbreviation"
        )
        try:
            resp = requests.get(url, timeout=15)
            if resp.status_code == 200:
                for p in resp.json().get("people", []):
                    row: dict = {"mlbam_id": p["id"]}
                    bd = p.get("birthDate", "")
                    if bd:
                        parts = bd.split("-")
                        if len(parts) == 3:
                            row["birth_year"]  = int(parts[0])
                            row["birth_month"] = int(parts[1])
                            row["birth_day"]   = int(parts[2])
                    row["mlb_position"] = p.get("primaryPosition", {}).get("abbreviation", "")
                    rows.append(row)
            time.sleep(0.2)
        except Exception as exc:
            print(f"    Warning: player info batch {i//200 + 1} failed ({exc})")

    if rows:
        new_df = pd.DataFrame(rows)
        out = pd.concat([cached, new_df], ignore_index=True) if not cached.empty else new_df
        out.to_csv(cache_path, index=False)
        print(f"    {len(rows):,} new players fetched (total: {len(out):,}).")
        return out

    return cached if not cached.empty else pd.DataFrame()


# ---------------------------------------------------------------------------
# Batting stats (FanGraphs via pybaseball)
# ---------------------------------------------------------------------------

def fetch_batting_stats(years: List[int], min_pa: int = 100) -> Dict[int, pd.DataFrame]:
    """Return dict of year → DataFrame with batting stats and per-PA rates."""
    from pybaseball import batting_stats

    result: Dict[int, pd.DataFrame] = {}
    for year in years:
        cache_path = CACHE_DIR / f"batting_stats_{year}.csv"
        df = _cached_df(cache_path, batting_stats, year, qual=min_pa,
                        label=f"batting_stats({year})")
        if df is None or df.empty:
            print(f"    WARNING: No batting data for {year}.")
            continue

        df.columns = [c.strip() for c in df.columns]

        # Require essential columns
        required = ["Name", "IDfg", "Team", "G", "PA", "H", "2B", "3B", "HR",
                    "R", "RBI", "SB", "BB"]
        missing = [c for c in required if c not in df.columns]
        if missing:
            print(f"    WARNING: Batting {year} missing columns {missing} — skipping.")
            continue

        df["IDfg"] = pd.to_numeric(df["IDfg"], errors="coerce")
        df = df.dropna(subset=["IDfg"])
        df["IDfg"] = df["IDfg"].astype(int)
        df["PA"]   = pd.to_numeric(df["PA"], errors="coerce").fillna(0)
        df         = df[df["PA"] >= min_pa]

        # Numeric coercions
        for col in ["H", "2B", "3B", "HR", "R", "RBI", "SB", "BB", "G"]:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

        # CS (caught stealing) — may not be present
        if "CS" in df.columns:
            df["CS"] = pd.to_numeric(df["CS"], errors="coerce").fillna(0)
        else:
            df["CS"] = df["SB"] * 0.28   # ~22% caught rate approximation

        # HBP (hit by pitch)
        if "HBP" in df.columns:
            df["HBP"] = pd.to_numeric(df["HBP"], errors="coerce").fillna(0)
        else:
            df["HBP"] = df["PA"] * 0.010   # ~1% of PA fallback (league avg ~0.8%)

        # GIDP
        for gidp_col in ["GIDP", "GDP", "Gidp"]:
            if gidp_col in df.columns:
                df["GIDP"] = pd.to_numeric(df[gidp_col], errors="coerce").fillna(0)
                break
        else:
            df["GIDP"] = df["PA"] * 0.040  # ~4% of PA result in GIDP (league avg)

        # Strikeouts (column name varies)
        so_col = next((c for c in ["SO", "K", "Krate"] if c in df.columns), None)
        if so_col == "Krate" or so_col is None:
            k_pct = pd.to_numeric(df.get("K%", ""), errors="coerce").fillna(0.22)
            df["SO"] = (df["PA"] * k_pct).round()
        else:
            df["SO"] = pd.to_numeric(df[so_col], errors="coerce").fillna(0)

        # wOBA
        for woba_col in ["wOBA", "woba"]:
            if woba_col in df.columns:
                df["wOBA"] = pd.to_numeric(df[woba_col], errors="coerce")
                break
        else:
            df["wOBA"] = np.nan

        # Compute per-PA rates
        pa = df["PA"].clip(lower=1)
        singles = (df["H"] - df["2B"] - df["3B"] - df["HR"]).clip(lower=0)
        df["single_rate"] = singles / pa
        df["double_rate"] = df["2B"] / pa
        df["triple_rate"] = df["3B"] / pa
        df["hr_rate"]     = df["HR"] / pa
        df["bb_rate"]     = df["BB"] / pa
        df["k_rate"]      = df["SO"] / pa
        df["sb_rate"]     = df["SB"] / pa
        df["cs_rate"]     = df["CS"] / pa
        df["r_per_pa"]    = df["R"]   / pa
        df["rbi_per_pa"]  = df["RBI"] / pa
        df["gidp_rate"]   = df["GIDP"] / pa
        df["hbp_rate"]    = df["HBP"]  / pa

        df["team_norm"]   = df["Team"].apply(_normalize_team)
        df["year"]        = year

        result[year] = df
        print(f"    Batting {year}: {len(df):,} players.")

    return result


# ---------------------------------------------------------------------------
# Pitching stats (FanGraphs via pybaseball)
# ---------------------------------------------------------------------------

def fetch_pitching_stats(years: List[int], min_ip: int = 20) -> Dict[int, pd.DataFrame]:
    """Return dict of year → DataFrame with pitching stats and per-IP rates."""
    from pybaseball import pitching_stats

    result: Dict[int, pd.DataFrame] = {}
    for year in years:
        cache_path = CACHE_DIR / f"pitching_stats_{year}.csv"
        df = _cached_df(cache_path, pitching_stats, year, qual=min_ip,
                        label=f"pitching_stats({year})")
        if df is None or df.empty:
            print(f"    WARNING: No pitching data for {year}.")
            continue

        df.columns = [c.strip() for c in df.columns]
        required = ["Name", "IDfg", "Team", "G", "IP"]
        missing = [c for c in required if c not in df.columns]
        if missing:
            print(f"    WARNING: Pitching {year} missing columns {missing} — skipping.")
            continue

        df["IDfg"] = pd.to_numeric(df["IDfg"], errors="coerce")
        df = df.dropna(subset=["IDfg"])
        df["IDfg"] = df["IDfg"].astype(int)
        df["IP"]   = pd.to_numeric(df["IP"], errors="coerce").fillna(0)
        df         = df[df["IP"] >= min_ip]

        for col in ["G", "GS", "H", "ER", "BB", "W", "L", "SV", "HLD"]:
            df[col] = pd.to_numeric(df.get(col, 0), errors="coerce").fillna(0)
        if "GS" not in df.columns:
            df["GS"] = 0

        # Strikeouts
        so_col = next((c for c in ["SO", "K"] if c in df.columns), None)
        if so_col:
            df["SO"] = pd.to_numeric(df[so_col], errors="coerce").fillna(0)
        elif "K/9" in df.columns:
            df["SO"] = pd.to_numeric(df["K/9"], errors="coerce").fillna(0) * df["IP"] / 9
        else:
            df["SO"] = df["IP"] * 0.9   # fallback: 9 K/9

        # ERA
        if "ERA" in df.columns:
            df["ERA"] = pd.to_numeric(df["ERA"], errors="coerce").fillna(4.50)
        else:
            df["ERA"] = (df["ER"] / df["IP"].clip(lower=1)) * 9

        # QS — quality starts
        for qs_col in ["QS", "Qs"]:
            if qs_col in df.columns:
                df["QS"] = pd.to_numeric(df[qs_col], errors="coerce").fillna(0)
                break
        else:
            # Estimate QS% from ERA and IP/GS (6+ IP and ≤3 ER = QS)
            gs_safe = df["GS"].clip(lower=1)
            ip_per_gs = df["IP"] / gs_safe
            df["QS"] = (df["GS"] * np.clip((ip_per_gs - 5.0) * 0.5, 0, 1)).where(df["GS"] > 0, 0)

        # Per-IP rates
        ip = df["IP"].clip(lower=1)
        df["k_per_ip"]  = df["SO"] / ip
        df["bb_per_ip"] = df["BB"] / ip
        df["h_per_ip"]  = df["H"]  / ip
        df["er_per_ip"] = df["ER"] / ip   # also = ERA / 9

        # SP vs RP classification
        g_safe = df["G"].clip(lower=1)
        df["sp_ratio"] = df["GS"] / g_safe
        df["role"]     = df["sp_ratio"].apply(lambda r: "SP" if r >= 0.5 else "RP")

        # IP per start (SPs only)
        gs_safe = df["GS"].clip(lower=1)
        df["ip_per_gs"] = (df["IP"] / gs_safe).where(df["GS"] > 0, 0)

        # IP per appearance (RPs)
        appearances = (df["G"] - df["GS"]).clip(lower=1)
        rp_ip = (df["IP"] - df["GS"] * df["ip_per_gs"]).clip(lower=0)
        df["ip_per_app"] = (rp_ip / appearances).where(df["GS"] < df["G"], 0)

        # Win and save rates
        df["w_per_gs"]   = (df["W"] / gs_safe).where(df["GS"] > 0, 0)
        df["sv_per_g"]   = df["SV"] / g_safe
        df["hd_per_g"]   = df["HLD"] / g_safe
        df["qs_per_gs"]  = (df["QS"] / gs_safe).where(df["GS"] > 0, 0)

        df["team_norm"]  = df["Team"].apply(_normalize_team)
        df["year"]       = year

        result[year] = df
        print(f"    Pitching {year}: {len(df):,} pitchers.")

    return result


# ---------------------------------------------------------------------------
# Statcast xwOBA
# ---------------------------------------------------------------------------

def fetch_statcast_xwoba(years: List[int]) -> Dict[int, pd.DataFrame]:
    """Return dict of year → DataFrame with columns [mlbam_id, xwOBA]."""
    from pybaseball import statcast_batter_expected_stats

    result: Dict[int, pd.DataFrame] = {}
    for year in years:
        cache_path = CACHE_DIR / f"statcast_xwoba_{year}.csv"
        df = _cached_df(cache_path, statcast_batter_expected_stats, year,
                        minPA=25, label=f"statcast_xwoba({year})")
        if df is None or df.empty:
            continue

        df.columns = [c.strip() for c in df.columns]

        rename_map = {}
        for src, dst in [("player_id", "mlbam_id"), ("est_woba", "xwOBA"), ("woba", "wOBA_sv")]:
            if src in df.columns:
                rename_map[src] = dst
        df = df.rename(columns=rename_map)

        if "xwOBA" not in df.columns:
            continue

        df["mlbam_id"] = pd.to_numeric(df.get("mlbam_id", pd.Series(dtype=float)), errors="coerce")
        df = df.dropna(subset=["mlbam_id"])
        df["mlbam_id"] = df["mlbam_id"].astype(int)
        df["xwOBA"]    = pd.to_numeric(df["xwOBA"], errors="coerce")

        keep = ["mlbam_id", "xwOBA"] + (["wOBA_sv"] if "wOBA_sv" in df.columns else [])
        result[year] = df[keep].copy()
        print(f"    xwOBA {year}: {len(df):,} players.")

    return result


# ---------------------------------------------------------------------------
# Sprint speed
# ---------------------------------------------------------------------------

def fetch_sprint_speed(year: int) -> Optional[pd.DataFrame]:
    """Return DataFrame with [mlbam_id, sprint_speed, speed_pct] or None."""
    from pybaseball import statcast_sprint_speed

    cache_path = CACHE_DIR / f"sprint_speed_{year}.csv"
    df = _cached_df(cache_path, statcast_sprint_speed, year, min_opp=0,
                    label=f"sprint_speed({year})")
    if df is None or df.empty or "sprint_speed" not in df.columns:
        print(f"    WARNING: Sprint speed data unavailable for {year}.")
        return None

    df.columns = [c.strip() for c in df.columns]

    # player_id → mlbam_id
    for id_col in ["player_id", "mlbam_id", "id"]:
        if id_col in df.columns:
            df["mlbam_id"] = pd.to_numeric(df[id_col], errors="coerce")
            break
    else:
        print("    WARNING: No player ID column in sprint speed data.")
        return None

    df = df.dropna(subset=["mlbam_id"])
    df["mlbam_id"]    = df["mlbam_id"].astype(int)
    df["sprint_speed"] = pd.to_numeric(df["sprint_speed"], errors="coerce")
    df = df.dropna(subset=["sprint_speed"])
    df["speed_pct"]   = df["sprint_speed"].rank(pct=True) * 100

    print(f"    Sprint speed {year}: {len(df):,} players, "
          f"median {df['sprint_speed'].median():.1f} ft/s.")
    return df[["mlbam_id", "sprint_speed", "speed_pct"]].copy()


# ---------------------------------------------------------------------------
# Current IL / injury status from MLB Stats API
# ---------------------------------------------------------------------------

def _il_code_to_games(code: str) -> int:
    """Conservative estimate of games still to be missed based on IL type."""
    return {"D7": 7, "D10": 14, "D15": 21, "D60": 60}.get(str(code).upper(), 14)


def fetch_injured_players(season: int = 2026) -> Dict[int, dict]:
    """
    Fetch current IL status for all 30 MLB teams (cached daily).

    Returns Dict[mlbam_id → {"il_type": str, "games_missed_est": int}]
    where games_missed_est is the estimated remaining games the player will miss.

    Uses MLB Stats API team roster (rosterType=40Man) with status hydration.
    Falls back to IL-type estimates when expectedActivationDate is unavailable.
    """
    import requests

    today = datetime.date.today()
    cache_path = CACHE_DIR / f"injured_players_{season}_{today.strftime('%Y%m%d')}.json"

    if cache_path.exists():
        print(f"    Cache hit  → {cache_path.name}")
        with open(cache_path) as f:
            return {int(k): v for k, v in json.load(f).items()}

    print(f"    Fetching IL status ({season}) — 30 teams…")
    result: Dict[int, dict] = {}

    for team_id in sorted(MLB_TEAM_ID_TO_ABBREV.keys()):
        url = (
            f"https://statsapi.mlb.com/api/v1/teams/{team_id}/roster"
            f"?rosterType=40Man&season={season}"
            f"&fields=roster,person,id,fullName,status,code,expectedActivationDate"
        )
        try:
            resp = requests.get(url, timeout=10)
            if resp.status_code != 200:
                continue
            for entry in resp.json().get("roster", []):
                person = entry.get("person", {})
                mlbam_id = person.get("id")
                if not mlbam_id:
                    continue

                status   = entry.get("status", {})
                il_code  = status.get("code", "A")

                # Only include players not on the active roster
                if il_code in ("A", ""):
                    continue

                # Use expectedActivationDate when available for precision
                act_str = entry.get("expectedActivationDate", "")
                if act_str:
                    try:
                        act_date = datetime.date.fromisoformat(act_str[:10])
                        games_missed_est = max(0, (act_date - today).days)
                    except (ValueError, TypeError):
                        games_missed_est = _il_code_to_games(il_code)
                else:
                    games_missed_est = _il_code_to_games(il_code)

                result[int(mlbam_id)] = {
                    "il_type":         il_code,
                    "games_missed_est": games_missed_est,
                }
            time.sleep(0.1)  # 30 calls × 0.1s = ~3s total
        except Exception as exc:
            print(f"    WARNING: IL fetch failed for team {team_id}: {exc}")

    with open(cache_path, "w") as f:
        json.dump(result, f)

    print(f"    IL status: {len(result):,} players currently on IL.")
    return result


# ---------------------------------------------------------------------------
# MLB schedule (remaining games from today through end of regular season)
# ---------------------------------------------------------------------------

def fetch_schedule_summary(season: int = 2026) -> Dict[int, dict]:
    """
    Return dict keyed by MLB team ID:
      {
        "abbrev": "LAD",
        "games_remaining": 142,
        "avg_park_factor_remaining": 0.99,
        "avg_opp_era": 4.20,
      }
    """
    import requests

    today = datetime.date.today()
    season_end = datetime.date(season, 10, 5)
    if today >= season_end:
        # Off-season: project full season
        today = datetime.date(season, 3, 27)

    cache_path = CACHE_DIR / f"schedule_summary_{season}_{today.strftime('%Y%m%d')}.json"
    if cache_path.exists():
        print(f"    Cache hit  → {cache_path.name}")
        with open(cache_path) as f:
            return {int(k): v for k, v in json.load(f).items()}

    print(f"    Fetching MLB schedule {today} – {season_end}…")

    # Use python-mlb-statsapi if available, else fall back to direct API call
    try:
        import statsapi
        use_statsapi = True
    except ImportError:
        use_statsapi = False

    games: list = []
    if use_statsapi:
        try:
            start_str = today.strftime("%m/%d/%Y")
            end_str   = season_end.strftime("%m/%d/%Y")
            raw = statsapi.schedule(start_date=start_str, end_date=end_str,
                                    sportId=1, gameType="R")
            games = raw if raw else []
        except Exception as exc:
            print(f"    statsapi.schedule failed ({exc}); trying direct API…")
            use_statsapi = False

    if not use_statsapi or not games:
        # Direct MLB Stats API call
        try:
            url = (
                f"https://statsapi.mlb.com/api/v1/schedule"
                f"?sportId=1&startDate={today}&endDate={season_end}&gameType=R"
                f"&fields=dates,games,teams,home,away,team,id"
            )
            resp = requests.get(url, timeout=20)
            if resp.status_code == 200:
                for date_entry in resp.json().get("dates", []):
                    for g in date_entry.get("games", []):
                        home = g.get("teams", {}).get("home", {}).get("team", {})
                        away = g.get("teams", {}).get("away", {}).get("team", {})
                        if home and away:
                            games.append({
                                "home_id": home.get("id"),
                                "away_id": away.get("id"),
                                "home_name": home.get("name", ""),
                                "away_name": away.get("name", ""),
                            })
        except Exception as exc:
            print(f"    WARNING: Could not fetch schedule ({exc}). Using full-season defaults.")

    # Build per-team summaries
    team_games: Dict[int, List[dict]] = {}

    def _add_game(team_id, opponent_id, is_home):
        if team_id not in team_games:
            team_games[team_id] = []
        team_abbrev = MLB_TEAM_ID_TO_ABBREV.get(team_id, "")
        opp_abbrev  = MLB_TEAM_ID_TO_ABBREV.get(opponent_id, "")
        park_abbrev = team_abbrev if is_home else opp_abbrev
        pf = PARK_FACTORS.get(park_abbrev, 1.00)
        team_games[team_id].append({
            "is_home": is_home,
            "opponent_id": opponent_id,
            "park_factor": pf,
        })

    for g in games:
        home_id = g.get("home_id") or g.get("home", {}).get("id") if isinstance(g, dict) else None
        away_id = g.get("away_id") or g.get("away", {}).get("id") if isinstance(g, dict) else None
        if not home_id or not away_id:
            continue
        _add_game(home_id, away_id, is_home=True)
        _add_game(away_id, home_id, is_home=False)

    # If we got no games (off-season or API failure), synthesize based on team list
    if not team_games:
        print("    WARNING: No schedule data; using 162-game default for all teams.")
        for team_id, abbrev in MLB_TEAM_ID_TO_ABBREV.items():
            pf = PARK_FACTORS.get(abbrev, 1.00)
            team_games[team_id] = [
                {"is_home": i % 2 == 0, "park_factor": pf, "opponent_id": 0}
                for i in range(FULL_SEASON_GAMES)
            ]

    result: Dict[int, dict] = {}
    for team_id, game_list in team_games.items():
        abbrev = MLB_TEAM_ID_TO_ABBREV.get(team_id, "")
        avg_pf = np.mean([g["park_factor"] for g in game_list]) if game_list else 1.0
        result[team_id] = {
            "abbrev": abbrev,
            "games_remaining": len(game_list),
            "avg_park_factor_remaining": round(float(avg_pf), 4),
        }

    with open(cache_path, "w") as f:
        json.dump(result, f)

    print(f"    Schedule: {sum(d['games_remaining'] for d in result.values()) // 2:,} games remaining.")
    return result


# ---------------------------------------------------------------------------
# ESPN fantasy roster + free agent data
# ---------------------------------------------------------------------------

def load_espn_data() -> Tuple[List[dict], List[dict], Dict[int, int]]:
    """
    Returns:
      rostered_players: list of {playerId, playerName, position, fantasyTeamId, ...}
      free_agents:      list of {playerId, playerName, position, ...}
      espn_to_team_id:  dict of ESPN player ID (str) → fantasy team ID (int)
    """
    rostered: List[dict] = []
    fa: List[dict] = []
    espn_to_team: Dict[str, int] = {}

    # Rosters from current season JSON
    if ESPN_ROSTERS_PATH.exists():
        try:
            with open(ESPN_ROSTERS_PATH) as f:
                season_data = json.load(f)
            rosters = season_data.get("rosters", [])
            for roster in rosters:
                team_id = roster.get("teamId")
                for p in roster.get("players", []):
                    pid = str(p.get("playerId", p.get("id", "")))
                    entry = {**p, "fantasyTeamId": team_id, "playerId": pid}
                    rostered.append(entry)
                    espn_to_team[pid] = team_id
        except Exception as exc:
            print(f"    WARNING: Could not load ESPN rosters ({exc}).")
    else:
        print(f"    INFO: ESPN rosters file not found at {ESPN_ROSTERS_PATH}. Pre-season mode.")

    # Free agents
    if ESPN_FREE_AGENTS_PATH.exists():
        try:
            with open(ESPN_FREE_AGENTS_PATH) as f:
                fa_data = json.load(f)
            fa = [{"playerId": str(p.get("playerId", "")), **p}
                  for p in fa_data.get("players", [])]
        except Exception as exc:
            print(f"    WARNING: Could not load ESPN free agents ({exc}).")

    print(f"    ESPN data: {len(rostered):,} rostered, {len(fa):,} free agents.")
    return rostered, fa, espn_to_team


# ---------------------------------------------------------------------------
# Name-based MLBAM ID lookup (FanGraphs name → MLBAM via Chadwick)
# ---------------------------------------------------------------------------

def build_name_to_mlbam(id_map_df: pd.DataFrame) -> Dict[str, int]:
    """Build lowercase full-name → MLBAM ID mapping from Chadwick register."""
    out: Dict[str, int] = {}
    for _, row in id_map_df.iterrows():
        name = str(row["full_name"]).lower().strip()
        if name:
            out[name] = int(row["key_mlbam"])
    return out


def build_name_to_mlbam_from_chadwick() -> Dict[str, int]:
    """
    Build a name → MLBAM ID lookup directly from the raw Chadwick CSV cache,
    WITHOUT deduplicating on key_fangraphs.

    This is needed for newer/rookie players whose key_fangraphs = -1 (FanGraphs
    hasn't assigned them an ID yet). fetch_id_map() drops all but one of those
    rows via drop_duplicates(subset=["key_fangraphs"]), so they don't appear in
    the standard name_to_mlbam dict.

    Names are normalized (accents stripped, suffixes removed, alphanumeric only).
    Ambiguous names (same normalized name → different mlbam_ids) are excluded.
    """
    import re, unicodedata

    cache_path = CACHE_DIR / "chadwick_register.csv"
    if not cache_path.exists():
        print("    WARNING: Chadwick cache not found; build_name_to_mlbam_from_chadwick() returning empty.")
        return {}

    df = pd.read_csv(cache_path, low_memory=False)
    df = df[["name_first", "name_last", "key_mlbam"]].copy()
    df["key_mlbam"] = pd.to_numeric(df["key_mlbam"], errors="coerce")
    df = df.dropna(subset=["key_mlbam"])
    df["key_mlbam"] = df["key_mlbam"].astype(int)

    df["full_name"] = (
        df["name_first"].fillna("").str.strip() + " " +
        df["name_last"].fillna("").str.strip()
    ).str.strip()

    def _norm(n: str) -> str:
        n = unicodedata.normalize("NFKD", n).encode("ascii", "ignore").decode()
        n = re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?", "", n.lower())
        n = re.sub(r"[^a-z ]", "", n)
        return " ".join(n.split())

    df["norm_name"] = df["full_name"].apply(_norm)
    df = df[df["norm_name"].str.len() > 0]

    # Build mapping; skip ambiguous names (same norm_name → different mlbam_ids)
    name_to_id: Dict[str, int] = {}
    ambiguous: set = set()
    for _, row in df.iterrows():
        norm = row["norm_name"]
        mid  = int(row["key_mlbam"])
        if norm in ambiguous:
            continue
        if norm in name_to_id and name_to_id[norm] != mid:
            ambiguous.add(norm)
            del name_to_id[norm]
        else:
            name_to_id[norm] = mid

    print(f"    Chadwick name→MLBAM (raw): {len(name_to_id):,} unambiguous mappings "
          f"({len(ambiguous):,} ambiguous names excluded).")
    return name_to_id


def build_fangraphs_to_mlbam(id_map_df: pd.DataFrame) -> Dict[int, int]:
    """Build FanGraphs ID → MLBAM ID mapping."""
    return dict(zip(id_map_df["key_fangraphs"], id_map_df["key_mlbam"]))


def espn_name_to_mlbam(
    espn_name: str,
    name_to_mlbam: Dict[str, int],
) -> Optional[int]:
    """
    Try to resolve an ESPN player name to an MLBAM ID.
    Handles common name variations: Jr., III, accented characters, etc.
    """
    import unicodedata
    import re

    def _normalize(n: str) -> str:
        # Remove accents, lowercase, strip suffixes
        n = unicodedata.normalize("NFKD", n).encode("ascii", "ignore").decode()
        n = re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?", "", n.lower())
        n = re.sub(r"[^a-z ]", "", n)
        return " ".join(n.split())

    key = _normalize(espn_name)
    if key in name_to_mlbam:
        return name_to_mlbam[key]

    # Try last-name-first match
    parts = key.split()
    if len(parts) >= 2:
        flipped = f"{parts[-1]} {' '.join(parts[:-1])}"
        if flipped in name_to_mlbam:
            return name_to_mlbam[flipped]

    return None
