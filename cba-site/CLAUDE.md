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
- `getCurrentSeason()` returns the current-year JSON; switches to new year on **March 20**
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
- **Season cutover date**: `getCurrentSeason()` in `lib/data-processor.ts` now switches to the new year on **March 20** (was March 15). After draft, run "Update Stats" from Actions tab to pull fresh ESPN rosters immediately rather than waiting for the nightly 5:30 AM EST cron.

## Key Gotchas
- ESPN roster data: all pitchers use 'SP' slot (no 'RP'), UTIL = OF + DH
- MLB Stats API `fields` param: must list nested fields explicitly (e.g., `primaryPosition,abbreviation` not just `primaryPosition`)
- `getCurrentSeason()` returns 2025 until March 20 — use separate year computation for projection headings
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
