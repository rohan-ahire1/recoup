import type { Metadata } from 'next';
import { verifyLoginAction } from '@/app/account-actions';
import { PublicShell } from '@/app/components/PublicShell';
import { SubmitButton } from '@/app/components/SubmitButton';
import { Panel } from '@/app/components/ui';

export const metadata: Metadata = { title: 'Sign in · Recoup', robots: { index: false } };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  return (
    <PublicShell>
      <Panel lift className="p-6 text-center sm:p-8">
        <h1 className="display text-[30px] leading-tight font-bold">Welcome to Recoup</h1>
        <p className="mt-2 text-muted">One click and you’re in.</p>
        <form action={verifyLoginAction} className="mt-6">
          <input type="hidden" name="token" value={token} />
          <SubmitButton variant="primary" size="lg" pendingLabel="Signing in…" className="w-full">Continue</SubmitButton>
        </form>
      </Panel>
    </PublicShell>
  );
}
