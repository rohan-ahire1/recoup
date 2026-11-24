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

/** Sends one email from Recoup itself. Without email set up (local development) it logs the link instead. */
async function sendPlatformEmail(opts: { to: string; subject: string; lines: string[]; link: string; what: string }): Promise<{ ok: boolean; devLink?: string }> {
  if (!platformEmailConfigured()) {
    if (process.env.NODE_ENV === 'production') return { ok: false };
    console.log(`${opts.what} for ${opts.to}: ${opts.link}`);
    return { ok: true, devLink: opts.link };
  }
  const text = [...opts.lines, '', '--', `Privacy: ${baseUrl()}/privacy`, `Terms: ${baseUrl()}/terms`].join('\n');
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: platformFrom(), to: [opts.to], subject: opts.subject, text }),
    });
    if (!res.ok) console.error(`${opts.what} email failed`, res.status, await res.text());
    return { ok: res.ok };
  } catch (err) {
    console.error(`${opts.what} email failed`, err);
    return { ok: false };
  }
}

/** Sends a sign-in link. */
export async function sendLoginEmail(to: string, token: string): Promise<{ ok: boolean; devLink?: string }> {
  const link = loginLink(token);
  return sendPlatformEmail({
    to,
    subject: 'Your Recoup sign-in link',
    what: 'Sign-in link',
    link,
    lines: [
      'Here’s your link to sign in to Recoup:',
      '',
      link,
      '',
      'It works once and expires in 15 minutes. If you didn’t ask for it, you can ignore this email.',
    ],
  });
}

export function inviteLink(token: string): string {
  return `${baseUrl()}/invite/verify?token=${encodeURIComponent(token)}`;
}

/** Sends an invitation to join a business. */
export async function sendInviteEmail(to: string, token: string, opts: { businessName: string; inviterEmail: string }): Promise<{ ok: boolean; devLink?: string }> {
  const link = inviteLink(token);
  return sendPlatformEmail({
    to,
    subject: `Join ${opts.businessName} on Recoup`,
    what: 'Invite link',
    link,
    lines: [
      `${opts.inviterEmail} invited you to join ${opts.businessName} on Recoup, which sends polite payment reminders to customers.`,
      '',
      link,
      '',
      'The link works once and expires in 7 days. If you weren’t expecting this, you can ignore this email.',
    ],
  });
}
