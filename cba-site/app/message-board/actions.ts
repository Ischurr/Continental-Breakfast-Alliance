'use server';

import fs from 'fs';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { TrashTalkData } from '@/lib/types';

const filePath = path.join(process.cwd(), 'data', 'trash-talk.json');

function revalidateAll() {
  revalidatePath('/message-board');
  revalidatePath('/');
  revalidatePath('/teams/[teamId]');
}

export async function postMessage(
  authorTeamId: number,
  authorName: string,
  message: string,
  targetTeamId?: number,
  videoUrl?: string
): Promise<void> {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data: TrashTalkData = JSON.parse(raw);

  data.posts.unshift({
    id: `post-${Date.now()}`,
    authorTeamId,
    authorName,
    targetTeamId: targetTeamId ?? undefined,
    message: message.trim(),
    videoUrl: videoUrl?.trim() || undefined,
    createdAt: new Date().toISOString(),
  });

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  revalidateAll();
}

export async function postTrade(
  authorTeamId: number,
  authorName: string,
  partnerTeamId: number,
  tradeGiving: string,
  tradeReceiving: string,
  message?: string
): Promise<void> {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data: TrashTalkData = JSON.parse(raw);

  data.posts.unshift({
    id: `post-${Date.now()}`,
    authorTeamId,
    authorName,
    targetTeamId: partnerTeamId,
    message: message?.trim() ?? '',
    postType: 'trade',
    tradeGiving: tradeGiving.trim(),
    tradeReceiving: tradeReceiving.trim(),
    createdAt: new Date().toISOString(),
  });

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  revalidateAll();
}

export async function editPost(
  postId: string,
  newMessage: string,
  tradeGiving?: string,
  tradeReceiving?: string
): Promise<void> {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data: TrashTalkData = JSON.parse(raw);
  const post = data.posts.find(p => p.id === postId);
  if (!post) return;
  post.message = newMessage.trim();
  if (tradeGiving !== undefined) post.tradeGiving = tradeGiving.trim();
  if (tradeReceiving !== undefined) post.tradeReceiving = tradeReceiving.trim();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  revalidateAll();
}

export async function deletePost(postId: string): Promise<void> {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data: TrashTalkData = JSON.parse(raw);
  data.posts = data.posts.filter(p => p.id !== postId);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  revalidateAll();
}
