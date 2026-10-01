'use client';

import { useLayoutEffect, useRef } from 'react';

/**
 * A bar that reports its live height as a CSS variable (e.g. --header-h), so the
 * things pinned beneath it (toolbars, table headers, the customer sidebar) line up
 * exactly at every screen size.
 */
export function StickyBar({
  varName,
  as: Tag = 'div',
  className,
  children,
}: {
  varName: '--header-h' | '--toolbar-h';
  as?: 'div' | 'header';
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const set = () => root.style.setProperty(varName, `${Math.round(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (varName === '--toolbar-h') root.style.setProperty(varName, '0px');
    };
  }, [varName]);
  return (
    <Tag ref={ref as React.RefObject<HTMLDivElement>} className={className}>
      {children}
    </Tag>
  );
}
