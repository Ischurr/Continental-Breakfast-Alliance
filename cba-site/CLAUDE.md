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
- `getCurrentSeason()` returns the current-year JSON; switches to new year on **March 15**
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
- `getCurrentSeason()` returns 2025 until March 15 — use separate year computation for projection headings
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

#### `app/message-boar#### `app/message-
-------------com-------------com--- ful-------------com------------ility
- Accepts `activePolls` and `closedPolls` arrays as props
- Manages local- Manages local- Manages local- Manages local- ei- Manages local- Manages local- Manages local- Manages local- ei- Mann; shows edit buttons on active poll cards when admin is unl- Manages local- Manages local- Manages local- Manages local- onEdit` callback
- Inline `PollAdminForm` appears below poll list when admin is editing a poll
- On for- On for- On for- On for- On for- On for- On for- On for- On for- On for-le- On for- On for- On for- On for- On for- On for- On for- On for- On for- On for-le- On for- On for- On for- OAdmin- On for- On for- On for- On for- On for- On for- On for- On fo 'rankings' | 'polls'`
- **Updated props**: now accept- **Updated props**: now accept- **Updated props**: now accept- **Updated props**: now accept- **Updated prop= - **Updated props**: now accept- **Updated props**: now accept- **Updateding polls
  - If not admin: displays message  - If not admin: displays message  - If not admin: displays message  -fo  - If not admin: displays message  - If not admin: disdde  - If not admin: displays message  - If not admin: displays message  - If not admin: displays message  -fo  - If not admin: displays message  - If not admin: disdde  - If not admin: displays message  - If not admin: displays message  - If not admin: displays message  -e UI (once at top, once in post box); now consolidated
- `PollsViewer` handles b- `PollsViewer` handles b- `PollsViewer` handles b- `PollsViewer` handles b- `PollsViewer` handles b- `PollsViewer` handles b- `PollsViewer` handles b- `PollsViewer` handles b- `PollsViewer` handles b- `PollsViewer` handles b- `PollsViewer` handles b- `PollsViewer` handles b- `Pollst `password` parameter
  - Throws `'Unauthorized'` if PIN doesn't match
  - Revalidates both `/polls` and `/message-board` paths after creation

- **Updated `updatePoll()` function**:
  - Added server-side PIN validation (same pattern as createPoll)
  - Password parameter passed by client from PollAdminForm
  - Revalidates `/polls` and `/message-board`

- **Updated `deletePoll()` function**:
  - Added server-side PIN validation
  - Revalidates `/polls` and `/message-board`

- **Unchanged**: `castVote()` action (voting remains open to all users, no PIN needed)

#### `app/rankings/actions.ts`
- **Updated all three functions**: `postArticle()`, `editArticle()`, `deleteArticle()`
- **Changed auth mechanism**: now uses `NEXT_PUBLIC_ADMIN_PIN` (was previously checking a different env var)
- **Added validation**: `const adminPin = process.env.NEXT_PUBLIC_ADMIN_PIN ?? ''; if (!adminPin || password !== adminPin) throw new Error('Unauthorized');`
- Makes ranking posts consistent with polls — both now share the same PIN authentication schem- Makes ranking posts consistent with polls —` - Makes ranking posts consistent with polls — both now share the sations, but `Poll` interface already had required `createdAt: string` field
- Confirms all poll objects must i- Confirms all poll objects must i- Confirms all poll oFlow- Confirms all poll objects must i- Confirms po- Confirms all poll objects mu→ `castVote()` server action
2. Vote counts 2. Vote counts 2. Vote counts 2. Vote countstat2. Vote counts 2. Vote counts 2. Vote counts 2. Vote countstat2. Vote counts 2. Vote nly)**
1. Click 🔒 Admin button on `/message-board` → prompted for PIN
2. If correct PIN entered: button changes to s2. If correct PIN entered: button changes to s2. If correct PIN entered: button changes to s2. If correct  fo2. If correct PIN entered: button changes to s2. If correct PIN entered: button changes to s2. If correct PIN entered: button changes to s2. If correct  fo.j2. If correct PIN entered: button changes to s2. If correct PIN entered: button changes to s2. If correct PIN entered: button changes to s2. If correct  fo2. If correct PIN entered: button changes to s2. If correct PIN entered: button changes to s2. If correct PIN entered: button chanserv2. If correct PIN entered: button changes to s2. If correct PIN entered: button changes to s2. If correct PIN entered: button changes to s2. If correct  fo2. If correct PIN entered: button changes toed from feed

### PIN Security Notes
- PIN stored in `NEXT_PUBLIC_ADMIN_PIN` environment variable (same as team page editor PIN)
- **Must be alphanumeric** — special chars like `$` get shell-expanded by dotenv parser
- Client-side storage: localStorage key `cba_admin_mode` set to `'1'` after correct PIN entry
- Server-side validation on all poll mutations (create, update, delete)
- Ranking posts (articles) now use same PIN instead of separate auth method
- No user database — PIN-based access is sufficient for trusted league group

### Known Limitations & Notes
- **`createdAt` field**: All polls now require this field. New polls auto-populate with current ISO timestamp. Existing polls in `polls.json` missing this field will cause TypeScript errors on edit/delete.
- **Mobile responsive**: PollCard, PollAdminForm, and PollsViewer all use Tailwind responsive utilities (work on mobile)
- **Closed polls**: Still appear in feed with results visible, but voting buttons are disabled (`active: false`)
- **Concurrent edits**: No conflict prevention — if two admins edit the same poll simultaneously, last write wins
- **Admin state**: Persists in localStorage; cleared when user closes browser or manually deletes localStorage

### Deployment Status
- Code pushed to `main` branch on GitHub
- Vercel deployment triggered automatically
- Build error fixed: added missing `createdAt` field to poll creation (commit `2855460`)
- Site live at: `https://continental-breakfast-alliance.vercel.app/message-board`
