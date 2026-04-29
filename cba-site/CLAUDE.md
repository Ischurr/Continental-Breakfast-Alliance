# Continental Breakfast Alliance — Fantasy Baseball Site

## What This Is
A Next.js App Router site for the CBA keeper fantasy baseball league. Displays standings, matchups, team profiles, player stats, playoff brackets, polls, and a trash-talk board. Syncs live data from the ESPN Fantasy API via scripts.

## Stack
- **Next.js 16 App Router**, React 19, TypeScript (strict), Tailwind CSS v4
- **No database** — all data is JSON files; mutations via Next.js Server Actions
- Local-only deployment (private league, trusted group, no auth needed)
- Path alias: `@/*` → project root

## Project Layout
```
app/              # Pages (App Router file-based routing)
components/       # Reusable React components
lib/
  types.ts        # All TypeScript interfaces
  data-processor.ts  # Core data helpers (getAllSeasons, getCurrentSeason, standings calc)
  espn-api.ts     # ESPN Fantasy API client
  news-fetcher.ts # RSS news aggregator
data/
  teams.json              # Team metadata — shape is { teams: [...] }, NOT a plain array
  polls.json              # Local dev only — production uses Upstash KV
  trash-talk.json         # Bulletin board posts
  historical/2022-2025.json  # Completed seasons (static)
  current/2026.json          # Live season (updated via fetch-current script)
  current/free-agents.json   # Updated via fetch-free-agents script
  projections/2026.json      # Shape is { players: [...] }, NOT a plain array
  erosp/latest.json          # Daily EROSP projections (1,750 players)
  fantasy/schedule-2026.json # Week-boundary map (Week 1 = 12 days, etc.)
scripts/          # Node/tsx scripts for ESPN data sync + newsletter
public/           # Static assets
```

## Key Commands
```bash
npm run dev              # Dev server on :3000
npm run fetch-current    # Pull live ESPN data → data/current/2026.json
npm run fetch-free-agents  # Pull free agent list
npm run fetch-weekly-scores  # Per-player weekly scoring data (~2 min)
npm run send-newsletter  # Generate + send email via Claude + Resend
npm run build            # Production build
```

## Data Conventions
- `getCurrentSeason()` returns the current-year JSON; switches to new year on **March 9** (hardcoded in `lib/data-processor.ts`)
- Season JSON shape: `{ year, teams, standings, matchups, weeklyStats, playoffTeams, loserBracket, champion?, backgroundPhotoUrl?, rosters? }`
- ESPN roster positions: **UTIL = outfielders + DH** (no separate OF/DH labels in roster data)
- `TEAM_JOIN_YEAR` in data-processor.ts tracks when teams entered the league (Banshees joined 2025, replaced Dinos)
- All-time stats respect join years; champion/playoff logic uses last 2 weeks of season
- `getTeamKeepersForYear()` uses a 3-tier priority chain: (1) `data/historical-keeper-overrides.json`, (2) `acquisitionType === 'KEEPER'`, (3) `keeperValue > 0` fallback
- Season cutover constants: `SEASON_CUTOVER_MONTH = 3`, `SEASON_CUTOVER_DAY = 9` in `lib/data-processor.ts`

## Teams (IDs matter)
10 active teams. Key IDs: Space Cowboys (1), Chinook (2), Pepperoni Rolls (3), Mega Rats (4), Emus (6), Sky Chiefs (7), Whistlepigs (8), Fuzzy Bottoms (9), Banshees (10), Folksy Ferrets (11).
- id=10 maps to **Dinwiddie Dinos** in historical data (2022–2024) and **Bristol Banshees** from 2025. See `data/teams.json` for full list.
- 2023 championship vacated from Dinos → awarded to Mega Rats (id=4). See `VACATED_CHAMPIONSHIPS` in `app/playoffs/page.tsx`.

## Component Patterns
- Pages are **server components** by default
- Interactive pieces use `'use client'` (forms, toggles, polls, trash talk)
- Server Actions live in `app/{route}/actions.ts`
- Images use Next.js `<Image unoptimized />` for ESPN CDN headshots
- Styling: Tailwind utility classes only, no custom CSS files
- Admin PIN system: `useAdminMode` hook → `localStorage` key `cba_admin_mode`; server actions validate `NEXT_PUBLIC_ADMIN_PIN`

## Deployment & Infrastructure

### Vercel
- Site: `https://continental-breakfast-alliance.vercel.app` / `https://continentalpressbox.com`
- Auto-deploys on every push to `main`
- Filesystem is **read-only** — all writes go through Upstash Redis (KV)

