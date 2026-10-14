import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createBusinessAction } from '@/app/account-actions';
import { fieldClass, Notice, PublicShell } from '@/app/components/PublicShell';
import { SubmitButton } from '@/app/components/SubmitButton';
import { TimezoneInput } from '@/app/components/TimezoneInput';
import { Panel } from '@/app/components/ui';
import { getUser } from '@/lib/accounts';
import { requireSession } from '@/lib/auth';

export const metadata: Metadata = { title: 'Welcome · Recoup' };
export const dynamic = 'force-dynamic';

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const s = await requireSession();
  const user = s.userId ? getUser(s.userId) : undefined;
  if (!user) redirect('/login');
  const { error } = await searchParams;

  return (
    <PublicShell>
      <Panel lift className="p-6 sm:p-8">
        {error && <Notice tone="rust">Please enter your business name.</Notice>}
        <h1 className="display text-[30px] leading-tight font-bold">Let’s set you up</h1>
        <p className="mt-2 text-muted">This takes a minute. You can change any of it later.</p>
        <form action={createBusinessAction} className="mt-6 flex flex-col gap-4 text-sm font-semibold">
          <label>
            Business name
            <input name="businessName" required autoFocus placeholder="Harbor Street Plumbing" className={fieldClass} />
            <span className="mt-1 block font-normal text-faint">Customers see this on every reminder.</span>
          </label>
          <label>
            Your first name
            <input name="senderName" placeholder="Sam" className={fieldClass} />
            <span className="mt-1 block font-normal text-faint">Reminders are signed by you, so they feel personal.</span>
          </label>
          <label>
            Where should customer replies go?
            <input name="replyToEmail" type="email" defaultValue={user.email} className={fieldClass} />
          </label>
          <TimezoneInput />
          <SubmitButton variant="primary" size="lg" pendingLabel="Setting up…">Continue</SubmitButton>
        </form>
      </Panel>
    </PublicShell>
  );
}
