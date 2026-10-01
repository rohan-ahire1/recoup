import { createHmac, timingSafeEqual } from 'node:crypto';

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

async function stripe<T>(path: string, init: { method?: string; form?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: init.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: init.form ? new URLSearchParams(init.form) : undefined,
  });
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(data.error?.message ?? `Stripe HTTP ${res.status}`);
  return data;
}

export interface CheckoutMetadata {
  customer_id: string;
  kind: 'full' | 'installment';
  installment_id?: string;
}

export async function createCheckoutSession(opts: {
  amountCents: number;
  productName: string;
  successUrl: string;
  cancelUrl: string;
  metadata: CheckoutMetadata;
}): Promise<string> {
  const form: Record<string, string> = {
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(opts.amountCents),
    'line_items[0][price_data][product_data][name]': opts.productName,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
  };
  for (const [k, v] of Object.entries(opts.metadata)) if (v) form[`metadata[${k}]`] = v;
  const session = await stripe<{ url: string }>('/checkout/sessions', { method: 'POST', form });
  return session.url;
}

export interface CheckoutSession {
  id: string;
  payment_status: string;
  amount_total: number;
  metadata: Partial<CheckoutMetadata>;
}

export async function retrieveCheckoutSession(id: string): Promise<CheckoutSession> {
  return stripe<CheckoutSession>(`/checkout/sessions/${encodeURIComponent(id)}`);
}

/** https://docs.stripe.com/webhooks#verify-manually */
export function verifyStripeSignature(rawBody: string, header: string | null, toleranceSec = 300): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest();
  return header
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .some((p) => {
      const given = Buffer.from(p.slice(3), 'hex');
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
}
