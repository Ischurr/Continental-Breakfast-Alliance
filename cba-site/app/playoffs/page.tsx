'use client';

import Header from '@/components/Header';
import { getAllSeasons, getCurrentSeason } from '@/lib/data-processor';
import { SeasonData } from '@/lib/types';
import teamsMetadata from '@/data/teams.json';
import Link from 'next/link';
import { useState } from 'react';

// Resolved at module load time (client bundle)
const allSeasons = getAllSeasons();
const activeSeason = getCurrentSeason();

type TeamMeta = { id: number; primaryColor: string; cityPhotoUrl?: string };
const teamsMeta: TeamMeta[] = teamsMetadata.teams;

// ─── Sub-components ────────────────────────────────────────────────────────────

type SeedEntry = {
  teamId: number;
  seed: number;
  wins: number;
  losses: number;
  pointsFor: number;
  team: SeasonData['teams'][0] | undefined;
};

function SeedRow({ s, isWinner, isDim }: { s: SeedEntry; isWinner?: boolean; isDim?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2.5 border-b last:border-b-0 ${
      isWinner ? 'bg-green-50' : isDim ? 'bg-gray-50' : 'bg-white'
    }`}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-gray-300 w-5">#{s.seed}</span>
        <div>
          <Link
            href={`/teams/${s.teamId}`}
            className={`text-sm font-semibold hover:text-teal-600 transition ${isDim ? 'text-gray-400' : ''}`}
          >
            {s.team?.name ?? '—'}
          </Link>
          <p className="text-xs text-gray-400">{s.wins}W–{s.losses}L</p>
        </div>
      </div>
      <span className="text-xs text-gray-400 ml-3">{Math.round(s.pointsFor).toLocaleString()}</span>
    </div>
  );
}

function AdvancesSlot({ team }: { team: SeasonData['teams'][0] | undefined }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 text-center flex-shrink-0 ${
      team ? 'bg-green-50 border-green-200' : 'bg-white border-dashed border-gray-200'
    }`} style={{ width: '140px' }}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">Advances</p>
      {team ? (
        <Link href={`/teams/${team.id}`} className="font-semibold text-green-700 hover:text-teal-600 transition text-xs block truncate">
          {team.name}
        </Link>
      ) : (
        <p className="text-xs text-gray-300 font-medium">TBD</p>
      )}
    </div>
  );
}

// ─── Bracket renderer ──────────────────────────────────────────────────────────

