/**
 * scripts/run-win-probability-backtest.ts
 *
 * Runs the historical backtest and prints a calibration report.
 *
 * Usage:
 *   npx tsx scripts/run-win-probability-backtest.ts
 *
 * Acceptance criterion: winner accuracy ≥ 75%
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { runHistoricalBacktest, checkAccuracyThreshold } from "../lib/fantasy/backtest";
import { renderBacktestReport } from "../lib/fantasy/backtestReport";
import * as path from "path";
import * as fs from "fs";

async function main() {
  console.log("\nCBA Win Probability — Historical Backtest\n");

  const result = runHistoricalBacktest({
    dataDir: path.join(__dirname, "../data"),
    simulationCount: 10_000,
    minWeeksHistory: 2,
    minYear: 2022,
  });

  if (result.predictions.length === 0) {
    console.error(
      "No predictions generated. Check that historical data files exist in data/historical/"
    );
    process.exit(1);
  }

  console.log(renderBacktestReport(result.summary));

  const passed = checkAccuracyThreshold(result);

  // Save detailed results to file
  const outPath = path.join(__dirname, "../data/win-probability-backtest.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        summary: result.summary,
        samplePredictions: result.predictions.slice(0, 20), // first 20 for inspection
      },
      null,
      2
    )
  );
  console.log(`\nDetailed results saved to: ${outPath}`);

  process.exit(passed ? 0 : 1);
}

main().catch((e) => {
  console.error("Backtest failed:", e);
  process.exit(1);
});
