import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Icon } from '@/app/components/icons';
import { SubmitButton } from '@/app/components/SubmitButton';
import { BigMoney, buttonClass } from '@/app/components/ui';
import { formatLongDate, formatShortDate, money, moneyShort } from '@/lib/format';
import { enterPayLink } from '@/lib/pay-access';
import { getCustomerByToken, getOpenCase, listInstallments } from '@/lib/repo';
import { PLAN_OFFER_STEP, splitInstallments } from '@/lib/sequence';
import { payableInvoices } from '@/lib/service';
import { getNow, getSettings } from '@/lib/settings';
import { firstName } from '@/lib/templates';
import { daysBetween, localDate } from '@/lib/time';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  enterPayLink((await params).token);
  return { title: `Pay ${getSettings().businessName}`, robots: { index: false } };
}

function HowToPay({ token, amount, instructions, link, businessName, sent }: { token: string; amount: number; instructions: string; link: string; businessName: string; sent: boolean }) {
  return (
    <div className="mt-6 flex flex-col gap-3">
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" className={`${buttonClass('primary', 'lg')} w-full`}>
          Pay {money(amount)}
        </a>
      )}
      {instructions ? (
        <div className="rounded-block bg-linen/60 px-4 py-3.5">
          <p className="text-sm font-semibold">How to pay {businessName.replace(/\.$/, '')}</p>
          <p className="mt-1 text-[15px] whitespace-pre-line">{instructions}</p>
        </div>
      ) : (
        !link && <p className="rounded-block bg-linen/60 px-4 py-3.5 text-[15px]">Reply to the message from {businessName.replace(/\.$/, '')} and they’ll tell you how to pay.</p>
      )}
      {sent ? (
        <p className="rounded-block bg-teal-soft px-4 py-3 text-center text-sm font-semibold text-teal-strong">Thanks! We’ve let {businessName.replace(/\.$/, '')} know.</p>
      ) : (
        <form action={`/api/pay/${token}`} method="post">
          <input type="hidden" name="action" value="sent" />
          <SubmitButton variant={link ? 'outline' : 'primary'} size="lg" className="w-full">I’ve sent payment</SubmitButton>
        </form>
      )}
    </div>
  );
}

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ sent?: string; plan?: string; error?: string }>;
}) {
  const { token } = await params;
  enterPayLink(token);
  const query = await searchParams;
  const customer = getCustomerByToken(token);
  if (!customer) notFound();

  const { businessName, timezone, payInstructions, payLink } = getSettings();
  const sent = query.sent === '1';
  const t = localDate(getNow(), timezone);
  const first = firstName(customer);
  const c = getOpenCase(customer.id);
  const invoices = payableInvoices(customer);
  const total = invoices.reduce((s, i) => s + i.amountCents - i.amountPaidCents, 0);
  const installments = c?.status === 'plan' ? listInstallments(c.id) : [];
  const nextInstallment = installments.find((i) => !i.paidAt);
  const planOffered = Boolean(c && c.status !== 'plan' && (c.currentStep >= PLAN_OFFER_STEP || query.plan));
  const how = { token, instructions: payInstructions, link: payLink, businessName, sent };

  return (
    <div className="min-h-screen px-4 py-10 sm:py-16">
      <main className="mx-auto flex max-w-md flex-col gap-6">
        <p className="display text-center text-heading font-bold">{businessName}</p>

        <div className="rounded-pay bg-paper p-6 ring-1 ring-edge ring-inset shadow-[var(--shadow-lift)] sm:p-8">
          {query.error && <p className="mb-5 rounded-block bg-rust-soft px-4 py-3 text-sm text-rust">{query.error === 'slow' ? 'Too many tries. Please wait a little and try again.' : 'Something went wrong. Please try again.'}</p>}

          {nextInstallment ? (
            <>
              {query.plan === 'set' && <p className="mb-5 rounded-block bg-teal-soft px-4 py-3 text-sm font-semibold text-teal-strong">Your plan is set, {first}. Thank you!</p>}
              <p className="text-muted">Your payment plan</p>
              <BigMoney value={moneyShort(nextInstallment.amountCents)} className="mt-1" />
              <p className="mt-2 text-muted">
                Payment {nextInstallment.seq} of {installments.length}, due {formatLongDate(nextInstallment.dueAt, timezone)}
              </p>
              <ul className="mt-6 divide-y divide-linen rounded-block ring-1 ring-line">
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
              <HowToPay {...how} amount={nextInstallment.amountCents} />
            </>
          ) : total === 0 ? (
            <div className="py-4 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal-soft text-teal">
                <Icon name="check" size={28} />
              </span>
              <h1 className="display mt-5 text-heading font-bold">You’re all paid up</h1>
              <p className="mt-2 text-muted">There’s nothing to pay right now.</p>
            </div>
          ) : (
            <>
              <p className="text-muted">Hi {first}, here’s what’s due</p>
              <BigMoney value={moneyShort(total)} className="mt-1" />
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
              <HowToPay {...how} amount={total} />

              {planOffered && (
                <div id="plan" className="mt-8 border-t border-linen pt-6">
                  <h2 className="display text-section font-bold">Or split it up</h2>
                  <p className="mt-1 text-muted">Pay part now and the rest every two weeks. No fees.</p>
                  <div className="mt-4 flex flex-col gap-2">
                    {[2, 3].map((count) => {
                      const parts = splitInstallments(total, count);
                      return (
                        <form key={count} action={`/api/pay/${token}`} method="post">
                          <input type="hidden" name="action" value="plan" />
                          <input type="hidden" name="count" value={count} />
                          <button type="submit" className="ease flex w-full items-center justify-between gap-4 rounded-block px-4 py-3.5 text-left ring-1 ring-line ring-inset hover:bg-linen/60 hover:ring-linen-2">
                            <span className="font-semibold">{count} payments</span>
                            <span className="num text-right text-muted">
                              <span className="font-semibold text-ink">{money(parts[0])}</span> now
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
      </main>
    </div>
  );
}
