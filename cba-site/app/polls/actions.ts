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

// --- admin helpers -----------------------------------------------------------

export async function createPoll(
  question: string,
  options: string[],
  active = true,
  expiresAt?: string,
  password?: string
): Promise<void> {
  const adminPin = process.env.NEXT_PUBLIC_ADMIN_PIN ?? '';
  if (!adminPin || password !== adminPin) {
    throw new Error('Unauthorized');
  }

  const data: PollsData = await getPolls();
  const id = `poll-${Date.now()}`;
  data.polls.unshift({
    id,
    question: question.trim(),
    options: options.map((text, i) => ({ id: `opt-${Date.now()}-${i}`, text: text.trim(), votes: 0 })),
    active,
    expiresAt,
  });
  await setPolls(data);
  revalidatePath('/polls');
  revalidatePath('/message-board');
}

export async function updatePoll(
  pollId: string,
  question: string,
  options: { id?: string; text: string }[],
  active: boolean,
  expiresAt?: string,
  password?: string
): Promise<void> {
  const adminPin = process.env.NEXT_PUBLIC_ADMIN_PIN ?? '';
  if (!adminPin || password !== adminPin) {
    throw new Error('Unauthorized');
  }

  const data: PollsData = await getPolls();
  const poll = data.polls.find(p => p.id === pollId);
  if (!poll) return;
  poll.question = question.trim();
  poll.options = options.map((o, i) => ({
    id: o.id ?? `opt-${Date.now()}-${i}`,
    text: o.text.trim(),
    votes: poll.options.find(po => po.id === o.id)?.votes || 0,
  }));
  poll.active = active;
  poll.expiresAt = expiresAt;
  await setPolls(data);
  revalidatePath('/polls');
  revalidatePath('/message-board');
}

export async function deletePoll(pollId: string, password?: string): Promise<void> {
  const adminPin = process.env.NEXT_PUBLIC_ADMIN_PIN ?? '';
  if (!adminPin || password !== adminPin) {
    throw new Error('Unauthorized');
  }

  const data: PollsData = await getPolls();
  data.polls = data.polls.filter(p => p.id !== pollId);
  await setPolls(data);
  revalidatePath('/polls');
  revalidatePath('/message-board');
}
