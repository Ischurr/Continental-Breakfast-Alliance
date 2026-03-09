'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

type Player = {
  playerName: string;
  teamName?: string;
  totalPoints: number;
  photoUrl?: string;
  position: string;
};

interface Props {
  rosteredPlayers: Player[];
  freeAgents: Player[];
  /** Player names classified as true relievers via EROSP role data (rostered view only).
   *  When provided, pitchers in this set go to the Bullpen; others go to the Rotation.
   *  FA view uses real ESPN position labels and ignores this prop. */
  rpNames?: Set<string>;
  /** When true: uses real position labels (OF, DH, SP, RP) instead of ESPN UTIL logic,
   *  hides the Rostered/FA toggle, and shows draft-board heading. */
  draftBoardMode?: boolean;
}

// "Vladimir Guerrero Jr." → "Guerrero Jr."  |  "Mike Trout" → "Trout"
function displayLastName(fullName: string): string {
  const parts = fullName.trim().split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ') : fullName;
}

// ─── Standard field pin ────────────────────────────────────────────────────────

function FieldPin({ player, label }: { player: Player | null; label: string }) {
  const name = player ? displayLastName(player.playerName) : '';
  return (
    <div className="relative group flex flex-col items-center gap-0.5 select-none cursor-default">
      {player?.teamName && (
        <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-20 pointer-events-none hidden group-hover:block">
          <div className="bg-gray-900 text-white text-[10px] font-semibold px-2 py-1 rounded-md whitespace-nowrap shadow-xl">
            {player.teamName}
          </div>
        </div>
      )}
      {player?.photoUrl ? (
        <Image src={player.photoUrl} alt={player.playerName} width={44} height={44}
          className="w-8 h-8 md:w-11 md:h-11 rounded-full object-cover ring-[2.5px] ring-white shadow-lg bg-gray-200 flex-shrink-0" unoptimized />
      ) : (
        <div className="w-8 h-8 md:w-11 md:h-11 rounded-full ring-[2.5px] ring-white/60 bg-white/15 flex items-center justify-center shadow-md">
          <span className="text-white/80 text-[11px] font-bold">{label}</span>
        </div>
      )}
      {player && (
        <div className="hidden md:block bg-black/70 backdrop-blur-sm rounded-full px-2 py-0.5 whitespace-nowrap shadow">
          <span className="text-[10px] text-white font-semibold">{name}</span>
          <span className="text-[10px] text-teal-300 font-bold ml-1">{Math.round(player.totalPoints)}</span>
        </div>
      )}
      <span className="bg-black/75 text-white text-[9px] font-bold px-1.5 rounded-full leading-tight shadow">
        {label}
      </span>
    </div>
  );
}

// ─── Side box row ──────────────────────────────────────────────────────────────

function SideRow({ player, rank }: { player: Player | null; rank: number }) {
  if (!player) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 last:border-b-0">
        <span className="text-xs font-bold text-gray-300 w-4 flex-shrink-0">{rank}.</span>
        <span className="text-xs text-gray-300 italic">—</span>
      </div>
    );
  }
  const name = displayLastName(player.playerName);
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-100 last:border-b-0" title={player.teamName}>
      {player.photoUrl && (
        <Image src={player.photoUrl} alt={player.playerName} width={22} height={22}
          className="w-[22px] h-[22px] rounded-full object-cover bg-gray-100 flex-shrink-0" unoptimized />
      )}
      <span className="text-xs font-bold text-gray-300 w-4 flex-shrink-0">{rank}.</span>
      <span className="text-xs font-semibold text-gray-800 break-words flex-1">{name}</span>
      <span className="text-xs font-bold text-teal-600 flex-shrink-0">{Math.round(player.totalPoints)}</span>
    </div>
  );
}

