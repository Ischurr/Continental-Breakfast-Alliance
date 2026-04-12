import { StandingEntry, Team, Matchup } from '@/lib/types';
import Link from 'next/link';

interface Props {
  standings: StandingEntry[];
  teams: Team[];
  matchups?: Matchup[];
  weekLengths?: Record<number, number>;
  showPlayoffLine?: boolean;
  playoffCount?: number;
  loserCount?: number;
}


function computeXRecord(matchups: Matchup[], weekLengths: Record<number, number> = {}) {
  const xWins = new Map<number, number>();
  const xLosses = new Map<number, number>();

  // Group completed matchups by week
  const byWeek = new Map<number, Matchup[]>();
  for (const m of matchups) {
    if (m.winner === undefined) continue;
    if (!byWeek.has(m.week)) byWeek.set(m.week, []);
    byWeek.get(m.week)!.push(m);
  }

  for (const weekMatchups of byWeek.values()) {
    // Skip weeks where any matchup is still undecided
    if (!weekMatchups.every(m => m.winner !== undefined)) continue;

    const week = weekMatchups[0].week;

    // Normalize scores to 7-day equivalent so long/short weeks don't skew comparisons
    const days = weekLengths[week];
    const normalize = (pts: number) => days && days !== 7 ? pts * 7 / days : pts;

    // Threshold = this week's median normalized score → always a clean ~5-5 split
    const weekScores = weekMatchups
      .flatMap(m => [normalize(m.home.totalPoints), normalize(m.away.totalPoints)])
      .sort((a, b) => a - b);
    const mid = Math.floor(weekScores.length / 2);
    const threshold = weekScores.length % 2 === 0
      ? (weekScores[mid - 1] + weekScores[mid]) / 2
      : weekScores[mid];

    for (const m of weekMatchups) {
      for (const side of [m.home, m.away]) {
        const key = side.teamId;
        if (normalize(side.totalPoints) >= threshold) {
          xWins.set(key, (xWins.get(key) ?? 0) + 1);
        } else {
          xLosses.set(key, (xLosses.get(key) ?? 0) + 1);
        }
      }
    }
  }

  return { xWins, xLosses };
}

