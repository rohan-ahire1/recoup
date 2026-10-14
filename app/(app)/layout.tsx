import Link from 'next/link';
import { DemoStrip } from '@/app/components/DemoStrip';
import { Icon } from '@/app/components/icons';
import { NavLinks } from '@/app/components/NavLinks';
import { StickyBar } from '@/app/components/StickyBar';
import { requireBusiness } from '@/lib/auth';
import { initials } from '@/lib/format';
import { isDemoMode } from '@/lib/providers';
import { listMessagesByStatus } from '@/lib/repo';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireBusiness();
  const { businessName, showDemoBar } = getSettings();
  const toSend = listMessagesByStatus(['ready']).length;
  return (
    <>
      <StickyBar as="header" varName="--header-h" className="sticky top-0 z-40 bg-sand/85 py-2 shadow-[0_1px_0_var(--color-line)] backdrop-blur-md lg:py-3">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-1 px-4 sm:px-6 lg:px-10">
          <Link href="/" className="display text-heading font-bold text-teal">
            recoup
          </Link>
          <div className="order-3 w-full min-w-0 lg:order-none lg:w-auto lg:flex-1">
            <NavLinks toSend={toSend} />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/settings" aria-label="Settings" className="ease flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-linen hover:text-ink">
              <Icon name="gear" />
            </Link>
            <Link href="/settings" className="flex items-center gap-2 text-sm text-muted" title={businessName}>
              <span className="hidden max-w-40 truncate lg:inline">{businessName}</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-[13px] font-semibold text-paper">{initials(businessName)}</span>
            </Link>
          </div>
        </div>
      </StickyBar>
      {isDemoMode() && showDemoBar && (
        <div className="pt-2">
          <DemoStrip />
        </div>
      )}
      <main className="mx-auto max-w-[1600px] px-4 pt-6 pb-16 sm:px-6 lg:px-10">{children}</main>
    </>
  );
}
