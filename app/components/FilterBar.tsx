'use client';

import { useState } from 'react';
import { Icon } from './icons';
import { buttonClass } from './ui';

/**
 * Filters for list pages. On phones the pickers fold behind a "Filters" button so
 * the list isn't pushed below the fold; from tablet up they sit inline.
 */
export function FilterBar({ search, children, active }: { search: React.ReactNode; children: React.ReactNode; active: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {search}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={`${buttonClass(active ? 'primary' : 'outline')} md:hidden`}>
        <Icon name="filter" size={17} />
        Filters{active ? ` (${active})` : ''}
      </button>
      <div className={`${open ? 'flex' : 'hidden'} w-full flex-wrap items-center gap-2 md:flex md:w-auto`}>{children}</div>
    </div>
  );
}
