import { StandingEntry, Team } from '@/lib/types';
import Link from 'next/link';

interface Props {
  standings: StandingEntry[];
  teams: Team[];
  showPlayoffLine?: boolean;
  playoffCount?: number;
  loserCount?: number;
}

export default function StandingsTable({
  standings,
  teams,
  showPlayoffLine = true,
  playoffCount = 4,
  loserCount = 2,
}: Props) {
  const getTeam = (teamId: number) => teams.find(t => t.id === teamId);

  // Compute PF rank independently of W-L rank
  const pfSorted = [...standings].sort((a, b) => b.pointsFor - a.pointsFor);
  const pfRankMap = new Map(pfSorted.map((s, i) => [s.teamId, i + 1]));

  return (
    <div className="overflow-x-auto overflow-y-hidden">
      <table className="min-w-full bg-white shadow-md rounded-lg overflow-hidden">
        <thead className="bg-gray-800 text-white">
          <tr>
            <th className="px-4 py-3 text-left w-12">Rank</th>
            <th className="px-4 py-3 text-left">Team</th>
            <th className="px-6 py-3 text-center w-16">W</th>
            <th className="px-6 py-3 text-center w-16">L</th>
            <th className="px-6 py-3 text-center w-16">T</th>
            <th className="px-4 py-3 text-center w-20">PCT</th>
            <th className="px-4 py-3 text-right w-24">PF</th>
            <th className="px-4 py-3 text-center w-24">PF Rank</th>
            <th className="px-4 py-3 text-right w-24">PA</th>
            <th className="px-4 py-3 text-center w-24">DIFF</th>
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
                <td className="px-4 py-3 font-semibold text-gray-700">{index + 1}</td>
                <td className="px-4 py-3">
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
                <td className="px-6 py-3 text-center">{standing.wins}</td>
                <td className="px-6 py-3 text-center">{standing.losses}</td>
                <td className="px-6 py-3 text-center">{standing.ties}</td>
                <td className="px-4 py-3 text-center">{winPct.toFixed(3)}</td>
                <td className="px-4 py-3 text-right">{standing.pointsFor.toFixed(1)}</td>
                <td className="px-4 py-3 text-center">
                  <span className="font-medium">{pfRank}</span>
                  {rankDiff !== 0 && (
                    <span className={`ml-1 text-xs ${rankDiff > 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {rankDiff > 0 ? `↑${rankDiff}` : `↓${Math.abs(rankDiff)}`}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">{standing.pointsAgainst.toFixed(1)}</td>
                <td
                  className={`px-4 py-3 text-center font-semibold ${
                    diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-600'
                  }`}
                >
                  {diff > 0 ? '+' : ''}
                  {diff.toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
