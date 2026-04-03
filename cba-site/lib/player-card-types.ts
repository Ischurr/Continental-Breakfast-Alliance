export interface PlayerCardStats {
  gamesPlayed: number;
  // Shared
  strikeOuts?: number;
  kPct?: string;
  bbPct?: string;
  baseOnBalls?: number;
  // Hitter
  avg?: string;
  obp?: string;
  slg?: string;
  ops?: string;
  hr?: number;
  rbi?: number;
  sb?: number;
  plateAppearances?: number;
  iso?: string;
  // Pitcher
  era?: string;
  whip?: string;
  k9?: string;
  bb9?: string;
  ip?: string;
  wins?: number;
  losses?: number;
  saves?: number;
  holds?: number;
  qualityStarts?: number;
  gamesStarted?: number;
  fip?: string;
}

export interface RecentGame {
  date: string;
  opponent?: string;
  fantasyPoints: number;
  statLine: string;
  isQS?: boolean;
}

export interface PlayerCardData {
  name: string;
  position: string;
  mlbTeam: string;
  mlbamId?: number;
  role: 'H' | 'SP' | 'RP';

  ilType?: string;
  ilDaysRemaining?: number;
  injuryNote?: string;
  injuryNews?: string;
  injuryNewsSource?: string;
  injuryNewsDate?: string;

  erospRaw?: number;
  erospStartable?: number;
  fantasyPoints2025?: number;
  fantasyPoints2026?: number;

  seasonStats?: PlayerCardStats | null;
  last14Stats?: PlayerCardStats | null;
  last7Stats?: PlayerCardStats | null;
  recentGames?: RecentGame[];

  mentions?: Array<{ title: string; url: string; date: string }>;
}
