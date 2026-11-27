import { businessForPayToken } from './accounts';
import { get, run } from './db';
import { senderFor } from './email';
import { getReceivedEmail, inboundReplyDomain, sendEmail } from './providers/email';
import { getCustomerByToken } from './repo';
import { logReply } from './service';
import { getSettings } from './settings';
import { runAsBusiness, type Tenant } from './tenant';

/**
 * Customer replies arrive at reply+<pay token>@<INBOUND_REPLY_DOMAIN>, which has
 * its MX records at Resend. Resend posts `email.received` with metadata only, so
 * the body is fetched from its receiving API. The reply is logged against the
 * customer and forwarded to the business, who can answer the customer directly.
 */

export interface ReceivedEvent {
  email_id?: string;
  from?: string;
  to?: string[];
  subject?: string;
}

export type InboundResult = 'logged' | 'ignored' | 'duplicate' | 'retry';

const OUT_OF_OFFICE = /^\s*((automatic|auto)[ -]?reply|autoreply|out of (the )?office|away from (my )?(desk|office))\b/i;

/** The pay token in a reply+<token>@<domain> address on our inbound domain. */
export function tokenFromAddresses(addresses: string[], domain: string): string | null {
  for (const raw of addresses) {
    const m = /<([^<>]+)>\s*$/.exec(raw);
    const addr = (m ? m[1] : raw).trim();
    const at = addr.lastIndexOf('@');
    if (at < 0 || addr.slice(at + 1).toLowerCase() !== domain) continue;
    const local = /^reply\+([A-Za-z0-9_-]{8,128})$/.exec(addr.slice(0, at));
    if (local) return local[1];
  }
  return null;
}

/** Automatic replies: an Auto-Submitted header other than "no", or an out-of-office subject. */
export function isAutoReply(headers: Record<string, string>, subject: string): boolean {
  const auto = headers['auto-submitted']?.trim().toLowerCase();
  if (auto && auto !== 'no') return true;
  return OUT_OF_OFFICE.test(subject);
}

/** The reply without the quoted history: cut at the first "On … wrote:" line or the first ">" quote line. */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let end = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Gmail wraps a long attribution line, so "wrote:" may be on the next line.
    const wrote = /^on\s/i.test(line) && (/wrote:$/i.test(line) || /^wrote:$/i.test(lines[i + 1]?.trim() ?? ''));
    if (line.startsWith('>') || wrote) {
      end = i;
      break;
    }
  }
  return lines.slice(0, end).join('\n').trim();
}

function plainText(html: string): string {
  return html
    .replace(/<(br|\/p|\/div)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

/** The sender's bare address from "Name <a@b.c>" or "a@b.c". */
function bareAddress(from: string): string {
  const m = /<([^<>]+)>/.exec(from);
  return (m ? m[1] : from).trim();
}

/** Handle one `email.received` event. Does nothing unless INBOUND_REPLY_DOMAIN is set. */
export async function handleReceivedEmail(event: ReceivedEvent, now = Date.now()): Promise<InboundResult> {
  const domain = inboundReplyDomain();
  const emailId = event.email_id;
  if (!domain || !emailId) return 'ignored';
  const token = tokenFromAddresses(event.to ?? [], domain);
  if (!token) return 'ignored';
  const business = businessForPayToken(token);
  if (!business) return 'ignored';

  const r = await getReceivedEmail(emailId);
  if (!r.ok) return 'retry';
  const mail = r.data;
  const headers = Object.fromEntries(Object.entries(mail.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const subject = mail.subject ?? event.subject ?? '';
  if (isAutoReply(headers, subject)) return 'ignored';

  const full = (mail.text ?? (mail.html ? plainText(mail.html) : '')).trim();
  const body = stripQuoted(full);
  if (!body) return 'ignored';

  const tenant: Tenant = { businessId: business.id, demo: business.demo };
  return runAsBusiness(tenant, async () => {
    const customer = getCustomerByToken(token);
    if (!customer) return 'ignored';
    // Resend retries webhooks, so a reply it already delivered once is logged once.
    if (get('SELECT 1 FROM messages WHERE direction = ? AND provider_id = ?', 'inbound', emailId)) return 'duplicate';

    await logReply({ customerId: customer.id, kind: 'auto', channel: 'email', body }, now);
    run(
      `UPDATE messages SET provider_id = ?, provider = 'resend'
       WHERE id = (SELECT max(id) FROM messages WHERE customer_id = ? AND direction = 'inbound')`,
      emailId,
      customer.id,
    );

    // Forward the original so the business still sees it. Replying to the forward goes straight to the customer.
    const settings = getSettings();
    if (settings.replyToEmail && !business.demo) {
      const sender = senderFor(business.id, settings);
      await sendEmail({
        to: settings.replyToEmail,
        from: sender.from,
        replyTo: bareAddress(mail.from ?? event.from ?? ''),
        subject: /^fwd?:/i.test(subject) ? subject : `Fwd: ${subject || `Reply from ${customer.name}`}`,
        text: `${customer.name} replied to your reminder. Reply to this email to answer them directly.\n\nFrom: ${mail.from ?? event.from ?? ''}\n\n${full}`,
      });
    }
    return 'logged';
  });
}
