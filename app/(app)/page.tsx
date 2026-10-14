import Link from 'next/link';
import { ColumnChart } from '@/app/components/ColumnChart';
import { Icon } from '@/app/components/icons';
import { Avatar, ButtonLink, Empty, Panel, StatePill } from '@/app/components/ui';
import { requireBusiness } from '@/lib/auth';
import { CASE_LABELS, formatDateLong, formatDateTime, money, moneyShort, plural } from '@/lib/format';
import { listInstallments, listMessagesByStatus } from '@/lib/repo';
import { STEPS } from '@/lib/sequence';
import { allCustomerSummaries, breakdowns, overview, type CustomerState } from '@/lib/service';
import { getNow, getSettings } from '@/lib/settings';
import { DAY, localDate, localParts } from '@/lib/time';

export const dynamic = 'force-dynamic';

const AGING_COLORS = ['var(--color-aging-1)', 'var(--color-aging-2)', 'var(--color-aging-3)', 'var(--color-aging-4)'];

/** Where owed money sits, in the order an owner cares about it. */
const STATE_ORDER: { state: CustomerState; color: string; hint: string }[] = [
  { state: 'active', color: 'bg-teal', hint: 'Recoup is reminding' },
  { state: 'needs_you', color: 'bg-marigold', hint: 'Waiting on your reply' },
  { state: 'promised', color: 'bg-marigold-soft', hint: 'Promised a date' },
  { state: 'plan', color: 'bg-teal/45', hint: 'Paying in parts' },
  { state: 'disputed', color: 'bg-rust', hint: 'Needs sorting out' },
  { state: 'not_due', color: 'bg-linen-2', hint: 'Not overdue yet' },
  { state: 'not_chasing', color: 'bg-linen-2', hint: 'You’re handling it' },
  { state: 'paused', color: 'bg-linen-2', hint: 'Paused by you' },
  { state: 'unreachable', color: 'bg-linen-2', hint: 'No way to reach them' },
];

function greeting(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function Metric({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'teal' | 'marigold' }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 bg-paper px-5 py-5 sm:px-6">
      <span className="text-sm text-muted">{label}</span>
      <span className={`display num text-heading font-bold ${tone === 'teal' ? 'text-teal' : tone === 'marigold' ? 'text-marigold-ink' : ''}`}>{value}</span>
      {sub && <span className="text-sm text-faint">{sub}</span>}
    </div>
  );
}

