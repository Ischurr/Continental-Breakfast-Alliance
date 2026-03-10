import { SeasonData, AllTimeStandings, Matchup } from './types';
import season2022 from '../data/historical/2022.json';
import season2023 from '../data/historical/2023.json';
import season2024 from '../data/historical/2024.json';
import season2025 from '../data/historical/2025.json';
import season2026raw from '../data/current/2026.json';
import projections2026 from '../data/projections/2026.json';
import keeperOverrides from '../data/keeper-overrides.json';
import historicalKeeperOverrides from '../data/historical-keeper-overrides.json';

// Strip bad preseason data: if no games have been played, clear playoffTeams
const totalGames2026 = (season2026raw as SeasonData).standings.reduce(
  (sum, s) => sum + s.wins + s.losses, 0
);
const season2026: SeasonData = {
  ...(season2026raw as SeasonData),
  playoffTeams: totalGames2026 > 0 ? (season2026raw as SeasonData).playoffTeams : [],
  loserBracket: totalGames2026 > 0 ? (season2026raw as SeasonData).loserBracket : [],
};

// Teams that replaced previous franchises mid-history.
// Only count their stats from this year onward for all-time records.
const TEAM_JOIN_YEAR: Record<number, number> = {
  10: 2025, // Banshees replaced Dinwiddie Dinos; only count from 2025
};

export function getAllSeasons(): SeasonData[] {
  return [season2022, season2023, season2024, season2025, season2026] as SeasonData[];
}

// Count unique players ever rostered by a team across all completed seasons.
// Each player is counted once regardless of how many seasons they appeared.
// Respects TEAM_JOIN_YEAR so replacement franchises only count from their start year.
export function getTotalUniquePlayersEmployed(teamId: number): number {
  const seen = new Set<string>();
  const joinYear = TEAM_JOIN_YEAR[teamId];
  for (const season of getAllSeasons()) {
    if (joinYear !== undefined && season.year < joinYear) continue;
    const roster = season.rosters?.find(r => r.teamId === teamId);
    if (!roster) continue;
    for (const player of roster.players) {
      if (player.playerId) seen.add(player.playerId);
    }
  }
  return seen.size;
}

// Historical seasons only (completed, with real standings) — used for all-time stats
export function getCompletedSeasons(): SeasonData[] {
  return getAllSeasons().filter(s =>
    s.standings.reduce((sum, st) => sum + st.wins + st.losses, 0) > 0
  );
}

function teamCountsInSeason(teamId: number, year: number): boolean {
  const joinYear = TEAM_JOIN_YEAR[teamId];
  return joinYear === undefined || year >= joinYear;
}

export function getSeasonByYear(year: number): SeasonData | undefined {
  return getAllSeasons().find(s => s.year === year);
}

// Returns the season to display as "current".
// On/after March 9: switch to the new year's season if it exists in data.
// Before March 9: use the most recently completed season.
export function getCurrentSeason(): SeasonData {
  const all = getAllSeasons();
  const today = new Date();
  const marchCutover = new Date(today.getFullYear(), 2, 9); // March 9 (month is 0-indexed)

  if (today >= marchCutover) {
    const thisSeason = all.find(s => s.year === today.getFullYear());
    if (thisSeason) return thisSeason;
  }

  const completed = getCompletedSeasons();
  if (completed.length > 0) return completed[completed.length - 1];
  return all[all.length - 1];
}

