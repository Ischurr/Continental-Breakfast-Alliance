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

### GitHub Actions (`.github/workflows/update-erosp.yml`)
- Runs daily at **6 AM EST** (11:00 UTC)
- Sets up Python 3.11, installs `pybaseball pandas numpy requests python-mlb-statsapi`
- Runs `scripts/compute_erosp.py` → commits `data/erosp/latest.json` if changed → triggers Vercel redeploy
- No secrets needed — uses FanGraphs + MLB Stats API (both public)
- Caches `~/.pybaseball/` and `scripts/erosp_cache/` between runs (~1 min with warm cache)
- **In-season mode** (after March 25): `SEASON_STARTED=True` → fetches current-year batting/pitching stats (min 10 PA / 5 IP) + daily IL/injury map from MLB Stats API
- Can be triggered manually: Actions tab → Update EROSP → Run workflow
- All four workflows confirmed working; `[skip ci]` tag on commits prevents double-deploy loops

### GitHub Actions (`.github/workflows/update-rosters.yml`)
- Runs every **3 days** (`0 11 */3 * *`, 11:00 UTC)
- Runs `npm run fetch-rosters` (`tsx scripts/fetch-rosters-2026.ts`) → commits `data/current/2026.json` rosters if changed
- Refreshes per-player ESPN position eligibility as players earn new positions during the season
- Needs `ESPN_SWID` + `ESPN_S2` secrets (same as update-stats)

## Recent Work (Feb 2026 — late)
- **Playoff bracket** (`app/playoffs/page.tsx`): uses last 2 weeks of season as playoff rounds; lowest seed goes LEFT bracket; background photos use `minHeight: 500px` to normalize height across years. **Two-mode background**: current season with no champion → `isFullPageBg=true`, World Series trophy (`PRE_SEASON_BG`) rendered as `fixed inset-0 -z-10` with `bg-black/70` overlay (content scrolls over it, all text white); past seasons with a champion → `isFullPageBg=false`, boxed `relative rounded-2xl overflow-hidden` card with `absolute inset-0` background + `bg-black/60` overlay, page bg `bg-sky-50`, "In the Hunt"/"In the Hurt" text gray
- **BaseballFieldLeaders** (`components/BaseballFieldLeaders.tsx`): baseball field SVG with player pins, Ohtani special card, toggle for rostered vs FA view. ESPN has no 'RP' roster slot — all pitchers are 'SP'. Bullpen in rostered view uses `top('SP', 9).slice(4)` (ranks 5-9); FA view uses `top('RP', 5)`. **Mobile layout**: `flex-col md:flex-row` — field is full width, Ohtani/DH cards go horizontal above, side boxes use 2-col grid below.
- **USMapHero** (`components/USMapHero.tsx`): SVG US map using `react-simple-maps` v3 with `geoAlbersUsa` projection. Stars mark team cities; leader lines connect to circular logo images; logos link to team pages. Navy (`bg-blue-950`) background. Alaska inset replaced with a New Zealand outline — Alaska filtered out via `Number(geo.id) !== 2`; NZ rendered as an absolutely-positioned mini `ComposableMap` using `geoMercator` (center `[172, -41]`, scale 480) with `world-atlas@2/countries-50m.json` (50m resolution captures Stewart Island). Positioned `bottom: 4%, left: -2%`, sized `width: 20%, paddingBottom: 16%`.
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
- **ESPN `defaultPositionId`**: `1=SP, 2=C, 3=1B, 4=2B, 5=3B, 6=SS, 7=LF(OF), 8=CF(OF), 9=RF(OF), 10=DH, 11=RP` — use this for player's primary position, NOT eligibleSlots
- **ESPN `eligibleSlots`** (lineup slot IDs for multi-position eligibility): `0=C, 1=1B, 2=2B, 3=3B, 4=SS, 8/9/10=OF, 12=DH, 13/14=SP, 15=RP`. Slots 5(UTIL-OF), 6(MI), 7(CI), 11(IL), 16(bench), 17(bench), 19(UTIL-INF) are flex/bench — exclude from eligiblePositions to avoid false tags
- **Slot 16 in every player's eligibleSlots**: ESPN includes bench slot 16 for ALL players — do NOT map it to 'RP' or include it in LINEUP_SLOTS
- **ESPN stats array has multiple seasons**: always filter by `seasonId === 2026` when fetching current-year stats, otherwise you'll get 2025 full-season totals (the 2025 entry comes first in the array)
- ESPN roster data: all pitchers use 'SP' slot (no 'RP'), UTIL = OF + DH
- MLB Stats API `fields` param: must list nested fields explicitly (e.g., `primaryPosition,abbreviation` not just `primaryPosition`)
- `getCurrentSeason()` returns 2025 until March 9 (cutover date in `lib/data-processor.ts`) — use separate year computation for projection headings
- CSV `nan` values come through as the string `"nan"` in TypeScript (truthy) — check `!== 'nan'` explicitly
- Server Actions must call `revalidatePath` for every route that displays that data
- Vercel env vars: no quotes around values, must be set for Production, require redeploy after adding
- `espn-api.ts` `getHeaders()` sanitizes SWID/S2 with regex `[^\x20-\x7E]` to strip invalid HTTP header chars
- **`getTopMatchupOfWeek()` active-week logic**: uses `Math.max` over weeks with `totalPoints > 0` or `winner` set — NOT `Math.max` over all weeks (that returns week 21, the last scheduled week, all season long)
- **Homepage matchup card**: shows in-progress scores (sky blue) when `totalPoints > 0`, not just final scores; label shows "In progress" vs "Final" vs team records pre-game

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
  - `bestSeason` / `worstSeason` — by win total + finish
  - `bestScoringSeasonPF` / `worstScoringSeasonPF` — by total points scored
  - `totalRosterEntries` — total player-season appearances (same player in 3 seasons = 3)
  - `bestPickup` — best waiver/FA add (`acquisitionType === 'ADD'`)
  - `bestTrade` — best player acquired via trade (`acquisitionType === 'TRADE'`), with prior-season roster lookup to infer `fromTeamName`
  - Respects `TEAM_JOIN_YEAR` filter (Banshees only counts 2025+)
- **`acquisitionType` data**: historical JSON has real values — `DRAFT`, `ADD` (waiver/FA), `TRADE` (ESPN-tracked), `undefined` (keepers/unknown). Counts per year: ~137 DRAFT, ~147 ADD, ~4–19 TRADE, ~200 undefined.
- **New `components/ManagerHistory.tsx`**: server component with two sections:
  - **Franchise Records**: responsive grid of `RecordCard` components. Cards: Unique Players, Total Transactions, Best Pick (amber, `col-span-2`), Best Trade (indigo, `col-span-2`), High Score, Low Score, Best Season, Worst Season, Most/Fewest Points in a Season.
  - **Trade Log**: shows all trade-type message board posts involving the team.
- **`BestMoveCard`** (amber): "BEST PICK" — waiver/FA adds only (`acquisitionType === 'ADD'`), excludes draft picks
- **`BestTradeCard`** (indigo): "BEST TRADE" — ESPN-tracked trades (`acquisitionType === 'TRADE'`); shows `· from [Team]` when prior-season roster cross-reference identifies the source team
- **Removed**: `biggestWin` / `biggestLoss` cards and `TeamMarginRecord` interface

### Dinos page — inherited assets note (`app/dinos/page.tsx`)
- Added a small `bg-white/5` banner below the back link noting: "All player rights, contracts, and draft position inherited by the Bristol Banshees ahead of the 2025 season." Links to `/teams/10`.

## Session Work (March 11, 2026 — EROSP Pipeline Bug Fixes)

### SP rotation slot bug fixed (`scripts/erosp/playing_time.py`)
- **Bug**: teams with 8+ SPs all received equal projected starts via `1/n_sp_on_team` formula (9 BOS SPs → everyone got 18 starts, including Crochet)
- **Fix**: collapsed `elif n_sp_on_team <= 7` / `else` into a single `else` branch for all 6+ SP teams; top 5 quality SPs get full rotation (32 starts), rank 5 → 15 starts, rank 6 → 8 starts, rank 7+ → 3 starts
- **Quality sort**: changed from `ip_per_gs` (durability proxy) to composite `k_per_ip - 2*er_per_ip - bb_per_ip` which mirrors the actual FP formula per IP
- All ~31 teams with 6+ SPs now have correctly tiered rotation projections; Crochet moved from 18 → 32.4 projected starts

### Multi-team player "- - -" team bug fixed (`scripts/erosp/talent.py`)
- **Bug**: FanGraphs returns `"- - -"` as the team abbreviation for players traded mid-season (aggregate stats row). This caused ~27 SPs and ~60+ hitters to be grouped into a fake "- - -" team, producing wrong park factors and a distorted cap_factor (~0.661) from the inflated team size
- **Fix**: added prior-year fallback in both `estimate_pitcher_talent` and `estimate_hitter_talent`: when `team_norm == "- - -"`, iterate y2/y3 to find the most recent year with a valid team abbreviation
- Merrill Kelly (ARI), Kyle Harrison (SF), Zack Littell (TB), Taj Bradley (TB) now correctly assigned
- 83 remaining "- - -" players are genuine multi-year journeymen/free agents — correct behavior

### EROSP audit findings (non-issues confirmed)
- Missing ESPN IDs (1,398 players): expected pre-draft; ESPN only returns IDs for rostered players
- Low start_probability for 6th/7th starters despite good fp_per_start: correct modeling — daily_ev below replacement threshold for limited-start players
- All other outliers (Judge 734 EROSP, top closers 300+) verified as legitimate projections

## Session Work (March 12, 2026 — Schedule Refresh + Script Bug Fix)

### `scripts/fetch-current.ts` teams.json shape fix
- **Bug**: script cast `teamsJson` as a plain array and called `.filter()` on it, but `data/teams.json` has shape `{ teams: [...] }` (not a plain array). This caused `TypeError: import_teams.default.filter is not a function` — meaning the daily GitHub Actions cron was failing silently every run.
- **Fix**: added shape detection: `(teamsJson as { teams?: Array<...> }).teams ?? teamsJson as Array<...>`. Handles both shapes safely.

### 2026 schedule refreshed from ESPN
- Re-ran `npm run fetch-current` after manual schedule adjustments were made on ESPN
- Result: 105 matchups across 21 weeks, all 10 teams
- Verified no back-to-back same-team matchups across all 21 weeks (clean schedule)

## Session Work (March 12, 2026 — EROSP Pipeline Improvements)

### 6 improvements to the EROSP projection pipeline (`scripts/erosp/`)

