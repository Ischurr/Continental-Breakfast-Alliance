import { Matchup, Team } from '@/lib/types';

interface Props {
  matchup: Matchup;
  teams: Team[];
}

export default function MatchupCard({ matchup, teams }: Props) {
  const homeTeam = teams.find(t => t.id === matchup.home.teamId);
  const awayTeam = teams.find(t => t.id === matchup.away.teamId);
  const homeWon = matchup.winner === matchup.home.teamId;
  const awayWon = matchup.winner === matchup.away.teamId;
  const isComplete = matchup.winner !== undefined;

  return (
    <div className="bg-white rounded-lg shadow-sm border hover:shadow-md transition overflow-hidden">
      <div className="bg-sky-50 px-4 py-2 border-b text-xs text-gray-500 font-medium">
        Week {matchup.week}
      </div>
      <div className="p-4">
        {/* Away team row */}
        <div
          className={`flex items-center justify-between py-2 rounded px-2 mb-1 ${
            awayWon ? 'bg-green-50' : isComplete ? 'bg-red-50' : ''
          }`}
        >
          <span className={`font-medium text-sm ${awayWon ? 'text-green-700' : 'text-gray-700'}`}>
            {awayWon && <span className="mr-1 text-green-600">W</span>}
            {awayTeam?.name || `Team ${matchup.away.teamId}`}
          </span>
          <span
            className={`font-bold text-lg ${
              awayWon ? 'text-green-700' : homeWon ? 'text-gray-400' : 'text-gray-700'
            }`}
          >
            {matchup.away.totalPoints.toFixed(1)}
          </span>
        </div>

        {/* Home team row */}
        <div
          className={`flex items-center justify-between py-2 rounded px-2 ${
            homeWon ? 'bg-green-50' : isComplete ? 'bg-red-50' : ''
          }`}
        >
          <span className={`font-medium text-sm ${homeWon ? 'text-green-700' : 'text-gray-700'}`}>
            {homeWon && <span className="mr-1 text-green-600">W</span>}
            {homeTeam?.name || `Team ${matchup.home.teamId}`}
          </span>
          <span
            className={`font-bold text-lg ${
              homeWon ? 'text-green-700' : awayWon ? 'text-gray-400' : 'text-gray-700'
            }`}
          >
            {matchup.home.totalPoints.toFixed(1)}
          </span>
        </div>

        {!isComplete && (
          <div className="mt-2 text-center text-xs text-violet-500 font-medium">In Progress</div>
        )}
      </div>
    </div>
  );
}
