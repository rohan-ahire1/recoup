import type { Metadata } from 'next';
import { confirmEmailChangeAction } from '@/app/account-actions';
import { PublicShell } from '@/app/components/PublicShell';
import { SubmitButton } from '@/app/components/SubmitButton';
import { Panel } from '@/app/components/ui';

export const metadata: Metadata = { title: 'Confirm your new email · Recoup', robots: { index: false } };

export default async function ConfirmEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  return (
    <PublicShell>
      <Panel lift className="p-6 text-center sm:p-8">
        <h1 className="display text-title font-bold">Use this email to sign in?</h1>
        <p className="mt-2 text-muted">Press the button to change your Recoup sign-in email. You need to be signed in as the account that asked for the change.</p>
        <form action={confirmEmailChangeAction} className="mt-6">
          <input type="hidden" name="token" value={token} />
          <SubmitButton variant="primary" size="lg" pendingLabel="Changing…" className="w-full">Change my email</SubmitButton>
        </form>
      </Panel>
    </PublicShell>
  );
}
