'use client';

import { useState } from 'react';
import { postTrashTalk } from './actions';

interface Team {
  id: number;
  displayName: string;
  owner: string;
  primaryColor: string;
}

interface Props {
  teams: Team[];
}

export default function TrashTalkForm({ teams }: Props) {
  const [authorTeamId, setAuthorTeamId] = useState<number | ''>('');
  const [targetTeamId, setTargetTeamId] = useState<number | ''>('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const selectedAuthor = teams.find(t => t.id === authorTeamId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!authorTeamId || !message.trim()) return;

    setSubmitting(true);
    await postTrashTalk(
      authorTeamId,
      selectedAuthor?.owner ?? '',
      message,
      targetTeamId !== '' ? targetTeamId : undefined
    );
    setMessage('');
    setTargetTeamId('');
    setSubmitting(false);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm mb-8">
      <h2 className="text-lg font-bold text-gray-700 mb-4">Drop Some Heat</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Who are you?
          </label>
          <select
            value={authorTeamId}
            onChange={e => setAuthorTeamId(e.target.value === '' ? '' : Number(e.target.value))}
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            <option value="">Select your team…</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.owner} — {t.displayName}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Targeting (optional)
          </label>
          <select
            value={targetTeamId}
            onChange={e => setTargetTeamId(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            <option value="">The whole league</option>
            {teams
              .filter(t => t.id !== authorTeamId)
              .map(t => (
                <option key={t.id} value={t.id}>{t.displayName}</option>
              ))}
          </select>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Your message
        </label>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          required
          maxLength={280}
          rows={3}
          placeholder="Talk your talk…"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
        />
        <p className="text-xs text-gray-300 text-right mt-1">{message.length}/280</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting || !authorTeamId || !message.trim()}
          className="px-5 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? 'Posting…' : 'Post'}
        </button>
        {submitted && (
          <span className="text-sm text-teal-600 font-medium">Posted!</span>
        )}
      </div>
    </form>
  );
}
