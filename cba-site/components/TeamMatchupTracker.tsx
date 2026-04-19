'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import TonightGamesWidget from './TonightGamesWidget';

// Border geometry constants
const R_OUTER = 12;            // outer wrapper border-radius in px (= 0.75rem)
const SVG_STROKE = 4;          // border stroke width
const SVG_S = SVG_STROKE / 2;  // stroke half-width = inset from outer edge
const SVG_R = R_OUTER - SVG_S; // corner radius of the stroke centerline

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
}

interface LiveMatchup {
  week: number;
  homeTeamId: number;
  homeScore: number;
  awayTeamId: number;
  awayScore: number;
  winner?: string;
}

interface WinProbMatchup {
  homeTeamId: string;
  awayTeamId: string;
  homeWinPct: number;
  awayWinPct: number;
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
}: TrackerProps) {
  const [myScore, setMyScore] = useState(initialMyScore);
  const [oppScore, setOppScore] = useState(initialOppScore);
  const [isFinal, setIsFinal] = useState(initialIsFinal);
  const [myWon, setMyWon] = useState(initialMyWon);
  const [inProgress, setInProgress] = useState(initialInProgress);
  const [myWinPct, setMyWinPct] = useState<number | undefined>(undefined);
  const [showGames, setShowGames] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setDims({ w: el.offsetWidth, h: el.offsetHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    async function fetchAll() {
      // 1. ESPN batch scores — determines finality and gives us the opponent teamId
      let currentlyFinal = initialIsFinal;
      let espnMyScore = initialMyScore;
      let espnOppScore = initialOppScore;
      let oppTeamId: number | null = null;

      try {
        const res = await fetch('/api/live-scores', { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json() as { week: number; matchups: LiveMatchup[] };
          const matchup = json.matchups.find(
            m => m.homeTeamId === teamId || m.awayTeamId === teamId
          );
          if (matchup) {
            const isHome = matchup.homeTeamId === teamId;
            espnMyScore = isHome ? matchup.homeScore : matchup.awayScore;
            espnOppScore = isHome ? matchup.awayScore : matchup.homeScore;
            oppTeamId = isHome ? matchup.awayTeamId : matchup.homeTeamId;
            const newIsFinal = matchup.winner === 'HOME' || matchup.winner === 'AWAY';
            const newMyWon = newIsFinal
              ? matchup.winner === (isHome ? 'HOME' : 'AWAY')
              : null;
            currentlyFinal = newIsFinal;
            setIsFinal(newIsFinal);
            setMyWon(newMyWon);
          }
        }
      } catch { /* silently fail */ }

      // 2. Today's MLB-derived delta — overlay on top of ESPN batch scores
      let myDelta = 0;
      let oppDelta = 0;
      if (!currentlyFinal) {
        try {
          const res = await fetch('/api/live-player-points', { cache: 'no-store' });
          if (res.ok) {
            const data = await res.json() as { source?: string; teams?: Record<string, { totalTodayPoints: number }> };
            if (data.source === 'mlb_live' && data.teams) {
              myDelta = data.teams[String(teamId)]?.totalTodayPoints ?? 0;
              if (oppTeamId !== null) {
                oppDelta = data.teams[String(oppTeamId)]?.totalTodayPoints ?? 0;
              }
            }
          }
        } catch { /* silently fail */ }
      }

      setMyScore(espnMyScore + myDelta);
      setOppScore(espnOppScore + oppDelta);
      setInProgress(!currentlyFinal && (espnMyScore + myDelta > 0 || espnOppScore + oppDelta > 0));

      // 3. Live win probability (re-simulated with today's MLB scores)
      if (currentlyFinal) return;
      try {
        const res = await fetch('/api/win-probability/live', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json() as { matchupPeriodId?: number; matchups?: WinProbMatchup[] };
        if (json.matchupPeriodId !== undefined && json.matchupPeriodId !== weekNum) return;
        const matchup = json.matchups?.find(
          m => m.homeTeamId === String(teamId) || m.awayTeamId === String(teamId)
        );
        if (!matchup) return;
        const pct = matchup.homeTeamId === String(teamId)
          ? matchup.homeWinPct
          : matchup.awayWinPct;
        setMyWinPct(pct);
      } catch { /* silently fail */ }
    }

    fetchAll();
    const interval = setInterval(fetchAll, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [teamId, weekNum, initialIsFinal, initialMyScore, initialOppScore]);

  const cardBg = isFinal
    ? 'bg-slate-200'
    : inProgress
    ? 'bg-sky-50'
    : 'bg-slate-100';

  const oppWinPct = myWinPct !== undefined ? Math.round((100 - myWinPct) * 10) / 10 : undefined;
  const showWinProb = !isFinal && myWinPct !== undefined;

  // SVG border: two symmetric half-paths (top + bottom), each starting at the
  // left-side midpoint. pathLength={100} makes strokeDasharray a true % of each
  // half's perimeter, so 23% green = exactly 23% of the visual border length.
  const renderWinProbBorder = () => {
    if (!showWinProb || !dims || dims.w === 0) return null;
    const { w, h } = dims;
    const s = SVG_S;   // 2
    const r = SVG_R;   // 10

    // Bottom half: left-mid → down → BL corner → bottom → BR corner → right-mid
    const bottomPath = [
      `M ${s},${h / 2}`,
      `L ${s},${h - r - s}`,
      `Q ${s},${h - s} ${r + s},${h - s}`,
      `L ${w - r - s},${h - s}`,
      `Q ${w - s},${h - s} ${w - s},${h - r - s}`,
      `L ${w - s},${h / 2}`,
    ].join(' ');

    // Top half: left-mid → up → TL corner → top → TR corner → right-mid
    const topPath = [
      `M ${s},${h / 2}`,
      `L ${s},${r + s}`,
      `Q ${s},${s} ${r + s},${s}`,
      `L ${w - r - s},${s}`,
      `Q ${w - s},${s} ${w - s},${r + s}`,
      `L ${w - s},${h / 2}`,
    ].join(' ');

    const pct = myWinPct!;
    return (
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        aria-hidden
      >
        {/* Red background for each half */}
        <path d={bottomPath} fill="none" stroke="#f87171" strokeWidth={SVG_STROKE} />
        <path d={topPath}    fill="none" stroke="#f87171" strokeWidth={SVG_STROKE} />
        {/* Green overlay: pathLength={100} makes dasharray units = % of path */}
        <path d={bottomPath} fill="none" stroke="#10b981" strokeWidth={SVG_STROKE}
          pathLength={100} strokeDasharray={`${pct} 100`} />
        <path d={topPath}    fill="none" stroke="#10b981" strokeWidth={SVG_STROKE}
          pathLength={100} strokeDasharray={`${pct} 100`} />
      </svg>
    );
  };

  const wrapperStyle: React.CSSProperties = showWinProb
    ? { padding: `${SVG_S}px`, borderRadius: `${R_OUTER}px`, position: 'relative' }
    : {
        border: '1px solid',
        borderColor: isFinal ? '#d1d5db' : inProgress ? '#93c5fd' : '#e5e7eb',
        borderRadius: '0.75rem',
      };

  return (
    <div className="mb-6">
      <Link href="/matchups" className="block group">
        <div ref={containerRef} style={wrapperStyle} className="shadow-sm transition-opacity group-hover:opacity-90">
          {renderWinProbBorder()}
          <div style={{ borderRadius: `${R_OUTER - SVG_STROKE}px` }} className={`px-6 py-4 ${cardBg}`}>
            {/* Scores row */}
            <div className="flex items-center gap-4">
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

              {/* Center: week label + vs — same column as "win probability" row below */}
              <div className="flex-shrink-0 w-20 text-center">
                <p className="text-sm text-gray-500 font-medium">Week {weekNum}</p>
                <p className="text-gray-400 font-semibold text-base">vs</p>
              </div>

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

            {/* Win probability row — w-20 center column aligns with "vs" above */}
            {showWinProb && (
              <div className="flex items-center gap-4 mt-2 pt-2 border-t border-gray-200/60 text-sm font-semibold">
                <span className="text-emerald-700 flex-1">{myWinPct!.toFixed(1)}%</span>
                <span className="text-gray-400 font-normal flex-shrink-0 w-20 text-center">win probability</span>
                <span className="text-red-500 flex-1 text-right">{oppWinPct!.toFixed(1)}%</span>
              </div>
            )}
          </div>
        </div>
      </Link>

      {/* Tonight's games toggle */}
      <button
        onClick={e => { e.stopPropagation(); setShowGames(v => !v); }}
        className="mt-1.5 w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-teal-600 transition-colors py-1"
      >
        <span>🗓 Tonight&apos;s games</span>
        <span className="text-[10px]">{showGames ? '▲' : '▼'}</span>
      </button>

      {showGames && <TonightGamesWidget teamId={teamId} />}

      {inProgress && (
        <p className="text-xs text-gray-400 text-center mt-1">
          Scores updated as of morning of {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
        </p>
      )}
    </div>
  );
}
