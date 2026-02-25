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

  return (
    <div className="overflow-x-auto overflow-y-hidden">
      <table className="min-w-full bg-white shadow-md rounded-lg overflow-hidden">
        <thead className="bg-gray-800 text-white">
          <tr>
            <th className="px-4 py-3 text-left w-10">Rank</th>
            <th className="px-4 py-3 text-left">Team</th>
            <th className="px-4 py-3 text-center w-10">W</th>
            <th className="px-4 py-3 text-center w-10">L</th>
            <th className="px-4 py-3 text-center w-10">T</th>
            <th className="px-4 py-3 text-center w-16">PCT</th>
            <th className="px-4 py-3 text-right w-20">PF</th>
            <th className="px-4 py-3 text-right w-20">PA</th>
            <th className="px-4 py-3 text-center w-20">DIFF</th>
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
                <td className="px-4 py-3 text-center">{standing.wins}</td>
                <td className="px-4 py-3 text-center">{standing.losses}</td>
                <td className="px-4 py-3 text-center">{standing.ties}</td>
                <td className="px-4 py-3 text-center">{winPct.toFixed(3)}</td>
                <td className="px-4 py-3 text-right">{standing.pointsFor.toFixed(1)}</td>
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
