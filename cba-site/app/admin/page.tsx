import { readFileSync } from 'fs';
import path from 'path';
import { getRankings, getAdminNotes } from '@/lib/store';
import { computeAdminAnalytics } from '@/lib/admin-analytics';
import type { AdminAnalyticsInput } from '@/lib/admin-analytics';
import type { SeasonData, WeeklyScoresData } from '@/lib/types';
import AdminDashboardClient from './AdminDashboardClient';

const DATA_DIR = path.join(process.cwd(), 'data');

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  // -- Load current season --
  let currentSeason: SeasonData;
  try {
    currentSeason = JSON.parse(
      readFileSync(path.join(DATA_DIR, 'current', '2026.json'), 'utf-8')
    ) as SeasonData;
  } catch {
    currentSeason = {
      year: 2026,
      teams: [],
      standings: [],
      matchups: [],
      weeklyStats: [],
      playoffTeams: [],
      loserBracket: [],
    };
  }

  // -- Load EROSP players (may not exist) --
  let erospPlayers: AdminAnalyticsInput['erospPlayers'] = [];
  try {
    const raw = JSON.parse(
      readFileSync(path.join(DATA_DIR, 'erosp', 'latest.json'), 'utf-8')
    );
    erospPlayers = Array.isArray(raw) ? raw : (raw?.players ?? []);
  } catch {
    erospPlayers = [];
  }

  // -- Load team metadata --
  let teamMetadata: AdminAnalyticsInput['teamMetadata'] = [];
  try {
    const teamsRaw = JSON.parse(
      readFileSync(path.join(DATA_DIR, 'teams.json'), 'utf-8')
    );
    const teamsArr = Array.isArray(teamsRaw) ? teamsRaw : (teamsRaw?.teams ?? []);
    teamMetadata = teamsArr.map((t: Record<string, unknown>) => ({
      id: t.id as number,
      displayName: (t.displayName as string | undefined) || (t.name as string | undefined),
      name: t.name as string | undefined,
      owner: t.owner as string | undefined,
      primaryColor: t.primaryColor as string | undefined,
      abbrev: t.abbrev as string | undefined,
    }));
  } catch {
    teamMetadata = [];
  }

  // -- Load historical seasons (2022-2025) for all-time records --
  const HISTORICAL_YEARS = [2022, 2023, 2024, 2025];
  const historicalSeasons: SeasonData[] = [];
  for (const year of HISTORICAL_YEARS) {
    try {
      const raw = JSON.parse(
        readFileSync(path.join(DATA_DIR, 'historical', `${year}.json`), 'utf-8')
      ) as SeasonData;
      historicalSeasons.push(raw);
    } catch {
      // year may not exist yet; skip silently
    }
  }

  // -- Load rankings articles --
  const rankingsData = await getRankings();
  const rankingsArticles: AdminAnalyticsInput['rankingsArticles'] = (rankingsData.articles ?? []).map(
    (a: Record<string, unknown>) => ({
      id: String(a.id ?? ''),
      title: String(a.title ?? ''),
      content: String(a.content ?? ''),
      createdAt: String(a.createdAt ?? ''),
    })
  );

  // -- Load admin notes --
  const adminNotes = await getAdminNotes();

  // -- Load weekly player scores (may not exist yet) --
  let weeklyScores: WeeklyScoresData | undefined;
  try {
    weeklyScores = JSON.parse(
      readFileSync(path.join(DATA_DIR, 'current', `weekly-player-scores-${currentSeason.year}.json`), 'utf-8')
    ) as WeeklyScoresData;
  } catch {
    weeklyScores = undefined;
  }

  // -- Compute analytics --
  const TOTAL_WEEKS = Math.max(...currentSeason.matchups.map((m: { week: number }) => m.week), 21);

  const analytics = computeAdminAnalytics({
    currentSeason,
    erospPlayers,
    teamMetadata,
    rankingsArticles,
    TOTAL_WEEKS,
    historicalSeasons,
    weeklyScores,
  });

  return <AdminDashboardClient analytics={analytics} adminNotes={adminNotes} weeklyScores={weeklyScores} />;
}
