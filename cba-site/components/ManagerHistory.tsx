import Image from 'next/image';
import { TeamRecords, TeamBestPickup } from '@/lib/data-processor';

import { TrashTalkPost } from '@/lib/types';
import teamsMetadata from '@/data/teams.json';

interface Props {
  records: TeamRecords;
  trades: TrashTalkPost[];
  totalPlayersEmployed: number;
  totalSeasons: number;
  teamId: number;
  teamColor: string;
  championships: number;
}

function RecordCard({
  label,
  value,
  sub1,
  sub2,
  accent = 'teal',
}: {
  label: string;
  value: string;
  sub1?: string;
  sub2?: string;
  accent?: 'teal' | 'red' | 'amber' | 'indigo';
}) {
  const accentClasses: Record<string, string> = {
    teal:   'text-teal-600',
    red:    'text-red-500',
    amber:  'text-amber-600',
    indigo: 'text-indigo-600',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-bold ${accentClasses[accent]} leading-tight`}>{value}</p>
      {sub1 && <p className="text-xs text-gray-500 mt-1">{sub1}</p>}
      {sub2 && <p className="text-xs text-gray-400">{sub2}</p>}
    </div>
  );
}

function BestDraftCard({ pick }: { pick: NonNullable<TeamRecords['bestDraftPick']> }) {
  return (
    <div className="bg-white rounded-xl border border-teal-200 shadow-sm px-5 py-4 col-span-2 flex items-center gap-4">
      {pick.photoUrl ? (
        <Image
          src={pick.photoUrl}
          alt={pick.playerName}
          width={52}
          height={52}
          className="rounded-full object-cover bg-gray-100 flex-shrink-0 border-2 border-teal-200"
          unoptimized
        />
      ) : (
        <div className="w-[52px] h-[52px] rounded-full bg-teal-50 border-2 border-teal-200 flex-shrink-0 flex items-center justify-center">
          <span className="text-teal-400 text-lg">⚡</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-teal-600 uppercase tracking-widest mb-0.5">Best Draft Pick</p>
        <p className="font-bold text-gray-800 text-base leading-tight truncate">{pick.playerName}</p>
        <p className="text-xs text-gray-400">{pick.position} · Drafted {pick.year}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xl font-bold text-teal-600">{Math.round(pick.totalPoints).toLocaleString()}</p>
        <p className="text-xs text-gray-400">career pts</p>
      </div>
    </div>
  );
}

function BestMoveCard({ pickup }: { pickup: NonNullable<TeamRecords['bestPickup']> }) {
  return (
    <div className="bg-white rounded-xl border border-amber-200 shadow-sm px-5 py-4 col-span-2 flex items-center gap-4">
      {pickup.photoUrl ? (
        <Image
          src={pickup.photoUrl}
          alt={pickup.playerName}
          width={52}
          height={52}
          className="rounded-full object-cover bg-gray-100 flex-shrink-0 border-2 border-amber-200"
          unoptimized
        />
      ) : (
        <div className="w-[52px] h-[52px] rounded-full bg-amber-50 border-2 border-amber-200 flex-shrink-0 flex items-center justify-center">
          <span className="text-amber-400 text-lg">★</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-widest mb-0.5">Best Pickup</p>
        <p className="font-bold text-gray-800 text-base leading-tight truncate">{pickup.playerName}</p>
        <p className="text-xs text-gray-400">{pickup.position} · Added {pickup.year}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xl font-bold text-amber-600">{Math.round(pickup.totalPoints).toLocaleString()}</p>
        <p className="text-xs text-gray-400">career pts</p>
      </div>
    </div>
  );
}

function BestTradeCard({ trade }: { trade: TeamBestPickup }) {
  return (
    <div className="bg-white rounded-xl border border-indigo-200 shadow-sm px-5 py-4 col-span-2 flex items-center gap-4">
      {trade.photoUrl ? (
        <Image
          src={trade.photoUrl}
          alt={trade.playerName}
          width={52}
          height={52}
          className="rounded-full object-cover bg-gray-100 flex-shrink-0 border-2 border-indigo-200"
          unoptimized
        />
      ) : (
        <div className="w-[52px] h-[52px] rounded-full bg-indigo-50 border-2 border-indigo-200 flex-shrink-0 flex items-center justify-center">
          <span className="text-indigo-400 text-lg">⇄</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-widest mb-0.5">Best Trade</p>
        <p className="font-bold text-gray-800 text-base leading-tight truncate">{trade.playerName}</p>
        <p className="text-xs text-gray-400">{trade.position} · {trade.year}{trade.fromTeamName ? ` · from ${trade.fromTeamName}` : ''}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-xl font-bold text-indigo-600">{Math.round(trade.totalPoints).toLocaleString()}</p>
        <p className="text-xs text-gray-400">pts</p>
      </div>
    </div>
  );
}

function ChampionshipsCard({ championships }: { championships: number }) {
  return (
    <div className="bg-white rounded-xl border border-yellow-300 shadow-sm px-5 py-4 col-span-2 flex items-center gap-4">
      <div className="w-[52px] h-[52px] rounded-full bg-yellow-50 border-2 border-yellow-300 flex-shrink-0 flex items-center justify-center">
        <span className="text-yellow-500 text-2xl">🏆</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold text-yellow-600 uppercase tracking-widest mb-0.5">Championships</p>
        <p className="font-bold text-gray-800 text-base leading-tight">
          {championships === 0 ? 'None yet' : championships === 1 ? '1 title' : `${championships} titles`}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-3xl font-bold text-yellow-500">{championships}</p>
      </div>
    </div>
  );
}

function teamName(id: number): string {
  return teamsMetadata.teams.find(t => t.id === id)?.displayName ?? `Team ${id}`;
}

export default function ManagerHistory({ records, trades, totalPlayersEmployed, totalSeasons, teamId, teamColor, championships }: Props) {
  const {
    bestSeason, worstSeason, bestScoringSeasonPF, worstScoringSeasonPF,
  } = records;

  const hasRecords = highWeek || bestSeason || records.bestDraftPick || records.bestPickup;
  const tradeLog = trades.filter(p => p.postType === 'trade');

  if (!hasRecords && tradeLog.length === 0) return null;

  return (
    <div className="mb-12">
      <h2 className="text-2xl font-bold mb-5">Manager History</h2>

      {hasRecords && (
        <>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Franchise Records</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {totalPlayersEmployed > 0 && (
              <RecordCard
                label="Unique Players"
                value={totalPlayersEmployed.toLocaleString()}
                sub1={`Over ${totalSeasons} season${totalSeasons !== 1 ? 's' : ''}`}
                accent="indigo"
              />
            )}
            {records.totalRosterEntries > 0 && (
              <RecordCard
                label="Total Transactions"
                value={records.totalRosterEntries.toLocaleString()}
                sub1="Player-season appearances"
                accent="indigo"
              />
            )}
            {records.bestDraftPick && <BestDraftCard pick={records.bestDraftPick} />}
            {records.bestPickup && <BestMoveCard pickup={records.bestPickup} />}
            {records.bestTrade && <BestTradeCard trade={records.bestTrade} />}
            <ChampionshipsCard championships={championships} />
            {bestSeason && (
              <RecordCard
                label="Best Season"
                value={`${bestSeason.wins}–${bestSeason.losses}`}
                sub1={`${bestSeason.year} · #${bestSeason.finish} finish`}
                sub2={`${bestSeason.pf.toFixed(0)} pts scored`}
                accent="teal"
              />
            )}
            {worstSeason && worstSeason.year !== bestSeason?.year && (
              <RecordCard
                label="Worst Season"
                value={`${worstSeason.wins}–${worstSeason.losses}`}
                sub1={`${worstSeason.year} · #${worstSeason.finish} finish`}
                sub2={`${worstSeason.pf.toFixed(0)} pts scored`}
                accent="red"
              />
            )}
            {bestScoringSeasonPF && bestScoringSeasonPF.year !== bestSeason?.year && (
              <RecordCard
                label="Most Points, Season"
                value={`${bestScoringSeasonPF.pf.toFixed(0)} pts`}
                sub1={`${bestScoringSeasonPF.year} · ${bestScoringSeasonPF.wins}–${bestScoringSeasonPF.losses}`}
                accent="indigo"
              />
            )}
            {worstScoringSeasonPF && worstScoringSeasonPF.year !== worstSeason?.year && (
              <RecordCard
                label="Fewest Points, Season"
                value={`${worstScoringSeasonPF.pf.toFixed(0)} pts`}
                sub1={`${worstScoringSeasonPF.year} · ${worstScoringSeasonPF.wins}–${worstScoringSeasonPF.losses}`}
                accent="amber"
              />
            )}
          </div>
        </>
      )}

      {tradeLog.length > 0 && (
        <>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Trade Log</h3>
          <div className="flex flex-col gap-3">
            {tradeLog.map(trade => {
              const authorMeta = teamsMetadata.teams.find(t => t.id === trade.authorTeamId);
              const targetMeta = trade.targetTeamId
                ? teamsMetadata.teams.find(t => t.id === trade.targetTeamId)
                : null;
              const isAuthor = trade.authorTeamId === teamId;
              const dateStr = new Date(trade.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

              // From this team's perspective: what did they give/receive
              const giving    = isAuthor ? trade.tradeGiving    : trade.tradeReceiving;
              const receiving = isAuthor ? trade.tradeReceiving  : trade.tradeGiving;
              const otherTeam = isAuthor ? targetMeta : authorMeta;

              return (
                <div
                  key={trade.id}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
                >
                  {/* Header */}
                  <div
                    className="px-4 py-2 flex items-center justify-between"
                    style={{ backgroundColor: teamColor, opacity: undefined }}
                  >
                    <span className="text-xs font-bold text-white/90 tracking-wide">TRADE</span>
                    <span className="text-xs text-white/70">{dateStr}</span>
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-gray-100">
                    {/* Gave */}
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                        Gave to {otherTeam?.displayName ?? 'Unknown'}
                      </p>
                      {giving ? (
                        giving.split('\n').filter(Boolean).map((item, i) => (
                          <p key={i} className="text-sm text-gray-700 leading-snug">{item}</p>
                        ))
                      ) : (
                        <p className="text-xs text-gray-300 italic">—</p>
                      )}
                    </div>
                    {/* Received */}
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                        Received from {otherTeam?.displayName ?? 'Unknown'}
                      </p>
                      {receiving ? (
                        receiving.split('\n').filter(Boolean).map((item, i) => (
                          <p key={i} className="text-sm text-gray-700 leading-snug">{item}</p>
                        ))
                      ) : (
                        <p className="text-xs text-gray-300 italic">—</p>
                      )}
                    </div>
                  </div>

                  {/* Optional comment */}
                  {trade.message && (
                    <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
                      <p className="text-xs text-gray-500 italic">"{trade.message}"</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
