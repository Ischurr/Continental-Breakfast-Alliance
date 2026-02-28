'use server';

import { revalidatePath } from 'next/cache';
import { TrashTalkData } from '@/lib/types';
import { getTrashTalk, setTrashTalk } from '@/lib/store';

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
  const data: TrashTalkData = await getTrashTalk();

  data.posts.unshift({
    id: `post-${Date.now()}`,
    authorTeamId,
    authorName,
    targetTeamId: targetTeamId ?? undefined,
    message: message.trim(),
    videoUrl: videoUrl?.trim() || undefined,
    createdAt: new Date().toISOString(),
  });

  await setTrashTalk(data);
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
  const data: TrashTalkData = await getTrashTalk();

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

  await setTrashTalk(data);
  revalidateAll();
}

export async function editPost(
  postId: string,
  newMessage: string,
  tradeGiving?: string,
  tradeReceiving?: string
): Promise<void> {
  const data: TrashTalkData = await getTrashTalk();
  const post = data.posts.find(p => p.id === postId);
  if (!post) return;
  post.message = newMessage.trim();
  if (tradeGiving !== undefined) post.tradeGiving = tradeGiving.trim();
  if (tradeReceiving !== undefined) post.tradeReceiving = tradeReceiving.trim();
  await setTrashTalk(data);
  revalidateAll();
}

export async function deletePost(postId: string): Promise<void> {
  try {
    const data: TrashTalkData = await getTrashTalk();
    data.posts = data.posts.filter(p => p.id !== postId);
    await setTrashTalk(data);
    revalidateAll();
  } catch (err) {
    console.error('[deletePost] failed:', err);
    throw err;
  }
}

// ranking posts are stored separately in rankings.json; reuse existing action
import { postArticle } from '../rankings/actions';

export async function postRanking(title: string, content: string, password: string): Promise<void> {
  // forward to rankings module (will revalidate its own path)
  await postArticle(title, content, password);
  // ensure message-board also revalidates in case it displays links
  revalidateAll();
}
