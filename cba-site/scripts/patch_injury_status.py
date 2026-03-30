"""
patch_injury_status.py — Lightweight IL status patcher.

Fetches the current MLB Stats API injury/IL map and patches
data/erosp/latest.json in place:
  - Adds/updates `il_type` for players currently on IL
  - Removes `il_type` for players who have been activated

Run time: ~5 seconds (30 MLB API calls, no FanGraphs/pybaseball).
Scheduled 4x daily via update-injury-status.yml to keep IL status
current throughout the day.
"""

import datetime
import json
import sys
import time
from pathlib import Path

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

# ── Fetch injury map ──────────────────────────────────────────────

injury_map = fetch_injury_map(season)

# ── Patch each player ─────────────────────────────────────────────

patched   = 0
activated = 0

for player in players:
    mlbam_id = player.get("mlbam_id")
    if mlbam_id is None:
        continue

    if mlbam_id in injury_map:
        il_info = injury_map[mlbam_id]
        il_type = il_info["il_type"]
        il_days = int(il_info.get("games_missed_est", 0))
        if player.get("il_type") != il_type or player.get("il_days_remaining") != il_days:
            player["il_type"] = il_type
            player["il_days_remaining"] = il_days
            patched += 1
    else:
        if "il_type" in player:
            del player["il_type"]
            player.pop("il_days_remaining", None)
            activated += 1

# ── Save ──────────────────────────────────────────────────────────

with open(LATEST_JSON, "w") as f:
    json.dump(data, f, separators=(",", ":"))

print(f"Patched: {patched} IL updates, {activated} activations cleared.")
print(f"Saved → {LATEST_JSON.relative_to(PROJECT_DIR)}")
