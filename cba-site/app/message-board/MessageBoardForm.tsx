'use client';

import { useState, useRef } from 'react';
import { postMessage, postTrade, postRanking, postAnnouncement } from './actions';
import { useAdminMode } from '@/hooks/useAdminMode';
import { Poll } from '@/lib/types';
import PollAdminForm from '../polls/PollAdminForm';

const RANK_COLORS = [
  { label: 'Red',    value: '#dc2626' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Amber',  value: '#d97706' },
  { label: 'Green',  value: '#16a34a' },
  { label: 'Teal',   value: '#0d9488' },
  { label: 'Blue',   value: '#2563eb' },
  { label: 'Indigo', value: '#4f46e5' },
  { label: 'Purple', value: '#9333ea' },
  { label: 'Pink',   value: '#db2777' },
  { label: 'Gray',   value: '#6b7280' },
];

interface Team {
  id: number;
  displayName: string;
  owner: string;
  primaryColor: string;
}

interface Props {
  teams: Team[];
  polls: Poll[];
}

type PostMode = 'message' | 'trade' | 'rankings' | 'polls' | 'commissioner';

export default function MessageBoardForm({ teams, polls }: Props) {
  const [mode, setMode] = useState<PostMode>('message');
  const { isAdmin, unlock } = useAdminMode();

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

  // Rankings-specific
  const [rankTitle, setRankTitle] = useState('');
  const [rankPass, setRankPass] = useState('');
  const [rankEmailLeague, setRankEmailLeague] = useState(true);
  const rankEditorRef = useRef<HTMLDivElement>(null);
  const [rankEditorEmpty, setRankEditorEmpty] = useState(true);

  // Commissioner announcement-specific
  const [annSubject, setAnnSubject] = useState('');
  const [annMessage, setAnnMessage] = useState('');
  const [annPass, setAnnPass] = useState('');

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

  async function handleSubmitAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin || !annSubject.trim() || !annMessage.trim() || !annPass) return;
    setSubmitting(true);
    try {
      await postAnnouncement(annSubject, annMessage, annPass);
      setAnnSubject('');
      setAnnMessage('');
      setAnnPass('');
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    } catch (err: any) {
      alert('Failed: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitRanking(e: React.FormEvent) {
    e.preventDefault();
    const html = rankEditorRef.current?.innerHTML ?? '';
    if (!isAdmin || !rankTitle.trim() || !html.trim() || !rankPass) return;
    setSubmitting(true);
    try {
      await postRanking(rankTitle, html, rankPass, rankEmailLeague);
      setRankTitle('');
      setRankPass('');
      if (rankEditorRef.current) rankEditorRef.current.innerHTML = '';
      setRankEditorEmpty(true);
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    } catch (err: any) {
      alert('Failed: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function rankExec(cmd: string, value?: string) {
    rankEditorRef.current?.focus();
    document.execCommand(cmd, false, value);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-8">
      {/* admin unlock */}
      {!isAdmin && (
        <div className="p-3 text-right">
          <button
            type="button"
            onClick={unlock}
            className="text-sm text-gray-500 hover:underline"
          >
            🔒 Admin login
          </button>
        </div>
      )}

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
          className={`flex-1 py-3 text-sm font-semibold transition ${
            mode === 'trade'
              ? 'bg-white text-blue-700 border-b-2 border-blue-600'
              : 'bg-gray-50 text-gray-400 hover:text-gray-600'
          }`}
        >
          🔄 Trade
        </button>
        <button
          type="button"
          onClick={() => handleModeSwitch('polls')}
          className={`flex-1 py-3 text-sm font-semibold transition ${
            mode === 'polls'
              ? 'bg-white text-green-700 border-b-2 border-green-600'
              : 'bg-gray-50 text-gray-400 hover:text-gray-600'
          }`}
        >
          🗳️ Polls
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => handleModeSwitch('rankings')}
            className={`flex-1 py-3 text-sm font-semibold transition ${
              mode === 'rankings'
                ? 'bg-white text-purple-700 border-b-2 border-purple-600'
                : 'bg-gray-50 text-gray-400 hover:text-gray-600'
            }`}
          >
            📰 Rankings
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={() => handleModeSwitch('commissioner')}
            className={`flex-1 py-3 text-sm font-semibold rounded-tr-xl transition ${
              mode === 'commissioner'
                ? 'bg-white text-yellow-700 border-b-2 border-yellow-500'
                : 'bg-gray-50 text-gray-400 hover:text-gray-600'
            }`}
          >
            📣 Commissioner
          </button>
        )}
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
                  ? `${teams.find(t => t.id === Number(tradePartnerTeamId))?.owner ?? 'They'} sends`
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
      {/** Polls tab: shows admin create/edit UI; voters use the polls above the fold */}
      {mode === 'polls' && (
        <div className="p-5">
          {isAdmin ? (
            <PollAdminForm existing={null} onSaved={() => {}} />
          ) : (
            <div className="text-sm text-gray-600">Vote in the polls above.</div>
          )}
        </div>
      )}

      {/* ── Rankings form (admin only) ───────────────────────────────────── */}
      {mode === 'rankings' && isAdmin && (
        <form onSubmit={handleSubmitRanking} className="p-5">
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Title
            </label>
            <input
              value={rankTitle}
              onChange={e => setRankTitle(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Content
            </label>
            {/* Toolbar */}
            <div className="flex gap-1.5 flex-wrap items-center p-2 bg-gray-50 border border-gray-200 rounded-t-lg border-b-0">
              <button type="button" title="Bold" onMouseDown={e => { e.preventDefault(); rankExec('bold'); }}
                className="px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 select-none">
                <strong>B</strong>
              </button>
              <button type="button" title="Italic" onMouseDown={e => { e.preventDefault(); rankExec('italic'); }}
                className="px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 select-none">
                <em>I</em>
              </button>
              <button type="button" title="Toggle center alignment"
                onMouseDown={e => {
                  e.preventDefault();
                  const sel = window.getSelection();
                  const block = sel?.anchorNode?.parentElement?.closest('p, div, h1, h2, h3');
                  const isCentered = block
                    ? getComputedStyle(block).textAlign === 'center' || (block as HTMLElement).style.textAlign === 'center'
                    : false;
                  rankExec(isCentered ? 'justifyLeft' : 'justifyCenter');
                }}
                className="px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 select-none">
                ⊕ Center
              </button>
              <span className="w-px h-5 bg-gray-300 mx-0.5" />
              <span className="text-xs text-gray-400">Color:</span>
              {RANK_COLORS.map(c => (
                <button key={c.value} type="button" title={c.label}
                  onMouseDown={e => { e.preventDefault(); rankExec('foreColor', c.value); }}
                  className="w-5 h-5 rounded-full border-2 border-white ring-1 ring-gray-300 hover:ring-gray-500 flex-shrink-0 select-none"
                  style={{ backgroundColor: c.value }} />
              ))}
              <button type="button" title="Remove formatting"
                onMouseDown={e => { e.preventDefault(); rankExec('removeFormat'); }}
                className="w-5 h-5 rounded-full border border-gray-300 bg-white hover:border-gray-500 text-gray-400 text-[9px] flex items-center justify-center select-none">
                ✕
              </button>
            </div>
            {/* WYSIWYG editor */}
            <div
              ref={rankEditorRef}
              contentEditable
              suppressContentEditableWarning
              className="prose max-w-none text-gray-800 border border-gray-200 rounded-b-lg px-4 py-3 min-h-[8rem] focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
              style={{ lineHeight: '1.75' }}
              onInput={() => setRankEditorEmpty(!(rankEditorRef.current?.innerHTML ?? '').replace(/<[^>]*>/g, '').trim())}
              onKeyDown={e => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); rankExec('bold'); }
                if ((e.metaKey || e.ctrlKey) && e.key === 'i') { e.preventDefault(); rankExec('italic'); }
              }}
            />
            <p className="text-xs text-gray-400 mt-1">Paste rich text · Cmd+B bold · Cmd+I italic · select text then click a color</p>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Admin PIN
            </label>
            <input
              type="password"
              value={rankPass}
              onChange={e => setRankPass(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>
          <div className="mb-4 flex items-center gap-2">
            <input
              type="checkbox"
              id="rankEmailLeague"
              checked={rankEmailLeague}
              onChange={e => setRankEmailLeague(e.target.checked)}
              className="accent-purple-700"
            />
            <label htmlFor="rankEmailLeague" className="text-sm text-gray-600 select-none cursor-pointer">
              Email the league
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting || !rankTitle.trim() || rankEditorEmpty || !rankPass}
              className="px-5 py-2 bg-purple-700 text-white text-sm font-semibold rounded-lg hover:bg-purple-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Posting…' : 'Post Rankings'}
            </button>
            {submitted && (
              <span className="text-sm text-purple-600 font-medium">Posted!</span>
            )}
          </div>
        </form>
      )}

      {/* ── Commissioner announcement form (admin only) ──────────────────── */}
      {mode === 'commissioner' && isAdmin && (
        <form onSubmit={handleSubmitAnnouncement} className="p-5">
          <div className="mb-1 flex items-center gap-2">
            <span className="inline-block bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
              📣 League Bulletin
            </span>
            <span className="text-xs text-gray-400">Posts as "The Commissioner" · pinned to top · runs in banner for 5 days</span>
          </div>
          <div className="mb-4 mt-3">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Subject / Headline
            </label>
            <input
              value={annSubject}
              onChange={e => setAnnSubject(e.target.value)}
              required
              maxLength={120}
              placeholder="e.g. The Whistlepigs Are Going to Ohio"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Message
            </label>
            <textarea
              value={annMessage}
              onChange={e => setAnnMessage(e.target.value)}
              required
              rows={8}
              placeholder="Full announcement text…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
            />
            <p className="text-xs text-gray-300 text-right mt-1">{annMessage.length} chars</p>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Admin PIN
            </label>
            <input
              type="password"
              value={annPass}
              onChange={e => setAnnPass(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting || !annSubject.trim() || !annMessage.trim() || !annPass}
              className="px-5 py-2 bg-yellow-500 text-white text-sm font-semibold rounded-lg hover:bg-yellow-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? 'Posting…' : 'Post Bulletin'}
            </button>
            {submitted && (
              <span className="text-sm text-yellow-600 font-medium">Bulletin posted!</span>
            )}
          </div>
        </form>
      )}

      {/* polls are shown above the post box; poll admin is available via the Polls tab */}
    </div>
  );
}
