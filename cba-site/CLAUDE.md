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
- **Rankings page cleanup**: removed `AdminArticleForm` from `app/rankings/page.tsx`. Empty state now shows a styled card: "No new rankings for the season yet. First ranking expected after the keepers deadline." New articles are intended to come from the message board with a Rankings category.
- **Automated projections via GitHub Actions**: `.github/workflows/update-projections.yml` replaces the local crontab approach. Runs every Monday 3 AM EST, regenerates `scripts/fantasy_projections_2026.csv` and auto-commits if changed. No ESPN secrets needed.

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
