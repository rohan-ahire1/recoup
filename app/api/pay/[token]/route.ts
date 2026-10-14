import { NextResponse } from 'next/server';
import { enterPayLink } from '@/lib/pay-access';
import { createCheckoutSession } from '@/lib/providers';
import { stripeConfigured } from '@/lib/providers/payments';
import { getCustomerByToken, getOpenCase, listInstallments } from '@/lib/repo';
import { choosePlan, payableCents, recordPayment } from '@/lib/service';
import { getSettings } from '@/lib/settings';
import type { Customer, Installment } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Take a payment: Stripe Checkout when configured, otherwise record it straight away (test mode). */
async function collect(req: Request, customer: Customer, amountCents: number, installment?: Installment) {
  const pagePath = `/pay/${customer.payToken}`;
  if (stripeConfigured()) {
    const { businessName } = getSettings();
    const url = await createCheckoutSession({
      amountCents,
      productName: installment ? `${businessName}: payment ${installment.seq}` : `${businessName}: invoice payment`,
      successUrl: new URL(`${pagePath}?session_id={CHECKOUT_SESSION_ID}`, req.url).toString(),
      cancelUrl: new URL(pagePath, req.url).toString(),
      metadata: { customer_id: String(customer.id), kind: installment ? 'installment' : 'full', installment_id: installment ? String(installment.id) : undefined },
    });
    return NextResponse.redirect(url, 303);
  }
  recordPayment({ customerId: customer.id, amountCents, installmentId: installment?.id, source: 'mock', method: 'card' });
  return NextResponse.redirect(new URL(`${pagePath}?paid=1`, req.url), 303);
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  enterPayLink(token);
  const customer = getCustomerByToken(token);
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const back = NextResponse.redirect(new URL(`/pay/${token}`, req.url), 303);
  const form = await req.formData();
  const action = String(form.get('action') ?? 'full');

  try {
    if (action === 'plan') {
      const first = choosePlan(customer.id, Number(form.get('count'))).find((i) => !i.paidAt);
      return first ? collect(req, customer, first.amountCents, first) : back;
    }
    const c = getOpenCase(customer.id);
    if (c?.status === 'plan') {
      const next = listInstallments(c.id).find((i) => !i.paidAt);
      return next ? collect(req, customer, next.amountCents, next) : back;
    }
    const amount = payableCents(customer);
    return amount > 0 ? collect(req, customer, amount) : back;
  } catch (err) {
    console.error('Payment failed', err);
    return NextResponse.redirect(new URL(`/pay/${token}?error=1`, req.url), 303);
  }
}
