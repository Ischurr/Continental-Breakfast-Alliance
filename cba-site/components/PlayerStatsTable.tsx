import { PlayerStats, Team } from '@/lib/types';

interface Props {
  stats: PlayerStats[];
  teams: Team[];
  title?: string;
}

export default function PlayerStatsTable({ stats, teams, title }: Props) {
  const getTeamName = (teamId: number) => teams.find(t => t.id === teamId)?.name || 'Unknown';

  return (
    <div>
      {title && <h2 className="text-xl font-bold mb-4">{title}</h2>}
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white shadow-md rounded-lg overflow-hidden">
          <thead className="bg-gray-800 text-white">
            <tr>
              <th className="px-4 py-3 text-left w-10">Rank</th>
              <th className="px-4 py-3 text-left">Player</th>
              <th className="px-4 py-3 text-left">Pos</th>
              <th className="px-4 py-3 text-left">Team</th>
              <th className="px-4 py-3 text-center w-16">Week</th>
              <th className="px-4 py-3 text-right w-20">Points</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((stat, index) => (
              <tr key={`${stat.playerId}-${stat.week}`} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500">{index + 1}</td>
                <td className="px-4 py-3 font-medium">{stat.playerName}</td>
                <td className="px-4 py-3">
                  <span className="bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded font-medium">
                    {stat.position}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 text-sm">{getTeamName(stat.teamId)}</td>
                <td className="px-4 py-3 text-center text-gray-600">Wk {stat.week}</td>
                <td className="px-4 py-3 text-right font-bold text-blue-600">{stat.points.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
