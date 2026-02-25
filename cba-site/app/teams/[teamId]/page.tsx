import Header from '@/components/Header';
import StandingsTable from '@/components/StandingsTable';
import { getAllSeasons, getCurrentSeason, calculateAllTimeStandings, getTeamHeadToHead, getTeamSeasonHistory, getTeamTopPlayersAllTime, getTeamTopPlayerForYear, getTeamKeepersForYear } from '@/lib/data-processor';
import teamsMetadata from '@/data/teams.json';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { TrashTalkData } from '@/lib/types';
import { getTrashTalk, getTeamContent } from '@/lib/store';
import { TeamBioEditor, TeamStrengthsEditor } from './TeamContentEditor';

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

  const seasons = getAllSeasons();
  const currentSeason = getCurrentSeason();
  const team = currentSeason.teams.find(t => t.id === id);

  if (!team) notFound();

  const meta = teamsMetadata.teams.find(t => t.id === id);
  const allTimeStats = calculateAllTimeStandings().find(t => t.teamId === id);
  const seasonHistory = getTeamSeasonHistory(id);
  const topPlayersAllTime = getTeamTopPlayersAllTime(id, 5);

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

  return (
    <div className="min-h-screen bg-sky-50">
      <Header />

      <main className="container mx-auto px-4 py-12">
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
              <p className="text-lg opacity-80 mb-4">{team.owner}</p>
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
              <div key={label} className="bg-white rounded-xl p-5 shadow-sm border text-center">
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

        {/* Top Players All-Time */}
        {topPlayersAllTime.length > 0 && (
          <div className="mb-10">
            <h2 className="text-2xl font-bold mb-4">Top Players All-Time</h2>
            <div className="flex flex-col gap-2">
              {topPlayersAllTime.map((p, i) => (
                <div key={p.playerName} className="bg-white rounded-lg border px-4 py-3 flex items-center gap-4 hover:bg-sky-50 transition">
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

        {/* Season-by-season history */}
        <h2 className="text-2xl font-bold mb-5">Season History</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          {[...seasonHistory].reverse().map(({ year, standing, finish, madePlayoffs, inLoserBracket, wasChampion }) => {
            const topPlayer = getTeamTopPlayerForYear(id, year);
            const keepers = getTeamKeepersForYear(id, year);
            return (
            <div
              key={year}
              className={`bg-white rounded-xl p-6 shadow-sm border ${
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
                  {keepers.length > 0 && (
                    <div className="pt-2 mt-2 border-t border-gray-100">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Keepers</span>
                      <div
                        className="mt-2 grid gap-1"
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
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No data available</p>
              )}
            </div>
            );
          })}
        </div>

        {/* Head-to-Head records */}
        <h2 className="text-2xl font-bold mb-5">Head-to-Head Records</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white shadow-md rounded-lg overflow-hidden">
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
              <h2 className="text-xl font-bold text-gray-700">💬 Message Board</h2>
              <Link href="/message-board" className="text-sm text-teal-600 hover:underline font-medium">
                View all posts →
              </Link>
            </div>
            <div className="space-y-4">
              {teamPosts.map(post => {
                const authorMeta = teamsMetadata.teams.find(t => t.id === post.authorTeamId);
                const targetMeta = post.targetTeamId
                  ? teamsMetadata.teams.find(t => t.id === post.targetTeamId)
                  : null;
                const diff = Date.now() - new Date(post.createdAt).getTime();
                const minutes = Math.floor(diff / 60000);
                const timeStr = minutes < 1 ? 'just now'
                  : minutes < 60 ? `${minutes}m ago`
                  : Math.floor(minutes / 60) < 24 ? `${Math.floor(minutes / 60)}h ago`
                  : `${Math.floor(minutes / (60 * 24))}d ago`;
                return (
                  <div
                    key={post.id}
                    className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm"
                    style={{ borderLeftColor: authorMeta?.primaryColor ?? '#e5e7eb', borderLeftWidth: 4 }}
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
                      <span className="text-xs text-gray-300 shrink-0">{timeStr}</span>
                    </div>
                    {post.message && (
                      <p className="text-sm text-gray-700 leading-relaxed">{post.message}</p>
                    )}
                    {post.videoUrl && (
                      <p className="text-xs text-teal-600 mt-1 font-medium">📹 Video — <Link href="/message-board" className="hover:underline">view on Message Board</Link></p>
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
