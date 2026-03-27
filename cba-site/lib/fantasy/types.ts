// ============================================================
// lib/fantasy/types.ts
//
// Core types for the CBA matchup win-probability engine.
// Designed around ESPN's fantasy baseball data model.
// ============================================================

export type PlayerRole = "hitter" | "starting_pitcher" | "relief_pitcher";
export type GameState = "completed" | "live" | "upcoming";

// ----- League / Scoring -----

export interface LeagueScoring {
  hitter: Record<string, number>;
  pitcher: Record<string, number>;
}

export interface LeagueConfig {
  leagueId: string;
  seasonId: string;
  scoring: LeagueScoring;
  /** ESPN lineup slot counts, e.g. { C: 1, "1B": 1, OF: 3, SP: 6, RP: 3 } */
  rosterPositions: Record<string, number>;
  /** Max SP appearances that count as starts per matchup week (CBA: 7) */
  pitcherStartCap: number;
  /** Players lock when their real game starts */
  dailyLock: boolean;
  pointsLeague: true;
}

// ----- Matchup configuration -----

export interface MatchupConfig {
  matchupId: string;
  matchupPeriodId: number;         // ESPN week number (1-21)
  weekStart: string;               // ISO date "2026-03-30"
  weekEnd: string;                 // ISO date "2026-04-05"
  pitcherStartCap: number;         // may differ from league default for extended weeks
  isExtendedMatchup: boolean;
  /** ISO timestamp of when this snapshot was built */
  lastUpdatedAt: string;
}

// ----- Per-game context (used by projection) -----

export interface MLBOpponentContext {
  opponentTeam?: string;
  probableOpposingPitcher?: string;
  /** >1 = hitter-friendly, <1 = pitcher-friendly */
  parkFactor?: number;
  /** -1 to +1; positive = favors offense */
  weatherScore?: number;
  /** 0–1; 0.5 = average, lower = weaker opponent pitching (good for hitters) */
  opponentVsPositionStrength?: number;
  vegasImpliedRuns?: number;
  vegasImpliedAllowedRuns?: number;
}

// ----- Player-level projections -----

export interface PlayerRecentForm {
  last7Avg?: number;
  last14Avg?: number;
  last30Avg?: number;
  /** Standard deviation of recent per-game scores */
  volatility?: number;
}

export interface PlayerSeasonStats {
  /** Fantasy points per game (full season) */
  fantasyPointsPerGame?: number;
  fantasyPointsStdDev?: number;
  appearances?: number;
  /** For SPs only */
  starts?: number;
  inningsPerStart?: number;
  /** Batting order slot (1-9) — lower = more PA */
  lineupSlot?: number;
  expectedPlateAppearances?: number;
  expectedInnings?: number;
}

/**
 * EROSP player data loaded from data/erosp/latest.json.
 * This is the primary projection signal — built from a 3-year talent blend,
 * playing-time model, park factors, injury map, and role classification.
 */
export interface EROSPPlayerData {
  mlbamId: number;
  espnId: string;
  name: string;
  position: string;
  mlbTeam: string;
  /** "H" | "SP" | "RP" */
  role: string;
  /** CBA fantasy team ID (0 = free agent) */
  fantasyTeamId: number;
  isFa: boolean;
  /** Projected total fantasy points, rest of season */
  erospRaw: number;
  /** Value above replacement (use for rankings; Raw for actual projection) */
  erospStartable: number;
  /** Expected fantasy points per calendar day (mean over remaining schedule) */
  erospPerGame: number;
  /** Games remaining in season */
  gamesRemaining: number;
  /**
   * Sigmoid-based probability this player is above replacement level
   * (proxy for roster confidence / playing-time certainty).
   * NOT the per-game start probability for SPs.
   */
  startProbability: number;
  /** min(1, 7 / team_expected_starts_per_week) — SP weekly cap discount */
  capFactor: number;
  /** Plate appearances per game (hitters only) */
  paPerGame?: number;
  /** Fantasy points per plate appearance (hitters only) */
  fpPerPa?: number;
}

