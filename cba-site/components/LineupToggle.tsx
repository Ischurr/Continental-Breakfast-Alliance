'use client';

import { useState } from 'react';
import DailyLineupSuggestion from './DailyLineupSuggestion';

export default function LineupToggle({ teamId }: { teamId: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-indigo-600 transition-colors py-1"
      >
        <span>📋 Today&apos;s lineup</span>
        <span className="text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      {open && <DailyLineupSuggestion teamId={teamId} />}
    </div>
  );
}
