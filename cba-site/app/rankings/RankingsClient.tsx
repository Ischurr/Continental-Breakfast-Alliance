'use client';

import { useState, useRef } from 'react';
import { useAdminMode } from '@/hooks/useAdminMode';
import { editArticle, deleteArticle } from './actions';

// ── Inline content renderer ───────────────────────────────────────────────────
// Supported syntax:
//   **bold text**
//   [color=#hex]colored text[/color]
//   [center]centered paragraph[/center]   (wraps whole paragraph)
//   ----   (own paragraph → <hr>)

function renderInline(text: string): React.ReactNode[] {
  // Split on **bold** and [color=X]...[/color] tokens
  const tokens = text.split(/(\*\*[^*]+\*\*|\[color=[^\]]+\][^\[]*\[\/color\])/);
  return tokens.map((tok, j) => {
    if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 4) {
      return <strong key={j}>{tok.slice(2, -2)}</strong>;
    }
    const cm = tok.match(/^\[color=([^\]]+)\](.*)\[\/color\]$/);
    if (cm) {
      return <span key={j} style={{ color: cm[1] }}>{cm[2]}</span>;
    }
    return tok || null;
  });
}

function renderParagraph(para: string, i: number) {
  const trimmed = para.trim();
  if (!trimmed) return null;

  if (/^-{3,}$/.test(trimmed)) {
    return <hr key={i} className="my-4 border-t border-gray-300" />;
  }

  const centerMatch = trimmed.match(/^\[center\]([\s\S]*)\[\/center\]$/);
  const isCenter = !!centerMatch;
  const text = isCenter ? centerMatch![1].trim() : trimmed;

  return (
    <p key={i} className={`mb-3 last:mb-0 ${isCenter ? 'text-center' : ''}`}>
      {renderInline(text)}
    </p>
  );
}

export function renderContent(content: string) {
  return content.split(/\n\n+/).map((para, i) => renderParagraph(para, i));
}

// ── Color palette ─────────────────────────────────────────────────────────────

