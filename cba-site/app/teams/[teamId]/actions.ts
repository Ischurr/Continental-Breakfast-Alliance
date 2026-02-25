'use server';

import { getTeamContent, setTeamContent } from '@/lib/store';
import { revalidatePath } from 'next/cache';

export async function updateTeamContent(
  teamId: number,
  fields: { bio?: string; strengths?: string; weaknesses?: string }
) {
  const data = await getTeamContent();
  data[teamId] = { ...data[teamId], ...fields };
  await setTeamContent(data);
  revalidatePath(`/teams/${teamId}`);
}
