import Header from '@/components/Header';
import USMapHero from '@/components/USMapHero';
import Link from 'next/link';
import Image from 'next/image';
import { getAllSeasons, getCurrentSeason, getCompletedSeasons, calculateAllTimeStandings, getTopMatchupOfWeek, getNotableAvailablePlayers } from '@/lib/data-processor';
import { getHottestStory, timeAgo } from '@/lib/news-fetcher';
import { Poll, TrashTalkData } from '@/lib/types';
import { getPolls, getTrashTalk } from '@/lib/store';
import teamsJson from '@/data/teams.json';
import PollCard from './polls/PollCard';

const SOURCE_COLORS: Record<string, string> = {
  'MLB.com': 'bg-teal-100 text-teal-700',
  'ESPN': 'bg-red-100 text-red-700',
  'CBS Sports': 'bg-sky-100 text-sky-700',
  'Yahoo Sports': 'bg-purple-100 text-purple-700',
  'Bleacher Report': 'bg-orange-100 text-orange-700',
  'Baseball Prospectus': 'bg-green-100 text-green-700',
};

export default async function Home() {
  const seasons = getAllSeasons();
  const completedSeasons = getCompletedSeasons();
  const currentSeason = getCurrentSeason();
  const allTimeStandings = calculateAllTimeStandings();

  const mostChampionships = allTimeStandings.reduce((prev, curr) =>
    curr.championships > prev.championships ? curr : prev
  );
  const mostChampionshipsTeam = currentSeason.teams.find(
    t => t.id === mostChampionships.teamId
  );
  const champion = currentSeason.teams.find(t => t.id === currentSeason.champion);

  const [hottestStory, topMatchupData, freeAgents] = await Promise.all([
    getHottestStory(),
    Promise.resolve(getTopMatchupOfWeek()),
    Promise.resolve(getNotableAvailablePlayers(5)),
  ]);

  const activePolls: Poll[] = (await getPolls()).polls.filter((p: Poll) => p.active);

  const allPosts: TrashTalkData['posts'] = (await getTrashTalk()).posts;
  // Show posts from the last 72 hours; if none, fall back to the single latest post
  const windowMs = 72 * 60 * 60 * 1000;
  const withinWindow = allPosts.filter(p => Date.now() - new Date(p.createdAt).getTime() < windowMs);
  const recentPosts: TrashTalkData['posts'] = withinWindow.length > 0 ? withinWindow : allPosts.slice(0, 1);
  const teamsMeta: { id: number; displayName: string; primaryColor: string; owner: string }[] = teamsJson.teams;

  return (
    <div className="min-h-screen bg-sky-50">
      <Header />

      {/* Hero — US map with team locations */}
      <div className="relative">
        <USMapHero />
        {/* Banner text overlay — top-left of the map */}
        <div className="absolute top-0 left-0 z-10 px-8 pt-5 md:pt-8 text-white pointer-events-none">
          <p className="text-teal-300 text-xs font-semibold uppercase tracking-widest mb-1 drop-shadow">Est. 2022 · 10 Teams · Keeper League · ESPN</p>
          <h1 className="text-2xl md:text-3xl font-bold drop-shadow-lg">
            Continental Breakfast Alliance
          </h1>
          <div className="flex flex-wrap gap-3 mt-4 pointer-events-auto">
            <Link
              href="/standings"
              className="bg-white text-teal-700 px-4 py-2 rounded-lg font-semibold hover:bg-teal-50 transition text-sm shadow"
            >
              Current Standings
            </Link>
            <Link
              href="/teams"
              className="bg-violet-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-violet-400 transition border border-violet-400 text-sm shadow"
            >
              View All Teams
            </Link>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 pb-12">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 mb-12 relative z-20">
          <div className="bg-white p-6 rounded-xl shadow-lg border">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Latest Champion
            </p>
            <p className="text-2xl font-bold text-teal-700">{champion?.name ?? 'TBD'}</p>
            <p className="text-gray-400 text-sm mt-1">{currentSeason.year} Season</p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-lg border">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Most Championships
            </p>
            <p className="text-2xl font-bold text-teal-700">
              {mostChampionshipsTeam?.name ?? 'TBD'}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              {mostChampionships.championships} title
              {mostChampionships.championships !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-lg border">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
              Seasons Completed
            </p>
            <p className="text-2xl font-bold text-teal-700">{completedSeasons.length}</p>
            <p className="text-gray-400 text-sm mt-1">2022 &ndash; {currentSeason.year}</p>
          </div>
        </div>

        {/* League Pulse */}
        <h2 className="text-xl font-bold text-gray-700 mb-4">League Pulse</h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">

          {/* Hot Story */}
          <div className="bg-white rounded-xl shadow-sm border p-6 flex flex-col">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              🔥 Most Talked About
            </p>
            {hottestStory ? (
              <a
                href={hottestStory.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col flex-1"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SOURCE_COLORS[hottestStory.source] ?? 'bg-gray-100 text-gray-600'}`}>
                    {hottestStory.source}
                  </span>
                  {hottestStory.pubDate && (
                    <span className="text-xs text-gray-400">{timeAgo(hottestStory.pubDate)}</span>
                  )}
                </div>
                <p className="font-bold text-gray-900 leading-snug text-sm group-hover:text-teal-600 transition flex-1">
                  {hottestStory.title}
                </p>
                {hottestStory.summary && (
                  <p className="text-xs text-gray-500 mt-2 line-clamp-3">
                    {hottestStory.summary}
                  </p>
                )}
                <p className="text-xs text-teal-600 mt-3 font-medium">Read story →</p>
              </a>
            ) : (
              <p className="text-sm text-gray-400 flex-1">No recent stories found.</p>
            )}
          </div>

          {/* Game of the Week */}
          <div className="bg-white rounded-xl shadow-sm border p-6 flex flex-col">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              ⚡ Game of the Week
            </p>
            {topMatchupData ? (() => {
              const { matchup, week, useHistorical, teams, standings } = topMatchupData;
              const homeTeam = teams.find(t => t.id === matchup.home.teamId);
              const awayTeam = teams.find(t => t.id === matchup.away.teamId);
              const homeStanding = standings.find(s => s.teamId === matchup.home.teamId);
              const awayStanding = standings.find(s => s.teamId === matchup.away.teamId);
              const isComplete = matchup.winner !== undefined;

              const getRecord = (standing: typeof homeStanding) =>
                standing ? `${standing.wins}-${standing.losses}` : '—';

              return (
                <Link href="/matchups" className="flex flex-col flex-1 group">
                  <p className="text-xs text-gray-400 mb-3">
                    Week {week} &bull; {useHistorical ? 'Top all-time records' : 'Best combined record'}
                  </p>
                  <div className="space-y-2 flex-1">
                    {[
                      { team: awayTeam, standing: awayStanding, score: matchup.away.totalPoints, won: matchup.winner === matchup.away.teamId },
                      { team: homeTeam, standing: homeStanding, score: matchup.home.totalPoints, won: matchup.winner === matchup.home.teamId },
                    ].map(({ team, standing, score, won }) => (
                      <div
                        key={team?.id}
                        className={`flex items-center justify-between p-3 rounded-lg ${won ? 'bg-green-50 border border-green-200' : isComplete ? 'bg-red-50 border border-red-100' : 'bg-sky-50 border border-sky-100'}`}
                      >
                        <div>
                          <p className={`font-semibold text-sm ${won ? 'text-green-700' : 'text-gray-800'}`}>
                            {team?.name ?? '—'}
                          </p>
                          <p className="text-xs text-gray-400">{getRecord(standing)} this season</p>
                        </div>
                        {isComplete && (
                          <span className={`text-lg font-bold ${won ? 'text-green-700' : 'text-gray-400'}`}>
                            {score.toFixed(1)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-teal-600 mt-3 font-medium group-hover:underline">See all matchups →</p>
                </Link>
              );
            })() : (
              <p className="text-sm text-gray-400 flex-1">No matchup data available yet.</p>
            )}
          </div>

          {/* Notable Free Agents */}
          <div className="bg-white rounded-xl shadow-sm border p-6 flex flex-col">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              🎯 Top Available Players
            </p>
            <p className="text-xs text-gray-400 mb-3">Players not on any current roster, ranked by historical pts</p>
            {freeAgents.length > 0 ? (
              <div className="space-y-2 flex-1">
                {freeAgents.map((p, i) => (
                  <div key={p.playerName} className="flex items-center gap-3">
                    <span className="text-xs text-gray-300 font-bold w-4">{i + 1}</span>
                    {p.photoUrl && (
                      <Image
                        src={p.photoUrl}
                        alt={p.playerName}
                        width={32}
                        height={32}
                        className="rounded-full object-cover bg-gray-100 flex-shrink-0"
                        unoptimized
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{p.playerName}</p>
                      <p className="text-xs text-gray-400">{p.position}</p>
                    </div>
                    <span className="text-sm font-bold text-teal-600 flex-shrink-0">
                      {Math.round(p.totalPoints).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 flex-1">No roster data available.</p>
            )}
          </div>
        </div>

        {/* Active Polls */}
        {activePolls.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-700">🗳️ Active Polls</h2>
              <Link href="/message-board" className="text-sm text-teal-600 hover:underline font-medium">See all polls →</Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {activePolls.map(poll => <PollCard key={poll.id} poll={poll} />)}
            </div>
          </div>
        )}

        {/* Latest Messages */}
        {recentPosts.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-700">💬 Latest Messages</h2>
              <Link href="/message-board" className="text-sm text-teal-600 hover:underline font-medium">See all →</Link>
            </div>
            <div className="space-y-3">
              {recentPosts.map(post => {
                const author = teamsMeta.find(t => t.id === post.authorTeamId);
                const target = post.targetTeamId ? teamsMeta.find(t => t.id === post.targetTeamId) : null;
                return (
                  <div
                    key={post.id}
                    className="bg-white rounded-xl border border-gray-200 px-5 py-4 shadow-sm"
                    style={{ borderLeftColor: author?.primaryColor ?? '#e5e7eb', borderLeftWidth: 4 }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm text-gray-800">{post.authorName}</span>
                      <span className="text-xs text-gray-400">{author?.displayName}</span>
                      {target && (
                        <span className="text-xs bg-red-50 text-red-500 font-medium px-2 py-0.5 rounded-full border border-red-100">
                          → {target.displayName}
                        </span>
                      )}
                    </div>
                    {post.message && <p className="text-sm text-gray-700">{post.message}</p>}
                    {post.videoUrl && (
                      <p className="text-xs text-teal-600 mt-1 font-medium">📹 Video attached</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Navigation Cards */}
        <h2 className="text-xl font-bold text-gray-700 mb-4">Explore the League</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              href: '/matchups',
              title: 'Weekly Matchups',
              desc: "Browse scores and results from every week's head-to-head battles.",
            },
            {
              href: '/playoffs',
              title: 'Playoff Bracket',
              desc: 'Championship bracket results and the coveted Saccko bracket.',
            },
            {
              href: '/stats/players',
              title: 'Player Stats',
              desc: 'Top weekly performers and highest individual scoring games.',
            },
            {
              href: '/stats/teams',
              title: 'Team Stats',
              desc: 'Biggest wins, rivalries, highest scoring weeks, and more.',
            },
            {
              href: '/history',
              title: 'League History',
              desc: 'All-time standings and year-by-year season breakdowns.',
            },
            {
              href: '/message-board',
              title: 'Message Board & Polls',
              desc: 'Post messages, trash talk, videos, and vote on league polls — all in one place.',
            },
          ].map(({ href, title, desc }) => (
            <Link href={href} key={href} className="group">
              <div className="bg-white p-7 rounded-xl shadow-sm border hover:shadow-md hover:border-violet-200 transition h-full">
                <h3 className="text-lg font-bold mb-2 group-hover:text-teal-600 transition">
                  {title}
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
