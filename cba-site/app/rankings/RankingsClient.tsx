'use client';

import { useState, useRef } from 'react';
import { useAdminMode } from '@/hooks/useAdminMode';
import { editArticle, deleteArticle } from './actions';

// ── Content renderer ─────────────────────────────────────────────────────────
// Supports **bold**, [center]...[/center], and ---- (horizontal rule).

function renderParagraph(para: string, i: number) {
  const trimmed = para.trim();
  if (!trimmed) return null;

  // Horizontal rule: paragraph that is only dashes (3+)
  if (/^-{3,}$/.test(trimmed)) {
    return <hr key={i} className="my-4 border-t border-gray-300" />;
  }

  const centerMatch = trimmed.match(/^\[center\]([\s\S]*)\[\/center\]$/);
  const isCenter = !!centerMatch;
  const text = isCenter ? centerMatch![1].trim() : trimmed;

  // Split on **bold** markers
  const segments = text.split(/(\*\*[^*]+\*\*)/);
  const children = segments.map((seg, j) => {
    if (seg.startsWith('**') && seg.endsWith('**')) {
      return <strong key={j}>{seg.slice(2, -2)}</strong>;
    }
    return seg || null;
  });

  return (
    <p key={i} className={`mb-3 last:mb-0 ${isCenter ? 'text-center' : ''}`}>
      {children}
    </p>
  );
}

function renderContent(content: string) {
  return content.split(/\n\n+/).map((para, i) => renderParagraph(para, i));
}

// ── Formatting toolbar helpers ────────────────────────────────────────────────

function applyFormat(
  textarea: HTMLTextAreaElement,
  setter: (v: string) => void,
  type: 'bold' | 'center',
) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const selected = value.slice(start, end);

  let insert: string;
  let cursorOffset: number;

  if (type === 'bold') {
    // If already bolded, remove; otherwise add
    if (selected.startsWith('**') && selected.endsWith('**') && selected.length > 4) {
      insert = selected.slice(2, -2);
      cursorOffset = -2;
    } else {
      insert = `**${selected || 'text'}**`;
      cursorOffset = 2;
    }
  } else {
    // center — wrap the selection (or current line)
    const prefix = '[center]';
    const suffix = '[/center]';
    if (selected.startsWith(prefix) && selected.endsWith(suffix)) {
      insert = selected.slice(prefix.length, -suffix.length);
      cursorOffset = -prefix.length;
    } else {
      insert = `${prefix}${selected || 'text'}${suffix}`;
      cursorOffset = prefix.length;
    }
  }

  const newValue = value.slice(0, start) + insert + value.slice(end);
  setter(newValue);

  const newPos = start + cursorOffset + (selected || 'text').length;
  setTimeout(() => {
    textarea.value = newValue;
    textarea.selectionStart = start + cursorOffset;
    textarea.selectionEnd = newPos;
    textarea.focus();
  }, 0);
}

// ── Format button ─────────────────────────────────────────────────────────────

