'use client';

import { useState } from 'react';

interface TabPanel {
  id: string;
  label: string;
  badge?: string;
  content: React.ReactNode;
}

interface Props {
  panels: TabPanel[];
  defaultTab?: string;
  teamColor?: string;
}

export default function TeamSectionTabs({ panels, defaultTab, teamColor = '#0f766e' }: Props) {
  const [active, setActive] = useState(defaultTab ?? panels[0]?.id ?? '');

  if (panels.length === 0) return null;

  return (
    <div className="mb-10">
      {/* Tab bar */}
      <div className="flex gap-2 flex-wrap mb-6 border-b border-gray-200 pb-3">
        {panels.map(panel => {
          const isActive = active === panel.id;
          return (
            <button
              key={panel.id}
              onClick={() => setActive(panel.id)}
              className={`
                px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-150
                flex items-center gap-1.5
                ${isActive
                  ? 'text-white shadow-sm'
                  : 'bg-slate-100 text-gray-500 hover:bg-slate-200 hover:text-gray-700'
                }
              `}
              style={isActive ? { backgroundColor: teamColor } : undefined}
            >
              {panel.label}
              {panel.badge && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                    isActive ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {panel.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Panels — all rendered in DOM for fast switching, visibility via CSS */}
      {panels.map(panel => (
        <div key={panel.id} style={{ display: active === panel.id ? 'block' : 'none' }}>
          {panel.content}
        </div>
      ))}
    </div>
  );
}
