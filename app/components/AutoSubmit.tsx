'use client';

import { useRef } from 'react';

/** A form that submits itself whenever one of its fields changes (filters, tone pickers). */
export function AutoSubmitForm({
  children,
  className,
  action,
  method,
}: {
  children: React.ReactNode;
  className?: string;
  action?: string | ((formData: FormData) => void | Promise<void>);
  method?: 'get';
}) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      action={action}
      method={method}
      className={className}
      onChange={(e) => {
        const t = e.target as HTMLElement;
        // Typed fields wait for Enter; pickers submit straight away.
        if (t.tagName === 'INPUT' && ['text', 'number', 'search'].includes((t as HTMLInputElement).type)) return;
        ref.current?.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