export default function StandingsTable({
  standings,
  teams,
  matchups,
  weekLengths,
  showPlayoffLine = true,
  playoffCount = 4,
  loserCount = 2,
}: Props) {
  const getTeam = (teamId: number) => teams.find(t => t.id === teamId);

  // Compute PF rank independently of W-L rank
  const pfSorted = [...standings].sort((a, b) => b.pointsFor - a.pointsFor);
  const pfRankMap = new Map(pfSorted.map((s, i) => [s.teamId, i + 1]));

  // Compute expected W-L (vs the field each week) when matchup data is available
  const { xWins, xLosses } = matchups && matchups.length > 0
    ? computeXRecord(matchups, weekLengths)
    : { xWins: new Map<number, number>(), xLosses: new Map<number, number>() };
  const showXRecord = matchups != null && xWins.size > 0 && [...xWins.values()].some(v => v > 0);

  return (
    <div className="overflow-x-auto overflow-y-hidden">
      <table className="min-w-full bg-white shadow-md rounded-lg overflow-hidden text-xs md:text-sm">
        <thead className="bg-gray-800 text-white">
          <tr>
            <th className="px-2 py-2 md:px-4 md:py-3 text-left w-8 md:w-12">Rank</th>
            <th className="px-2 py-2 md:px-4 md:py-3 text-left">Team</th>
            <th className="px-3 py-2 md:px-6 md:py-3 text-center w-10 md:w-16">W</th>
            <th className="px-3 py-2 md:px-6 md:py-3 text-center w-10 md:w-16">L</th>
            <th className="hidden md:table-cell px-6 py-3 text-center w-16">T</th>
            <th className="hidden md:table-cell px-4 py-3 text-center w-20">PCT</th>
            <th className="px-2 py-2 md:px-4 md:py-3 text-right w-16 md:w-24">PF</th>
            <th className="px-2 py-2 md:px-4 md:py-3 text-center w-16 md:w-24">PF Rank</th>
            <th className="hidden md:table-cell px-4 py-3 text-right w-24">PA</th>
            <th className="hidden md:table-cell px-4 py-3 text-center w-24">DIFF</th>
            {showXRecord && (
              <th
                className="hidden md:table-cell px-4 py-3 text-center w-24 cursor-help"
                title="Expected W-L: win if your score beat the historical + weekly median threshold, loss if below. Highlights scheduling luck."
              >
                xW-L
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {standings.map((standing, index) => {
            const total = standing.wins + standing.losses + standing.ties;
            const winPct = total > 0 ? standing.wins / total : 0;
            const diff = standing.pointsFor - standing.pointsAgainst;
            const team = getTeam(standing.teamId);
            const isPlayoff = showPlayoffLine && index < playoffCount;
            const isLoser = showPlayoffLine && index >= standings.length - loserCount;
            const pfRank = pfRankMap.get(standing.teamId)!;
            const rankDiff = (index + 1) - pfRank; // positive = PF rank is better than W-L rank

            return (
              <tr
                key={standing.teamId}
                className={`border-b hover:bg-sky-50 transition ${
                  isPlayoff ? 'bg-green-50' : isLoser ? 'bg-red-50' : ''
                }`}
              >
                <td className="px-2 py-2 md:px-4 md:py-3 font-semibold text-gray-700">{index + 1}</td>
                <td className="px-2 py-2 md:px-4 md:py-3">
                  <Link
                    href={`/teams/${standing.teamId}`}
                    className="font-medium hover:text-teal-600 transition"
                  >
                    {team?.name || `Team ${standing.teamId}`}
                  </Link>
                  {standing.streak && (
                    <span className="ml-2 text-xs text-gray-500">{standing.streak}</span>
                  )}
                </td>
                <td className="px-3 py-2 md:px-6 md:py-3 text-center">{standing.wins}</td>
                <td className="px-3 py-2 md:px-6 md:py-3 text-center">{standing.losses}</td>
                <td className="hidden md:table-cell px-6 py-3 text-center">{standing.ties}</td>
                <td className="hidden md:table-cell px-4 py-3 text-center">{winPct.toFixed(3)}</td>
                <td className="px-2 py-2 md:px-4 md:py-3 text-right">{standing.pointsFor.toFixed(1)}</td>
                <td className="px-2 py-2 md:px-4 md:py-3 text-center">
                  <span className="font-medium">{pfRank}</span>
                  {rankDiff !== 0 && (
                    <span className={`ml-1 text-xs ${rankDiff > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {rankDiff > 0 ? `↑${rankDiff}` : `↓${Math.abs(rankDiff)}`}
                    </span>
                  )}
                </td>
                <td className="hidden md:table-cell px-4 py-3 text-right">{standing.pointsAgainst.toFixed(1)}</td>
                <td
                  className={`hidden md:table-cell px-4 py-3 text-center font-semibold ${
                    diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-600'
                  }`}
                >
                  {diff > 0 ? '+' : ''}
                  {diff.toFixed(1)}
                </td>
                {showXRecord && (() => {
                  const xW = xWins.get(standing.teamId) ?? 0;
                  const xL = xLosses.get(standing.teamId) ?? 0;
                  // Positive = luckier than deserved (actual W > xW), negative = unlucky
                  const luckDiff = standing.wins - xW;
                  const color = luckDiff > 0 ? 'text-amber-600' : luckDiff < 0 ? 'text-blue-600' : 'text-gray-700';
                  const title = luckDiff > 0
                    ? `+${luckDiff.toFixed(1)} lucky (actual record better than expected)`
                    : luckDiff < 0
                    ? `${luckDiff.toFixed(1)} unlucky (actual record worse than expected)`
                    : 'On pace with expected record';
                  return (
                    <td className={`hidden md:table-cell px-4 py-3 text-center font-medium ${color}`} title={title}>
                      {xW}-{xL}
                    </td>
                  );
                })()}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
