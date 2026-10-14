import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { startDemoAction } from '@/app/account-actions';
import { Icon, type IconName } from '@/app/components/icons';
import { Notice } from '@/app/components/PublicShell';
import { SubmitButton } from '@/app/components/SubmitButton';
import { Avatar, buttonClass, Panel, StatePill, TrackDots } from '@/app/components/ui';
import { STEPS } from '@/lib/sequence';
import florist from '@/assets/img/florist.webp';
import heroOwner from '@/assets/img/hero-owner.webp';
import openLate from '@/assets/img/open-late.webp';
import salon from '@/assets/img/salon.webp';
import studio from '@/assets/img/studio.webp';
import trades from '@/assets/img/trades.webp';

export const metadata: Metadata = {
  title: 'Recoup · Get paid for the small invoices',
  description: 'Polite, persistent reminders for overdue invoices too small for a collections agency. Stops the moment they pay.',
};

const TRADES = [
  { img: florist, label: 'Florists', note: 'Event orders paid “after the wedding”', alt: 'A florist wrapping a bouquet of roses in brown paper' },
  { img: salon, label: 'Salons', note: 'Regulars who run a tab', alt: 'A hairdresser laughing with a client as she blow-dries her hair' },
  { img: studio, label: 'Studios', note: 'Deposits and final balances', alt: 'A potter checking her laptop among glazed bowls in her studio' },
  { img: trades, label: 'Trades', note: 'Call-outs billed after the job', alt: 'An electrician on a stepladder fitting a pendant light' },
];

const PROMISES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'mail', title: 'One message, not a pile', body: 'Everything a customer owes goes in a single friendly note, never one per invoice.' },
  { icon: 'clock', title: 'Never pushy', body: 'At least two days between messages, and four steps at most before you decide what’s next.' },
  { icon: 'hand', title: 'Stops on its own', body: 'A payment, a reply, a promised date or a dispute stops the reminders straight away.' },
  { icon: 'user', title: 'Sounds like you', body: 'Sent in your business’s name, in the tone you pick. Replies come straight to your inbox.' },
];

