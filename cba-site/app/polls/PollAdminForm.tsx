"use client";

import { useState, useEffect } from 'react';
import { createPoll, updatePoll, deletePoll } from './actions';
import { Poll } from '@/lib/types';
import { useRouter } from 'next/navigation';

interface Props {
  existing?: Poll | null;
  onSaved?: () => void;
}

export default function PollAdminForm({ existing = null, onSaved }: Props) {
  const router = useRouter();
  const [question, setQuestion] = useState(existing?.question ?? '');
  const [options, setOptions] = useState<{ id?: string; text: string }[]>(
    existing ? existing.options.map(o => ({ id: o.id, text: o.text })) : [{ text: '' }, { text: '' }]
  );
  const [active, setActive] = useState(existing?.active ?? true);
  const [expiresAt, setExpiresAt] = useState(existing?.expiresAt ?? '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (existing) {
      setQuestion(existing.question);
      setOptions(existing.options.map(o => ({ id: o.id, text: o.text })));
      setActive(existing.active);
      setExpiresAt(existing.expiresAt ?? '');
    }
  }, [existing]);


  function setOptionText(idx: number, text: string) {
    setOptions(opts =>
      opts.map((o, i) => (i === idx ? { ...o, text } : o))
    );
  }

  function addOption() {
    setOptions(opts => [...opts, { text: '' }]);
  }

  function removeOption(idx: number) {
    setOptions(opts => opts.filter((_, i) => i !== idx));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || options.some(o => !o.text.trim())) return;
    setSaving(true);
    try {
      if (existing) {
        await updatePoll(existing.id, question, options, active, expiresAt || undefined, password);
        setMessage('Saved');
      } else {
        await createPoll(question, options.map(o => o.text), active, expiresAt || undefined, password);
        setMessage('Created');
        setQuestion('');
        setOptions([{ text: '' }, { text: '' }]);
        setActive(true);
        setExpiresAt('');
      }
      onSaved?.();
      router.refresh();
    } catch (err: any) {
      setMessage(err.message || 'Error');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 3000);
    }
  }

  async function handleDelete() {
    if (!existing) return;
    if (!confirm('Delete this poll?')) return;
    setSaving(true);
    await deletePoll(existing.id, password);
    onSaved?.();
    router.refresh();
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-8">
      <h3 className="text-lg font-semibold mb-3">
        {existing ? 'Edit Poll' : 'New Poll'}
      </h3>
      <form onSubmit={handleSave}>
        <div className="mb-3">
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="Question"
            className="w-full border border-gray-200 rounded px-3 py-2"
            required
          />
        </div>
        <div className="mb-3 space-y-2">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={opt.text}
                onChange={e => setOptionText(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                className="flex-1 border border-gray-200 rounded px-3 py-2"
                required
              />
              {options.length > 2 && (
                <button type="button" onClick={() => removeOption(i)} className="text-red-500">×</button>
              )}
            </div>
          ))}
          <button type="button" onClick={addOption} className="text-sm text-teal-600">+ add option</button>
        </div>
        <div className="mb-3 flex items-center gap-4">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Active
          </label>
          <label className="flex items-center gap-1">
            Expires <input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="border border-gray-200 rounded px-2 py-1" />
          </label>
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
            disabled={saving}
            className="px-4 py-2 bg-teal-700 text-white rounded font-semibold disabled:opacity-40"
          >
            {saving ? 'Saving…' : existing ? 'Save' : 'Create'}
          </button>
          {existing && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="px-4 py-2 bg-red-600 text-white rounded font-semibold disabled:opacity-40"
            >
              Delete
            </button>
          )}
          {message && <span className="text-sm text-gray-600">{message}</span>}
        </div>
      </form>
    </div>
  );
}
