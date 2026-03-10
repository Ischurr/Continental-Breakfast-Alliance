'use server';

import { getDinosContent, setDinosContent } from '@/lib/store';
import { DinosContent } from '@/lib/types';
import { revalidatePath } from 'next/cache';

export async function updateDinosContent(fields: Partial<DinosContent>) {
  const data = await getDinosContent();
  Object.assign(data, fields);
  await setDinosContent(data);
  revalidatePath('/dinos');
}
