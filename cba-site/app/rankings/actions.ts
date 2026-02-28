'use server';

import { revalidatePath } from 'next/cache';
import { getRankings, setRankings } from '@/lib/store';

export async function postArticle(title: string, content: string, password: string) {
  const adminPin = process.env.NEXT_PUBLIC_ADMIN_PIN ?? '';
  if (!adminPin || password !== adminPin) {
    throw new Error('Unauthorized');
  }

  const store = await getRankings();
  const id = `article-${Date.now()}`;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  store.articles.unshift({
    id,
    slug,
    title: title.trim(),
    content: content.trim(),
    createdAt: new Date().toISOString(),
  });

  await setRankings(store);
  revalidatePath('/rankings');
}

export async function deleteArticle(id: string, password: string) {
  const adminPin = process.env.NEXT_PUBLIC_ADMIN_PIN ?? '';
  if (!adminPin || password !== adminPin) {
    throw new Error('Unauthorized');
  }
  const store = await getRankings();
  store.articles = store.articles.filter(a => a.id !== id);
  await setRankings(store);
  revalidatePath('/rankings');
}

export async function editArticle(id: string, title: string, content: string, password: string) {
  const adminPin = process.env.NEXT_PUBLIC_ADMIN_PIN ?? '';
  if (!adminPin || password !== adminPin) {
    throw new Error('Unauthorized');
  }
  const store = await getRankings();
  const article = store.articles.find(a => a.id === id);
  if (!article) throw new Error('Not found');
  article.title = title.trim();
  article.content = content.trim();
  await setRankings(store);
  revalidatePath('/rankings');
}
