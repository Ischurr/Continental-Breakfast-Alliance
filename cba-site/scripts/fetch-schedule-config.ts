// ============================================================
// scripts/fetch-schedule-config.ts
//
// Builds the scoring-period → matchup-week map for the season
// and saves it to data/fantasy/schedule-{year}.json.
//
// ESPN's matchupPeriods API is not useful for remaining-days math
// (maps each week to a single number, not daily periods). So we
// build the map from known anchor dates.
//
// Default 2026 anchors (non-standard-length weeks):
//   Week 1:  March 25 – April 5  (12 days — Opening Day through first Sunday)
//   Week 16: July 13 – July 26   (14 days — spans All-Star Break)
//   All other weeks: 7 days (Mon–Sun)
//
// Usage:
//   npx tsx scripts/fetch-schedule-config.ts
//
// Override any anchor dates via env vars:
//   SEASON_START=2026-03-25        First day of the season (scoring period 1)
//   WEEK1_END=2026-04-05           End of week 1 (first Sunday >= Opening Day)
//   ALLSTAR_END=2026-07-26         End of All-Star Break extended week
//
// For future seasons, just update these three dates and re-run.
// ============================================================

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { createESPNClient } from "../lib/espn-api";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const SEASON_ID = process.env.ESPN_SEASON_ID ?? "2026";
const OUT_PATH = path.join(process.cwd(), "data", "fantasy", `schedule-${SEASON_ID}.json`);

// ---- Known schedule anchors for 2026 ----
// Update these when ESPN publishes the schedule each year.
const SEASON_START_DATE = process.env.SEASON_START ?? "2026-03-25";
const WEEK1_END_DATE    = process.env.WEEK1_END    ?? "2026-04-05";  // 12-day opening week
const ALLSTAR_END_DATE  = process.env.ALLSTAR_END  ?? "2026-07-26";  // 14-day All-Star week

const TOTAL_WEEKS = 23; // 21 regular + 2 playoff

type ESPNAny = Record<string, unknown>;

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log(`\n[fetch-schedule-config] Building schedule for season ${SEASON_ID}`);
  console.log(`  Season start:     ${SEASON_START_DATE}`);
  console.log(`  Week 1 end:       ${WEEK1_END_DATE}`);
  console.log(`  All-Star end:     ${ALLSTAR_END_DATE}`);

  const client = createESPNClient(SEASON_ID);
  const data = await client.fetchLeagueData(["mMatchup"]) as ESPNAny;
  const currentScoringPeriod = (data.scoringPeriodId as number | undefined) ?? 1;
  const statusData = data.status as ESPNAny | undefined;
  const currentMatchupPeriod = (statusData?.currentMatchupPeriod as number | undefined) ?? 1;
  console.log(`  Live ESPN: scoring period ${currentScoringPeriod}, matchup week ${currentMatchupPeriod}`);

  const seasonStart  = new Date(SEASON_START_DATE + "T12:00:00Z");
  const week1End     = new Date(WEEK1_END_DATE    + "T12:00:00Z");
  const allstarEnd   = new Date(ALLSTAR_END_DATE  + "T12:00:00Z");

  // Verify current scoring period matches days since season start
  const today = new Date();
  const expectedSP = daysBetween(seasonStart, today) + 1;
  if (Math.abs(expectedSP - currentScoringPeriod) > 1) {
    console.warn(`  ⚠ Expected scoring period ~${expectedSP} but ESPN says ${currentScoringPeriod}.`);
    console.warn(`    Check SEASON_START — it may be wrong.`);
  } else {
    console.log(`  ✓ Scoring period matches (expected ${expectedSP}, ESPN says ${currentScoringPeriod})`);
  }

  // ---- Build week boundaries ----
  // Walk forward week by week. At each week, the default length is 7 days,
  // but override at known anchor points.
  const matchupPeriods: Record<string, number[]> = {};
  const weekDates: Array<{ week: number; start: string; end: string; length: number }> = [];

  let currentDay = seasonStart; // start of current week (0-indexed day from season start)
  let sp = 1;                   // first scoring period of this week

  for (let w = 1; w <= TOTAL_WEEKS; w++) {
    // Determine this week's end date
    let weekEnd: Date;

    if (w === 1) {
      weekEnd = week1End;
    } else {
      // Default: 7 days from week start
      const defaultEnd = addDays(currentDay, 6);

      // Check if the All-Star anchor falls within or just after this week's default range.
      // If this week's default range contains the All-Star anchor, extend to the anchor.
      // Specifically: if allstarEnd is later than defaultEnd AND falls within 2 weeks of currentDay,
      // this is the All-Star Break week → use allstarEnd.
      const daysToAllstar = daysBetween(currentDay, allstarEnd);
      if (daysToAllstar >= 0 && daysToAllstar < 14) {
        weekEnd = allstarEnd;
      } else {
        weekEnd = defaultEnd;
      }
    }

    const weekLen = daysBetween(currentDay, weekEnd) + 1;
    const periods: number[] = [];
    for (let d = 0; d < weekLen; d++) periods.push(sp + d);
    matchupPeriods[String(w)] = periods;
    weekDates.push({ week: w, start: toISO(currentDay), end: toISO(weekEnd), length: weekLen });

    sp += weekLen;
    currentDay = addDays(weekEnd, 1); // next week starts day after this one ends
  }

  // ---- Print summary ----
  console.log(`\n  Week boundaries:`);
  for (const { week, start, end, length } of weekDates) {
    const marker = length !== 7 ? ` ← ${length} days` : "";
    const periods = matchupPeriods[String(week)] as number[];
    console.log(
      `  Week ${String(week).padStart(2)}: ${start} – ${end}  (periods ${periods[0]}–${periods[periods.length - 1]})${marker}`
    );
  }

  // Cross-check current week
  const currentWeekPeriods = matchupPeriods[String(currentMatchupPeriod)] ?? [];
  const lastPeriodThisWeek = currentWeekPeriods[currentWeekPeriods.length - 1] ?? 0;
  const remaining = Math.max(1, lastPeriodThisWeek - currentScoringPeriod + 1);
  console.log(`\n  Today (scoring period ${currentScoringPeriod}, week ${currentMatchupPeriod}): ${remaining} days remaining in current week`);

  // ---- Save ----
  const output = {
    generatedAt: new Date().toISOString(),
    seasonId: SEASON_ID,
    seasonStartDate: SEASON_START_DATE,
    week1EndDate: WEEK1_END_DATE,
    allstarEndDate: ALLSTAR_END_DATE,
    matchupPeriods,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n[fetch-schedule-config] Saved to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("[fetch-schedule-config] Fatal error:", err);
  process.exit(1);
});
