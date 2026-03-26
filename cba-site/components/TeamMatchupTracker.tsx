'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface TrackerProps {
  weekNum: number;
  myName: string;
  myLogo?: string;
  myScore: number;
  myWon: boolean | null; // null = not final
  oppName: string;
  oppLogo?: string;
  oppScore: number;
  isFinal: boolean;
  inProgress: boolean;
}

export default function TeamMatchupTracker({
  weekNum,
  myName,
  myLogo,
  myScore,
  myWon,
  oppName,
  oppLogo,
  oppScore,
  isFinal,
  inProgress,
}: TrackerProps) {
  const router = useRouter();

  // Re-fetch server data every hour so scores stay current
  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [router]);

  const statusLabel = isFinal
    ? myWon ? 'Win' : 'Loss'
    : inProgress ? 'In Progress' : 'Upcoming';

  const statusColor = isFinal
    ? myWon
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-gray-200 text-gray-500'
    : inProgress
    ? 'bg-sky-200 text-sky-700'
    : 'bg-amber-100 text-amber-700';

  const cardBg = isFinal
    ? 'bg-slate-200 border-gray-300'
    : inProgress
    ? 'bg-sky-50 border-sky-300'
    : 'bg-slate-100 border-gray-200';

  return (
    <div className="mb-6">
      <Link href="/matchups" className="block group">
        <div className={`rounded-xl shadow-sm border px-6 py-4 flex items-center gap-4 transition-opacity group-hover:opacity-90 ${cardBg}`}>
          {/* Status badge */}
          <div className="flex-shrink-0 text-center min-w-[80px]">
            <span className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${statusColor}`}>
              {statusLabel}
            </span>
            <p className="text-xs text-gray-500 mt-1">Week {weekNum}</p>
          </div>

          {/* This team */}
          <div className="flex items-center gap-3 flex-1">
            {myLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={myLogo} alt="" className="w-9 h-9 rounded-full object-cover bg-white/30 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">{myName}</p>
              <p className={`text-2xl font-bold leading-tight ${myWon === true ? 'text-emerald-700' : myWon === false ? 'text-gray-500' : 'text-gray-800'}`}>
                {myScore > 0 ? myScore.toFixed(1) : '–'}
              </p>
            </div>
          </div>

          {/* VS */}
          <div className="text-gray-400 font-semibold text-sm flex-shrink-0">vs</div>

          {/* Opponent */}
          <div className="flex items-center gap-3 flex-1 justify-end">
            <div className="min-w-0 text-right">
              <p className="font-semibold text-gray-900 text-sm truncate">{oppName}</p>
              <p className={`text-2xl font-bold leading-tight ${myWon === false ? 'text-red-600' : isFinal ? 'text-gray-400' : 'text-gray-800'}`}>
                {oppScore > 0 ? oppScore.toFixed(1) : '–'}
              </p>
            </div>
            {oppLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={oppLogo} alt="" className="w-9 h-9 rounded-full object-cover bg-white/30 flex-shrink-0" />
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}
