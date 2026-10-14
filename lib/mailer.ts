import { baseUrl } from './templates';

/** Email from Recoup itself (sign-in links), not from a business. */
export function platformEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM);
}

/** AUTH_EMAIL_FROM may be a bare address or already "Name <address>". */
function platformFrom(): string {
  const from = process.env.AUTH_EMAIL_FROM!.trim();
  return from.includes('<') ? from : `Recoup <${from}>`;
}

export function loginLink(token: string): string {
  return `${baseUrl()}/login/verify?token=${encodeURIComponent(token)}`;
}

/** Sends a sign-in link. Without email set up (local development) it logs the link instead. */
export async function sendLoginEmail(to: string, token: string): Promise<{ ok: boolean; devLink?: string }> {
  const link = loginLink(token);
  if (!platformEmailConfigured()) {
    if (process.env.NODE_ENV === 'production') return { ok: false };
    console.log(`Sign-in link for ${to}: ${link}`);
    return { ok: true, devLink: link };
  }
  const text = [
    'Here’s your link to sign in to Recoup:',
    '',
    link,
    '',
    'It works once and expires in 15 minutes. If you didn’t ask for it, you can ignore this email.',
  ].join('\n');
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: platformFrom(), to: [to], subject: 'Your Recoup sign-in link', text }),
    });
    if (!res.ok) console.error('Sign-in email failed', res.status, await res.text());
    return { ok: res.ok };
  } catch (err) {
    console.error('Sign-in email failed', err);
    return { ok: false };
  }
}
