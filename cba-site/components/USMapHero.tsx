"use client";

import Link from 'next/link';

const TEAMS = [
  { id: 1, abbrev: 'SL', name: 'Space Cowboys', logo: 'https://i.imgur.com/nguVo08.png' },
  { id: 2, abbrev: 'PC', name: 'Chinook', logo: 'https://imgur.com/8iNLFJK.png' },
  { id: 3, abbrev: 'WV', name: 'Pepperoni Rolls', logo: 'https://i.pinimg.com/originals/83/99/28/839928316e524f7df9f543702aa96e1e.png' },
  { id: 4, abbrev: 'MM', name: 'Mega Rats', logo: 'https://i.imgur.com/H2nbUd4.jpg' },
  { id: 6, abbrev: 'DE', name: 'Emus', logo: 'https://mystique-api.fantasy.espn.com/apis/v1/domains/lm/images/91042200-9a25-11f0-b1c3-bf61c28fbeb9' },
  { id: 7, abbrev: 'SC', name: 'Sky Chiefs', logo: 'https://1000logos.net/wp-content/uploads/2018/08/Syracuse-Chiefs-Logo-1997.png' },
  { id: 8, abbrev: 'GW', name: 'Whistlepigs', logo: 'https://i.pinimg.com/564x/4e/2e/88/4e2e880d6aa675473a8d3eb73b2064f1.jpg' },
  { id: 9, abbrev: 'NG', name: 'Fuzzy Bottoms', logo: 'https://i.postimg.cc/sgycxWDX/North-Georgia-3.png' },
  { id: 10, abbrev: 'BB', name: 'Banshees', logo: 'https://mystique-api.fantasy.espn.com/apis/v1/domains/lm/images/bc893190-2775-11f0-bf52-473646e3de99' },
  { id: 11, abbrev: 'FF', name: 'Folksy Ferrets', logo: 'https://i.imgur.com/cNtQjIA.png' },
];

export default function USMapHero() {
  return (
    <div className="bg-gradient-to-r from-teal-700 to-teal-900 text-white rounded-xl p-6 shadow mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xl font-bold">Continental Breakfast Alliance</h3>
          <p className="text-teal-200 text-sm">10 Teams · Mid-Atlantic & East Coast focus</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-4">
        {TEAMS.map(t => (
          <Link key={t.id} href={`/teams/${t.id}`} className="flex items-center gap-3 bg-white/5 rounded-lg p-2 hover:bg-white/10 transition">
            <img src={t.logo} alt={t.name} className="w-10 h-10 rounded-full object-cover" />
            <div>
              <div className="text-sm font-semibold">{t.abbrev}</div>
              <div className="text-xs text-teal-200">{t.name}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
