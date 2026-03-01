'use client';

import { useState } from 'react';
import { Poll } from '@/lib/types';
import PollCard from '../polls/PollCard';
import PollAdminForm from '../polls/PollAdminForm';
import { useAdminMode } from '@/hooks/useAdminMode';

interface Props {
  activePolls: Poll[];
  closedPolls: Poll[];
}

export default function PollsViewer({ activePolls, closedPolls }: Props) {
  const { isAdmin, unlock } = useAdminMode();
  const [editing, setEditing] = useState<Poll | null>(null);

  return (
    <>
      {/* Admin login + edit form */}
      {!isAdmin && (
        <div className="mb-8 text-right">
          <button
            onClick={unlock}
            className="text-sm text-gray-500 hover:underline"
          >
            🔒 Admin login
          </button>
        </div>
      )}
      
      {isAdmin && editing && (
        <div className="mb-8">
          <p className="text-sm text-gray-500 mb-3">Editing poll &quot;{editing.question}&quot;</p>
          <PollAdminForm existing={editing} onSaved={() => setEditing(null)} />
        </div>
      )}

      {/* Active polls */}
      {activePolls.length > 0 && (
        <section id="polls" className="mb-12">
          <h2 className="text-xl font-bold text-gray-700 mb-4">🗳️ Open Polls</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {activePolls.map(poll => (
              <PollCard
                key={poll.id}
                poll={poll}
                onEdit={isAdmin ? () => setEditing(poll) : unlock}
              />
            ))}
          </div>
        </section>
      )}

      {/* Closed polls */}
      {closedPolls.length > 0 && (
        <section className="mb-12">
          <h2 className="text-xl font-bold text-gray-700 mb-4">🔒 Closed Polls</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {closedPolls.map(poll => (
              <PollCard key={poll.id} poll={poll} showResults />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
