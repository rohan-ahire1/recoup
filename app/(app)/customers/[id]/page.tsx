import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  doNotChaseAction,
  handledAction,
  markInvoicePaidAction,
  pauseAction,
  recordPaymentAction,
  resumeAction,
  setToneAction,
  simulatePaymentAction,
  writeOffAction,
} from '@/app/actions';
import { AutoSubmitForm } from '@/app/components/AutoSubmit';
import { CopyButton } from '@/app/components/CopyButton';
import { ExpandDialog } from '@/app/components/ExpandDialog';
import { Icon } from '@/app/components/icons';
import { ReplyForm } from '@/app/components/ReplyForm';
import { SendPanel } from '@/app/components/SendPanel';
import { StoryFilter } from '@/app/components/StoryFilter';
import { SubmitButton } from '@/app/components/SubmitButton';
import { Avatar, Chip, Panel, StatePill, TrackDots } from '@/app/components/ui';
import { aiEnabled } from '@/lib/ai';
import { requireBusiness } from '@/lib/auth';
import { formatDateLong, formatDateTime, formatPhone, formatShortDate, money, plural } from '@/lib/format';
import { isDemoMode, providerStatus } from '@/lib/providers';
import { getCustomer, listCustomerInvoices, listCustomerMessages, listEvents, listInstallments, listTemplateSets } from '@/lib/repo';
import { STEPS } from '@/lib/sequence';
import { summarizeCustomer } from '@/lib/service';
import { getNow, getSettings } from '@/lib/settings';
import { firstName as firstNameOf, payLink } from '@/lib/templates';
import { daysBetween, localDate } from '@/lib/time';
import type { CustomerEvent, Invoice, Message } from '@/lib/types';

export const dynamic = 'force-dynamic';

const HIDDEN_EVENTS = new Set(['prepared', 'sent', 'customer_added']);
const EVENT_DOT: Record<string, string> = {
  payment: 'bg-teal',
  resolved: 'bg-teal',
  promised: 'bg-marigold',
  promise_missed: 'bg-marigold',
  claims_paid: 'bg-marigold',
  disputed: 'bg-rust',
  replied: 'bg-marigold',
  wants_plan: 'bg-marigold',
};

type StoryItem = { at: number; kind: 'message'; m: Message } | { at: number; kind: 'event'; e: CustomerEvent };

const STORY_PREVIEW = 6;
const MONEY_EVENTS = new Set(['payment', 'resolved', 'plan', 'written_off', 'invoice_added', 'case_opened']);
const kindOf = (it: StoryItem) => (it.kind === 'message' ? 'message' : MONEY_EVENTS.has(it.e.type) ? 'money' : 'event');

function InvoiceActions({ id, number }: { id: number; number: string }) {
  return (
    <span className="flex gap-1">
      <form action={markInvoicePaidAction}>
        <input type="hidden" name="invoiceId" value={id} />
        <SubmitButton variant="ghost" size="sm" pendingLabel="…">Mark paid</SubmitButton>
      </form>
      <form action={writeOffAction}>
        <input type="hidden" name="invoiceId" value={id} />
        <SubmitButton variant="ghost" size="sm" confirm={`Write off invoice #${number}? Reminders for it stop.`} pendingLabel="…">Write off</SubmitButton>
      </form>
    </span>
  );
}