export default async function Today() {
  await requireBusiness();
  const now = getNow();
  const { timezone, senderName } = getSettings();
  const o = overview(now);
  const b = breakdowns(now);
  const summaries = allCustomerSummaries(now);
  const byId = new Map(summaries.map((s) => [s.customer.id, s]));
  const ready = listMessagesByStatus(['ready']);
  const needsYou = summaries.filter((s) => s.openCase?.needsAttention || s.state === 'disputed' || s.state === 'needs_you');

  if (summaries.length === 0) {
    return (
      <Empty title="Let’s get your money back" action={<ButtonLink href="/import" variant="primary" icon="upload">Import invoices</ButtonLink>}>
        Import a spreadsheet of invoices. Include paid ones too, and Recoup learns how each customer usually pays.
      </Empty>
    );
  }

  // Money expected in the next two weeks: promised dates and plan payments falling due.
  const horizon = now + 14 * DAY;
  const horizonDate = localDate(horizon, timezone);
  let expectedCents = 0;
  let expectedCount = 0;
  for (const s of summaries) {
    if (s.state === 'promised' && s.openCase?.promiseDate && s.openCase.promiseDate <= horizonDate) {
      expectedCents += s.overdueCents || s.owedCents;
      expectedCount++;
    }
    if (s.state === 'plan' && s.openCase) {
      for (const i of listInstallments(s.openCase.id)) {
        if (!i.paidAt && i.dueAt <= horizon) {
          expectedCents += i.amountCents;
          expectedCount++;
        }
      }
    }
  }

  const thisMonth = o.months[o.months.length - 1];
  const lastMonth = o.months[o.months.length - 2];
  const delta = thisMonth.cents - lastMonth.cents;
  const overdueInvoices = o.aging.reduce((n, a) => n + a.count, 0);

  const owing = summaries.filter((s) => s.owedCents > 0);
  const where = STATE_ORDER.map((row) => {
    const group = owing.filter((s) => s.state === row.state);
    return { ...row, cents: group.reduce((sum, s) => sum + s.owedCents, 0), count: group.length };
  }).filter((r) => r.cents > 0);
  const whereTotal = where.reduce((sum, r) => sum + r.cents, 0);

  const soon = now + 7 * DAY;
  const comingUp = summaries
    .flatMap((s) => {
      if (s.state === 'promised' && s.openCase?.promiseDate) {
        return [{ at: Date.parse(`${s.openCase.promiseDate}T17:00:00Z`), s, text: `Promised to pay ${money(s.overdueCents || s.owedCents)}` }];
      }
      if (s.next && s.next.at <= soon) return [{ at: s.next.at, s, text: s.next.label }];
      return [];
    })
    .sort((a, z) => a.at - z.at);

  return (
    <div className="flex flex-col gap-6">
      <header className="max-w-3xl pb-2">
        <h1 className="display text-title font-bold">
          {greeting(localParts(now, timezone).hour)}
          {senderName ? `, ${senderName}` : ''}.
        </h1>
        <p className="mt-2 text-lead leading-relaxed text-pretty text-muted">
          Customers owe you <strong className="num font-semibold text-ink">{money(o.owedCents)}</strong>.{' '}
          <strong className="num font-semibold text-teal">{money(o.recoveredThisMonth)}</strong> came back this month.{' '}
          {ready.length ? (
            <>
              <strong className="font-semibold text-ink">{plural(ready.length, 'message')}</strong> {ready.length === 1 ? 'is' : 'are'} ready to send
            </>
          ) : (
            'Nothing is waiting to send'
          )}
          {needsYou.length ? (
            <>
              , and <strong className="font-semibold text-ink">{plural(needsYou.length, 'customer')}</strong> {needsYou.length === 1 ? 'needs' : 'need'} you.
            </>
          ) : (
            ', and nobody needs you right now.'
          )}
        </p>
      </header>

      {/* ------------------------------------------------ the numbers */}
      <Panel className="overflow-clip">
        <div className="grid grid-cols-2 gap-px bg-linen sm:grid-cols-3 xl:grid-cols-6">
          <Metric label="Owed right now" value={moneyShort(o.owedCents)} sub={plural(o.owingCustomers, 'customer')} />
          <Metric label="Overdue" value={moneyShort(o.overdueCents)} sub={plural(overdueInvoices, 'invoice')} tone={o.overdueCents ? 'marigold' : undefined} />
          <Metric
            label={`Recovered in ${thisMonth.label}`}
            value={moneyShort(thisMonth.cents)}
            tone="teal"
            sub={
              lastMonth.cents || thisMonth.cents ? (
                <span className="inline-flex items-center gap-1">
                  <Icon name="arrowRight" size={13} className={delta >= 0 ? '-rotate-45 text-teal' : 'rotate-45 text-marigold-ink'} />
                  {moneyShort(Math.abs(delta))} {delta >= 0 ? 'more' : 'less'} than {lastMonth.label}
                </span>
              ) : (
                'Nothing yet'
              )
            }
          />
          <Metric label="Recovery rate" value={`${Math.round(o.recoveryRate * 100)}%`} sub="of everything chased" />
          <Metric label="Typical time to get paid" value={b.avgDaysToRecover === null ? '—' : plural(b.avgDaysToRecover, 'day')} sub="after the first reminder" />
          <Metric label="Expected in 2 weeks" value={moneyShort(expectedCents)} sub={expectedCount ? 'From promises and plan payments' : 'No promises yet'} />
        </div>
      </Panel>

      {/* ------------------------------------------------ the charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="p-6 sm:p-7">
          <div className="mb-5">
            <h2 className="display text-section font-bold">Recovered</h2>
            <p className="text-sm text-muted">
              <span className="num">{moneyShort(o.recoveredAll)}</span> since you started
            </p>
          </div>
          <ColumnChart label="Money recovered each month" data={o.months.map((m) => ({ label: m.label, value: m.cents / 100, display: money(m.cents) }))} highlightLast />
        </Panel>

        <Panel className="p-6 sm:p-7">
          <div className="mb-5">
            <h2 className="display text-section font-bold">How late it is</h2>
            <p className="text-sm text-muted">
              <span className="num">{money(o.overdueCents)}</span> overdue
              {o.notDueCents ? (
                <>
                  {' '}· <span className="num">{money(o.notDueCents)}</span> not due yet
                </>
              ) : null}
            </p>
          </div>
          <ColumnChart
            label="Overdue money by how many days late"
            data={o.aging.map((a, i) => ({ label: a.label.replace(' days', 'd'), value: a.cents / 100, display: `${money(a.cents)} · ${plural(a.count, 'invoice')}`, color: AGING_COLORS[i] }))}
          />
        </Panel>

        <Panel className="p-6 sm:p-7">
          <div className="mb-5">
            <h2 className="display text-section font-bold">Where the money is</h2>
            <p className="text-sm text-muted">What’s happening with each dollar owed</p>
          </div>
          {where.length === 0 ? (
            <p className="text-muted">Nothing is owed right now.</p>
          ) : (
            <>
              <div className="mb-5 flex h-3 gap-[2px] overflow-hidden rounded-full" role="img" aria-label="Owed money by status">
                {where.map((r) => (
                  <span key={r.state} className={r.color} style={{ width: `${(r.cents / whereTotal) * 100}%` }} title={`${CASE_LABELS[r.state]}: ${money(r.cents)}`} />
                ))}
              </div>
              {/* The hint shows only when the panel can hold it whole; otherwise it's the link's tooltip. */}
              <ul className="@container flex flex-col gap-2.5">
                {where.map((r) => (
                  <li key={r.state} className="flex items-center gap-3 text-sm">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${r.color}`} aria-hidden="true" />
                    <Link href={`/customers?state=${r.state}`} title={r.hint} className="min-w-0 flex-1 truncate hover:underline">
                      <span className="font-semibold">{CASE_LABELS[r.state]}</span> <span className="hidden text-faint @lg:inline">· {r.hint}</span>
                    </Link>
                    <span className="num hidden text-right text-muted sm:inline">{plural(r.count, 'customer')}</span>
                    <span className="num w-24 text-right font-semibold">{money(r.cents)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Panel>
      </div>

      {/* ------------------------------------------------ what needs doing */}
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        <Panel className="p-6 sm:p-7">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="display text-section font-bold">Ready to send</h2>
            {ready.length > 0 && (
              <Link href="/send" className="text-sm font-semibold text-teal hover:underline">
                Open the send queue
              </Link>
            )}
          </div>
          {ready.length === 0 ? (
            <p className="text-muted">You’re all caught up. New reminders appear here when they’re due.</p>
          ) : (
            <ul className="-mx-3 flex flex-col">
              {ready.slice(0, 5).map((m) => {
                const s = byId.get(m.customerId)!;
                const label = m.step ? STEPS.find((x) => x.step === m.step)!.label : m.actionKey?.startsWith('installment') ? 'Payment plan reminder' : 'Payment plan offer';
                return (
                  <li key={m.id}>
                    <Link href={`/customers/${m.customerId}`} className="ease flex items-center gap-4 rounded-block px-3 py-3 hover:bg-linen/60">
                      <Avatar name={s.customer.name} type={s.customer.type} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-semibold">{s.customer.name}</span>
                          <span className="num text-sm text-muted">{money(s.overdueCents || s.owedCents)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-muted">
                          <Icon name={m.channel === 'email' ? 'mail' : 'message'} size={15} />
                          {label} · {m.tone}
                        </div>
                      </div>
                      <span className="hidden text-sm font-semibold text-teal sm:inline">Review & send</span>
                      <Icon name="chevronRight" className="text-faint" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel className="p-6 sm:p-7">
          <h2 className="display mb-4 text-section font-bold">Needs you</h2>
          {needsYou.length === 0 ? (
            <p className="text-muted">No replies or disputes waiting on you.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {needsYou.map((s) => (
                <li key={s.customer.id}>
                  <Link href={`/customers/${s.customer.id}`} className="ease group -m-3 block rounded-block p-3 hover:bg-linen/60">
                    <div className="flex items-center gap-3">
                      <Avatar name={s.customer.name} type={s.customer.type} size={36} />
                      <span className="font-semibold group-hover:underline">{s.customer.name}</span>
                      <span className="ml-auto">
                        <StatePill state={s.state} />
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-ink-2">{s.openCase?.attentionReason ?? 'Waiting on you'}</p>
                    {s.lastReply && <p className="mt-2 rounded-block rounded-tl-tail bg-linen px-3.5 py-2.5 text-sm text-ink-2">“{s.lastReply}”</p>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="p-6 sm:p-7 lg:col-span-2 xl:col-span-1">
          <h2 className="display mb-4 text-section font-bold">Coming up</h2>
          {comingUp.length === 0 ? (
            <p className="text-muted">Nothing scheduled this week.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {comingUp.slice(0, 7).map(({ at, s, text }) => (
                <li key={`${s.customer.id}-${at}`} className="flex gap-3">
                  <span className="num w-16 shrink-0 pt-0.5 text-sm text-faint">
                    {s.state === 'promised' && s.openCase?.promiseDate ? formatDateLong(s.openCase.promiseDate).split(',')[0] : formatDateTime(at, timezone).split(',')[0]}
                  </span>
                  <span className="min-w-0 text-sm">
                    <Link href={`/customers/${s.customer.id}`} className="font-semibold hover:underline">
                      {s.customer.name}
                    </Link>
                    <span className="block text-muted">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