export function calculateAllTimeStandings(): AllTimeStandings[] {
  const seasons = getCompletedSeasons();
  const teamStats = new Map<number, AllTimeStandings>();

  seasons.forEach((season) => {
    // Sort standings by wins descending to determine finish order
    const sortedStandings = [...season.standings].sort(
      (a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor
    );

    sortedStandings.forEach((standing, index) => {
      const teamId = standing.teamId;
      if (!teamCountsInSeason(teamId, season.year)) return;

      if (!teamStats.has(teamId)) {
        teamStats.set(teamId, {
          teamId,
          totalWins: 0,
          totalLosses: 0,
          totalTies: 0,
          championships: 0,
          playoffAppearances: 0,
          loserBracketAppearances: 0,
          totalPointsFor: 0,
          totalPointsAgainst: 0,
          averageFinish: 0,
          bestFinish: 100,
          worstFinish: 0,
        });
      }

      const stats = teamStats.get(teamId)!;
      stats.totalWins += standing.wins;
      stats.totalLosses += standing.losses;
      stats.totalTies += standing.ties;
      stats.totalPointsFor += standing.pointsFor;
      stats.totalPointsAgainst += standing.pointsAgainst;

      const finish = index + 1;
      if (finish < stats.bestFinish) stats.bestFinish = finish;
      if (finish > stats.worstFinish) stats.worstFinish = finish;

      if (season.champion === teamId) stats.championships++;
      if (season.playoffTeams.includes(teamId)) stats.playoffAppearances++;
      if (season.loserBracket.includes(teamId)) stats.loserBracketAppearances++;
    });
  });

  // Calculate average finish
  teamStats.forEach((stats, teamId) => {
    let totalFinish = 0;
    let seasonCount = 0;

    getCompletedSeasons().forEach((season) => {
      if (!teamCountsInSeason(teamId, season.year)) return;
      const sortedStandings = [...season.standings].sort(
        (a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor
      );
      const index = sortedStandings.findIndex(s => s.teamId === teamId);
      if (index !== -1) {
        totalFinish += index + 1;
        seasonCount++;
      }
    });

    stats.averageFinish = seasonCount > 0 ? totalFinish / seasonCount : 0;
  });

  return Array.from(teamStats.values()).sort((a, b) => b.totalWins - a.totalWins);
}

export function getTeamHeadToHead(
  teamId1: number,
  teamId2: number
): { team1Wins: number; team2Wins: number; ties: number } {
  const seasons = getCompletedSeasons();
  let team1Wins = 0;
  let team2Wins = 0;
  let ties = 0;

  seasons.forEach(season => {
    if (!teamCountsInSeason(teamId1, season.year) || !teamCountsInSeason(teamId2, season.year)) return;
    season.matchups.forEach(matchup => {
      const isTeam1Home = matchup.home.teamId === teamId1;
      const isTeam2Home = matchup.home.teamId === teamId2;
      const isTeam1Away = matchup.away.teamId === teamId1;
      const isTeam2Away = matchup.away.teamId === teamId2;

      if ((isTeam1Home && isTeam2Away) || (isTeam1Away && isTeam2Home)) {
        if (matchup.winner === teamId1) team1Wins++;
        else if (matchup.winner === teamId2) team2Wins++;
        else ties++;
      }
    });
  });

  return { team1Wins, team2Wins, ties };
}

export function getTeamSeasonHistory(teamId: number) {
  const seasons = getAllSeasons().filter(s => teamCountsInSeason(teamId, s.year));
  return seasons.map(season => {
    const standing = season.standings.find(s => s.teamId === teamId);
    const sortedStandings = [...season.standings].sort(
      (a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor
    );
    const finish = sortedStandings.findIndex(s => s.teamId === teamId) + 1;
    return {
      year: season.year,
      standing,
      finish,
      madePlayoffs: season.playoffTeams.includes(teamId),
      inLoserBracket: season.loserBracket.includes(teamId),
      wasChampion: season.champion === teamId,
    };
  });
}

export function getBiggestWins(limit = 10) {
  const seasons = getAllSeasons();
  const wins: { year: number; week: number; winnerId: number; loserId: number; margin: number; winnerPoints: number; loserPoints: number }[] = [];

  seasons.forEach(season => {
    season.matchups.forEach(matchup => {
      if (matchup.winner !== undefined) {
        const margin = Math.abs(matchup.home.totalPoints - matchup.away.totalPoints);
        const winnerId = matchup.winner;
        const loserId = winnerId === matchup.home.teamId ? matchup.away.teamId : matchup.home.teamId;
        const winnerPoints = winnerId === matchup.home.teamId ? matchup.home.totalPoints : matchup.away.totalPoints;
        const loserPoints = winnerId === matchup.home.teamId ? matchup.away.totalPoints : matchup.home.totalPoints;
        wins.push({ year: season.year, week: matchup.week, winnerId, loserId, margin, winnerPoints, loserPoints });
      }
    });
  });

  return wins.sort((a, b) => b.margin - a.margin).slice(0, limit);
}

export function getHighestScores(limit = 10) {
  const seasons = getAllSeasons();
  const scores: { year: number; week: number; teamId: number; points: number }[] = [];

  seasons.forEach(season => {
    season.matchups.forEach(matchup => {
      scores.push({ year: season.year, week: matchup.week, teamId: matchup.home.teamId, points: matchup.home.totalPoints });
      scores.push({ year: season.year, week: matchup.week, teamId: matchup.away.teamId, points: matchup.away.totalPoints });
    });
  });

  return scores.sort((a, b) => b.points - a.points).slice(0, limit);
}

// Returns top N players by total fantasy points for a team across all counted seasons
export function getTeamTopPlayersAllTime(teamId: number, limit = 5) {
  const seasons = getAllSeasons().filter(s => teamCountsInSeason(teamId, s.year));
  const totals = new Map<string, { playerName: string; position: string; totalPoints: number; photoUrl?: string }>();

  seasons.forEach(season => {
    const roster = season.rosters?.find(r => r.teamId === teamId);
    roster?.players.forEach(p => {
      const existing = totals.get(p.playerId);
      if (existing) {
        existing.totalPoints += p.totalPoints;
      } else {
        totals.set(p.playerId, { playerName: p.playerName, position: p.position, totalPoints: p.totalPoints, photoUrl: p.photoUrl });
      }
    });
  });

  return [...totals.values()].sort((a, b) => b.totalPoints - a.totalPoints).slice(0, limit);
}

// Returns the top scoring player for a team in a specific season
export function getTeamTopPlayerForYear(teamId: number, year: number) {
  const season = getAllSeasons().find(s => s.year === year);
  if (!season) return null;
  const roster = season.rosters?.find(r => r.teamId === teamId);
  if (!roster || roster.players.length === 0) return null;
  const withPoints = roster.players.filter(p => p.totalPoints > 0);
  if (withPoints.length === 0) return null;
  return withPoints.reduce((best, p) => p.totalPoints > best.totalPoints ? p : best);
}

// Returns players designated as keepers for a team in a specific season
// 2026+ allows 6 keepers; prior seasons only had 5
export function getTeamKeepersForYear(teamId: number, year: number) {
  const season = getAllSeasons().find(s => s.year === year);
  if (!season) return [];
  const roster = season.rosters?.find(r => r.teamId === teamId);
  if (!roster) return [];
  const keeperLimit = year >= 2026 ? 6 : 5;

  // Check historical keeper overrides first (most accurate for past seasons)
  const yearOverrides = (historicalKeeperOverrides as Record<string, Record<string, string[]>>)[String(year)];
  const historicalNames = yearOverrides?.[String(teamId)];
  if (historicalNames && historicalNames.length > 0) {
    return historicalNames.map(name => {
      const found = roster.players.find(p => p.playerName === name);
      // Player may have been dropped mid-season and not appear in end-of-season roster snapshot
      return found ?? { playerId: '', playerName: name, position: '', totalPoints: 0 };
    });
  }

  // acquisitionType === 'KEEPER' is only accurate when fetched right after the draft.
  // Historical season-end fetches return 'DRAFT' for all players, so we only use
  // this when at least one player is explicitly marked as KEEPER.
  const hasKeeperAcquisitions = roster.players.some(p => p.acquisitionType === 'KEEPER');
  if (hasKeeperAcquisitions) {
    return roster.players
      .filter(p => p.acquisitionType === 'KEEPER')
      .sort((a, b) => (a.keeperValue ?? 0) - (b.keeperValue ?? 0))
      .slice(0, keeperLimit);
  }

  // Last resort fallback: keeperValue > 0, sorted by round, capped at keeperLimit.
  // Note: keeperValue reflects projected next-year cost, not actual keeper status — unreliable.
  return roster.players
    .filter(p => (p.keeperValue ?? 0) > 0)
    .sort((a, b) => (a.keeperValue ?? 0) - (b.keeperValue ?? 0))
    .slice(0, keeperLimit);
}

// Returns the current week's matchup with the best combined team strength.
// For weeks 1-5: uses all-time win percentage; after week 5: uses current season wins.
export function getTopMatchupOfWeek() {
  const currentSeason = getCurrentSeason();
  if (currentSeason.matchups.length === 0) return null;

  const currentWeek = Math.max(...currentSeason.matchups.map(m => m.week));
  const thisWeekMatchups = currentSeason.matchups.filter(m => m.week === currentWeek);
  if (thisWeekMatchups.length === 0) return null;

  const useHistorical = currentWeek <= 5;

  let bestMatchup: Matchup | null = null;
  let bestScore = -1;

  if (useHistorical) {
    const allTime = calculateAllTimeStandings();
    const getPct = (teamId: number) => {
      const s = allTime.find(t => t.teamId === teamId);
      if (!s) return 0;
      const total = s.totalWins + s.totalLosses + s.totalTies;
      return total > 0 ? s.totalWins / total : 0;
    };
    for (const matchup of thisWeekMatchups) {
      const score = getPct(matchup.home.teamId) + getPct(matchup.away.teamId);
      if (score > bestScore) { bestScore = score; bestMatchup = matchup; }
    }
  } else {
    const getStrength = (teamId: number) => {
      const s = currentSeason.standings.find(t => t.teamId === teamId);
      return s ? s.wins + s.pointsFor * 0.0001 : 0;
    };
    for (const matchup of thisWeekMatchups) {
      const score = getStrength(matchup.home.teamId) + getStrength(matchup.away.teamId);
      if (score > bestScore) { bestScore = score; bestMatchup = matchup; }
    }
  }

  if (!bestMatchup) return null;
  return {
    matchup: bestMatchup,
    week: currentWeek,
    useHistorical,
    teams: currentSeason.teams,
    standings: currentSeason.standings,
  };
}

// Returns suggested keepers for a team based on prior season roster ranked by next-year projected FP.
// rosterYear=2025 → suggests 2026 keepers (uses overrides if set); rosterYear=2026 → suggests 2027 keepers (no overrides).
export function getSuggestedKeepers(teamId: number, limit = 7, rosterYear = 2025) {
  const priorSeason = getAllSeasons().find(s => s.year === rosterYear);
  if (!priorSeason) return [];
  const roster = priorSeason.rosters?.find(r => r.teamId === teamId);
  if (!roster) return [];

  // Build a name-lookup map from projections (case-insensitive, normalized)
  const normalize = (name: string) => name.toLowerCase().replace(/[^a-z ]/g, '').trim();
  const projMap = new Map<string, { projectedFP: number; position: string; age: number | null; percentile: number | null }>();
  for (const p of projections2026.players) {
    if (p.projectedFP !== null) {
      projMap.set(normalize(p.playerName), {
        projectedFP: p.projectedFP,
        position: p.position ?? '',
        age: p.age,
        percentile: p.percentile,
      });
    }
  }

  // Manual overrides only apply when suggesting 2026 keepers (rosterYear=2025)
  const overrides = rosterYear === 2025 ? (keeperOverrides as Record<string, string[]>)[String(teamId)] : undefined;
  if (overrides) {
    const rosterMap = new Map(roster.players.map(p => [normalize(p.playerName), p]));
    return overrides.slice(0, limit).map(name => {
      const rp = rosterMap.get(normalize(name));
      const proj = projMap.get(normalize(name));
      return {
        playerId: rp?.playerId ?? '',
        playerName: name,
        position: rp?.position ?? proj?.position ?? '?',
        photoUrl: rp?.photoUrl ?? '',
        keeperValue: rp?.keeperValue ?? 0,
        totalPoints2025: rp?.totalPoints ?? null,
        projectedFP2026: proj?.projectedFP ?? null,
        age: proj?.age ?? null,
        percentile: proj?.percentile ?? null,
      };
    });
  }

  return roster.players
    .map(p => {
      const proj = projMap.get(normalize(p.playerName));
      return {
        playerId: p.playerId,
        playerName: p.playerName,
        position: p.position,
        photoUrl: p.photoUrl,
        keeperValue: p.keeperValue ?? 0,
        totalPoints2025: p.totalPoints,
        projectedFP2026: proj?.projectedFP ?? null,
        age: proj?.age ?? null,
        percentile: proj?.percentile ?? null,
      };
    })
    .filter(p => p.projectedFP2026 !== null)
    .sort((a, b) => (b.projectedFP2026 ?? 0) - (a.projectedFP2026 ?? 0))
    .slice(0, limit);
}

// Returns top N historically high-scoring players who are NOT on any current roster.
export function getNotableAvailablePlayers(limit = 5) {
  const seasons = getAllSeasons();
  const currentSeason = getCurrentSeason();

  const currentRosterIds = new Set<string>();
  currentSeason.rosters?.forEach(r => r.players.forEach(p => currentRosterIds.add(p.playerId)));

  const available = new Map<string, { playerName: string; position: string; totalPoints: number; photoUrl?: string }>();

  seasons.forEach(season => {
    if (season.year === currentSeason.year) return;
    season.rosters?.forEach(roster => {
      roster.players.forEach(p => {
        if (currentRosterIds.has(p.playerId) || p.totalPoints <= 0) return;
        const existing = available.get(p.playerId);
        if (existing) {
          existing.totalPoints += p.totalPoints;
        } else {
          available.set(p.playerId, {
            playerName: p.playerName,
            position: p.position,
            totalPoints: p.totalPoints,
            photoUrl: p.photoUrl,
          });
        }
      });
    });
  });

  return [...available.values()]
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, limit);
}
