'use client';

import { useState } from 'react';
import type { SuggestedMove, SuggestedMovesResult, UrgencyLevel, StreamingSP, TradeTarget } from '@/lib/suggested-moves';

interface Props {
  result: SuggestedMovesResult;
}

const URGENCY_CONFIG: Record<UrgencyLevel, {
  label: string;
  bg: string;
  border: string;
  badge: string;
  badgeText: string;
  dot: string;
}> = {
  urgent_pickup: {
    label:     'Urgent Pickup',
    bg:        'bg-red-50',
    border:    'border-red-200',
    badge:     'bg-red-100 text-red-700 border border-red-200',
    badgeText: 'bg-red-600 text-white',
    dot:       'bg-red-500',
  },
  suggested_add: {
    label:     'Suggested Add',
    bg:        'bg-teal-50',
    border:    'border-teal-200',
    badge:     'bg-teal-100 text-teal-700 border border-teal-200',
    badgeText: 'bg-teal-600 text-white',
    dot:       'bg-teal-500',
  },
  watchlist: {
    label:     'Watchlist',
    bg:        'bg-amber-50',
    border:    'border-amber-200',
    badge:     'bg-amber-100 text-amber-700 border border-amber-100',
    badgeText: 'bg-amber-500 text-white',
    dot:       'bg-amber-400',
  },
};

function UpgradeBar({ pct, urgency }: { pct: number; urgency: UrgencyLevel }) {
  const barPct = Math.min(100, Math.round(pct * 100));
  const color = urgency === 'urgent_pickup' ? 'bg-red-500' :
                urgency === 'suggested_add'  ? 'bg-teal-500' :
                'bg-amber-400';
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
      <div
        className={`h-1.5 rounded-full ${color} transition-all`}
        style={{ width: `${barPct}%` }}
      />
    </div>
  );
}

