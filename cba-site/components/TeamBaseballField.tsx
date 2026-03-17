'use client';

import Image from 'next/image';

type Player = {
  playerName: string;
  totalPoints: number;
  photoUrl?: string;
  position: string;
};

interface Props {
  players: Player[];
  /** Player names (exact match) classified as true relievers via EROSP role data.
   *  When provided, pitchers in this set go to the Bullpen; all others go to the Rotation.
   *  Falls back to rank-based split when omitted. */
  rpNames?: Set<string>;
  /** When provided, renders distance markers at each wall position on the field SVG. */
  fieldDimensions?: { lf: number; lcf: number; cf: number; rcf: number; rf: number };
  /** When provided, renders the stadium name as a caption below the field. */
  stadiumName?: string;
  /** When provided, uses a real photo as the field background instead of the SVG drawing.
   *  Should be a path to a 16:9 overhead/broadcast-angle stadium photo in public/. */
  backgroundImageUrl?: string;
}

// "Vladimir Guerrero Jr." → "Guerrero Jr."  |  "Mike Trout" → "Trout"
function displayLastName(fullName: string): string {
  const parts = fullName.trim().split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ') : fullName;
}

// ─── Standard field pin ────────────────────────────────────────────────────────

function FieldPin({ player, label, hideLabel }: { player: Player | null; label: string; hideLabel?: boolean }) {
  const name = player ? displayLastName(player.playerName) : '';
  return (
    <div className="flex flex-col items-center gap-0.5 select-none cursor-default">
      {player?.photoUrl ? (
        <Image src={player.photoUrl} alt={player.playerName} width={44} height={44}
          className="w-8 h-8 lg:w-11 lg:h-11 rounded-full object-cover ring-[2.5px] ring-white shadow-lg bg-gray-200 flex-shrink-0" unoptimized />
      ) : (
        <div className="w-8 h-8 lg:w-11 lg:h-11 rounded-full ring-[2.5px] ring-white/60 bg-white/15 flex items-center justify-center shadow-md">
          <span className="text-white/80 text-[11px] font-bold">{label}</span>
        </div>
      )}
      {player && (
        <div className="hidden lg:flex flex-col items-center bg-black/70 backdrop-blur-sm rounded-lg px-2 py-0.5 whitespace-nowrap shadow">
          <span className="text-[10px] text-white font-semibold leading-tight">{name}</span>
          {player.totalPoints > 0 && (
            <span className="text-[10px] text-teal-300 font-bold leading-tight">{Math.round(player.totalPoints)}</span>
          )}
        </div>
      )}
      {!hideLabel && <span className="bg-black/75 text-white text-[9px] font-bold px-1.5 rounded-full leading-tight shadow">{label}</span>}
    </div>
  );
}

// ─── Compact bullpen pin ───────────────────────────────────────────────────────

function BullpenPin({ player, rank }: { player: Player | null; rank: number }) {
  const name = player ? displayLastName(player.playerName) : '';
  return (
    <div className="flex flex-col items-center gap-0.5 select-none cursor-default">
      {player?.photoUrl ? (
        <Image src={player.photoUrl} alt={player.playerName} width={28} height={28}
          className="w-7 h-7 lg:w-8 lg:h-8 rounded-full object-cover ring-[2px] ring-white shadow bg-gray-200 flex-shrink-0" unoptimized />
      ) : (
        <div className="w-7 h-7 lg:w-8 lg:h-8 rounded-full ring-[2px] ring-white/60 bg-white/15 flex items-center justify-center">
          <span className="text-white/80 text-[9px] font-bold">RP</span>
        </div>
      )}
      {player && (
        <div className="hidden lg:block bg-black/70 rounded-full px-1.5 py-0.5 whitespace-nowrap shadow">
          <span className="text-[8px] text-white font-semibold">{name}</span>
          {player.totalPoints > 0 && (
            <span className="text-[8px] text-teal-300 font-bold ml-0.5">{Math.round(player.totalPoints)}</span>
          )}
        </div>
      )}
      <span className="bg-black/75 text-white text-[7px] font-bold px-1 rounded-full leading-tight shadow">
        RP{rank}
      </span>
    </div>
  );
}

