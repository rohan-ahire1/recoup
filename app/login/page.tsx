import type { Metadata } from 'next';
import { requestLoginAction } from '@/app/account-actions';
import { fieldClass, Notice, PublicShell } from '@/app/components/PublicShell';
import { SubmitButton } from '@/app/components/SubmitButton';
import { Panel } from '@/app/components/ui';

export const metadata: Metadata = { title: 'Sign in · Recoup' };

const ERRORS: Record<string, string> = {
  email: 'That doesn’t look like an email address.',
  slow: 'Too many tries. Please wait a few minutes and try again.',
  send: 'We couldn’t send the email just now. Please try again in a minute.',
  expired: 'That sign-in link has expired or was already used. Here’s a fresh start.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; dev?: string }> }) {
  const q = await searchParams;
  return (
    <PublicShell>
      <Panel lift className="p-6 sm:p-8">
        {q.sent ? (
          <>
            <h1 className="display text-[30px] leading-tight font-bold">Check your email</h1>
            <p className="mt-2 text-muted">
              We sent a sign-in link to <span className="font-semibold text-ink">{q.sent}</span>. It works once and expires in 15 minutes.
            </p>
            {q.dev && (
              <p className="mt-5 rounded-2xl bg-linen px-4 py-3 text-sm break-all">
                Email isn’t set up on this server, so here’s the link: <a className="font-semibold text-teal underline" href={q.dev}>sign in</a>
              </p>
            )}
            <a href="/login" className="mt-6 inline-block text-sm font-semibold text-teal">Use a different email</a>
          </>
        ) : (
          <>
            {q.error && <Notice tone="rust">{ERRORS[q.error] ?? 'Something went wrong. Please try again.'}</Notice>}
            <h1 className="display text-[30px] leading-tight font-bold">Sign in or create an account</h1>
            <p className="mt-2 text-muted">No password. We’ll email you a link.</p>
            <form action={requestLoginAction} className="mt-6 flex flex-col gap-4 text-sm font-semibold">
              <label>
                Email
                <input name="email" type="email" required autoComplete="email" autoFocus placeholder="you@yourbusiness.com" className={fieldClass} />
              </label>
              <SubmitButton variant="primary" size="lg" pendingLabel="Sending…">Email me a link</SubmitButton>
            </form>
          </>
        )}
      </Panel>
    </PublicShell>
  );
}
