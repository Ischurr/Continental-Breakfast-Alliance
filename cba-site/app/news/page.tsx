import Header from '@/components/Header';
import { fetchBaseballNews, timeAgo } from '@/lib/news-fetcher';

export const revalidate = 3600; // refresh every hour

const SOURCE_COLORS: Record<string, string> = {
  'MLB.com': 'bg-teal-100 text-teal-700',
  'ESPN': 'bg-red-100 text-red-700',
  'CBS Sports': 'bg-sky-100 text-sky-700',
  'Yahoo Sports': 'bg-purple-100 text-purple-700',
  'Bleacher Report': 'bg-orange-100 text-orange-700',
  'Baseball Prospectus': 'bg-green-100 text-green-700',
};

export default async function NewsPage() {
  const items = await fetchBaseballNews();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="container mx-auto px-4 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">Baseball News</h1>
          <p className="text-gray-500 text-sm">Latest headlines from MLB.com, ESPN, CBS Sports, Yahoo Sports, Bleacher Report, and Baseball Prospectus</p>
        </div>

        {items.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm border">
            <p className="text-gray-400 text-lg">Unable to load news at the moment. Check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item, i) => (
              <a
                key={i}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group bg-white rounded-xl shadow-sm border hover:shadow-md transition-all duration-200 flex flex-col overflow-hidden"
              >
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SOURCE_COLORS[item.source] ?? 'bg-gray-100 text-gray-600'}`}>
                      {item.source}
                    </span>
                    {item.pubDate && (
                      <span className="text-xs text-gray-400">{timeAgo(item.pubDate)}</span>
                    )}
                  </div>

                  <h2 className="text-sm font-bold text-gray-900 leading-snug mb-2 group-hover:text-blue-600 transition-colors line-clamp-3">
                    {item.title}
                  </h2>

                  {item.summary && (
                    <p className="text-xs text-gray-500 leading-relaxed line-clamp-3 flex-1">
                      {item.summary}
                    </p>
                  )}

                  {item.author && (
                    <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
                      {item.author}
                    </p>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