function SideBox({ title, players, startRank = 1, className = '' }: { title: string; players: (Player | null)[]; startRank?: number; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden ${className}`}>
      <div className="bg-gray-800 text-white text-[11px] font-bold px-3 py-2 text-center tracking-widest uppercase">
        {title}
      </div>
      {players.map((p, i) => (
        <SideRow key={i} player={p} rank={startRank + i} />
      ))}
    </div>
  );
}

// ─── Shohei Ohtani special card ────────────────────────────────────────────────

function OhtaniCard({ player }: { player: Player | null }) {
  return (
    <div className="bg-white rounded-xl border border-yellow-300 shadow-sm overflow-hidden" title={player?.teamName}>
      <div className="bg-yellow-600 text-white text-[9px] font-bold px-2 py-1.5 text-center tracking-wide uppercase leading-tight">
        The Shohei Box
      </div>
      <div className="px-2 py-2 flex items-center gap-2">
        {player?.photoUrl ? (
          <Image src={player.photoUrl} alt={player.playerName} width={32} height={32}
            className="w-8 h-8 rounded-full object-cover bg-gray-100 flex-shrink-0" unoptimized />
        ) : (
          <div className="w-8 h-8 rounded-full bg-yellow-50 border border-yellow-200 flex items-center justify-center flex-shrink-0">
            <span className="text-yellow-600 text-[9px] font-bold">SP/DH</span>
          </div>
        )}
        {player ? (
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-semibold text-gray-800 leading-tight">Ohtani</span>
            <span className="text-[11px] font-bold text-teal-600">{Math.round(player.totalPoints)}</span>
          </div>
        ) : (
          <span className="text-[10px] text-gray-300 italic">—</span>
        )}
      </div>
    </div>
  );
}

// ─── DH card ──────────────────────────────────────────────────────────────────

function DHCard({ player }: { player: Player | null }) {
  const name = player ? displayLastName(player.playerName) : '';
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden" title={player?.teamName}>
      <div className="bg-gray-800 text-white text-[10px] font-bold px-2 py-1.5 text-center tracking-widest uppercase">
        DH
      </div>
      <div className="px-2 py-2 flex items-center gap-2">
        {player?.photoUrl ? (
          <Image src={player.photoUrl} alt={player.playerName} width={32} height={32}
            className="w-8 h-8 rounded-full object-cover bg-gray-100 flex-shrink-0" unoptimized />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
            <span className="text-gray-400 text-[9px] font-bold">DH</span>
          </div>
        )}
        {player ? (
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-semibold text-gray-800 leading-tight break-words">{name}</span>
            <span className="text-[11px] font-bold text-teal-600">{Math.round(player.totalPoints)}</span>
          </div>
        ) : (
          <span className="text-[10px] text-gray-300 italic">—</span>
        )}
      </div>
    </div>
  );
}

// ─── Field pin positions ───────────────────────────────────────────────────────

const FIELD_SLOTS: Record<string, [string, string]> = {
  C:    ['50%',   '96%'],
  SP:   ['50%',   '72%'],
  '3B': ['32%',   '67%'],
  SS:   ['38%',   '52%'],
  '2B': ['62%',   '52%'],
  '1B': ['68%',   '67%'],
  OF1:  ['17%',   '33%'],
  OF2:  ['50%',   '14%'],
  OF3:  ['83%',   '33%'],
};

// ─── Main component ────────────────────────────────────────────────────────────

export default function BaseballFieldLeaders({ rosteredPlayers, freeAgents, rpNames, draftBoardMode }: Props) {
  const [view, setView] = useState<'rostered' | 'fa'>('rostered');
  const wrapperRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [sideBySide, setSideBySide] = useState(false);

  const checkLayout = useCallback(() => {
    const isLg = window.innerWidth >= 1024;
    const wrapper = wrapperRef.current;
    const sidebar = sidebarRef.current;
    if (!wrapper || !sidebar || !isLg) { setSideBySide(false); return; }
    const sidebarW = window.innerWidth >= 1280 ? 185 : 165;
    // sidebar.scrollHeight = natural content height (no flex-1, so never inflated)
    const fieldH = (wrapper.getBoundingClientRect().width - sidebarW - 12) * 0.68;
    setSideBySide(sidebar.scrollHeight <= fieldH);
  }, []);

  useEffect(() => {
    window.addEventListener('resize', checkLayout);
    checkLayout();
    return () => window.removeEventListener('resize', checkLayout);
  }, [checkLayout]);

  // Re-check when view switches (Ohtani may appear/disappear, changing sidebar height)
  useEffect(() => { checkLayout(); }, [view, checkLayout]);

  const allInView = view === 'rostered' ? rosteredPlayers : freeAgents;
  const ohtani: Player | null = allInView.find(p => p.playerName === 'Shohei Ohtani') ?? null;
  const activePool = allInView.filter(p => p.playerName !== 'Shohei Ohtani');

  const top = (pos: string, n: number): Player[] =>
    activePool
      .filter(p => p.position === pos && p.totalPoints > 0)
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, n);

  // Draft board mode uses real position labels (OF, DH, SP, RP) from CSV projections.
  // Rostered view uses ESPN's UTIL slot for outfielders/DH.
  const ofs: Player[] = (draftBoardMode || view === 'fa')
    ? top('OF', 3)
    : activePool.filter(p => p.position === 'UTIL' && p.totalPoints > 0)
        .sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 3);

  const dh: Player | null = (draftBoardMode || view === 'fa')
    ? (top('DH', 1)[0] ?? null)
    : (activePool.filter(p => p.position === 'UTIL' && p.totalPoints > 0)
        .sort((a, b) => b.totalPoints - a.totalPoints)[3] ?? null);

  // Split pitchers into starters vs relievers.
  let sp1: Player | null;
  let rotation: Player[];
  let bullpen: Player[];

  if (!draftBoardMode && view === 'rostered') {
    const allSPs = activePool
      .filter(p => p.position === 'SP' && p.totalPoints > 0)
      .sort((a, b) => b.totalPoints - a.totalPoints);

    const trueSPs = rpNames
      ? allSPs.filter(p => !rpNames.has(p.playerName))
      : allSPs.slice(0, 4);
    const trueRPs = rpNames
      ? allSPs.filter(p => rpNames.has(p.playerName))
      : allSPs.slice(4, 9);

    sp1      = trueSPs[0] ?? null;
    rotation = trueSPs.slice(1, 5);
    bullpen  = trueRPs.slice(0, 5);
  } else {
    // FA view and draft board mode both use real SP/RP position labels
    sp1      = top('SP', 1)[0] ?? null;
    rotation = top('SP', 5).slice(1);
    bullpen  = top('RP', 5);
  }

  const fieldPlayers: Record<string, Player | null> = {
    C:    top('C',  1)[0] ?? null,
    SP:   sp1,
    '3B': top('3B', 1)[0] ?? null,
    SS:   top('SS', 1)[0] ?? null,
    '2B': top('2B', 1)[0] ?? null,
    '1B': top('1B', 1)[0] ?? null,
    OF1:  ofs[0] ?? null,
    OF2:  ofs[1] ?? null,
    OF3:  ofs[2] ?? null,
  };

  return (
    <div ref={wrapperRef} className="flex flex-col gap-4">

      {/* Toggle — hidden in draft board mode */}
      {!draftBoardMode && (
        <div className="flex gap-2">
          {(['rostered', 'fa'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition ${
                view === v
                  ? 'bg-teal-700 text-white border-teal-700'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-teal-400 hover:text-teal-600'
              }`}
            >
              {v === 'rostered' ? 'Rostered Leaders' : 'Free Agents'}
            </button>
          ))}
        </div>
      )}

      {/* Field row: relative container — sidebar absolutely pinned when it fits, stacked otherwise */}
      <div className={sideBySide ? 'relative lg:pr-[177px] xl:pr-[197px]' : ''}>

        {/* Field */}
        <div
          className="relative w-full rounded-2xl overflow-hidden shadow-lg border border-green-900/40"
          style={{ paddingTop: '68%' }}
        >
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox="0 0 700 476"
              preserveAspectRatio="xMidYMid slice"
            >
              {/* ── Foul territory background ────────────────────────── */}
              <rect width="700" height="476" fill="#1a3c1f" />

              {/* ── Full fair-territory grass fan ─────────────────────── */}
              <path d="M 350 460 L 0 108 Q 350 -65 700 108 Z" fill="#3a7d44" />

              {/* ── Outfield mowing stripes ───────────────────────────── */}
              {[185, 225, 265, 305, 345].map((r, i) => (
                <path
                  key={r}
                  d={`M ${350 - r} ${460 - r} Q 350 ${Math.round(460 - 1.83 * r)} ${350 + r} ${460 - r}`}
                  fill="none"
                  stroke={i % 2 === 0 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.07)'}
                  strokeWidth="42"
                />
              ))}

              {/* ── Warning track ─────────────────────────────────────── */}
              <path d="M 18 118 Q 350 -42 682 118"
                fill="none" stroke="#c4a060" strokeWidth="26" opacity="0.9" />

              {/* ── Infield dirt ring ─────────────────────────────────── */}
              <polygon
                points="350,455 468,337 350,219 232,337"
                fill="none"
                stroke="#cc9966"
                strokeWidth="30"
                strokeLinejoin="round"
              />

              {/* ── Infield grass (covers inside of dirt ring) ────────── */}
              <polygon points="350,455 468,337 350,219 232,337" fill="#3a7d44" />

              {/* ── Pitcher's circle ─────────────────────────────────────*/}
              <circle cx="350" cy="343" r="30" fill="#cc9966" />

              {/* ── Pitcher's mound ───────────────────────────────────── */}
              <circle cx="350" cy="343" r="14" fill="#d4a055" />
              <circle cx="350" cy="343" r="4"  fill="#e8b868" />
              <rect x="344" y="341" width="12" height="4" rx="1.5" fill="white" opacity="0.85" />

              {/* ── Base path lines ───────────────────────────────────── */}
              <line x1="350" y1="455" x2="468" y2="337" stroke="#9a7040" strokeWidth="2" />
              <line x1="468" y1="337" x2="350" y2="219" stroke="#9a7040" strokeWidth="2" />
              <line x1="350" y1="219" x2="232" y2="337" stroke="#9a7040" strokeWidth="2" />
              <line x1="232" y1="337" x2="350" y2="455" stroke="#9a7040" strokeWidth="2" />

              {/* ── Bases ─────────────────────────────────────────────── */}
              <polygon points="350,463 360,453 360,443 340,443 340,453" fill="white" opacity="0.95" />
              <rect x="460" y="329" width="16" height="16" fill="white" opacity="0.95"
                transform="rotate(45,468,337)" />
              <rect x="342" y="211" width="16" height="16" fill="white" opacity="0.95"
                transform="rotate(45,350,219)" />
              <rect x="224" y="329" width="16" height="16" fill="white" opacity="0.95"
                transform="rotate(45,232,337)" />

              {/* ── Foul lines ────────────────────────────────────────── */}
              <line x1="350" y1="460" x2="0"   y2="108" stroke="white" strokeWidth="2" opacity="0.4" />
              <line x1="350" y1="460" x2="700" y2="108" stroke="white" strokeWidth="2" opacity="0.4" />

              {/* ── Outfield fence wall ───────────────────────────────── */}
              <path d="M 0 108 Q 350 -65 700 108" fill="none" stroke="#5c3218" strokeWidth="10" />
              <path d="M 0 108 Q 350 -65 700 108" fill="none" stroke="#c08050" strokeWidth="4" opacity="0.55" />
            </svg>

            {/* Player pins */}
            {Object.entries(FIELD_SLOTS).map(([key, [left, top]]) => (
              <div
                key={key}
                className="absolute"
                style={{ left, top, transform: 'translate(-50%, -50%)' }}
              >
                <FieldPin
                  player={fieldPlayers[key] ?? null}
                  label={key.startsWith('OF') ? 'OF' : key}
                />
              </div>
            ))}
        </div>

        {/* Sidebar: absolutely pinned alongside field when content fits, stacked grid otherwise */}
        <div
          ref={sidebarRef}
          className={sideBySide
            ? 'absolute top-0 right-0 bottom-0 w-[165px] xl:w-[185px] flex flex-col gap-2'
            : 'mt-3 grid grid-cols-2 gap-2'
          }
        >
          {ohtani && <OhtaniCard player={ohtani} />}
          <DHCard player={dh} />
          <SideBox
            title="Bullpen"
            players={[bullpen[0] ?? null, bullpen[1] ?? null, bullpen[2] ?? null, bullpen[3] ?? null, bullpen[4] ?? null]}
            startRank={1}
          />
          <SideBox
            title="Rotation"
            players={[rotation[0] ?? null, rotation[1] ?? null, rotation[2] ?? null, rotation[3] ?? null]}
            startRank={2}
          />
        </div>

      </div>
    </div>
  );
}