function FmtBtn({
  label,
  title,
  className,
  onClick,
}: {
  label: React.ReactNode;
  title: string;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 transition-colors ${className ?? ''}`}
    >
      {label}
    </button>
  );
}

// ── Edit form ─────────────────────────────────────────────────────────────────

function ArticleEditForm({
  article,
  onSaved,
  onCancel,
}: {
  article: { id: string; title: string; content: string };
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(article.title);
  const [content, setContent] = useState(article.content);
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleSave() {
    if (!pin) { setError('Enter admin PIN to save.'); return; }
    setSaving(true);
    setError('');
    try {
      await editArticle(article.id, title, content, pin);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  function fmt(type: 'bold' | 'center') {
    if (textareaRef.current) applyFormat(textareaRef.current, setContent, type);
  }

  function insertHR() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { selectionStart: start, value } = textarea;
    // Insert ---- on its own line, surrounded by blank lines
    const before = value.slice(0, start);
    const after = value.slice(start);
    const needsLeadingBlank = before.length > 0 && !before.endsWith('\n\n');
    const needsTrailingBlank = after.length > 0 && !after.startsWith('\n\n');
    const insert =
      (needsLeadingBlank ? '\n\n' : '') +
      '----' +
      (needsTrailingBlank ? '\n\n' : '');
    const newValue = before + insert + after;
    setContent(newValue);
    const newPos = before.length + insert.length;
    setTimeout(() => {
      textarea.value = newValue;
      textarea.selectionStart = newPos;
      textarea.selectionEnd = newPos;
      textarea.focus();
    }, 0);
  }

  return (
    <div className="mt-4 space-y-3">
      {/* Title */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Title</label>
        <input
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
      </div>

      {/* Toolbar + Textarea */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Content</label>
        {/* Formatting toolbar */}
        <div className="flex gap-1.5 mb-1.5 flex-wrap">
          <FmtBtn label={<strong>B</strong>} title="Bold — wrap selection in **bold**" onClick={() => fmt('bold')} />
          <FmtBtn label="⊕ Center" title="Center — wrap selection in [center]...[/center]" onClick={() => fmt('center')} />
          <FmtBtn label="─ Divider" title="Insert a horizontal rule (----)" onClick={insertHR} />
          <span className="ml-2 text-xs text-gray-400 self-center">
            Select text, then click a button. Use blank lines to separate paragraphs.
          </span>
        </div>
        <textarea
          ref={textareaRef}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y"
          rows={12}
          value={content}
          onChange={e => setContent(e.target.value)}
        />
        {/* Syntax hint */}
        <p className="text-xs text-gray-400 mt-1">
          <strong>**bold text**</strong> · <span className="font-mono">[center]centered line[/center]</span> · <span className="font-mono">----</span> (divider)
        </p>
      </div>

      {/* PIN + actions */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="password"
          placeholder="Admin PIN"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={pin}
          onChange={e => setPin(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg font-medium transition-colors"
        >
          Cancel
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}

// ── Main client component ─────────────────────────────────────────────────────

interface Article {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

export default function RankingsClient({ articles }: { articles: Article[] }) {
  const { isAdmin, unlock } = useAdminMode();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletePin, setDeletePin] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // After save/delete we need to reload — server component can't update live,
  // so we force a full page reload.
  function refresh() {
    window.location.reload();
  }

  async function handleDelete(id: string) {
    if (!deletePin) { setDeleteError('Enter admin PIN.'); return; }
    try {
      await deleteArticle(id, deletePin);
      refresh();
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed.');
    }
  }

  return (
    <div className="space-y-8">
      {/* Admin toggle */}
      {!isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={unlock}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 hover:border-gray-400 rounded px-2 py-1 transition-colors"
            title="Admin login"
          >
            🔒
          </button>
        </div>
      )}

      {articles.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 text-center">
          <p className="text-gray-600 font-medium">No new rankings for the season yet.</p>
          <p className="text-gray-400 text-sm mt-1">First ranking expected after the keepers deadline.</p>
        </div>
      )}

      {articles.map(article => (
        <article key={`${article.id}-${refreshKey}`} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          {editingId === article.id ? (
            <>
              <h2 className="text-2xl font-bold mb-1">{article.title}</h2>
              <ArticleEditForm
                article={article}
                onSaved={refresh}
                onCancel={() => setEditingId(null)}
              />
            </>
          ) : (
            <>
              {/* Header row */}
              <div className="flex items-start justify-between gap-4 mb-2">
                <h2 className="text-2xl font-bold">{article.title}</h2>
                {isAdmin && (
                  <div className="flex gap-2 flex-shrink-0 mt-1">
                    <button
                      onClick={() => { setEditingId(article.id); setDeletingId(null); }}
                      className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 hover:border-gray-400 rounded px-1.5 py-0.5 transition-colors"
                      title="Edit article"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => { setDeletingId(article.id); setDeletePin(''); setDeleteError(''); }}
                      className="text-xs text-gray-400 hover:text-red-600 border border-gray-200 hover:border-red-300 rounded px-1.5 py-0.5 transition-colors"
                      title="Delete article"
                    >
                      🗑️
                    </button>
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-400 mb-4">
                Published {new Date(article.createdAt).toLocaleString()}
              </p>

              {/* Delete confirm */}
              {deletingId === article.id && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex flex-wrap items-center gap-2">
                  <span className="text-sm text-red-700 font-medium">Delete this article?</span>
                  <input
                    type="password"
                    placeholder="Admin PIN"
                    className="border border-red-300 rounded px-2 py-1 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-red-300"
                    value={deletePin}
                    onChange={e => setDeletePin(e.target.value)}
                  />
                  <button
                    onClick={() => handleDelete(article.id)}
                    className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded font-medium transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setDeletingId(null)}
                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded transition-colors"
                  >
                    Cancel
                  </button>
                  {deleteError && <span className="text-sm text-red-600">{deleteError}</span>}
                </div>
              )}

              <div className="prose max-w-none text-gray-800">
                {renderContent(article.content)}
              </div>
            </>
          )}
        </article>
      ))}
    </div>
  );
}