### Upstash Redis (KV)
- `lib/store.ts` is the unified data access layer — detects `KV_REST_API_URL` env var at runtime
- If set → reads/writes Redis; if not → reads/writes local JSON files (dev only)
- KV keys: `trash-talk`, `polls`, `rankings`, `team-content`, `dinos-content`, `admin-notes`, `win-probability-{year}`, `win-probability-history-{year}`
- **`data/polls.json` is NOT production state** — production data lives in KV; the JSON file is only used when `KV_REST_API_URL` is absent

### GitHub Actions (at repo root: `Continental-Breakfast-Alliance/.github/workflows/`)
| Workflow | Schedule | Purpose |
|---|---|---|
| `update-stats.yml` | Daily 5:30 AM EST | ESPN standings/rosters/free agents + weekly scores |
| `update-erosp.yml` | Daily 6:00 AM EST | EROSP projections + IL/injury map |
| `update-projections.yml` | Mondays 3:00 AM EST | FanGraphs projections regeneration |
| `update-rosters.yml` | Every 3 days | ESPN position eligibility refresh |
| `update-win-probability.yml` | Daily 10 PM EST + Mon 7 AM EST | Monte Carlo win probability |
| `update-injury-status.yml` | 4x daily (9am/1pm/5pm/9pm EST) | Patch IL + injury news into latest.json |
| `update-prospect-callups.yml` | 2x daily (11am/5pm EST) | Check MiLB prospect promotions |
| `update-player-descriptions.yml` | Mondays 7:00 AM EST | Claude Haiku player bio blurbs |
- Secrets: `ESPN_SWID`, `ESPN_S2`, `WIN_PROBABILITY_SECRET`, `ANTHROPIC_API_KEY`
- Node.js workflows need `defaults: run: working-directory: ./cba-site` and `cache-dependency-path: cba-site/package-lock.json`
- `[skip ci]` on commit messages prevents re-triggering on bot commits

## Key Gotchas

### ESPN API
- **`defaultPositionId`**: `1=SP, 2=C, 3=1B, 4=2B, 5=3B, 6=SS, 7=LF(OF), 8=CF(OF), 9=RF(OF), 10=DH, 11=RP` — use for player's primary position, NOT eligibleSlots
- **`eligibleSlots`** (lineup slot IDs): `0=C, 1=1B, 2=2B, 3=3B, 4=SS, 8/9/10=OF, 12=DH, 13/14=SP, 15=RP`; flex/bench excluded: `5=UTIL-OF, 6=MI, 7=CI, 11=IL, 16=bench, 17=bench, 19=UTIL-INF`
- **Slot 16 in every player's `eligibleSlots`**: ESPN includes bench slot 16 for ALL players — do NOT map it to `'RP'`
- **All pitchers labeled 'SP'** in ESPN roster data — no 'RP' slot; UTIL = OF + DH
- **`stats` array has multiple seasons**: always filter by `seasonId === 2026` or you'll get 2025 full-season totals (2025 entry comes first)
- **`winner: "UNDECIDED"`** for unplayed matchups (NOT `null` or `undefined`) — always check `=== 'HOME' || === 'AWAY'`. `Matchup.winner` is typed as `number | undefined` (winning teamId), never a string
- **`mMatchup` `totalPoints`** is batch-processed overnight, NOT real-time. Site scores lag ESPN's UI by hours mid-week
- **`statSplitTypeId=5`** for current matchup-week totals; `=0` for full-season cumulative; ESPN does NOT return per-period `=1` stats in `mRoster` view
- **`keeperValue`** = draft round cost for all rostered players, NOT a keeper designation flag
- ESPN returns `acquisitionType='DRAFT'` for ALL post-draft players including keepers

### Vercel / Deployment
- Env vars: no quotes around values, must be set for **Production**, require **redeploy** after adding
- `NEXT_PUBLIC_` vars are baked in at build time — hard refresh (Cmd+Shift+R) required after redeploy to avoid "Server Action not found" errors
- `KV_REST_API_URL` is in `.env.local` → all local dev goes to Upstash Redis too
- **GitHub Actions workflows must be at repo root** `Continental-Breakfast-Alliance/.github/workflows/` — GitHub silently ignores `cba-site/.github/workflows/` with zero errors or indication

### TypeScript / Data
- CSV `nan` values come through as the string `"nan"` in TypeScript (truthy!) — check `!== 'nan'` explicitly
- `data/teams.json` shape is `{ teams: [...] }` NOT a plain array
- `data/projections/2026.json` shape is `{ players: [...] }` NOT a plain array
- Server Actions must call `revalidatePath` for every route that displays that data
- `espn-api.ts` `getHeaders()` sanitizes SWID/S2 with regex `[^\x20-\x7E]` to strip invalid HTTP header chars
- `backtest_erosp.py` has its own **independent pipeline** — changes to `compute_erosp.py` orchestration (extra years fetch, Step 8b floor, etc.) must be duplicated in `backtest_erosp.py`; changes to `talent.py`, `playing_time.py`, `config.py` apply to both automatically
- IP parsing: `parseIP("6.2")` = 6.667 (baseball innings notation, not decimal); formula: `whole + frac/3`

