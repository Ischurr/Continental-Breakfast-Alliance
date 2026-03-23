import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import EventTickerBanner, { type TickerItem } from '@/components/EventTickerBanner';
import { getAllEventsWithin, formatCountdown, formatEventDate } from '@/lib/calendar';
import { getAndProcessPolls, getTrashTalk } from '@/lib/store';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Continental Breakfast Alliance",
    template: "%s | CBA Fantasy Baseball",
  },
  description:
    "The home of the Continental Breakfast Alliance fantasy baseball league — stats, standings, history, and more.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const upcomingEvents = getAllEventsWithin(7);
  const [pollsData, trashData] = await Promise.all([getAndProcessPolls(), getTrashTalk()]);

  const oneDayMs = 24 * 60 * 60 * 1000;
  const recentlyClosedPolls = pollsData.polls.filter(poll => {
    if (poll.active || !poll.expiresAt) return false;
    const closedAt = new Date(poll.expiresAt + 'T23:59:59').getTime();
    return Date.now() - closedAt < oneDayMs;
  });

  const eventTickerItems: TickerItem[] = upcomingEvents.map(e => {
    const cd = formatCountdown(e.date);
    return {
      emoji: e.emoji,
      title: e.title,
      dateLabel: formatEventDate(e.date, e.timeLabel),
      countdown: `${cd.number} ${cd.unit}`,
    };
  });

  const pollTickerItems: TickerItem[] = recentlyClosedPolls.map(poll => {
    const total = poll.options.reduce((s, o) => s + o.votes, 0);
    const winner = total > 0
      ? poll.options.reduce((best, o) => o.votes > best.votes ? o : best)
      : null;
    return {
      emoji: '🗳️',
      title: poll.question,
      dateLabel: winner ? winner.text : 'No votes cast',
      countdown: winner ? `${Math.round((winner.votes / total) * 100)}%` : '—',
    };
  });

  const fiveDayMs = 5 * 24 * 60 * 60 * 1000;
  const announcementTickerItems: TickerItem[] = trashData.posts
    .filter(p => p.postType === 'announcement' && Date.now() - new Date(p.createdAt).getTime() < fiveDayMs)
    .map(p => ({
      emoji: '📣',
      title: p.subject ?? 'League Bulletin',
      dateLabel: 'Commissioner',
      countdown: 'Read →',
      href: `/message-board#${p.id}`,
    }));

  const tickerItems: TickerItem[] = [...announcementTickerItems, ...eventTickerItems, ...pollTickerItems];

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <EventTickerBanner items={tickerItems} />
        {children}
      </body>
    </html>
  );
}
