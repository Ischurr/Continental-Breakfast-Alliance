'use client';

export interface TickerItem {
  emoji: string;
  title: string;
  dateLabel: string;
  countdown: string;
}

export default function EventTickerBanner({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;

  // Repeat items enough so content fills any viewport width (~400px per item)
  const repeat = Math.max(2, Math.ceil(4 / items.length));
  const repeated = Array.from({ length: repeat }, () => items).flat();

  // Duration keeps ~80px/s reading speed regardless of item count
  const duration = repeat * items.length * 5;

  const renderSet = repeated.map((item, i) => (
    <span key={i} className="inline-flex items-center gap-2 px-8 shrink-0">
      <span>{item.emoji}</span>
      <span className="font-semibold tracking-tight">{item.title}</span>
      <span className="text-white/40 px-1">·</span>
      <span className="text-white/70">{item.dateLabel}</span>
      <span className="text-white/40 px-1">·</span>
      <span className="font-bold text-yellow-300">{item.countdown}</span>
      <span className="text-white/20 pl-6">|</span>
    </span>
  ));

  return (
    <div className="bg-blue-950 text-white text-xs py-2.5 overflow-hidden border-b border-blue-900/60 select-none">
      <div
        className="flex whitespace-nowrap"
        style={{ animation: `ticker-scroll ${duration}s linear infinite` }}
      >
        <div className="flex">{renderSet}</div>
        {/* Duplicate for seamless loop */}
        <div className="flex" aria-hidden="true">{renderSet}</div>
      </div>
    </div>
  );
}
