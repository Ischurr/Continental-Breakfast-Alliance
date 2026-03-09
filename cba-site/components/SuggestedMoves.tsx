import type { SuggestedMove, SuggestedMovesResult, UrgencyLevel } from '@/lib/suggested-moves';

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
  const isEmptySlot = move.currentErosp === 0;
  // Cap displayed upgrade% at 200% to avoid absurd numbers for empty slots
  const displayPct = Math.min(move.upgradePct, 2.0);
  const pctDisplay = isEmptySlot ? 'Fills empty slot' : `+${(move.upgradePct * 100).toFixed(1)}%`;
  const absDisplay = `+${move.upgradeAbsolute.toFixed(1)} EROSP`;

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
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-sm font-bold text-gray-800 ${isEmptySlot ? 'text-xs' : 'text-base'}`}>{pctDisplay}</p>
          <p className="text-xs text-gray-400">{absDisplay}</p>
        </div>
      </div>

      {/* Player comparison */}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Drop / Replace</p>
          <PlayerChip
            name={move.replacePlayerName}
            erosp={move.currentErosp}
            photoUrl={move.replacePlayerPhotoUrl}
            label={move.targetSlot}
            dimmed
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
            label="FA"
          />
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
        {isPreDraft
          ? "Based on keepers, no free agents currently clear the threshold for a meaningful EROSP improvement."
          : "Your weakest positions don't have meaningfully better free agents available right now."}
      </p>
    </div>
  );
}

export default function SuggestedMoves({ result }: Props) {
  const { suggestedMoves, isPreDraft } = result;

  return (
    <div>
      <div className="flex items-end justify-between mb-4 gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-0.5">Suggested Moves</h2>
          <p className="text-sm text-gray-500">
            {isPreDraft
              ? 'Based on keepers · Free agent upgrades ranked by EROSP improvement'
              : 'Free agent upgrades ranked by EROSP improvement'}
          </p>
        </div>
        {suggestedMoves.length > 0 && (
          <span className="flex-shrink-0 text-xs text-gray-400 bg-white border border-gray-200 rounded-full px-3 py-1">
            {suggestedMoves.length} suggestion{suggestedMoves.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

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
  );
}
