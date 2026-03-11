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
  teams.json              # Team metadata (11 teams, colors, city photos, bios)
  polls.json              # Active polls + vote counts (admin edits to add polls)
  trash-talk.json         # Bulletin board posts
  historical/2022-2025.json  # Completed seasons (static)
  current/2026.json          # Live season (updated via fetch-current script)
  current/free-agents.json   # Updated via fetch-free-agents script
scripts/          # Node/tsx scripts for ESPN data sync + newsletter
public/           # Static assets
```

## Key Commands
```bash
npm run dev              # Dev server on :3000
npm run fetch-current    # Pull live ESPN data → data/current/2026.json
npm run fetch-free-agents  # Pull free agent list
npm run send-newsletter  # Generate + send email via Claude + Resend
npm run build            # Production build
```

## Data Conventions
- `getCurrentSeason()` returns the current-year JSON; switches to new year on **March 9** (hardcoded in `lib/data-processor.ts` line 53)
- Season JSON shape: `{ year, teams, standings, matchups, weeklyStats, playoffTeams, loserBracket, champion?, backgroundPhotoUrl?, rosters? }`
- ESPN roster positions: **UTIL = outfielders + DH** (no separate OF/DH labels in roster data)
- Free agent data from ESPN API uses real position labels (OF, DH, SP, RP, etc.)
- `TEAM_JOIN_YEAR` in data-processor.ts tracks when teams entered the league (e.g., Banshees joined 2025, replaced Dinos)
- All-time stats respect join years; champion/playoff logic uses last 2 weeks of season

## Teams (IDs matter)
11 teams total. Key ones: Sugar Land Space Cowboys (id=1, champs 2022/2024), Bristol Banshees (id=10, champs 2025, joined 2025). See `data/teams.json` for full list.

## Component Patterns
- Pages are **server components** by default
- Interactive pieces use `'use client'` (forms, toggles, polls, trash talk)
- Server Actions live in `app/{route}/actions.ts`
- Images use Next.js `<Image unoptimized />` for ESPN CDN headshots
- Styling: Tailwind utility classes only, no custom CSS files


## Deployment & Infrastructure

### Vercel
- Site: `https://continental-breakfast-alliance.vercel.app`
- Auto-deploys on every push to `main`
- Filesystem is **read-only** — all writes go through Upstash Redis (KV)

### Upstash Redis (KV)
- `lib/store.ts` is the unified data access layer — detects `KV_REST_API_URL` env var at runtime
- If set → reads/writes Redis; if not → reads/writes local JSON files (dev only)
- Keys in Redis: `trash-talk`, `polls`, `rankings`
- One-time seed script: `npm run seed-kv` (reads local JSON files, writes to Redis)
- Diagnostic route: `/api/debug` — shows whether KV env vars are present in production
- **Common gotcha**: Vercel env vars must be set for **Production** environment and require a redeploy to take effect. Entering token values with surrounding quotes will cause auth failures.

### GitHub Actions (`.github/workflows/update-stats.yml`)
- Runs daily at **5:30 AM EST** (10:30 UTC)
- Fetches `data/current/2026.json` and `data/current/free-agents.json` from ESPN API
- Commits changed files and pushes → triggers Vercel redeploy automatically
- Required GitHub Secrets: `ESPN_SWID`, `ESPN_S2` (no quotes, raw values)
- `ESPN_LEAGUE_ID` (1562795298) and `ESPN_SEASON_ID` (2026) are hardcoded in the workflow
- Job has `permissions: contents: write` to allow the push back to main
- Can be triggered manually: Actions tab → Update Stats → Run workflow

### GitHub Actions (`.github/workflows/update-projections.yml`)
- Runs every **Monday at 3 AM EST** (8:00 UTC)
- Sets up Python 3.11, installs `pybaseball pandas numpy requests matplotlib`
- Runs `scripts/generate_projections.py` → commits `scripts/fantasy_projections_YYYY.csv` if changed → triggers Vercel redeploy
- No secrets needed — pybaseball scrapes public FanGraphs / Baseball Reference data
- Caches `~/.pybaseball/` to speed up subsequent runs; first run ~15-20 min
- Can be triggered manually: Actions tab → Update Projections → Run workflow
- **Replaces** the local `scripts/run_projections.sh` crontab approach (which was never set up)

