import Image from 'next/image';
import { TeamRecords, TeamBestPickup, getAllSeasons } from '@/lib/data-processor';

import { TrashTalkPost } from '@/lib/types';
import teamsMetadata from '@/data/teams.json';

// Team logo URLs (sourced from USMapHero.tsx)
const TEAM_LOGOS: Record<number, string> = {
  1:  'https://i.imgur.com/nguVo08.png',
  2:  'https://i.imgur.com/8iNLFJK.png',
  3:  'https://i.pinimg.com/originals/83/99/28/839928316e524f7df9f543702aa96e1e.png',
  4:  'https://i.imgur.com/H2nbUd4.jpg',
  6:  'https://content.sportslogos.net/news/2017/08/jwzbfi703gbaujbpvfm5iqjg9.gif',
  7:  'https://1000logos.net/wp-content/uploads/2018/08/Syracuse-Chiefs-Logo-1997.png',
  8:  'https://i.pinimg.com/564x/4e/2e/88/4e2e880d6aa675473a8d3eb73b2064f1.jpg',
  9:  'https://i.postimg.cc/sgycxWDX/North-Georgia-3.png',
  10: 'https://mystique-api.fantasy.espn.com/apis/v1/domains/lm/images/bc893190-2775-11f0-bf52-473646e3de99',
  11: 'https://i.imgur.com/cNtQjIA.png',
};

function buildPlayerPhotoMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const season of getAllSeasons()) {
    for (const roster of (season.rosters ?? [])) {
      for (const p of roster.players) {
        if (p.photoUrl && p.playerName) {
          map[p.playerName.toLowerCase()] = p.photoUrl;
        }
      }
    }
  }
  return map;
}

// Strip prefixes like "NGFB Receive:", "SC Gave:", "TeamName Gets " from a trade line
function stripTradePrefix(line: string): string {
  return line
    .replace(/^[\w.]+\s+(gave?s?|give[sd]?|received?|receives?|gets?|sending|getting):?\s*/i, '')
    .trim();
}

// Split a line like "Jose Soriano and a 7th round pick" into ["Jose Soriano", "7th round pick"]
function splitTradeItems(raw: string): string[] {
  const stripped = stripTradePrefix(raw);
  return stripped
    .split(/\s+and\s+/i)
    .map(part => part.replace(/^an?\s+/i, '').trim())
    .filter(Boolean);
}

// Parse a trade line: returns { type: 'pick', round: number, hasYear: boolean } or { type: 'player', name: string }
function parseTradeLine(line: string): { type: 'pick'; round: number; hasYear: boolean } | { type: 'player'; name: string } {
  const lower = line.toLowerCase();
  const hasYear = /\b20\d{2}\b/.test(line);
  // Match patterns like "2nd round", "round 2", "2nd rd", "2.05", "round 2 pick"
  const ordinalMatch = lower.match(/\b(\d+)(st|nd|rd|th)\b/);
  const digitMatch = lower.match(/\bround\s+(\d+)/i) || lower.match(/\b(\d+)\s*(?:rd|round)\b/i) || lower.match(/^(\d)\./);
  if ((lower.includes('round') || lower.includes(' rd') || lower.includes('pick')) && (ordinalMatch || digitMatch)) {
    const roundNum = ordinalMatch ? parseInt(ordinalMatch[1]) : digitMatch ? parseInt(digitMatch[1]) : 0;
    if (roundNum > 0) return { type: 'pick', round: roundNum, hasYear };
  }
  return { type: 'player', name: line };
}

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

const ROUND_COLORS: Record<number, { bg: string; text: string }> = {
  1: { bg: '#f59e0b', text: '#fff' }, // amber
  2: { bg: '#6366f1', text: '#fff' }, // indigo
  3: { bg: '#10b981', text: '#fff' }, // teal
  4: { bg: '#ef4444', text: '#fff' }, // red
  5: { bg: '#8b5cf6', text: '#fff' }, // purple
};

function TradeItemChip({ line, photoMap, tradeYear }: { line: string; photoMap: Record<string, string>; tradeYear?: number }) {
  const parsed = parseTradeLine(line);
  if (parsed.type === 'pick') {
    const colors = ROUND_COLORS[parsed.round] ?? { bg: '#6b7280', text: '#fff' };
    const rawText = (!parsed.hasYear && tradeYear) ? `${tradeYear} ${line}` : line;
    const displayText = rawText.replace(/\bround\b/gi, 'Round').replace(/\bpick\b/gi, 'Pick');
    return (
      <div className="flex items-center gap-2 py-1">
        <div
          className="w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold leading-none"
          style={{ backgroundColor: colors.bg, color: colors.text }}
        >
          R{parsed.round}
        </div>
        <span className="text-base font-semibold text-gray-800 leading-snug">{displayText}</span>
      </div>
    );
  }
  const photo = photoMap[line.toLowerCase()];
  return (
    <div className="flex items-center gap-2 py-1">
      {photo ? (
        <Image
          src={photo}
          alt={line}
          width={44}
          height={44}
          className="w-11 h-11 rounded-full object-cover bg-gray-100 flex-shrink-0"
          unoptimized
        />
      ) : (
        <div className="w-11 h-11 rounded-full bg-gray-100 flex-shrink-0 flex items-center justify-center">
          <span className="text-gray-400 text-sm">⚾</span>
        </div>
      )}
      <span className="text-base font-semibold text-gray-800 leading-snug">{line}</span>
    </div>
  );
}


