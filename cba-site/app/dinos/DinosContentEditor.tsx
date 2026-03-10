'use client';

import { useState } from 'react';
import { updateDinosContent } from './actions';
import { useAdminMode } from '@/hooks/useAdminMode';
import type { DinosContent } from '@/lib/types';

function EditArea({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  dark = false,
}: {
  draft: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  dark?: boolean;
}) {
  return (
    <div>
      <textarea
        className={`w-full text-sm border rounded-lg p-3 leading-relaxed resize-y min-h-[100px] focus:outline-none focus:ring-2 ${
          dark
            ? 'bg-white/10 text-white border-white/30 focus:ring-white/30'
            : 'text-gray-700 border-gray-300 focus:ring-blue-300'
        }`}
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
          className={`px-3 py-1 text-sm rounded-md disabled:opacity-50 transition ${
            dark ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Bio editor (dark header background) ───────────────────────────────────────

export function DinosBioEditor({ initialValue }: { initialValue: string }) {
  const { isAdmin, unlock } = useAdminMode();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await updateDinosContent({ bio: draft.trim() });
    setValue(draft.trim());
    setEditing(false);
    setSaving(false);
  }

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1 min-w-0">
        {editing ? (
          <EditArea
            dark
            draft={draft}
            onChange={setDraft}
            onSave={handleSave}
            onCancel={() => setEditing(false)}
            saving={saving}
          />
        ) : (
          <p className="text-sm text-stone-300/75 leading-relaxed">{value}</p>
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

// ── Circumstances paragraph editor ────────────────────────────────────────────

export function DinosCircumstanceParagraph({
  label,
  field,
  initialValue,
}: {
  label: string;
  field: keyof DinosContent;
  initialValue: string;
}) {
  const { isAdmin } = useAdminMode();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await updateDinosContent({ [field]: draft.trim() });
    setValue(draft.trim());
    setEditing(false);
    setSaving(false);
  }

  if (editing) {
    return (
      <div>
        <p className="text-sm font-semibold text-red-700 mb-2">{label}</p>
        <EditArea
          draft={draft}
          onChange={setDraft}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
          saving={saving}
        />
      </div>
    );
  }

  return (
    <p className="text-sm text-stone-700 leading-relaxed">
      <span className="font-semibold text-red-700">{label}</span>{' '}
      {value}
      {isAdmin && (
        <button
          onClick={() => { setDraft(value); setEditing(true); }}
          className="ml-1 text-xs text-gray-400 hover:text-gray-600 transition"
          title={`Edit ${label}`}
        >
          ✏️
        </button>
      )}
    </p>
  );
}

// ── Legacy section editor (dark background) ───────────────────────────────────

export function DinosLegacyEditor({
  field,
  initialValue,
  className,
}: {
  field: keyof DinosContent;
  initialValue: string;
  className: string;
}) {
  const { isAdmin } = useAdminMode();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initialValue);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await updateDinosContent({ [field]: draft.trim() });
    setValue(draft.trim());
    setEditing(false);
    setSaving(false);
  }

  if (editing) {
    return (
      <EditArea
        dark
        draft={draft}
        onChange={setDraft}
        onSave={handleSave}
        onCancel={() => setEditing(false)}
        saving={saving}
      />
    );
  }

  return (
    <div className="flex items-start gap-2">
      <p className={`${className} flex-1`}>{value}</p>
      {isAdmin && (
        <button
          onClick={() => { setDraft(value); setEditing(true); }}
          className="text-xs text-white/40 hover:text-white/80 transition shrink-0 mt-0.5"
          title="Edit"
        >
          ✏️
        </button>
      )}
    </div>
  );
}
