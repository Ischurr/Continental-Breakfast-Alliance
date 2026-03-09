'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import season2025 from '@/data/historical/2025.json';

const TEAMS = season2025.teams;

function NavDropdown({
  label,
  items,
}: {
  label: string;
  items: { href: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        className="hover:text-teal-200 transition flex items-center gap-1"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        {label}
        <svg
          className={`w-3 h-3 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white text-gray-800 rounded-lg shadow-xl border border-gray-100 py-1 min-w-48 z-50">
          {items.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-4 py-2 text-sm hover:bg-sky-50 hover:text-teal-700 transition"
              onClick={() => setOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [teamsExpanded, setTeamsExpanded] = useState(false);
  const [statsExpanded, setStatsExpanded] = useState(false);

  const teamItems = TEAMS.map(team => ({ href: `/teams/${team.id}`, label: team.name }));
  const statsItems = [
    { href: '/stats/players', label: 'Player Stats' },
    { href: '/stats/teams', label: 'Team Stats' },
  ];

  return (
    <header className="bg-gradient-to-r from-teal-700 to-teal-900 text-white shadow-lg">
      <div className="container mx-auto px-4 py-5">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold hover:text-teal-200 transition">
            The Continental Press Box
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex space-x-6 text-sm font-medium items-center">
            <Link href="/standings" className="hover:text-teal-200 transition">Standings</Link>

            <NavDropdown label="Teams" items={teamItems} />

            <Link href="/matchups" className="hover:text-teal-200 transition">Matchups</Link>
            <Link href="/rankings" className="hover:text-teal-200 transition">Rankings</Link>

            <NavDropdown label="Stats" items={statsItems} />

            <Link href="/playoffs" className="hover:text-teal-200 transition">Playoffs</Link>
            <Link href="/history" className="hover:text-teal-200 transition">History</Link>
            <Link href="/news" className="hover:text-teal-200 transition">News</Link>
            <Link href="/message-board" className="hover:text-teal-200 transition">Message Board</Link>
          </nav>

          {/* Mobile menu button */}
          <button
            className="md:hidden text-white focus:outline-none"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <nav className="md:hidden mt-4 pb-2 flex flex-col space-y-3 text-sm font-medium border-t border-teal-600 pt-4">
            <Link href="/standings" className="hover:text-teal-200 transition" onClick={() => setMenuOpen(false)}>Standings</Link>

            {/* Teams expandable section */}
            <button
              className="flex items-center gap-1 hover:text-teal-200 transition text-left"
              onClick={() => setTeamsExpanded(o => !o)}
            >
              Teams
              <svg
                className={`w-3 h-3 opacity-70 transition-transform ${teamsExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {teamsExpanded && (
              <div className="flex flex-col space-y-2 pl-3 border-l border-teal-600">
                {TEAMS.map(team => (
                  <Link
                    key={team.id}
                    href={`/teams/${team.id}`}
                    className="hover:text-teal-200 transition"
                    onClick={() => setMenuOpen(false)}
                  >
                    {team.name}
                  </Link>
                ))}
              </div>
            )}

            <Link href="/matchups" className="hover:text-teal-200 transition" onClick={() => setMenuOpen(false)}>Matchups</Link>
            <Link href="/rankings" className="hover:text-teal-200 transition" onClick={() => setMenuOpen(false)}>Rankings</Link>

            {/* Stats expandable section */}
            <button
              className="flex items-center gap-1 hover:text-teal-200 transition text-left"
              onClick={() => setStatsExpanded(o => !o)}
            >
              Stats
              <svg
                className={`w-3 h-3 opacity-70 transition-transform ${statsExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {statsExpanded && (
              <div className="flex flex-col space-y-2 pl-3 border-l border-teal-600">
                <Link href="/stats/players" className="hover:text-teal-200 transition" onClick={() => setMenuOpen(false)}>Player Stats</Link>
                <Link href="/stats/teams" className="hover:text-teal-200 transition" onClick={() => setMenuOpen(false)}>Team Stats</Link>
              </div>
            )}

            <Link href="/playoffs" className="hover:text-teal-200 transition" onClick={() => setMenuOpen(false)}>Playoffs</Link>
            <Link href="/history" className="hover:text-teal-200 transition" onClick={() => setMenuOpen(false)}>History</Link>
            <Link href="/news" className="hover:text-teal-200 transition" onClick={() => setMenuOpen(false)}>News</Link>
            <Link href="/message-board" className="hover:text-teal-200 transition" onClick={() => setMenuOpen(false)}>Message Board</Link>
          </nav>
        )}
      </div>
    </header>
  );
}
