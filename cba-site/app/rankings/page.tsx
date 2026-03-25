import Header from '@/components/Header';
import { getRankings } from '@/lib/store';
import RankingsClient from './RankingsClient';

export default async function RankingsPage() {
  const { articles } = await getRankings();

  return (
    <div className="min-h-screen bg-sky-50">
      <Header />

      <main className="container mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-2">Rankings</h1>
        <p className="text-gray-500 mb-8">Articles and commentary about where I view the teams during the season.</p>

        <RankingsClient articles={articles} />
      </main>
    </div>
  );
}