function PlayerChip({
  name,
  erosp,
  photoUrl,
  label,
  dimmed,
}: {
  name: string;
  erosp: number;
  photoUrl?: string;
  label: string;
  dimmed?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 min-w-0 ${dimmed ? 'opacity-60' : ''}`}>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={name}
          className="w-9 h-9 rounded-full object-cover bg-gray-100 flex-shrink-0 border border-white shadow-sm"
        />
      ) : (
        <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0 flex items-center justify-center border border-white shadow-sm">
          <span className="text-xs font-bold text-gray-400">{name.charAt(0)}</span>
        </div>
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800 leading-tight truncate">{name}</p>
        <p className="text-xs text-gray-400">{label} · {erosp > 0 ? `${erosp.toFixed(0)} EROSP` : '—'}</p>
      </div>
    </div>
  );
}

function MoveCard({ move }: { move: SuggestedMove }) {
  const cfg = URGENCY_CONFIG[move.urgency];
  const isEmptySlot = move.replacePlayerName === 'No projection';
  const isSwap = !!move.internalMove;
  // Cap displayed upgrade% at 200% to avoid absurd numbers for empty slots
  const displayPct = Math.min(move.upgradePct, 2.0);
  const pctDisplay = isEmptySlot ? 'Fills empty slot' : `+${(move.upgradePct * 100).toFixed(1)}%`;
  const absDisplay = `+${move.upgradeAbsolute.toFixed(1)} EROSP`;

  // Label and sublabel for the "current" slot column
  const replaceLabel = isSwap
    ? `Move to ${move.internalMove!.toPosition}`
    : isEmptySlot
    ? 'Current Slot'
    : 'Drop / Replace';
  const replaceSubLabel = isSwap
    ? `${move.internalMove!.fromPosition} → ${move.internalMove!.toPosition}`
    : move.targetSlot;

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-5 flex flex-col gap-4`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
          </span>
          <span className="text-xs font-mono text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
            {move.position} · {move.targetSlot}
          </span>
          {isSwap && (
            <span className="text-xs font-semibold bg-indigo-100 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full">
              2-position move
            </span>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-sm font-bold text-gray-800 ${isEmptySlot ? 'text-xs' : 'text-base'}`}>{pctDisplay}</p>
          <p className="text-xs text-gray-400">{absDisplay}</p>
        </div>
      </div>

      {/* Player comparison */}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
            {replaceLabel}
          </p>
          <PlayerChip
            name={move.replacePlayerName}
            erosp={move.currentErosp}
            photoUrl={move.replacePlayerPhotoUrl}
            label={replaceSubLabel}
            dimmed={!isSwap}
          />
        </div>

        {/* Arrow */}
        <div className="flex-shrink-0 text-gray-300">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Add</p>
          <PlayerChip
            name={move.addPlayerName}
            erosp={move.faErosp}
            photoUrl={move.addPlayerPhotoUrl}
            label={move.addPlayerIlType ? `FA · ${move.addPlayerIlType}` : 'FA'}
          />
          {(move.addPlayerInjuryNote || move.addPlayerInjuryNews) && (
            <div className="mt-1.5 ml-11 rounded-lg bg-red-50 border border-red-100 px-2.5 py-2">
              {move.addPlayerInjuryNote && (
                <p className="text-[11px] font-semibold text-red-500 leading-tight">
                  {move.addPlayerIlType && <span className="mr-1">{move.addPlayerIlType} ·</span>}
                  {move.addPlayerInjuryNote}
                </p>
              )}
              {move.addPlayerInjuryNews && (
                <p className="text-[11px] text-red-700 leading-snug mt-0.5">
                  {move.addPlayerInjuryNews}
                  {move.addPlayerInjuryNewsSource && (
                    <span className="text-red-400 ml-1">
                      — {move.addPlayerInjuryNewsSource}
                      {move.addPlayerInjuryNewsDate
                        ? ` ${move.addPlayerInjuryNewsDate.slice(5).replace('-', '/')}`
                        : ''}
                    </span>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Upgrade bar */}
      <div>
        <UpgradeBar pct={displayPct} urgency={move.urgency} />
      </div>

      {/* League context chips */}
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[11px] bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
          #{move.teamPositionRank} of {move.teamPositionRankTotal} in league
        </span>
        <span className="text-[11px] bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
          z = {move.teamPositionZ.toFixed(2)}
        </span>
        {move.faPoolZ > 0.5 && (
          <span className="text-[11px] bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
            FA pool z = +{move.faPoolZ.toFixed(2)} (above avg FA)
          </span>
        )}
      </div>

      {/* Explanation */}
      <p className="text-sm text-gray-600 leading-relaxed border-t border-gray-200/70 pt-3">
        {move.explanation}
      </p>
    </div>
  );
}

const STREAMING_URGENCY_CONFIG: Record<StreamingSP['urgency'], {
  label: string;
  bg: string;
  border: string;
  badge: string;
}> = {
  strong_streamer: {
    label: '2-Start Week',
    bg:    'bg-green-50',
    border: 'border-green-200',
    badge: 'bg-green-100 text-green-700 border border-green-200',
  },
  good_streamer: {
    label: 'Quality Start',
    bg:    'bg-teal-50',
    border: 'border-teal-200',
    badge: 'bg-teal-100 text-teal-700 border border-teal-200',
  },
  spot_start: {
    label: 'Spot Start',
    bg:    'bg-gray-50',
    border: 'border-gray-200',
    badge: 'bg-gray-100 text-gray-500 border border-gray-200',
  },
};

function StreamingSPCard({ sp }: { sp: StreamingSP }) {
  const cfg = STREAMING_URGENCY_CONFIG[sp.urgency];
  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 flex flex-col gap-3 min-w-[180px] flex-1`}>
      {/* Photo + name */}
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sp.photoUrl ?? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${sp.mlbamId}/headshot/67/current`}
          alt={sp.playerName}
          className="w-10 h-10 rounded-full object-cover bg-gray-100 flex-shrink-0 border border-white shadow-sm"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 leading-tight truncate">{sp.playerName}</p>
          <p className="text-xs text-gray-400">{sp.mlbTeam} · SP</p>
        </div>
      </div>

      {/* Weekly value */}
      <div>
        <p className="text-lg font-bold text-gray-800 leading-none">~{sp.weeklyValue.toFixed(1)}</p>
        <p className="text-xs text-gray-400">EROSP / 7-day period</p>
      </div>

      {/* Urgency badge */}
      <div className="flex flex-wrap gap-1.5">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
          {cfg.label}
        </span>
        {sp.ilType && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-100 font-medium">
            {sp.ilType}
          </span>
        )}
      </div>

      {/* Injury note */}
      {sp.injuryNote && (
        <p className="text-[11px] text-red-500 leading-tight">{sp.injuryNote}</p>
      )}
    </div>
  );
}

function StreamingSPSection({ sps }: { sps: StreamingSP[] }) {
  if (sps.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">No streaming SPs this week</p>
        <p className="text-xs text-gray-400 max-w-xs mx-auto">No available free agent starters meet the quality threshold right now.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-end justify-between mb-3 gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-0.5">Streaming Pickups</h3>
          <p className="text-sm text-gray-500">Available SPs ranked by expected 7-day contribution</p>
        </div>
        <span className="flex-shrink-0 text-xs text-gray-400 bg-white border border-gray-200 rounded-full px-3 py-1">
          {sps.length} available
        </span>
      </div>
      <div className="flex gap-3 flex-wrap">
        {sps.map(sp => (
          <StreamingSPCard key={sp.mlbamId} sp={sp} />
        ))}
      </div>
    </div>
  );
}

function TradeTargetCard({ target }: { target: TradeTarget }) {
  const absGap = Math.abs(target.erospGap);
  const balanceLabel = absGap < 30
    ? 'Even trade'
    : target.erospGap > 0
    ? `Slight underpay (−${absGap.toFixed(0)} EROSP)`
    : `Slight overpay (+${absGap.toFixed(0)} EROSP)`;
  const balanceBg = absGap < 30
    ? 'bg-green-50 text-green-700 border-green-200'
    : target.erospGap > 0
    ? 'bg-amber-50 text-amber-700 border-amber-200'
    : 'bg-blue-50 text-blue-700 border-blue-200';

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wide mb-0.5">Acquire from {target.targetTeamName}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-base font-bold text-gray-900">{target.targetPlayerName}</p>
            <span className="text-xs font-mono bg-white border border-indigo-200 text-indigo-600 px-2 py-0.5 rounded-full">
              {target.targetPosition}
            </span>
            {target.fillsTheirNeed && (
              <span className="text-xs font-semibold bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                Fills their {target.theirWeakPosition} need
              </span>
            )}
          </div>
          <p className="text-sm text-indigo-600 font-semibold mt-0.5">+{target.erospUpgrade.toFixed(0)} EROSP vs your current {target.targetPosition}</p>
        </div>
        {/* Target player photo */}
        {target.targetPlayerPhotoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={target.targetPlayerPhotoUrl}
            alt={target.targetPlayerName}
            className="w-12 h-12 rounded-full object-cover bg-gray-100 border border-white shadow-sm flex-shrink-0"
          />
        )}
      </div>

      {/* Two-column trade layout */}
      <div className="grid grid-cols-2 gap-4">
        {/* You give */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">You give</p>
          <div className="flex items-center gap-2">
            {target.offerPlayer.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={target.offerPlayer.photoUrl}
                alt={target.offerPlayer.playerName}
                className="w-9 h-9 rounded-full object-cover bg-gray-100 flex-shrink-0 border border-white shadow-sm"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0 flex items-center justify-center border border-white shadow-sm">
                <span className="text-xs font-bold text-gray-400">{target.offerPlayer.playerName.charAt(0)}</span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 leading-tight truncate">{target.offerPlayer.playerName}</p>
              <p className="text-xs text-gray-400">{target.offerPlayer.position} · {target.offerPlayer.erosp.toFixed(0)} EROSP</p>
            </div>
          </div>
          {target.picksToAdd.length > 0 && target.picksToAdd.map((pick, i) => (
            <div key={i} className="mt-2 flex items-center gap-2">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex-shrink-0 flex items-center justify-center border border-amber-200">
                <span className="text-xs font-bold text-amber-700">Rd{pick.round}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-700 leading-tight">Round {pick.round} Pick</p>
                <p className="text-xs text-gray-400">~{Math.round(pick.currentEquivalent)} pts this season</p>
              </div>
            </div>
          ))}
        </div>

        {/* You receive */}
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">You receive</p>
          <div className="flex items-center gap-2">
            {target.targetPlayerPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={target.targetPlayerPhotoUrl}
                alt={target.targetPlayerName}
                className="w-9 h-9 rounded-full object-cover bg-gray-100 flex-shrink-0 border border-white shadow-sm"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-indigo-100 flex-shrink-0 flex items-center justify-center border border-indigo-200">
                <span className="text-xs font-bold text-indigo-600">{target.targetPlayerName.charAt(0)}</span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 leading-tight truncate">{target.targetPlayerName}</p>
              <p className="text-xs text-gray-400">{target.targetPosition} · {target.targetPlayerErosp.toFixed(0)} EROSP</p>
            </div>
          </div>
        </div>
      </div>

      {/* Balance chip + total offer */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${balanceBg}`}>
          {balanceLabel}
        </span>
        <span className="text-[11px] text-gray-500 bg-white border border-gray-200 px-2.5 py-1 rounded-full">
          Offer value: {target.offerTotalValue.toFixed(0)} EROSP
        </span>
      </div>

      {/* Explanation */}
      <p className="text-sm text-gray-600 leading-relaxed border-t border-indigo-200/70 pt-3">
        {target.explanation}
      </p>
    </div>
  );
}