### Scores & Live Data
- **Live score pattern**: `displayedScore = espnBase (overnight batch) + mlbDelta (today's box scores)`. During game hours both are non-zero; overnight ESPN catches up and delta returns to ~0.
- **`/api/live-scores`** uses `export const dynamic = 'force-dynamic'` to bypass Vercel CDN
- **`getTopMatchupOfWeek()` active-week logic**: `Math.max` over weeks with `totalPoints > 0` or `winner` set — NOT all weeks (returns week 21 all season)
- **Week advance logic**: find highest week with activity → if all matchups in it have `winner !== undefined` → advance to next week
- **Week 1 known lengths**: `{ 2022:9, 2023:11, 2024:5, 2025:4 }` days — used to normalize xW-L scores

### EROSP / FA
- **`is_fa` flag is unreliable** — marks ~1,492 players as FA (all non-rostered MLB). Use `data/current/free-agents.json` names as authoritative filter
- **`free-agents.json` in-season**: excludes 0-pt players (suspended/injured/no AB yet); preseason sorts by `percentOwned` instead
- `mlbTeamId` (for prospect callup checks) = MLB Stats API numeric team ID (HOU=117, LAD=119, NYY=147) — different from ESPN team IDs

### Email / Resend
- Resend SDK returns `{ data, error }` and never throws — must check `result.error` explicitly
- First email from new domain goes to Gmail junk — fix: members add sender to contacts / mark "Not spam"
- `newsletter@continentalpressbox.com` is the sending address (domain verified on Resend)

## Environment Variables (`.env.local`)
```
ESPN_LEAGUE_ID=1562795298
ESPN_SEASON_ID=2026
ESPN_SWID={3EDEE307-...}     # From ESPN browser cookies
ESPN_S2=AEB6FW...            # Long URL-encoded string from ESPN cookies
ANTHROPIC_API_KEY=...        # Newsletter + player descriptions
RESEND_API_KEY=...           # Email sending
NEWSLETTER_FROM_EMAIL=CBA League <newsletter@continentalpressbox.com>
NEWSLETTER_SITE_URL=https://continentalpressbox.com
KV_REST_API_URL=https://smiling-flamingo-54856.upstash.io
KV_REST_API_TOKEN=...        # No quotes around this value
NEXT_PUBLIC_ADMIN_PIN=...    # Alphanumeric only — $ and special chars get shell-expanded
WIN_PROBABILITY_SECRET=...   # Bearer token for /api/win-probability/refresh
```

## EROSP Pipeline Summary
Python pipeline at `scripts/erosp/` + `scripts/compute_erosp.py`. Daily cron writes `data/erosp/latest.json`.

| Module | Purpose |
|--------|---------|
| `config.py` | League constants: scoring weights, roster slots, park factors, blend weights |
| `ingest.py` | Data fetching: pybaseball stats, Statcast xwOBA, ESPN rosters, Chadwick ID mapping, active 40-man filter |
| `talent.py` | 3-year weighted blend (0.60/0.25/0.15), age curve, xwOBA adjustment, YTD in-season blend |
| `playing_time.py` | Hitter p_play, SP rotation tiers (32/15/8/3 starts by quality), RP appearance rate + closer detection |
| `projection.py` | Per-PA/per-start/per-appearance FP → daily EV → EROSP_raw |
| `startability.py` | Replacement levels (N×1.4 pool multiplier), sigmoid start probability, SP 7-start weekly cap |
| `compute_erosp.py` | Orchestrator; `SEASON_STARTED = True` on March 25 for in-season YTD mode |

Run locally: `cd scripts && python3 compute_erosp.py` (~6 min first run with warm cache)

## Key Data Files Reference
- `data/erosp/latest.json` — 1,750 players; `fantasy_team_id` reflects draft picks (245 rostered); `is_fa` unreliable
- `data/current/2026.json` — live season; has `rosters` key (26 players/team post-draft)
- `data/current/free-agents.json` — top FA with photoUrl; authoritative FA name filter
- `data/current/weekly-player-scores-2026.json` — per-player per-slot weekly scoring (run `npm run fetch-weekly-scores`)
- `data/keeper-overrides.json` — confirmed 2026 keepers per team
- `data/historical-keeper-overrides.json` — keepers by year+teamId for 2022–2026
- `data/prospect-protections.json` — per-team MiLB prospect protections + callup status
- `data/player-descriptions.json` — Claude Haiku blurbs keyed by mlbamId string
- `data/fantasy/schedule-2026.json` — week boundary map (Week 1 = periods 1–12, Week 16 = 14 days for All-Star Break)
- `data/draft-rounds.json` — avg pts per effective round (2023–2025, excluding 2022 inaugural)