// ─── Side box row ──────────────────────────────────────────────────────────────

function SideRow({ player, rank }: { player: Player | null; rank: number }) {
  if (!player) {
    return (
      <div className="flex items-center gap-1.5 px-2 lg:px-3 py-2 border-b border-gray-100 last:border-b-0">
        <span className="text-[10px] lg:text-[11px] font-bold text-gray-300 w-4 flex-shrink-0">{rank}.</span>
        <span className="text-[10px] lg:text-[11px] text-gray-300 italic">—</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 lg:gap-2 px-2 lg:px-3 py-2 lg:py-2.5 border-b border-gray-100 last:border-b-0">
      {player.photoUrl && (
        <Image src={player.photoUrl} alt={player.playerName} width={32} height={32}
          className="w-6 h-6 lg:w-7 lg:h-7 xl:w-8 xl:h-8 rounded-full object-cover bg-gray-100 flex-shrink-0" unoptimized />
      )}
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-baseline gap-1">
          <span className="text-[10px] lg:text-[11px] font-bold text-gray-300 flex-shrink-0">{rank}.</span>
          <span className="text-[10px] lg:text-[11px] font-semibold text-gray-800 break-words">
            <span className="xl:hidden">{displayLastName(player.playerName)}</span>
            <span className="hidden xl:inline">{player.playerName}</span>
          </span>
        </div>
        {player.totalPoints > 0 && (
          <span className="text-[10px] lg:text-[11px] font-bold text-teal-600">{Math.round(player.totalPoints)} pts</span>
        )}
      </div>
    </div>
  );
}

function SideBox({ title, players, startRank = 1 }: { title: string; players: (Player | null)[]; startRank?: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
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
    <div className="bg-white rounded-xl border border-yellow-300 shadow-sm overflow-hidden">
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
            {player.totalPoints > 0 && (
              <span className="text-[11px] font-bold text-teal-600">{Math.round(player.totalPoints)}</span>
            )}
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
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-gray-800 text-white text-[11px] font-bold px-2 py-2 text-center tracking-widest uppercase">
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
            <span className="text-[10px] lg:text-[11px] font-semibold text-gray-800 leading-tight break-words">
              <span className="xl:hidden">{displayLastName(player.playerName)}</span>
              <span className="hidden xl:inline">{player.playerName}</span>
            </span>
            {player.totalPoints > 0 && (
              <span className="text-[10px] lg:text-[11px] font-bold text-teal-600">{Math.round(player.totalPoints)} pts</span>
            )}
          </div>
        ) : (
          <span className="text-[10px] text-gray-300 italic">—</span>
        )}
      </div>
    </div>
  );
}

// ─── Field slot positions ──────────────────────────────────────────────────────

// SVG-drawn field (top-down perspective, 700×476 viewBox)
const FIELD_SLOTS_SVG: Record<string, [string, string]> = {
  C:    ['50%',   '96%'],
  SP:   ['50%',   '72%'],
  '3B': ['32%',   '67%'],
  SS:   ['38%',   '52%'],
  '2B': ['62%',   '52%'],
  '1B': ['68%',   '67%'],
  OF1:  ['17%',   '33%'],
  OF2:  ['50%',   '19%'],
  OF3:  ['83%',   '33%'],
};

// Photo background config — one entry per stadium photo.
// To add a new stadium: add a new key matching the backgroundImageUrl passed from the team page.
// Keys are the /public/ paths used in app/teams/[teamId]/page.tsx.
// No bullpen pins on photos — all relievers go in the side box instead.
type PhotoConfig = { objectPosition: string; slots: Record<string, [string, string]> };
const FIELD_SLOTS_BY_PHOTO: Record<string, PhotoConfig> = {
  '/wvu-kendrick-field.jpg': {
    objectPosition: 'top',
    slots: {
      C:    ['55%',  '55%'],
      SP:   ['43%',  '25%'],
      '3B': ['20%',  '30%'],
      SS:   ['28%',  '17%'],
      '2B': ['53%',  '16%'],
      '1B': ['69%',  '25%'],
      OF1:  ['08%',  '13%'],
      OF2:  ['38%',  '10%'],
      OF3:  ['62%',  '11%'],
    },
  },
  '/bristol-field.jpg': {
    objectPosition: 'center',
    slots: {
      C:    ['50%',  '82%'],
      SP:   ['55%',  '50%'],
      '3B': ['12%',  '55%'],
      SS:   ['33%',  '41%'],
      '2B': ['65%',  '40%'],
      '1B': ['84%',  '45%'],
      OF1:  ['17%',  '38%'],
      OF2:  ['48%',  '36%'],
      OF3:  ['78%',  '35%'],
    },
  },
};

