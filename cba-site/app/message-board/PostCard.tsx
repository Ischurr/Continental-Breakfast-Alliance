'use client';

import { useState } from 'react';
import { editPost, deletePost } from './actions';
import { TrashTalkPost } from '@/lib/types';

function VideoEmbed({ url }: { url: string }) {
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  if (ytMatch) {
    return (
      <div className="mt-3 rounded-xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
        <iframe
          src={`https://www.youtube.com/embed/${ytMatch[1]}`}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <video
      src={url}
      controls
      className="mt-3 w-full rounded-xl"
      style={{ maxHeight: 360 }}
    />
  );
}

function capitalizePickText(text: string): string {
  return text.replace(/\bround\b/gi, 'Round').replace(/\bpick\b/gi, 'Pick');
}

function isPickLine(text: string): boolean {
  const lower = text.toLowerCase();
  return (lower.includes('round') || lower.includes(' rd') || lower.includes('pick'))
    && /\b\d+(st|nd|rd|th)\b/.test(lower);
}

function TradeItems({ text, tradeYear }: { text: string; tradeYear?: number }) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  return (
    <ul className="space-y-1">
      {lines.map((line, i) => {
        let displayLine = tradeYear && isPickLine(line) && !/\b20\d{2}\b/.test(line)
          ? `${tradeYear} ${line}`
          : line;
        if (isPickLine(displayLine)) displayLine = capitalizePickText(displayLine);
        return (
          <li key={i} className="text-sm text-gray-700 flex items-start gap-1.5">
            <span className="text-gray-300 mt-0.5 flex-shrink-0">•</span>
            <span>{displayLine}</span>
          </li>
        );
      })}
    </ul>
  );
}

interface Props {
  post: TrashTalkPost;
  authorDisplayName: string;
  authorColor: string;
  targetDisplayName?: string;
  targetColor?: string;
  timeAgoStr: string;
}

