import { readFileSync } from 'fs';
import path from 'path';
import { getRankings, getAdminNotes } from '@/lib/store';
import { computeAdminAnalytics } from '@/lib/admin-analytics';
import type { AdminAnalyticsInput } from '@/lib/admin-analytics';
import type { SeasonData } from '@/lib/types';
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

  // -- Compute analytics --
  const analytics = computeAdminAnalytics({
    currentSeason,
    erospPlayers,
    teamMetadata,
    rankingsArticles,
    TOTAL_WEEKS: 21,
  });

  return <AdminDashboardClient analytics={analytics} adminNotes={adminNotes} />;
}
