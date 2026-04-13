'use client';

import { useEffect, useState } from 'react';
import type { GameSlot } from '@/app/api/tonight-games/route';

interface Props {
  teamId: number;
}

// Group a flat list of GameSlots by their groupKey.
function groupSlots(slots: GameSlot[]): Map<string, GameSlot[]> {
  const map = new Map<string, GameSlot[]>();
  for (const slot of slots) {
    const existing = map.get(slot.groupKey) ?? [];
    existing.push(slot);
    map.set(slot.groupKey, existing);
  }
  return map;
}

// Return a stable array of group entries in the order they first appear.
function orderedGroups(slots: GameSlot[]): [string, GameSlot[]][] {
  const grouped = groupSlots(slots);
  // Preserve the order from the already-sorted API response (In Progress first)
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const slot of slots) {
    if (!seen.has(slot.groupKey)) {
      seen.add(slot.groupKey);
      keys.push(slot.groupKey);
    }
  }
  return keys.map(k => [k, grouped.get(k)!]);
}

function StatusBadge({ status }: { status: GameSlot['gameStatus'] }) {
  if (status === 'In Progress') {
    return (
      <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 tracking-wide uppercase">
        Live
      </span>
    );
  }
  if (status === 'Final') {
    return (
      <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 tracking-wide uppercase">
        Final
      </span>
    );
  }
  if (status === 'Postponed') {
    return (
      <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 tracking-wide uppercase">
        PPD
      </span>
    );
  }
  return null; // Scheduled — no badge needed
}

function PlayerChip({ slot }: { slot: GameSlot }) {
  const roleLabel = slot.role === 'SP' ? 'SP' : slot.role === 'RP' ? 'RP' : 'H';
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-700">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_60,q_auto:best/v1/people/${slot.mlbamId}/headshot/67/current`}
        alt={slot.playerName}
        width={20}
        height={20}
        className="rounded-full object-cover bg-gray-200 flex-shrink-0"
        style={{ width: 20, height: 20 }}
      />
      <span className="font-medium">{slot.playerName.split(' ').pop()}</span>
      <span className="text-gray-400 text-[10px]">{roleLabel}</span>
    </span>
  );
}

function GameCard({ slots }: { slots: GameSlot[] }) {
  const first = slots[0];
  const { mlbTeam, opponentAbbr, isHome, gameTime, gameStatus, inning, score, pitcherName } = first;

  const matchupLabel = isHome
    ? `${mlbTeam} vs ${opponentAbbr}`
    : `${mlbTeam} @ ${opponentAbbr}`;

  const isLive = gameStatus === 'In Progress';
  const isFinal = gameStatus === 'Final';

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${isLive ? 'bg-red-50 border-red-200' : isFinal ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'}`}>
      {/* Game header */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-gray-800 tracking-tight">{matchupLabel}</span>
          <StatusBadge status={gameStatus} />
        </div>
        <div className="flex-shrink-0 text-right">
          {isLive && inning ? (
            <span className="text-xs font-semibold text-red-700">{inning}</span>
          ) : !isFinal ? (
            <span className="text-xs text-gray-500">{gameTime}</span>
          ) : null}
        </div>
      </div>

      {/* Score (in-progress or final) */}
      {score && (isLive || isFinal) && (
        <div className={`text-sm font-bold mb-2 ${isLive ? 'text-red-700' : 'text-gray-600'}`}>
          {score}
        </div>
      )}

      {/* Player chips */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {slots.map(slot => (
          <PlayerChip key={`${slot.mlbamId}`} slot={slot} />
        ))}
      </div>

      {/* Probable pitcher — show when there's at least one SP/RP and a pitcher name */}
      {pitcherName && slots.some(s => s.role === 'SP' || s.role === 'RP') && gameStatus === 'Scheduled' && (
        <p className="text-[11px] text-gray-400 mt-1.5">
          Starter: {pitcherName}
        </p>
      )}
    </div>
  );
}

export default function TonightGamesWidget({ teamId }: Props) {
  const [slots, setSlots] = useState<GameSlot[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function fetchGames() {
      try {
        const res = await fetch(`/api/tonight-games?teamId=${teamId}`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = (await res.json()) as GameSlot[];
          setSlots(data);
        }
      } catch {
        // silently fail
      } finally {
        setLoaded(true);
      }
    }

    fetchGames();
    const interval = setInterval(fetchGames, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [teamId]);

  // Hidden until loaded and until there are games
  if (!loaded || slots.length === 0) return null;

  const groups = orderedGroups(slots);

  return (
    <div className="mb-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
        Tonight&apos;s Games
      </p>
      <div className="flex flex-col gap-2">
        {groups.map(([key, groupSlots]) => (
          <GameCard key={key} slots={groupSlots} />
        ))}
      </div>
    </div>
  );
}
