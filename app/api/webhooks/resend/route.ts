import { NextResponse } from 'next/server';
import { handleEmailEvent } from '@/lib/email';
import { verifySvix } from '@/lib/svix';

export const dynamic = 'force-dynamic';

/** Resend tells us about bounces and spam complaints here. Refuses everything without RESEND_WEBHOOK_SECRET. */
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const body = await req.text();
  const ok =
    secret &&
    body.length < 100_000 &&
    verifySvix(secret, { id: req.headers.get('svix-id'), timestamp: req.headers.get('svix-timestamp'), signature: req.headers.get('svix-signature') }, body);
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const event = JSON.parse(body) as { type?: string; data?: { email_id?: string; bounce?: { message?: string } } };
  if (event.type && event.data?.email_id) handleEmailEvent(event.type, event.data.email_id, event.data.bounce?.message?.slice(0, 200));
  return NextResponse.json({ ok: true });
}
