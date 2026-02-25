'use client';

import { useState } from 'react';
import { postMessage, postTrade } from './actions';

interface Team {
  id: number;
  displayName: string;
  owner: string;
  primaryColor: string;
}

interface Props {
  teams: Team[];
}

type PostMode = 'message' | 'trade';

export default function MessageBoardForm({ teams }: Props) {
  const [mode, setMode] = useState<PostMode>('message');

  // Shared
  const [authorTeamId, setAuthorTeamId] = useState<number | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Message-specific
  const [targetTeamId, setTargetTeamId] = useState<number | ''>('');
  const [message, setMessage] = useState('');
  const [videoUrl, setVideoUrl] = useState('');

  // Trade-specific
  const [tradePartnerTeamId, setTradePartnerTeamId] = useState<number | ''>('');
  const [tradeGiving, setTradeGiving] = useState('');
  const [tradeReceiving, setTradeReceiving] = useState('');
  const [tradeComment, setTradeComment] = useState('');

  const selectedAuthor = teams.find(t => t.id === authorTeamId);

  function handleModeSwitch(newMode: PostMode) {
    setMode(newMode);
    setSubmitted(false);
  }

  async function handleSubmitMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!authorTeamId || !message.trim()) return;
    setSubmitting(true);
    await postMessage(
      authorTeamId,
      selectedAuthor?.owner ?? '',
      message,
      targetTeamId !== '' ? targetTeamId : undefined,
      videoUrl || undefined
    );
    setMessage('');
    setVideoUrl('');
    setTargetTeamId('');
    setSubmitting(false);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  }

  async function handleSubmitTrade(e: React.FormEvent) {
    e.preventDefault();
    if (!authorTeamId || !tradePartnerTeamId || !tradeGiving.trim() || !tradeReceiving.trim()) return;
    setSubmitting(true);
    await postTrade(
      authorTeamId as number,
      selectedAuthor?.owner ?? '',
      tradePartnerTeamId as number,
      tradeGiving,
      tradeReceiving,
      tradeComment || undefined
    );
    setTradePartnerTeamId('');
    setTradeGiving('');
    setTradeReceiving('');
    setTradeComment('');
    setSubmitting(false);
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-8">
      {/* Mode tabs */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => handleModeSwitch('message')}
          className={`flex-1 py-3 text-sm font-semibold rounded-tl-xl transition ${
            mode === 'message'
              ? 'bg-white text-teal-700 border-b-2 border-teal-600'
              : 'bg-gray-50 text-gray-400 hover:text-gray-600'
          }`}
        >
          💬 Message
        </button>
        <button
          type="button"
          onClick={() => handleModeSwitch('trade')}
          className={`flex-1 py-3 text-sm font-semibold rounded-tr-xl transition ${
            mode === 'trade'
              ? 'bg-white text-blue-700 border-b-2 border-blue-600'
              : 'bg-gray-50 text-gray-400 hover:text-gray-600'
          }`}
        >
          🔄 Trade
        </button>
      </div>

      {/* ── Message form ─────────────────────────────────── */}
      {mode === 'message' && (
        <form onSubmit={handleSubmitMessage} className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Who&apos;s posting?
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
              Message
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              required
              maxLength={500}
              rows={3}
              placeholder="Say something…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
            />
            <p className="text-xs text-gray-300 text-right mt-1">{message.length}/500</p>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Video URL (optional)
            </label>
            <input
              type="url"
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              placeholder="YouTube or direct video link…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
            />
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
      )}

      {/* ── Trade form ───────────────────────────────────── */}
      {mode === 'trade' && (
        <form onSubmit={handleSubmitTrade} className="p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Your team
              </label>
              <select
                value={authorTeamId}
                onChange={e => setAuthorTeamId(e.target.value === '' ? '' : Number(e.target.value))}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Select your team…</option>
                {teams.map(t => (
                  <option key={t.id} value={t.id}>{t.owner} — {t.displayName}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Trading with
              </label>
              <select
                value={tradePartnerTeamId}
                onChange={e => setTradePartnerTeamId(e.target.value === '' ? '' : Number(e.target.value))}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Select other team…</option>
                {teams
                  .filter(t => t.id !== authorTeamId)
                  .map(t => (
                    <option key={t.id} value={t.id}>{t.owner} — {t.displayName}</option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                {selectedAuthor ? `${selectedAuthor.owner} sends` : 'You send'}
              </label>
              <textarea
                value={tradeGiving}
                onChange={e => setTradeGiving(e.target.value)}
                required
                rows={4}
                placeholder={'One player or pick per line…\ne.g. Shohei Ohtani\nPick 1.01'}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                {tradePartnerTeamId !== ''
                  ? `${teams.find(t => t.id === Number(tradePartnerTeamId))?.owner ?? 'They'} send${tradePartnerTeamId !== '' ? 's' : ''}`
                  : 'They send'}
              </label>
              <textarea
                value={tradeReceiving}
                onChange={e => setTradeReceiving(e.target.value)}
                required
                rows={4}
                placeholder={'One player or pick per line…\ne.g. Ronald Acuña Jr.'}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Comment (optional)
            </label>
            <textarea
              value={tradeComment}
              onChange={e => setTradeComment(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Add some context or trash talk…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting || !authorTeamId || !tradePartnerTeamId || !tradeGiving.trim() || !tradeReceiving.trim()}
              className="px-5 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg hover:bg-blue-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Posting…' : 'Post Trade'}
            </button>
            {submitted && (
              <span className="text-sm text-blue-600 font-medium">Trade posted!</span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
