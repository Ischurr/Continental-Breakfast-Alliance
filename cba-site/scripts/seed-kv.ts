/**
 * One-time script to seed Vercel KV from local JSON files.
 * Run once after creating the KV store:
 *   KV_REST_API_URL=... KV_REST_API_TOKEN=... npx tsx scripts/seed-kv.ts
 */

import 'dotenv/config';
import { Redis } from '@upstash/redis';
const kv = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');

async function seed() {
  const trashTalk = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'trash-talk.json'), 'utf-8'));
  await kv.set('trash-talk', trashTalk);
  console.log(`✓ trash-talk seeded (${trashTalk.posts.length} posts)`);

  const polls = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'polls.json'), 'utf-8'));
  await kv.set('polls', polls);
  console.log(`✓ polls seeded (${polls.polls.length} polls)`);

  const rankings = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'rankings.json'), 'utf-8'));
  await kv.set('rankings', rankings);
  console.log(`✓ rankings seeded (${rankings.articles.length} articles)`);

  console.log('\nDone. KV is ready.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