## Recent Work (Feb 2026 — late)
- **Playoff bracket** (`app/playoffs/page.tsx`): uses last 2 weeks of season as playoff rounds; lowest seed goes LEFT bracket; background photos use `minHeight: 500px` to normalize height across years
- **BaseballFieldLeaders** (`components/BaseballFieldLeaders.tsx`): baseball field SVG with player pins, Ohtani special card, toggle for rostered vs FA view. ESPN has no 'RP' roster slot — all pitchers are 'SP'. Bullpen in rostered view uses `top('SP', 9).slice(4)` (ranks 5-9); FA view uses `top('RP', 5)`. **Mobile layout**: `flex-col md:flex-row` — field is full width, Ohtani/DH cards go horizontal above, side boxes use 2-col grid below.
- **USMapHero** (`components/USMapHero.tsx`): SVG US map using `react-simple-maps` v3 with `geoAlbersUsa` projection. Stars mark team cities; leader lines connect to circular logo images; logos link to team pages. Navy (`bg-blue-950`) background.
- **Message Board** (`app/message-board/`): renamed from Trash Talk. Includes polls (open + closed) above the post feed. Posts support `videoUrl` (YouTube embed or direct video). `/trash-talk` and `/polls` both redirect here permanently (see `next.config.ts`). "Polls" removed from Header nav.
- **Polls merged into Message Board**: `app/polls/` still exists but `/polls` redirects to `/message-board`. `app/polls/actions.ts` revalidates both `/polls` and `/message-board` on vote. `PollCard` imported cross-route as `../polls/PollCard`.
- **Posts on team pages**: `app/teams/[teamId]/page.tsx` filters `trash-talk.json` by `authorTeamId` or `targetTeamId` and renders a message board section at the bottom.
- **Landing page messages**: 72-hour window logic — shows posts from last 72h, falls back to single latest post. "See all" links point to `/message-board`.
- **Fantasy Projections** (`app/stats/players/page.tsx`): heading uses computed `projectionYear` (not `getCurrentSeason().year` which is behind March 15 cutoff). CSV `nan` string checked explicitly since it's truthy in TS.
- **Projection script automation**: fully automated via `.github/workflows/update-projections.yml` (every Monday 3 AM EST). `scripts/run_projections.sh` still exists as a local fallback but the crontab approach has been superseded by GitHub Actions.
- City/championship photos on playoffs page use `cityPhotoUrl` from teams.json + optional `backgroundPhotoUrl` on season data
- **Manhattan Mega Rats** (`id=4`) `cityPhotoUrl` set to `https://media.timeout.com/images/106110675/750/422/image.jpg` — used as playoff background whenever they are champion (e.g. 2023)
- **Post edit/delete** (`app/message-board/PostCard.tsx`): client component renders each post. Edit/Delete buttons visible on all posts (no auth — trusted group). Edit replaces message inline; delete shows 2-step confirm. Server actions `editPost`/`deletePost` in `actions.ts`.
- **Trade posts** (`postType: 'trade'` in `TrashTalkPost`): message board supports a "Trade" tab in the post form. Stores `tradeGiving` + `tradeReceiving` (newline-separated player/pick lists) + optional `message` comment. Trade cards render with a distinct blue header and two color-tinted columns (each team's `primaryColor`). `PostCard` accepts `targetColor` prop for partner team column tint.
- **Teams page H2H sorting**: opponents sorted by win percentage (desc) before rendering. No-game opponents sort last (winPct = -1).
- **Teams page keeper layout**: keepers use `grid` with `gridTemplateColumns: repeat(N, 1fr)` so all keepers share equal width. Names use `break-words` (not `truncate`) so long last names wrap to two lines.
- **Inline team content editor** (`app/teams/[teamId]/TeamContentEditor.tsx`): bio, strengths, and weaknesses on team pages are editable directly from the site. Two client components: `TeamBioEditor` (in the header) and `TeamStrengthsEditor` (main content area). Admin access gated by `NEXT_PUBLIC_ADMIN_PIN` env var — click the 🔒 button in the team header to unlock (stored in `localStorage` as `cba_admin_mode`). Edits persist to KV store under key `team-content` (local fallback: `data/team-content.json`). Server action: `app/teams/[teamId]/actions.ts` → `updateTeamContent()`. KV override takes priority over `teams.json` baseline. **Gotcha**: `NEXT_PUBLIC_` env vars are baked in at build time — PIN with `$` special chars gets shell-expanded by dotenv; use alphanumeric PINs only. PIN must be set in Vercel env vars (Production) and a redeploy triggered for it to take effect.
- **Mobile table scroll fix**: all `overflow-x-auto` scroll wrappers now also have `overflow-y-hidden` to prevent touch-drag artifacts on mobile (floating gaps between table edges and rows, draggable header). Affected files: `components/StandingsTable.tsx`, `components/PlayerStatsTable.tsx`, `app/teams/[teamId]/page.tsx` (H2H table), `app/stats/teams/page.tsx` (3 tables), `app/history/page.tsx`, `app/standings/all-time/page.tsx`.
- **Rankings page cleanup**: removed `AdminArticleForm` from `app/rankings/page.tsx`. Empty state now shows a styled card: "No new rankings for the season yet. First ranking expected after the keepers deadline." New articles are intended to come from the message board with a Rankings category. Ranking posts require the admin PIN and there&rsquo;s a tab on the message board visible only after unlocking.
- **Poll admin in UI**: polls can now be created, edited and deleted directly from `/polls` by unlocking with the same admin PIN used for team page editing. Each form also asks for the PIN as additional server‑side authorization. Regular voters still just use the buttons.
- **Automated projections via GitHub Actions**: `.github/workflows/update-projections.yml` replaces the local crontab approach. Runs every Monday 3 AM EST, regenerates `scripts/fantasy_projections_2026.csv` and auto-commits if changed. No ESPN secrets needed.
- **Calendar event system** (`lib/calendar.ts`): `CBA_EVENTS` array holds all 2026 season milestones (WBC, keeper deadline, draft, Opening Day, All-Star Break, Rivalry Week, playoffs, championship, season end). `getNextEventWithin(days)` returns the soonest upcoming event within N days; `getAllEventsWithin(days)` returns all of them sorted. `formatCountdown(date)` → `{ number, unit }`. `formatEventDate(date, timeLabel?)` → human-readable date string in ET.
- **Scrolling event ticker** (`components/EventTickerBanner.tsx`): `'use client'` component rendered in `app/layout.tsx` (site-wide, above Header). Shows all events within 7 days as a continuous horizontal marquee. Multiple events follow each other in sequence. CSS animation defined in `globals.css` as `@keyframes ticker-scroll`. Duration scales with item count for consistent ~80px/s reading speed. Hidden when no events are within window.
- **Landing page event banner** (`app/page.tsx`): full-width card below the 3-card League Pulse grid, visible within 7 days of next event. Solid color bg: amber-500 (deadline), violet-600 (CBA event), sky-600 (MLB event). White countdown pill on right. To test locally: temporarily change `getNextEventWithin(7)` to `(14)` in `page.tsx` AND `getAllEventsWithin(7)` to `(14)` in `layout.tsx` — revert before pushing.
- **TeamBaseballField** (`components/TeamBaseballField.tsx`): per-team baseball field diagram added to each team page (`app/teams/[teamId]/page.tsx`) as a "2026 Roster" section between "Top Players All-Time" and "Season History". Scoped to one team's current roster — no rostered/FA toggle. Uses same SVG field and pin components as `BaseballFieldLeaders` but `totalPoints > 0` filter removed so players appear pre-season (points badge hidden when 0). Rotation side box shows ranks 2–6 (5 pitchers); Bullpen box shows ranks 7–11. UTIL position logic identical to rostered view: top 3 UTIL → OF1/OF2/OF3, 4th → DH. Only renders if `currentSeason.rosters` has data for the team.
- **Season cutover date**: `getCurrentSeason()` in `lib/data-processor.ts` switches to the new year on **March 9** (confirmed in code — was previously documented as March 15, then March 20, both wrong). After draft, run "Update Stats" from Actions tab to pull fresh ESPN rosters immediately rather than waiting for the nightly 5:30 AM EST cron.
- **BaseballFieldLeaders layout** (`components/BaseballFieldLeaders.tsx`): dynamic `sideBySide` state controls whether the sidebar (Ohtani/DH/Bullpen/Rotation cards) sits alongside the field or drops below. Uses `ResizeObserver` on `wrapperRef` and `sidebarRef`. `checkLayout` computes theoretical field height = `(wrapperWidth - sidebarW - 12) * 0.68` and compares to `sidebar.scrollHeight` (natural content height). When `sideBySide=true`: outer div gets `relative pr-[177px] xl:pr-[197px]`, sidebar is `absolute top-0 right-0 bottom-0 w-[165px] xl:w-[185px]`. When false: sidebar is `mt-3 grid grid-cols-2 gap-2`. Only side-by-side at `lg+`. Bullpen shows 5 players (ranks 1-5), Rotation shows 4 players (ranks 2-5). OhtaniCard and DHCard use horizontal layout (photo left, name/points right). Photos use `object-cover` to prevent stretching. Layout re-checks on view toggle (rostered/FA) since Ohtani may appear/disappear.
- **TeamBaseballField sidebar** (`components/TeamBaseballField.tsx`): same horizontal OhtaniCard/DHCard layout as BaseballFieldLeaders. Player names use `break-words` (not `truncate`) to prevent names being cut off.

## Recent Work (March 8, 2026)

### Player Data Audit & Projection Age Fix

**Same-name player audit** (checked all 5 seasons 2022–2026):
- `getTeamTopPlayersAllTime` and all stat aggregation uses `playerId` (ESPN ID) as key — correctly distinguishes same-named players.
- Only real issue: "Luis Garcia" — two different players: id=`4684365` (SP, 2022) vs id=`40459` (2B Astros, 2023–2024 as "Luis Garcia Jr."). Code handles correctly via IDs; no data corruption.
- "Luis Robert" → "Luis Robert Jr." (same id=`39631`): name-only change, no issue.
- 2026 data is pre-season carry-over of 2025 stats — expected behavior until Opening Day.

**Projection age bug (the James Wood case)** — `scripts/generate_projections.py`:
- **Root cause**: Chadwick register assigns `key_fangraphs = -1` for newer/rookie players, so the FanGraphs ID → MLBAM ID merge fails. Without MLBAM IDs, `fetch_player_info()` can't get birth dates → `calc_age()` returns NaN → players get filled with dataset median age (29.4 or 30.8). This affected 155+ players including James Wood, Paul Skenes, Nick Kurtz, Roman Anthony, etc.
- **Fix**: Added `norm_name()` function and `chad_name_map` (name→MLBAM dict from Chadwick, unambiguous names only) as a fallback lookup for players missing MLBAM IDs after the FG-ID merge. Applied to both batter and pitcher sections. `norm_name` collapses "J. T." → "J.T." to handle initial spacing.
- **Data patched**: `scripts/fantasy_projections_2026.csv` and `data/projections/2026.json` corrected in-place. Key fixes: James Wood 29.4→23.5 (FP 361→399), Paul Skenes 30.8→23.8, Roman Anthony 29.4→21.9, Jackson Holliday 29.4→22.3, Agustin Ramirez 29.4→24.6, etc. ~157 players total.
- For players truly not in Chadwick (e.g. Yariel Rodriguez, Felix Bautista), used MLB Stats API people search (`/api/v1/people/search?names=`) as a one-time manual fix.

## Key Gotchas
- ESPN roster data: all pitchers use 'SP' slot (no 'RP'), UTIL = OF + DH
- MLB Stats API `fields` param: must list nested fields explicitly (e.g., `primaryPosition,abbreviation` not just `primaryPosition`)
- `getCurrentSeason()` returns 2025 until March 9 (cutover date in `lib/data-processor.ts`) — use separate year computation for projection headings
- CSV `nan` values come through as the string `"nan"` in TypeScript (truthy) — check `!== 'nan'` explicitly
- Server Actions must call `revalidatePath` for every route that displays that data
- Vercel env vars: no quotes around values, must be set for Production, require redeploy after adding
- `espn-api.ts` `getHeaders()` sanitizes SWID/S2 with regex `[^\x20-\x7E]` to strip invalid HTTP header chars

## Environment Variables (`.env.local`)
```
ESPN_LEAGUE_ID=1562795298
ESPN_SEASON_ID=2026
ESPN_SWID={3EDEE307-...}     # From ESPN browser cookies
ESPN_S2=AEB6FW...            # From ESPN browser cookies (long URL-encoded string)
ANTHROPIC_API_KEY=...        # Newsletter generation
RESEND_API_KEY=...           # Email sending
NEWSLETTER_FROM_EMAIL=...
NEWSLETTER_SITE_URL=http://localhost:3000
KV_REST_API_URL=https://smiling-flamingo-54856.upstash.io
KV_REST_API_TOKEN=...        # No quotes around this value
```

## Used GitHub Copilot AI (March 1, 2026)

### Changes Made
Implemented admin-editable polls integrated into the message board with PIN protection, poll voting, and edit/delete capability directly from the UI.


### New Files Created

#### `hooks/useAdminMode.tsx`
- Shared client-side admin authentication hook used across multiple features
- Prompts user for PIN when `unlock()` is called
- Stores `cba_admin_mode='1'` in localStorage when correct PIN entered
- Hook returns `{ isAdmin: boolean, unlock: () => void }`
- Used by: PollsViewer, MessageBoardForm, and team page editors

#### `app/polls/PollAdminForm.tsx`
- New client component for creating, editing, and deleting polls
- Requires PIN verification on all submit actions (server-side validation)
- Form fields: question (text), options (dynamic add/remove), active status (checkbox), expiration date (optional)
- Actions called: `createPoll()`, `updatePoll()`, `deletePoll()`
- Initial edit state passed via `initialPoll?` prop
- After submit, shows success message and resets form (for create) or calls `onComplete()` callback (for edit)
- Server-side PIN validation: `NEXT_PUBLIC_ADMIN_PIN` environment variable

#### `app/message-board/PollsViewer.tsx`
- New `'use client'` component that renders the polls section on the message board
- Accepts `activePolls` and `closedPolls` arrays as props
- Uses `useAdminMode` hook; shows "🔒 Admin login" button when not authenticated
- When admin is logged in, each active poll card gets an Edit button via `onEdit` prop on `PollCard`
- Inline `PollAdminForm` appears when admin clicks Edit on a poll; dismissed via `onSaved` callback
- Renders "Open Polls" grid then "Closed Polls" grid (results visible, voting disabled on closed)

#### `app/message-board/MessageBoardForm.tsx` (updated)
- Added `'polls'` to `PostMode` type: `'message' | 'trade' | 'rankings' | 'polls'`
- Added Polls tab (only visible when `isAdmin`) that renders inline `PollAdminForm` for creating new polls
- Now uses `useAdminMode` hook (replaced duplicate local admin state logic)
- Props updated: now receives `polls: Poll[]` in addition to `teams`
- Admin lock button moved here (was previously duplicated); single unlock button in post form area

#### `app/polls/actions.ts` (updated)
- Added `createPoll()`, `updatePoll()`, `deletePoll()` server actions
- All three validate `password` param against `NEXT_PUBLIC_ADMIN_PIN`; throw `'Unauthorized'` if mismatch
- `createPoll()` auto-sets `createdAt: new Date().toISOString()` and prepends to polls array
- `updatePoll()` preserves existing vote counts when editing option text
- All three `revalidatePath('/polls')` and `revalidatePath('/message-board')`
- `castVote()` unchanged — voting remains open to all users, no PIN required

#### `app/rankings/actions.ts` (updated)
- `postArticle()`, `editArticle()`, `deleteArticle()` now validate against `NEXT_PUBLIC_ADMIN_PIN`
- Previously used a different env var; now consistent with polls auth

#### `app/teams/[teamId]/TeamContentEditor.tsx` (updated)
- Refactored to use shared `useAdminMode` hook instead of local admin state

### How Polls Admin Works
1. Go to `/message-board` (or `/polls`)
2. Click "🔒 Admin login" → enter PIN → button disappears, admin mode active
3. Edit buttons appear on each active poll card → click to open inline `PollAdminForm`
4. New poll creation: unlock, switch to "Polls" tab in the post form, fill form + PIN field → Create
5. Poll fields: question, options (dynamic add/remove), active checkbox, optional expiry date, PIN

### PIN Security Notes
- PIN stored in `NEXT_PUBLIC_ADMIN_PIN` environment variable (shared with team page editor)
- **Must be alphanumeric** — special chars like `$` get shell-expanded by dotenv parser
- Client-side: `useAdminMode` hook stores `cba_admin_mode='1'` in localStorage after correct PIN
- Server-side: all poll and ranking mutations validate the PIN before writing
- Admin state persists in localStorage until browser storage is cleared

### Deployment Status
- Code pushed to `main` branch on GitHub; Vercel auto-deployed
- Build error fixed: missing `createdAt` field added to poll creation (commit `2855460`)
- Site live at: `https://continental-breakfast-alliance.vercel.app/message-board`

## Session Work (March 1, 2026 — Claude)

### CLAUDE.md Cleanup
- Fixed corrupted Copilot AI section (lines 167–198 were garbled from a bad write)
- Fixed stale March 15 cutover date → March 20 in two places (Data Conventions + Key Gotchas)

### Ghent Whistlepigs Map Fix (`components/USMapHero.tsx`, `data/teams.json`)
- Corrected team coordinates from Ghent, Columbia County NY `[-73.62, 42.35]` → Ghent neighborhood, Norfolk VA `[-76.29, 36.85]`
- Updated `cityPhotoUrl` seed from `ghent-new-york` → `ghent-norfolk-virginia`

### Two-Way Player Projection Fix (`app/stats/players/page.tsx`)
- The projections CSV generates two rows per two-way player (Ohtani: TWP batting + SP pitching; Max Muncy: 3B + nan-position row from team split)
- Added deduplication step after `loadProjectionsCsv()`: groups by player name, sums `ProjectedFP` and `FP_MostRecentYear`, recalculates delta%, keeps non-pitcher/non-nan position label
- Ohtani now shows once as TWP: combined 2025 actual ~875 (close to ESPN's 910) and 2026 projection ~1,348 (full pitching workload expected after TJ recovery)
- Fixed position-override bug: `nan`-position row no longer overwrites a valid `3B` label
- ~53 players have `nan` positions (multi-team splits); existing fallback to ESPN position data handles them
- ~151 rows project under 50 pts (retired/unsigned players); sort to bottom, don't clutter table

### Known Broken Map Logos (to fix later)
- Emus (id=6) and Banshees (id=10) use `mystique-api.fantasy.espn.com` URLs — private ESPN auth-required API, won't load publicly
- Fix: upload replacement logos to imgur and update `USMapHero.tsx`

## Session Work (March 1, 2026 — Claude, second session)

### Poll Edit Button Restyled (`app/polls/PollCard.tsx`, `app/message-board/PollsViewer.tsx`)
- Edit button changed from plain teal "edit" text → faint ✏️ icon with subtle gray border (`text-gray-300 hover:text-gray-600 border border-gray-200 hover:border-gray-400 rounded px-1.5 py-0.5`) — matches the 🔒 lock button pattern on team pages
- Button is now always visible on active polls (not just when admin is authenticated)
- In `PollsViewer`: `onEdit` prop is now always passed — routes to `unlock()` when not authenticated, to `setEditing()` when authenticated
- Clicking the ✏️ on an active poll prompts for the admin PIN if not logged in, or opens the edit form immediately if already logged in

### PF Rank Column (`components/StandingsTable.tsx`, `app/history/page.tsx`)
- **StandingsTable**: Added "PF Rank" column between PF and PA on all per-season standings tables (current standings, every-season history view, single-season history view)
  - Computed by sorting a copy of standings by `pointsFor` descending, building a `Map<teamId, rank>`
  - Shows rank number + a small ↑/↓ delta in green/red if PF rank differs from W-L rank (positive delta = better in PF than wins; negative = worse)
  - Column widths also widened: W/L/T `w-10 px-4` → `w-16 px-6`; PF/PA/DIFF/PF Rank `w-20` → `w-24`
- **History page all-time table**: same PF Rank column added to the inline franchise-level table
  - `pfSortedAllTime` and `pfRankMapAllTime` computed at module scope from `allTimeStandings`
  - Delta compares franchise W-L rank (by total wins) vs. all-time PF rank (by total points for)

### USMapHero Logo Position Adjustments (`components/USMapHero.tsx`)
- Stars (geographic pins) unchanged; only `dx`/`dy` logo offsets adjusted
- **Whistlepigs** (id=8, Norfolk VA): `dy -20 → 45` — logo now sits off the NC coast/Atlantic
- **Emus** (id=6): `dy 38 → -20` — logo moved above the Delmarva star, no longer overlaps Whistlepigs
- **Mega Rats** (id=4, NYC): `dy 10 → -25` — logo moved above the NYC star, no longer overlaps Emus
- **Folksy Ferrets** (id=11, Baltimore): `dx -20, dy -35` (was `-55, 16`) — logo now sits in PA, no longer overlaps Pepperoni Rolls (WV)

### USMapHero Additional Adjustments — Mar 2026 (`components/USMapHero.tsx`)
- **Banshees** (id=10): Star moved from eastern TN `[-82.19, 36.60]` → Bristol CT `[-72.95, 41.67]` (correct city); logo offset `dx:45, dy:-65` (northeast, north of Mega Rats to avoid overlap)
- **Pepperoni Rolls** (id=3, WV): Logo shifted south `dy: -22 → 20`; star moved to Morgantown `[-79.96, 39.63]` (was `[-81.63, 38.35]`)
- **Folksy Ferrets** (id=11): Logo shifted further west and slightly south: `dx: -40 → -65, dy: -35 → -10`; then shifted north to avoid Morgantown star: `dy: -10 → -45`
- **Sky Chiefs** (id=7, Syracuse): Logo shifted south and west: `dx: 10 → -30, dy: -52 → -30`
- **Emus** (id=6): Logo shifted south: `dy: -20 → 5`

## Session Work (March 2026 — EROSP System)

### EROSP — Expected Rest of Season Points

Built a full Python modeling pipeline + React UI for daily EROSP projections.

#### Architecture: GitHub Actions + JSON files (no new infrastructure)
- Daily cron at **11 AM UTC (6 AM EST)** via `.github/workflows/update-erosp.yml`
- Writes `data/erosp/latest.json` → committed to repo → Vercel redeploys
- Same pattern as `update-projections.yml`

#### Python Pipeline (`scripts/erosp/` + `scripts/compute_erosp.py`)

| Module | Purpose |
|--------|---------|
| `scripts/erosp/config.py` | League constants: scoring weights (H+1+TB, R+1, RBI+1, BB+1, K-1, SB+2, CS-1, GIDP-0.25; IP+3, HA-1, ER-2, BBA-1, KP+1, W+3, L-3, SV+5, BS-2, HD+3, QS+3), roster slot counts, park factors |
| `scripts/erosp/ingest.py` | Data fetching: `pybaseball` batting/pitching stats, Statcast xwOBA, sprint speed; MLB StatsAPI schedule; ESPN roster + FA JSON files; Chadwick register ID mapping |
| `scripts/erosp/talent.py` | Talent estimation: 3-year weighted blend (0.5/0.3/0.2), age curve (peak 28, ±0.6%/yr), xwOBA multiplicative adjustment, sprint speed SB boost |
| `scripts/erosp/playing_time.py` | Playing time: hitter p_play + PA/game (0.85/4.0 defaults), SP rotation slot + IP/start, RP appearance rate + role (closer/setup/middle) |
| `scripts/erosp/projection.py` | Per-PA/per-start/per-appearance FP formulas → daily EV → EROSP_raw over remaining schedule |
| `scripts/erosp/startability.py` | Replacement levels by position (10-team pool), sigmoid start probability (tau=0.3), SP 7-start weekly cap factor, EROSP_startable |
| `scripts/compute_erosp.py` | Orchestrates all steps; outputs `data/erosp/latest.json` |

#### Key modeling details
- **Scoring**: singles=2pts (H+TB), doubles=3, triples=4, HRs=5; pitchers: 3pts/IP is the anchor stat
- **Replacement level**: computed from full MLB player pool at each position (not just rostered); uses N-th best daily EV where N = slots × 10 teams
- **SP 7-start cap**: `cap_factor = min(1.0, 7 / team_starts_per_week)` per SP; teams with ≤7 starts/week have cap_factor=1.0
- **Pre-season**: current-season weight = 0; all 3-yr history; p_play defaults applied; full 162-game projection
- **Cache**: `scripts/erosp_cache/` stores all pybaseball CSV fetches and schedule JSON

#### To run locally
```bash
cd /Users/ianschurr/Continental-Breakfast-Alliance/cba-site/scripts
pip3 install pybaseball pandas numpy requests python-mlb-statsapi
python3 compute_erosp.py
```
First run ~15-20 min (pybaseball fetches FanGraphs data). Subsequent runs faster (cache hits).

#### Frontend
- **`components/EROSPTable.tsx`**: `'use client'` sortable table; columns: Player, Pos, Team, /Game, Raw, Startable; Raw/Startable toggle; position sidebar filter; FA/Rostered/All toggle
- **Team page** (`app/teams/[teamId]/page.tsx`): loads `data/erosp/latest.json`, filters by `fantasy_team_id === team.id`, renders `<EROSPTable showTeamColumn={false} />` between "Roster" and "Season History"
- **Stats page** (`app/stats/players/page.tsx`): loads `data/erosp/latest.json`, renders full `<EROSPTable />` section after the existing projections table
- Both pages gracefully show nothing if `latest.json` doesn't exist yet

#### Bugs fixed (post-launch)
- **Duplicate key warning** (`mlbam_id` 660271 = Ohtani): appears in both hitter + pitcher talent DFs. Fixed in two places: (1) `compute_erosp.py` Step 13 now tracks `seen_mlbam` set to skip duplicate rows in JSON output; (2) both `app/stats/players/page.tsx` and `app/teams/[teamId]/page.tsx` deduplicate by `mlbam_id` when loading `latest.json` (first/highest value wins).
- **Sigmoid tau too large** (`tau=1.0` → `tau=0.3`): with tau=1.0, elite players like Judge had start_probability ~86% when it should be ~100%. tau=0.3 gives ~99.8% for players 1.8+ daily-EV above replacement, ~50% at replacement, ~1% clearly below — correct behavior. Re-run `compute_erosp.py` after this change to refresh `latest.json`.
- **Pitchers missing from table**: pitcher `position` field was `'P'` (generic MLB API value) instead of `'SP'`/`'RP'`, so sidebar filter buttons matched nothing. Fixed in `compute_erosp.py` Step 12 (map `'P'` → role before writing JSON) and in `EROSPTable.tsx` filter + display (fall back to `role` when `position === 'P'`, covers old JSON).

#### True RP Classification for Baseball Field (added Mar 2026)
- `components/TeamBaseballField.tsx` + `components/BaseballFieldLeaders.tsx`: both accept optional `rpNames?: Set<string>` prop
- When provided, ESPN `'SP'`-labeled pitchers are split by EROSP `role`: names in the set → Bullpen; everyone else → Rotation
- When omitted (EROSP not yet generated), falls back to old rank-based split
- Parent pages build the set: `new Set(erospPlayers.filter(p => p.role === 'RP').map(p => p.name))`
  - Team page: filters to `teamErospPlayers` first; stats page uses all `erospPlayers`
  - Passes `undefined` (not empty Set) when EROSP data is absent so fallback triggers correctly
- EROSP `role` is computed in `scripts/erosp/ingest.py` from FanGraphs stats: `GS/G >= 0.5 → SP`, else `RP`
- FA view of `BaseballFieldLeaders` is unaffected — ESPN FA data already has real `'SP'`/`'RP'` labels

#### Ignored in v1 (deferred)
- GWRBI, CYC, OFAST (outfield assist), DPT (double play turned), PKO (pickoff), E (errors), NH, PG, CG, SO bonus
- Monte Carlo P10/P50/P90 uncertainty ranges
- Phase 2 ML model (LightGBM on historical seasons)

## Session Work (March 2026 — Poll Improvements)

### Poll vote deduplication + auto-close
- **`app/polls/PollCard.tsx`**: `voted` and `selected` state now lazily initialized from `localStorage` key `voted-{pollId}`. Returning visitors see results immediately (no flash). `handleVote` saves to localStorage before calling `castVote` and guards with `|| voted`.
- **`app/polls/actions.ts`** `castVote`: after incrementing option votes, sums all options — if total ≥ 12, sets `poll.active = false`. Poll auto-closes at 12 votes regardless of expiry date.
- To reset a single browser's vote: browser console → `localStorage.removeItem('voted-poll-xxx')`. To list all voted polls: `Object.keys(localStorage).filter(k => k.startsWith('voted-'))`.
- Vote counts live in Redis; only adjustable via admin edit form (or delete + recreate poll).

## Session Work (March 2026 — Mobile Layout Improvements)

### Responsive Tables
Applied consistent mobile-first treatment across all data tables:
- `text-xs md:text-sm` on all `<table>` elements
- Padding reduced: `px-2 py-2 md:px-4 md:py-3` on all `<th>`/`<td>` cells
- Low-priority columns hidden on mobile with `hidden md:table-cell`

**`components/StandingsTable.tsx`**: Hidden on mobile: T, PCT, PA, DIFF — mobile shows Rank/Team/W/L/PF/PF Rank (6 cols)

**`app/history/page.tsx`** all-time table: Hidden on mobile: T, PCT, Saccko, Avg Finish

**`app/stats/teams/page.tsx`**:
- Blowouts table: Week column hidden on mobile
- Scoring Leaders table: Total PA and Diff hidden on mobile

### EROSPTable Bug Fix + Mobile Layout (`components/EROSPTable.tsx`)
- **Critical bug**: `overflow-x-hidden` was silently clipping the table on mobile → changed to `overflow-x-auto`
- Outer layout changed from vertical stack to `flex flex-col md:flex-row` (sidebar above table on mobile)
- Position sidebar changed from vertical `flex-col` to `flex flex-row flex-wrap md:flex-col` — horizontal pill row on mobile
- Hidden on mobile: Team, Status, /Game, Raw columns (`hidden md:table-cell`)
- Footer text shortened on mobile via `md:hidden` span

### Baseball Field Pin Improvements (`components/TeamBaseballField.tsx`, `components/BaseballFieldLeaders.tsx`)
- Player photo reduced: `w-11 h-11` → `w-8 h-8 md:w-11 md:h-11` (32px mobile, 44px desktop)
- Name+score badge hidden on mobile (`hidden md:block`) in both `FieldPin` and `BullpenPin`
  - Root cause: `whitespace-nowrap` badges (e.g. "Guerrero Jr." ≈ 80px wide) overlapped adjacent infield pins (~40px apart on a 375px phone)
  - Position labels (tiny 2–3 char) and side boxes below the field still show on mobile

### Landing Page Multiple Event Banners (`app/page.tsx`)
- **Bug**: `getNextEventWithin(7)` only returns the nearest single event — WBC (Mar 5) was returned, Keeper Deadline (Mar 7) was silently dropped
- **Fix**: switched import to `getAllEventsWithin`, variable to `const upcomingEvents = getAllEventsWithin(7)`, render changed from single conditional to `.map()` over the array
- To test locally: change both `getAllEventsWithin(7)` calls (in `page.tsx` and `layout.tsx`) to `(14)`, revert before pushing

## Session Work (March 2026 — WVPR Brand Kit Integration)

### West Virginia Pepperoni Rolls brand content (`data/teams.json`, `app/teams/[teamId]/page.tsx`)
- **Brand colors fixed**: `primaryColor` updated to Mountaineer Blue `#1C384F`, `secondaryColor` to Raw Dough `#FBF2CE` (was `#FFE66D`/`#FFFDE0`)
- **`#LETSGETBAKED` badge**: Red (`#C91920` Pepperoni Red) pill badge added to team header, gated on `id === 3`
- **Game Day Traditions section**: 8 tradition cards in a 4-column grid (`lg:grid-cols-4`), each with a Mountaineer Blue header strip and Raw Dough cream body. Cards use `flex flex-col` + `flex-1` on the body so all cards in a row fill to the same height. Inserted after `TeamStrengthsEditor`, before Top Players.
- **Farm System section**: 3 affiliate cards (Huntington Hammers AAA `#5B7C99`, C&O Canal Cats AA `#228B22`, Frost Whitetails A `#4A4A4A`) with level badge, location, and color swatches. Inserted after EROSP Projections, before Season History.
- **WVPR constants at module level**: `WVPR_TRADITIONS` and `WVPR_AFFILIATES` arrays declared above `interface Props` in `page.tsx`

### Baseball field enhancements (`components/TeamBaseballField.tsx`)
- **New props**: `fieldDimensions?: { lf, lcf, cf, rcf, rf }` and `stadiumName?: string`. WVPR team page passes these; all other teams pass `undefined`.
- **Field dimensions**: Text markers placed in the dark foul territory ABOVE the outfield fence arc. Fence y-values at each x: LF/RF corners ~85, LCF/RCF ~47, CF center ~21.5. Marker positions: LF x=50 y=68, LCF x=158 y=30, CF x=350 y=13, RCF x=542 y=30, RF x=650 y=68.
- **Stadium name caption**: Rendered as a small `<p>` below the field container (outside the SVG/absolute-container), visible on WVPR team page only.
- **Warning track fixed**: Replaced with a stroke on the fence arc (`M 0 108 Q 350 -65 700 108`, `strokeWidth="38"`) clipped by `<clipPath id="fairTerritoryClip">` (the fair-territory polygon). The clip removes the outward half of the stroke, leaving a uniform ~19px dirt track that follows the full arc. Avoids the corner-tapering problem of the crescent approach and the overflow/angle artifacts of an unclipped stroke.
- **Photo fixes**: Added `object-cover` to `FieldPin` and `BullpenPin` `<Image>` elements to prevent head squishing. Added explicit `w-7 h-7 lg:w-8 lg:h-8` Tailwind classes to `BullpenPin` image (was relying on intrinsic width/height only).
- **Responsive pin sizing**: Photo size breakpoints moved from `md:` to `lg:` (`w-8 h-8 lg:w-11 lg:h-11` for FieldPin, `w-7 h-7 lg:w-8 lg:h-8` for BullpenPin). Name badges also moved to `hidden lg:block`. Rationale: at `md` (768px) the field is only ~400px wide with side panels; at `lg` (1024px) it's ~640px — enough room for larger photos and name labels without overlap.
- **OF2 (CF) position**: Moved from `top: 14%` to `top: 19%` (SVG y ~67 → ~90) so center fielder clears the warning track inner edge (~42).
- **Field height**: `paddingTop` increased from `68%` to `75%` — field is physically taller, catcher label more visible, better alignment with the Rotation/Bullpen side boxes.

## Session Work (March 2026 — WVPR Kendrick Field Photo Background)

### `components/TeamBaseballField.tsx` — Photo background mode
- **New prop**: `backgroundImageUrl?: string`. When set, replaces the SVG field drawing with a real stadium photo.
- **`public/wvu-kendrick-field.jpg`**: 2000×1125 official WVU Athletics photo of Kendrick Family Ballpark (Monongalia County Ballpark), downloaded from WVU CDN. Broadcast angle from behind home plate.
- **Photo mode behavior**:
  - Container `paddingTop` switches from `75%` → `56.25%` (16:9 to match image aspect ratio)
  - Next.js `<Image fill>` with `object-cover object-top` fills the container
  - SVG field drawing is skipped entirely
  - Separate `FIELD_SLOTS_PHOTO` position set calibrated for broadcast-angle perspective. Current tuned values: `C: 52%/53%, SP: 43%/30%, 3B: 20%/28%, SS: 30%/24%, 2B: 51%/23%, 1B: 66%/29%, OF1: 10%/15%, OF2: 37%/16%, OF3: 60%/17%` (left%/top%). To nudge a pin: ↑ left% = right, ↓ left% = left, ↑ top% = down toward plate, ↓ top% = up toward fence.
  - `hideLabel={isPhotoMode}` on `FieldPin` — position abbreviation badges hidden in photo mode (redundant when positions are visually obvious)
  - Bullpen pins (BP1/BP2) removed from the photo — no on-field bullpen marker. Side Bullpen box switches to show ranks 1–3 (instead of 3–5 which assumed 1–2 were on-field)
- **Name badge**: Changed from single `rounded-full` pill (name + pts inline) to `flex-col rounded-lg` — name on top line, points on second line, both center-aligned. Applies to both SVG and photo modes.
- **WVU state + Flying WV logo** (SVG mode only, not photo mode): `<g transform="translate(350, 125)">` in the SVG draws the WV state silhouette (Mountaineer Blue `#1C384F`, opacity 0.52) with the Flying WV letterform (white strokes, opacity 0.82) on top. Positioned in center field grass. Triggered by `stadiumName` prop being set (WVPR only). Not rendered in photo mode since the real logo is already painted on the field in the photo.
- **Team page wiring** (`app/teams/[teamId]/page.tsx`): WVPR (`id === 3`) passes `backgroundImageUrl="/wvu-kendrick-field.jpg"`.

## Session Work (March 4, 2026 — Poll Expiration + Winner Display)

### Poll auto-expiration (`lib/store.ts`, `app/polls/actions.ts`)
- **Root bug**: `expiresAt` was display-only — never checked to actually close polls. Votes also silently failed in production because `setPolls` throws when `IS_VERCEL && !KV_REST_API_URL`.
- **`getAndProcessPolls()`** added to `lib/store.ts`: reads polls, checks each active poll's `expiresAt` (treated as end of that day: `expiresAt + 'T23:59:59'`), sets `active: false` if expired, persists if any changed, returns data. Use this instead of `getPolls()` everywhere so expiry is always enforced on read.
- **`castVote`** in `app/polls/actions.ts`: added expiry guard before incrementing votes — if poll's `expiresAt` has passed, closes it in storage, revalidates, returns early without counting the vote.
- **`data/polls.json`**: both polls (`poll-2`, `poll-3`) manually set to `active: false` since they expired March 2. Note: this only affects local dev; production reads from Upstash Redis (KV).

### KV / Upstash discovery
- **`lib/store.ts` always uses KV when `KV_REST_API_URL` is set** — `data/polls.json` is never read/written in that case. `KV_REST_API_URL` is in `.env.local`, so all local dev and production traffic goes to Upstash Redis (`smiling-flamingo-54856.upstash.io`).
- Vote counts seen on the site are real — stored in Redis. `data/polls.json` only matters if KV env var is absent.
- Vercel env vars (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) must be set for **Production** environment. Were previously set for "all environments"; changed to Production-only (`.env.local` covers local dev).

### Landing page "Recently Decided" section (`app/page.tsx`)
- `getPollWinner(poll)` helper at module level: returns `{ text, pct }` for the option with most votes, or `null` if 0 votes.
- `recentlyClosedPolls`: filters polls where `!active && expiresAt` and `Date.now() - new Date(expiresAt + 'T23:59:59') < 24h`.
- New "📊 Recently Decided" section renders between "Active Polls" and "Latest Messages". Each card shows the question, then either a teal winner box (option text + vote%) or "No votes were cast." italic text.
- Section only appears within 24 hours of the poll's `expiresAt` date; disappears automatically after.

### Announcement ticker poll results (`app/layout.tsx`)
- Layout made `async`; calls `getAndProcessPolls()` to get live poll state.
- `recentlyClosedPolls` filtered same way as landing page (24h window, `expiresAt`-based).
- Poll ticker items appended after calendar event items: `emoji: '🗳️'`, `title: poll.question`, `dateLabel: winner.text` (or "No votes cast"), `countdown: '${pct}%'` (shown in yellow bold) or `'—'`.
- Polls closed by vote threshold (12 votes, no `expiresAt`) do NOT appear in ticker — only expiry-closed polls.

## Session Work (March 4, 2026 — Emus Page + Ohtani Box)

### Delmarva Emus Fun Franchise Facts (`app/teams/[teamId]/page.tsx`)
- Added `EMUS_FUN_FACTS` string constant at module level (above `WVPR_TRADITIONS`)
- New `{id === 6}` conditional section inserted after `TeamStrengthsEditor`, before WVPR Game Day Traditions
- Single card with purple header (`#6C5CE7`) / light purple body (`#F0EEFF`) matching Emus team colors
- Header label: "Delmarva Emus (née Shureburds)"; subtitle: "The Delmarva Peninsula's Almost Winningest Baseball Team, Established 2022"
- Text: name change from Shureburds → Emus due to emu sighting on the Delmarva Peninsula; six-game win streak followed; 3rd place again

### Shohei Ohtani Box — conditional render (`components/TeamBaseballField.tsx`, `components/BaseballFieldLeaders.tsx`)
- `<OhtaniCard>` was always rendered (showing an empty `—` placeholder on teams without him)
- Changed to `{ohtani && <OhtaniCard player={ohtani} />}` in both components
- Box now only appears on the team that actually rostered Shohei Ohtani

## Session Work (March 4, 2026 — Team Page Video Embeds)

### Video posts on team pages (`app/teams/[teamId]/page.tsx`)
- Message board posts with a `videoUrl` now **embed the video directly** on the team page instead of showing a "📹 Video — view on Message Board" link
- YouTube URLs are detected with the same regex used in `PostCard.tsx`; matched → `<iframe>` embed; unmatched → `<video controls>`
- Video embed capped at `maxWidth: 480, aspectRatio: 16/9` (compact, watchable, not full-width)
- **Hydration fix**: replaced `Date.now()` relative-time calculation (`timeStr`) with `toLocaleDateString('en-US', { month: 'short', day: 'numeric' })` — static date avoids server/client mismatch
- **Layout**: post card container changed from `space-y-4` to `flex flex-wrap gap-4`; each card gets `maxWidth: 520, flex: '1 1 300px'` — two cards fit side-by-side on desktop, stack on mobile

### Workflow
- To show a video on a team page: post a message on the message board with a YouTube URL in the video field, targeting or authored by that team — the post and embedded video appear automatically at the bottom of the team page

## Session Work (March 5, 2026 — Suggested Keepers + Field Side Box Polish)

### Suggested 2026 Keepers (`lib/data-processor.ts`, `app/teams/[teamId]/page.tsx`, `data/projections/2026.json`)
- **`data/projections/2026.json`**: 823-player JSON converted from `scripts/fantasy_projections_2026.csv`. Fields: `playerName`, `mlbamId`, `position`, `team`, `age`, `projectedFP`, `percentile`.
- **`getSuggestedKeepers(teamId, limit=6)`**: looks up each 2025 roster player in the projections by name (case-insensitive, alphanumeric-normalized). Returns top N by `projectedFP2026`, with `keeperValue`, `age`, and `totalPoints2025` attached. 97.6% match rate on 2025 rosters.
- **Team page layout**: "Top Players All-Time" (6 players) and "Suggested 2026 Keepers" (6 players) shown side-by-side in a `md:grid-cols-2` grid. Keeper cards show position, age, amber `Rd N` badge for keeper round cost, and projected FP in indigo labeled "proj".
- **Date-based switching**: `keeperDeadline = new Date('2026-03-09')`. Before Mar 9 → show suggested keepers from projections. After Mar 9 → show actual `getTeamKeepersForYear(id, 2026)` from 2026 roster data (populated after draft).
- **Alignment fix**: invisible subtitle spacer on the "Top Players All-Time" header matches the height of the keepers subtitle, keeping first cards on the same horizontal plane.

### Baseball Field Side Box Polish (`components/TeamBaseballField.tsx`)
- **Bullpen rectangle removed** from SVG field drawing (`<rect>` + `<text>` BULLPEN label deleted)
- **BP1/BP2 pins removed** from `FIELD_SLOTS_SVG` — no more on-field bullpen pins for any team
- **Bullpen side box unified**: always shows ranks 1–3 (`startRank={1}`) on all teams — same as photo-mode teams (Banshees, WV). Previously SVG teams showed ranks 3–5 because 1–2 were on-field.
- **SideRow redesign**: photo 32px, full name visible at `xl:` / last name only below `xl:`, points on own line below name, responsive padding/gaps
- **DHCard redesign**: photo scales `md:40px → lg:48px → xl:56px`, full name at `lg:` / last name below, "pts" label added
- **Side panel responsive width**: `md:w-[140px] lg:w-[165px] xl:w-[190px]` (was fixed 160px then 190px)
- All SideRow photos now have `object-cover` to prevent stretching

## Session Work (March 5, 2026 — Code Cleanup)

### Dead code removed
- **`app/rankings/AdminArticleForm.tsx`**: deleted — was already removed from `app/rankings/page.tsx` (noted in previous session), file had zero imports anywhere
- **`app/trash-talk/` directory** (page.tsx, actions.ts, TrashTalkForm.tsx): deleted — `/trash-talk` permanently redirects to `/message-board` via `next.config.ts`; the route files were never reachable

### Duplicate code consolidated
- **`timeAgo()` in `app/message-board/page.tsx`**: removed local definition; now imports `{ timeAgo }` from `@/lib/news-fetcher` where the canonical export already existed
- **`revalidatePath` repetition in `app/polls/actions.ts`**: extracted a local `revalidateRoutes()` helper that calls `revalidatePath('/polls')` + `revalidatePath('/message-board')`; replaces 5 identical copy-pasted pairs across `castVote`, `createPoll`, `updatePoll`, `deletePoll`

---

## Session Work (March 4, 2026 — Per-Stadium Photo Field Positions)

### Per-stadium photo slot maps (`components/TeamBaseballField.tsx`)
- Replaced single `FIELD_SLOTS_PHOTO` with `FIELD_SLOTS_BY_PHOTO` — a map keyed by `backgroundImageUrl` (`/public/` path), each entry holding independent `slots` + `objectPosition`
- WVU (`/wvu-kendrick-field.jpg`) and Bristol (`/bristol-field.jpg`) now have completely separate pin coordinates; tuning one never affects the other
- `objectPosition` per entry controls CSS `object-${position}` on the `<Image>` — WVU uses `'top'`, Bristol uses `'center'`
- To add a new stadium: add one entry to `FIELD_SLOTS_BY_PHOTO` with the image path as the key; no other code changes needed
- Stadium name caption (`<p>`) moved inside the center field column div so `text-center` aligns it to the field image, not the full component width (including side boxes)

### Bristol Banshees stadium name (`app/teams/[teamId]/page.tsx`)
- Added `id === 10` branch to `stadiumName` prop: renders "Muzzy Field, Home of the Bristol Banshees" below the field photo

### `TeamBaseballField` layout restructure
- **DH moved to right column**: DHCard removed from left column, now sits at the top of the right (Bullpen/Rotation) column
- **Left column**: now only renders when Ohtani is on the roster (`{ohtani && <OhtaniCard>}`); no Ohtani = no left column = field naturally fills more horizontal space
- **Photo mode player counts**: Bullpen shows 3 rows (ranks 1–3), Rotation shows 4 rows (ranks 2–5) — trimmed to fit within the field image height
- **DHCard**: made more compact — photo 40→32px, padding reduced (`py-2 gap-1` → `py-1.5 gap-0.5`)
- **Stadium name caption**: moved outside the inner flex row so it spans the full width below both the field image and the right-side boxes
- **Right column width**: narrowed from `185px` → `160px`; mobile layout uses `grid-cols-3` (DH + Bullpen + Rotation in a row)

## Session Work (March 8, 2026 — Sky Chiefs Uniforms)

### Sky Chiefs uniform reveal section (`app/teams/[teamId]/page.tsx`, `public/sky-chiefs-uniforms.png`)
- Added a "2026 Uniforms" section to the Sky Chiefs team page (`id === 7`), placed after `TeamStrengthsEditor`
- Image (`Sky Chiefs Uniforms.PNG`) copied from Desktop → `public/sky-chiefs-uniforms.png`
- Layout: fixed-width `w-72` image card + fixed-width `w-72` text card side-by-side using `items-stretch` so the text box matches the image height exactly
- `w-fit` on the outer container keeps the block from stretching full-page width

## Session Work (March 8, 2026 — 2026 Rule Changes)

### 6 keepers per team (was 5)
- **`lib/data-processor.ts`**: `getTeamKeepersForYear()` slice changed from `.slice(0, 5)` → `.slice(0, 6)`
- **`app/teams/[teamId]/page.tsx`**: `getSuggestedKeepers(id, 6)` — suggested keepers show 6 players (not bumped to 7)
- **`keeperDeadline = new Date('2026-03-24')`** — shows suggested keepers until day after draft (Mar 23); after that, `getTeamKeepersForYear(id, 2026)` returns actual keepers from ESPN roster data

### ESPN keeperValue caveat
- `keeperValue` in ESPN API = draft round cost for all rostered players, NOT a keeper designation flag
- Pre-draft: can't distinguish the 6 true keepers from a 20-player roster via API alone
- Post-draft: actual keepers identifiable via `acquisitionType === 'KEEPER'` in roster entries
- After Mar 23 draft: run `npx tsx scripts/fetch-rosters-2026.ts` then `getTeamKeepersForYear` will return real keepers

### `scripts/fetch-rosters-2026.ts` (new script)
- Fetches 2026 ESPN rosters with `mRoster` view and merges `rosters` array into `data/current/2026.json`
- Run post-draft to populate actual keeper data: `npx tsx scripts/fetch-rosters-2026.ts`
- Historical data (2022-2025) also refreshed via `npx tsx scripts/fetch-historical.ts`

### SP 7-start weekly cap (was 6)
- **`scripts/erosp/config.py`**: `SP_WEEKLY_CAP = 7`
- **`scripts/erosp/startability.py`**: docstrings updated ("SP 7-start weekly cap")
- **`components/EROSPTable.tsx`**: footer text "7-SP-start weekly cap applied"
- **`app/stats/players/page.tsx`**: description "7-SP-start weekly cap"
- **`CLAUDE.md`** EROSP section: formula updated to `min(1.0, 7 / team_starts_per_week)`

## Session Work (March 8, 2026 — Confirmed Keeper Overrides)

### `data/keeper-overrides.json` (new file)
- JSON file keyed by team ID containing manually confirmed 2026 keeper lists for all 10 teams
- When an entry exists for a team, `getSuggestedKeepers` returns exactly those players in that order instead of using the algorithmic ranking
- All 10 teams set: Space Cowboys (1), Chinook (2), Pepperoni Rolls (3), Mega Rats (4), Emus (6), Sky Chiefs (7), Whistlepigs (8), Fuzzy Bottoms (9), Banshees (10), Folksy Ferrets (11)

### `lib/data-processor.ts` — `getSuggestedKeepers` updates
- Added `rosterYear` parameter (default 2025) — looks at that year's roster for suggestions
- Overrides only apply when `rosterYear === 2025` (suggesting 2026 keepers); ignored for future years
- When override exists: builds result from the named players, pulling `playerId`/`photoUrl`/`keeperValue` from roster and `projectedFP`/`age`/`percentile` from projections; graceful fallbacks for any missing data

### `app/teams/[teamId]/page.tsx` — keeper display logic
- Imports `keeperOverrides` to drive label switching: teams with confirmed keepers show **"2026 Keepers"** / "Confirmed keepers" subtitle; others show "Suggested 2026 Keepers" / "Ranked by projected 2026 fantasy points"
- Added `seasonEnd2026 = new Date('2026-10-01')` — after Oct 1, 2026 the page automatically switches to **"Suggested 2027 Keepers"** based on 2026 season stats, overrides are ignored
- Fixed React key collision: `key={p.playerId || p.playerName}` — falls back to name for override players with no ESPN ID match
- Timeline: pre-Mar 24 → confirmed/suggested 2026 keepers; Mar 24–Oct 1 → actual ESPN draft keepers; Oct 1+ → suggested 2027 keepers

### Known data issue
- ~~James Wood bad projection~~ — **resolved** (2026-03-08). Age bug fixed (29.4→23.5) and ESPN actual points now used as fp_y1 source (529 pts). Current projection: 395.9 FP, 83rd percentile.

## Session Work (March 8, 2026 — ESPN Actual Points in Projections)

### ESPN historical points override (`scripts/generate_projections.py`, `data/projections/2026.json`)

**Root cause discovered**: projection script was recalculating `fp_y1`/`fp_y2`/`fp_y3` from FanGraphs batting stats using its own scoring formula, which was missing HBP (+1 pt each in ESPN) and had other minor stat-counting differences vs. ESPN's actual totals. For James Wood, this caused a ~60-point undercount (469.5 recalculated vs. 529.0 ESPN actual).

**Fix — Step 8b added** to `generate_projections.py`:
- Loads `data/historical/{Y1,Y2,Y3}.json` and builds `{normalized_name: totalPoints}` dicts
- After FanGraphs stats are merged, overrides `fp_y1`/`fp_y2`/`fp_y3` with ESPN actual points for any name match
- Uses existing `norm_name()` for consistent name normalization
- Players not in historical JSON (free agents, etc.) fall back to FanGraphs recalculation as before
- Override counts: 2025→168 players, 2024→158 players, 2023→133 players

**`data/projections/2026.json`** regenerated from updated CSV. James Wood: fp_y1 469.5→529.0, WeightedBase 373→419, ProjectedFP 399→396 (slight net decrease due to Steamer projecting fewer PA: 513→472).

**Going forward**: the Monday GitHub Actions cron automatically picks up ESPN data on every weekly regeneration — no manual steps needed.

## Session Work (March 8, 2026 — PA Normalization + JSON Shape Fix)

### PA normalization in projection blending (`scripts/generate_projections.py`)

**Problem**: partial seasons (injuries, mid-season callups) were being blended at face-value FP totals, penalizing players who only played half a year. James Wood's 2024 (255 FP in 336 PA) was being weighted at 40% as if it were a full-season 255 — dragging his WeightedBase down unfairly.

**Fix — `weighted_fp()` now PA-normalizes before blending**:
- Each year's FP is scaled to a full-season equivalent: `fp * (pa_baseline / actual_pa)`
- Batter baseline: `pa_baseline=600`
- Pitcher baseline: SP (`GS/G >= 0.5`) → 180 IP; RP → 70 IP (classified via GS/G ratio per player)
- Effect on Wood: 2024 FP 255 in 336 PA → normalized ~455; WeightedBase rises from 419 → ~499; ProjectedFP 396 → ~421
- Pitcher classification added: `is_sp = (pb["GS"].fillna(0) / pb["G"].replace(0, np.nan).fillna(1)) >= 0.5`; `pb["_ip_baseline"]` set accordingly before calling `weighted_fp`

**Known limitation**: players with <3 years of history who are genuinely improving (e.g. Wood) are still somewhat underprojected because the model is backward-looking with no trajectory component. Accepted as-is.

### `data/projections/2026.json` shape fix

**Bug**: JSON was written as a plain array `[{...}, ...]` but `lib/data-processor.ts:316` expects `{ players: [...] }` shape:
```typescript
for (const p of projections2026.players) {  // TypeError if root is array
```
**Fix**: wrapped existing array in `{ "players": [...] }` — 823 players, shape now correct. Runtime TypeError on dev server resolved.

## Session Work (March 8, 2026 — Keeper Display Fixes)

### Season history keeper count fix (`lib/data-processor.ts`)
- `getTeamKeepersForYear()` now caps at **5 keepers** for seasons before 2026 and **6 keepers** for 2026+
- Previously always sliced to 6, which was wrong for all historical seasons

### Historical keeper accuracy investigation + overrides
- **Root cause of Goldschmidt problem**: ESPN `keeperValue` at season-end reflects each player's *projected cost to be kept next year*, not whether they were actually a keeper. A mid-season free agent pickup (like Goldschmidt) gets `keeperValue=1` by ESPN's default pricing — indistinguishable from a round-1 keeper.
- **`acquisitionType` doesn't help**: ESPN returns `acquisitionType = 'DRAFT'` for all players when fetched at season-end. The `KEEPER` value is only present in roster data fetched right after the draft — we don't have that for 2022–2025.
- **`keeperValue <= 5` fallback also fails**: late-round picks who became keepers (e.g. James Wood, `keeperValue=23`) correctly have a high keeperValue, so they'd be excluded by this filter.

### `PlayerSeason` type + fetch-historical.ts update (`lib/types.ts`, `scripts/fetch-historical.ts`)
- Added optional `acquisitionType?: string` field to `PlayerSeason` interface
- `fetch-historical.ts` now captures `entry.acquisitionType` for each roster player
- Historical data re-fetched; all players have `acquisitionType = 'DRAFT'` (season-end limitation noted above)
- If historical data were ever re-fetched immediately post-draft, the `KEEPER` entries would be picked up automatically by `getTeamKeepersForYear`

### `getTeamKeepersForYear` priority chain (`lib/data-processor.ts`)
Three-tier lookup, in order:
1. **`data/historical-keeper-overrides.json`** — manually curated, most accurate. Structure: `{ "2025": { "1": ["Player A", ...] }, ... }`
2. **`acquisitionType === 'KEEPER'`** — accurate if fetched right after draft; currently unused for historical seasons
3. **`keeperValue > 0` fallback** — unreliable but better than nothing; only used when no override exists and no KEEPER acquisitions found

### `data/historical-keeper-overrides.json` (new file)
- Same pattern as `keeper-overrides.json` but keyed by year then team ID
- Currently empty (`{}` for all years 2022–2025) — needs to be populated with actual keeper lists
- **To fix the Goldschmidt/Space Cowboys 2025 issue**: add the real 5 keepers under `"2025" → "1"`
- Format: `{ "2025": { "1": ["Francisco Lindor", "Jose Ramirez", ...], "2": [...] }, ... }`

## Session Work (March 8, 2026 — Missing Projection Players Audit)

### Injury players missing from `data/projections/2026.json`

**Root cause**: `generate_projections.py` requires `MIN_PA = 200` (batters) and `MIN_IP = 30` (pitchers) from the FanGraphs pull. Players who missed those thresholds in 2025 due to injury are silently excluded.

**Audit**: Cross-referenced all rostered players in `data/current/2026.json` against projection names. Found **8 players** missing — 3 notable, 5 fringe arms:

| Player | Team | 2025 pts | Reason |
|---|---|---|---|
| Yordan Alvarez | Space Cowboys | 160.75 | 48 games (hand + ankle injury) |
| Shane McClanahan | Pepperoni Rolls | 0 | 2nd straight missed year (TJ + nerve) |
| Gerrit Cole | Sky Chiefs | 0 | Missed entire season (UCL) |
| Jose Ferrer, Louis Varland, Cam Schlittler, Connelly Early, Brandon Sproat | various | — | Fringe/prospect arms, not added |

**Fix**: Manually computed projected FP using the script's actual formula (historical ESPN pts + PA normalization + age/park/playing-time modifiers) and appended to `data/projections/2026.json`:
- **Yordan Alvarez**: 603.1 FP, 95th percentile (DH, HOU, age 28.5) — comparable to Buxton tier
- **Shane McClanahan**: 344.3 FP, 69th percentile (SP, TB, age 28.5) — one year of data (2023 only), heavy regression
- **Gerrit Cole**: 202.9 FP, 51st percentile (SP, NYY, age 35) — limited to ~87 projected IP, age decline

**Going forward**: If a star player misses the PA/IP minimum again, add them manually using the same approach — pull their historical ESPN pts from `data/historical/*.json`, apply the formula from `generate_projections.py` `weighted_fp()` + modifiers. MLBAM IDs can be looked up via `pybaseball playerid_lookup`.

## Session Work (March 9, 2026 — Keeper Point Totals on Team Pages)

### Keeper totals added to team pages (`app/teams/[teamId]/page.tsx`)

**2026 Keepers box** (`suggestedKeepers` section):
- Added an indigo summary row at the bottom of the keepers list showing **"Total Projected · X,XXX pts"**
- Computed via `suggestedKeepers.reduce((sum, p) => sum + Math.round(p.projectedFP2026 ?? 0), 0)`
- Styled as `bg-indigo-50` row matching the indigo color used for projected FP values

**Past season history cards** (Season History grid):
- The "Keepers" section header now shows total combined points those keepers scored that year, right-aligned in teal
- Computed via `keepers.reduce((sum, k) => sum + (k.totalPoints ?? 0), 0)`
- Only shown when `keeperTotalPts > 0` — seasons with no keeper point data are unaffected
- Both sections use IIFE pattern (`(() => { ... })()`) to compute the total inline without polluting outer scope

## Session Work (March 9, 2026 — Suggested Moves Feature)

### Overview
Added a "Suggested Moves" section to every team page (`app/teams/[teamId]/page.tsx`), placed between the EROSP table and Season History. Identifies weak roster positions and surfaces free agent upgrades with urgency labels.

### New Files

#### `lib/suggested-moves.ts` — Core engine
Multi-stage pipeline:
1. **Player→team assignment**: uses EROSP `fantasy_team_id` when non-zero (post-draft); falls back to `data/keeper-overrides.json` name matching (pre-draft, normalizing names to alphanumeric lowercase)
2. **Weighted positional strength per team**: for each position group (C, 1B, 2B, 3B, SS, OF, SP, RP), ranks players by `erosp_startable` descending, applies slot weights (1.0 → 0.90 → 0.80 → 0.70 → 0.60 → 0.50). Target slot is always the **last starter slot** (SP6, OF3) regardless of how many players exist — empty = null target
3. **League distributions**: mean/std/z-score/rank across all 10 teams per position
4. **Weakness detection**: flags if `z ≤ -0.50` OR bottom third of league (rank > 6.67) OR one of team's 2 weakest positions AND `z ≤ 0`
5. **FA candidate scoring**: cross-references `data/current/free-agents.json` × EROSP by normalized name; scores on weakness severity (0.35), upgrade magnitude (0.40), FA pool quality (0.15), lineup relevance (0.10)
6. **Urgency classification**: Urgent Pickup (upgrade% ≥ 15%), Suggested Add (≥ 10% + above absolute floor, or FA pool z ≥ 1.0), Watchlist (≥ 5%). Max 5 recommendations returned.
7. **Empty-slot spam control**: bottom-3-ranked positions always shown; mid-rank empty slots capped at 2

Key config: `erospFloor=25` (denominator min for upgrade%), `weaknessZThreshold=-0.50`, `maxRecommendations=5`, `MAX_MID_RANK_EMPTY_SLOTS=2`

Position eligibility mapping: `role='SP'→SP`, `role='RP'→RP`, `pos='TWP'→OF` (if EROSP > 50), LF/CF/RF → OF

#### `components/SuggestedMoves.tsx` — Display component
- Server component; no interactivity needed
- Color-coded cards: red (urgent), teal (suggested), amber (watchlist)
- Each card: urgency badge + position/slot chip, player comparison (Drop→Add), upgrade bar, league context chips (#rank, z-score, FA pool z), explanation text
- Empty-slot handling: shows "Fills empty slot" instead of absurd "+1798%" — `displayPct = Math.min(upgradePct, 2.0)` caps the bar; text label overrides the number
- `NoMovesState` rendered when 0 recommendations (never renders null)

### Team page wiring (`app/teams/[teamId]/page.tsx`)
- Loads `data/current/free-agents.json` after the EROSP block
- Runs `getSuggestedMoves({targetTeamId, erospPlayers, keeperOverrides, faList})`
- Renders `<SuggestedMoves result={suggestedMovesResult} />` in a `mb-10` div before Season History
- Guarded by `erospPlayers.length > 0` (no-op if EROSP not yet generated)

### Pre-draft behavior (current state, March 9)
All EROSP players have `fantasy_team_id=0` pre-draft → engine uses keeper-overrides.json. Each team has 6 keepers, leaving most position slots empty. Recommendations reflect genuine FA availability (from free-agents.json) against those keeper gaps.

Post-draft: run `npx tsx scripts/fetch-rosters-2026.ts` → EROSP daily cron will pick up team assignments → feature auto-upgrades to full-roster analysis.

## Session Work (March 9, 2026 — EROSP Pipeline Fixes)

### All 5 missing keeper players resolved

**Root cause**: `fetch_id_map()` in `scripts/erosp/ingest.py` calls `drop_duplicates(subset=["key_fangraphs"])` which collapses ALL rows with `key_fangraphs=-1` to a single row. Newer/rookie players (Wood, Skenes, Kurtz, Anthony) have valid `key_mlbam` but `key_fangraphs=-1`, so they were all dropped except one.

**Fix 1 — `build_name_to_mlbam_from_chadwick()` (new function in `ingest.py`)**:
- Reads raw `erosp_cache/chadwick_register.csv` directly, no FG-ID dedup
- Normalizes names (strip accents, remove Jr/Sr/II/III suffixes, alphanumeric only)
- Excludes ambiguous names (same normalized name → different MLBAM IDs)
- Returns ~21k unambiguous name→MLBAM mappings vs. ~12k from the FG-ID-deduped path

**Fix 2 — Prior-year player inclusion (in `talent.py`)**:
- `estimate_hitter_talent` and `estimate_pitcher_talent` now include players from fallback years (y1/y2/y3) who are absent from `base_year`
- Resolved Gerrit Cole (missed all of 2025; found in 2024 pitching data)

**Fix 3 — Team page pre-draft EROSP filter (`app/teams/[teamId]/page.tsx`)**:
- All players have `fantasy_team_id=0` pre-draft, so filtering by that field returned empty
- Fixed: detects pre-draft state (`erospPlayers.every(p => p.fantasy_team_id === 0)`), then name-matches against `keeper-overrides.json`

**Fix 4 — Position resolution for name-fallback players (`compute_erosp.py`)**:
- Name-fallback MLBAM IDs (from `build_name_to_mlbam_from_chadwick`) added to the `fetch_player_info()` call so birth dates and positions are fetched for these players too

**Results**: `data/erosp/latest.json` grew from 782 → 1,495 players. All 5 keepers confirmed:
- James Wood: OF, EROSP_S=292.9
- Paul Skenes: SP, EROSP_S=341.1
- Nick Kurtz: 1B, EROSP_S=568.2
- Roman Anthony: OF, EROSP_S=403.2
- Gerrit Cole: SP, EROSP_S=242.4

**Dead code removed**: `StandingsTable` import, `seasons` variable, `minPct` variable

## Session Work (March 9, 2026 — Dinwiddie Dinos Memorial Page)

### Overview
Added an "In Memoriam" page for the Dinwiddie Dinos (team ID 10, 2022–2024), the defunct franchise that was kicked out of the league after refusing their Saccko punishment. Accessible at `/dinos`.

### New Files

#### `app/dinos/page.tsx`
- Static server component — reads directly from `data/historical/2022.json`, `2023.json`, `2024.json`
- Bypasses `TEAM_JOIN_YEAR` filter in `data-processor.ts` (which excludes pre-2025 data for team ID 10)
- All stats computed inline: `getDinoSeasonHistory()`, `getDinoTopPlayers()`, `getDinoH2H()`
- **Header**: dark charcoal/forest-green gradient, grayscale+faded logo, "† In Memoriam" badge, years "2022–2024"
- **Vacated championship banner**: struck-through gray "2023 Champion" pill + red "Vacated" badge
- **Stats row**: Championships card shows struck-through `1` with red "Vacated" sublabel; Saccko Finishes card shows red "Refused to serve" sublabel
- **Season history cards**: 2023 card shows "~~Champion~~" + "Vacated" badges; 2022 card shows "Saccko" + "Unpunished" badges
- **Top Players All-Time**: Juan Soto leads across 3 seasons (~2,065 pts), followed by Marcus Semien, Corbin Carroll, Gunnar Henderson
- **Head-to-Head Records**: sorted by win %; Dinos went 7-0 vs Whistlepigs, 8-3 vs Pepperoni Rolls
- **"Circumstances of Removal" section**: red-bordered card with 3 paragraphs documenting the 2022 Saccko refusal, the vacated 2023 championship, and the exit from the league
- **Legacy card**: dark footer with quote: "He won the league and got kicked out for it. That's a sentence that has never been written before."

### Modified Files

#### `app/teams/page.tsx`
- Added `Link` import
- Added "† In Memoriam" card below the active team grid linking to `/dinos`
- Shows "Andrew Sharpe · 2023 Champions (vacated)" in small red text

#### `components/Header.tsx`
- `teamItems` array now appends `{ href: '/dinos', label: '† Dinwiddie Dinos', dimmed: true }` after active teams
- `NavDropdown` updated to accept `dimmed?: boolean` on items: renders a `border-t` divider before dimmed items, styles them gray instead of teal
- Mobile menu: Dinos added below active teams list with teal divider + faded color

### Key Lore
- 2022: finished 9th (Saccko bracket) → **refused to serve punishment**
- 2023: went 14-7, won the championship → **title subsequently vacated**
- 2024: went 13-9, no playoffs → removed from league after season
- Replaced by Bristol Banshees (2025), who won the championship in their first year
- Juan Soto was on the Dinos all 3 seasons; inherited by Banshees

## Session Work (March 9, 2026 — Historical Keeper Overrides + Dropped-Player Bug)

### `data/historical-keeper-overrides.json` fully populated
- All 10 teams × 3 years (2023, 2024, 2025) manually entered from commissioner records
- 5 keepers per team per year (6-keeper rule started in 2026)
- id=10 maps to Dinwiddie Dinos in 2023/2024 and Bristol Banshees in 2025; id=6 maps to Delmarva Shureburds in 2023/2024 and Delmarva Emus in 2025

### Dropped-keeper bug + partial fix (`lib/data-processor.ts`)
- **Root cause**: `getTeamKeepersForYear()` called `roster.players.find(p => p.playerName === name)` and filtered out `undefined` — silently dropping any keeper who was dropped mid-season (not in the end-of-season ESPN roster snapshot)
- **Confirmed affected players**: Anthony Santander (Emus 2025), Yu Darvish (Emus 2023) — likely others exist across all teams
- **Partial fix applied**: missing players now return `{ playerId: '', playerName: name, position: '', totalPoints: 0 }` placeholder so they appear in the UI rather than being hidden
- **Known gap**: `totalPoints: 0` is wrong — these players scored real points before being dropped, but that data is absent from the end-of-season roster snapshots

### Historical points re-fetch — COMPLETED (March 10, 2026)
- `scripts/fetch-historical.ts` now scans all scoring periods (1..maxPeriod) using `mRoster&scoringPeriodId=N`
- For each period, records the last-seen full-season `statSplitTypeId=0` total per player per team
- Players absent from the end-of-season snapshot but found in weekly scans get merged in with real point totals
- `espn-api.ts` `fetchLeagueData` now accepts optional `scoringPeriodId` param
- Historical JSONs regenerated: ~50 players/team vs ~30 before; dropped keepers now have real points
- Anthony Santander (Emus 2025, 89.5 pts) and Yu Darvish (Emus 2023, 124 pts) confirmed fixed
- **Key insight**: ESPN does NOT return per-period stats (`statSplitTypeId=1`) in `mRoster` view — must use full-season stat and take the last value seen per player per team

## Session Work (March 10, 2026 — Dinos Page Polish)

### Dinos page styling + admin-editable content

**In Memoriam badge**: `text-[11px]` → `text-sm` (slightly larger, matches hierarchy better)

**Bio paragraph**: removed `max-w-2xl` constraint so the text runs the full width of the dark header box, consistent with other team page bios.

**Admin-editable text fields** — same admin PIN pattern as team pages:
- **`DinosBioEditor`**: bio in the dark header; includes 🔒 admin unlock button
- **`DinosCircumstanceParagraph`**: each of the three "Circumstances of Removal" paragraphs (sacckoText, championshipText, exitText) gets a ✏️ edit button when admin is unlocked
- **`DinosLegacyEditor`**: legacy quote and legacy description text in the dark footer card

**New files:**
- `app/dinos/DinosContentEditor.tsx` — three client components for editable sections
- `app/dinos/actions.ts` — `updateDinosContent()` server action; persists to KV key `dinos-content` (fallback: `data/dinos-content.json`)

**Modified:**
- `lib/types.ts` — added `DinosContent` interface (`bio`, `sacckoText`, `championshipText`, `exitText`, `legacyQuote`, `legacyText`)
- `lib/store.ts` — added `getDinosContent()` / `setDinosContent()` using the same KV-or-JSON pattern
- `app/dinos/page.tsx` — made `async`, loads `getDinosContent()`, defaults fall back to original hardcoded text if nothing stored yet

**How to edit**: visit `/dinos`, click 🔒 in the header, enter admin PIN → ✏️ icons appear on all text sections.

## Session Work (March 10, 2026 — Scoring Leaders PA Fix + Team Page Tweaks)

### All-Time Scoring Leaders PA fix (`lib/types.ts`, `lib/data-processor.ts`, `app/stats/teams/page.tsx`)
- **Bug**: Total PA column in the All-Time Scoring Leaders table was summing `pointsAgainst` across ALL seasons for team ID 10, while `totalPointsFor` correctly only counted from 2025 (via `TEAM_JOIN_YEAR`). Result: Banshees showed 1 season of PF but 4 seasons of PA.
- **Fix**: Added `totalPointsAgainst` field to `AllTimeStandings` type and accumulated it inside `calculateAllTimeStandings()` alongside `totalPointsFor` — so both fields respect the same join-year filter.
- Page now reads `team.totalPointsAgainst` directly instead of doing a raw `seasons.reduce()` with no filtering.

### Players Employed stat + Season History subtitle (`lib/data-processor.ts`, `app/teams/[teamId]/page.tsx`)
- **New function `getTotalUniquePlayersEmployed(teamId)`**: iterates all seasons, collects unique `playerId` values in a Set (so a player who played in 2022, left, and returned in 2024 still counts as 1). Respects `TEAM_JOIN_YEAR` (Banshees only counted from 2025).
- Results across the league: Fuzzy Bottoms 201, Folksy Ferrets 185, Chinook 178, Mega Rats 165, Sky Chiefs 157, Emus 156, Space Cowboys 153, Whistlepigs 152, Pepperoni Rolls 143, Banshees 51 (1 season).
- Stat is surfaced as a muted subtitle next to the "Season History" heading: "X unique players across N seasons" — fits semantically there rather than in the all-time stats card grid.
- **Owner GUID fix**: `team.owner` in ESPN season data stores the user's SWID cookie (UUID format like `{6507D6E3-...}`), not their real name. Fixed by preferring `meta?.owner` from `data/teams.json` which has actual names (Ian Schurr, Owen Hart, etc.).

## Session Work (March 10, 2026 — Playoffs Vacated Championship + Manager History)

### Vacated 2023 championship on playoffs page (`app/playoffs/page.tsx`)
- **Problem**: 2023 playoffs page showed Dinwiddie Dinos as champion; their title was vacated so the runner-up (Manhattan Mega Rats, Caleb Tisdale) should be shown.
- **Fix**: Added `VACATED_CHAMPIONSHIPS` constant (`{ 2023: { from: 10, to: 4 } }`) and `applyVacatedOverride()` function that:
  - Overrides `season.champion` → Mega Rats (id=4)
  - Flips the championship matchup winner from Dinos → Mega Rats (only the final matchup where both teams played)
  - Does NOT touch historical JSON data — Dinos page lore is unaffected
- `isVacated` flag passed to `PlayoffBracket` for display tweaks:
  - Champion box header: "★ 2023 Champion (title awarded)"
  - Small red footnote: "† Original winner vacated"
  - Header badge: "★ Manhattan Mega Rats — 2023 Champion (title awarded)"
- Background photo automatically switches to NYC (Mega Rats `cityPhotoUrl`) since `champ` now resolves to id=4
- To add future vacated championships: add entry to `VACATED_CHAMPIONSHIPS` at top of `app/playoffs/page.tsx`

### Manager History component (`components/ManagerHistory.tsx`, `lib/data-processor.ts`, `app/teams/[teamId]/page.tsx`)
- **New `getTeamRecords(teamId)` function** in `lib/data-processor.ts`: iterates all qualifying seasons/matchups and computes:
  - `highWeek` / `lowWeek` — highest/lowest single-week score (skips 0-point weeks)
  - `biggestWin` / `biggestLoss` — largest margin of victory/defeat
  - `bestSeason` / `worstSeason` — by win total + finish
  - `bestScoringSeasonPF` / `worstScoringSeasonPF` — by total points scored
  - `totalRosterEntries` — total player-season appearances (same player in 3 seasons = 3)
  - Respects `TEAM_JOIN_YEAR` filter (Banshees only counts 2025+)
- **New `components/ManagerHistory.tsx`**: server component with two sections:
  - **Franchise Records**: `2×4` responsive grid of `RecordCard` components (teal/red/indigo/amber accents). Cards: Unique Players, Total Transactions, High Score, Low Score, Biggest Win, Biggest Loss, Best Season, Worst Season, Most/Fewest Points in a Season. Deduplication: Best Scoring / Worst Scoring only shown if they differ from Best/Worst season year.
  - **Trade Log**: shows all trade-type message board posts involving the team, from this team's perspective (Gave/Received columns, team color header strip, optional comment). Returns `null` if no records and no trades.
- **Team page**: `ManagerHistory` inserted between Season History grid and Head-to-Head table. Unique players count moved from the Season History heading subtitle into the ManagerHistory component cards.
- **`totalRosterEntries`** field added to `TeamRecords`: total player-season appearances (same player over 3 seasons = 3 entries). Displayed as "Total Transactions" card with indigo accent.
- **`TeamBestPickup` interface** and `bestPickup` field in `TeamRecords`: highest single-season scorer who was NOT a keeper. Inaugural season logic: first-ever season for a team uses an empty keeper set (all players were drafted, so exclusion can't be reliably computed). Subsequent seasons use `getTeamKeepersForYear` (three-tier: historical-keeper-overrides → acquisitionType=KEEPER → keeperValue fallback).
- **`BestMoveCard` sub-component**: `col-span-2` amber-bordered card with 52px circular player photo (or amber star placeholder), "BEST PICK" label, truncated player name, position+year, and right-aligned points total. Positioned after Unique Players + Total Transactions in the grid.

### Dinos page — inherited assets note (`app/dinos/page.tsx`)
- Added a small `bg-white/5` banner below the back link noting: "All player rights, contracts, and draft position inherited by the Bristol Banshees ahead of the 2025 season." Links to `/teams/10`.
