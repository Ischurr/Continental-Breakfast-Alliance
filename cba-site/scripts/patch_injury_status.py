"""
patch_injury_status.py — Lightweight IL status patcher.

Fetches the current MLB Stats API injury/IL map and patches
data/erosp/latest.json in place:
  - Adds/updates `il_type` and `il_days_remaining` for players currently on IL
  - Adds/updates `injury_note` with the injury reason (e.g. "right knee inflammation")
  - Removes IL fields for players who have been activated

Run time: ~5 seconds (30 MLB API calls + 1 transactions API call).
Scheduled 4x daily via update-injury-status.yml to keep IL status
current throughout the day.
"""

import datetime
import json
import re
import sys
import time
from pathlib import Path

# fetch_injury_news provides multi-source scraping (Rotowire, FantasyPros, RSS)
try:
    from fetch_injury_news import fetch_all_injury_news
    NEWS_AVAILABLE = True
except ImportError:
    NEWS_AVAILABLE = False

try:
    import requests
except ImportError:
    print("ERROR: 'requests' package not installed. Run: pip install requests")
    sys.exit(1)

SCRIPTS_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPTS_DIR.parent
LATEST_JSON = PROJECT_DIR / "data" / "erosp" / "latest.json"
CACHE_DIR   = SCRIPTS_DIR / "erosp_cache"
CACHE_DIR.mkdir(exist_ok=True)

# All 30 MLB team IDs (MLBAM IDs, same as erosp/config.py MLB_TEAM_ID_TO_ABBREV)
MLB_TEAM_IDS = [
    108, 109, 110, 111, 112, 113, 114, 115, 116, 117,
    118, 119, 120, 121, 133, 134, 135, 136, 137, 138,
    139, 140, 141, 142, 143, 144, 145, 146, 147, 158,
]

IL_GAMES_ESTIMATE = {
    "D7": 7, "D10": 14, "D15": 21, "D60": 60,
    "SUSP": 30, "S": 30,
    "BRV": 3, "PL": 7,
}


def fetch_injury_map(season: int) -> dict:
    """Fetch current IL status for all 30 MLB teams. Returns {mlbam_id: il_type}."""
    today = datetime.date.today()
    cache_path = CACHE_DIR / f"injured_players_{season}_{today.strftime('%Y%m%d')}.json"

    if cache_path.exists():
        print(f"  Cache hit → {cache_path.name}")
        with open(cache_path) as f:
            return {int(k): v for k, v in json.load(f).items()}

    print(f"  Fetching IL status ({season}) — 30 teams…")
    result: dict = {}

    for team_id in MLB_TEAM_IDS:
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
                person  = entry.get("person", {})
                mlbam_id = person.get("id")
                if not mlbam_id:
                    continue
                status  = entry.get("status", {})
                il_code = status.get("code", "A")
                if il_code in ("A", ""):
                    continue

                act_str = entry.get("expectedActivationDate", "")
                if act_str:
                    try:
                        act_date = datetime.date.fromisoformat(act_str[:10])
                        games_out = max(0, (act_date - today).days)
                    except (ValueError, TypeError):
                        games_out = IL_GAMES_ESTIMATE.get(il_code.upper(), 14)
                else:
                    games_out = IL_GAMES_ESTIMATE.get(il_code.upper(), 14)

                result[int(mlbam_id)] = {
                    "il_type": il_code,
                    "games_missed_est": games_out,
                }
            time.sleep(0.1)
        except Exception as exc:
            print(f"  WARNING: IL fetch failed for team {team_id}: {exc}")

    with open(cache_path, "w") as f:
        json.dump(result, f)
    print(f"  {len(result)} players currently on IL.")
    return result


