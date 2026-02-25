const TEAMS = [
  { id: 1,  abbrev: 'SL', color: '#FF6B6B', logo: 'https://i.imgur.com/nguVo08.png' },
  { id: 2,  abbrev: 'PC', color: '#4ECDC4', logo: 'https://imgur.com/8iNLFJK.png' },
  { id: 3,  abbrev: 'WV', color: '#FFE66D', logo: 'https://i.pinimg.com/originals/83/99/28/839928316e524f7df9f543702aa96e1e.png' },
  { id: 4,  abbrev: 'MM', color: '#A8E6CF', logo: 'https://i.imgur.com/H2nbUd4.jpg' },
  { id: 6,  abbrev: 'DE', color: '#6C5CE7', logo: 'https://mystique-api.fantasy.espn.com/apis/v1/domains/lm/images/91042200-9a25-11f0-b1c3-bf61c28fbeb9' },
  { id: 7,  abbrev: 'SC', color: '#FDCB6E', logo: 'https://1000logos.net/wp-content/uploads/2018/08/Syracuse-Chiefs-Logo-1997.png' },
  { id: 8,  abbrev: 'GW', color: '#74B9FF', logo: 'https://i.pinimg.com/564x/4e/2e/88/4e2e880d6aa675473a8d3eb73b2064f1.jpg' },
  { id: 9,  abbrev: 'NG', color: '#55EFC4', logo: 'https://i.postimg.cc/sgycxWDX/North-Georgia-3.png' },
  { id: 10, abbrev: 'BB', color: '#FD79A8', logo: 'https://mystique-api.fantasy.espn.com/apis/v1/domains/lm/images/bc893190-2775-11f0-bf52-473646e3de99' },
  { id: 11, abbrev: 'FF', color: '#B8860B', logo: 'https://i.imgur.com/cNtQjIA.png' },
];

function darken(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.round(r * 0.58)},${Math.round(g * 0.58)},${Math.round(b * 0.58)})`;
}

// SVG viewBox: 0 0 120 110
// Dome visual center in SVG units: x≈66 (of 120), y≈38 (of 110)
// → as % of container: left=55%, top=34.5%
// Logo is a small circle centered there via transform: translate(-50%, -50%)
// width: 30% of container width; aspect-ratio:1 makes it square → rounded-full makes it a circle

function Helmet({ abbrev, color, logo }: { abbrev: string; color: string; logo: string }) {
  const brim = darken(color);

  return (
    <div className="relative">
      {/* Helmet SVG shell */}
      <svg viewBox="0 0 120 110" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto drop-shadow-xl">
        {/* Dome */}
        <path d="M 22,68 C 18,36 36,7 68,7 C 100,7 114,36 110,68 Z" fill={color} />
        {/* Brim */}
        <path d="M 4,68 Q 0,68 0,74 Q 0,80 4,80 L 84,80 L 84,68 Z" fill={brim} />
        {/* Ear flap */}
        <path d="M 110,68 C 116,80 113,97 102,103 C 94,107 84,104 82,97 C 79,88 84,80 84,68 Z" fill={brim} />
        {/* Shine highlight */}
        <path d="M 40,20 C 37,33 41,50 53,54 C 46,44 40,30 44,22 Z" fill="rgba(255,255,255,0.25)" />
      </svg>

      {/* Circular logo — centered on dome via transform */}
      <div
        className="absolute pointer-events-none overflow-hidden rounded-full ring-2 ring-black"
        style={{
          left: '55%',
          top: '34.5%',
          transform: 'translate(-50%, -50%)',
          width: '30%',
          aspectRatio: '1',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt={abbrev}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
    </div>
  );
}

export default function HeroHelmets() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 md:gap-8 px-4 py-6">
      <div className="grid grid-cols-5 gap-4 md:gap-8 w-full max-w-6xl mx-auto px-4">
        {TEAMS.slice(0, 5).map(t => (
          <Helmet key={t.id} abbrev={t.abbrev} color={t.color} logo={t.logo} />
        ))}
      </div>
      <div className="grid grid-cols-5 gap-4 md:gap-8 w-full max-w-6xl mx-auto px-4">
        {TEAMS.slice(5).map(t => (
          <Helmet key={t.id} abbrev={t.abbrev} color={t.color} logo={t.logo} />
        ))}
      </div>
    </div>
  );
}
