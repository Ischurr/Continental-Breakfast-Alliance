'use client';

import Link from 'next/link';
import { useState } from 'react';
import season2025 from '@/data/historical/2025.json';

const TEAMS = season2025.teams;

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [teamsOpen, setTeamsOpen] = useState(false);

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

            {/* Teams dropdown */}
            <div
              className="relative"
              onMouseEnter={() => setTeamsOpen(true)}
              onMouseLeave={() => setTeamsOpen(false)}
            >
              <button className="hover:text-teal-200 transition flex items-center gap-1">
                Teams
                <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {teamsOpen && (
                <div className="absolute top-full left-0 mt-1 bg-white text-gray-800 rounded-lg shadow-xl border border-gray-100 py-1 min-w-48 z-50">
                  {TEAMS.map(team => (
                    <Link
                      key={team.id}
                      href={`/teams/${team.id}`}
                      className="block px-4 py-2 text-sm hover:bg-sky-50 hover:text-teal-700 transition"
                      onClick={() => setTeamsOpen(false)}
                    >
                      {team.name}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Link href="/matchups" className="hover:text-teal-200 transition">Matchups</Link>
            <Link href="/rankings" className="hover:text-teal-200 transition">Rankings</Link>
            <Link href="/stats/players" className="hover:text-teal-200 transition">Stats</Link>
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
            <p className="text-teal-300 text-xs uppercase tracking-wide font-bold pt-1">Teams</p>
            {TEAMS.map(team => (
              <Link
                key={team.id}
                href={`/teams/${team.id}`}
                className="hover:text-teal-200 transition pl-2"
                onClick={() => setMenuOpen(false)}
              >
                {team.name}
              </Link>
            ))}
            <Link href="/matchups" className="hover:text-teal-200 transition" onClick={() => setMenuOpen(false)}>Matchups</Link>
            <Link href="/rankings" className="hover:text-teal-200 transition" onClick={() => setMenuOpen(false)}>Rankings</Link>
            <Link href="/stats/players" className="hover:text-teal-200 transition" onClick={() => setMenuOpen(false)}>Player Stats</Link>
            <Link href="/stats/teams" className="hover:text-teal-200 transition" onClick={() => setMenuOpen(false)}>Team Stats</Link>
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
