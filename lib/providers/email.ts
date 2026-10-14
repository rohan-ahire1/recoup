import { randomBytes } from 'node:crypto';

export interface SendResult {
  provider: string;
  providerId: string | null;
  status: 'sent' | 'delivered' | 'failed';
  error?: string;
}

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  fromName: string;
  replyTo?: string;
}): Promise<SendResult> {
  if (!resendConfigured()) {
    return { provider: 'mock', providerId: `mock_${randomBytes(6).toString('hex')}`, status: 'delivered' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${opts.fromName.replace(/[<>"]/g, '')} <${process.env.EMAIL_FROM}>`,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });
    const data = (await res.json()) as { id?: string; message?: string };
    if (!res.ok) return { provider: 'resend', providerId: null, status: 'failed', error: data.message ?? `HTTP ${res.status}` };
    return { provider: 'resend', providerId: data.id ?? null, status: 'sent' };
  } catch (err) {
    return { provider: 'resend', providerId: null, status: 'failed', error: String(err) };
  }
}
