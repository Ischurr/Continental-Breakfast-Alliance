import Header from '@/components/Header';
import MessageBoardForm from './MessageBoardForm';
import PostCard from './PostCard';
import PollsViewer from './PollsViewer';
import { TrashTalkData, Poll } from '@/lib/types';
import { getTrashTalk, getAndProcessPolls } from '@/lib/store';
import { timeAgo } from '@/lib/news-fetcher';
import teamsRaw from '@/data/teams.json';

function getTeamById(id: number) {
  return teamsRaw.teams.find(t => t.id === id);
}

export default async function MessageBoardPage() {
  const data: TrashTalkData = await getTrashTalk();
  // Announcements always pinned to top, then rest newest-first
  const posts = [
    ...data.posts.filter(p => p.postType === 'announcement'),
    ...data.posts.filter(p => p.postType !== 'announcement'),
  ];

  const allPolls: Poll[] = (await getAndProcessPolls()).polls;
  const activePolls = allPolls.filter(p => p.active);
  const closedPolls = allPolls.filter(p => !p.active);

  return (
    <div className="min-h-screen bg-sky-50">
      <Header />

      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-1">Message Board</h1>
        <p className="text-gray-500 mb-10">The league bulletin board — polls, messages, and trash talk.</p>

        {/* ── Polls ──────────────────────────────────────────────── */}
        <PollsViewer activePolls={activePolls} closedPolls={closedPolls} />

        {/* ── Divider ────────────────────────────────────────────── */}
        <div className="border-t border-gray-200 mb-10" />

        {/* ── Post form + feed (narrow column) ───────────────────── */}
        <div className="max-w-2xl">
          <h2 className="text-xl font-bold text-gray-700 mb-6">💬 Posts</h2>

          <MessageBoardForm teams={teamsRaw.teams} polls={allPolls} />

          {posts.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">🤫</p>
              <p className="font-medium">Nothing posted yet. Someone be first.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map(post => {
                const author = getTeamById(post.authorTeamId);
                const target = post.targetTeamId ? getTeamById(post.targetTeamId) : null;
                return (
                  <PostCard
                    key={post.id}
                    post={post}
                    authorDisplayName={author?.displayName ?? ''}
                    authorColor={author?.primaryColor ?? '#e5e7eb'}
                    targetDisplayName={target?.displayName}
                    targetColor={target?.primaryColor}
                    timeAgoStr={timeAgo(post.createdAt)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