def fetch_injury_notes(season: int) -> dict:
    """Fetch IL placement descriptions from MLB Stats API transactions.
    Returns {mlbam_id: 'right knee inflammation'} for players placed on IL.
    """
    today = datetime.date.today()
    cache_path = CACHE_DIR / f"injury_notes_{season}_{today.strftime('%Y%m%d')}.json"

    if cache_path.exists():
        print(f"  Cache hit → {cache_path.name}")
        with open(cache_path) as f:
            return {int(k): v for k, v in json.load(f).items()}

    # Fetch transactions from start of season (or 90 days back mid-season)
    season_start = datetime.date(season, 3, 1)
    start_date = max(season_start, today - datetime.timedelta(days=90))

    url = (
        f"https://statsapi.mlb.com/api/v1/transactions"
        f"?sportId=1&startDate={start_date}&endDate={today}"
        f"&fields=transactions,person,id,typeCode,description,date"
    )

    try:
        resp = requests.get(url, timeout=15)
        if resp.status_code != 200:
            print(f"  WARNING: Transactions API returned {resp.status_code}")
            return {}
        transactions = resp.json().get("transactions", [])
    except Exception as exc:
        print(f"  WARNING: Transactions fetch failed: {exc}")
        return {}

    # Build map: mlbam_id -> most recent IL placement note (by date)
    result: dict = {}
    date_map: dict = {}

    for txn in transactions:
        person = txn.get("person", {})
        mlbam_id = person.get("id")
        if not mlbam_id:
            continue

        desc = txn.get("description", "")
        txn_date = txn.get("date", "")
        desc_lower = desc.lower()

        # Only IL placements and transfers — not activations/recalls
        is_placement = any(kw in desc_lower for kw in ["placed on", "transferred to"])
        is_il = "il" in desc_lower or "injured list" in desc_lower
        if not is_placement or not is_il:
            continue

        # Extract injury reason from parentheses: "Placed on the 10-Day IL (right knee inflammation)"
        match = re.search(r'\(([^)]+)\)', desc)
        note = match.group(1).strip() if match else ""
        if not note:
            continue

        # Keep only the most recent placement per player
        if mlbam_id not in date_map or txn_date > date_map[mlbam_id]:
            date_map[mlbam_id] = txn_date
            result[int(mlbam_id)] = note

    with open(cache_path, "w") as f:
        json.dump(result, f)
    print(f"  {len(result)} injury notes fetched.")
    return result


# ── Load latest.json ──────────────────────────────────────────────

if not LATEST_JSON.exists():
    print("data/erosp/latest.json not found — nothing to patch.")
    sys.exit(0)

with open(LATEST_JSON) as f:
    data = json.load(f)

players = data.get("players", [])
if not players:
    print("No players in latest.json — nothing to patch.")
    sys.exit(0)

season = data.get("season", 2026)

# ── Fetch injury map + notes + news ──────────────────────────────

injury_map   = fetch_injury_map(season)
injury_notes = fetch_injury_notes(season)

# Multi-source injury news (Rotowire, FantasyPros, RSS)
# Keyed by normalized player name (lowercase alphanumeric)
injury_news_map: dict = {}
if NEWS_AVAILABLE:
    try:
        from fetch_injury_news import normalize_name as _norm
        raw_news = fetch_all_injury_news(season)
        injury_news_map = raw_news  # already normalized-name keyed
    except Exception as exc:
        print(f"  WARNING: Injury news fetch failed: {exc}")

# ── Build name→news lookup (normalized name → news entry) ─────────

def _norm_simple(name: str) -> str:
    """Quick normalize without unicodedata (already handled in fetch_injury_news)."""
    import re as _re
    n = name.lower()
    n = _re.sub(r"\s+(jr\.?|sr\.?|ii|iii|iv)\.?\s*$", "", n)
    n = _re.sub(r"[^a-z0-9]", "", n)
    return n.strip()

# ── Patch each player ─────────────────────────────────────────────

patched   = 0
activated = 0

for player in players:
    mlbam_id = player.get("mlbam_id")
    if mlbam_id is None:
        continue

    if mlbam_id in injury_map:
        il_info  = injury_map[mlbam_id]
        il_type  = il_info["il_type"]
        il_days  = int(il_info.get("games_missed_est", 0))
        txn_note = injury_notes.get(mlbam_id, "")

        # Look up multi-source news by normalized name
        norm_key  = _norm_simple(player.get("name", ""))
        news_entry = injury_news_map.get(norm_key, {})
        news_text   = news_entry.get("text", "")
        news_source = news_entry.get("source", "")
        news_date   = news_entry.get("date", "")

        changed = (
            player.get("il_type") != il_type
            or player.get("il_days_remaining") != il_days
            or player.get("injury_note", "") != txn_note
            or player.get("injury_news", "") != news_text
        )
        if changed:
            player["il_type"] = il_type
            player["il_days_remaining"] = il_days
            if txn_note:
                player["injury_note"] = txn_note
            else:
                player.pop("injury_note", None)
            if news_text:
                player["injury_news"] = news_text
                player["injury_news_source"] = news_source
                player["injury_news_date"] = news_date
            else:
                player.pop("injury_news", None)
                player.pop("injury_news_source", None)
                player.pop("injury_news_date", None)
            patched += 1
    else:
        if "il_type" in player:
            del player["il_type"]
            player.pop("il_days_remaining", None)
            player.pop("injury_note", None)
            player.pop("injury_news", None)
            player.pop("injury_news_source", None)
            player.pop("injury_news_date", None)
            activated += 1

# ── Save ──────────────────────────────────────────────────────────

with open(LATEST_JSON, "w") as f:
    json.dump(data, f, separators=(",", ":"))

print(f"Patched: {patched} IL updates, {activated} activations cleared.")
print(f"Saved → {LATEST_JSON.relative_to(PROJECT_DIR)}")