function PlayoffBracket({ season, hasBg }: { season: SeasonData; hasBg: boolean }) {
  const getTeam = (id: number) => season.teams.find(t => t.id === id);

  const sorted = [...season.standings].sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
  const seeds: SeedEntry[] = sorted.map((s, i) => ({ ...s, seed: i + 1, team: getTeam(s.teamId) }));

  const playoffTeamSet = new Set(season.playoffTeams);

  // Use only the actual playoff weeks (last 2 weeks of the season),
  // not all regular-season cross-matchups between teams that happened to make playoffs.
  const allMatchupWeeks = [...new Set(season.matchups.map(m => m.week))].sort((a, b) => a - b);
  const lastTwoWeeks = allMatchupWeeks.slice(-2);
  const playoffMatchups = season.matchups
    .filter(m => lastTwoWeeks.includes(m.week) && playoffTeamSet.has(m.home.teamId) && playoffTeamSet.has(m.away.teamId))
    .sort((a, b) => a.week - b.week);

  if (season.playoffTeams.length === 0 || playoffMatchups.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
        <p className="text-gray-400 text-sm">No playoff bracket data available for this season yet.</p>
      </div>
    );
  }

  const playoffWeeks = [...new Set(playoffMatchups.map(m => m.week))].sort((a, b) => a - b);
  const r1Matchups = playoffMatchups.filter(m => m.week === playoffWeeks[0]);
  const r2Matchups = playoffMatchups.filter(m => m.week === playoffWeeks[1]);

  // Left bracket = the matchup containing the lowest-seeded team (highest seed #).
  // This ensures the #4 seed's half is always on the left, matching ESPN's visual layout.
  const getSeed = (teamId: number) => {
    const idx = seeds.findIndex(s => s.teamId === teamId);
    return idx >= 0 ? idx + 1 : 999;
  };
  const matchupWorstSeed = (m: typeof r1Matchups[0]) =>
    Math.max(getSeed(m.home.teamId), getSeed(m.away.teamId));

  const [r1A, r1B] = r1Matchups.length >= 2
    ? matchupWorstSeed(r1Matchups[0]) >= matchupWorstSeed(r1Matchups[1])
      ? [r1Matchups[0], r1Matchups[1]]
      : [r1Matchups[1], r1Matchups[0]]
    : [r1Matchups[0], r1Matchups[0]];

  // Get actual seed entries for each bracket half, sorted best→worst for display
  const seedsForMatchup = (m: typeof r1Matchups[0]): [SeedEntry | undefined, SeedEntry | undefined] => {
    const a = seeds.find(s => s.teamId === m.home.teamId);
    const b = seeds.find(s => s.teamId === m.away.teamId);
    return (a && b && a.seed < b.seed) ? [a, b] : [b, a];
  };
  const [r1ATop, r1ABot] = r1A ? seedsForMatchup(r1A) : [undefined, undefined];
  const [r1BTop, r1BBot] = r1B ? seedsForMatchup(r1B) : [undefined, undefined];

  const winner1A = r1A?.winner ? getTeam(r1A.winner) : undefined;
  const winner1B = r1B?.winner ? getTeam(r1B.winner) : undefined;

  const champMatchup = winner1A && winner1B
    ? r2Matchups.find(m =>
        (m.home.teamId === winner1A.id || m.away.teamId === winner1A.id) &&
        (m.home.teamId === winner1B.id || m.away.teamId === winner1B.id)
      )
    : r2Matchups[0];

  const champ = season.champion !== undefined ? getTeam(season.champion) : undefined;

  // Connector colors flip based on background
  const connBorder = hasBg ? 'rgba(255,255,255,0.35)' : '#e5e7eb';
  const labelCls = hasBg ? 'text-white/70' : 'text-gray-400';

  const CONNECTOR_H = 88;
  const LABEL_OFFSET = 20;

  const connectorStyle = {
    height: CONNECTOR_H,
    marginTop: LABEL_OFFSET,
    flexShrink: 0 as const,
    width: 32,
    display: 'flex' as const,
    flexDirection: 'column' as const,
  };
  const hLineStyle = {
    width: 24,
    marginTop: LABEL_OFFSET,
    flexShrink: 0 as const,
    borderTop: `2px solid ${connBorder}`,
    alignSelf: 'center' as const,
  };

  // Championship box (always yellow/standard — photo goes behind the whole section)
  const champBox = champ ? (
    <>
      <div className="bg-yellow-400 text-yellow-900 text-[11px] font-bold px-3 py-1.5 rounded-t-lg text-center">
        ★ {season.year} Champion
      </div>
      <div className="bg-green-50 border-2 border-green-300 border-t-0 rounded-b-xl p-4 text-center shadow-sm">
        <div className="text-2xl mb-1">★</div>
        <Link href={`/teams/${season.champion}`} className="font-bold text-green-800 text-sm hover:text-teal-600 transition block">
          {champ.name}
        </Link>
        <p className="text-xs text-green-600 mt-1">{champ.owner}</p>
      </div>
    </>
  ) : champMatchup ? (
    <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center shadow-sm bg-white">
      <p className="text-xs text-gray-400 mb-1">In Progress</p>
      <p className="text-sm font-semibold text-gray-600">{winner1A?.name ?? 'TBD'}</p>
      <p className="text-xs text-gray-400 my-0.5">vs</p>
      <p className="text-sm font-semibold text-gray-600">{winner1B?.name ?? 'TBD'}</p>
    </div>
  ) : (
    <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center shadow-sm bg-white">
      <div className="text-2xl mb-1 text-gray-200">★</div>
      <p className="text-sm text-gray-400 font-medium">TBD</p>
    </div>
  );

  return (
    <>
      {/* ── Desktop bracket ──────────────────────────────────────────── */}
      <div className="hidden md:flex items-center justify-center mx-auto" style={{ maxWidth: '900px' }}>

        {/* Left Semifinal */}
        <div className="flex-shrink-0" style={{ width: 192 }}>
          <p className={`text-[11px] font-semibold uppercase tracking-wide mb-2 text-center ${labelCls}`}>Semifinal</p>
          <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
            {r1ATop && <SeedRow s={r1ATop} isWinner={winner1A?.id === r1ATop.teamId} isDim={!!winner1A && winner1A.id !== r1ATop.teamId} />}
            {r1ABot && <SeedRow s={r1ABot} isWinner={winner1A?.id === r1ABot.teamId} isDim={!!winner1A && winner1A.id !== r1ABot.teamId} />}
          </div>
        </div>

        {/* Left bracket connector */}
        <div style={connectorStyle}>
          <div className="flex-1 border-t-2 border-r-2 rounded-tr-lg" style={{ borderColor: connBorder }} />
          <div className="flex-1 border-b-2 border-r-2 rounded-br-lg" style={{ borderColor: connBorder }} />
        </div>

        {/* Advance A */}
        <div style={{ marginTop: LABEL_OFFSET, flexShrink: 0 }}>
          <AdvancesSlot team={winner1A} />
        </div>

        {/* Straight line → Championship */}
        <div style={hLineStyle} />

        {/* Championship */}
        <div className="flex-shrink-0" style={{ width: 176 }}>
          <p className={`text-[11px] font-semibold uppercase tracking-wide mb-2 text-center ${labelCls}`}>Championship</p>
          {champBox}
        </div>

        {/* Straight line ← Championship */}
        <div style={hLineStyle} />

        {/* Advance B */}
        <div style={{ marginTop: LABEL_OFFSET, flexShrink: 0 }}>
          <AdvancesSlot team={winner1B} />
        </div>

        {/* Right bracket connector */}
        <div style={connectorStyle}>
          <div className="flex-1 border-t-2 border-l-2 rounded-tl-lg" style={{ borderColor: connBorder }} />
          <div className="flex-1 border-b-2 border-l-2 rounded-bl-lg" style={{ borderColor: connBorder }} />
        </div>

        {/* Right Semifinal */}
        <div className="flex-shrink-0" style={{ width: 192 }}>
          <p className={`text-[11px] font-semibold uppercase tracking-wide mb-2 text-center ${labelCls}`}>Semifinal</p>
          <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
            {r1BTop && <SeedRow s={r1BTop} isWinner={winner1B?.id === r1BTop.teamId} isDim={!!winner1B && winner1B.id !== r1BTop.teamId} />}
            {r1BBot && <SeedRow s={r1BBot} isWinner={winner1B?.id === r1BBot.teamId} isDim={!!winner1B && winner1B.id !== r1BBot.teamId} />}
          </div>
        </div>
      </div>

      {/* ── Mobile bracket ───────────────────────────────────────────── */}
      <div className="md:hidden space-y-4">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${labelCls}`}>
            Semifinal A — #{r1ATop?.seed} vs #{r1ABot?.seed}
          </p>
          <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
            {r1ATop && <SeedRow s={r1ATop} isWinner={winner1A?.id === r1ATop.teamId} isDim={!!winner1A && winner1A.id !== r1ATop.teamId} />}
            {r1ABot && <SeedRow s={r1ABot} isWinner={winner1A?.id === r1ABot.teamId} isDim={!!winner1A && winner1A.id !== r1ABot.teamId} />}
          </div>
          {winner1A && (
            <div className={`mt-2 ml-4 flex items-center gap-2 text-xs ${hasBg ? 'text-white/80' : 'text-green-700'}`}>
              <span>↓ Advances:</span>
              <Link href={`/teams/${winner1A.id}`} className="font-semibold hover:text-teal-300">{winner1A.name}</Link>
            </div>
          )}
        </div>

        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${labelCls}`}>
            Semifinal B — #{r1BTop?.seed} vs #{r1BBot?.seed}
          </p>
          <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
            {r1BTop && <SeedRow s={r1BTop} isWinner={winner1B?.id === r1BTop.teamId} isDim={!!winner1B && winner1B.id !== r1BTop.teamId} />}
            {r1BBot && <SeedRow s={r1BBot} isWinner={winner1B?.id === r1BBot.teamId} isDim={!!winner1B && winner1B.id !== r1BBot.teamId} />}
          </div>
          {winner1B && (
            <div className={`mt-2 ml-4 flex items-center gap-2 text-xs ${hasBg ? 'text-white/80' : 'text-green-700'}`}>
              <span>↓ Advances:</span>
              <Link href={`/teams/${winner1B.id}`} className="font-semibold hover:text-teal-300">{winner1B.name}</Link>
            </div>
          )}
        </div>

        {(winner1A || winner1B || champMatchup) && (
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${labelCls}`}>Championship</p>
            {champBox}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PlayoffsPage() {
  const [selectedYear, setSelectedYear] = useState(activeSeason.year);

  const season = allSeasons.find(s => s.year === selectedYear) ?? activeSeason;

  const currentWeek = season.matchups.filter(m => m.winner !== undefined).length > 0
    ? Math.max(...season.matchups.filter(m => m.winner !== undefined).map(m => m.week))
    : 0;

  const sorted = [...season.standings].sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
  const getTeam = (id: number) => season.teams.find(t => t.id === id);
  const seeds = sorted.map((s, i) => ({ ...s, seed: i + 1, team: getTeam(s.teamId) }));

  const incompleteMatchups = season.matchups.filter(m => m.winner === undefined && m.home.totalPoints === 0);
  const remainingGames = (teamId: number) =>
    incompleteMatchups.filter(m => m.home.teamId === teamId || m.away.teamId === teamId).length;

  const fourthPlaceWins = seeds[3]?.wins ?? 0;
  const outsideTop4 = seeds.slice(4);
  const huntTeams = outsideTop4.filter(s => s.wins + remainingGames(s.teamId) >= fourthPlaceWins);
  const hurtSeeds = seeds.slice(-2);

  const isSeasonOver = season.champion !== undefined || incompleteMatchups.length === 0;
  const champ = season.champion !== undefined ? getTeam(season.champion) : undefined;

  // Background photo logic — champion city photo, or season-level photo for preseason years
  const champMeta = champ ? teamsMeta.find(t => t.id === champ.id) : undefined;
  const bgPhotoUrl = champMeta?.cityPhotoUrl ?? season.backgroundPhotoUrl ?? '';
  const bgColor = champMeta?.primaryColor ?? '#14b8a6';
  const hasBg = !!champ || !!season.backgroundPhotoUrl;

  // Year tabs: show every season that exists in data (including preseason 2026)
  const yearOptions = allSeasons.map(s => s.year).sort((a, b) => b - a);

  return (
    <div className="min-h-screen bg-sky-50">
      <Header />

      <main className="container mx-auto px-4 py-12">

        {/* ── Photo background wraps title + year selector + bracket ─── */}
        <div className="relative rounded-2xl overflow-hidden mb-2" style={{ minHeight: '500px' }}>
          {hasBg && (
            <>
              {/* City photo (or primary-color gradient fallback) */}
              <div
                className="absolute inset-0"
                style={bgPhotoUrl
                  ? { backgroundImage: `url(${bgPhotoUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                  : { background: `linear-gradient(135deg, ${bgColor}cc, #0f1a2e)` }
                }
              />
              {/* Dark overlay so text and cards remain readable */}
              <div className="absolute inset-0 bg-black/62" />
            </>
          )}

          <div className={`relative z-10 ${hasBg ? 'px-8 pt-8 pb-10' : ''}`}>
            <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-2">
              <h1 className={`text-4xl font-bold ${hasBg ? 'text-white' : ''}`}>
                {season.year} Playoff Picture
              </h1>
              {champ && (
                <span className="mt-2 md:mt-0 text-sm bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full font-semibold">
                  ★ {champ.name} — {season.year} Champion
                </span>
              )}
            </div>
            <p className={`mb-6 ${hasBg ? 'text-white/65' : 'text-gray-500'}`}>
              {isSeasonOver
                ? `Final standings after the ${season.year} regular season`
                : `Standings as of Week ${currentWeek} — if the season ended today`}
            </p>

            {/* ── Year selector ──────────────────────────────────────── */}
            <div className="flex flex-wrap gap-2 mb-8">
              {yearOptions.map(year => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold border transition ${
                    selectedYear === year
                      ? 'bg-teal-600 text-white border-teal-600'
                      : hasBg
                        ? 'bg-white/10 text-white border-white/25 hover:bg-white/20 hover:border-white/40'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-teal-400 hover:text-teal-600'
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>

            {/* ── Bracket ────────────────────────────────────────────── */}
            <h2 className={`text-xl font-bold mb-6 ${hasBg ? 'text-white' : 'text-gray-700'}`}>
              Playoff Bracket
            </h2>
            <PlayoffBracket season={season} hasBg={hasBg} />
          </div>
        </div>

        {/* ── In the Hunt / In the Hurt ────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-10">
          <div className="md:col-span-2">
            <h2 className="text-xl font-bold text-gray-700 mb-1">🔎 In the Hunt</h2>
            <p className="text-sm text-gray-400 mb-4">
              {huntTeams.length === 0
                ? isSeasonOver
                  ? 'The regular season is over — playoff spots are locked.'
                  : 'No teams are mathematically eligible for the playoffs.'
                : 'Teams that can still mathematically reach a playoff spot'}
            </p>
            {huntTeams.length > 0 && (
              <div className="space-y-3">
                {huntTeams.map(s => {
                  const winsBack = fourthPlaceWins - s.wins;
                  const rem = remainingGames(s.teamId);
                  return (
                    <div key={s.teamId} className="bg-white rounded-xl border px-4 py-3 flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-gray-300 w-5">#{s.seed}</span>
                        <div>
                          <Link href={`/teams/${s.teamId}`} className="font-semibold hover:text-teal-600 transition text-sm">
                            {s.team?.name}
                          </Link>
                          <p className="text-xs text-gray-400">{s.wins}W–{s.losses}L &bull; {Math.round(s.pointsFor).toLocaleString()} pts</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold text-orange-500">
                          {winsBack === 0 ? 'Tied for last spot' : `${winsBack}W back`}
                        </p>
                        <p className="text-xs text-gray-400">{rem} game{rem !== 1 ? 's' : ''} left</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-700 mb-1">💀 In the Hurt</h2>
            <p className="text-sm text-gray-400 mb-4">Current Saccko bracket</p>
            <div className="space-y-3">
              {hurtSeeds.map((s, i) => (
                <div key={s.teamId} className="bg-red-50 rounded-xl border border-red-200 px-4 py-3 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-red-200 w-5">#{s.seed}</span>
                    <div>
                      <Link href={`/teams/${s.teamId}`} className="font-semibold hover:text-teal-600 transition text-sm text-red-700">
                        {s.team?.name}
                      </Link>
                      <p className="text-xs text-gray-400">{s.wins}W–{s.losses}L &bull; {Math.round(s.pointsFor).toLocaleString()} pts</p>
                    </div>
                  </div>
                  {i === hurtSeeds.length - 1 && (
                    <span className="text-xs font-semibold text-red-400">Last Place</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
