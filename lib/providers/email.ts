import { randomBytes } from 'node:crypto';

export interface SendResult {
  provider: string;
  providerId: string | null;
  status: 'sent' | 'delivered' | 'failed';
  error?: string;
}

/** The shared Recoup sender: one Resend account, one verified platform domain. */
export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** "Name <a@b.c>" with anything that could break the header taken out of the name. */
export function mailbox(name: string, email: string): string {
  return `${name.replace(/[<>"\r\n]/g, '').trim()} <${email}>`;
}

async function resend<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(`https://api.resend.com${path}`, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });
    const data = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok) return { ok: false, error: data.message ?? `HTTP ${res.status}` };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function sendEmail(opts: { to: string; subject: string; text: string; from: string; replyTo?: string }): Promise<SendResult> {
  if (!resendConfigured()) {
    return { provider: 'mock', providerId: `mock_${randomBytes(6).toString('hex')}`, status: 'delivered' };
  }
  const r = await resend<{ id?: string }>('/emails', {
    method: 'POST',
    body: { from: opts.from, to: [opts.to], subject: opts.subject, text: opts.text, ...(opts.replyTo ? { reply_to: opts.replyTo } : {}) },
  });
  if (!r.ok) return { provider: 'resend', providerId: null, status: 'failed', error: r.error };
  return { provider: 'resend', providerId: r.data.id ?? null, status: 'sent' };
}

// ---------------------------------------------------------------- a business's own domain

export interface ResendDomain {
  id: string;
  name: string;
  status: string;
  records: { record: string; name: string; type: string; value: string; priority?: number; status?: string }[];
}

export const createDomain = (name: string) => resend<ResendDomain>('/domains', { method: 'POST', body: { name } });
export const getDomain = (id: string) => resend<ResendDomain>(`/domains/${encodeURIComponent(id)}`);
export const verifyDomain = (id: string) => resend<{ id: string }>(`/domains/${encodeURIComponent(id)}/verify`, { method: 'POST' });
export const deleteDomain = (id: string) => resend<{ id: string }>(`/domains/${encodeURIComponent(id)}`, { method: 'DELETE' });
