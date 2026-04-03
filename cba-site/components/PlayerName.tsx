'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PlayerPopup from './PlayerPopup';
import type { PlayerCardData } from '@/lib/player-card-types';

interface Props {
  name: string;
  /** MLBAM ID — preferred lookup key */
  mlbamId?: number;
  /** ESPN player ID — used if no mlbamId */
  espnId?: string;
  /** Optional CSS classes on the clickable span */
  className?: string;
}

export default function PlayerName({ name, mlbamId, espnId, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PlayerCardData | null>(null);

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(true);
    if (data) return; // already loaded

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (mlbamId) {
        params.set('mlbamId', String(mlbamId));
      } else if (espnId) {
        params.set('espnId', espnId);
      } else {
        params.set('name', name);
      }
      const res = await fetch(`/api/player-stats?${params}`);
      if (res.ok) {
        const json: PlayerCardData = await res.json();
        setData(json);
      }
    } finally {
      setLoading(false);
    }
  }, [data, mlbamId, espnId, name]);

  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <>
      <span
        onClick={handleClick}
        className={`cursor-pointer hover:text-teal-600 hover:underline underline-offset-2 transition-colors ${className}`}
        title="Click for player stats"
      >
        {name}
      </span>

      {open && typeof document !== 'undefined' && createPortal(
        <PlayerPopup
          data={data}
          loading={loading}
          mlbamId={mlbamId ?? data?.mlbamId}
          onClose={handleClose}
        />,
        document.body
      )}
    </>
  );
}
