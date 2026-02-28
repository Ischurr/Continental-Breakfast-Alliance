'use client';

import { useEffect, useState } from 'react';
import { updateTeamContent } from './actions';

interface BaseProps {
  teamId: number;
}

// ── Admin unlock (shared hook) ────────────────────────────────────────────────

import { useAdminMode } from '@/hooks/useAdminMode';


// ── Shared edit area ──────────────────────────────────────────────────────────

function EditArea({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  draft: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  return (
    <div>
      <textarea
        className="w-full text-sm text-gray-700 border border-gray-300 rounded-lg p-3 leading-relaxed resize-y min-h-[120px] focus:outline-none focus:ring-2 focus:ring-blue-300"
        value={draft}
        onChange={e => onChange(e.target.value)}
        autoFocus
      />
      <div className="flex gap-2 mt-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-3 py-1 text-sm bg-teal-600 text-white rounded-md hover:bg-teal-700 disabled:opacity-50 transition"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-3 py-1 text-sm bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200 disabled:opacity-50 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Bio editor (lives inside the gradient header) ─────────────────────────────

interface BioEditorProps extends BaseProps {
  bio?: string;
}

export function TeamBioEditor({ teamId, bio }: BioEditorProps) {
  const { isAdmin, unlock } = useAdminMode();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(bio ?? '');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await updateTeamContent(teamId, { bio: draft.trim() });
    setValue(draft.trim());
    setEditing(false);
    setSaving(false);
  }

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1 min-w-0">
        {editing ? (
          <EditArea
            draft={draft}
            onChange={setDraft}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
            saving={saving}
          />
        ) : (
          value && <p className="italic opacity-75 text-sm">&ldquo;{value}&rdquo;</p>
        )}
      </div>
      {!editing && (
        isAdmin ? (
          <button
            onClick={() => { setDraft(value); setEditing(true); }}
            className="text-xs text-white/40 hover:text-white/80 transition shrink-0 mt-0.5"
            title="Edit bio"
          >
            ✏️
          </button>
        ) : (
          <button
            onClick={unlock}
            className="text-xs text-white/50 hover:text-white transition shrink-0 mt-0.5 border border-white/30 hover:border-white/60 rounded px-1.5 py-0.5"
            title="Admin unlock"
          >
            🔒
          </button>
        )
      )}
    </div>
  );
}

// ── Strengths & Weaknesses editor (lives in main content area) ────────────────

interface StrengthsEditorProps extends BaseProps {
  strengths?: string;
  weaknesses?: string;
}

export function TeamStrengthsEditor({ teamId, strengths, weaknesses }: StrengthsEditorProps) {
  const { isAdmin } = useAdminMode();
  const [values, setValues] = useState({ strengths: strengths ?? '', weaknesses: weaknesses ?? '' });
  const [editingField, setEditingField] = useState<'strengths' | 'weaknesses' | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  function startEdit(field: 'strengths' | 'weaknesses') {
    setDraft(values[field]);
    setEditingField(field);
  }

  async function handleSave() {
    if (!editingField) return;
    setSaving(true);
    await updateTeamContent(teamId, { [editingField]: draft.trim() });
    setValues(prev => ({ ...prev, [editingField]: draft.trim() }));
    setEditingField(null);
    setDraft('');
    setSaving(false);
  }

  const showSection = values.strengths || values.weaknesses || isAdmin;
  if (!showSection) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
      {/* Strengths */}
      {(values.strengths || isAdmin) && (
        <div className="bg-white rounded-xl border border-green-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-green-500 text-lg">↑</span>
            <h2 className="text-lg font-bold text-gray-800">Strengths</h2>
            {isAdmin && editingField !== 'strengths' && (
              <button
                onClick={() => startEdit('strengths')}
                className="ml-1 text-xs text-gray-400 hover:text-gray-600 transition"
                title="Edit strengths"
              >
                ✏️
              </button>
            )}
          </div>
          {editingField === 'strengths' ? (
            <EditArea
              draft={draft}
              onChange={setDraft}
              onSave={handleSave}
              onCancel={() => setEditingField(null)}
              saving={saving}
            />
          ) : (
            <p className="text-sm text-gray-600 leading-relaxed">
              {values.strengths || <span className="italic text-gray-400">No strengths written yet.</span>}
            </p>
          )}
        </div>
      )}

      {/* Weaknesses */}
      {(values.weaknesses || isAdmin) && (
        <div className="bg-white rounded-xl border border-red-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-red-400 text-lg">↓</span>
            <h2 className="text-lg font-bold text-gray-800">Weaknesses</h2>
            {isAdmin && editingField !== 'weaknesses' && (
              <button
                onClick={() => startEdit('weaknesses')}
                className="ml-1 text-xs text-gray-400 hover:text-gray-600 transition"
                title="Edit weaknesses"
              >
                ✏️
              </button>
            )}
          </div>
          {editingField === 'weaknesses' ? (
            <EditArea
              draft={draft}
              onChange={setDraft}
              onSave={handleSave}
              onCancel={() => setEditingField(null)}
              saving={saving}
            />
          ) : (
            <p className="text-sm text-gray-600 leading-relaxed">
              {values.weaknesses || <span className="italic text-gray-400">No weaknesses written yet.</span>}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
