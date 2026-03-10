import Header from '@/components/Header';
import Link from 'next/link';
import Image from 'next/image';
import { SeasonData } from '@/lib/types';
import season2022 from '@/data/historical/2022.json';
import season2023 from '@/data/historical/2023.json';
import season2024 from '@/data/historical/2024.json';
import { getDinosContent } from '@/lib/store';
import { DinosBioEditor, DinosCircumstanceParagraph, DinosLegacyEditor } from './DinosContentEditor';

const DEFAULT_BIO = `Three seasons of prehistoric chaos, one disgraceful exit, and a championship that technically happened. The Dinos finished last in 2022, refused to serve their Saccko punishment, and were dragged into 2023 under a cloud of dishonor. They proceeded to \u2014 accidentally, it seemed \u2014 win the whole league. The title was subsequently vacated. Then they went extinct. A fitting end.`;
const DEFAULT_SACCKO = `The Dinwiddie Dinos finished 9th in the inaugural CBA season, landing them squarely in the Saccko bracket \u2014 the league\u2019s punishment bracket for the worst-performing teams. Andrew Sharpe declined to participate. The punishment went unserved. The league took note.`;
const DEFAULT_CHAMPIONSHIP = `In an outcome that still baffles historians, the Dinos rebounded from their Saccko-bracket disgrace to go 14-7 and win the 2023 Continental Breakfast Alliance title. The league, already simmering over the unserved punishment, found this insufferable. The championship was subsequently vacated. The trophy remains unclaimed.`;
const DEFAULT_EXIT = `Following the 2024 season, Andrew Sharpe was removed from the league. The Dinwiddie Dinos played their final game and were replaced by the Bristol Banshees ahead of 2025. The Banshees, in their first act as a franchise, accepted the Saccko rules without complaint and then won the championship. Point made.`;
const DEFAULT_LEGACY_QUOTE = `\u201cHe won the league and got kicked out for it. That\u2019s a sentence that has never been written before.\u201d`;
const DEFAULT_LEGACY_TEXT = `The Dinwiddie Dinos played three seasons in the Continental Breakfast Alliance under Andrew Sharpe. They refused a punishment, accidentally won the title, had it vacated, and were replaced by a franchise that immediately won the championship the right way. Their slot was inherited by the Bristol Banshees, who also inherited \u2014 in a cruel twist of prehistory \u2014 Juan Soto.`;

const DINO_ID = 10;
const DINO_SEASONS = [season2022, season2023, season2024] as SeasonData[];
const DINO_LOGO = 'https://i.pinimg.com/originals/39/22/04/392204beb5600d7bb1d72a348a179285.png';

function getDinoSeasonHistory() {
  return DINO_SEASONS.map(season => {
    const standing = season.standings.find(s => s.teamId === DINO_ID);
    const sorted = [...season.standings].sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
    const finish = sorted.findIndex(s => s.teamId === DINO_ID) + 1;
    const madePlayoffs = season.playoffTeams.includes(DINO_ID);
    const inLoserBracket = (season.loserBracket ?? []).includes(DINO_ID);
    const wasChampion = season.champion === DINO_ID;
    const roster = season.rosters?.find(r => r.teamId === DINO_ID);
    const topPlayer = roster
      ? [...roster.players].filter(p => p.totalPoints > 0).sort((a, b) => b.totalPoints - a.totalPoints)[0]
      : null;
    return { year: season.year, standing, finish, madePlayoffs, inLoserBracket, wasChampion, topPlayer };
  });
}

function getDinoTopPlayers(limit = 6) {
  const totals = new Map<string, { playerName: string; position: string; totalPoints: number; photoUrl?: string }>();
  DINO_SEASONS.forEach(season => {
    const roster = season.rosters?.find(r => r.teamId === DINO_ID);
    roster?.players.forEach(p => {
      const existing = totals.get(p.playerId);
      if (existing) {
        existing.totalPoints += p.totalPoints;
      } else {
        totals.set(p.playerId, {
          playerName: p.playerName,
          position: p.position,
          totalPoints: p.totalPoints,
          photoUrl: p.photoUrl,
        });
      }
    });
  });
  return [...totals.values()].sort((a, b) => b.totalPoints - a.totalPoints).slice(0, limit);
}

