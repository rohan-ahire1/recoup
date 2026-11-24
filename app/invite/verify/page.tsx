import type { Metadata } from 'next';
import { acceptInviteAction } from '@/app/account-actions';
import { Notice, PublicShell } from '@/app/components/PublicShell';
import { SubmitButton } from '@/app/components/SubmitButton';
import { Panel } from '@/app/components/ui';

export const metadata: Metadata = { title: 'Join a business · Recoup', robots: { index: false } };

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token = '', error } = await searchParams;
  return (
    <PublicShell>
      <Panel lift className="p-6 text-center sm:p-8">
        {error && <Notice tone="rust">That invitation has expired or was already used. Ask for a new one.</Notice>}
        <h1 className="display text-title font-bold">You’re invited to Recoup</h1>
        <p className="mt-2 text-muted">One click and you’re in.</p>
        <form action={acceptInviteAction} className="mt-6">
          <input type="hidden" name="token" value={token} />
          <SubmitButton variant="primary" size="lg" pendingLabel="Joining…" className="w-full">Join</SubmitButton>
        </form>
      </Panel>
    </PublicShell>
  );
}
