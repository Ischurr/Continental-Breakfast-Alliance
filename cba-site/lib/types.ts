export interface Team {
  id: number;
  name: string;
  owner: string;
  abbrev: string;
  logoUrl?: string;
  divisionId?: number;
}

export interface MatchupScore {
  teamId: number;
  totalPoints: number;
}

export interface Matchup {
  id: string;
  week: number;
  home: MatchupScore;
  away: MatchupScore;
  winner?: number;
}

export interface WeeklyStats {
  week: number;
  teamId: number;
  points: number;
  wins: number;
  losses: number;
  ties: number;
}

export interface PlayerSeason {
  playerId: string;
  playerName: string;
  position: string;
  totalPoints: number;
  photoUrl?: string;
  keeperValue?: number;
}

export interface TeamRoster {
  teamId: number;
  players: PlayerSeason[];
}

export interface SeasonData {
  year: number;
  teams: Team[];
  standings: StandingEntry[];
  matchups: Matchup[];
  weeklyStats: WeeklyStats[];
  playoffTeams: number[];
  loserBracket: number[];
  champion?: number;
  backgroundPhotoUrl?: string;
  rosters?: TeamRoster[];
}

export interface StandingEntry {
  teamId: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  streak?: string;
}

export interface PlayerStats {
  playerId: string;
  playerName: string;
  teamId: number;
  week: number;
  points: number;
  position: string;
}

export interface AllTimeStandings {
  teamId: number;
  totalWins: number;
  totalLosses: number;
  totalTies: number;
  championships: number;
  playoffAppearances: number;
  loserBracketAppearances: number;
  totalPointsFor: number;
  averageFinish: number;
  bestFinish: number;
  worstFinish: number;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  createdAt: string;
  active: boolean;
  expiresAt?: string;
}

export interface PollsData {
  polls: Poll[];
}

export interface TrashTalkPost {
  id: string;
  authorTeamId: number;
  authorName: string;
  targetTeamId?: number;
  message: string;
  videoUrl?: string;
  createdAt: string;
  postType?: 'message' | 'trade';
  tradeGiving?: string;    // what authorTeam is giving up (newline-separated)
  tradeReceiving?: string; // what authorTeam is receiving (newline-separated)
}

export interface TrashTalkData {
  posts: TrashTalkPost[];
}

export interface TeamMetadata {
  id: number;
  displayName: string;
  owner: string;
  primaryColor: string;
  secondaryColor: string;
  bio?: string;
}