export default function PostCard({
  post,
  authorDisplayName,
  authorColor,
  targetDisplayName,
  targetColor,
  timeAgoStr,
}: Props) {
  const isTrade = post.postType === 'trade';
  const isAnnouncement = post.postType === 'announcement';
  const postDate = new Date(post.createdAt);
  // Pre-draft (Jan–Mar): picks are for the current year's draft; post-draft (Apr+): next year's
  const pickDraftYear = postDate.getMonth() < 3 ? postDate.getFullYear() : postDate.getFullYear() + 1;

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editMessage, setEditMessage] = useState(post.message);
  const [editTradeGiving, setEditTradeGiving] = useState(post.tradeGiving ?? '');
  const [editTradeReceiving, setEditTradeReceiving] = useState(post.tradeReceiving ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  async function handleSave() {
    setSaving(true);
    await editPost(
      post.id,
      editMessage,
      isTrade ? editTradeGiving : undefined,
      isTrade ? editTradeReceiving : undefined
    );
    setSaving(false);
    setEditing(false);
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError('');
    try {
      await deletePost(post.id);
    } catch (e: any) {
      setDeleting(false);
      setDeleteError(e?.message ?? 'Delete failed');
    }
  }

  const canSave = isTrade
    ? editTradeGiving.trim().length > 0 && editTradeReceiving.trim().length > 0
    : editMessage.trim().length > 0;

  // ── Commissioner announcement card ────────────────────────────────────────
  if (isAnnouncement) {
    return (
      <div id={post.id} className="bg-blue-950 rounded-xl border border-blue-800 shadow-md overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between gap-3 border-b border-blue-800/60">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-yellow-400 text-blue-950 text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide uppercase">
              📣 League Bulletin
            </span>
            {post.subject && (
              <span className="text-white font-bold text-sm">{post.subject}</span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-blue-400">{timeAgoStr}</span>
            {!editing && !confirmDelete && (
              <>
                <button onClick={() => setEditing(true)} className="text-xs text-blue-400 hover:text-blue-200 transition">Edit</button>
                <button onClick={() => setConfirmDelete(true)} className="text-xs text-blue-400 hover:text-red-400 transition">Delete</button>
              </>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-blue-300 uppercase tracking-wide mb-1">Subject</label>
                <input
                  value={editMessage.startsWith('SUBJECT:') ? '' : editMessage}
                  onChange={() => {}}
                  disabled
                  className="w-full border border-blue-700 bg-blue-900 text-blue-300 rounded-lg px-3 py-2 text-sm opacity-50 cursor-not-allowed"
                  placeholder="Edit subject via delete + repost"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-blue-300 uppercase tracking-wide mb-1">Message</label>
                <textarea
                  value={editMessage}
                  onChange={e => setEditMessage(e.target.value)}
                  rows={8}
                  className="w-full border border-blue-700 bg-blue-900 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !canSave}
                  className="px-4 py-1.5 bg-yellow-500 text-white text-xs font-semibold rounded-lg hover:bg-yellow-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => { setEditing(false); setEditMessage(post.message); }}
                  className="px-4 py-1.5 text-xs text-blue-300 hover:text-blue-100 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : confirmDelete ? (
            <div className="flex items-center gap-3 py-1 flex-wrap">
              <span className="text-sm text-blue-300">Delete this bulletin?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1 bg-red-500 text-white text-xs font-semibold rounded-lg hover:bg-red-600 transition disabled:opacity-40"
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-xs text-blue-300 hover:text-blue-100 transition">
                Cancel
              </button>
              {deleteError && <span className="text-xs text-red-400 w-full">{deleteError}</span>}
            </div>
          ) : (
            <p className="text-sm text-blue-100 leading-relaxed whitespace-pre-wrap">{post.message}</p>
          )}
        </div>

        <div className="px-5 py-2 border-t border-blue-800/40">
          <span className="text-xs text-blue-500">— The Commissioner</span>
        </div>
      </div>
    );
  }

  // ── Trade card ────────────────────────────────────────────────────────────
  if (isTrade) {
    return (
      <div id={post.id} className="bg-white rounded-xl border-2 border-blue-200 shadow-sm overflow-hidden">
        {/* Trade header bar */}
        <div className="bg-blue-50 px-5 py-3 flex items-center justify-between gap-3 border-b border-blue-100">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full tracking-wide uppercase">
              🔄 Trade
            </span>
            <span className="text-sm font-semibold text-gray-700">{post.authorName}</span>
            <span className="text-xs text-gray-400">({authorDisplayName})</span>
            <span className="text-gray-300">↔</span>
            <span className="text-sm font-semibold text-gray-700">{targetDisplayName ?? '—'}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-gray-300">{timeAgoStr}</span>
            {!editing && !confirmDelete && (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs text-gray-400 hover:text-gray-600 transition"
                >
                  Edit
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs text-gray-400 hover:text-red-500 transition"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>

        <div className="p-5">
          {editing ? (
            /* Edit mode */
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                    {post.authorName} sends
                  </label>
                  <textarea
                    value={editTradeGiving}
                    onChange={e => setEditTradeGiving(e.target.value)}
                    rows={4}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                    {targetDisplayName ?? 'They'} sends
                  </label>
                  <textarea
                    value={editTradeReceiving}
                    onChange={e => setEditTradeReceiving(e.target.value)}
                    rows={4}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                  Comment
                </label>
                <textarea
                  value={editMessage}
                  onChange={e => setEditMessage(e.target.value)}
                  maxLength={300}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !canSave}
                  className="px-4 py-1.5 bg-blue-700 text-white text-xs font-semibold rounded-lg hover:bg-blue-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setEditTradeGiving(post.tradeGiving ?? '');
                    setEditTradeReceiving(post.tradeReceiving ?? '');
                    setEditMessage(post.message);
                  }}
                  className="px-4 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : confirmDelete ? (
            <div className="flex items-center gap-3 py-1 flex-wrap">
              <span className="text-sm text-gray-500">Delete this trade?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-3 py-1 bg-red-500 text-white text-xs font-semibold rounded-lg hover:bg-red-600 transition disabled:opacity-40"
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-gray-500 hover:text-gray-700 transition"
              >
                Cancel
              </button>
              {deleteError && <span className="text-xs text-red-500 w-full">{deleteError}</span>}
            </div>
          ) : (
            /* Display mode */
            <>
              <div className="grid grid-cols-2 gap-3">
                {/* Author sends */}
                <div
                  className="rounded-lg p-3 border"
                  style={{ borderColor: authorColor, background: `${authorColor}18` }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-2">
                    {post.authorName} sends
                  </p>
                  <TradeItems text={post.tradeGiving ?? ''} tradeYear={pickDraftYear} />
                </div>
                {/* Partner sends */}
                <div
                  className="rounded-lg p-3 border"
                  style={{
                    borderColor: targetColor ?? '#93c5fd',
                    background: targetColor ? `${targetColor}18` : '#eff6ff',
                  }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-2">
                    {targetDisplayName ?? '—'} sends
                  </p>
                  <TradeItems text={post.tradeReceiving ?? ''} tradeYear={pickDraftYear} />
                </div>
              </div>
              {post.message && (
                <p className="text-sm text-gray-500 italic mt-3 pt-3 border-t border-gray-100">
                  &ldquo;{post.message}&rdquo;
                </p>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Regular message card ──────────────────────────────────────────────────
  return (
    <div
      id={post.id}
      className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm"
      style={{ borderLeftColor: authorColor, borderLeftWidth: 4 }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <span className="font-semibold text-sm text-gray-800">{post.authorName}</span>
          <span className="text-xs text-gray-400 ml-2">{authorDisplayName}</span>
          {targetDisplayName && (
            <span className="ml-2 text-xs bg-red-50 text-red-500 font-medium px-2 py-0.5 rounded-full border border-red-100">
              → {targetDisplayName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-gray-300">{timeAgoStr}</span>
          {!editing && !confirmDelete && (
            <>
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-gray-400 hover:text-gray-600 transition"
              >
                Edit
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-gray-400 hover:text-red-500 transition"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div>
          <textarea
            value={editMessage}
            onChange={e => setEditMessage(e.target.value)}
            maxLength={500}
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
          />
          <p className="text-xs text-gray-300 text-right mt-1">{editMessage.length}/500</p>
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleSave}
              disabled={saving || !canSave}
              className="px-4 py-1.5 bg-teal-700 text-white text-xs font-semibold rounded-lg hover:bg-teal-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { setEditing(false); setEditMessage(post.message); }}
              className="px-4 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition"
            >
              Cancel
            </button>
          </div>
          {post.videoUrl && <VideoEmbed url={post.videoUrl} />}
        </div>
      ) : confirmDelete ? (
        <div>
          {post.message && (
            <p className="text-sm text-gray-700 leading-relaxed mb-3">{post.message}</p>
          )}
          {post.videoUrl && <VideoEmbed url={post.videoUrl} />}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <span className="text-sm text-gray-500">Delete this post?</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-1 bg-red-500 text-white text-xs font-semibold rounded-lg hover:bg-red-600 transition disabled:opacity-40"
            >
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-gray-500 hover:text-gray-700 transition"
            >
              Cancel
            </button>
            {deleteError && <span className="text-xs text-red-500 w-full">{deleteError}</span>}
          </div>
        </div>
      ) : (
        <>
          {post.message && (
            <p className="text-sm text-gray-700 leading-relaxed">{post.message}</p>
          )}
          {post.videoUrl && <VideoEmbed url={post.videoUrl} />}
        </>
      )}
    </div>
  );
}
