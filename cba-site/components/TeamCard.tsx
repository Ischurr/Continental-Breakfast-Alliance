import Link from 'next/link';
import { Team } from '@/lib/types';

interface Props {
  team: Team;
  wins?: number;
  losses?: number;
  championships?: number;
  primaryColor?: string;
}

export default function TeamCard({ team, wins, losses, championships, primaryColor }: Props) {
  return (
    <Link href={`/teams/${team.id}`} className="group block">
      <div
        className="bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-200 overflow-hidden border-t-4"
        style={{ borderTopColor: primaryColor || '#0d9488' }}
      >
        <div className="p-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-lg font-bold group-hover:text-teal-600 transition">
                {team.name}
              </h3>
              <p className="text-sm text-gray-500">{team.owner}</p>
            </div>
            {championships !== undefined && championships > 0 && (
              <div className="flex items-center gap-1 bg-yellow-50 px-2 py-1 rounded-full border border-yellow-200">
                <span className="text-yellow-600 text-sm font-bold">
                  {championships}x
                </span>
              </div>
            )}
          </div>

          {(wins !== undefined || losses !== undefined) && (
            <div className="flex gap-4 text-sm text-gray-600 border-t pt-3">
              {wins !== undefined && losses !== undefined && (
                <span>
                  <span className="font-semibold text-gray-800">{wins}W</span>
                  {' - '}
                  <span className="font-semibold text-gray-800">{losses}L</span>
                  {' all-time'}
                </span>
              )}
              <span className="ml-auto text-teal-500 group-hover:text-teal-700 text-xs font-medium">
                View Team →
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
