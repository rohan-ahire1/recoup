import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface SendResult {
  provider: string;
  providerId: string | null;
  status: 'sent' | 'delivered' | 'failed';
  error?: string;
}

export function twilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_MESSAGING_SERVICE_SID),
  );
}

export async function sendSms(to: string, body: string): Promise<SendResult> {
  if (!twilioConfigured()) {
    return { provider: 'mock', providerId: `mock_${randomBytes(6).toString('hex')}`, status: 'delivered' };
  }
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const form = new URLSearchParams({ To: to, Body: body });
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) form.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID);
  else form.set('From', process.env.TWILIO_FROM_NUMBER!);

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
    const data = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok) return { provider: 'twilio', providerId: null, status: 'failed', error: data.message ?? `HTTP ${res.status}` };
    return { provider: 'twilio', providerId: data.sid ?? null, status: 'sent' };
  } catch (err) {
    return { provider: 'twilio', providerId: null, status: 'failed', error: String(err) };
  }
}

/**
 * Twilio signs webhooks with HMAC-SHA1 over the full URL plus the sorted POST params.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function verifyTwilioSignature(url: string, params: Record<string, string>, signature: string | null): boolean {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const expected = createHmac('sha1', token).update(data).digest();
  const given = Buffer.from(signature, 'base64');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
