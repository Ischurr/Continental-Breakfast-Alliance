'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface TrackerProps {
  teamId: number;
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
  myWinPct?: number;
}

interface LiveMatchup {
  week: number;
  homeTeamId: number;
  homeScore: number;
  awayTeamId: number;
  awayScore: number;
  winner?: string;
}

export default function TeamMatchupTracker({
  teamId,
  weekNum,
  myName,
  myLogo,
  myScore: initialMyScore,
  myWon: initialMyWon,
  oppName,
  oppLogo,
  oppScore: initialOppScore,
  isFinal: initialIsFinal,
  inProgress: initialInProgress,
  myWinPct,
}: TrackerProps) {
  const [myScore, setMyScore] = useState(initialMyScore);
  const [oppScore, setOppScore] = useState(initialOppScore);
  const [isFinal, setIsFinal] = useState(initialIsFinal);
  const [myWon, setMyWon] = useState(initialMyWon);
  const [inProgress, setInProgress] = useState(initialInProgress);

  useEffect(() => {
    async function fetchLiveScores() {
      try {
        const res = await fetch('/api/live-scores', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json() as { week: number; matchups: LiveMatchup[] };
        const matchup = json.matchups.find(
          m => m.homeTeamId === teamId || m.awayTeamId === teamId
        );
        if (!matchup) return;
        const isHome = matchup.homeTeamId === teamId;
        const newMyScore = isHome ? matchup.homeScore : matchup.awayScore;
        const newOppScore = isHome ? matchup.awayScore : matchup.homeScore;
        const newIsFinal = matchup.winner !== undefined;
        const newMyWon = newIsFinal
          ? matchup.winner === (isHome ? 'HOME' : 'AWAY')
          : null;
        setMyScore(newMyScore);
        setOppScore(newOppScore);
        setIsFinal(newIsFinal);
        setMyWon(newMyWon);
        setInProgress(!newIsFinal && (newMyScore > 0 || newOppScore > 0));
      } catch {
        // silently fail — keep showing last known scores
      }
    }

    // Fetch immediately on mount, then every hour
    fetchLiveScores();
    const interval = setInterval(fetchLiveScores, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [teamId]);

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

  const oppWinPct = myWinPct !== undefined ? Math.round((100 - myWinPct) * 10) / 10 : undefined;
  const showWinProb = !isFinal && myWinPct !== undefined;

  return (
    <div className="mb-6">
      <Link href="/matchups" className="block group">
        <div className={`rounded-xl shadow-sm border px-6 py-4 transition-opacity group-hover:opacity-90 ${cardBg}`}>
          {/* Main row: status + teams + scores */}
          <div className="flex items-center gap-4">
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
            <div className="text-gray-400 font-semibold text-sm flex-shrink-0 w-8 text-center">vs</div>

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

          {/* Win probability bar */}
          {showWinProb && (
            <div className="mt-3 pt-3 border-t border-gray-200/60">
              <div className="flex items-center text-[11px] font-semibold mb-1">
                <span className="text-emerald-700 flex-1">{myWinPct!.toFixed(1)}%</span>
                <span className="text-gray-400 font-normal text-center flex-1">win probability</span>
                <span className="text-red-500 flex-1 text-right">{oppWinPct!.toFixed(1)}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden flex">
                <div className="h-full bg-emerald-500" style={{ width: `${myWinPct}%` }} />
                <div className="h-full bg-red-400 flex-1" />
              </div>
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
