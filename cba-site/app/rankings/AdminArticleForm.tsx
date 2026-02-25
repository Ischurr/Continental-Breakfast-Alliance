"use client";

import { useState } from 'react';
import { postArticle, editArticle, deleteArticle } from './actions';

interface Props {
  existing?: {
    id: string;
    title: string;
    content: string;
  } | null;
  onSaved?: () => void;
}

export default function AdminArticleForm({ existing = null, onSaved }: Props) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [content, setContent] = useState(existing?.content ?? '');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSubmitting(true);
    try {
      // @ts-ignore server action
      await postArticle(title, content, password);
      setMessage('Published');
      setTitle('');
      setContent('');
      setPassword('');
      onSaved?.();
    } catch (err: any) {
      setMessage(err?.message ?? 'Error');
    } finally {
      setSubmitting(false);
      setTimeout(() => setMessage(''), 3000);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!existing) return;
    setSubmitting(true);
    try {
      // @ts-ignore server action
      await editArticle(existing.id, title, content, password);
      setMessage('Saved');
      onSaved?.();
    } catch (err: any) {
      setMessage(err?.message ?? 'Error');
    } finally {
      setSubmitting(false);
      setTimeout(() => setMessage(''), 3000);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-8">
      <h3 className="text-lg font-semibold mb-3">Admin: Post an Article</h3>
      <form onSubmit={existing ? handleEdit : handleCreate}>
        <div className="mb-3">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full border border-gray-200 rounded px-3 py-2"
            required
          />
        </div>

        <div className="mb-3">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Write your article here. Use blank lines to separate paragraphs."
            rows={8}
            className="w-full border border-gray-200 rounded px-3 py-2 resize-vertical"
            required
          />
        </div>

        <div className="mb-3">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Admin password"
            className="w-full border border-gray-200 rounded px-3 py-2"
            required
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-teal-700 text-white rounded font-semibold disabled:opacity-40"
          >
            {submitting ? 'Saving…' : existing ? 'Save' : 'Publish'}
          </button>
          {message && <span className="text-sm text-gray-600">{message}</span>}
        </div>
      </form>
    </div>
  );
}