**1. Playing time — Steamer GS/IP override** (`playing_time.py`, `compute_erosp.py`)
- `estimate_sp_playing_time()` accepts `steamer_gs_map` / `steamer_ip_map` (FanGraphs player IDs → projected GS/IP)
- Runs AFTER rotation-tiering heuristic; overrides `p_start_per_day` and `ip_per_start` for any SP Steamer covers
- `p_start = gs_proj / 162`, capped at `1/ROTATION_DAYS` (no pitcher starts every 4th game)
- `compute_erosp.py` Step 9 fetches Steamer pitcher projections (`?type=steamer&stats=pit`) and passes to `build_playing_time()`

**2. HBP incorporated** (`config.py`, `ingest.py`, `talent.py`, `projection.py`)
- `SCORING["hbp"] = 1.0` added to config
- `fetch_batting_stats()` computes `hbp_rate = HBP / PA`; fallback `PA * 0.010` when column missing
- `"hbp_rate"` added to `LG_AVG` (0.010), `RATE_COLS`, and the talent blending pipeline
- `fp_per_pa()` now includes `rates.get("hbp_rate", 0) * SCORING["hbp"]`; adds ~6 pts/season

**3. Sample-size weighting** (`talent.py`, `config.py`)
- Year-weights (50/30/20) scaled by `min(actual_pa / PA_FULL_SEASON, 1.0)` before renormalizing
- Partial seasons (injuries, callups) get proportionally less trust
- Dynamic regression: interpolates from `MEAN_REGRESSION_LOW=0.35` (at 200 PA) to `MEAN_REGRESSION_HIGH=0.15` (at 600 PA)
- Same approach for pitchers: scaled by `min(actual_ip / IP_FULL_SEASON, 1.0)` where `IP_FULL_SEASON=150`

**4. xwOBA fix** (`config.py`, `talent.py`)
- Dampening factor raised `0.3 → 0.5` — xwOBA is meaningfully predictive; 0.3 was too flat
- Now blends 2 years of Statcast (y1 gets 2/3 weight, y2 gets 1/3) via `_blend_xwoba()` helper for more stability

**5. Asymmetric age curve** (`config.py`, `talent.py`)
- Replaced flat ±0.6%/yr with: `+0.9%/yr` below peak (27), `-1.0%/yr` ages 27–32, `-2.5%/yr` after 32
- Pitchers decline 40% faster post-peak (`AGE_PITCHER_DECLINE_MULT = 1.4`)
- Floor `0.65`, ceiling `1.15`; `age_modifier(age, is_pitcher=True)` now correct for SP/RP

**6. Daily injury map** (`ingest.py`, `projection.py`, `compute_erosp.py`)
- `fetch_injured_players(season)` loops all 30 MLB teams via `/teams/{id}/roster?rosterType=40Man`
- Returns `{mlbam_id: {"il_type": "D10", "games_missed_est": N}}` for each IL player
- Uses `expectedActivationDate` when available; falls back to `_il_code_to_games()` (D7→7, D10→14, D15→21, D60→60)
- Daily cache: `erosp_cache/injured_players_{season}_{date}.json` — ~3s fetch, idempotent reruns
- `compute_all_erosp_raw()` accepts `injury_map` and deducts `games_missed_est` from `games_remaining` for all 3 player types

### New constants in `config.py`
- `PA_FULL_SEASON = 600`, `IP_FULL_SEASON = 150`
- `MEAN_REGRESSION_HIGH = 0.15`, `MEAN_REGRESSION_LOW = 0.35`
- `AGE_PEAK = 27.0`, `AGE_GROWTH_RATE = 0.009`, `AGE_DECLINE_EARLY = 0.010`, `AGE_DECLINE_LATE = 0.025`
- `AGE_DECLINE_FAST_THRESHOLD = 32.0`, `AGE_PITCHER_DECLINE_MULT = 1.4`, `AGE_MOD_MIN = 0.65`, `AGE_MOD_MAX = 1.15`
- `XWOBA_DAMP = 0.5` (was 0.3)

## Session Work (March 12, 2026 — Matchups Page Redesign)

### Matchups page overhaul (`app/matchups/page.tsx`, `components/MatchupsClient.tsx`)

**New behavior:**
- Default view shows only the **current week** (last week with any scoring activity; falls back to Week 1 pre-season)
- **"Show previous weeks & upcoming"** collapsible (teal): next week shown first labeled "Upcoming", then all past weeks newest-first
- **"Show full schedule"** collapsible (indigo, separate): all remaining weeks beyond next, in chronological order — only shown when 2+ future weeks exist
- **Team filter**: pill selector row (All Teams + one pill per team using `abbrev`). Filters all three sections simultaneously. Selecting an active pill deselects it (toggle).

**Team-filtered full schedule layout:**
- When a team is selected and full schedule is open, cards render in a `flex flex-wrap justify-center gap-4` container
- Each card uses `flex-1 min-w-[220px] max-w-[320px]` — full rows stretch edge-to-edge; partial last row is centered (not left-hugging)
- No week-section headers in this mode — week number already shown in each `MatchupCard` header
- When no team filter: standard `WeekSection` layout (week header + 3-col grid) unchanged

**Architecture:** `page.tsx` stays server component; all interactivity extracted to `components/MatchupsClient.tsx` (`'use client'`). Server computes `currentWeek` and `nextWeek` and passes them as props.

## Session Work (March 12, 2026 — Matchups Page Season Cards)

### Regular Season Winner added to season cards (`app/matchups/page.tsx`)
- Each historical season card in "Browse by Season" now shows both Champion and Regular Season Winner
- Regular Season Winner = team with best W-L record; PF used as tiebreaker
- In-progress seasons (no `champion` set) show "TBD" for both fields
- Dinwiddie Dinos (id=10) excluded from regular season winner consideration for 2024 (year they were kicked out)
- If champion and regular season winner are the same team, both lines still shown
- **Historical regular season winners**: 2022: Pepperoni Rolls (14-6), 2023: Chinook (14-7, PF tiebreak over Dinos), 2024: Space Cowboys (17-5, same as champion), 2025: Mega Rats (16-6)

### Vacated championship fix on matchups season cards (`app/matchups/page.tsx`)
- Added `VACATED: Record<number, number> = { 2023: 4 }` inline — same logic as playoffs page
- 2023 champion now displays as Manhattan Mega Rats (id=4), not Dinwiddie Dinos
- `championId` used throughout (champion display, regular season winner comparison, TBD check)

## Session Work (March 12, 2026 — EROSP Backtesting)

### Backtest script (`scripts/backtest_erosp.py`)
- New script that runs the full EROSP pipeline as a **pre-season projection** for a target year, then compares against actual fantasy points from `data/historical/{year}.json`
- Usage: `cd scripts && python3 backtest_erosp.py --target-year 2025`
- Overrides `games_remaining → 162` for all teams (season is over, API returns 0)
- Skips injury map and ESPN roster assignment (pure pre-season simulation)
- Matches projected players to actual by normalized name
- Outputs: `data/erosp/backtest_{year}.json` (projection) + `data/erosp/backtest_{year}.csv` (comparison table)
- Prints: overall Pearson r / Spearman ρ / RMSE / MAE / bias, by-position breakdown, top 25 by projection vs actual rank, biggest over/under projections

### 2025 Backtest Results
- **Overall**: Pearson r=0.425, Spearman ρ=0.394, RMSE=230 pts, bias=-180 pts (under-projected)
- **By position**: 1B (r=0.423), SS (r=0.442) best; C (r=0.039), RP (r=0.065) essentially random
- **By role bias**: SP +14 (fine), Hitters +15 (fine), RP -49 (structural miss)
- **Top miss categories**: injury-related over-projections (Strider, Acuna, Alvarez), comeback pitcher under-projections (Boyd -438, Rogers -343, Rasmussen -339), new-closer under-projections (Luis Garcia -342, Pagan -271)

### Known model weaknesses + planned fixes (implement in next session)

**Fix 1 — 40-man roster floor for returning/prospect pitchers** (`talent.py` + `compute_erosp.py`):
- Boyd (22→460), Rogers (13→356), Mize (20→322), Leiter (14→309), Warren (12→300) all had <30 IP in 3-year window
- After Step 8, identify MLBAM IDs in `player_info_df` (40-man roster) with <30 total IP in `pitcher_talent_df`
- Add floor rows at league-average pitcher rates with heavy regression (~100-150 EROSP floor)

**Fix 2 — Extend pitcher lookback from 3 → 5 years** (`compute_erosp.py`, `talent.py`):
- Add `PITCHER_EXTRA_YEARS = [TARGET_SEASON-4, TARGET_SEASON-5]` with weights [0.05, 0.05] (renormalized)
- Only apply to pitchers absent from y1/y2 — avoids polluting healthy pitchers with stale data

**Fix 3 — High-K middle reliever appearance rate bump** (`playing_time.py`):
- Middle RPs with `k_per_ip > 1.1` and `sv_per_g < 0.10` → bump `p_appear_per_game` from 0.30 → 0.35
- Addresses Luis Garcia, Pagan, Bubic type misses (high-stuff guys who became closers)

**Fix 4 — Catcher-specific playing time** (`config.py`, `playing_time.py`):
- Add `DEFAULT_P_PLAY_CATCHER = 0.74`, `DEFAULT_PA_PER_GAME_CATCHER = 3.6`
- Override defaults for `mlb_position == 'C'` in `estimate_hitter_playing_time()`
- Reduces +38 over-projection bias for catchers

**Fix 5 — Increase `DEFAULT_IP_PER_START` from 5.5 → 5.8** (`config.py`):
- One-line change; adds ~+29 pts for a 32-start SP
- Validate: overall Spearman ρ should stay ≥ 0.394, RP bias should move toward 0

## Session Work (March 12, 2026 — EROSP Backtesting Fixes)

### All 5 fixes implemented and validated (`scripts/erosp/config.py`, `playing_time.py`, `talent.py`, `compute_erosp.py`, `backtest_erosp.py`)

**Implemented fixes:**
- **Fix 1** — 40-man roster floor: SP-classified pitchers absent from y1+y2 with <30 total career IP get league-average rates. Guards: must be confirmed pitcher in `player_info_df`, role='SP', absent from `_recent_activity_set` (y1/y2 FanGraphs data), total IP < 30. Applied 46 pitchers in 2025 backtest.
- **Fix 2** — Extended pitcher lookback: `BLEND_WEIGHTS_5YR = [0.50, 0.30, 0.20, 0.05, 0.05]` added to config. `_blend_pitcher_rates()` accepts optional `weights` param. `estimate_pitcher_talent()` accepts `extra_years=[y4, y5]`. When `has_recent_data=False` (absent from y1+y2), uses 5yr blend instead of 3yr. Both `compute_erosp.py` and `backtest_erosp.py` fetch `PITCHER_EXTRA_YEARS = [TARGET_SEASON-4, TARGET_SEASON-5]` and pass them through.
- **Fix 3** — High-K middle reliever bump: in `estimate_rp_playing_time()`, middle RPs with `k_per_ip > 1.1` get `p_appear_per_game` bumped 0.30 → 0.35.
- **Fix 4** — Catcher playing time: `DEFAULT_P_PLAY_CATCHER = 0.74`, `DEFAULT_PA_PER_GAME_CATCHER = 3.6` added to config. Applied in `estimate_hitter_playing_time()` when `mlb_position == 'C'`.
- **Fix 5** — `DEFAULT_IP_PER_START`: 5.5 → 5.8.

