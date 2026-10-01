'use client';

import { useState } from 'react';

const FILTERS = [
  ['all', 'Everything'],
  ['message', 'Messages'],
  ['money', 'Money'],
] as const;

/** Filters the story in place: items carry data-kind, the wrapper hides the rest with CSS. */
export function StoryFilter({ children, counts }: { children: React.ReactNode; counts: Record<string, number> }) {
  const [filter, setFilter] = useState<string>('all');
  return (
    <div data-story-filter={filter}>
      <div role="group" aria-label="Show" className="mb-5 flex flex-wrap gap-1.5 text-sm">
        {FILTERS.map(([k, l]) => (
          <button
            key={k}
            type="button"
            aria-pressed={filter === k}
            onClick={() => setFilter(k)}
            className={`ease rounded-full px-3.5 py-1.5 ${filter === k ? 'bg-ink text-sand' : 'bg-linen text-ink hover:bg-linen-2'}`}
          >
            {l} <span className="num opacity-70">{counts[k]}</span>
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
