'use server';

import { revalidatePath } from 'next/cache';
import { PollsData } from '@/lib/types';
import { getPolls, setPolls } from '@/lib/store';

export async function castVote(pollId: string, optionId: string): Promise<void> {
  const data: PollsData = await getPolls();

  const poll = data.polls.find(p => p.id === pollId);
  if (!poll || !poll.active) return;

  const option = poll.options.find(o => o.id === optionId);
  if (!option) return;

  option.votes += 1;

  await setPolls(data);
  revalidatePath('/polls');
  revalidatePath('/message-board');
}