export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string; error?: string }> }) {
  const q = await searchParams;
  return (
    <div className="relative min-h-screen overflow-x-clip">
      <span className="ledger-margin hidden lg:block" aria-hidden="true" />
      <header className="sticky top-0 z-40 bg-sand/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-10">
          <Link href="/" className="display text-heading font-bold text-teal">recoup</Link>
          <nav className="flex items-center gap-1">
            <a href="#how" className={`${buttonClass('ghost', 'sm')} hidden sm:inline-flex`}>How it works</a>
            <a href="#who" className={`${buttonClass('ghost', 'sm')} hidden sm:inline-flex`}>Who it’s for</a>
            <Link href="/login" className={buttonClass('ghost', 'sm')}>Sign in</Link>
            <Link href="/login" className={buttonClass('primary', 'sm')}>Start free</Link>
          </nav>
        </div>
      </header>

      <main>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10">
          {q.deleted && <Notice>Your business and all its data have been deleted.</Notice>}
          {q.error && <Notice tone="rust">Too many demos from here. Please try again later.</Notice>}
        </div>

        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-8 pb-20 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-10 lg:pt-14 lg:pb-28">
          <div className="enter">
            <span className="inline-flex items-center gap-2 rounded-full bg-paper py-1 pr-3 pl-1.5 text-sm text-muted ring-1 ring-edge ring-inset">
              <span className="inline-flex items-center rounded-full bg-teal-soft px-2 py-0.5 text-xs font-semibold text-teal-strong">New</span>
              Connects to QuickBooks Online
            </span>
            <h1 className="display mt-6 text-title leading-[1.04] font-bold text-balance sm:text-money sm:leading-[1.02]">
              Get paid for the small invoices you’ve been letting go.
            </h1>
            <p className="mt-6 max-w-xl text-lead text-muted">
              That $300 invoice isn’t worth an agency, or an awkward phone call. Recoup sends polite, persistent reminders in your name, and stops the moment they pay.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/login" className={buttonClass('primary', 'lg')}>
                Start free <Icon name="sparkle" size={20} className="opacity-80" />
              </Link>
              <form action={startDemoAction}>
                <SubmitButton variant="outline" size="lg" pendingLabel="Setting up the demo…">Try the demo</SubmitButton>
              </form>
            </div>
            <p className="mt-4 text-sm text-faint">No card, no setup. The demo is a sample business you can play with.</p>
          </div>

          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="enter-photo relative aspect-[4/5] overflow-hidden rounded-pay shadow-[var(--shadow-lift)] ring-1 ring-edge ring-inset">
              <Image
                src={heroOwner}
                alt="A smiling bakery owner in a floury apron checking his phone in the shop doorway"
                fill
                priority
                placeholder="blur"
                sizes="(min-width: 1024px) 520px, 90vw"
                className="object-cover object-center"
              />
            </div>

            <div className="enter-card-1 absolute -left-3 top-8 w-64 sm:-left-10 sm:w-72">
              <Panel lift as="div" className="p-4">
                <div className="flex items-center gap-2 text-xs text-faint">
                  <Icon name="mail" size={16} className="text-teal" />
                  Friendly reminder · Day 1
                </div>
                <p className="mt-2 text-sm leading-snug text-ink-2">
                  Hi Dana, a quick reminder that invoices #2041 and #2052 ($1,240) are past due. You can pay here. Thanks so much!
                </p>
              </Panel>
            </div>

            <div className="enter-card-2 absolute -right-2 -bottom-6 w-72 sm:-right-8">
              <Panel lift as="div" className="px-5 pt-4 pb-5">
                <p className="text-xs text-faint">Ferro Service Co. · overdue</p>
                <ul className="mt-2 text-sm">
                  {[
                    { n: '2034', who: 'Dana Okafor', amt: '$300.00' },
                    { n: '2041', who: 'Harbor St Bakery', amt: '$1,240.00', paid: true },
                    { n: '2052', who: 'Pine & Co', amt: '$860.00' },
                  ].map((r) => (
                    <li key={r.n} className={`relative flex h-8 items-center gap-3 border-b border-teal/15 ${r.paid ? 'text-teal' : ''}`}>
                      <span className="num w-12 text-faint">#{r.n}</span>
                      <span className="min-w-0 flex-1 truncate">{r.who}</span>
                      <span className="num font-semibold">{r.amt}</span>
                      {r.paid && <span className="strike" aria-hidden="true" />}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 flex justify-between text-sm">
                  <span className="text-muted">Still owed</span>
                  <span className="num border-b-[3px] border-double border-ink font-semibold">$1,160.00</span>
                </p>
                <span className="stamp display absolute top-16 right-5 rounded-tooltip border-[3px] border-teal px-3 text-section font-bold text-teal" aria-label="Paid">
                  PAID
                </span>
              </Panel>
            </div>
          </div>
        </section>

        {/* Works with */}
        <section className="border-y border-line/80 bg-paper/50">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-6 text-sm text-muted sm:px-6 lg:px-10">
            <span className="text-faint">Bring invoices from</span>
            <span className="inline-flex items-center gap-2 font-semibold text-ink-2"><Icon name="building" size={20} className="text-teal" />QuickBooks Online</span>
            <span className="inline-flex items-center gap-2 font-semibold text-ink-2"><Icon name="upload" size={20} className="text-teal" />Any spreadsheet (CSV)</span>
            <span className="inline-flex items-center gap-2 font-semibold text-ink-2"><Icon name="edit" size={20} className="text-teal" />Or type them in</span>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-10 lg:py-32">
          <div className="reveal max-w-2xl">
            <p className="text-sm font-semibold text-teal">How it works</p>
            <h2 className="display mt-3 text-heading font-bold text-balance sm:text-title">Set it up once. It chases, you get on with your day.</h2>
          </div>

          <div className="mt-16 flex flex-col gap-20 lg:gap-28">
            <Step n={1} title="Bring your invoices" body="Connect QuickBooks Online or upload a spreadsheet. Paid history tells Recoup who’s usually good for it, so reliable customers get a gentler touch.">
              <Panel lift as="div" className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
                  <span className="text-sm font-semibold">Overdue</span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-faint"><span className="h-2 w-2 rounded-full bg-teal" />Synced with QuickBooks</span>
                </div>
                <ul className="divide-y divide-line">
                  {[
                    { name: 'Harbor Street Bakery', type: 'business' as const, amount: '$1,240', late: '12 days late', dots: [0, 1, 0, 6, 0] },
                    { name: 'Dana Okafor', type: 'individual' as const, amount: '$300', late: '9 days late', dots: [0, 0, 1] },
                    { name: 'Pine & Co Events', type: 'business' as const, amount: '$860', late: '21 days late', dots: [8, 3, 14, 0] },
                  ].map((r) => (
                    <li key={r.name} className="flex items-center gap-3 px-5 py-3.5">
                      <Avatar name={r.name} type={r.type} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{r.name}</span>
                        <span className="mt-1 block"><TrackDots lateness={r.dots} open={1} /></span>
                      </span>
                      <span className="text-right">
                        <span className="num block font-semibold">{r.amount}</span>
                        <span className="block text-xs text-faint">{r.late}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Panel>
            </Step>

            <Step n={2} flip title="Recoup does the chasing" body="One friendly message per customer, covering everything they owe, with a link to see the invoices and how to pay. Then a short, polite sequence, never more.">
              <Panel lift as="div" className="p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <Avatar name="Harbor Street Bakery" type="business" size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold">Harbor Street Bakery</span>
                    <span className="block text-xs text-faint">2 invoices · $1,240</span>
                  </span>
                  <StatePill state="active" />
                </div>
                <div className="mt-4 rounded-block rounded-tl-tail bg-linen/70 p-4 text-[15px] leading-relaxed">
                  Hi Dana, hope the week’s going well! A quick reminder that invoices #2041 and #2052 ($1,240 in total) are now past due. You can see them and pay here. Thanks so much!
                  <span className="mt-2 block text-sm text-faint">Marco, Ferro Service Co.</span>
                </div>
                <ol className="relative mt-6 grid grid-cols-4 gap-2">
                  <span className="absolute top-[7px] right-[12.5%] left-[12.5%] h-0.5 bg-linen" aria-hidden="true" />
                  {STEPS.map((s, i) => (
                    <li key={s.step} className="relative flex flex-col items-center text-center">
                      <span className={`h-4 w-4 rounded-full ring-4 ring-paper ${i === 0 ? 'bg-teal' : 'bg-linen-2'}`} />
                      <span className="num mt-2 text-xs text-faint">Day {s.day}</span>
                      <span className={`text-[13px] leading-tight ${i === 0 ? 'font-semibold text-ink' : 'text-muted'}`}>{s.short}</span>
                    </li>
                  ))}
                </ol>
              </Panel>
            </Step>

            <Step n={3} title="It knows when to stop" body="The moment they pay, reply, promise a date or dispute, the reminders stop. You only step in when it actually needs you.">
              <Panel lift as="div" className="p-5 sm:p-6">
                <ol className="relative flex flex-col gap-5 pl-7">
                  <span className="absolute top-2 bottom-2 left-[7px] w-0.5 bg-linen" aria-hidden="true" />
                  <TimelineItem dot="bg-linen-2" when="Mon">Reminder sent to Dana</TimelineItem>
                  <TimelineItem dot="bg-marigold" when="Tue">
                    Dana replied
                    <span className="mt-2 block rounded-block rounded-tl-tail bg-linen p-3 text-[15px] text-ink-2">So sorry! I’ll pay this on Friday.</span>
                  </TimelineItem>
                  <TimelineItem dot="bg-marigold" when="Tue">Promise noted. Reminders paused until Friday.</TimelineItem>
                  <TimelineItem dot="bg-teal" when="Fri">
                    <span className="font-semibold text-teal">Paid $1,240.</span> Case closed, nothing more goes out.
                  </TimelineItem>
                </ol>
              </Panel>
            </Step>
          </div>
        </section>

        {/* Who it's for */}
        <section id="who" className="bg-paper/60 py-24 lg:py-32">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10">
            <div className="reveal flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-2xl">
                <p className="text-sm font-semibold text-teal">Who it’s for</p>
                <h2 className="display mt-3 text-heading font-bold text-balance sm:text-title">Made for businesses that run on trust and a handshake.</h2>
              </div>
              <p className="max-w-sm text-muted">If you bill after the work is done, some of it slips. Recoup is for the amounts too small to fight over and too big to forget.</p>
            </div>
            <ul className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
              {TRADES.map((t) => (
                <li key={t.label} className="reveal group">
                  <div className="relative aspect-[3/4] overflow-hidden rounded-panel ring-1 ring-edge ring-inset">
                    <Image src={t.img} alt={t.alt} fill placeholder="blur" sizes="(min-width: 1024px) 270px, 45vw" className="zoom object-cover" />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 via-ink/40 to-transparent p-4 pt-16">
                      <span className="display block text-section font-bold text-sand">{t.label}</span>
                      <span className="block text-sm text-sand/85">{t.note}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Polite by design */}
        <section className="mx-auto max-w-6xl px-4 py-24 sm:px-6 lg:px-10 lg:py-32">
          <div className="reveal max-w-2xl">
            <p className="text-sm font-semibold text-teal">Polite by design</p>
            <h2 className="display mt-3 text-heading font-bold text-balance sm:text-title">Firm enough to get paid. Kind enough to keep the customer.</h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
            {PROMISES.map((p) => (
              <Panel key={p.title} as="div" className="reveal ease p-6 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-soft text-teal">
                  <Icon name={p.icon} />
                </span>
                <h3 className="mt-5 text-base font-semibold">{p.title}</h3>
                <p className="mt-1.5 text-muted">{p.body}</p>
              </Panel>
            ))}
          </div>
        </section>

        {/* Final call */}
        <section className="px-4 pb-24 sm:px-6 lg:px-10">
          <div className="reveal relative mx-auto max-w-6xl overflow-hidden rounded-pay">
            <Image src={openLate} alt="" fill placeholder="blur" sizes="(min-width: 1152px) 1152px, 100vw" className="object-cover" />
            <div className="relative bg-gradient-to-r from-ink via-ink/90 to-ink/50 px-6 py-16 sm:px-12 sm:py-20">
              <h2 className="display max-w-xl text-heading font-bold text-balance text-sand sm:text-title">Stop doing the awkward follow-ups yourself.</h2>
              <p className="mt-4 max-w-lg text-lead text-sand/85">Set it up in a few minutes. Free while we’re getting started.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/login" className={buttonClass('teal', 'lg')}>Start free</Link>
                <form action={startDemoAction}>
                  <SubmitButton variant="quiet" size="lg" pendingLabel="Setting up the demo…">Try the demo</SubmitButton>
                </form>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-10 sm:px-6 lg:px-10">
          <div>
            <span className="display text-section font-bold text-teal">recoup</span>
            <p className="mt-1 text-sm text-faint">Polite reminders for the invoices too small to chase.</p>
          </div>
          <nav className="flex flex-wrap gap-6 text-sm text-muted">
            <Link href="/login" className="hover:text-ink">Sign in</Link>
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Step({ n, title, body, flip = false, children }: { n: number; title: string; body: string; flip?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-20">
      <div className={`reveal ${flip ? 'lg:order-2' : ''}`}>
        <span className="display num flex h-11 w-11 items-center justify-center rounded-full bg-ink text-base font-bold text-sand">{n}</span>
        <h3 className="display mt-5 text-section font-bold sm:text-heading">{title}</h3>
        <p className="mt-3 max-w-md text-lead text-muted">{body}</p>
      </div>
      <div className={`reveal-mock ${flip ? 'lg:order-1' : ''}`}>{children}</div>
    </div>
  );
}

function TimelineItem({ dot, when, children }: { dot: string; when: string; children: React.ReactNode }) {
  return (
    <li className="relative">
      <span className={`absolute top-1.5 -left-7 h-4 w-4 rounded-full ring-4 ring-paper ${dot}`} aria-hidden="true" />
      <span className="num block text-xs text-faint">{when}</span>
      <span className="block text-[15px]">{children}</span>
    </li>
  );
}
