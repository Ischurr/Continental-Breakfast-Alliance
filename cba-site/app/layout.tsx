import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import EventTickerBanner, { type TickerItem } from '@/components/EventTickerBanner';
import { getAllEventsWithin, formatCountdown, formatEventDate } from '@/lib/calendar';

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const upcomingEvents = getAllEventsWithin(7);
  const tickerItems: TickerItem[] = upcomingEvents.map(e => {
    const cd = formatCountdown(e.date);
    return {
      emoji: e.emoji,
      title: e.title,
      dateLabel: formatEventDate(e.date, e.timeLabel),
      countdown: `${cd.number} ${cd.unit}`,
    };
  });

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
