import Link from 'next/link';

export const fieldClass =
  'mt-1 block h-11 w-full rounded-[var(--radius-control)] bg-paper px-3 font-normal ring-1 ring-line ring-inset focus:ring-teal';

/** The signed-out world: logo, one calm card. */
export function PublicShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen px-4 py-8 sm:py-12">
      <header className="mx-auto mb-10 max-w-5xl">
        <Link href="/" className="display text-[26px] font-bold text-teal">
          recoup
        </Link>
      </header>
      <main className={`mx-auto ${wide ? 'max-w-5xl' : 'max-w-md'}`}>{children}</main>
    </div>
  );
}

export function Notice({ tone = 'teal', children }: { tone?: 'teal' | 'rust'; children: React.ReactNode }) {
  const cls = tone === 'teal' ? 'bg-teal-soft text-teal-strong' : 'bg-rust-soft text-rust';
  return <p className={`mb-5 rounded-2xl px-4 py-3 text-sm font-semibold ${cls}`}>{children}</p>;
}