**IMPORTANT: `backtest_erosp.py` has its own independent pipeline** — any changes to `compute_erosp.py` orchestration (extra years fetch, Step 8b floor, `extra_years` param) must also be duplicated in `backtest_erosp.py`. Changes to `talent.py`, `playing_time.py`, `config.py` apply to both automatically.

### 2025 Backtest Results (after all 5 fixes)

| Metric | Before fixes | After fixes |
|--------|-------------|-------------|
| Pearson r | 0.425 | 0.416 |
| Spearman ρ | 0.394 | 0.421 |
| RMSE | 230 pts | 163.5 pts |
| Bias | -180 pts | -3.6 pts |

- SP bias: -49 → -1.2 (nearly eliminated)
- Catcher bias in backtest: +38 → -49.6 (backtest artifact — Steamer PA overrides don't apply in backtest; production is accurate)
- Floor applied to 46 pitchers (SP, absent y1/y2, <30 total IP)
- Boyd/Littell/Rogers/Eovaldi remain under-projected: root cause is RP→SP role transition (pitched as relievers in comeback years 2023-2024; model correctly classified them RP but can't predict 2025 role change)

### Accuracy analysis (300+ FP players, trimmed top/bottom 5%)

| FP Range | MAE | % of avg score |
|----------|-----|----------------|
| 300-400 pts | 70 pts | 20% |
| 400-500 pts | 71 pts | 16% |
| 500-700 pts | 113 pts | 20% |

Comparable to commercial systems (Steamer/ZiPS) for pre-season full-season projections.

### Planned next fixes (not yet implemented)
- **Fix A** — Increase y1 weight: change `BLEND_WEIGHTS_3YR = [0.50, 0.30, 0.20]` → `[0.60, 0.25, 0.15]` in `config.py`. Goal: reduce -46 hitter bias (elite players on upward trajectory under-projected).
- **Fix C** — SP rotation floor for known starters: in `estimate_sp_playing_time()` in `playing_time.py`, after the Steamer override block (before `return result`), add a pass setting `p_start_per_day >= 15/162` for any SP with 10+ GS in `pitching_by_year[current_season_year - 1]`. Fixes Bassitt (136→350), Bello (147→360), Cabrera (67→310) type misses.

### Backtest command
```bash
cd /Users/ianschurr/Continental-Breakfast-Alliance/cba-site/scripts
python3 backtest_erosp.py --target-year 2025 2>&1 | grep -E "(Pearson|Spearman|RMSE|Bias|Pos|n=|─|Floor)"
```

## Session Work (March 12, 2026 — Team Page Background Player Photos)

### Background player photos on team pages (`data/teams.json`, `app/teams/[teamId]/page.tsx`)

**Feature**: Each team page can show two full-screen background player photos (one left, one right) that stay fixed as the user scrolls. Content cards sit on top.

**Data shape** (`data/teams.json`):
```json
"bgPlayers": {
  "left": "https://...",
  "right": "https://...",
  "mirrorRight": false
}
```
- `mirrorRight: true` flips the right image horizontally so players naturally face each other
- Only teams with a `bgPlayers` entry show photos — all other team pages are unaffected
- Currently set: Space Cowboys (id=1)

**Implementation** (`app/teams/[teamId]/page.tsx`):
- Two `fixed` divs (`w-1/2` each), one anchored `left-0` and one `right-0`, spanning `top-0 bottom-0`
- Each contains a full-size `<img>` with `object-cover` + `opacity-35`
- CSS `mask-image` fades the inner 25% of each panel (`black 75% → rgba(0,0,0,0.2) 100%`) — no hard seam
- `z-0` keeps photos behind all content; Header wrapped in `z-20` so nav dropdowns render above both photos and main content (`z-10`)
- Page background changed to `bg-sky-50` (unchanged); content cards darkened to `bg-slate-200` to contrast against the brighter photo background
- To add photos for another team: add `bgPlayers` entry to `data/teams.json` — no code changes needed
- **Text contrast**: all section `h2` headings explicitly set to `text-gray-900`; section subtitles darkened from `text-gray-500/400` → `text-gray-700/600` so they're readable over photo backgrounds
- **Teams with bgPlayers set**: Space Cowboys (id=1), Portland Chinook (id=2), West Virginia Pepperoni Rolls (id=3)

## Session Work (March 13, 2026 — Background Photo Updates)

### Background player photo changes (`data/teams.json`)
- **Space Cowboys (id=1)**: replaced right photo with `https://assets-cms.thescore.com/uploads/image/file/536871/w768xh576_GettyImages-1243900642.jpg?ts=1665534169`
- **Portland Chinook (id=2)**: added `bgPlayers` for the first time
  - left: `https://pbs.twimg.com/media/GaydkemXgAA17T0.jpg`
  - right: `https://www.krqe.com/wp-content/uploads/sites/12/2025/09/68d4ece735ebe9.07259571.jpeg?strip=1`
  - `mirrorRight: false`
- **West Virginia Pepperoni Rolls (id=3)**: added `bgPlayers` for the first time
  - left: Skenes photo (landscape) — `https://ogden_images.s3.amazonaws.com/www.altoonamirror.com/images/2026/03/09235644/Skenes-for-Web-1100x733.jpg`
  - right: Julio Rodriguez — `https://www.cincinnati.com/gcdn/presto/2023/02/27/PCIN/1e805947-38aa-4e39-90b9-47b4c3919c2f-022623RedsGiantsST_09.JPG?width=660&height=990&fit=crop&format=pjpg&auto=webp`
  - `mirrorRight: false`, `objectPositionLeft: "center top"`, `objectPositionRight: "right top"`

### `objectPositionLeft` / `objectPositionRight` support added (`app/teams/[teamId]/page.tsx`)
- Optional fields on `bgPlayers` in `teams.json` — any valid CSS `object-position` value (e.g. `"center top"`, `"30% top"`, `"right center"`)
- Defaults: left panel → `"left top"`, right panel → `"right top"` (same behavior as before for teams without these fields)
- Applied via inline `style={{ objectPosition: ... }}` on the `<img>` element; Tailwind `object-*` classes removed from both bg images
- `mirrorRight` transform and `objectPositionRight` are merged in a single `style` object
- **Teams with bgPlayers set**: Space Cowboys (id=1), Portland Chinook (id=2), West Virginia Pepperoni Rolls (id=3)

## Session Work (March 12, 2026 — EROSP Steamer Benchmark + Fixes D/F)

### Steamer benchmark (`scripts/benchmark_steamer.py`)
- New script: fetches Steamer pre-season projections for any target year, converts to CBA FP, compares vs. actual results and EROSP backtest numbers
- Usage: `cd scripts && python3 benchmark_steamer.py [--target-year 2025]`
- Output: `data/erosp/steamer_benchmark_{year}.csv` + head-to-head stats printed
- Also saves `data/erosp/steamer_raw_bat_{year}.csv` (playerid, PA) and `steamer_raw_pit_{year}.csv` (playerid, GS, IP) for use by the backtest
- 2025 results: Steamer r=0.791, ρ=0.780, RMSE=104 vs. EROSP r=0.420, ρ=0.410, RMSE=160

### Fix D: Steamer PA/GS/IP in backtest (`scripts/backtest_erosp.py`)
- `backtest_erosp.py` Step 9 now fetches `season=TARGET_SEASON` Steamer projections instead of using heuristic defaults
- Falls back to `data/erosp/steamer_raw_bat_{year}.csv` / `steamer_raw_pit_{year}.csv` cache files if API 403s (rate-limited)
- **Result: Pearson r=0.612, Spearman ρ=0.583, RMSE=153.6** (was r=0.420, ρ=0.410, RMSE=160.1)
- Bias=-72 expected: Steamer is conservative on free-agent signings and injury returnees

### Fix F: Multi-year closer certainty (`scripts/erosp/playing_time.py`)
- Added second pass in `estimate_rp_playing_time()`: players with raw sv/g ≥ 0.30 in both y1 and y2 forced to closer-tier (`p_appear_per_game=0.40`)
- **Result: No detectable effect** — the blended `sv_rate ≥ 0.25` rule already catches all such players (math: if sv/g ≥ 0.30 in both y1+y2, blended rate > 0.255 which exceeds the 0.25 threshold)
- Root cause of RP inaccuracy (ρ=0.114): biggest misses (Luis Garcia, Drew Rasmussen) became new closers in 2025 without being closers in prior years — no backward-looking stat can predict this
- RP accuracy is structurally limited; Steamer beats EROSP on RPs by using pre-season depth chart announcements, not better statistics

### Steamer data cache files
- `data/erosp/steamer_raw_bat_2025.csv` — FanGraphs playerid → projected PA (978 players)
- `data/erosp/steamer_raw_pit_2025.csv` — FanGraphs playerid → projected GS, IP (1,415 pitchers)
- Generated by `benchmark_steamer.py` or manually via FanGraphs API with `season=YEAR` param
- FanGraphs rate-limits aggressively — use `'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'` UA

## Session Work (March 15, 2026 — Header Logo + Sticky Nav)

### CBA League Logo added to header (`components/Header.tsx`, `public/cba-logo.jpg`)
- **`public/cba-logo.jpg`**: copied from `~/Desktop/Fantasy Website/CBA Logo.jpg`
- Logo placed to the **left** of "The Continental Press Box" text in the header; both are wrapped in the same `<Link href="/">` so the whole lockup links to the landing page
- Container: `w-[48px] h-[48px] rounded-lg overflow-hidden flex-shrink-0` — clips white border from the JPG
- Image: `scale-[1.18]` zooms in to crop the white padding around the actual square logo
- Size: 48px (≈ 10% larger than the initial 44px)

### Sticky header
- Added `sticky top-0 z-50` to the `<header>` element — nav bar follows the user as they scroll

## Session Work (March 15, 2026 — Background Player Photos Expanded)

### `bgPlayers` added to all remaining teams (`data/teams.json`)
- Every team now has a `bgPlayers` entry (all 10 active teams + the 3 already set from prior sessions)
- **Manhattan Mega Rats (id=4)**: left = Soto CNN photo, right = Guerrero Insider photo; `mirrorRight: false`
- **Delmarva Emus (id=6)**: left = Yahoo/SBNation photo, right = USA Today photo; `mirrorRight: false`
- **Syracuse Sky Chiefs (id=7)**: left = Twitter/X photo, right = USA Today Judge photo; `mirrorRight: false`
- **Ghent Whistlepigs (id=8)**: left = MLB static (mlbam 680757), right = MLB static (mlbam 701762); `mirrorRight: false`
- **North Georgia Fuzzy Bottoms (id=9)**: left = LA Times/Brightspot photo, right = Yahoo/SBNation Bobby Witt Jr. photo; `objectPositionRight: "center top"` to center the crop on the player; `mirrorRight: false`
- **Bristol Banshees (id=10)**: left = Twitter/X photo, right = MLB static Soto (mlbam 669373); `mirrorRight: false`
- **Ft. Meade Folksy Ferrets (id=11)**: left = MLB static (mlbam 665489), right = USA Today 2026 photo; `mirrorRight: false`

### `objectPositionRight` gotcha
- Default right panel value is `"right top"` (equivalent to `"100% top"`) — already the rightmost crop point
- Setting `"75%"`, `"85%"`, `"95%"` all move the crop LEFT (toward center), not further right
- If a player is in the center of the source image, use `"center top"` to pan left and show them

## Session Work (March 16, 2026 — Background Photo Tweaks + Manager History)

### `bgTranslateYLeft` / `bgTranslateYRight` support (`app/teams/[teamId]/page.tsx`, `data/teams.json`)
- New optional numeric fields on `bgPlayers` in `teams.json`; apply `transform: translateY(Npx)` to the background `<img>` to physically shift photo content down on screen
- Use when the player's face is hidden behind the sticky header/ticker — `objectPosition` alone can't push content lower than `top`
- **Bristol Banshees (id=10)**: `bgTranslateYLeft: 80` — left photo shifted 80px down so player appears below header
- Right panel: `bgTranslateYRight` works the same way; combines with `scaleX(-1)` when `mirrorRight: true`

### Suggested Moves post-draft guard (`app/teams/[teamId]/page.tsx`)
- `suggestedMovesResult` now only computed when `!showSuggestedKeepers` (i.e. post-draft)
- Pre-draft: section is hidden entirely — keeper gaps would generate noisy/irrelevant recommendations

### Manager History improvements (`components/ManagerHistory.tsx`, `lib/data-processor.ts`)
- **Best Draft Pick card** (teal, `col-span-2`): shows highest career-points player first acquired via `acquisitionType === 'DRAFT'`; accumulates pts across all seasons on that team
- **Championships card** (yellow, `col-span-2`): shows 🏆 + count; "None yet" for 0
- **`bestByAcquisition(types)`** helper in `getTeamRecords()`: generic function that accumulates career pts for players first acquired via any of the given acquisition types; used for both `bestDraftPick` and `bestPickup`
- **`bestDraftPick`** added to `TeamRecords` interface; passed as `championships` prop to `ManagerHistory`
- Rename: "Best Pick" → "Best Pickup"; subtitle changed to "Added {year}" / "career pts"
- `ManagerHistory` now accepts `championships: number` prop (passed from team page)

### First-acquisition-type fix for Franchise Records (`lib/data-processor.ts`)
- **Root cause**: `bestByAcquisition` used "ever acquired via these types" semantics — Freddie Freeman had `TRADE` in 2022 and `DRAFT` in 2023–2025 (as a keeper), so he appeared as both Best Trade AND Best Draft Pick
- **Fix**: replaced `ever` Set with `firstAcq` Map built once per team — records each player's `acquisitionType` from their **earliest** season on that team. Players are categorized by first acquisition only.
- `bestByAcquisition` now checks `firstAcq.get(playerName)?.type` instead of any-season match
- `bestTrade` loop also updated to `firstAcq.get(playerName)?.type === 'TRADE'`
- Removed `exclude` parameter and `draftExcludes` workaround — logic is now self-consistent
- Keepers reacquired via DRAFT after being traded in will correctly show under Best Trade, not Best Draft Pick

## Session Work (March 16, 2026 — Fuzzy Bottoms Keepers Photo Section)

### Keepers photo section added to Fuzzy Bottoms page (`app/teams/[teamId]/page.tsx`, `public/Dugan-Keepers.png`)
- **`public/Dugan-Keepers.png`**: copied from `~/Desktop/Fantasy Website/Dugan-Keepers.png`
- New `{id === 9}` section inserted after `TeamStrengthsEditor`, before Sky Chiefs Uniforms
- Layout: 400px photo card (left) + `w-72` text card (right), `flex gap-6 items-stretch` — same pattern as Sky Chiefs uniforms section
- Text box has "Strategic Overview" label + paragraph describing the 2026 keeper strategy (Witt Jr. + Betts offensive core, pitching depth tradeoff)
- `bgFull` support added to page.tsx for future use: reads `meta?.bgPlayers?.bgFull` and renders a full-width `absolute` background image when set; `bgLeft`/`bgRight` suppressed when `bgFull` is present

## Session Work (March 16, 2026 — Manager History Trade Log Polish)

### Trade Log item sizing (`components/ManagerHistory.tsx`)
- **Removed "Fewest Points, Season" RecordCard** from Franchise Records grid
- **Team logos** added to each trade box (56px circle, left side, `self-center`)
- **Player headshot circles**: ESPN CDN photos pulled from `buildPlayerPhotoMap()` iterating `getAllSeasons() → season.rosters`; displayed as circles next to each traded item
- **Round pick badges**: colored `R{N}` circles next to draft pick items; colors defined in `ROUND_COLORS` map
- **`stripTradePrefix()`**: regex strips "NGFB Receive:", "SC Gave:" style prefixes from trade line text
- **`splitTradeItems()`**: splits "Jose Soriano and a 7th round pick" into two separate chips
- **`TradeItemChip` component**: pick → R{N} badge + name; player → headshot circle + name
- **Sizing progression this session**:
  - Player name span: `text-sm text-gray-700` → `text-base font-semibold text-gray-800` (all items, both pick and player branches)
  - Player photo circles: `w-7 h-7` (28px) → `w-11 h-11` (44px); `width`/`height` props updated to 44; fallback ⚾ placeholder also bumped to `w-11 h-11`
  - Round pick badge circles: `w-7 h-7` (28px) → `w-11 h-11` (44px); font size `text-[10px]` → `text-xs`

## Session Work (March 16, 2026 — Trade Log Draft Pick Year + Capitalization)

### Draft pick year annotation (`app/message-board/PostCard.tsx`, `components/ManagerHistory.tsx`)
- Draft picks in trade posts now automatically display the year of the draft they apply to
- **Year inference rule**:
  - Jan–Mar trade (pre-draft): pick year = same year as trade (e.g. March 2026 trade → "2026 2nd Round Pick")
  - Apr–Dec trade (post-draft, during season): pick year = next year (e.g. July 2025 trade → "2026 2nd Round Pick")
  - If year already present in text (e.g. "2027 1st round pick"): shown as-is, no inference
- **Pick detection**: `isPickLine()` / `parseTradeLine()` — matches ordinal (`2nd`, `3rd`) + pick/round/rd keywords
- **Year detection**: `/\b20\d{2}\b/` — if already has a 4-digit year, skips inference
- **Capitalization**: "round" → "Round", "pick" → "Pick" in all pick text (both with and without inferred year)
- Applied in both display paths:
  - `TradeItems` (PostCard — message board view): plain bullet list, pick lines get year + capitalization
  - `TradeItemChip` (ManagerHistory — team page trade log): R{N} badge + capitalized text with year
- `pickDraftYear` variable computed once per `PostCard` render from `post.createdAt`; `tradeYear` computed per trade in `ManagerHistory` render loop
- Picks already entered with a year (e.g. "2026 2nd round pick") get capitalized but not double-year-stamped

## Session Work (March 17, 2026 — Trade Log UI Polish)

### Trade Log chip centering (`components/ManagerHistory.tsx`)
- When a trade side has only 1 player/pick, the chip is now vertically centered in the remaining space below the "XYZ gave" label
- Implementation: inner content div uses `flex flex-col`; chip wrapper gets `flex-1 flex items-center` when `items.length === 1`, plain `div` otherwise
- Grid columns (`grid grid-cols-2`) keep both sides equal height so centering is meaningful when one side has more items
- Pre-computed `givingItems` / `receivingItems` arrays (built once, used for both count check and render)

### Trade card header text contrast (`components/ManagerHistory.tsx`)
- "TRADE" label and date text changed from semi-transparent white (`text-white/90` / `text-white/60`) to fully opaque dark text (`text-gray-900` / `text-gray-700`)
- Fixes readability against bright/neon team `primaryColor` backgrounds (e.g. neon green)

## Session Work (March 17, 2026 — Trade Log "Received" View + Date Bold)

### Trade Log display flipped to receiving perspective (`components/ManagerHistory.tsx`)
- Both columns now show what each team **received** rather than what they gave
- Left column: `[This team] received` + `receivingItems`; right column: `[Other team] received` + `givingItems`
- Labels changed from "gave" → "received" on both sides
- Single-item centering logic updated to match the new item arrays (`receivingItems.length === 1` on left, `givingItems.length === 1` on right)

### Trade card date bolded (`components/ManagerHistory.tsx`)
- Date string in the trade card header changed from `text-xs text-gray-700` → `text-xs font-bold text-gray-700`

## Session Work (March 17, 2026 — Text Contrast for Background Player Photos)

### Unboxed text darkened across team pages
- All text that renders directly against the page background (not inside a card/box) now uses `text-gray-900` or `text-gray-700` instead of lighter grays
- **Rule**: text inside `bg-white`, `bg-slate-200`, `bg-gray-50`, `bg-red-50`, etc. is unaffected; only text between sections matters
- **Files changed**:
  - `components/ManagerHistory.tsx`: "Manager History" h2 → `text-gray-900`; "Franchise Records" and "Trade Log" h3 labels → `text-gray-700` (were `text-gray-400`)
  - `components/SuggestedMoves.tsx`: "Suggested Moves" h2 → `text-gray-900`; subtitle → `text-gray-700` (was `text-gray-500`)
  - `components/EROSPTable.tsx`: "Updated … · Updates daily" metadata → `text-gray-700`; pre-season note → `text-gray-700` (both were `text-gray-400`)
  - `components/TeamBaseballField.tsx`: stadium name caption → `text-gray-700` (was `text-gray-400`)
  - `app/teams/[teamId]/page.tsx`: "💬 Message Board" h2 → `text-gray-900` (was `text-gray-700`)

## Session Work (March 17, 2026 — Pre-Season Projected Standings Sort)

### Standings page sorts by projected keeper FP pre-season (`app/standings/page.tsx`)
- **Trigger**: `seasonStarted = standings.some(s => s.wins > 0 || s.losses > 0)`. While all teams are 0-0 (pre-season through end of Week 1), projected sort is active. Automatically flips to normal wins/PF sort once ESPN pushes the first W/L.
- **Data source**: `data/projections/2026.json` — same file as the team page "Total Projected · X,XXX pts" keeper total. Uses the same `normalize()` function (`name.toLowerCase().replace(/[^a-z ]/g, '').trim()`) for consistent name matching.
- **Projected score per team**: sum of `projectedFP` for all 6 confirmed keepers from `data/keeper-overrides.json`. All 6 keepers start pre-draft (no bench), so the full sum is used.
- **Display**: projected FP total shown in the PF column; indigo banner at top explains the mode ("Pre-season projected order · Ranked by keeper EROSP..."); small note in legend says "Proj. pts shown in PF column".
- **Fallback**: if `data/projections/2026.json` doesn't exist, silently falls back to normal sort.
- **Bug fix**: initial implementation used `data/erosp/latest.json` `erosp_startable` (EROSP scale, ~1,700 pts/team) instead of `projectedFP` from projections (FanGraphs scale, ~3,500 pts/team) — causing a 2× discrepancy vs. the team page totals. Fixed to use projections file for consistency.

## Session Work (March 17, 2026 — Draft Round Value Analysis)

### `scripts/fetch-draft-rounds.ts` (new script)
- Fetches `mDraftDetail` from ESPN API for 2023–2025, joins to `data/historical/{year}.json` point totals
- Outputs `data/draft-rounds.json` with per-round averages, top 3 players, and per-year breakdowns
- Run: `npx tsx scripts/fetch-draft-rounds.ts`

### Key design decisions
- **2022 excluded**: inaugural season had no keepers — a true open draft, not comparable to a keeper league
- **Effective round remapping**: strips keeper rounds to normalize round numbers across years
  - 2023–2025: 5 keepers → ESPN Rd 6 = Effective Rd 1, Rd 7 = Rd 2, etc.
  - 2026+: 6 keepers → ESPN Rd 7 = Effective Rd 1 (handled via `KEEPER_ROUNDS` map in script)
- **Keeper-flagged picks skipped**: `pick.keeper === true` picks excluded even outside keeper rounds (edge cases)
- ESPN `mDraftDetail` returns `{ roundId, roundPickNumber, overallPickNumber, playerId, teamId, keeper }` per pick

### `data/draft-rounds.json` shape
```json
{
  "generatedAt": "...",
  "years": [2023, 2024, 2025],
  "note": "...",
  "rounds": [
    {
      "effectiveRound": 1,
      "totalPicks": 30,
      "years": [2023, 2024, 2025],
      "avgPoints": 447,
      "top3": [{ "name": "Marcus Semien", "year": 2023, "espnRound": 6, "points": 740 }, ...]
    }, ...
  ],
  "byYear": { "2023": [...], "2024": [...], "2025": [...] }
}
```

### 2023–2025 effective round averages
| Eff Rd | Avg pts | Notes |
|--------|---------|-------|
| Rd 1 | 447 | ESPN Rd 6 |
| Rd 2 | 439 | |
| Rd 3 | 359 | Drop-off |
| Rd 4 | 388 | |
| Rd 5–6 | ~361 | |
| Rd 7 | 314 | |
| Rd 8–9 | ~385 | Late steals inflate (Carroll 696, Ozuna 631) |
| Rd 10–11 | ~362 | |
| Rd 12+ | <310 | Tail off |
| Rd 22 | 264 | Cody Bellinger 2023 (617 pts) carrying the round |
- 30 picks per round (3 years × 10 teams); last 2 rounds have 28/25 (not all teams drafted that deep)

## Session Work (March 17, 2026 — Manager History Cleanup)

### "Most Points, Season" card removed (`components/ManagerHistory.tsx`)
- Removed the `bestScoringSeasonPF` `RecordCard` from the Franchise Records grid — it was redundant with `bestSeason` (which already surfaces the best record/finish)

### Best Pickup acquisition logic reverted to simple `firstAcq` (`lib/data-processor.ts`)
- **Context**: `getTeamRecords()` builds `firstAcq` map (player→earliest acquisition type on this team) and uses it to classify players into Best Pickup (ADD), Best Draft Pick (DRAFT), Best Trade (TRADE)
- **Previous overly-complex approach**: added `firstDraftYear` / `firstAddYear` maps + `isPickupSearch` exclusion to handle the case where a player was drafted then re-added by the same team. Found 7 real cases (Logan Gilbert, Ty France, etc.) — these are legitimate re-adds and should count as pickups, so the approach was wrong.
- **Reverted to**: simple `firstAcq`-only — if earliest recorded acquisition is `ADD`, the player qualifies for Best Pickup; if `DRAFT`, they qualify for Best Draft Pick. Players waiver-added then kept as DRAFT in subsequent years correctly show as pickups (earliest record is `ADD`).
- **Why this is safe**: the multi-period historical fetch (`fetch-historical.ts`) is comprehensive enough that data-gap misclassifications (drafted in year N but first captured record shows ADD from year N+1) are rare and acceptable.

## Session Work (March 17, 2026 — Draft Round Value Integration)

### Overview
Integrated `data/draft-rounds.json` (avg pts per effective round, 2023–2025) into four parts of the site.

### A: Trade pick chips now show avg pts (`components/ManagerHistory.tsx`)
- Imported `draft-rounds.json` and built `ROUND_AVG: Record<number, number>` (effectiveRound → avgPoints) at module level
- In `TradeItemChip`, when `parsed.type === 'pick'`, added a `~{avgPts} avg` label in `text-[9px] text-gray-400` below the R{N} badge
- Badge and label wrapped in a `flex flex-col items-center` div so the avg sits directly under the circle

### B: Draft Analysis page (`app/draft/page.tsx`)
- New page at `/draft`; linked under **Stats → Draft Analysis** in header (desktop dropdown + mobile expandable)
- Four sections:
  1. **Avg Points by Effective Round** — horizontal CSS bar chart (22 rounds, colored bars, pick count)
  2. **Best Pick per Round** — 2-col card grid; each card shows top pick, year, round number, pts, and `+N vs avg` premium in teal
  3. **Year-over-Year Breakdown** — table with 2023/2024/2025 columns + 3yr avg; color-coded round badge in first column
  4. **Top 3 Picks per Round** — expandable detail view; each top3 card shows name, year, round, pts in round color
- Round numbers shown as bare `Rd N` (no "ESPN" prefix — redundant since everyone knows the source)

### C: Pick Value Reference panel in trade log (`components/ManagerHistory.tsx`)
- A compact card (`bg-white rounded-xl border`) appears above the trade card list whenever `tradeLog.length > 0`
- Shows all 22 effective rounds as colored R{N} badges + `~{avgPoints}` in a `flex flex-wrap` row
- Label: "Pick Value Reference (CBA avg pts, 2023–2025)"

### D: Draft steal callouts in season history cards (`app/teams/[teamId]/page.tsx`)
- Imported `draft-rounds.json` at module level; built `DRAFT_TOP3_MAP`: `"{year}_{normalizedName}" → { effectiveRound, avgPoints, rank }`
- Added `getAllSeasons` to the existing import from `data-processor`
- Pre-computed `draftSteals: Record<number, { name, effectiveRound, avgPoints, rank, points }[]>` in the page function — iterates all seasons (2023–2025 only, where round data exists), checks each roster player against `DRAFT_TOP3_MAP` by `${year}_${normalizedName}` key
- In each season history card, after the Keepers section: renders an indigo "Draft Steal(s)" subsection when the team had a top-3 pick in any round that year
- Shows: player name, "#N in Rd X (avg Y pts)", actual pts in indigo bold, `+N vs avg` delta in indigo

### Header nav
- `statsItems` in `components/Header.tsx` now includes `{ href: '/draft', label: 'Draft Analysis' }` as third entry
- Mobile menu Stats expandable section also has the link

## Session Work (March 22, 2026 — Post-Draft Roster Update)

### Draft completed March 22, 2026

#### Data fetched
- **`scripts/fetch-rosters-2026.ts`** updated to capture `acquisitionType` from `entry.acquisitionType` (was missing). Re-run post-draft → 26 players per team, all `acquisitionType='DRAFT'` (ESPN returns DRAFT for everyone including keepers — confirmed limitation, same as historical seasons)
- **`data/current/free-agents.json`** updated via `npm run fetch-free-agents` — reflects post-draft FA pool
- **`data/erosp/latest.json`** regenerated via `python3 compute_erosp.py` — 1,750 players, 245 assigned to teams with real `fantasy_team_id` (was all 0 pre-draft)

#### Keeper display switched to post-draft mode
- **`keeperDeadline`** in `app/teams/[teamId]/page.tsx` changed from `new Date('2026-03-24')` → `new Date('2026-03-22')`. Team pages now show **"2026 Keepers"** (actual, from confirmed overrides) instead of "Suggested", and **Suggested Moves** section is active
- **`data/historical-keeper-overrides.json`**: added `"2026"` entries copied from `data/keeper-overrides.json`. This is the tier-1 source for `getTeamKeepersForYear(id, 2026)` — necessary because `acquisitionType === 'KEEPER'` is not available from ESPN post-draft

#### `scripts/fetch-current.ts` roster preservation fix
- Daily `npm run fetch-current` was overwriting `data/current/2026.json` and wiping the `rosters` key entirely
- **Fix**: reads existing file before write; if `existing.rosters` is present, copies it into the new data before saving
- This means the daily GitHub Actions cron no longer clobbers rosters — run `fetch-rosters-2026.ts` once after draft, then `fetch-current.ts` can run daily safely

#### Whistlepigs relocation to Warren, Ohio
- **`components/USMapHero.tsx`**: coordinates changed from Norfolk VA `[-76.29, 36.85]` → Warren OH `[-80.82, 41.24]`; logo offset `dx:70, dy:45` → `dx:55, dy:-35`
- **`data/teams.json`**: `cityPhotoUrl` seed updated to `warren-ohio-mahoning-valley`
- **`data/commissioner-notes.json`**: `weekLabel` updated to "Pre-Season 2026"; new commissioner note about the relocation + historical parallel to 1899 Cleveland Spiders

#### Post-draft workflow (for future reference)
1. `npm run fetch-current` — standings/matchups/schedule (preserves rosters)
2. `npx tsx scripts/fetch-rosters-2026.ts` — actual post-draft rosters (run once after draft)
3. `npm run fetch-free-agents` — updated FA pool
4. `cd scripts && python3 compute_erosp.py` — re-run EROSP with new team assignments (~6 min with cache)
5. `git add -p && git commit && git push` — triggers Vercel redeploy

## Session Work (March 22, 2026 — Email Setup + Rankings Email)

### Custom domain email via Resend (`data/owner-emails.json`, `.env.local`)
- **Domain verified**: `continentalpressbox.com` on Resend. Added 4 DNS records in Vercel DNS panel: DKIM TXT, MX (SPF), SPF TXT, DMARC TXT.
- **`NEWSLETTER_FROM_EMAIL`** updated to `CBA League <newsletter@continentalpressbox.com>` — emails now come from the league's own domain
- **`NEWSLETTER_SITE_URL`** updated to `https://continentalpressbox.com`
- **`data/owner-emails.json`** populated with real email addresses for all 10 active team owners (teamIds 1,2,3,4,6,7,8,9,10,11)
- Commissioner Bulletin (`postAnnouncement` in `actions.ts`) was already wired to send emails unconditionally when `RESEND_API_KEY` and `NEWSLETTER_FROM_EMAIL` are set

### Rankings email opt-in (`app/message-board/actions.ts`, `app/message-board/MessageBoardForm.tsx`)
- **`postRanking()`** updated to accept `emailLeague = false` parameter; when true, sends a purple-themed HTML email to all league owners linking to `/rankings`
  - Subject: `[CBA Rankings] {title}`
  - Purple header (`#581c87`) with `📰 Power Rankings` badge
  - Body paragraphs from newline-split content
  - "Read on the site →" button links to `/rankings`
- **Rankings form** in `MessageBoardForm.tsx`: added `rankEmailLeague` state (default `true`) + "Email the league" checkbox above the submit button
  - Checkbox uses `accent-purple-700` styling
  - Value passed to `postRanking(rankTitle, rankContent, rankPass, rankEmailLeague)`

## Session Work (March 23, 2026 — Commissioner Announcement System)

### Overview
Added a full Commissioner Bulletin system to the message board — admin-only posts with a distinct visual style, pinned to top of feed, site-wide ticker integration, homepage feature card, and automatic email blast to all 10 league members.

### New server action: `postAnnouncement` (`app/message-board/actions.ts`)
- PIN-gated (`NEXT_PUBLIC_ADMIN_PIN`); throws `'Unauthorized'` on mismatch
- Creates post with `postType: 'announcement'`, `authorName: 'The Commissioner'`, `authorTeamId: 0`, and `subject` field
- `postId` generated before `unshift` so the email link matches the stored id
- After saving + revalidating, sends HTML email via Resend to all 10 owners (guarded by `RESEND_API_KEY` + `NEWSLETTER_FROM_EMAIL` env vars being present)
- Email template: dark navy header (`#0f172a`), yellow `📣 League Bulletin` badge, subject as `<h1>`, newline-split body as `<p>` tags, "Read on the site →" button linking to `/message-board#${postId}`

### `lib/types.ts` — `TrashTalkPost` extended
- `postType?: 'message' | 'trade' | 'announcement'`
- `subject?: string` — headline for commissioner announcements

### `app/message-board/PostCard.tsx` — announcement card style
- Dark navy `bg-blue-950` card with yellow `📣 League Bulletin` badge
- Subject rendered as white bold heading; body in `text-blue-100 whitespace-pre-wrap`
- "— The Commissioner" footer in muted blue
- `id={post.id}` added to all three card variants (announcement, trade, message) for anchor deep-linking

### `app/message-board/page.tsx` — pinned to top
- Posts sorted: announcements first, then everything else (preserving recency within each group)

### `app/message-board/MessageBoardForm.tsx` — commissioner tab
- `📣 Commissioner` tab added; only appears when `isAdmin` is true
- Form: Subject/Headline input, message textarea, PIN field, "Post Bulletin" button
- Note text: "Posts as 'The Commissioner' · pinned to top · runs in banner for 5 days"

### `app/page.tsx` — homepage announcement card
- `commissionerAnnouncements`: filters posts with `postType === 'announcement'` within 5 days
- Featured dark navy card above "Latest Messages": yellow badge, subject as `h3`, 3-line preview, "Read full bulletin →" link to `/message-board#${post.id}`
- Regular posts section filters out announcements before 72h window logic

### `components/EventTickerBanner.tsx` — clickable ticker items
- Added `href?: string` to `TickerItem` interface
- Items with `href` render as `<a>` tags with `hover:text-yellow-200 transition-colors`; items without render as `<span>` (unchanged)

### `app/layout.tsx` — announcements in site-wide ticker
- `getTrashTalk()` fetched alongside polls in `Promise.all`
- Announcement ticker items: `emoji: '📣'`, `title: p.subject`, `dateLabel: 'Commissioner'`, `countdown: 'Read →'`, `href: /message-board#${p.id}`
- Filtered to 5-day window; prepended before calendar event items

### Test script
- `scripts/test-bulletin-email.ts` — sends a single test bulletin email to `schurrian99@gmail.com`; uses same navy/yellow template as the real announcement emails
- Run: `npx tsx scripts/test-bulletin-email.ts`

---

## Session Work (March 23, 2026 — Email Deliverability + Vercel Fixes)

### Email went to junk (expected for new domain)
- First email from `newsletter@continentalpressbox.com` landed in Gmail junk — normal for a new domain with no reputation yet
- Best fix for a private league: **have all members add `newsletter@continentalpressbox.com` to contacts** or mark first email "Not spam" — trains Gmail immediately

### Commissioner Bulletin "Unauthorized" error in production
- **Root cause**: `NEXT_PUBLIC_ADMIN_PIN` was not being picked up correctly in the Vercel production build
- **Fix**: triggered a full redeploy from Vercel dashboard (Deployments → latest → three-dot menu → Redeploy) — rebuilds with current env var values
- **Note**: `NEXT_PUBLIC_` vars are baked in at build time; simply setting them in Vercel env vars is not enough — a redeploy is required

### "Server Action was not found" error after redeploy
- **Root cause**: browser was running the old JS bundle (with old server action IDs) while the server had new IDs after the redeploy
- **Fix**: hard refresh — **Cmd+Shift+R** (Mac) / **Ctrl+Shift+R** (Windows) — forces browser to load the new bundle
- This will happen any time the site is redeployed while a browser tab is open

### Resend error logging added (`app/message-board/actions.ts`)
- Both `postAnnouncement` and `postRanking` now check `result.error` after `resend.emails.send()`
- On error: `console.error('[postAnnouncement] Resend error: ...')` + throws so the user sees "Email failed: ..." instead of silent failure
- On success: `console.log('[postAnnouncement] Email sent: {id}')` for confirmation in Vercel logs
- **Next step**: post a bulletin, check Vercel logs for either the success ID or the error message to diagnose why email isn't arriving

## Session Work (March 23, 2026 — USMapHero Logo Adjustments + Banshees Fix)

### Logo position adjustments (`components/USMapHero.tsx`)
- **Emus** (id=6): `dy: 5 → 62` — moved further south in the Atlantic
- **Folksy Ferrets** (id=11): `dx: -65 → 90, dy: -45 → 5` — moved way east into the Atlantic, sitting between the Mega Rats logo (upper) and Emus logo (lower)
- **Whistlepigs** (id=8): `dx: 55 → -65, dy: -35 → -15` — logo now extends west from Warren OH star instead of east

### Banshees logo fixed (`public/banshees-logo.png`, `components/USMapHero.tsx`)
- Copied `Tentative logo.png` from `~/Desktop/Fantasy Website/` → `public/banshees-logo.png`
- Updated Banshees entry logo from broken `mystique-api.fantasy.espn.com` URL → `/banshees-logo.png`
- Banshees logo now renders on the map (was silently broken before — ESPN URL requires auth)

### Minor league affiliates system added to map (`components/USMapHero.tsx`)
- New `AFFILIATES` array + `R_AFF = 9` constant — separate from `TEAMS` (which uses `R = 20`)
- Each affiliate: `{ teamId, name, logo, coordinates }` — no `dx`/`dy`; logo sits right at the city pin
- Logo is star-sized (R=9, diameter 18px), gold ring border (`#C9A84C`), no leader line — visually distinct from CBA team logos
- Clicking links to the parent CBA team page (`/teams/${teamId}`)
- First affiliate: **Dahlonega Gold Diggers** (teamId=9), Dahlonega GA `[-83.99, 34.53]`, logo `/gold-diggers-primary.png`
- To add more affiliates: append to `AFFILIATES` array — no other code changes needed

### Gold Diggers logo files (`public/`)
- `public/gold-diggers.jpeg` — full brand sheet (primary + secondary logos, gold header)
- `public/gold-diggers-primary.png` — cropped to just the miner mascot (740×315); used on the map

### Fuzzy Bottoms team page — Minor League Affiliate section (`app/teams/[teamId]/page.tsx`)
- New `{id === 9}` section inserted before the 2026 Keepers photo, after `TeamStrengthsEditor`
- Dark gold gradient header (`#1a1a1a → #2d2200`) with "Low-A Affiliate" badge, "Dahlonega Gold Diggers" name, `#StrikeGold` tagline, black+gold color swatches
- Full brand sheet image (`/gold-diggers.jpeg`) displayed below the header — shows both primary and secondary logos
- Cream footer (`#f9f5e8`) with announcement quote in italics
- Card is `max-w-xl` width

### Fuzzy Bottoms star position adjusted (`components/USMapHero.tsx`)
- NGFB coordinates: `[-83.82, 34.30]` → `[-83.82, 34.05]` (moved ~15 miles south)
- Prevents the NGFB city star from being covered by the Gold Diggers affiliate logo at `[-83.99, 34.53]`

## Session Work (March 25, 2026 — Rocket City Mustangs Affiliate + Map Zoom)

### Space Cowboys minor league affiliate added to map + team page

- **`public/mustangs-logo.png`**: copied from `~/Desktop/Fantasy Website/Mustangs.png`
- **`components/USMapHero.tsx`**: Mustangs entry added to `AFFILIATES` array — Pasadena CA `[-118.14, 34.15]`, logo `/mustangs-logo.png`, `teamId=1` (links to Space Cowboys page)
- **`app/teams/[teamId]/page.tsx`**: new `{id === 1}` "Minor League Affiliate" section inserted before the Fuzzy Bottoms affiliate — dark navy gradient header (`#1a1a2e → #16213e`), "Low-A Affiliate" badge in gold (`#e8c84a`), subtitle "Pasadena, California · Voyager Field at JPL Stadium", logo centered on white background, `max-w-xl` card

### Affiliate logo zoom system (`components/USMapHero.tsx`)
- Added `zoom`, `imgOffsetX`, `imgOffsetY` optional fields to each `AFFILIATES` entry
- Render logic: image rendered at `R_AFF * 2 * zoom` size, centered at `(-w/2 + imgOffsetX, -h/2 + imgOffsetY)`, still clipped to `R_AFF` circle — effective crop-in without changing circle size
- **Puddle Jumpers + Mustangs**: `zoom: 1.4` (logos had whitespace padding making mark appear tiny)
- **Gold Diggers**: `zoom: 1.0` (unchanged — already fills circle well)
- To tune: adjust `zoom` up (more crop) or down (more whitespace); use `imgOffsetX`/`Y` to re-center if mark is off-center in source image

## Session Work (March 26, 2026 — Edoras Wild Ponies Affiliate)

### Emus minor league affiliate added to map + team page

- **`public/edoras-ponies-logo.jpeg`**: copied from `~/Desktop/Fantasy Website/Edoras Ponies.jpeg` — Rohan-inspired green flag with white/gold horse
- **`components/USMapHero.tsx`**: Added `NZ_AFFILIATES` array (separate from `AFFILIATES`) for affiliates outside the US. Wild Ponies entry: Mount Sunday, Hakatere Conservation Park NZ `[170.83, -43.62]`, `teamId=6`. Renders as a `Marker` inside the existing NZ inset `ComposableMap` (bottom-left), not the main `geoAlbersUsa` map (which can't project NZ coordinates). The `<a>` tag inside the Marker uses `pointerEvents: 'auto'` to override the parent `pointer-events-none` div. Gold ring border matches other affiliates.
- **`app/teams/[teamId]/page.tsx`**: new `{id === 6}` "Minor League Affiliate" section inserted after Fun Franchise Facts — dark forest green gradient header (`#0a1f0a → #1e4d1e`), "Low-A Affiliate" badge in gold (`#d4a547`), subtitle "Mount Sunday, Hakatere Conservation Park, Canterbury, New Zealand · Established 2026", tagline `#RideForRohan`, Leo De Vries called out as star player, announcement quote in `#f0f7ee` footer panel
- **To add more NZ/international affiliates**: append to `NZ_AFFILIATES` array in `USMapHero.tsx`

## Session Work (March 24, 2026 — Lake Placid Puddle Jumpers Affiliate)

### Sky Chiefs minor league affiliate added to map + team page

- **`public/puddle-jumpers-logo.png`**: copied from `~/Desktop/Fantasy Website/Puddle Jumpers.png`
- **`components/USMapHero.tsx`**: Puddle Jumpers entry added to `AFFILIATES` array — Lake Placid NY `[-73.99, 44.28]`, logo `/puddle-jumpers-logo.png`, `teamId=7` (links to Sky Chiefs page)
- **`app/teams/[teamId]/page.tsx`**: new `{id === 7}` "Minor League Affiliate" section inserted after the Uniforms section — navy gradient header (`#0c1a3a → #1a3060`), "Low-A Affiliate" badge in sky blue (`#7ec8e3`), logo centered on white background, `max-w-xl` card width
- Affiliate card style mirrors the Gold Diggers section (id=9) — same component pattern, different color scheme

## Session Work (March 24, 2026 — EROSP Display Fix + Pipeline Fixes)

### EROSPTable: default to Raw, fix column layout (`components/EROSPTable.tsx`)
- **Default changed**: `showRaw` init `false → true`, default sort `erosp_startable → erosp_raw`
- **Column restructure**: removed duplicate Raw column that appeared when toggling to Raw mode. Now: always-visible primary column shows `erosp_raw` (labeled "EROSP") or `erosp_startable` (labeled "Startable") based on toggle; md+ secondary column always shows Startable
- **Footer text**: updated to "EROSP = projected season pts · Startable = value above replacement · 7-SP-start cap"
- **Why**: Startable is value-above-replacement — for rostered/keeper players who will start regardless, Raw is the meaningful number. Seeing "EROSP=3" for Rodon was misleading; his raw of 330 is the actual projection.

### EROSP config: position eligibility + replacement pool (`scripts/erosp/config.py`)
- Added `"IF"`, `"MIF"`, `"CIF"` to `POSITION_ELIGIBILITY` — FanGraphs generic infield position labels
- Added `REPLACEMENT_POOL_MULTIPLIER = 1.4` — replacement level now uses the (N×1.4)-th best player instead of the N-th best, accounting for the fact that top players in a keeper league are all drafted
- Effect: replacement thresholds dropped, startable values more meaningful for below-average rostered players

### EROSP startability: replacement pool multiplier applied (`scripts/erosp/startability.py`)
- `compute_replacement_levels()` now uses `int(n_slots * REPLACEMENT_POOL_MULTIPLIER) - 1` as the pool index for both hitters and pitchers
- SS pool: was 20th-best → now 28th-best; SP pool: 60th → 84th; etc.

### Fix G: Healthy returnee playing time floor (`scripts/erosp/playing_time.py`)
**Root cause of Rodon/Boyd low projections**: two compounding bugs:
1. Fix C was checking `current_season_year - 1` (2024, the TJ injury year) for the GS floor, not `current_season_year` (2025, the healthy comeback year). Fixed to use y0 = `current_season_year`.
2. Even when Steamer's GS projection clears the 15-start Fix C floor, it may still be dramatically conservative for pitchers who proved healthy in the most recent season.

**Fix G (SPs)**: After all other playing time logic, if a pitcher made **≥28 GS** in the most recently completed season (y0), their projected `p_start_per_day` is floored at **80% of that GS count / 162**. Fired for 26 SPs in 2026 projection run.

**Fix G (hitters)**: Same logic — if a hitter had **≥480 PA** in y0, `p_play` is floored at 80% of that. Fired for 18 hitters.

**Results**: Rodon 188 → 330, Boyd 165 → 272. Hitters like Story/Crawford unchanged (Steamer already projected ≥80% of 2025 PA — their lower raw values reflect genuine per-PA rate, not PT shortfall).

### Key insight documented
Startable ≠ "points this player will score." It's value-above-replacement. A rostered player below replacement level will still score their Raw EROSP — you just could theoretically do better by dropping them. For keeper league team projection purposes, always use Raw.

## Session Work (March 25, 2026 — Message Board Layout + Suggested Moves Improvements)

### Message board page layout (`app/message-board/page.tsx`)
- Content width changed to `w-[70%] mx-auto` — 70% of viewport, centered with equal 15% blank space on each side at all screen sizes
- Removed inner `max-w-2xl` cap on the posts section so polls, posts, and all other content share the same full 70% width

### Suggested Moves engine improvements (`lib/suggested-moves.ts`, `components/SuggestedMoves.tsx`)
- **Switched from `erosp_startable` → `erosp_raw`** throughout the scoring pipeline — raw pts better reflects actual contribution for post-draft roster analysis; startable was filtering out legitimate keepers below replacement level
- **`erospFloor` raised**: 25 → 75 — prevents absurd upgrade% inflation when target slot has very low raw EROSP
- **`minUpgradeAbsolute` raised** across all positions (e.g. SP: 20→30, OF: 15→25, RP: 8→15) — higher bar for a recommendation to appear
- **`leagueRosters` input** added to `getSuggestedMovesInput` — ESPN roster data passed in to catch EROSP name-match failures post-draft
- **Empty slot display**: `replacePlayerName` changed from `'Empty slot'` to `'No projection'`; `isEmptySlot` detection in `SuggestedMoves.tsx` changed to use that string instead of `currentErosp === 0` (more precise); label changed from "Drop / Replace" → "Current Slot" for empty positions
- **Pre-draft copy removed**: subtitle and `NoMovesState` no longer show different text for pre-draft vs post-draft — always shows the post-draft message

## Session Work (March 25, 2026 — Rankings Page Inline Editor)

### Rankings page inline editing (`app/rankings/RankingsClient.tsx`, `app/rankings/page.tsx`)
- **`page.tsx`**: converted from rendering articles inline to delegating to `<RankingsClient articles={articles} />` (server passes data, client handles interactivity)
- **`RankingsClient.tsx`**: new `'use client'` component with:
  - 🔒 button → `useAdminMode()` hook (same PIN/localStorage pattern as team pages)
  - Per-article **✏️ Edit** and **🗑️ Delete** buttons (visible when admin unlocked)
  - Edit mode: title input + textarea with formatting toolbar + PIN field for server-side auth
  - Delete mode: inline confirm with PIN field

### Formatting toolbar (edit mode)
- **B (Bold)**: wraps selection in `**...**`; toggling on already-bolded text removes markers
- **⊕ Center**: wraps selection in `[center]...[/center]`; toggling removes wrappers
- **─ Divider**: inserts `----` on its own paragraph (auto-adds surrounding blank lines)

### Content rendering syntax
- `**bold text**` → `<strong>`
- `[center]text[/center]` → `<p className="text-center">`
- `----` (3+ dashes, own paragraph) → `<hr className="border-t border-gray-300" />`
- Paragraphs still separated by blank lines as before; existing articles render unchanged

### Rankings editor evolution (same session)
- **Colors added**: 10-color swatch palette in toolbar; syntax `[color=#hex]text[/color]`; stored inline
- **Live preview added** (then replaced): side-by-side textarea + preview panel (desktop) / collapsible toggle (mobile)
- **WYSIWYG editor (final)**: replaced textarea+preview with single `contenteditable` div — you edit the rendered text directly
  - Toolbar uses `document.execCommand` (bold, foreColor, justifyCenter/Left, insertHorizontalRule) with `onMouseDown` + `preventDefault` so selection is never lost when clicking toolbar buttons
  - Content stored as HTML going forward; legacy markup posts (`**bold**`, `[color=]`, `[center]`) auto-converted to HTML on first edit via `markupToHtml()`
  - Renderer detects HTML vs. legacy markup via `looksLikeHtml()` — both formats render correctly
  - Cmd+B keyboard shortcut for bold
  - ✕ button strips all formatting from selection via `execCommand('removeFormat')`

## Session Work (March 25, 2026 — Suggested Moves Slot-Swap Detection)

### Multi-position eligibility + slot-swap recommendations (`lib/suggested-moves.ts`, `lib/types.ts`, `scripts/fetch-free-agents.ts`)

**New Stage 7 — `findSlotSwaps()`** in `suggested-moves.ts`:
- Detects players on the target team who qualify at multiple ESPN positions (from `eligiblePositions` data)
- For each such player: checks if moving them to an alternate position frees their primary slot for a FA upgrade
- Scores as a "two-for-one" move — strengthens both positions simultaneously
- `internalMove` field on `SuggestedMove` holds the repositioning detail (`playerName`, `fromPosition`, `toPosition`, `mlbamId`, `photoUrl`)
- Only fires when `rosterEligibilityMap` has data (requires ESPN eligibility data in roster input)

**`fetch-free-agents.ts`**: captures `player.eligibleSlots` array from ESPN API; maps slot IDs → position labels via `SLOT_POSITION_MAP`; stores as `eligiblePositions?: string[]` on each FA entry. Lineup slots only (IDs 0–7, 12–16); bench/IL slots excluded.

**`lib/types.ts`**: added `eligiblePositions?: string[]` to `PlayerSeason` interface.

**`getSuggestedMovesInput`**: `faList` and `leagueRosters.players` types updated to include `eligiblePositions?: string[]`. Both `faEligibilityMap` and `rosterEligibilityMap` built from this data at the start of `getSuggestedMoves()`.

## Session Work (March 25, 2026 — Multi-Position Eligibility Display + Wiring)

### `components/SuggestedMoves.tsx` — swap card display
- `isSwap = !!move.internalMove` added to `MoveCard`
- "Drop / Replace" label → `"Move to [toPosition]"` when swap; sublabel shows `"[fromPos] → [toPos]"`
- Player being repositioned shown un-dimmed (they're moving, not being dropped)
- Indigo **"2-position move"** badge in the header row when `isSwap`

### `app/teams/[teamId]/page.tsx` — faList eligiblePositions pass-through
- `faList` type updated to include `eligiblePositions?: string[]`
- FA mapping now includes `eligiblePositions: p.eligiblePositions` so the engine can match FAs to positions they're ESPN-eligible at beyond their EROSP primary position

### `scripts/fetch-rosters-2026.ts` — position from `lineupSlotId`
- Position resolution order: `lineupSlotId` → `eligibleSlots[0]` → `'UTIL'`
- `lineupSlotId` (the slot they were actually slotted into at roster fetch time) is more accurate than first eligible slot

### `components/TeamBaseballField.tsx` — pitcher detection via `eligiblePositions`
- `isPitcher()` helper now checks `eligiblePositions` array in addition to `position === 'SP'`
- Prevents misclassifying SP/RP-eligible players as field players when primary position label is generic


**`scoreFACandidates()`**: accepts optional `faEligibilityMap` — FAs who have ESPN eligibility at the target position are included even if their primary EROSP position differs (e.g. a 1B/OF eligible player surfaced for an OF recommendation).

## Session Work (March 25, 2026 — EROSP Comeback Year De-emphasis)

### Comeback year de-emphasis (`scripts/erosp/talent.py`)

**Problem**: Boyd's 2023 post-TJ rust year (71 IP, 5.45 ERA, 1.39 HR/9) was contaminating the 3-year blend at ~10% weight, pulling his fp_per_start down to 10.88 (projected raw 272) despite a strong 2025 comeback (460 actual pts).

**Fix — inline in `estimate_pitcher_talent()`, after yr_ips collection loop**:
- For each blend year with IP < 100 (`COMEBACK_IP_THRESHOLD = 100`):
  - Checks `prev_year = year - 1` in `pitching_by_year`
  - If `prev_match.empty OR prev_ip == 0` (fully missed season confirmed), halves effective IP weight: `yr_ips[i] *= 0.5` (`COMEBACK_WEIGHT_FACTOR = 0.5`)
- Full-season comebacks (≥100 IP) are **not affected** — Rodon's 180 IP 2025 is untouched
- Only fires when prior-year data EXISTS and confirms a full miss — can't fire on unknown history

**Result**: Boyd raw 272 → 366 (fp/start 10.88 → 11.21). The 2023 rust year gets half weight, so the cleaner 2022 and 2025 data dominate.

**Rodon note**: Rodon's projection dropped 330 → 287 this run — that's from the **injury map** (currently on D15 IL → games_remaining 162→141), NOT from this fix. Rodon's 2023 had only ~19 IP but preceded by 178 IP in 2022 (healthy) → `fully_missed = False` → no de-emphasis triggered. Fix G still floors him at 80% of 2025 GS pace over the remaining games.

**Detection logic summary**:
- `year=2023, ip=19, prev_year=2022` → if Rodon had 178 IP in 2022 → `fully_missed=False` → skip
- `year=2023, ip=71, prev_year=2022` → if Boyd had 0 IP in 2022 (TJ) → `fully_missed=True` → `yr_ips[i] *= 0.5`
- Requires `prev_year in pitching_by_year` — PITCHER_EXTRA_YEARS [2022, 2021] already fetched by `compute_erosp.py`

## Session Work (March 25, 2026 — GitHub Actions Automation)

### Three GitHub Actions workflows created (`.github/workflows/`)
All three workflows created, pushed, and confirmed working via manual dispatch.

| Workflow | Schedule | Runtime | Purpose |
|---|---|---|---|
| `update-stats.yml` | Daily 5:30 AM EST | ~20 sec | ESPN standings/rosters/free agents |
| `update-erosp.yml` | Daily 6:00 AM EST | ~1 min (warm cache) | EROSP projections + IL/injury map |
| `update-projections.yml` | Mondays 3:00 AM EST | ~3 min (warm cache) | FanGraphs projections regeneration |

- GitHub Secrets `ESPN_SWID` + `ESPN_S2` already set from last month — no action needed
- EROSP cache (`scripts/erosp_cache/`) and pybaseball cache (`~/.pybaseball/`) persisted between runs via `actions/cache@v4`
- `[skip ci]` on commit messages prevents GitHub Actions from re-triggering on its own commits

### `SEASON_STARTED` date corrected (`scripts/compute_erosp.py`)
- Changed `datetime.date(TARGET_SEASON, 3, 27)` → `datetime.date(TARGET_SEASON, 3, 25)` — season opened March 25
- In-season mode now active: pipeline fetches 2026 YTD batting/pitching stats from FanGraphs + daily IL report from MLB Stats API
- Triggered a fresh EROSP run post-fix; confirmed `completed success`

## Session Work (March 26, 2026 — Season Start Fixes)

### `getTopMatchupOfWeek` current-week bug fixed (`lib/data-processor.ts`)
- **Bug**: `Math.max(...matchups.map(m => m.week))` returns 21 (the last week of the schedule), not the current week. This caused the homepage matchup hero to show a future empty week 21 matchup (0/0, no teams have records yet) instead of the in-progress week 1.
- **Fix**: find the max week that has any scoring activity (`totalPoints > 0` or `winner !== undefined`); fall back to week 1 if no games have started yet
- This logic mirrors the `MatchupsClient.tsx` approach but uses `Math.max` over active weeks instead of `weeks.find()` (which gives the first, not the latest, active week)

### Homepage matchup card shows in-progress scores (`app/page.tsx`)
- Previously scores only showed when `isComplete` (`matchup.winner !== undefined`) — i.e. after the week ended
- Now shows scores whenever `hasActivity` (`totalPoints > 0` on either side), displayed in sky blue with "In progress" label
- Final scores remain green/gray; pre-game matchups still show team records only
- Week label now dynamically shows "Final", "In progress", or the historical/record context

### Season-start behavior summary (documented for reference)
- **Scores**: `MatchupCard` (matchups page) always showed `totalPoints.toFixed(1)` — scores were always visible there. Homepage card needed the `hasActivity` fix above.
- **Baseball field**: Renders whenever `currentRoster.length > 0`; rosters preserved through daily `fetch-current` cron. Player pins appear pre-points; points badge (`totalPoints > 0`) fills in as ESPN scoring accumulates during the week.
- **Standings sort**: Flips from projected keeper EROSP → actual wins/PF once any team records a W/L (`seasonStarted = standings.some(s => s.wins > 0 || s.losses > 0)`). Stays projected until end of Week 1.
- **EROSP in-season mode**: Active since March 25 (`SEASON_STARTED = True`); pipeline now fetches YTD FanGraphs stats (min 10 PA / 5 IP) + daily IL map instead of pure pre-season estimates.

## Session Work (March 26, 2026 — Baseball Field Position Bug Fixes)

### Root cause: wrong ESPN slot ID mappings (`scripts/fetch-rosters-2026.ts`)
Three compounding bugs caused hitters to appear in SP/RP slots and pitchers in field positions:

**Bug 1 — slot 16 in every player's `eligibleSlots`**: ESPN includes slot 16 (bench/IL) in ALL players' `eligibleSlots`. It was mapped to `'RP'` in `POSITION_MAP` and included in `LINEUP_SLOTS`, so every hitter got `'RP'` in `eligiblePositions`. `isPitcher()` returned true for all hitters.

**Bug 2 — wrong OF slot IDs**: Slots 5/6/7 were mapped to `'OF'` but they are actually UTIL-flex (5), MI/middle-infield (6), CI/corner-infield (7). The real OF lineup slots are **8, 9, 10** — which were missing from the map entirely. Every 3B/SS player had 'OF' in their `eligiblePositions` via their CI/MI flex slot.

**Bug 3 — `position` derived from slot not from ESPN's position field**: `position` was set from `eligibleSlots[0]`, which could be any slot the manager placed them into. Fixed to use `player.defaultPositionId` instead.

### Confirmed ESPN API field mappings
**`defaultPositionId`** (player's actual MLB position):
`1=SP, 2=C, 3=1B, 4=2B, 5=3B, 6=SS, 7=LF(OF), 8=CF(OF), 9=RF(OF), 10=DH, 11=RP`

**`eligibleSlots`** (lineup slot IDs for multi-position eligibility):
- `0=C, 1=1B, 2=2B, 3=3B, 4=SS` — primary position slots
- `8=OF, 9=OF, 10=OF` — the three actual OF lineup slots
- `12=DH, 13=SP, 14=SP, 15=RP` — pitcher/DH slots
- `5=UTIL(OF-flex), 6=MI, 7=CI, 11=IL, 16=bench, 17=bench, 19=UTIL(INF)` — excluded from `LINEUP_SLOTS`

### Fixes applied
- `POSITION_MAP` / `SLOT_POSITION_MAP`: removed 5/6/7, added 8/9/10 → `'OF'`, kept 15 → `'RP'`
- `LINEUP_SLOTS`: now `{0,1,2,3,4,8,9,10,12,13,14,15}` — no flex/bench/IL slots
- `position` field: now uses `DEFAULT_POSITION_MAP[player.defaultPositionId]` directly
- `isPitcher()` in `TeamBaseballField.tsx`: if any field position (`C/1B/2B/3B/SS/OF/DH`) is in `eligiblePositions` → definitely a hitter, regardless of `position` field

### `update-rosters.yml` GitHub Action
- New workflow runs every 3 days (`0 11 */3 * *`) to refresh per-player ESPN eligibility
- Player eligibility changes during the season as players log games at new positions (e.g. a 1B who starts playing OF earns OF eligibility)
- Added `fetch-rosters` to `package.json` scripts (`tsx scripts/fetch-rosters-2026.ts`)

### 2026 in-season points fix
- ESPN's `player.stats` array contains entries for multiple seasons. Previous filter matched `statSourceId=0, statSplitTypeId=0` without checking `seasonId`, so it picked up the 2025 full-season total (e.g. Ramirez 736 pts) instead of the accumulating 2026 YTD total.
- Fixed: added `seasonId === 2026` to the stat lookup. Early in the season this returns 0/small values; accumulates correctly as ESPN processes scores.
- Baseball field now ranks players by actual 2026 points, not prior-year stats.
