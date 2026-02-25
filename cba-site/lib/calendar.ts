export interface CalendarEvent {
  title: string;
  date: Date;
  emoji: string;
  timeLabel?: string; // e.g. "3:00 PM ET"
  type: 'deadline' | 'cba' | 'mlb';
}

export const CBA_EVENTS: CalendarEvent[] = [
  {
    title: 'World Baseball Classic Begins',
    date: new Date('2026-03-05'),
    emoji: '⚾',
    type: 'mlb',
  },
  {
    title: 'Keeper Submission Deadline',
    date: new Date('2026-03-07T20:00:00Z'), // 3:00 PM EST (UTC-5)
    emoji: '⏰',
    timeLabel: '3:00 PM ET',
    type: 'deadline',
  },
  {
    title: 'CBA Draft',
    date: new Date('2026-03-23'),
    emoji: '📋',
    type: 'cba',
  },
  {
    title: 'MLB Opening Day',
    date: new Date('2026-03-25'),
    emoji: '⚾',
    type: 'mlb',
  },
  {
    title: 'MLB All-Star Break',
    date: new Date('2026-06-11'),
    emoji: '⭐',
    type: 'mlb',
  },
  {
    title: 'Rivalry Week Begins',
    date: new Date('2026-06-29'),
    emoji: '🔥',
    type: 'cba',
  },
  {
    title: 'Regular Season Ends',
    date: new Date('2026-08-30'),
    emoji: '🏁',
    type: 'cba',
  },
  {
    title: 'Playoffs Begin',
    date: new Date('2026-08-31'),
    emoji: '🏆',
    type: 'cba',
  },
  {
    title: 'Championship Match',
    date: new Date('2026-09-14'),
    emoji: '🥇',
    type: 'cba',
  },
  {
    title: 'League Season Ends',
    date: new Date('2026-09-27'),
    emoji: '🎉',
    type: 'cba',
  },
];

/** Returns all upcoming events within `days` days, sorted by date. */
export function getAllEventsWithin(days: number): CalendarEvent[] {
  const now = new Date();
  const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return CBA_EVENTS
    .filter(e => e.date > now && e.date <= cutoff)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Returns the soonest upcoming event within `days` days, or null if none. */
export function getNextEventWithin(days: number): CalendarEvent | null {
  const now = new Date();
  const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const upcoming = CBA_EVENTS
    .filter(e => e.date > now && e.date <= cutoff)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  return upcoming[0] ?? null;
}

export function formatCountdown(date: Date): { number: string; unit: string } {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  if (diffMs <= 0) return { number: '!', unit: 'Today' };
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours < 24) {
    const h = Math.ceil(diffHours);
    return { number: String(h), unit: `Hr${h !== 1 ? 's' : ''}` };
  }
  const diffDays = Math.round(diffHours / 24);
  return { number: String(diffDays), unit: `Day${diffDays !== 1 ? 's' : ''}` };
}

export function formatEventDate(date: Date, timeLabel?: string): string {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
  return timeLabel ? `${formatted} · ${timeLabel}` : formatted;
}
