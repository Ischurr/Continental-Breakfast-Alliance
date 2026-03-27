// ============================================================
// lib/fantasy/index.ts
//
// Public API surface for the CBA win-probability engine.
// Import from this file to avoid deep path references.
// ============================================================

export type {
  BacktestPrediction,
  BacktestSummary,
  CalibrationBucket,
  EROSPPlayerData,
  FantasyTeamMatchupState,
  HistoricalMatchupSnapshot,
  LeagueConfig,
  MatchupConfig,
  MatchupState,
  PlayerDistributionEstimate,
  PlayerProjectionInput,
  PlayerRole,
  ScheduledGame,
  TeamSimulationSummary,
  WinProbabilityResult,
} from "./types";

export {
  CBA_PITCHER_START_CAP,
  CBA_ROSTER_SLOTS,
  CBA_SCORING,
  DEFAULT_SIMULATION_COUNT,
  ESPN_LEAGUE_ID,
  ESPN_SEASON_ID,
} from "./constants";

export {
  loadCurrentMatchupStates,
  buildOfflineMatchupState,
} from "./espnLoader";
export type { LoadMatchupStateOptions } from "./espnLoader";

export {
  estimateSingleGameProjection,
  estimateWeekRemainingProjection,
} from "./playerProjection";

export {
  chooseOptimalPitcherStarts,
} from "./pitcherStrategy";
export type { PlannedStart, PitcherStrategyResult } from "./pitcherStrategy";

export { runMatchupSimulation } from "./simulation";

export {
  calculateMatchupWinProbability,
  calculateAllMatchupsWinProbability,
} from "./winProbability";
export type { MatchupWinProbabilityView } from "./winProbability";

export {
  runHistoricalBacktest,
  checkAccuracyThreshold,
} from "./backtest";
export type { BacktestOptions, BacktestResult } from "./backtest";

export {
  renderBacktestReport,
  renderBacktestOneLiner,
} from "./backtestReport";

export {
  runNightlyWinProbabilityJob,
  runMatchupSimulations,
} from "./nightlyJob";
export type { NightlyJobOptions, NightlyJobResult, WinProbabilityStore } from "./nightlyJob";
