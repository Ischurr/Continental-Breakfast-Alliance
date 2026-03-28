// ============================================================
// scripts/fetch-schedule-config.ts
//
// Builds the scoring-period → matchup-week map for the season
// and saves it to data/fantasy/schedule-{year}.json.
//
// ESPN's matchupPeriods API only returns one period per week (useless
// for daily remaining-days math), and its scoringPeriodId parameter
// doesn't affect which matchupPeriod is returned. So we build the map
// from dates: opening day + week-1 end date (typically the following
// Sunday), then 7-day weeks from there.
//
// Usage:
//   npx tsx scripts/fetch-schedule-config.ts
//
// The script reads ESPN's live state to confirm the current scoring
// period and matchup period, then builds the full week map.
//
// To override dates (if week 1 is unusual):
//   SEASON_START=2026-03-25 WEEK1_END=2026-04-05 npm run fetch-schedule-config
// ============================================================

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { createESPNClient } from "../lib/espn-api";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const SEASON_ID = process.env.ESPN_SEASON_ID ?? "2026";
const OUT_PATH = path.join(process.cwd(), "data", "fantasy", `schedule-${SEASON_ID}.json`);

// Known league schedule for 2026:
//   - Opening Day: March 25, 2026
//   - Week 1 runs through Sunday April 5 (12-day opening week)
//   - Weeks 2+ are standard Mon–Sun 7-day weeks
//
// Override via env vars if dates ever change.
const SEASON_START_DATE = process.env.SEASON_START ?? "2026-03-25";
const WEEK1_END_DATE = process.env.WEEK1_END ?? "2026-04-05";
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
  console.log(`  Season start: ${SEASON_START_DATE}`);
  console.log(`  Week 1 end:   ${WEEK1_END_DATE}`);

  const client = createESPNClient(SEASON_ID);
  const data = await client.fetchLeagueData(["mMatchup"]) as ESPNAny;
  const currentScoringPeriod = (data.scoringPeriodId as number | undefined) ?? 1;
  const statusData = data.status as ESPNAny | undefined;
  const currentMatchupPeriod = (statusData?.currentMatchupPeriod as number | undefined) ?? 1;
  console.log(`  Live ESPN: scoring period ${currentScoringPeriod}, matchup week ${currentMatchupPeriod}`);

  // ---- Build week boundaries ----
  const seasonStart = new Date(SEASON_START_DATE + "T12:00:00Z");
  const week1End = new Date(WEEK1_END_DATE + "T12:00:00Z");

  const week1Length = daysBetween(seasonStart, week1End) + 1;
  console.log(`  Week 1 length: ${week1Length} days`);

  // Verify: current scoring period should equal days since season start (1-indexed)
  const today = new Date();
  const todayOffset = daysBetween(seasonStart, today); // 0-indexed days since start
  const expectedScoringPeriod = todayOffset + 1;
  if (Math.abs(expectedScoringPeriod - currentScoringPeriod) > 1) {
    console.warn(`  ⚠ Expected scoring period ~${expectedScoringPeriod} but ESPN says ${currentScoringPeriod}.`);
    console.warn(`    SEASON_START may be wrong. Update SEASON_START env var if needed.`);
  } else {
    console.log(`  ✓ Scoring period matches (expected ${expectedScoringPeriod}, ESPN says ${currentScoringPeriod})`);
  }

  // Build the week map: matchupPeriod → [scoringPeriod, ...]
  const matchupPeriods: Record<string, number[]> = {};
  const weekDates: Array<{ week: number; start: string; end: string; length: number }> = [];

  let sp = 1; // scoring period counter
  for (let w = 1; w <= TOTAL_WEEKS; w++) {
    const weekLen = w === 1 ? week1Length : 7;
    const periods: number[] = [];
    for (let d = 0; d < weekLen; d++) periods.push(sp + d);
    matchupPeriods[String(w)] = periods;

    const weekStart = addDays(seasonStart, sp - 1);
    const weekEnd = addDays(seasonStart, sp - 1 + weekLen - 1);
    weekDates.push({ week: w, start: toISO(weekStart), end: toISO(weekEnd), length: weekLen });
    sp += weekLen;
  }

  // ---- Print summary ----
  console.log(`\n  Week boundaries (${TOTAL_WEEKS} weeks, ${sp - 1} total scoring periods):`);
  for (const { week, start, end, length } of weekDates.slice(0, 5)) {
    console.log(`    Week ${String(week).padStart(2)}: ${start} – ${end} (${length} days, periods ${matchupPeriods[String(week)][0]}–${matchupPeriods[String(week)].slice(-1)[0]})`);
  }
  console.log(`    ...`);
  for (const { week, start, end, length } of weekDates.slice(-2)) {
    console.log(`    Week ${String(week).padStart(2)}: ${start} – ${end} (${length} days, periods ${matchupPeriods[String(week)][0]}–${matchupPeriods[String(week)].slice(-1)[0]})`);
  }

  // Cross-check current week
  const currentWeekPeriods = matchupPeriods[String(currentMatchupPeriod)] ?? [];
  const lastPeriodThisWeek = currentWeekPeriods.at(-1) ?? 0;
  const remaining = Math.max(1, lastPeriodThisWeek - currentScoringPeriod + 1);
  console.log(`\n  ✓ Today (scoring period ${currentScoringPeriod}) is in week ${currentMatchupPeriod}`);
  console.log(`    Week ${currentMatchupPeriod} ends at scoring period ${lastPeriodThisWeek} → ${remaining} days remaining`);

  // ---- Save ----
  const output = {
    generatedAt: new Date().toISOString(),
    seasonId: SEASON_ID,
    seasonStartDate: SEASON_START_DATE,
    week1EndDate: WEEK1_END_DATE,
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
