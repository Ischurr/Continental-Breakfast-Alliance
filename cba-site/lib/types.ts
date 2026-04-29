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
  /** All ESPN lineup positions this player qualifies for (C, 1B, 2B, 3B, SS, OF, DH, SP, RP) */
  eligiblePositions?: string[];
  totalPoints: number;
  photoUrl?: string;
  keeperValue?: number;
  acquisitionType?: string;
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
  totalPointsAgainst: number;
  averageFinish: number;
  bestFinish: number;
  worstFinish: number;
  totalExpectedWins: number;
  totalExpectedLosses: number;
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
  postType?: 'message' | 'trade' | 'announcement';
  subject?: string;        // headline for commissioner announcements
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
  bgPlayers?: {
    left?: string;
    right?: string;
    /** Set true to mirror the right image so both players face inward */
    mirrorRight?: boolean;
  };
}

export interface TeamContentOverride {
  bio?: string;
  strengths?: string;
  weaknesses?: string;
}

export type TeamContentOverrides = Record<number, TeamContentOverride>;

export interface DinosContent {
  bio?: string;
  sacckoText?: string;
  championshipText?: string;
  exitText?: string;
  legacyQuote?: string;
  legacyText?: string;
}

// ── Weekly Player Scores (ESPN per-period slot tracking) ─────────────────────

export interface WeeklyPlayerEntry {
  playerId: string;
  playerName: string;
  position: string;       // primary MLB position
  primarySlot: string;    // slot they played in during active days ('SP', 'DH', 'OF', etc.)
  primarySlotId: number;  // numeric slot ID (0=C, 1=1B, 2=2B, 3=3B, 4=SS, 8/9/10=OF, 12=DH, 13/14=SP, 15=RP)
  weekPoints: number;     // total points scored this week (active + bench)
  activePoints: number;   // points scored while in an active lineup slot
  benchPoints: number;    // points scored while sitting on the bench
  activeDays: number;
  benchDays: number;
  photoUrl?: string;
  /** ESPN stat ID → cumulative value for this matchup week (from statSplitTypeId=5) */
  weeklyStats?: Record<string, number>;
  /** slotId → points earned while in that slot (e.g. {1: 20, 19: 30} = 20pts at 1B + 30pts at UTIL) */
  pointsBySlot?: Record<number, number>;
}

export interface WeeklyTeamBreakdown {
  teamId: number;
  week: number;
  totalPoints: number;    // ESPN team total (active only)
  benchTotal: number;     // points left on bench
  players: WeeklyPlayerEntry[];
}

export interface WeeklyScoresData {
  season: number;
  lastUpdated: string;
  // week number (string key) → array of team breakdowns
  weeks: Record<string, WeeklyTeamBreakdown[]>;
}

// ── Live Player Points (MLB Stats API) ────────────────────────────────────────

export interface LiveStatLine {
  stat: string;    // "1B", "HR", "R", "IP", "ER", "QS", etc.
  value: number;   // raw stat value (e.g. 1, 2, 6.333 for 6 IP)
  points: number;  // fantasy points this line contributed (e.g. +3, -2)
}

export interface LiveBreakdown {
  label: string;        // human-readable summary: "1B, R, RBI"
  lines: LiveStatLine[];
}

export interface LivePlayerPoints {
  name: string;
  mlbamId: number;
  espnId: number;
  position: string;    // 'H', 'SP', 'RP'
  todayPoints: number;
  gameStatus: string;  // 'Final', 'In Progress', 'Not Started', 'No Game'
  breakdown: LiveBreakdown | null;
}

export interface LiveTeamPoints {
  totalTodayPoints: number;
  players: LivePlayerPoints[];
}

export interface LivePlayerPointsResponse {
  source: 'mlb_live' | 'espn_only';
  asOf?: string;
  week?: number;
  teams?: Record<number, LiveTeamPoints>;
}