function getDinoH2H() {
  const records = new Map<number, { wins: number; losses: number; ties: number; name: string }>();
  DINO_SEASONS.forEach(season => {
    const teamNames = new Map(season.teams.map(t => [t.id, t.name]));
    season.matchups.forEach(m => {
      const isHome = m.home.teamId === DINO_ID;
      const isAway = m.away.teamId === DINO_ID;
      if (!isHome && !isAway) return;
      const oppId = isHome ? m.away.teamId : m.home.teamId;
      if (!records.has(oppId)) {
        records.set(oppId, { wins: 0, losses: 0, ties: 0, name: teamNames.get(oppId) ?? `Team ${oppId}` });
      }
      const rec = records.get(oppId)!;
      const winner = m.winner;
      if (winner === DINO_ID) rec.wins++;
      else if (winner === oppId) rec.losses++;
      else rec.ties++;
    });
  });
  return [...records.entries()]
    .map(([id, rec]) => ({ id, ...rec }))
    .sort((a, b) => {
      const totalA = a.wins + a.losses + a.ties;
      const totalB = b.wins + b.losses + b.ties;
      const pctA = totalA > 0 ? a.wins / totalA : -1;
      const pctB = totalB > 0 ? b.wins / totalB : -1;
      return pctB - pctA;
    });
}

