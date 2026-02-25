import Header from '@/components/Header';
import { getRankings } from '@/lib/store';

export default async function RankingsPage() {
  const { articles } = await getRankings();

  return (
    <div className="min-h-screen bg-sky-50">
      <Header />

      <main className="container mx-auto px-4 py-12">
        <h1 className="text-4xl font-bold mb-2">Rankings</h1>
        <p className="text-gray-500 mb-8">Articles and commentary about where I view the teams during the season.</p>

        <div className="space-y-8">
          {articles.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center">
              <p className="text-gray-600 font-medium">No new rankings for the season yet.</p>
              <p className="text-gray-400 text-sm mt-1">First ranking expected after the keepers deadline.</p>
            </div>
          )}

          {articles.map(article => (
            <article key={article.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="text-2xl font-bold mb-2">{article.title}</h2>
              <p className="text-xs text-gray-400 mb-4">Published {new Date(article.createdAt).toLocaleString()}</p>
              <div className="prose max-w-none text-gray-800">
                {article.content.split(/\n\n+/).map((para: string, i: number) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
