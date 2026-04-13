import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MLB_BASE = 'https://statsapi.mlb.com/api/v1';
const DATA_DIR = path.join(process.cwd(), 'data');

function getTodayET(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
  }).format(new Date());
}

export interface ProspectStatusResponse {
  name: string;
  calledUp: boolean;
  calledUpDate: string | null;
}

interface ProspectData {
  name: string;
  mlbamId: number | null;
  mlbTeam: string;
  mlbTeamId: number | null;
  calledUp: boolean;
  calledUpDate: string | null;
}

interface ProspectEntry {
  teamName: string;
  prospect: ProspectData;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const teamIdStr = searchParams.get('teamId');
  const teamId = teamIdStr ? parseInt(teamIdStr, 10) : NaN;

  if (isNaN(teamId)) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }

  // ── Load prospect data ────────────────────────────────────────────────────
  let prospect: ProspectData | null = null;
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, 'prospect-protections.json'), 'utf-8')
    );
    const entry = (raw as Record<string, ProspectEntry>)[String(teamId)];
    prospect = entry?.prospect ?? null;
  } catch {
    return NextResponse.json({ error: 'Data unavailable' }, { status: 503 });
  }

  if (!prospect) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  const { name, mlbamId, mlbTeamId, calledUp: fileCalledUp, calledUpDate: fileCalledUpDate } = prospect;

  // If already marked called-up in the JSON file, return immediately
  if (fileCalledUp) {
    const result: ProspectStatusResponse = { name, calledUp: true, calledUpDate: fileCalledUpDate };
    return NextResponse.json(result);
  }

  // Can't do a live check without IDs
  if (!mlbTeamId || !mlbamId) {
    const result: ProspectStatusResponse = { name, calledUp: false, calledUpDate: null };
    return NextResponse.json(result);
  }

  // ── KV cache (10-minute TTL, keyed by team + date) ────────────────────────
  const todayET = getTodayET();
  const cacheKey = `prospect-status-${teamId}-${todayET}`;

  if (process.env.KV_REST_API_URL) {
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.KV_REST_API_URL!,
        token: process.env.KV_REST_API_TOKEN!,
      });
      const cached = await redis.get<ProspectStatusResponse>(cacheKey);
      if (cached !== null) return NextResponse.json(cached);
    } catch { /* cache miss — proceed to live check */ }
  }

  // ── Live check: MLB Stats API 26-man roster ───────────────────────────────
  let calledUp = false;
  let calledUpDate: string | null = null;

  try {
    const res = await fetch(
      `${MLB_BASE}/teams/${mlbTeamId}/roster?rosterType=26Man`,
      { signal: AbortSignal.timeout(8_000) }
    );
    if (res.ok) {
      const data = await res.json();
      const roster = (data?.roster ?? []) as Array<Record<string, unknown>>;
      const found = roster.some(
        r => (r.person as Record<string, unknown>)?.id === mlbamId
      );
      if (found) {
        calledUp = true;
        calledUpDate = todayET;
      }
    }
  } catch { /* network error — return not-called-up */ }

  const result: ProspectStatusResponse = { name, calledUp, calledUpDate };

  // ── Cache result for 10 minutes ───────────────────────────────────────────
  if (process.env.KV_REST_API_URL) {
    try {
      const { Redis } = await import('@upstash/redis');
      const redis = new Redis({
        url: process.env.KV_REST_API_URL!,
        token: process.env.KV_REST_API_TOKEN!,
      });
      await redis.set(cacheKey, JSON.stringify(result), { ex: 600 });
    } catch { /* non-fatal */ }
  }

  return NextResponse.json(result);
}
