'use client';

import { useRef } from 'react';
import { Icon } from './icons';
import { buttonClass } from './ui';

/**
 * A "see everything" button that opens the full list in a modal dialog, so long
 * lists don't stretch the page. Native <dialog>: Esc closes, focus moves inside,
 * a click on the backdrop closes it, and the page behind stops scrolling.
 */
export function ExpandDialog({
  label,
  title,
  subtitle,
  children,
  wide = false,
}: {
  label: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={`${buttonClass('quiet', 'sm')} self-start`}>
        {label}
        <Icon name="chevronRight" size={16} />
      </button>
      <dialog
        ref={ref}
        aria-label={title}
        onClick={(e) => {
          if (e.target === ref.current) ref.current.close();
        }}
        className={`recoup-dialog m-auto max-h-[88dvh] w-[calc(100vw-1.5rem)] overflow-hidden rounded-panel bg-paper ring-1 ring-edge ring-inset p-0 text-ink shadow-[var(--shadow-lift)] ${
          wide ? 'max-w-[1100px]' : 'max-w-[760px]'
        }`}
      >
        <div className="flex max-h-[88dvh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-linen px-6 py-5 sm:px-8">
            <div className="min-w-0">
              <h2 className="display text-section font-bold">{title}</h2>
              {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              aria-label="Close"
              className="ease -mt-1 -mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-linen hover:text-ink"
            >
              <Icon name="close" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 sm:px-8">{children}</div>
        </div>
      </dialog>
    </>
  );
}
