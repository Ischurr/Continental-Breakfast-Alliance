#!/usr/bin/env python3
"""
check_prospect_callups.py

Checks if any CBA-protected minor league prospects have been called up
to the majors by checking MLB Stats API 26-man active rosters.

Reads:  ../data/prospect-protections.json
Writes: ../data/prospect-protections.json  (patches calledUp + calledUpDate)

Run daily via GitHub Actions (update-prospect-callups.yml).
Can also be run locally: python3 check_prospect_callups.py
"""

import json
import os
import sys
import datetime
import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE  = os.path.normpath(os.path.join(SCRIPT_DIR, '..', 'data', 'prospect-protections.json'))
MLB_BASE   = 'https://statsapi.mlb.com/api/v1'
HEADERS    = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}


def get_active_roster(mlb_team_id: int) -> set:
    """Returns set of mlbamIds currently on the 26-man active roster."""
    url = f'{MLB_BASE}/teams/{mlb_team_id}/roster?rosterType=26Man'
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        r.raise_for_status()
        data = r.json()
        return {entry['person']['id'] for entry in data.get('roster', [])}
    except Exception as e:
        print(f'  Warning: could not fetch roster for MLB team {mlb_team_id}: {e}', file=sys.stderr)
        return set()


def verify_via_player_lookup(mlbam_id: int) -> bool:
    """
    Secondary check: look up the player directly and see if they appear
    on an MLB 26-man roster in the current season.
    Used when mlbTeamId is stale (player was traded to a different org).
    """
    url = f'{MLB_BASE}/people/{mlbam_id}?hydrate=currentTeam,rosterEntries'
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        r.raise_for_status()
        data = r.json()
        people = data.get('people', [])
        if not people:
            return False
        person = people[0]
        # rosterEntries: look for an active MLB-level (sportId=1) 26-man entry
        for entry in person.get('rosterEntries', []):
            sport_id   = entry.get('team', {}).get('sport', {}).get('id')
            status     = entry.get('status', {}).get('code', '')
            roster_id  = entry.get('rosterId')  # 26 = 26-man, 40 = 40-man
            if sport_id == 1 and status == 'A' and roster_id == 26:
                return True
        return False
    except Exception as e:
        print(f'  Warning: player lookup failed for mlbamId {mlbam_id}: {e}', file=sys.stderr)
        return False


def main():
    if not os.path.exists(DATA_FILE):
        print(f'Error: {DATA_FILE} not found', file=sys.stderr)
        sys.exit(1)

    with open(DATA_FILE, 'r') as f:
        data = json.load(f)

    today   = datetime.date.today().isoformat()
    changed = False

    for team_id, entry in data.items():
        prospect = entry.get('prospect', {})
        name         = prospect.get('name', 'TBD')
        mlbam_id     = prospect.get('mlbamId')
        mlb_team_id  = prospect.get('mlbTeamId')
        already_up   = prospect.get('calledUp', False)

        # Skip if data not filled in yet or already marked as called up
        if name == 'TBD' or mlbam_id is None:
            continue
        if already_up:
            print(f'  {name} ({entry["teamName"]}): already marked called up on {prospect.get("calledUpDate")}')
            continue

        print(f'Checking {name} ({entry["teamName"]})...', end=' ', flush=True)

        is_up = False

        # Primary check: known MLB team's 26-man roster
        if mlb_team_id:
            roster = get_active_roster(mlb_team_id)
            is_up = mlbam_id in roster

        # Secondary check: direct player lookup (catches trades to new org)
        if not is_up:
            is_up = verify_via_player_lookup(mlbam_id)

        if is_up:
            print(f'CALLED UP! 🚀')
            prospect['calledUp']     = True
            prospect['calledUpDate'] = today
            changed = True
        else:
            print('still in minors')

    if changed:
        with open(DATA_FILE, 'w') as f:
            json.dump(data, f, indent=2)
            f.write('\n')
        print(f'\nUpdated {DATA_FILE}')
    else:
        print('\nNo changes — all prospects still in the minors.')


if __name__ == '__main__':
    main()