/** Every invoice for one customer: a full table on wide screens, cards on phones. */
function InvoiceTable({ invoices, today }: { invoices: Invoice[]; today: string }) {
  const rows = invoices.map((i) => {
    const isOpen = (i.status === 'open' || i.status === 'disputed') && i.amountCents > i.amountPaidCents;
    const late = i.paidDate ? daysBetween(i.dueDate, i.paidDate) : isOpen ? daysBetween(i.dueDate, today) : 0;
    const status =
      i.status === 'paid'
        ? i.paidDate
          ? late > 2 ? `Paid ${plural(late, 'day')} late` : 'Paid on time'
          : 'Paid'
        : i.status === 'written_off'
          ? 'Written off'
          : i.status === 'disputed'
            ? 'Disputed'
            : late > 0
              ? `${plural(late, 'day')} overdue`
              : 'Not due yet';
    const tone = i.status === 'paid' ? (late > 2 ? 'text-marigold-ink' : 'text-teal') : isOpen && late > 0 ? 'font-semibold text-marigold-ink' : 'text-muted';
    return { i, isOpen, status, tone };
  });
  return (
    <>
      <table className="hidden w-full text-left md:table">
        <thead className="sticky -top-5 z-10 bg-paper text-sm text-muted">
          <tr className="border-b border-linen">
            <th scope="col" className="py-2.5 pr-3 font-normal">Invoice</th>
            <th scope="col" className="px-3 py-2.5 font-normal">For</th>
            <th scope="col" className="px-3 py-2.5 font-normal">Issued</th>
            <th scope="col" className="px-3 py-2.5 font-normal">Due</th>
            <th scope="col" className="px-3 py-2.5 text-right font-normal">Amount</th>
            <th scope="col" className="px-3 py-2.5 font-normal">Paid</th>
            <th scope="col" className="px-3 py-2.5 font-normal">Status</th>
            <th scope="col" className="py-2.5 pl-3"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-linen">
          {rows.map(({ i, isOpen, status, tone }) => (
            <tr key={i.id}>
              <td className="num py-3 pr-3 text-sm text-faint">#{i.number}</td>
              <td className="max-w-64 truncate px-3 py-3">{i.description ?? '—'}</td>
              <td className="num px-3 py-3 text-sm text-muted">{i.issuedDate ? formatShortDate(i.issuedDate) : '—'}</td>
              <td className="num px-3 py-3 text-sm text-muted">{formatShortDate(i.dueDate)}</td>
              <td className="num px-3 py-3 text-right font-semibold">{money(i.amountCents)}</td>
              <td className="num px-3 py-3 text-sm text-muted">{i.paidDate ? formatShortDate(i.paidDate) : i.amountPaidCents ? `${money(i.amountPaidCents)} so far` : '—'}</td>
              <td className={`px-3 py-3 text-sm ${tone}`}>{status}</td>
              <td className="py-3 pl-3 text-right">{isOpen && <InvoiceActions id={i.id} number={i.number} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y divide-linen md:hidden">
        {rows.map(({ i, isOpen, status, tone }) => (
          <li key={i.id} className="py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">{i.description ?? 'Invoice'}</span>
              <span className="num font-semibold">{money(i.amountCents)}</span>
            </div>
            <div className="text-sm text-muted">
              <span className="num">#{i.number} · due {formatShortDate(i.dueDate)}</span> · <span className={tone}>{status}</span>
            </div>
            {isOpen && <div className="-ml-3 mt-1"><InvoiceActions id={i.id} number={i.number} /></div>}
          </li>
        ))}
      </ul>
    </>
  );
}

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireBusiness();
  const { id } = await params;
  const customer = getCustomer(Number(id));
  if (!customer) notFound();
  const now = getNow();
  const { timezone } = getSettings();
  const s = summarizeCustomer(customer, now);
  const c = s.openCase;
  const first = firstNameOf(customer);
  const invoices = listCustomerInvoices(customer.id);
  const t = localDate(now, timezone);
  const open = invoices
    .filter((i) => (i.status === 'open' || i.status === 'disputed') && i.amountCents > i.amountPaidCents)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const paid = invoices.filter((i) => i.status === 'paid');
  const sets = listTemplateSets();
  const ai = aiEnabled();
  const providers = providerStatus();
  const canSendNow = s.ready ? (s.ready.channel === 'email' ? providers.email !== 'mock' : providers.sms !== 'mock') : false;
  const installments = c ? listInstallments(c.id) : [];

  const story: StoryItem[] = [
    ...listCustomerMessages(customer.id)
      .filter((m) => m.status === 'sent' || m.status === 'received' || m.status === 'failed')
      .map((m) => ({ at: m.sentAt ?? m.createdAt, kind: 'message' as const, m })),
    ...listEvents(customer.id)
      .filter((e) => !HIDDEN_EVENTS.has(e.type))
      .map((e) => ({ at: e.createdAt, kind: 'event' as const, e })),
  ]
    .sort((a, b) => b.at - a.at);
  const openList = invoices.filter((i) => (i.status === 'open' || i.status === 'disputed') && i.amountCents > i.amountPaidCents).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  /** The timeline. The preview clamps long emails; the full story in the dialog shows them whole. */
  const storyList = (items: StoryItem[], full: boolean) => (
    <ol>
      {items.map((it) => (
        <li key={`${it.kind}${it.kind === 'message' ? it.m.id : it.e.id}`} data-kind={kindOf(it)} className="group/item flex gap-4">
          <div className="flex w-5 shrink-0 flex-col items-center pt-[7px]">
            <span
              className={`h-3 w-3 shrink-0 rounded-full ${
                it.kind === 'message'
                  ? it.m.direction === 'inbound'
                    ? 'ring-2 ring-marigold ring-inset'
                    : 'ring-2 ring-teal ring-inset'
                  : EVENT_DOT[it.e.type] ?? 'bg-linen-2'
              }`}
            />
            <span className="mt-1.5 w-0.5 flex-1 bg-linen group-last/item:hidden" />
          </div>
          <div className="min-w-0 flex-1 pb-6 group-last/item:pb-0">
            {it.kind === 'event' ? (
              <div className="flex flex-wrap justify-between gap-x-4">
                <span className="text-ink-2">{it.e.detail}</span>
                <span className="num text-sm text-faint">{formatDateTime(it.at, timezone)}</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap justify-between gap-x-4">
                  <span className="font-semibold">
                    {it.m.direction === 'inbound'
                      ? `${first} replied${it.m.channel === 'phone' ? ' on the phone' : it.m.channel === 'sms' ? ' by text' : ''}`
                      : `You ${it.m.channel === 'sms' ? 'texted' : 'emailed'} ${first}${it.m.tone ? `, ${it.m.tone.toLowerCase()} tone` : ''}`}
                    {it.m.status === 'failed' && <span className="ml-2 text-sm font-normal text-rust">Failed: {it.m.error}</span>}
                  </span>
                  <span className="num text-sm text-faint">{formatDateTime(it.at, timezone)}</span>
                </div>
                <div
                  className={`max-w-[62ch] px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] ${
                    it.m.direction === 'inbound' ? 'self-start rounded-[16px_4px_16px_16px] bg-linen text-ink' : 'rounded-[4px_16px_16px_16px] bg-linen/50 text-ink-2'
                  }`}
                >
                  {it.m.subject && <span className="mb-1 block font-semibold text-ink">{it.m.subject}</span>}
                  <span className={it.m.direction === 'outbound' && !full ? 'line-clamp-4' : ''}>{it.m.body}</span>
                </div>
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );

  const stepInfo = s.ready?.step ? STEPS.find((x) => x.step === s.ready!.step) : null;
  const readyLabel = stepInfo?.label ?? (s.ready?.actionKey?.startsWith('installment') ? 'Payment plan reminder' : 'Payment plan offer');
  const selectedSet = customer.templateSetId ?? 'default';
  const input = 'mt-1 block h-11 w-full rounded-[var(--radius-control)] bg-paper px-3 font-normal ring-1 ring-line ring-inset focus:ring-teal';

  return (
    <div>
      <Link href="/customers" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <Icon name="arrowLeft" size={16} /> All customers
      </Link>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* ------------------------------------------------ who they are */}
        <aside className="sticky-side flex min-w-0 flex-col gap-4 self-start">
          <Panel className="flex flex-col gap-5 p-6">
            <Avatar name={customer.name} type={customer.type} size={60} />
            <div>
              <h1 className="display text-[28px] leading-[1.08] font-bold text-balance">{customer.name}</h1>
              <p className="mt-1.5 text-muted">
                {customer.type === 'business' ? 'Business' : 'Individual'}
                {paid.length ? ` · customer since ${new Date(`${paid[paid.length - 1].dueDate}T12:00:00Z`).getUTCFullYear()}` : ''}
              </p>
            </div>
            <dl className="flex flex-col gap-3 text-sm">
              {customer.contactName && (
                <div>
                  <dt className="text-faint">Contact</dt>
                  <dd>{customer.contactName}</dd>
                </div>
              )}
              <div>
                <dt className="text-faint">Email</dt>
                <dd className="break-words">{customer.email ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-faint">Phone</dt>
                <dd className="num">{customer.phone ? formatPhone(customer.phone) : '—'}</dd>
                {customer.optedOutSms && <dd className="mt-0.5 text-xs text-rust">Opted out of texts</dd>}
              </div>
              <div>
                <dt className="text-faint">Prefers</dt>
                <dd>{customer.preferredChannel === 'email' ? 'Email' : 'Text'}</dd>
              </div>
            </dl>
            {customer.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {customer.tags.map((tag) => (
                  <Link key={tag} href={`/customers?tag=${encodeURIComponent(tag)}`}>
                    <Chip>{tag}</Chip>
                  </Link>
                ))}
              </div>
            )}
            {customer.notes && <p className="rounded-2xl bg-linen/60 px-4 py-3 text-sm text-ink-2">{customer.notes}</p>}
            <Link href={`/customers/${customer.id}/edit`} className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-teal hover:underline">
              <Icon name="edit" size={15} /> Edit details
            </Link>
          </Panel>

          <Panel className="bg-teal! p-6 text-sand">
            <div className="text-sm text-sand/85">{s.owedCents ? 'Owed right now' : 'Owes nothing right now'}</div>
            <div className="display num mt-1 text-[48px] leading-none font-bold">{money(s.owedCents).replace(/\.00$/, '')}</div>
            {open.length > 0 && (
              <ul className="mt-4 flex flex-col gap-1.5 text-sm text-sand/90">
                {open.map((i) => {
                  const late = daysBetween(i.dueDate, t);
                  return (
                    <li key={i.id} className="flex justify-between gap-3">
                      <span className="truncate">#{i.number} · {i.description ?? 'Invoice'}</span>
                      <span className="num shrink-0">{late > 0 ? `${late}d late` : `due ${formatShortDate(i.dueDate)}`}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {s.recoveredCents > 0 && <p className="mt-4 border-t border-sand/20 pt-3 text-sm text-sand/85">Recoup has brought back <span className="num font-semibold text-sand">{money(s.recoveredCents)}</span> from {first}.</p>}
          </Panel>

          <Panel className="flex flex-col gap-3 p-6">
            <p className="display text-[19px] leading-snug font-semibold text-pretty">{s.summaryLine}</p>
            <TrackDots lateness={s.record.lateness} open={open.filter((i) => i.dueDate < t).length} />
            <p className="text-sm text-muted">
              {s.record.paidCount ? (
                <>
                  {s.record.onTimeCount} of {s.record.paidCount} paid on time.
                  {s.record.lateCount ? ` When late, about ${s.record.avgDaysLate} days.` : ''}
                </>
              ) : (
                'Import paid invoices to see how they usually pay.'
              )}
            </p>
          </Panel>
        </aside>

        {/* ------------------------------------------------ what happens next */}
        <div className="flex min-w-0 flex-col gap-6">
        <Panel lift className="p-6 sm:p-7">
          <div className={`grid gap-6 ${s.ready || installments.length ? '2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]' : ''}`}>
          <div className="flex min-w-0 flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="display text-[22px] leading-tight font-bold">
                {s.ready ? `Next up: ${readyLabel.toLowerCase()}` : s.state === 'clear' ? 'All paid up' : 'What’s happening'}
              </h2>
              <p className="mt-1 text-muted">
                {s.ready
                  ? `${stepInfo ? `Step ${stepInfo.step} of ${STEPS.length} · ` : ''}ready now, covers ${plural(open.filter((i) => i.caseId === c?.id).length, 'invoice')}`
                  : s.state === 'promised' && c?.promiseDate
                    ? `${first} promised to pay by ${formatDateLong(c.promiseDate)}. Reminders wait until then.`
                    : s.state === 'needs_you' || s.state === 'disputed'
                      ? c?.attentionReason
                      : s.state === 'plan'
                        ? `${first} is paying in ${installments.length} parts.`
                        : s.state === 'not_chasing'
                          ? 'You’re handling this one personally.'
                          : s.state === 'not_due'
                            ? 'Nothing is overdue yet. Reminders start the day after it’s due.'
                            : s.state === 'unreachable'
                              ? 'No email or phone to reach them.'
                              : s.next
                                ? `${s.next.label}, ${formatDateTime(s.next.at, timezone)}`
                                : c
                                  ? 'All reminders sent. Time for a personal call, or write it off.'
                                  : `Nothing owed. ${s.record.paidCount ? `${plural(s.record.paidCount, 'invoice')} paid so far.` : ''}`}
              </p>
            </div>
            <StatePill state={s.state} />
          </div>

          {(s.ready || (c && s.state === 'active')) && (
            <AutoSubmitForm action={setToneAction}>
              <input type="hidden" name="customerId" value={customer.id} />
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">How should it sound?</legend>
                <div className="grid grid-cols-2 gap-2">
                  <label className="ease col-span-2 flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-3.5 py-2.5 ring-1 ring-line ring-inset has-[:checked]:bg-teal-soft has-[:checked]:ring-2 has-[:checked]:ring-teal">
                    <input type="radio" name="templateSetId" value="default" defaultChecked={selectedSet === 'default'} className="sr-only" />
                    <Icon name="sparkle" size={16} className="text-teal" />
                    <span className="text-sm">
                      <span className="font-semibold">Auto</span> <span className="text-muted">· {s.tone.auto ? `${s.tone.set.name}, based on how ${first} pays` : `your default (${s.tone.set.name})`}</span>
                    </span>
                  </label>
                  {sets.map((set) => (
                    <label
                      key={set.id}
                      className="ease flex cursor-pointer flex-col rounded-[var(--radius-control)] px-3.5 py-2.5 ring-1 ring-line ring-inset has-[:checked]:bg-teal-soft has-[:checked]:ring-2 has-[:checked]:ring-teal"
                    >
                      <input type="radio" name="templateSetId" value={set.id} defaultChecked={selectedSet === set.id} className="sr-only" />
                      <span className="font-semibold">{set.name}</span>
                      <span className="text-[13px] leading-snug text-muted">{set.description ?? 'Your own template'}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </AutoSubmitForm>
          )}



          {c && (
            <div className="flex flex-wrap gap-2">
              {['paused', 'needs_you', 'promised', 'disputed', 'unreachable'].includes(c.status) && (
                <form action={resumeAction}>
                  <input type="hidden" name="customerId" value={customer.id} />
                  <SubmitButton variant={s.ready ? 'quiet' : 'primary'} size="sm" icon="play" pendingLabel="Resuming…">
                    {c.status === 'disputed' ? 'Sorted out, resume' : 'Resume reminders'}
                  </SubmitButton>
                </form>
              )}
              {c.needsAttention && c.status !== 'needs_you' && (
                <form action={handledAction}>
                  <input type="hidden" name="customerId" value={customer.id} />
                  <SubmitButton size="sm" icon="check" pendingLabel="…">Mark handled</SubmitButton>
                </form>
              )}
              {c.status === 'active' && (
                <form action={pauseAction}>
                  <input type="hidden" name="customerId" value={customer.id} />
                  <SubmitButton variant="ghost" size="sm" icon="pause" pendingLabel="Pausing…">Pause</SubmitButton>
                </form>
              )}
            </div>
          )}

          {s.owedCents > 0 && (
            <div className="flex flex-col divide-y divide-linen border-t border-linen">
              <details className="group py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                  <span className="flex items-center gap-2"><Icon name="message" size={17} /> Log a reply from {first}</span>
                  <Icon name="chevronDown" size={16} className="ease text-faint group-open:rotate-180" />
                </summary>
                <div className="pt-4">
                  <ReplyForm customerId={customer.id} firstName={first} aiEnabled={ai} defaultChannel={customer.preferredChannel} />
                </div>
              </details>
              <details className="group py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                  <span className="flex items-center gap-2"><Icon name="card" size={17} /> Record a payment</span>
                  <Icon name="chevronDown" size={16} className="ease text-faint group-open:rotate-180" />
                </summary>
                <form action={recordPaymentAction} className="flex flex-wrap items-end gap-2 pt-4 text-sm font-semibold">
                  <input type="hidden" name="customerId" value={customer.id} />
                  <label className="flex-1">
                    Amount
                    <input name="amount" required inputMode="decimal" defaultValue={(s.owedCents / 100).toFixed(2)} className={`${input} num`} />
                  </label>
                  <label className="flex-1">
                    How
                    <select name="method" className={input}>
                      <option value="check">Check</option>
                      <option value="cash">Cash</option>
                      <option value="bank transfer">Bank transfer</option>
                      <option value="card">Card</option>
                    </select>
                  </label>
                  <SubmitButton variant="primary" pendingLabel="Saving…">Record</SubmitButton>
                </form>
              </details>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted">Payment page</span>
                  <Link href={`/pay/${customer.payToken}`} target="_blank" className="font-semibold text-teal hover:underline">Open</Link>
                  <CopyButton text={payLink(customer.payToken)} label="Copy link" size="sm" variant="ghost" />
                </div>
                <form action={doNotChaseAction}>
                  <input type="hidden" name="customerId" value={customer.id} />
                  <input type="hidden" name="on" value={customer.doNotChase ? '0' : '1'} />
                  <SubmitButton variant="ghost" size="sm" icon="hand" pendingLabel="…">
                    {customer.doNotChase ? 'Start reminding again' : 'Don’t chase'}
                  </SubmitButton>
                </form>
              </div>
              {isDemoMode() && c && (
                <form action={simulatePaymentAction} className="pt-3">
                  <input type="hidden" name="customerId" value={customer.id} />
                  <SubmitButton variant="outline" size="sm" pendingLabel="Paying…">Demo: {first} pays online</SubmitButton>
                </form>
              )}
            </div>
          )}
          </div>
          {(s.ready || installments.length > 0) && (
            <div className="flex min-w-0 flex-col gap-5">
              {s.ready && (
                <SendPanel
                  draft={{ id: s.ready.id, channel: s.ready.channel as 'email' | 'sms', toAddr: s.ready.toAddr, subject: s.ready.subject, body: s.ready.body, label: readyLabel }}
                  canSendNow={canSendNow}
                  aiEnabled={ai}
                />
              )}
              {s.state === 'plan' && installments.length > 0 && (
                <ul className="divide-y divide-linen rounded-2xl ring-1 ring-line">
                  {installments.map((i) => (
                    <li key={i.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span>Payment {i.seq} · {formatDateTime(i.dueAt, timezone).split(',')[0]}</span>
                      <span className="num font-semibold">
                        {money(i.amountCents)} {i.paidAt ? <span className="ml-1 font-normal text-teal">Paid</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          </div>
        </Panel>

        {/* ------------------------------------------------ the story */}
          <Panel className="p-6 sm:p-7">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="display text-[22px] font-bold">The story so far</h2>
              <span className="text-sm text-muted">{story.length > STORY_PREVIEW ? `Latest ${STORY_PREVIEW} of ${story.length}` : plural(story.length, 'entry', 'entries')}</span>
            </div>
            {story.length === 0 ? (
              <p className="text-muted">Nothing here yet.</p>
            ) : (
              <>
                {storyList(story.slice(0, STORY_PREVIEW), false)}
                {story.length > STORY_PREVIEW && (
                  <ExpandDialog
                    label={`See the full story · ${story.length} entries`}
                    title={`The story with ${customer.name}`}
                    subtitle={`Every message, reply, promise and payment, newest first.`}
                  >
                    <StoryFilter counts={{ all: story.length, message: story.filter((x) => kindOf(x) === 'message').length, money: story.filter((x) => kindOf(x) === 'money').length }}>
                      {storyList(story, true)}
                    </StoryFilter>
                  </ExpandDialog>
                )}
              </>
            )}
          </Panel>

          <Panel className="p-6 sm:p-7">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="display text-[22px] font-bold">{openList.length ? 'Open invoices' : 'Invoices'}</h2>
              <span className="text-sm text-muted">
                {openList.length ? `${plural(openList.length, 'invoice')} · ${money(s.owedCents)}` : 'Nothing open'}
              </span>
            </div>
            {openList.length > 0 && (
              <ul className="mb-4 divide-y divide-linen">
                {openList.map((i) => {
                  const late = daysBetween(i.dueDate, t);
                  return (
                    <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                      <span className="num w-14 text-sm text-faint">#{i.number}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{i.description ?? 'Invoice'}</span>
                        <span className="text-sm text-muted">
                          {i.status === 'disputed' ? 'Disputed' : late > 0 ? `${plural(late, 'day')} overdue` : `Due ${formatShortDate(i.dueDate)}`}
                          {i.amountPaidCents ? ` · ${money(i.amountPaidCents)} paid` : ''}
                        </span>
                      </span>
                      <span className="num font-semibold">{money(i.amountCents - i.amountPaidCents)}</span>
                      <InvoiceActions id={i.id} number={i.number} />
                    </li>
                  );
                })}
              </ul>
            )}
            {invoices.length > 0 && (
              <ExpandDialog
                wide
                label={`All ${plural(invoices.length, 'invoice')}`}
                title={`Invoices for ${customer.name}`}
                subtitle={
                  <>
                    {plural(invoices.length, 'invoice')} · <span className="num">{money(invoices.reduce((sum, i) => sum + i.amountCents, 0))}</span> billed
                    {s.record.paidCount ? ` · ${s.record.onTimeCount} of ${s.record.paidCount} paid on time` : ''}
                  </>
                }
              >
                <InvoiceTable invoices={invoices} today={t} />
              </ExpandDialog>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