export default function ManagerHistory({ records, trades, totalPlayersEmployed, totalSeasons, teamId, teamColor, championships }: Props) {
  const {
    bestSeason, worstSeason, bestScoringSeasonPF, worstScoringSeasonPF,
  } = records;

  const hasRecords = bestSeason || records.bestDraftPick || records.bestPickup;
  const tradeLog = trades.filter(p => p.postType === 'trade');
  const playerPhotoMap = tradeLog.length > 0 ? buildPlayerPhotoMap() : {};

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
              const tradeDate = new Date(trade.createdAt);
              // Pre-draft (Jan–Mar): picks are for the current year's draft
              // Post-draft (Apr+): picks are for next year's draft
              const tradeYear = tradeDate.getMonth() < 3 ? tradeDate.getFullYear() : tradeDate.getFullYear() + 1;

              // From this team's perspective: what did they give/receive
              const giving    = isAuthor ? trade.tradeGiving    : trade.tradeReceiving;
              const receiving = isAuthor ? trade.tradeReceiving  : trade.tradeGiving;
              const thisMeta  = isAuthor ? authorMeta : targetMeta;
              const otherMeta = isAuthor ? targetMeta : authorMeta;

              return (
                <div
                  key={trade.id}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
                >
                  {/* Header */}
                  <div
                    className="px-4 py-2 flex items-center justify-between"
                    style={{ backgroundColor: teamColor }}
                  >
                    <span className="text-xs font-bold text-white/90 tracking-wide">TRADE</span>
                    <span className="text-xs text-white/60">{dateStr}</span>
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-gray-100">
                    {/* Gave */}
                    <div className="p-3 flex gap-3">
                      {TEAM_LOGOS[thisMeta?.id ?? -1] ? (
                        <Image
                          src={TEAM_LOGOS[thisMeta!.id]}
                          alt={thisMeta!.displayName}
                          width={56}
                          height={56}
                          className="w-14 h-14 min-w-[56px] rounded-full object-cover bg-white border-2 border-gray-200 shadow-sm flex-shrink-0 self-center"
                          unoptimized
                        />
                      ) : (
                        <div
                          className="w-14 h-14 min-w-[56px] rounded-full flex-shrink-0 self-center flex items-center justify-center text-white font-bold text-lg border-2 border-gray-200 shadow-sm"
                          style={{ backgroundColor: (thisMeta as { primaryColor?: string } | undefined)?.primaryColor ?? '#6b7280' }}
                        >
                          {thisMeta?.displayName[0] ?? '?'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 leading-tight">
                          {thisMeta?.displayName ?? 'Unknown'} gave
                        </p>
                        {giving ? (
                          giving.split('\n').filter(Boolean).flatMap(item => splitTradeItems(item)).map((item, i) => (
                            <TradeItemChip key={i} line={item} photoMap={playerPhotoMap} tradeYear={tradeYear} />
                          ))
                        ) : (
                          <p className="text-xs text-gray-300 italic py-1">—</p>
                        )}
                      </div>
                    </div>
                    {/* Received */}
                    <div className="p-3 flex gap-3">
                      {TEAM_LOGOS[otherMeta?.id ?? -1] ? (
                        <Image
                          src={TEAM_LOGOS[otherMeta!.id]}
                          alt={otherMeta!.displayName}
                          width={56}
                          height={56}
                          className="w-14 h-14 min-w-[56px] rounded-full object-cover bg-white border-2 border-gray-200 shadow-sm flex-shrink-0 self-center"
                          unoptimized
                        />
                      ) : (
                        <div
                          className="w-14 h-14 min-w-[56px] rounded-full flex-shrink-0 self-center flex items-center justify-center text-white font-bold text-lg border-2 border-gray-200 shadow-sm"
                          style={{ backgroundColor: (otherMeta as { primaryColor?: string } | undefined)?.primaryColor ?? '#6b7280' }}
                        >
                          {otherMeta?.displayName[0] ?? '?'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 leading-tight">
                          {otherMeta?.displayName ?? 'Unknown'} gave
                        </p>
                        {receiving ? (
                          receiving.split('\n').filter(Boolean).flatMap(item => splitTradeItems(item)).map((item, i) => (
                            <TradeItemChip key={i} line={item} photoMap={playerPhotoMap} tradeYear={tradeYear} />
                          ))
                        ) : (
                          <p className="text-xs text-gray-300 italic py-1">—</p>
                        )}
                      </div>
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