const COLORS: { label: string; value: string }[] = [
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

// ── Toolbar helpers ───────────────────────────────────────────────────────────

function wrapSelection(
  textarea: HTMLTextAreaElement,
  setter: (v: string) => void,
  prefix: string,
  suffix: string,
) {
  const { selectionStart: start, selectionEnd: end, value } = textarea;
  const selected = value.slice(start, end) || 'text';
  // Toggle off if already wrapped
  if (selected.startsWith(prefix) && selected.endsWith(suffix) && selected.length > prefix.length + suffix.length) {
    const inner = selected.slice(prefix.length, -suffix.length);
    const newValue = value.slice(0, start) + inner + value.slice(end);
    setter(newValue);
    setTimeout(() => {
      textarea.selectionStart = start;
      textarea.selectionEnd = start + inner.length;
      textarea.focus();
    }, 0);
  } else {
    const insert = prefix + selected + suffix;
    const newValue = value.slice(0, start) + insert + value.slice(end);
    setter(newValue);
    setTimeout(() => {
      textarea.selectionStart = start + prefix.length;
      textarea.selectionEnd = start + prefix.length + selected.length;
      textarea.focus();
    }, 0);
  }
}

function insertAtCursor(
  textarea: HTMLTextAreaElement,
  setter: (v: string) => void,
  text: string,
) {
  const { selectionStart: start, value } = textarea;
  const before = value.slice(0, start);
  const after = value.slice(start);
  const needLeading  = before.length > 0 && !before.endsWith('\n\n');
  const needTrailing = after.length > 0  && !after.startsWith('\n\n');
  const insert = (needLeading ? '\n\n' : '') + text + (needTrailing ? '\n\n' : '');
  const newValue = before + insert + after;
  setter(newValue);
  const pos = before.length + insert.length;
  setTimeout(() => {
    textarea.value = newValue;
    textarea.selectionStart = pos;
    textarea.selectionEnd = pos;
    textarea.focus();
  }, 0);
}

// ── Format button ─────────────────────────────────────────────────────────────

function FmtBtn({ label, title, onClick }: { label: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 transition-colors"
    >
      {label}
    </button>
  );
}

// ── Edit form with live preview ───────────────────────────────────────────────

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

  function fmt(prefix: string, suffix: string) {
    if (textareaRef.current) wrapSelection(textareaRef.current, setContent, prefix, suffix);
  }

  function insertHR() {
    if (textareaRef.current) insertAtCursor(textareaRef.current, setContent, '----');
  }

  return (
    <div className="mt-4 space-y-3">
      {/* Title row — editor + preview label */}
      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Title</label>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>
        <div className="hidden lg:block flex-1">
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Preview</label>
          <div className="h-9" /> {/* spacer to align with input */}
        </div>
      </div>

      {/* Toolbar */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Formatting</label>
        <div className="flex gap-1.5 flex-wrap items-center">
          <FmtBtn label={<strong>B</strong>} title="Bold (**text**)" onClick={() => fmt('**', '**')} />
          <FmtBtn label="⊕ Center" title="Center ([center]text[/center])" onClick={() => fmt('[center]', '[/center]')} />
          <FmtBtn label="─ Divider" title="Insert horizontal rule (----)" onClick={insertHR} />

          {/* Separator */}
          <span className="w-px h-5 bg-gray-200 mx-0.5" />

          {/* Color swatches */}
          <span className="text-xs text-gray-400 mr-0.5">Color:</span>
          {COLORS.map(c => (
            <button
              key={c.value}
              type="button"
              title={`${c.label} (${c.value})`}
              onClick={() => fmt(`[color=${c.value}]`, '[/color]')}
              className="w-5 h-5 rounded-full border-2 border-white ring-1 ring-gray-300 hover:ring-gray-500 transition-all flex-shrink-0"
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Select text, then click a button. Blank lines separate paragraphs.
        </p>
      </div>

      {/* Editor + live preview side by side */}
      <div className="flex gap-4 items-start">
        {/* Textarea */}
        <div className="flex-1 min-w-0">
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Content</label>
          <textarea
            ref={textareaRef}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300 resize-y"
            rows={16}
            value={content}
            onChange={e => setContent(e.target.value)}
          />
        </div>

        {/* Live preview */}
        <div className="flex-1 min-w-0 hidden lg:block">
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">
            Live Preview
          </label>
          <div className="border border-blue-200 rounded-lg p-4 bg-white min-h-[22rem] shadow-sm">
            <h2 className="text-2xl font-bold mb-1 text-gray-900">
              {title || <span className="text-gray-300 italic">Title…</span>}
            </h2>
            <p className="text-xs text-gray-400 mb-4">Preview — not yet saved</p>
            <div className="prose max-w-none text-gray-800">
              {content.trim()
                ? renderContent(content)
                : <p className="text-gray-300 italic">Start typing to see a preview…</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile preview toggle (shown below textarea on small screens) */}
      <MobilePreview title={title} content={content} />

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

function MobilePreview({ title, content }: { title: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-xs text-blue-600 hover:underline"
      >
        {open ? '▲ Hide preview' : '▼ Show preview'}
      </button>
      {open && (
        <div className="mt-2 border border-blue-200 rounded-lg p-4 bg-white shadow-sm">
          <h2 className="text-2xl font-bold mb-1 text-gray-900">
            {title || <span className="text-gray-300 italic">Title…</span>}
          </h2>
          <p className="text-xs text-gray-400 mb-4">Preview — not yet saved</p>
          <div className="prose max-w-none text-gray-800">
            {content.trim()
              ? renderContent(content)
              : <p className="text-gray-300 italic">Start typing…</p>}
          </div>
        </div>
      )}
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

  function refresh() { window.location.reload(); }

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
        <article key={article.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          {editingId === article.id ? (
            <ArticleEditForm
              article={article}
              onSaved={refresh}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <>
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
