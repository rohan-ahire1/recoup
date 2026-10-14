import { NextResponse } from 'next/server';
import { enterPayLink } from '@/lib/pay-access';
import { allow } from '@/lib/rate-limit';
import { getCustomerByToken } from '@/lib/repo';
import { choosePlan, reportPaymentSent } from '@/lib/service';

export const dynamic = 'force-dynamic';

/** The customer's choices on their payment page. Recoup never takes the money itself. */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  enterPayLink(token);
  const customer = getCustomerByToken(token);
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const page = (q = '') => NextResponse.redirect(new URL(`/pay/${token}${q}`, req.url), 303);
  if (!allow(`pay:${token}`, 20, 60 * 60_000)) return page('?error=slow');

  const form = await req.formData();
  try {
    switch (String(form.get('action'))) {
      case 'sent':
        reportPaymentSent(customer.id);
        return page('?sent=1');
      case 'plan':
        choosePlan(customer.id, Number(form.get('count')));
        return page('?plan=set');
      default:
        return page();
    }
  } catch (err) {
    console.error('Pay page action failed', err);
    return page('?error=1');
  }
}
