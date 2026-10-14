'use client';

import Link from 'next/link';
import { buttonClass } from './components/ui';

/** Shown when a page fails unexpectedly. The error itself is logged and alerted on the server. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4 py-16">
      <h1 className="display text-title font-bold">Something went wrong</h1>
      <p className="mt-2 text-muted">That didn’t work on our side. Nothing you did is lost. Try again, and if it keeps happening, let us know.</p>
      {error.digest && <p className="mt-2 text-sm text-faint">Reference: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={reset} className={buttonClass('primary')}>
          Try again
        </button>
        <Link href="/" className={buttonClass('ghost')}>
          Go home
        </Link>
      </div>
    </div>
  );
}
