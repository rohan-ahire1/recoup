import { NextResponse } from 'next/server';
import { handleEmailEvent } from '@/lib/email';
import { handleReceivedEmail, type ReceivedEvent } from '@/lib/inbound';
import { verifySvix } from '@/lib/svix';

export const dynamic = 'force-dynamic';

/** Resend tells us about bounces, spam complaints and (with INBOUND_REPLY_DOMAIN) customer replies here. Refuses everything without RESEND_WEBHOOK_SECRET. */
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const body = await req.text();
  const ok =
    secret &&
    body.length < 100_000 &&
    verifySvix(secret, { id: req.headers.get('svix-id'), timestamp: req.headers.get('svix-timestamp'), signature: req.headers.get('svix-signature') }, body);
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const event = JSON.parse(body) as { type?: string; data?: { email_id?: string; bounce?: { message?: string } } & ReceivedEvent };
  if (event.type === 'email.received' && event.data) {
    // A failed fetch of the body gets a 5xx, so Resend retries the webhook.
    const result = await handleReceivedEmail(event.data);
    return NextResponse.json({ ok: result !== 'retry' }, { status: result === 'retry' ? 502 : 200 });
  }
  if (event.type && event.data?.email_id) handleEmailEvent(event.type, event.data.email_id, event.data.bounce?.message?.slice(0, 200));
  return NextResponse.json({ ok: true });
}
