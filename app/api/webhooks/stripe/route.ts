import { NextResponse } from 'next/server';
import { requireBusiness } from '@/lib/auth';
import { verifyStripeSignature } from '@/lib/providers';
import { recordPayment } from '@/lib/service';
import { enterBusiness } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

interface StripeEvent {
  type: string;
  data: { object: { id: string; payment_status?: string; amount_total?: number; metadata?: { customer_id?: string; installment_id?: string } } };
}

/**
 * Subscribe this endpoint to checkout.session.completed and
 * checkout.session.async_payment_succeeded (bank debits and other delayed methods
 * finish as "unpaid" and only report "paid" in the second event).
 */
export async function POST(req: Request) {
  enterBusiness(await requireBusiness());
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get('stripe-signature'))) {
    return NextResponse.json({ error: 'Bad signature' }, { status: 400 });
  }
  const event = JSON.parse(raw) as StripeEvent;
  const session = event.data.object;
  const completed = event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded';
  if (completed && session.payment_status === 'paid' && session.metadata?.customer_id) {
    recordPayment({
      customerId: Number(session.metadata.customer_id),
      amountCents: session.amount_total ?? 0,
      installmentId: session.metadata.installment_id ? Number(session.metadata.installment_id) : null,
      source: 'stripe',
      method: 'card',
      externalId: session.id,
    });
  }
  return NextResponse.json({ received: true });
}
