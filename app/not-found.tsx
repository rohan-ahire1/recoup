import Link from 'next/link';
import { buttonClass } from './components/ui';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-4 py-16">
      <h1 className="display text-title font-bold">Page not found</h1>
      <p className="mt-2 text-muted">That link doesn’t go anywhere. It may be old, or mistyped.</p>
      <div className="mt-6">
        <Link href="/" className={buttonClass('primary')}>
          Go home
        </Link>
      </div>
    </div>
  );
}
