import Header from '@/components/Header';
import { Poll } from '@/lib/types';
import { getPolls } from '@/lib/store';
import PollCard from './PollCard';

export default async function PollsPage() {
  const polls: Poll[] = (await getPolls()).polls;
  const active = polls.filter(p => p.active);
  const closed = polls.filter(p => !p.active);

  // admin state is client-side; we'll render server component normally then

  return (
    <div className="min-h-screen bg-sky-50">
      <Header />
      <main className="container mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-2">League Polls</h1>
        <p className="text-gray-500 mb-10">Vote on league decisions and rule changes</p>
        {/* admin UI is now on /message-board; this page redirects there */}

        {polls.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-10 text-center text-gray-400">
            No polls yet. Add one to <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">data/polls.json</code> to get started.
          </div>
        )}

        {active.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-bold text-gray-700 mb-4">Open Polls</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {active.map(poll => <PollCard key={poll.id} poll={poll} />)}
            </div>
          </section>
        )}

        {closed.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-gray-700 mb-4">Closed Polls</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {closed.map(poll => <PollCard key={poll.id} poll={poll} showResults />)}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
