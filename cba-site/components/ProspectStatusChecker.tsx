'use client';

import { useEffect, useState } from 'react';
import type { ProspectStatusResponse } from '@/app/api/prospect-status/route';

interface Prospect {
  name: string;
  mlbamId: number | null;
  mlbTeam: string;
  mlbTeamId: number | null;
  position: string;
  age: number | null;
  description: string;
  protectedDate: string;
  calledUp: boolean;
  calledUpDate: string | null;
}

interface Props {
  teamId: number;
  prospect: Prospect;
}

/** Get current hour (0–23) in US Eastern time. */
function getEasternHour(): number {
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
  }).format(new Date());
  const h = parseInt(s, 10);
  return isNaN(h) ? 0 : h % 24;
}

/**
 * Renders the Protected Prospect card and polls /api/prospect-status on mount.
 * If the live check finds a new call-up (the JSON file hasn't been updated yet
 * by the nightly cron), the status pill updates immediately without a page reload.
 */
export default function ProspectStatusChecker({ teamId, prospect: initial }: Props) {
  const [calledUp, setCalledUp] = useState(initial.calledUp);
  const [calledUpDate, setCalledUpDate] = useState(initial.calledUpDate);

  useEffect(() => {
    // If already called up per the server-rendered data, no polling needed.
    if (calledUp) return;

    async function check() {
      try {
        const res = await fetch(`/api/prospect-status?teamId=${teamId}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = (await res.json()) as ProspectStatusResponse;
        if (data.calledUp) {
          setCalledUp(true);
          setCalledUpDate(data.calledUpDate);
        }
      } catch { /* silently fail */ }
    }

    check();

    // Poll every 15 min during game hours (11 AM–8 PM ET), hourly otherwise.
    const etHour = getEasternHour();
    const intervalMs = etHour >= 11 && etHour < 20
      ? 15 * 60 * 1000
      : 60 * 60 * 1000;

    const timer = setInterval(check, intervalMs);
    return () => clearInterval(timer);
  }, [teamId, calledUp]);

  const prospect = { ...initial, calledUp, calledUpDate };

  return (
    <div className="rounded-xl overflow-hidden shadow-sm border border-gray-200 max-w-xl">
      {/* Dark-purple header */}
      <div
        className="px-5 py-4"
        style={{ background: 'linear-gradient(135deg, #2d1b69 0%, #11001f 100%)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span
              className="inline-block text-[11px] font-bold px-2 py-0.5 rounded-full mb-2 tracking-widest uppercase"
              style={{ backgroundColor: '#c084fc', color: '#11001f' }}
            >
              2026 Protection Draft
            </span>
            {prospect.name === 'TBD' ? (
              <p className="text-white/40 font-medium text-base italic">
                Prospect to be announced
              </p>
            ) : (
              <>
                <p className="text-white font-bold text-xl leading-tight">{prospect.name}</p>
                <p className="text-xs mt-1" style={{ color: '#c084fc' }}>
                  {prospect.position}
                  {prospect.mlbTeam !== 'TBD' && ` · ${prospect.mlbTeam}`}
                  {prospect.age !== null && ` · Age ${prospect.age}`}
                </p>
              </>
            )}
          </div>

          {/* Status pill — updates client-side on call-up detection */}
          {prospect.calledUp ? (
            <span className="inline-flex items-center gap-1 bg-emerald-400 text-emerald-900 text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 mt-0.5">
              🚀 Called Up
            </span>
          ) : prospect.name !== 'TBD' ? (
            <span
              className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 mt-0.5"
              style={{
                backgroundColor: 'rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.5)',
              }}
            >
              On Farm
            </span>
          ) : null}
        </div>
      </div>

      {/* Call-up date footer */}
      {prospect.calledUp && prospect.calledUpDate && (
        <div className="px-5 py-3 bg-emerald-50 border-t border-emerald-100">
          <p className="text-xs text-emerald-700 font-semibold">
            ✓ Called up{' '}
            {new Date(prospect.calledUpDate + 'T12:00:00').toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}{' '}
            — now on the active roster
          </p>
        </div>
      )}

      {/* Scouting description */}
      {prospect.description && (
        <div className="px-5 py-3 bg-white border-t border-gray-100">
          <p className="text-xs text-gray-600 leading-relaxed">{prospect.description}</p>
        </div>
      )}

      {/* Protected date (only when not called up, no description) */}
      {!prospect.calledUp && prospect.name !== 'TBD' && !prospect.description && (
        <div className="px-5 py-3 bg-white border-t border-gray-100">
          <p className="text-xs text-gray-400 italic">
            Protected{' '}
            {new Date(prospect.protectedDate + 'T12:00:00').toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
      )}
    </div>
  );
}
