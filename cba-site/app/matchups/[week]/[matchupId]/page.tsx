import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import { getCurrentSeason } from '@/lib/data-processor';
import MatchupDetailClient from './MatchupDetailClient';
import teamsJson from '@/data/teams.json';
import type { TeamMetadata, PlayerSeason } from '@/lib/types';

interface Props {
  params: Promise<{ week: string; matchupId: string }>;
}

export default async function MatchupDetailPage({ params }: Props) {
  const { week: weekStr, matchupId } = await params;
  const week = parseInt(weekStr, 10);
  const [homeStr, awayStr] = matchupId.split('-');
  const homeTeamId = parseInt(homeStr, 10);
  const awayTeamId = parseInt(awayStr, 10);

  if (isNaN(week) || isNaN(homeTeamId) || isNaN(awayTeamId)) notFound();

  const season = getCurrentSeason();

  const matchup = season.matchups.find(
    m => m.week === week && m.home.teamId === homeTeamId && m.away.teamId === awayTeamId
  );
  if (!matchup) notFound();

  // Rosters for both teams
  const homeRoster: PlayerSeason[] =
    season.rosters?.find(r => r.teamId === homeTeamId)?.players ?? [];
  const awayRoster: PlayerSeason[] =
    season.rosters?.find(r => r.teamId === awayTeamId)?.players ?? [];

  // Team display metadata (teams.json has displayName + colors)
  const metaList = (teamsJson as { teams: TeamMetadata[] }).teams;
  const homeMeta = metaList.find(t => t.id === homeTeamId);
  const awayMeta = metaList.find(t => t.id === awayTeamId);

  // Fall back to the season team name if metadata is missing
  const homeTeamName =
    homeMeta?.displayName ??
    season.teams.find(t => t.id === homeTeamId)?.name ??
    `Team ${homeTeamId}`;
  const awayTeamName =
    awayMeta?.displayName ??
    season.teams.find(t => t.id === awayTeamId)?.name ??
    `Team ${awayTeamId}`;

  return (
    <div className="min-h-screen bg-sky-50">
      <Header />
      <MatchupDetailClient
        matchup={matchup}
        year={season.year}
        homeTeamName={homeTeamName}
        awayTeamName={awayTeamName}
        homePrimaryColor={homeMeta?.primaryColor ?? '#475569'}
        awayPrimaryColor={awayMeta?.primaryColor ?? '#475569'}
        homeRoster={homeRoster}
        awayRoster={awayRoster}
      />
    </div>
  );
}