export default async function DinoMemorialPage() {
  const history = getDinoSeasonHistory();
  const topPlayers = getDinoTopPlayers(6);
  const h2h = getDinoH2H();
  const content = await getDinosContent();

  const totalWins = history.reduce((s, h) => s + (h.standing?.wins ?? 0), 0);
  const totalLosses = history.reduce((s, h) => s + (h.standing?.losses ?? 0), 0);
  const championships = history.filter(h => h.wasChampion).length;
  const playoffApps = history.filter(h => h.madePlayoffs).length;
  const sacckoFinishes = history.filter(h => h.inLoserBracket).length;
  const avgFinish = history.reduce((s, h) => s + h.finish, 0) / history.length;

  return (
    <div className="min-h-screen bg-stone-100">
      <Header />

      <main className="container mx-auto px-4 py-12">

        {/* Memorial Header */}
        <div
          className="rounded-xl p-8 mb-10 text-white shadow-lg"
          style={{ background: 'linear-gradient(135deg, #2C2C2C, #1A2E1A)' }}
        >
          <Link href="/teams" className="text-sm opacity-60 hover:opacity-90 mb-4 inline-block">
            ← All Teams
          </Link>

          <div className="flex items-center gap-3 mb-5">
            <span className="border border-stone-400/50 text-stone-400 text-sm font-bold px-3 py-1 rounded-full tracking-[0.18em] uppercase">
              † In Memoriam
            </span>
            <span className="text-stone-500 text-xs tracking-wide">2022 – 2024</span>
          </div>

          <div className="flex items-start gap-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={DINO_LOGO}
              alt="Dinwiddie Dinos"
              className="w-20 h-20 object-cover rounded-full bg-white/10 flex-shrink-0 grayscale opacity-70"
            />
            <div className="flex-1 min-w-0">
              <h1 className="text-4xl font-bold mb-1 text-white/90">Dinwiddie Dinos</h1>
              <p className="text-lg text-stone-400 mb-4">Andrew Sharpe · Dinwiddie, VA</p>
              <DinosBioEditor initialValue={content.bio ?? DEFAULT_BIO} />
            </div>
          </div>

          {/* Vacated championship banner */}
          <div className="mt-5 flex gap-3 flex-wrap items-center">
            <span className="bg-stone-600 text-stone-300 text-xs font-bold px-3 py-1.5 rounded-full inline-flex items-center gap-2 line-through decoration-red-400 decoration-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 opacity-50">
                <path d="M2 20h20v-2H2v2z"/>
                <path d="M12 3L9 11 5 8 3 18h18L19 8l-4 3z"/>
              </svg>
              2023 Champion
            </span>
            <span className="bg-red-900/60 border border-red-700/50 text-red-300 text-[11px] font-bold px-2.5 py-1 rounded-full tracking-wide uppercase">
              Vacated
            </span>
          </div>
        </div>

        {/* All-time stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-stone-200 text-center">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">All-Time Record</p>
            <p className="text-2xl font-bold text-stone-700">{totalWins}W – {totalLosses}L</p>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-red-200 text-center">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">Championships</p>
            <p className="text-2xl font-bold text-stone-400 line-through decoration-red-400 decoration-2">1</p>
            <p className="text-[11px] text-red-400 font-semibold mt-0.5 uppercase tracking-wide">Vacated</p>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-stone-200 text-center">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">Playoff Appearances</p>
            <p className="text-2xl font-bold text-stone-700">{playoffApps}</p>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-red-200 text-center">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">Saccko Finishes</p>
            <p className="text-2xl font-bold text-stone-700">{sacckoFinishes}</p>
            <p className="text-[11px] text-red-400 font-semibold mt-0.5 uppercase tracking-wide">Refused to serve</p>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-stone-200 text-center">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">Avg Finish</p>
            <p className="text-2xl font-bold text-stone-700">{avgFinish.toFixed(1)}</p>
          </div>
        </div>

        {/* Season History */}
        <h2 className="text-2xl font-bold mb-5 text-stone-800">Season History</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          {[...history].reverse().map(({ year, standing, finish, madePlayoffs, inLoserBracket, wasChampion, topPlayer }) => (
            <div
              key={year}
              className={`bg-white rounded-xl p-6 shadow-sm border ${
                wasChampion ? 'border-yellow-400' : madePlayoffs ? 'border-green-300' : inLoserBracket ? 'border-red-200' : 'border-stone-200'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <span className="text-lg font-bold text-stone-800">{year}</span>
                <div className="flex gap-1 flex-wrap justify-end">
                  {wasChampion && (
                    <span className="bg-stone-100 text-stone-400 text-xs px-2 py-0.5 rounded-full font-medium line-through decoration-red-400">Champion</span>
                  )}
                  {wasChampion && (
                    <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-medium">Vacated</span>
                  )}
                  {madePlayoffs && !wasChampion && (
                    <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">Playoffs</span>
                  )}
                  {inLoserBracket && (
                    <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">Saccko</span>
                  )}
                  {inLoserBracket && (
                    <span className="bg-orange-100 text-orange-700 text-xs px-2 py-0.5 rounded-full font-medium">Unpunished</span>
                  )}
                </div>
              </div>
              {standing ? (
                <div className="text-sm text-stone-600 space-y-1">
                  <div><span className="font-semibold">Record:</span> {standing.wins}W – {standing.losses}L{standing.ties > 0 ? ` – ${standing.ties}T` : ''}</div>
                  <div><span className="font-semibold">Finish:</span> #{finish}</div>
                  <div><span className="font-semibold">PF:</span> {standing.pointsFor.toFixed(1)}</div>
                  <div><span className="font-semibold">PA:</span> {standing.pointsAgainst.toFixed(1)}</div>
                  {topPlayer && (
                    <div className="pt-2 mt-2 border-t border-stone-100">
                      <span className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Top Player</span>
                      <div className="flex items-center gap-2 mt-1">
                        {topPlayer.photoUrl && (
                          <Image
                            src={topPlayer.photoUrl}
                            alt={topPlayer.playerName}
                            width={36}
                            height={36}
                            className="rounded-full object-cover bg-stone-100 flex-shrink-0"
                            unoptimized
                          />
                        )}
                        <div>
                          <div className="font-semibold text-stone-800">{topPlayer.playerName}</div>
                          <div className="text-xs text-stone-400">{topPlayer.position} · {topPlayer.totalPoints.toFixed(1)} pts</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-stone-400">No data available</p>
              )}
            </div>
          ))}
        </div>

        {/* Top Players All-Time */}
        {topPlayers.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-5 text-stone-800">Top Players All-Time</h2>
            <div className="flex flex-col gap-2">
              {topPlayers.map((p, i) => (
                <div key={p.playerName} className="bg-white rounded-lg border border-stone-200 px-4 py-3 flex items-center gap-4 hover:bg-stone-50 transition">
                  <span className="text-sm font-bold text-stone-300 w-5 flex-shrink-0">{i + 1}</span>
                  {p.photoUrl && (
                    <Image
                      src={p.photoUrl}
                      alt={p.playerName}
                      width={36}
                      height={36}
                      className="rounded-full object-cover bg-stone-100 flex-shrink-0"
                      unoptimized
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-800 text-sm">{p.playerName}</p>
                    <p className="text-xs text-stone-400">{p.position}</p>
                  </div>
                  <span className="text-sm font-bold text-teal-600 flex-shrink-0">
                    {Math.round(p.totalPoints).toLocaleString()} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Head-to-Head Records */}
        <h2 className="text-2xl font-bold mb-5 text-stone-800">Head-to-Head Records</h2>
        <p className="text-sm text-stone-400 mb-4">Results across all three seasons (2022–2024), versus teams by their names at the time.</p>
        <div className="overflow-x-auto overflow-y-hidden mb-12">
          <table className="min-w-full bg-white shadow-md rounded-lg overflow-hidden">
            <thead className="text-white text-sm" style={{ backgroundColor: '#2C2C2C' }}>
              <tr>
                <th className="px-4 py-3 text-left">Opponent</th>
                <th className="px-4 py-3 text-center">W</th>
                <th className="px-4 py-3 text-center">L</th>
                <th className="px-4 py-3 text-center">T</th>
                <th className="px-4 py-3 text-center">Record</th>
              </tr>
            </thead>
            <tbody>
              {h2h.map(({ id, name, wins, losses, ties }) => {
                const total = wins + losses + ties;
                return (
                  <tr key={id} className="border-b hover:bg-stone-50 transition text-sm">
                    <td className="px-4 py-3">
                      <Link href={`/teams/${id}`} className="font-medium hover:text-teal-600 transition">
                        {name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-center text-green-600 font-semibold">{wins}</td>
                    <td className="px-4 py-3 text-center text-red-500 font-semibold">{losses}</td>
                    <td className="px-4 py-3 text-center text-stone-500">{ties}</td>
                    <td className="px-4 py-3 text-center">
                      {total === 0 ? '—' : (
                        <span className={wins > losses ? 'text-green-600' : wins < losses ? 'text-red-500' : 'text-stone-500'}>
                          {wins > losses ? 'Leads' : wins < losses ? 'Trails' : 'Even'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* The Disgrace */}
        <div className="mb-12 rounded-xl overflow-hidden shadow-sm border border-red-200">
          <div className="bg-red-700 px-5 py-3">
            <p className="text-white font-bold text-sm tracking-wide">Circumstances of Removal</p>
          </div>
          <div className="bg-red-50 px-5 py-5 space-y-3">
            <DinosCircumstanceParagraph
              label="2022 Saccko Bracket:"
              field="sacckoText"
              initialValue={content.sacckoText ?? DEFAULT_SACCKO}
            />
            <DinosCircumstanceParagraph
              label={'2023 \u201cChampionship\u201d:'}
              field="championshipText"
              initialValue={content.championshipText ?? DEFAULT_CHAMPIONSHIP}
            />
            <DinosCircumstanceParagraph
              label="Exit from the League:"
              field="exitText"
              initialValue={content.exitText ?? DEFAULT_EXIT}
            />
          </div>
        </div>

        {/* Legacy */}
        <div
          className="rounded-xl p-8 text-center"
          style={{ background: 'linear-gradient(135deg, #2C2C2C, #1A2E1A)' }}
        >
          <p className="text-stone-500 text-xs font-semibold uppercase tracking-widest mb-3">Legacy</p>
          <div className="mb-3">
            <DinosLegacyEditor
              field="legacyQuote"
              initialValue={content.legacyQuote ?? DEFAULT_LEGACY_QUOTE}
              className="text-lg font-medium text-white/75 italic text-center"
            />
          </div>
          <div className="max-w-xl mx-auto">
            <DinosLegacyEditor
              field="legacyText"
              initialValue={content.legacyText ?? DEFAULT_LEGACY_TEXT}
              className="text-sm text-stone-400 leading-relaxed"
            />
          </div>
        </div>

      </main>
    </div>
  );
}