function TradeTargetsSection({ targets }: { targets: TradeTarget[] }) {
  if (targets.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
        <p className="text-sm font-semibold text-gray-700 mb-1">No trade targets identified</p>
        <p className="text-xs text-gray-400 max-w-xs mx-auto">Your roster depth and positional needs don&apos;t yield clear mutual-benefit trades right now.</p>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-end justify-between mb-3 gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-0.5">Trade Targets</h3>
          <p className="text-sm text-gray-500">Upgrades available via trade — with suggested packages</p>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        {targets.map((t, i) => (
          <TradeTargetCard key={`${t.targetPlayerMlbamId}-${i}`} target={t} />
        ))}
      </div>
    </div>
  );
}

function NoMovesState({ isPreDraft }: { isPreDraft: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 text-center">
      <div className="w-10 h-10 rounded-full bg-green-50 border border-green-100 flex items-center justify-center mx-auto mb-3">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-green-500">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-sm font-semibold text-gray-700 mb-1">No major upgrades found</p>
      <p className="text-xs text-gray-400 max-w-xs mx-auto">
        {"Your weakest positions don't have meaningfully better free agents available right now."}
      </p>
    </div>
  );
}

type InnerTab = 'fa' | 'streaming' | 'trades';

export default function SuggestedMoves({ result }: Props) {
  const { suggestedMoves, isPreDraft, streamingSPs, tradeTargets } = result;
  const [activeTab, setActiveTab] = useState<InnerTab>('fa');

  const tabs: Array<{ id: InnerTab; label: string; count: number }> = [
    { id: 'fa',        label: 'FA Adds',      count: suggestedMoves.length },
    { id: 'streaming', label: 'Streaming SPs', count: streamingSPs.length },
    { id: 'trades',    label: 'Trade Targets', count: tradeTargets.length },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Inner tab bar */}
      <div className="flex gap-2 flex-wrap border-b border-gray-200 pb-3">
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                px-3 py-2.5 md:py-1.5 rounded-lg text-sm font-semibold transition-all duration-150
                flex items-center gap-1.5
                ${isActive
                  ? 'bg-gray-800 text-white shadow-sm'
                  : 'bg-slate-100 text-gray-500 hover:bg-slate-200 hover:text-gray-700'
                }
              `}
            >
              {tab.label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                isActive ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Panel content */}
      {activeTab === 'fa' && (
        <div>
          {suggestedMoves.length === 0 ? (
            <NoMovesState isPreDraft={isPreDraft} />
          ) : (
            <div className="flex flex-col gap-4">
              {suggestedMoves.map((move, i) => (
                <MoveCard key={`${move.position}-${move.addPlayerName}-${i}`} move={move} />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'streaming' && (
        <StreamingSPSection sps={streamingSPs} />
      )}

      {activeTab === 'trades' && (
        <TradeTargetsSection targets={tradeTargets} />
      )}
    </div>
  );
}
