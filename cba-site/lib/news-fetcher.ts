export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  summary: string;
  source: string;
  author?: string;
}

const FEEDS = [
  { url: 'https://www.mlb.com/feeds/news/rss.xml', source: 'MLB.com' },
  { url: 'https://www.espn.com/espn/rss/mlb/news', source: 'ESPN' },
  { url: 'https://www.cbssports.com/rss/headlines/mlb/', source: 'CBS Sports' },
  { url: 'https://sports.yahoo.com/mlb/rss.xml', source: 'Yahoo Sports' },
  { url: 'https://bleacherreport.com/mlb.rss', source: 'Bleacher Report' },
  { url: 'https://www.baseballprospectus.com/feed/', source: 'Baseball Prospectus' },
];

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function extractTag(xml: string, tag: string): string {
  // Handle both <tag>value</tag> and CDATA: <tag><![CDATA[value]]></tag>
  const cdataMatch = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i').exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();
  const plainMatch = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml);
  if (plainMatch) return plainMatch[1].trim();
  return '';
}

function parseItems(xml: string, source: string): NewsItem[] {
  const itemMatches = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  return itemMatches.slice(0, 15).map(item => {
    const title = stripHtml(extractTag(item, 'title'));
    const link = extractTag(item, 'link') || extractTag(item, 'guid');
    const pubDate = extractTag(item, 'pubDate') || extractTag(item, 'dc:date');
    const summary = stripHtml(
      extractTag(item, 'description') || extractTag(item, 'content:encoded') || ''
    ).slice(0, 200);
    const author = stripHtml(extractTag(item, 'dc:creator') || extractTag(item, 'author'));
    return { title, link, pubDate, summary, source, author: author || undefined };
  }).filter(item => item.title && item.link);
}

async function fetchFeed(url: string, source: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CBANews/1.0)' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseItems(xml, source);
  } catch {
    return [];
  }
}

export async function fetchBaseballNews(): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    FEEDS.map(f => fetchFeed(f.url, f.source))
  );

  const all: NewsItem[] = [];
  results.forEach(r => {
    if (r.status === 'fulfilled') all.push(...r.value);
  });

  all.sort((a, b) => {
    const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
    const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
    return db - da;
  });

  return all.slice(0, 40);
}

const STOPWORDS = new Set([
  'that', 'with', 'from', 'this', 'they', 'have', 'will', 'what', 'when',
  'more', 'been', 'were', 'their', 'about', 'into', 'after', 'over', 'just',
  'make', 'also', 'some', 'week', 'game', 'year', 'says', 'said', 'would',
  'could', 'should', 'team', 'player', 'season', 'first', 'back', 'gets',
  'mlb', 'espn', 'news', 'report', 'here', 'deal', 'sign', 'trade',
]);

function extractKeywords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w));
}

// Finds the story from the last 3 days discussed most across multiple sources.
export async function getHottestStory(): Promise<NewsItem | null> {
  const news = await fetchBaseballNews();
  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const recent = news.filter(item => {
    const d = new Date(item.pubDate).getTime();
    return !isNaN(d) && d >= threeDaysAgo;
  });

  const pool = recent.length >= 5 ? recent : news.slice(0, 20);
  if (pool.length === 0) return null;

  const scored = pool.map(item => {
    const kw = new Set(extractKeywords(item.title));
    let score = 0;
    const matchingSources = new Set<string>();
    for (const other of pool) {
      if (other === item) continue;
      const shared = extractKeywords(other.title).filter(w => kw.has(w)).length;
      if (shared >= 2) {
        score += shared;
        matchingSources.add(other.source);
      }
    }
    return { item, score: score + matchingSources.size * 3 };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.item ?? null;
}

export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
