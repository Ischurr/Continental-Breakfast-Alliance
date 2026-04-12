'use client';

import { useState, useRef, useEffect } from 'react';
import { useAdminMode } from '@/hooks/useAdminMode';
import { editArticle, deleteArticle } from './actions';

// ── Content renderer (read mode) ─────────────────────────────────────────────
// New posts are stored as HTML. Old posts use the markup parser as fallback.

function looksLikeHtml(s: string) {
  return /<[a-z][\s\S]*>/i.test(s);
}

function renderInline(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\[color=[^\]]+\][^\[]*\[\/color\])/);
  return tokens.map((tok, j) => {
    if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 4)
      return <strong key={j}>{tok.slice(2, -2)}</strong>;
    const cm = tok.match(/^\[color=([^\]]+)\](.*)\[\/color\]$/);
    if (cm) return <span key={j} style={{ color: cm[1] }}>{cm[2]}</span>;
    return tok || null;
  });
}

function renderParagraph(para: string, i: number) {
  const t = para.trim();
  if (!t) return null;
  if (/^-{3,}$/.test(t)) return <hr key={i} className="my-4 border-t border-gray-300" />;
  const cm = t.match(/^\[center\]([\s\S]*)\[\/center\]$/);
  const isCenter = !!cm;
  const text = isCenter ? cm![1].trim() : t;
  return (
    <p key={i} className={`mb-3 last:mb-0 ${isCenter ? 'text-center' : ''}`}>
      {renderInline(text)}
    </p>
  );
}

export function renderContent(content: string) {
  if (looksLikeHtml(content)) {
    // HTML stored by the WYSIWYG editor — render directly
    return <div dangerouslySetInnerHTML={{ __html: content }} />;
  }
  // Legacy markup format
  return content.split(/\n\n+/).map((para, i) => renderParagraph(para, i));
}

// ── Markup → HTML (convert legacy content for editing) ──────────────────────

function markupToHtml(content: string): string {
  if (looksLikeHtml(content)) return content; // already HTML
  return content
    .split(/\n\n+/)
    .map(para => {
      const t = para.trim();
      if (!t) return '';
      if (/^-{3,}$/.test(t)) return '<hr>';
      const cm = t.match(/^\[center\]([\s\S]*)\[\/center\]$/);
      const isCenter = !!cm;
      const text = isCenter ? cm![1].trim() : t;
      const html = text
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[color=([^\]]+)\]([^\[]*)\[\/color\]/g, '<span style="color:$1">$2</span>');
      return isCenter ? `<p style="text-align:center">${html}</p>` : `<p>${html}</p>`;
    })
    .filter(Boolean)
    .join('');
}

// ── Color palette ─────────────────────────────────────────────────────────────

const COLORS = [
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

// ── Toolbar button ─────────────────────────────────────────────────────────────
// Uses onMouseDown + preventDefault so the editor never loses its selection.

function FmtBtn({
  label,
  title,
  onMouseDown,
}: {
  label: React.ReactNode;
  title: string;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={onMouseDown}
      className="px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 transition-colors select-none"
    >
      {label}
    </button>
  );
}

// ── WYSIWYG edit form ─────────────────────────────────────────────────────────

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
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);

  // Set initial HTML content once on mount
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = markupToHtml(article.content);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave() {
    if (!pin) { setError('Enter admin PIN to save.'); return; }
    setSaving(true);
    setError('');
    try {
      const html = editorRef.current?.innerHTML ?? '';
      await editArticle(article.id, title, html, pin);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  // execCommand with focus restore (prevents selection loss on toolbar click)
  function exec(cmd: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
  }

  function insertHR(e: React.MouseEvent) {
    e.preventDefault();
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const hr = document.createElement('hr');
    // Wrap in a div so cursor lands after it cleanly
    const after = document.createElement('p');
    after.innerHTML = '<br>';
    range.insertNode(after);
    range.insertNode(hr);
    const newRange = document.createRange();
    newRange.setStart(after, 0);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  return (
    <div className="space-y-3">
      {/* Title */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Title</label>
        <input
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
      </div>

      {/* Toolbar */}
      <div className="sticky top-16 z-30 flex gap-1.5 flex-wrap items-center p-2 bg-gray-50 border border-gray-200 rounded-t-lg border-b-0">
        <FmtBtn
          label={<strong>B</strong>}
          title="Bold"
          onMouseDown={e => { e.preventDefault(); exec('bold'); }}
        />
        <FmtBtn
          label="⊕ Center"
          title="Toggle center alignment"
          onMouseDown={e => {
            e.preventDefault();
            // Toggle between center and left
            const sel = window.getSelection();
            const block = sel?.anchorNode?.parentElement?.closest('p, div, h1, h2, h3');
            const isCentered = block
              ? getComputedStyle(block).textAlign === 'center' || (block as HTMLElement).style.textAlign === 'center'
              : false;
            exec(isCentered ? 'justifyLeft' : 'justifyCenter');
          }}
        />
        <FmtBtn
          label="─ Divider"
          title="Insert horizontal rule"
          onMouseDown={insertHR}
        />

        <span className="w-px h-5 bg-gray-300 mx-0.5" />

        {/* Color swatches */}
        <span className="text-xs text-gray-400">Color:</span>
        {COLORS.map(c => (
          <button
            key={c.value}
            type="button"
            title={c.label}
            onMouseDown={e => { e.preventDefault(); exec('foreColor', c.value); }}
            className="w-5 h-5 rounded-full border-2 border-white ring-1 ring-gray-300 hover:ring-gray-500 transition-all flex-shrink-0 select-none"
            style={{ backgroundColor: c.value }}
          />
        ))}
        {/* Remove color */}
        <button
          type="button"
          title="Remove color"
          onMouseDown={e => { e.preventDefault(); exec('removeFormat'); }}
          className="w-5 h-5 rounded-full border border-gray-300 bg-white hover:border-gray-500 text-gray-400 text-[9px] flex items-center justify-center transition-all select-none"
        >
          ✕
        </button>
      </div>

      {/* WYSIWYG editor — looks exactly like the published article */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        className="prose max-w-none text-gray-800 border border-gray-200 rounded-b-lg px-6 py-5 min-h-[16rem] focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
        style={{ lineHeight: '1.75' }}
        onKeyDown={e => {
          // Cmd/Ctrl+B → bold
          if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
            e.preventDefault();
            exec('bold');
          }
        }}
      />
      <p className="text-xs text-gray-400 -mt-2">
        Click to position cursor · Select text + click a toolbar button to format · Cmd+B for bold
      </p>

      {/* PIN + actions */}
      <div className="sticky bottom-0 z-30 flex flex-wrap items-center gap-3 pt-2 pb-2 bg-white border-t border-gray-100">
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
