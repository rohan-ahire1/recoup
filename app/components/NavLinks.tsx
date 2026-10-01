'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLinks({ toSend }: { toSend: number }) {
  const path = usePathname();
  const links = [
    { href: '/', label: 'Today' },
    { href: '/customers', label: 'Customers' },
    { href: '/invoices', label: 'Invoices' },
    { href: '/send', label: 'To send', count: toSend },
    { href: '/templates', label: 'Templates' },
    { href: '/reports', label: 'Reports' },
  ];
  return (
    <nav aria-label="Main" className="no-scrollbar fade-end -mx-1 flex gap-1 overflow-x-auto px-1 py-1">
      {links.map((l) => {
        const active = l.href === '/' ? path === '/' : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={`ease flex h-10 items-center gap-1.5 rounded-full px-4 text-[15px] whitespace-nowrap ${
              active ? 'bg-ink text-sand' : 'text-muted hover:bg-linen hover:text-ink'
            }`}
          >
            {l.label}
            {l.count ? (
              <span className="num min-w-5 rounded-full bg-marigold px-1.5 text-center text-xs leading-5 font-semibold text-ink">{l.count}</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