// ─── Main component ────────────────────────────────────────────────────────────

export default function TeamBaseballField({ players, rpNames, fieldDimensions, stadiumName, backgroundImageUrl }: Props) {
  const isPhotoMode = !!backgroundImageUrl;
  const photoConfig = backgroundImageUrl ? FIELD_SLOTS_BY_PHOTO[backgroundImageUrl] : undefined;
  const fieldSlots = photoConfig?.slots ?? FIELD_SLOTS_SVG;
  const ohtani = players.find(p => p.playerName === 'Shohei Ohtani') ?? null;
  const activePool = players.filter(p => p.playerName !== 'Shohei Ohtani');

  // Sort by totalPoints descending (players with 0 pts go last but still appear)
  const top = (pos: string, n: number): Player[] =>
    activePool
      .filter(p => p.position === pos)
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .slice(0, n);

  // UTIL = outfielders + DH in ESPN roster data
  const utilSorted = activePool
    .filter(p => p.position === 'UTIL')
    .sort((a, b) => b.totalPoints - a.totalPoints);

  const ofs = utilSorted.slice(0, 3);
  const dh = utilSorted[3] ?? null;

  // Split pitchers into starters vs relievers.
  // When EROSP role data is available (rpNames), players in the set are true RPs;
  // everyone else with position='SP' is treated as a starter.
  // Falls back to rank-based split when EROSP data isn't loaded yet.
  const allSPs = activePool
    .filter(p => p.position === 'SP')
    .sort((a, b) => b.totalPoints - a.totalPoints);

  const trueSPs = rpNames
    ? allSPs.filter(p => !rpNames.has(p.playerName))
    : allSPs.slice(0, 6);
  const trueRPs = rpNames
    ? allSPs.filter(p => rpNames.has(p.playerName))
    : allSPs.slice(6, 11);

  const sp1      = trueSPs[0] ?? null;
  const rotation = trueSPs.slice(1, 6);   // up to 5 in the rotation side box
  const bullpen  = trueRPs.slice(0, 5);   // up to 5 in the bullpen

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
    BP1:  bullpen[0] ?? null,
    BP2:  bullpen[1] ?? null,
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col md:flex-row gap-3 md:items-stretch">

      {/* Left: Shohei only (when present) */}
      {ohtani && (
        <div className="flex md:flex-col gap-2 md:justify-center md:flex-shrink-0 md:w-[100px]">
          <OhtaniCard player={ohtani} />
        </div>
      )}

      {/* Center: field */}
      <div className="flex-1 min-w-0">
        <div
          className="relative w-full rounded-2xl overflow-hidden shadow-lg border border-green-900/40"
          style={{ paddingTop: isPhotoMode ? '56.25%' : '75%' }}
        >
          {/* ── Photo background mode ───────────────────────────────────── */}
          {isPhotoMode && (
            <Image
              src={backgroundImageUrl}
              alt={stadiumName ?? 'Baseball field'}
              fill
              className={`object-cover object-${photoConfig?.objectPosition ?? 'top'}`}
              unoptimized
            />
          )}

          {/* ── SVG field (hidden in photo mode) ───────────────────────── */}
          {!isPhotoMode && <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 700 476"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              {/* Clip to fair territory so warning track stroke stays inside the fence */}
              <clipPath id="fairTerritoryClip">
                <path d="M 350 460 L 0 108 Q 350 -65 700 108 Z" />
              </clipPath>
            </defs>

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

            {/* ── Warning track (stroke on fence arc, clipped to fair territory) ── */}
            <path d="M 0 108 Q 350 -65 700 108"
              fill="none" stroke="#c4a060" strokeWidth="38" opacity="0.9"
              clipPath="url(#fairTerritoryClip)" />

            {/* ── Infield dirt ring ─────────────────────────────────── */}
            <polygon
              points="350,455 468,337 350,219 232,337"
              fill="none"
              stroke="#cc9966"
              strokeWidth="30"
              strokeLinejoin="round"
            />

            {/* ── Infield grass ─────────────────────────────────────── */}
            <polygon points="350,455 468,337 350,219 232,337" fill="#3a7d44" />

            {/* ── Pitcher's circle ──────────────────────────────────── */}
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

            {/* ── WVU logo in center field grass: WV state silhouette + Flying WV ── */}
            {/* Visible only on WVPR team page (stadiumName prop is set for id=3)   */}
            {/* Centered at (350, 125). State ~117px wide × 90px tall.              */}
            {stadiumName && (
              <g transform="translate(350, 125)">
                {/* West Virginia state silhouette in Mountaineer Blue */}
                {/* Key landmarks: Northern Panhandle (top-left), Eastern Panhandle (upper-right) */}
                <path
                  d="
                    M -43,-52 L -38,-58 L -33,-52
                    L -28,-28 L  8,-30
                    L 40,-45  L 58,-50 L 62,-43 L 55,-36
                    L 30,-20
                    L 25, 10  L 15, 28
                    L -10, 32 L -30, 25 L -48, 12
                    L -55, -5 L -48,-28
                    L -43,-28 Z
                  "
                  fill="#1C384F"
                  opacity="0.52"
                />
                {/* Flying WV letterform — white, centered in main body of state */}
                <g
                  fill="none"
                  stroke="rgba(255,255,255,0.82)"
                  strokeWidth="8"
                  strokeLinecap="square"
                  strokeLinejoin="miter"
                >
                  {/* W: two valleys */}
                  <polyline points="-38,18 -25,-10 -16,5 -7,-10 6,18" />
                  {/* V: one valley */}
                  <polyline points="6,18 20,-10 34,18" />
                </g>
              </g>
            )}

            {/* ── Field dimension markers (outside the fence in foul territory) ── */}
            {fieldDimensions && (
              <g fill="rgba(255,255,255,0.80)" fontSize="12" fontFamily="sans-serif" fontWeight="bold" textAnchor="middle">
                <text x="50"  y="68">{fieldDimensions.lf}</text>
                <text x="158" y="30">{fieldDimensions.lcf}</text>
                <text x="350" y="13">{fieldDimensions.cf}</text>
                <text x="542" y="30">{fieldDimensions.rcf}</text>
                <text x="650" y="68">{fieldDimensions.rf}</text>
              </g>
            )}

          </svg>}

          {/* Player pins */}
          {Object.entries(fieldSlots).map(([key, [left, top]]) => (
            <div
              key={key}
              className="absolute"
              style={{ left, top, transform: 'translate(-50%, -50%)' }}
            >
              {key.startsWith('BP') ? (
                <BullpenPin
                  player={fieldPlayers[key] ?? null}
                  rank={parseInt(key[2])}
                />
              ) : (
                <FieldPin
                  player={fieldPlayers[key] ?? null}
                  label={key.startsWith('OF') ? 'OF' : key}
                  hideLabel={isPhotoMode}
                />
              )}
            </div>
          ))}
        </div>
        {stadiumName && (
          <p className="text-center text-[11px] text-gray-700 font-medium tracking-wide mt-2">{stadiumName}</p>
        )}
      </div>

      {/* Right: DH + Bullpen + Rotation */}
      <div className="grid grid-cols-3 md:grid-cols-1 gap-2 md:flex-shrink-0 md:w-[140px] lg:w-[165px] xl:w-[190px]">
        <DHCard player={dh} />
        <SideBox
          title="Bullpen"
          players={[bullpen[0] ?? null, bullpen[1] ?? null, bullpen[2] ?? null]}
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
