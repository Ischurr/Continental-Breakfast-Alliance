'use client';

import { useState } from 'react';
import { Poll } from '@/lib/types';
import { castVote } from './actions';

interface Props {
  poll: Poll;
  showResults?: boolean;
  // optional callback when admin wants to edit this poll
  onEdit?: () => void;
}

export default function PollCard({ poll, showResults = false, onEdit }: Props) {
  const [voted, setVoted] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [optimisticVotes, setOptimisticVotes] = useState(poll.options.map(o => o.votes));
  const [loading, setLoading] = useState(false);

  const totalVotes = optimisticVotes.reduce((s, v) => s + v, 0);
  const showingResults = showResults || voted;

  async function handleVote() {
    if (!selected || loading) return;
    setLoading(true);
    // Optimistic update
    const idx = poll.options.findIndex(o => o.id === selected);
    setOptimisticVotes(prev => prev.map((v, i) => i === idx ? v + 1 : v));
    setVoted(true);
    await castVote(poll.id, selected);
    setLoading(false);
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6 flex flex-col relative">
      {onEdit && poll.active && (
        <button
          onClick={onEdit}
          className="absolute top-3 right-3 text-xs text-teal-600 hover:underline"
        >
          edit
        </button>
      )}
      <div className="flex justify-between items-start mb-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          {poll.active ? '🗳️ Open' : '🔒 Closed'}
        </p>
        <div className="text-right">
          <p className="text-xs text-gray-400">{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</p>
          {poll.expiresAt && poll.active && (
            <p className="text-xs text-orange-400 font-medium">Closes {new Date(poll.expiresAt + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
          )}
        </div>
      </div>
      <h3 className="text-lg font-bold text-gray-800 mb-4">{poll.question}</h3>

      <div className="space-y-2 flex-1">
        {poll.options.map((option, i) => {
          const votes = optimisticVotes[i];
          const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
          const isSelected = selected === option.id;
          const isWinner = showingResults && votes === Math.max(...optimisticVotes) && votes > 0;

          if (showingResults) {
            return (
              <div key={option.id} className="relative">
                <div
                  className={`absolute inset-0 rounded-lg transition-all ${isWinner ? 'bg-teal-100' : 'bg-gray-100'}`}
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex justify-between items-center px-3 py-2 rounded-lg border border-gray-100">
                  <span className={`text-sm font-medium ${isWinner ? 'text-teal-700' : 'text-gray-700'}`}>
                    {option.text}
                  </span>
                  <span className={`text-sm font-bold ml-4 flex-shrink-0 ${isWinner ? 'text-teal-700' : 'text-gray-500'}`}>
                    {pct}%
                  </span>
                </div>
              </div>
            );
          }

          return (
            <button
              key={option.id}
              onClick={() => setSelected(option.id)}
              className={`w-full text-left px-3 py-2 rounded-lg border text-sm font-medium transition ${
                isSelected
                  ? 'border-teal-500 bg-teal-50 text-teal-700'
                  : 'border-gray-200 hover:border-teal-300 hover:bg-sky-50 text-gray-700'
              }`}
            >
              {option.text}
            </button>
          );
        })}
      </div>

      {!showingResults && poll.active && (
        <button
          onClick={handleVote}
          disabled={!selected || loading}
          className="mt-4 w-full bg-teal-600 text-white py-2 rounded-lg font-semibold text-sm hover:bg-teal-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? 'Submitting…' : 'Submit Vote'}
        </button>
      )}

      {voted && (
        <p className="text-xs text-teal-600 text-center mt-3 font-medium">Thanks for voting!</p>
      )}
    </div>
  );
}
