import Header from '@/components/Header';
import { getCurrentSeason, getAllSeasons, calculateAllTimeStandings, getTeamHeadToHead, getTeamSeasonHistory, getTeamTopPlayersAllTime, getTeamTopPlayerForYear, getTeamKeepersForYear, getSuggestedKeepers, getTotalUniquePlayersEmployed, getTeamRecords } from '@/lib/data-processor';
import ManagerHistory from '@/components/ManagerHistory';
import teamsMetadata from '@/data/teams.json';
import keeperOverrides from '@/data/keeper-overrides.json';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { TrashTalkData } from '@/lib/types';
import { getTrashTalk, getTeamContent } from '@/lib/store';
import { TeamBioEditor, TeamStrengthsEditor } from './TeamContentEditor';
import TeamBaseballField from '@/components/TeamBaseballField';
import EROSPTable, { type EROSPPlayer, type EROSPMeta } from '@/components/EROSPTable';
import SuggestedMoves from '@/components/SuggestedMoves';
import { getSuggestedMoves } from '@/lib/suggested-moves';
import fs from 'fs';
import path from 'path';
import draftRounds from '@/data/draft-rounds.json';

// Build a lookup: { year_name → { round, avgPoints } } for all top3 entries
// Used to check if a team had a "draft steal" (one of their players was best in their round that year)
const DRAFT_TOP3_MAP: Record<string, { effectiveRound: number; avgPoints: number; rank: number }> = {};
for (const r of draftRounds.rounds) {
  for (let i = 0; i < r.top3.length; i++) {
    const p = r.top3[i];
    const key = `${p.year}_${p.name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    DRAFT_TOP3_MAP[key] = { effectiveRound: r.effectiveRound, avgPoints: r.avgPoints, rank: i + 1 };
  }
}

const EMUS_FUN_FACTS = "Last year's name change from Shureburds to Emus was due to an emu sighting on the Delmarva Peninsula. This temporary name change ignited a six-game win streak, and so the Shore Boyz hoped they could ride this to different fortunes come playoff time. Unfortunately, a Shureburd can't change its feathers. 3rd place again!";

const WVPR_TRADITIONS = [
  {
    name: '"Cue Country Roads" Pregame',
    description: "Before every home game, fans join in singing 'Cue Country Roads' by Morgantown's own Charles Wesley Godwin.",
  },
  {
    name: 'Running of the Rolls',
    description: 'Three mascot rolls race the 1st baseline in the 5th inning: Hot Pepper Hank, Pepperoni and Cheese Patty, and Double-Stuffed Dave (the lovable loser). Pick your winner via the Roll Call! app.',
  },
  {
    name: 'Free Pepperoni Roll Fridays',
    description: "First 500 fans through the gate at every Friday home game get a free Julia's Original Pepperoni Roll from Chico's Bakery. Vegetarian and gluten-free options available behind Gate A.",
  },
  {
    name: 'Fire(works) on the Mountain',
    description: 'Every Friday (weather permitting), fireworks light up the sky 5 minutes after the final out — win or lose.',
  },
  {
    name: 'Victory Sing-Along',
    description: 'After every win, the whole ballpark joins in singing "Take Me Home, Country Roads."',
  },
  {
    name: '"Beverage" Snake',
    description: "Section 43's fan-created tradition: save your cup and pass it to the nearest attendant. No throwing — that's an ejection. All cups recycled after the game.",
  },
  {
    name: 'Pepperoni Roll Eating Contest',
    description: "At the season's midpoint during the 7th-inning stretch: who can eat the most rolls in 2:30? Winner gets merch and a year's supply from Chico's. 2022 champ: Joey Chesnut.",
  },
  {
    name: 'Moonshine Run',
    description: "On Sundays, kids follow a 1928 Ford Model A Sport Coupe around the bases. Parents are responsible for their children.",
  },
];

const WVPR_AFFILIATES = [
  { name: 'Huntington Hammers', level: 'AAA', location: 'Huntington, WV', primaryColor: '#5B7C99', accentColor: '#EED202' },
  { name: 'Chesapeake & Ohio Canal Cats', level: 'AA', location: 'Cumberland, MD', primaryColor: '#228B22', accentColor: '#6495ED' },
  { name: 'Frost Whitetails', level: 'A', location: 'Frost, WV', primaryColor: '#4A4A4A', accentColor: '#FF6700' },
];


interface Props {
  params: Promise<{ teamId: string }>;
}

export async function generateStaticParams() {
  const teams = getCurrentSeason().teams;
  return teams.map(t => ({ teamId: String(t.id) }));
}

export default async function TeamPage({ params }: Props) {
  const { teamId } = await params;
  const id = parseInt(teamId, 10);

  const currentSeason = getCurrentSeason();
  const team = currentSeason.teams.find(t => t.id === id);

  if (!team) notFound();

  const meta = teamsMetadata.teams.find(t => t.id === id);
  const allTimeStats = calculateAllTimeStandings().find(t => t.teamId === id);
  const totalPlayersEmployed = getTotalUniquePlayersEmployed(id);
  const teamRecords = getTeamRecords(id);
  const seasonHistory = getTeamSeasonHistory(id);
  const topPlayersAllTime = getTeamTopPlayersAllTime(id, 6);

  // Compute draft steals: for each historical year, find players on this team who appear
  // in the top3 for their effective round in draft-rounds.json
  // Returns: year → array of { name, effectiveRound, avgPoints, rank, points }
  const draftSteals: Record<number, { name: string; effectiveRound: number; avgPoints: number; rank: number; points: number }[]> = {};
  for (const season of getAllSeasons()) {
    const { year } = season;
    if (year < 2023 || year > 2025) continue;
    const teamRoster = season.rosters?.find(r => r.teamId === id)?.players ?? [];
    const steals: typeof draftSteals[number] = [];
    for (const player of teamRoster) {
      const key = `${year}_${player.playerName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      const entry = DRAFT_TOP3_MAP[key];
      if (entry) {
        steals.push({ name: player.playerName, ...entry, points: player.totalPoints });
      }
    }
    if (steals.length > 0) draftSteals[year] = steals;
  }
  // Keeper display logic:
  // - Before Mar 24 draft: show suggested/confirmed 2026 keepers (from overrides or algorithm)
  // - Mar 24 – Oct 1: show actual 2026 keepers from ESPN roster data
  // - After Oct 1 (offseason): show suggested 2027 keepers based on 2026 season stats
  const keeperDeadline = new Date('2026-03-24');
  const seasonEnd2026 = new Date('2026-10-01');
  const now = new Date();
  const showSuggestedKeepers = now < keeperDeadline;
  const showSuggested2027 = now >= seasonEnd2026;
  const suggestedKeepers = showSuggestedKeepers ? getSuggestedKeepers(id, 6) : showSuggested2027 ? getSuggestedKeepers(id, 6, 2026) : [];
  const actualKeepers2026 = (!showSuggestedKeepers && !showSuggested2027) ? getTeamKeepersForYear(id, 2026) : [];

  // Current season roster for this team (for the field diagram)
  const currentRoster = (currentSeason.rosters ?? []).find(r => r.teamId === id)?.players ?? [];

  // All teams except this one for H2H
  const otherTeams = currentSeason.teams.filter(t => t.id !== id);

  // KV content overrides for team text fields (bio, strengths, weaknesses)
  const contentOverrides = await getTeamContent();
  const override = contentOverrides[id] ?? {};
  const effectiveBio = override.bio ?? meta?.bio;
  const effectiveStrengths = override.strengths ?? meta?.strengths;
  const effectiveWeaknesses = override.weaknesses ?? meta?.weaknesses;

  // Message board posts for this team (authored by or targeting this team)
  const boardData: TrashTalkData = await getTrashTalk();
  const teamPosts = boardData.posts.filter(
    p => p.authorTeamId === id || p.targetTeamId === id
  );

  // EROSP data — load from latest.json if available
  let erospPlayers: EROSPPlayer[] = [];
  let erospMeta: EROSPMeta | null = null;
  try {
    const erospPath = path.join(process.cwd(), 'data', 'erosp', 'latest.json');
    if (fs.existsSync(erospPath)) {
      const erospRaw = JSON.parse(fs.readFileSync(erospPath, 'utf-8'));
      erospMeta = {
        generated_at:    erospRaw.generated_at ?? '',
        season:          erospRaw.season ?? currentSeason.year,
        games_remaining: erospRaw.games_remaining ?? 162,
        season_started:  erospRaw.season_started ?? false,
        total_players:   erospRaw.total_players ?? 0,
      };
      const seen = new Set<number>();
      erospPlayers = ((erospRaw.players ?? []) as EROSPPlayer[]).filter(p => {
        if (seen.has(p.mlbam_id)) return false;
        seen.add(p.mlbam_id);
        return true;
      });
    }
  } catch { /* EROSP data not yet generated */ }

  // Filter EROSP players to this fantasy team.
  // Pre-draft: all players have fantasy_team_id=0, so fall back to keeper-override name matching.
  const isPreDraft = erospPlayers.length > 0 && erospPlayers.every(p => p.fantasy_team_id === 0);
  let teamErospPlayers: EROSPPlayer[];
  if (isPreDraft) {
    const keeperNames = new Set(
      ((keeperOverrides as Record<string, string[]>)[String(id)] ?? [])
        .map(n => n.toLowerCase().replace(/[^a-z0-9]/g, ''))
    );
    teamErospPlayers = erospPlayers.filter(p =>
      keeperNames.has(p.name.toLowerCase().replace(/[^a-z0-9]/g, ''))
    );
  } else {
    teamErospPlayers = erospPlayers.filter(p => p.fantasy_team_id === id);
  }

  // Load free agents for Suggested Moves
  let faList: Array<{ playerName: string; photoUrl?: string; position: string }> = [];
  try {
    const faPath = path.join(process.cwd(), 'data', 'current', 'free-agents.json');
    if (fs.existsSync(faPath)) {
      const faRaw = JSON.parse(fs.readFileSync(faPath, 'utf-8'));
      faList = (faRaw.players ?? []).map((p: { playerName: string; photoUrl?: string; position: string }) => ({
        playerName: p.playerName,
        photoUrl:   p.photoUrl,
        position:   p.position,
      }));
    }
  } catch { /* FA data unavailable */ }

  // Run Suggested Moves engine — only show post-draft
  const suggestedMovesResult = erospPlayers.length > 0 && !showSuggestedKeepers
    ? getSuggestedMoves({
        targetTeamId:   id,
        erospPlayers,
        keeperOverrides: keeperOverrides as Record<string, string[]>,
        faList,
      })
    : null;

  // Build set of true-RP names for the baseball field (EROSP role = 'RP')
  const rpNames = new Set(
    teamErospPlayers.filter(p => p.role === 'RP').map(p => p.name)
  );

  const bgFull  = (meta?.bgPlayers as { bgFull?: string })?.bgFull;
  const bgLeft  = bgFull ? undefined : meta?.bgPlayers?.left;
  const bgRight = bgFull ? undefined : meta?.bgPlayers?.right;
  const mirrorRight = meta?.bgPlayers?.mirrorRight ?? true;
  const bgLeftPosition  = (meta?.bgPlayers as { objectPositionLeft?: string })?.objectPositionLeft  ?? 'left top';
  const bgRightPosition = (meta?.bgPlayers as { objectPositionRight?: string })?.objectPositionRight ?? 'right top';
  const bgTranslateYLeft  = (meta?.bgPlayers as { bgTranslateYLeft?: number })?.bgTranslateYLeft  ?? 0;
  const bgTranslateYRight = (meta?.bgPlayers as { bgTranslateYRight?: number })?.bgTranslateYRight ?? 0;

  return (
    <div className="min-h-screen bg-sky-50 relative overflow-x-hidden">
      {/* Full-width background photo (single image mode) */}
      {bgFull && (
        <div
          className="absolute top-0 left-0 right-0 pointer-events-none select-none z-0"
          aria-hidden="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bgFull} alt="" className="w-full opacity-35" />
        </div>
      )}
      {/* Full-height background player photos */}
      {bgLeft && (
        <div
          className="fixed left-0 top-0 bottom-0 w-1/2 pointer-events-none select-none z-0"
          aria-hidden="true"
          style={{
            WebkitMaskImage: 'linear-gradient(to right, black 75%, rgba(0,0,0,0.2) 100%)',
            maskImage:        'linear-gradient(to right, black 75%, rgba(0,0,0,0.2) 100%)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bgLeft} alt="" className="w-full h-full object-cover opacity-35" style={{ objectPosition: bgLeftPosition, ...(bgTranslateYLeft ? { transform: `translateY(${bgTranslateYLeft}px)` } : {}) }} />
        </div>
      )}
      {bgRight && (
        <div
          className="fixed right-0 top-0 bottom-0 w-1/2 pointer-events-none select-none z-0"
          aria-hidden="true"
          style={{
            WebkitMaskImage: 'linear-gradient(to left, black 75%, rgba(0,0,0,0.2) 100%)',
            maskImage:        'linear-gradient(to left, black 75%, rgba(0,0,0,0.2) 100%)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bgRight}
            alt=""
            className="w-full h-full object-cover opacity-35"
            style={{ objectPosition: bgRightPosition, transform: [mirrorRight ? 'scaleX(-1)' : '', bgTranslateYRight ? `translateY(${bgTranslateYRight}px)` : ''].filter(Boolean).join(' ') || undefined }}
          />
        </div>
      )}

      <div className="relative z-20">
        <Header />
      </div>

      <main className="container mx-auto px-4 py-12 relative z-10">
        {/* Team header */}
        <div
          className="rounded-xl p-8 mb-10 text-white shadow-lg"
          style={{ background: `linear-gradient(135deg, ${meta?.primaryColor ?? '#3B82F6'}, #1e3a5f)` }}
        >
          <Link href="/teams" className="text-sm opacity-75 hover:opacity-100 mb-4 inline-block">
            ← All Teams
          </Link>
          <div className="flex items-center gap-6">
            {team.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={team.logoUrl}
                alt={`${team.name} logo`}
                className="w-20 h-20 object-cover rounded-full bg-white/10 flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-4xl font-bold mb-1">{team.name}</h1>
              <p className="text-lg opacity-80 mb-4">{meta?.owner ?? team.owner}</p>
              {id === 3 && (
                <span className="inline-block bg-[#C91920] text-white text-xs font-bold px-3 py-1 rounded-full mb-3 tracking-wide">#LETSGETBAKED</span>
              )}
              <TeamBioEditor teamId={id} bio={effectiveBio} />
            </div>
          </div>

          {/* Banners */}
          {seasonHistory.filter(s => s.wasChampion).length > 0 && (
            <div className="mt-4 flex gap-3 flex-wrap">
              {seasonHistory.filter(s => s.wasChampion).map(s => (
                <span
                  key={s.year}
                  className="bg-yellow-400 text-yellow-900 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M2 20h20v-2H2v2z"/>
                    <path d="M12 3L9 11 5 8 3 18h18L19 8l-4 3z"/>
                  </svg>
                  {s.year} Champion
                </span>
              ))}
            </div>
          )}
        </div>

        {/* All-time stats summary */}
        {allTimeStats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
            {[
              { label: 'All-Time Record', value: `${allTimeStats.totalWins}W - ${allTimeStats.totalLosses}L` },
              { label: 'Championships', value: allTimeStats.championships },
              { label: 'Playoff Appearances', value: allTimeStats.playoffAppearances },
              { label: 'Saccko Finishes', value: allTimeStats.loserBracketAppearances },
              { label: 'Avg Finish', value: allTimeStats.averageFinish.toFixed(1) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-slate-200 rounded-xl p-5 shadow-sm border text-center">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                <p className="text-2xl font-bold text-gray-800">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Strengths & Weaknesses */}
        <TeamStrengthsEditor
          teamId={id}
          strengths={effectiveStrengths}
          weaknesses={effectiveWeaknesses}
        />

        {/* Fuzzy Bottoms Keepers Photo */}
        {id === 9 && (
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2026 Keepers</h2>
            <div className="flex gap-6 items-stretch w-fit">
              <div className="rounded-xl overflow-hidden shadow-sm border border-gray-200 flex-shrink-0">
                <Image
                  src="/Dugan-Keepers.png"
                  alt="North Georgia Fuzzy Bottoms 2026 Keepers"
                  width={400}
                  height={267}
                  className="h-auto"
                  unoptimized
                />
              </div>
              <div className="rounded-xl border border-gray-200 shadow-sm bg-slate-200 px-5 py-4 w-72">
                <p className="text-sm font-semibold text-gray-700 mb-2">Strategic Overview</p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  The Fuzzy Bottoms enter 2026 banking on their elite offensive core. Bobby Witt Jr. and Mookie Betts anchor the lineup as two of the most complete fantasy contributors in the league — both capable of 40+ points in any given week. The keeper strategy leans into high-ceiling bats while managing pitching depth, a calculated bet that the offense can outscore any rotation weakness.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Sky Chiefs Uniforms */}
        {id === 7 && (
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2026 Uniforms</h2>
            <div className="flex gap-6 items-stretch w-fit">
              <div className="rounded-xl overflow-hidden shadow-sm border border-gray-200 flex-shrink-0 w-72">
                <Image
                  src="/sky-chiefs-uniforms.png"
                  alt="Sky Chiefs 2026 Uniforms"
                  width={600}
                  height={400}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              </div>
              <div className="rounded-xl border border-gray-200 shadow-sm bg-slate-200 px-5 py-4 w-72">
                <p className="text-sm text-gray-700 leading-relaxed">
                  The Sky Chiefs unveiled their 2026 uniform set this offseason, headlined by a new city connect alternate. The design pays homage to Griffiss Air Force Base — once a key hub and air depot for the Strategic Air Command — drawing on the base&apos;s deep ties to the Syracuse area and its legacy in Cold War-era aviation history.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Emus Fun Franchise Facts */}
        {id === 6 && (
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Fun Franchise Facts</h2>
            <p className="text-sm text-gray-700 mb-4">The Delmarva Peninsula's Almost Winningest Baseball Team, Established 2022</p>
            <div className="rounded-xl overflow-hidden shadow-sm border border-gray-200">
              <div className="px-4 py-3" style={{ backgroundColor: '#6C5CE7' }}>
                <p className="text-sm font-bold text-white leading-tight">Delmarva Emus (née Shureburds)</p>
              </div>
              <div className="px-4 py-4" style={{ backgroundColor: '#F0EEFF' }}>
                <p className="text-sm text-gray-700 leading-relaxed">{EMUS_FUN_FACTS}</p>
              </div>
            </div>
          </div>
        )}

        {/* WVPR Game Day Traditions */}
        {id === 3 && (
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">Game Day Traditions</h2>
            <p className="text-sm text-gray-700 mb-4">Tim Elko Field at Montani Semper Liberi Park · Morgantown, WV</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {WVPR_TRADITIONS.map(t => (
                <div key={t.name} className="rounded-xl overflow-hidden shadow-sm border border-gray-200 flex flex-col">
                  <div className="px-4 py-3" style={{ backgroundColor: '#1C384F' }}>
                    <p className="text-sm font-bold text-white leading-tight">{t.name}</p>
                  </div>
                  <div className="px-4 py-3 flex-1" style={{ backgroundColor: '#FBF2CE' }}>
                    <p className="text-xs text-gray-700 leading-relaxed">{t.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Players All-Time + Suggested / Actual 2026 Keepers */}
        {(topPlayersAllTime.length > 0 || suggestedKeepers.length > 0 || actualKeepers2026.length > 0) && (
          <div className="mb-10 grid grid-cols-1 md:grid-cols-2 gap-6">
            {topPlayersAllTime.length > 0 && (
              <div>
                <div className="mb-4">
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">Top Players All-Time</h2>
                  {/* invisible spacer to match height of keepers subtitle when present */}
                  {(suggestedKeepers.length > 0) && (
                    <p className="text-xs invisible">placeholder</p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {topPlayersAllTime.map((p, i) => (
                    <div key={p.playerName} className="bg-slate-200 rounded-lg border px-4 py-3 flex items-center gap-4 hover:bg-sky-50 transition">
                      <span className="text-sm font-bold text-gray-300 w-5 flex-shrink-0">{i + 1}</span>
                      {p.photoUrl && (
                        <Image
                          src={p.photoUrl}
                          alt={p.playerName}
                          width={36}
                          height={36}
                          className="rounded-full object-cover bg-gray-100 flex-shrink-0"
                          unoptimized
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 text-sm">{p.playerName}</p>
                        <p className="text-xs text-gray-400">{p.position}</p>
                      </div>
                      <span className="text-sm font-bold text-teal-600 flex-shrink-0">
                        {Math.round(p.totalPoints).toLocaleString()} pts
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {suggestedKeepers.length > 0 && (() => {
              const totalProjFP = suggestedKeepers.reduce((sum, p) => sum + Math.round(p.projectedFP2026 ?? 0), 0);
              return (
              <div>
                <div className="mb-4">
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">{showSuggested2027 ? 'Suggested 2027 Keepers' : (keeperOverrides as Record<string, string[]>)[String(id)] ? '2026 Keepers' : 'Suggested 2026 Keepers'}</h2>
                  <p className="text-xs text-gray-600 uppercase tracking-wide">{showSuggested2027 ? 'Ranked by 2026 season stats' : (keeperOverrides as Record<string, string[]>)[String(id)] ? 'Confirmed keepers' : 'Ranked by projected 2026 fantasy points'}</p>
                </div>
                <div className="flex flex-col gap-2">
                  {suggestedKeepers.map((p, i) => (
                    <div key={p.playerId || p.playerName} className="bg-slate-200 rounded-lg border px-4 py-3 flex items-center gap-4 hover:bg-sky-50 transition">
                      <span className="text-sm font-bold text-gray-300 w-5 flex-shrink-0">{i + 1}</span>
                      {p.photoUrl && (
                        <Image
                          src={p.photoUrl}
                          alt={p.playerName}
                          width={36}
                          height={36}
                          className="rounded-full object-cover bg-gray-100 flex-shrink-0"
                          unoptimized
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 text-sm">{p.playerName}</p>
                        <p className="text-xs text-gray-400">
                          {p.position}
                          {p.age !== null && <span> · Age {p.age.toFixed(0)}</span>}
                          {p.keeperValue > 0 && (
                            <span className="ml-1 bg-amber-100 text-amber-700 rounded px-1 font-medium">Rd {p.keeperValue}</span>
                          )}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-indigo-600 flex-shrink-0">
                        {Math.round(p.projectedFP2026!).toLocaleString()} proj
                      </span>
                    </div>
                  ))}
                  <div className="bg-indigo-50 rounded-lg border border-indigo-100 px-4 py-2.5 flex items-center justify-between">
                    <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wide">Total Projected</span>
                    <span className="text-sm font-bold text-indigo-700">{totalProjFP.toLocaleString()} pts</span>
                  </div>
                </div>
              </div>
              );
            })()}
            {actualKeepers2026.length > 0 && (
              <div>
                <div className="mb-4">
                  <h2 className="text-2xl font-bold text-gray-900 mb-1">2026 Keepers</h2>
                </div>
                <div className="flex flex-col gap-2">
                  {actualKeepers2026.map((p, i) => (
                    <div key={p.playerId} className="bg-slate-200 rounded-lg border px-4 py-3 flex items-center gap-4 hover:bg-sky-50 transition">
                      <span className="text-sm font-bold text-gray-300 w-5 flex-shrink-0">{i + 1}</span>
                      {p.photoUrl && (
                        <Image
                          src={p.photoUrl}
                          alt={p.playerName}
                          width={36}
                          height={36}
                          className="rounded-full object-cover bg-gray-100 flex-shrink-0"
                          unoptimized
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 text-sm">{p.playerName}</p>
                        <p className="text-xs text-gray-400">
                          {p.position}
                          {(p.keeperValue ?? 0) > 0 && (
                            <span className="ml-1 bg-amber-100 text-amber-700 rounded px-1 font-medium">Rd {p.keeperValue}</span>
                          )}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-teal-600 flex-shrink-0">
                        {Math.round(p.totalPoints).toLocaleString()} pts
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Current roster field diagram — falls back to keepers pre-draft */}
        {(currentRoster.length > 0 || suggestedKeepers.length > 0) && (
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              {currentRoster.length > 0 ? `${currentSeason.year} Roster` : '2026 Keepers'}
            </h2>
            <TeamBaseballField
              players={currentRoster.length > 0 ? currentRoster : suggestedKeepers.map(k => ({
                playerId: k.playerId || k.playerName,
                playerName: k.playerName,
                position: k.position,
                totalPoints: k.projectedFP2026 ?? 0,
                photoUrl: k.photoUrl,
              }))}
              rpNames={rpNames.size > 0 ? rpNames : undefined}
              fieldDimensions={id === 3 ? { lf: 325, lcf: 375, cf: 400, rcf: 375, rf: 325 } : undefined}
              stadiumName={id === 3 ? 'Tim Elko Field at Montani Semper Liberi Park' : id === 10 ? 'Muzzy Field, Home of the Bristol Banshees' : undefined}
              backgroundImageUrl={id === 3 ? '/wvu-kendrick-field.jpg' : id === 10 ? '/bristol-field.jpg' : undefined}
            />
          </div>
        )}

        {/* EROSP Projections */}
        {erospMeta && (
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-1">{erospMeta.season} EROSP Projections</h2>
            <p className="text-sm text-gray-700 mb-4">
              Expected Rest of Season Fantasy Points · {erospMeta.games_remaining} games remaining
            </p>
            {teamErospPlayers.length > 0 ? (
              <EROSPTable
                players={teamErospPlayers}
                meta={erospMeta}
                showTeamColumn={false}
              />
            ) : (
              <div className="bg-slate-200 rounded-xl border shadow-sm p-6 text-center text-gray-400 text-sm">
                No EROSP data for this team's roster yet.
                {!erospMeta.season_started && (
                  <span> EROSP data becomes more accurate once the season starts.</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* WVPR Farm System */}
        {id === 3 && (
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Farm System</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {WVPR_AFFILIATES.map(a => (
                <div key={a.name} className="bg-slate-200 rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4" style={{ backgroundColor: a.primaryColor }}>
                    <span className="inline-block bg-white/20 text-white text-[11px] font-bold px-2 py-0.5 rounded-full mb-2 tracking-wide">
                      {a.level}
                    </span>
                    <p className="text-white font-bold text-sm leading-tight">{a.name}</p>
                    <p className="text-white/65 text-xs mt-0.5">{a.location}</p>
                  </div>
                  <div className="px-4 py-3 flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm flex-shrink-0" style={{ backgroundColor: a.primaryColor }} />
                    <div className="w-5 h-5 rounded-full border-2 border-white shadow-sm flex-shrink-0" style={{ backgroundColor: a.accentColor }} />
                    <span className="text-[10px] text-gray-400 font-mono ml-1">{a.primaryColor} · {a.accentColor}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suggested Moves */}
        {suggestedMovesResult && (
          <div className="mb-10">
            <SuggestedMoves result={suggestedMovesResult} />
          </div>
        )}

        {/* Season-by-season history */}
        <h2 className="text-2xl font-bold text-gray-900 mb-5">Season History</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          {[...seasonHistory].reverse().map(({ year, standing, finish, madePlayoffs, inLoserBracket, wasChampion }) => {
            const topPlayer = getTeamTopPlayerForYear(id, year);
            const keepers = getTeamKeepersForYear(id, year);
            return (
            <div
              key={year}
              className={`bg-slate-200 rounded-xl p-6 shadow-sm border ${
                wasChampion ? 'border-yellow-400' : madePlayoffs ? 'border-green-300' : inLoserBracket ? 'border-red-200' : ''
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <span className="text-lg font-bold">{year}</span>
                <div className="flex gap-1">
                  {wasChampion && (
                    <span className="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded-full font-medium">
                      Champion
                    </span>
                  )}
                  {madePlayoffs && !wasChampion && (
                    <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">
                      Playoffs
                    </span>
                  )}
                  {inLoserBracket && (
                    <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">
                      Saccko
                    </span>
                  )}
                </div>
              </div>
              {standing ? (
                <div className="text-sm text-gray-600 space-y-1">
                  <div><span className="font-semibold">Record:</span> {standing.wins}W - {standing.losses}L{standing.ties > 0 ? ` - ${standing.ties}T` : ''}</div>
                  <div><span className="font-semibold">Finish:</span> #{finish}</div>
                  <div><span className="font-semibold">PF:</span> {standing.pointsFor.toFixed(1)}</div>
                  <div><span className="font-semibold">PA:</span> {standing.pointsAgainst.toFixed(1)}</div>
                  {topPlayer && (
                    <div className="pt-2 mt-2 border-t border-gray-100">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Top Player</span>
                      <div className="flex items-center gap-2 mt-1">
                        {topPlayer.photoUrl && (
                          <Image
                            src={topPlayer.photoUrl}
                            alt={topPlayer.playerName}
                            width={36}
                            height={36}
                            className="rounded-full object-cover bg-gray-100 flex-shrink-0"
                            unoptimized
                          />
                        )}
                        <div>
                          <div className="font-semibold text-gray-800">{topPlayer.playerName}</div>
                          <div className="text-xs text-gray-400">{topPlayer.position} &bull; {topPlayer.totalPoints.toFixed(1)} pts</div>
                        </div>
                      </div>
                    </div>
                  )}
                  {keepers.length > 0 && (() => {
                    const keeperTotalPts = keepers.reduce((sum, k) => sum + (k.totalPoints ?? 0), 0);
                    return (
                    <div className="pt-2 mt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Keepers</span>
                        {keeperTotalPts > 0 && (
                          <span className="text-xs font-semibold text-teal-600">{keeperTotalPts.toFixed(1)} pts</span>
                        )}
                      </div>
                      <div
                        className="mt-1 grid gap-1"
                        style={{ gridTemplateColumns: `repeat(${keepers.length}, 1fr)` }}
                      >
                        {keepers.sort((a, b) => (a.keeperValue ?? 0) - (b.keeperValue ?? 0)).map(k => (
                          <div key={k.playerId} className="flex flex-col items-center gap-0.5 min-w-0">
                            <Image
                              src={k.photoUrl ?? ''}
                              alt={k.playerName}
                              width={36}
                              height={36}
                              className="rounded-full object-cover bg-gray-200 flex-shrink-0"
                              unoptimized
                            />
                            <span className="text-[10px] text-gray-600 text-center leading-tight break-words w-full">
                              {k.playerName.trim().split(' ').slice(1).join(' ') || k.playerName}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    );
                  })()}
                {/* Draft Steals */}
                {draftSteals[year] && draftSteals[year].length > 0 && (
                  <div className="pt-2 mt-2 border-t border-gray-100">
                    <span className="text-xs font-semibold text-indigo-500 uppercase tracking-wide">Draft Steal{draftSteals[year].length > 1 ? 's' : ''}</span>
                    {draftSteals[year].map(steal => (
                      <div key={steal.name} className="mt-1 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{steal.name}</p>
                          <p className="text-[10px] text-gray-400">#{steal.rank} in Rd {steal.effectiveRound} (avg {steal.avgPoints} pts)</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-bold text-indigo-600">{Math.round(steal.points)} pts</p>
                          <p className="text-[10px] text-indigo-400">+{Math.round(steal.points - steal.avgPoints)} vs avg</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No data available</p>
              )}
            </div>
            );
          })}
        </div>

        {/* Manager History */}
        <ManagerHistory
          records={teamRecords}
          trades={teamPosts}
          totalPlayersEmployed={totalPlayersEmployed}
          totalSeasons={seasonHistory.length}
          teamId={id}
          teamColor={meta?.primaryColor ?? '#0f766e'}
          championships={allTimeStats?.championships ?? 0}
        />

        {/* Head-to-Head records */}
        <h2 className="text-2xl font-bold text-gray-900 mb-5">Head-to-Head Records</h2>
        <div className="overflow-x-auto overflow-y-hidden">
          <table className="min-w-full bg-slate-200 shadow-md rounded-lg overflow-hidden">
            <thead className="bg-gray-800 text-white text-sm">
              <tr>
                <th className="px-4 py-3 text-left">Opponent</th>
                <th className="px-4 py-3 text-center">W</th>
                <th className="px-4 py-3 text-center">L</th>
                <th className="px-4 py-3 text-center">T</th>
                <th className="px-4 py-3 text-center">Record</th>
              </tr>
            </thead>
            <tbody>
              {otherTeams
                .map(opponent => {
                  const h2h = getTeamHeadToHead(id, opponent.id);
                  const total = h2h.team1Wins + h2h.team2Wins + h2h.ties;
                  const winPct = total === 0 ? -1 : h2h.team1Wins / total;
                  return { opponent, h2h, total, winPct };
                })
                .sort((a, b) => b.winPct - a.winPct)
                .map(({ opponent, h2h, total }) => (
                  <tr key={opponent.id} className="border-b hover:bg-sky-50 transition text-sm">
                    <td className="px-4 py-3">
                      <Link href={`/teams/${opponent.id}`} className="font-medium hover:text-teal-600 transition">
                        {opponent.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-center text-green-600 font-semibold">{h2h.team1Wins}</td>
                    <td className="px-4 py-3 text-center text-red-500 font-semibold">{h2h.team2Wins}</td>
                    <td className="px-4 py-3 text-center text-gray-500">{h2h.ties}</td>
                    <td className="px-4 py-3 text-center">
                      {total === 0 ? '—' : (
                        <span className={h2h.team1Wins > h2h.team2Wins ? 'text-green-600' : h2h.team1Wins < h2h.team2Wins ? 'text-red-500' : 'text-gray-500'}>
                          {h2h.team1Wins > h2h.team2Wins ? 'Leads' : h2h.team1Wins < h2h.team2Wins ? 'Trails' : 'Even'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* ── Message Board ──────────────────────────────────────── */}
        {teamPosts.length > 0 && (
          <div className="mt-12">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">💬 Message Board</h2>
              <Link href="/message-board" className="text-sm text-teal-600 hover:underline font-medium">
                View all posts →
              </Link>
            </div>
            <div className="flex flex-wrap gap-4">
              {teamPosts.map(post => {
                const authorMeta = teamsMetadata.teams.find(t => t.id === post.authorTeamId);
                const targetMeta = post.targetTeamId
                  ? teamsMetadata.teams.find(t => t.id === post.targetTeamId)
                  : null;
                const dateStr = new Date(post.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const ytMatch = post.videoUrl?.match(
                  /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
                );
                return (
                  <div
                    key={post.id}
                    className="bg-slate-200 rounded-xl border border-gray-200 p-5 shadow-sm"
                    style={{ borderLeftColor: authorMeta?.primaryColor ?? '#e5e7eb', borderLeftWidth: 4, maxWidth: 520, flex: '1 1 300px' }}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-gray-800">{post.authorName}</span>
                        <span className="text-xs text-gray-400">{authorMeta?.displayName}</span>
                        {targetMeta && (
                          <span className="text-xs bg-red-50 text-red-500 font-medium px-2 py-0.5 rounded-full border border-red-100">
                            → {targetMeta.displayName}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-300 shrink-0">{dateStr}</span>
                    </div>
                    {post.message && (
                      <p className="text-sm text-gray-700 leading-relaxed">{post.message}</p>
                    )}
                    {post.videoUrl && (
                      ytMatch ? (
                        <div className="mt-3 rounded-xl overflow-hidden" style={{ aspectRatio: '16/9', maxWidth: 480 }}>
                          <iframe
                            src={`https://www.youtube.com/embed/${ytMatch[1]}`}
                            className="w-full h-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      ) : (
                        // eslint-disable-next-line jsx-a11y/media-has-caption
                        <video src={post.videoUrl} controls className="mt-3 rounded-xl" style={{ maxHeight: 270, maxWidth: 480 }} />
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
