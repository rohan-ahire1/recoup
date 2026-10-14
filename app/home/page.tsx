import type { Metadata } from 'next';
import Link from 'next/link';
import { startDemoAction } from '@/app/account-actions';
import { Icon, type IconName } from '@/app/components/icons';
import { Notice } from '@/app/components/PublicShell';
import { SubmitButton } from '@/app/components/SubmitButton';
import { buttonClass, Panel } from '@/app/components/ui';
import { STEPS } from '@/lib/sequence';

export const metadata: Metadata = {
  title: 'Recoup · Get paid for the small invoices',
  description: 'Polite, persistent reminders for overdue invoices too small for a collections agency. Stops the moment they pay.',
};

const POINTS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'upload', title: 'Bring your invoices', body: 'Upload a spreadsheet from any accounting tool. Paid history helps Recoup know who’s usually good for it.' },
  { icon: 'mail', title: 'Recoup does the chasing', body: 'One friendly message per customer, covering everything they owe, in your name and your tone.' },
  { icon: 'hand', title: 'It knows when to stop', body: 'Reminders stop the moment they pay, reply, promise a date or dispute. You only step in when it matters.' },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string; error?: string }> }) {
  const q = await searchParams;
  return (
    <div className="min-h-screen px-4 pb-16 sm:px-6 lg:px-10">
      <header className="mx-auto flex max-w-6xl items-center justify-between py-5">
        <span className="display text-[26px] font-bold text-teal">recoup</span>
        <Link href="/login" className={buttonClass('ghost', 'sm')}>Sign in</Link>
      </header>

      <main className="mx-auto max-w-6xl">
        {q.deleted && <Notice>Your business and all its data have been deleted.</Notice>}
        {q.error && <Notice tone="rust">Too many demos from here. Please try again later.</Notice>}

        <section className="grid items-center gap-10 py-10 lg:grid-cols-[1.1fr_1fr] lg:py-16">
          <div>
            <h1 className="display text-[44px] leading-[1.05] font-bold text-balance sm:text-[56px]">Get paid for the small invoices you’ve been letting go.</h1>
            <p className="mt-5 max-w-xl text-[17px] text-muted">
              That $300 invoice isn’t worth an agency, or an awkward phone call. Recoup sends polite, persistent reminders in your name, and stops the moment they pay.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className={buttonClass('primary', 'lg')}>Start free</Link>
              <form action={startDemoAction}>
                <SubmitButton variant="outline" size="lg" pendingLabel="Setting up the demo…">Try the demo</SubmitButton>
              </form>
            </div>
            <p className="mt-3 text-sm text-faint">No card, no setup. The demo is a sample business you can play with.</p>
          </div>

          <Panel lift className="p-6 sm:p-7" as="div">
            <p className="text-sm text-muted">Harbor Street Bakery · 2 invoices · $1,240</p>
            <div className="mt-4 rounded-2xl bg-linen/60 p-4 text-[15px] leading-relaxed">
              Hi Dana, hope the week’s going well! A quick reminder that invoices #2041 and #2052 ($1,240 in total) are now past due. You can see them and pay here. Thanks so much!
              <span className="mt-2 block text-sm text-faint">Marco, Ferro Service Co.</span>
            </div>
            <ol className="mt-5 flex flex-col gap-2 text-sm">
              {STEPS.map((s) => (
                <li key={s.step} className="flex gap-3">
                  <span className="num w-12 shrink-0 text-faint">Day {s.day}</span>
                  <span>{s.label}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </section>

        <section className="grid gap-5 md:grid-cols-3">
          {POINTS.map((p) => (
            <Panel key={p.title} className="p-6" as="div">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-soft text-teal">
                <Icon name={p.icon} />
              </span>
              <h2 className="mt-4 text-[17px] font-semibold">{p.title}</h2>
              <p className="mt-1 text-muted">{p.body}</p>
            </Panel>
          ))}
        </section>
      </main>
    </div>
  );
}
