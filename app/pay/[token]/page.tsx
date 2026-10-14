import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Icon } from '@/app/components/icons';
import { SubmitButton } from '@/app/components/SubmitButton';
import { requireBusiness } from '@/lib/auth';
import { formatLongDate, formatShortDate, money } from '@/lib/format';
import { providerStatus, retrieveCheckoutSession } from '@/lib/providers';
import { getCustomerByToken, getOpenCase, listInstallments } from '@/lib/repo';
import { PLAN_OFFER_STEP, splitInstallments } from '@/lib/sequence';
import { payableInvoices, recordPayment } from '@/lib/service';
import { getNow, getSettings } from '@/lib/settings';
import { firstName } from '@/lib/templates';
import { daysBetween, localDate } from '@/lib/time';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  await requireBusiness();
  return { title: `Pay ${getSettings().businessName}`, robots: { index: false } };
}

/** Stripe sends people back here; confirm the session so the payment shows even if the webhook is slow. */
async function confirmStripe(sessionId: string, customerId: number) {
  try {
    const s = await retrieveCheckoutSession(sessionId);
    if (s.payment_status === 'paid' && Number(s.metadata.customer_id) === customerId) {
      recordPayment({
        customerId,
        amountCents: s.amount_total,
        installmentId: s.metadata.installment_id ? Number(s.metadata.installment_id) : null,
        source: 'stripe',
        method: 'card',
        externalId: s.id,
      });
      return true;
    }
  } catch (err) {
    console.error('Could not confirm Stripe session', err);
  }
  return false;
}

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string; plan?: string; error?: string; session_id?: string }>;
}) {
  await requireBusiness();
  const { token } = await params;
  const query = await searchParams;
  const customer = getCustomerByToken(token);
  if (!customer) notFound();

  let justPaid = query.paid === '1';
  if (query.session_id && providerStatus().payments === 'stripe') justPaid = await confirmStripe(query.session_id, customer.id);

  const { businessName, timezone } = getSettings();
  const t = localDate(getNow(), timezone);
  const first = firstName(customer);
  const c = getOpenCase(customer.id);
  const invoices = payableInvoices(customer);
  const total = invoices.reduce((s, i) => s + i.amountCents - i.amountPaidCents, 0);
  const installments = c?.status === 'plan' ? listInstallments(c.id) : [];
  const nextInstallment = installments.find((i) => !i.paidAt);
  const planOffered = Boolean(c && c.status !== 'plan' && (c.currentStep >= PLAN_OFFER_STEP || query.plan));
  const testMode = providerStatus().payments === 'mock';

  return (
    <div className="min-h-screen px-4 py-10 sm:py-16">
      <main className="mx-auto flex max-w-md flex-col gap-6">
        <p className="display text-center text-[26px] font-bold">{businessName}</p>

        <div className="rounded-[28px] bg-paper p-6 shadow-[var(--shadow-lift)] sm:p-8">
          {query.error && <p className="mb-5 rounded-2xl bg-rust-soft px-4 py-3 text-sm text-rust">Something went wrong starting the payment. Please try again.</p>}

          {nextInstallment ? (
            <>
              {justPaid && <p className="mb-5 rounded-2xl bg-teal-soft px-4 py-3 text-sm font-semibold text-teal-strong">Payment received. Thank you, {first}!</p>}
              <p className="text-muted">Your payment plan</p>
              <p className="display num mt-1 text-[44px] leading-none font-bold">{money(nextInstallment.amountCents)}</p>
              <p className="mt-2 text-muted">
                Payment {nextInstallment.seq} of {installments.length}, due {formatLongDate(nextInstallment.dueAt, timezone)}
              </p>
              <ul className="mt-6 divide-y divide-linen rounded-2xl ring-1 ring-line">
                {installments.map((i) => (
                  <li key={i.id} className="flex items-center justify-between px-4 py-3 text-[15px]">
                    <span className={i.paidAt ? 'text-muted' : ''}>{formatLongDate(i.dueAt, timezone)}</span>
                    <span className="num flex items-center gap-2">
                      {money(i.amountCents)}
                      {i.paidAt && <Icon name="check" size={16} className="text-teal" />}
                    </span>
                  </li>
                ))}
              </ul>
              <form action={`/api/pay/${token}`} method="post" className="mt-6">
                <input type="hidden" name="action" value="installment" />
                <SubmitButton variant="primary" size="lg" className="w-full">Pay {money(nextInstallment.amountCents)}</SubmitButton>
              </form>
            </>
          ) : total === 0 ? (
            <div className="py-4 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal-soft text-teal">
                <Icon name="check" size={28} />
              </span>
              <h1 className="display mt-5 text-[26px] font-bold">{justPaid ? `Thank you, ${first}!` : 'You’re all paid up'}</h1>
              <p className="mt-2 text-muted">{justPaid ? `Your payment to ${businessName} went through.` : 'There’s nothing to pay right now.'}</p>
            </div>
          ) : (
            <>
              <p className="text-muted">Hi {first}, here’s what’s due</p>
              <p className="display num mt-1 text-[48px] leading-none font-bold">{money(total)}</p>
              <ul className="mt-6 divide-y divide-linen">
                {invoices.map((i) => (
                  <li key={i.id} className="flex items-baseline justify-between gap-4 py-3">
                    <span className="min-w-0">
                      <span className="block truncate">{i.description ?? `Invoice #${i.number}`}</span>
                      <span className="text-sm text-muted">
                        #{i.number} · {daysBetween(i.dueDate, t) > 0 ? 'was due' : 'due'} {formatShortDate(i.dueDate)}
                      </span>
                    </span>
                    <span className="num shrink-0">{money(i.amountCents - i.amountPaidCents)}</span>
                  </li>
                ))}
              </ul>
              <form action={`/api/pay/${token}`} method="post" className="mt-6">
                <input type="hidden" name="action" value="full" />
                <SubmitButton variant="primary" size="lg" className="w-full">Pay {money(total)}</SubmitButton>
              </form>

              {planOffered && (
                <div id="plan" className="mt-8 border-t border-linen pt-6">
                  <h2 className="display text-[20px] font-bold">Or split it up</h2>
                  <p className="mt-1 text-muted">Pay part today and the rest every two weeks. No fees.</p>
                  <div className="mt-4 flex flex-col gap-2">
                    {[2, 3].map((count) => {
                      const parts = splitInstallments(total, count);
                      return (
                        <form key={count} action={`/api/pay/${token}`} method="post">
                          <input type="hidden" name="action" value="plan" />
                          <input type="hidden" name="count" value={count} />
                          <button type="submit" className="ease flex w-full items-center justify-between gap-4 rounded-2xl px-4 py-3.5 text-left ring-1 ring-line ring-inset hover:bg-linen/60 hover:ring-linen-2">
                            <span className="font-semibold">{count} payments</span>
                            <span className="num text-right text-muted">
                              <span className="font-semibold text-ink">{money(parts[0])}</span> today
                              <span className="block text-xs">then {count - 1} more, every 2 weeks</span>
                            </span>
                          </button>
                        </form>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <p className="text-center text-sm text-muted">Questions? Just reply to the message from {businessName.replace(/\.$/, '')}.</p>
        {testMode && <p className="-mt-3 text-center text-xs text-faint">Test mode: no card will be charged.</p>}
      </main>
    </div>
  );
}
