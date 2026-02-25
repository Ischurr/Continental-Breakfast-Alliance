'use server';

import { revalidatePath } from 'next/cache';
import { TrashTalkData } from '@/lib/types';
import { getTrashTalk, setTrashTalk } from '@/lib/store';

export async function postTrashTalk(
  authorTeamId: number,
  authorName: string,
  message: string,
  targetTeamId?: number
): Promise<void> {
  const data: TrashTalkData = await getTrashTalk();

  data.posts.unshift({
    id: `post-${Date.now()}`,
    authorTeamId,
    authorName,
    targetTeamId: targetTeamId ?? undefined,
    message: message.trim(),
    createdAt: new Date().toISOString(),
  });

  await setTrashTalk(data);
  revalidatePath('/trash-talk');
}