/** A single remaining game opportunity for a player this matchup week */
export interface ScheduledGame {
  /** ISO date of the game */
  date: string;
  gameState: GameState;
  /** Game has already started; player is locked */
  locked: boolean;
  completed: boolean;
  /**
   * For SPs: probability this game is a scheduled start.
   * For RPs: probability of an appearance.
   * For hitters: probability they are in the lineup.
   */
  appearanceProbability: number;
  /**
   * For SPs only: probability this is a starting-pitcher appearance
   * (vs. relief or off day).
   */
  isStartingPitcherExpected?: boolean;
  startProbability?: number;
  opponentContext?: MLBOpponentContext;
}

/** Full projection input for a single player */
export interface PlayerProjectionInput {
  playerId: string;
  name: string;
  mlbTeam: string;
  fantasyTeamId: string;
  /** Player is on the active roster (not IL, not benched) */
  active: boolean;
  lineupSlot: string;
  role: PlayerRole;
  injured?: boolean;
  questionable?: boolean;
  season: PlayerSeasonStats;
  recent: PlayerRecentForm;
  /** EROSP projection data — primary signal */
  erosp?: EROSPPlayerData;
  /** Points this player has already scored in the current matchup period */
  alreadyScoredPointsThisMatchup: number;
  scheduledGamesRemaining: ScheduledGame[];
}

// ----- Team-level matchup state -----

export interface FantasyTeamMatchupState {
  fantasyTeamId: string;
  name: string;
  /** Total points scored so far this matchup week (team total) */
  currentPoints: number;
  players: PlayerProjectionInput[];
  /** Number of SP appearances already used as "starts" this week */
  usedPitcherStarts: number;
}

export interface MatchupState {
  league: LeagueConfig;
  matchup: MatchupConfig;
  home: FantasyTeamMatchupState;
  away: FantasyTeamMatchupState;
}

// ----- Simulation output -----

export interface PlayerDistributionEstimate {
  playerId: string;
  mean: number;
  stdDev: number;
  floor: number;
  ceiling: number;
}

export interface TeamSimulationSummary {
  projectedFinalPoints: number;
  lowerRange: number;   // P10
  upperRange: number;   // P90
}

export interface WinProbabilityResult {
  homeWinProbability: number;
  awayWinProbability: number;
  tieProbability: number;
  homeSummary: TeamSimulationSummary;
  awaySummary: TeamSimulationSummary;
  simulationCount: number;
}

// ----- Backtesting -----

export interface HistoricalMatchupSnapshot {
  snapshotId: string;
  capturedAt: string;
  /** Points already scored when snapshot was taken */
  homeCurrentPoints: number;
  awayCurrentPoints: number;
  /** Mean remaining points projection at snapshot time */
  homeProjectedRemaining: number;
  awayProjectedRemaining: number;
  actualHomeFinalPoints: number;
  actualAwayFinalPoints: number;
}

export interface BacktestPrediction {
  snapshotId: string;
  capturedAt: string;
  predictedHomeWinProbability: number;
  predictedAwayWinProbability: number;
  actualHomeWon: boolean;
  actualAwayWon: boolean;
  actualTie: boolean;
  favoredTeam: "home" | "away";
  favoriteWon: boolean;
}

export interface CalibrationBucket {
  bucketStart: number;
  bucketEnd: number;
  predictionCount: number;
  averagePredictedProbability: number;
  actualWinRate: number;
  /** Absolute calibration error for this bucket */
  calibrationError: number;
}

export interface BacktestSummary {
  totalPredictions: number;
  /** Fraction of matchups where the favored team won */
  winnerAccuracy: number;
  /** Mean Brier score (lower = better; perfect = 0) */
  brierScore: number;
  /** Binary cross-entropy (lower = better) */
  logLoss: number;
  /** Expected Calibration Error — weighted avg bucket error */
  expectedCalibrationError: number;
  /** Is model overconfident (+), underconfident (-), or well-calibrated (~0)? */
  confidenceBias: number;
  calibration: CalibrationBucket[];
  /**
   * True if winnerAccuracy >= 0.75 (production acceptance threshold).
   * NOTE: Start-of-week historical backtest on a balanced keeper league
   * will typically score 55-60%. The 75% threshold is met in live use
   * (mid-week) when substantial points are already locked.
   */
  meetsAccuracyThreshold: boolean;
}
