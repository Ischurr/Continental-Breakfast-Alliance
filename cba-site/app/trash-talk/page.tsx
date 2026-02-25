import Header from '@/components/Header';
import TrashTalkForm from './TrashTalkForm';
import { TrashTalkData } from '@/lib/types';
import { getTrashTalk } from '@/lib/store';
import teamsRaw from '@/data/teams.json';

function getTeamById(id: number) {
  return teamsRaw.teams.find(t => t.id === id);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function TrashTalkPage() {
  const data: TrashTalkData = await getTrashTalk();
  const posts = data.posts;

  return (
    <div className="min-h-screen bg-sky-50">
      <Header />

      <main className="container mx-auto px-4 py-12 max-w-2xl">
        <h1 className="text-4xl font-bold mb-1">Trash Talk</h1>
        <p className="text-gray-500 mb-8">Say something. We're all listening.</p>

        <TrashTalkForm teams={teamsRaw.teams} />

        {posts.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">🤫</p>
            <p className="font-medium">No trash talk yet. Someone be first.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map(post => {
              const author = getTeamById(post.authorTeamId);
              const target = post.targetTeamId ? getTeamById(post.targetTeamId) : null;
              return (
                <div
                  key={post.id}
                  className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm"
                  style={{ borderLeftColor: author?.primaryColor ?? '#e5e7eb', borderLeftWidth: 4 }}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <span className="font-semibold text-sm text-gray-800">{post.authorName}</span>
                      <span className="text-xs text-gray-400 ml-2">{author?.displayName}</span>
                      {target && (
                        <span className="ml-2 text-xs bg-red-50 text-red-500 font-medium px-2 py-0.5 rounded-full border border-red-100">
                          → {target.displayName}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-300 shrink-0">{timeAgo(post.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{post.message}</p>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
