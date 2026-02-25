/**
 * Unified data store.
 * - Local dev (no KV_REST_API_URL): reads/writes JSON files in data/
 * - Production (KV_REST_API_URL set):  reads/writes Vercel KV (Redis)
 */

import fs from 'fs';
import path from 'path';
import type { TrashTalkData, PollsData } from './types';

const DATA_DIR = path.join(process.cwd(), 'data');
const useKV = !!process.env.KV_REST_API_URL;

async function kvGet<T>(key: string): Promise<T | null> {
  const { Redis } = await import('@upstash/redis');
  const redis = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });
  return redis.get<T>(key);
}

async function kvSet<T>(key: string, value: T): Promise<void> {
  const { Redis } = await import('@upstash/redis');
  const redis = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });
  await redis.set(key, value);
}

// ── Trash talk ────────────────────────────────────────────────────────────────

export async function getTrashTalk(): Promise<TrashTalkData> {
  if (useKV) {
    return (await kvGet<TrashTalkData>('trash-talk')) ?? { posts: [] };
  }
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'trash-talk.json'), 'utf-8'));
}

export async function setTrashTalk(data: TrashTalkData): Promise<void> {
  if (useKV) {
    await kvSet('trash-talk', data);
    return;
  }
  fs.writeFileSync(path.join(DATA_DIR, 'trash-talk.json'), JSON.stringify(data, null, 2), 'utf-8');
}

// ── Polls ─────────────────────────────────────────────────────────────────────

export async function getPolls(): Promise<PollsData> {
  if (useKV) {
    return (await kvGet<PollsData>('polls')) ?? { polls: [] };
  }
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'polls.json'), 'utf-8'));
}

export async function setPolls(data: PollsData): Promise<void> {
  if (useKV) {
    await kvSet('polls', data);
    return;
  }
  fs.writeFileSync(path.join(DATA_DIR, 'polls.json'), JSON.stringify(data, null, 2));
}

// ── Rankings ──────────────────────────────────────────────────────────────────

export async function getRankings(): Promise<{ articles: any[] }> {
  if (useKV) {
    return (await kvGet<{ articles: any[] }>('rankings')) ?? { articles: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'rankings.json'), 'utf-8'));
  } catch {
    return { articles: [] };
  }
}

export async function setRankings(data: { articles: any[] }): Promise<void> {
  if (useKV) {
    await kvSet('rankings', data);
    return;
  }
  fs.writeFileSync(path.join(DATA_DIR, 'rankings.json'), JSON.stringify(data, null, 2), 'utf-8');
}
