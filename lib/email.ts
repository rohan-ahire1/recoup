import {
  emailStats,
  getBusiness,
  getEmailDomain,
  pauseBusinessEmail,
  recordEmailOutcome,
  recordSentEmail,
  removeEmailDomain,
  saveEmailDomain,
  type EmailDomain,
} from './accounts';
import { get, run } from './db';
import { mailbox, resendConfigured, sendEmail, createDomain, deleteDomain, getDomain, verifyDomain, type SendResult } from './providers/email';
import { logEvent, setCaseStatus, updateCase } from './repo';
import type { Settings } from './settings';
import { currentTenant, runAsBusiness } from './tenant';

/**
 * Reminder email for a business. By default it goes out from the shared Recoup
 * address as "Harbor Bakery via Recoup", with replies going to the business.
 * Once a business verifies its own domain, it goes out from their address.
 * One business's bad list mustn't hurt everyone else's delivery, so each has a
 * daily cap and loses automatic sending after too many bounces or complaints.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const dailyCap = () => Number(process.env.EMAIL_DAILY_CAP) || 200;

/** Bounces or complaints above these, over the last week, pause automatic email. */
const MIN_SAMPLE = 20;
const MAX_BOUNCE_RATE = 0.08;
const MAX_COMPLAINTS = 2;

export function verifiedDomain(businessId: string): EmailDomain | undefined {
  const d = getEmailDomain(businessId);
  return d?.status === 'verified' ? d : undefined;
}

export function senderFor(businessId: string, settings: Settings): { from: string; replyTo?: string } {
  const own = verifiedDomain(businessId);
  const name = settings.businessName.replace(/\.$/, '');
  if (own) return { from: mailbox(name, own.fromEmail), replyTo: settings.replyToEmail || undefined };
  return { from: mailbox(`${name} via Recoup`, process.env.EMAIL_FROM ?? ''), replyTo: settings.replyToEmail || undefined };
}

/** Why automatic email can't go out for this business right now, or null if it can. */
export function sendingBlocked(businessId: string, now = Date.now()): string | null {
  const b = getBusiness(businessId);
  if (b?.emailPausedAt) return b.emailPausedReason ?? 'Automatic email is paused';
  if (emailStats(businessId, now - DAY).sent >= dailyCap()) return `Daily limit of ${dailyCap()} emails reached`;
  return null;
}

/** The plain footer on every automatic email: who it's from and where they are. */
export function footer(settings: Settings): string {
  const name = settings.businessName.replace(/\.$/, '');
  return ['', '--', name, settings.mailingAddress.trim(), 'Reply to this email to reach them.'].filter((l, i) => i < 2 || l).join('\n');
}

/** Send one reminder email for the current business. */
export async function sendBusinessEmail(msg: { to: string; subject: string; text: string }, settings: Settings): Promise<SendResult> {
  const { businessId } = currentTenant();
  const sender = senderFor(businessId, settings);
  const result = await sendEmail({ ...msg, text: msg.text + '\n' + footer(settings), ...sender });
  if (result.status !== 'failed' && result.providerId && result.provider === 'resend') recordSentEmail(result.providerId, businessId);
  return result;
}

// ---------------------------------------------------------------- bounces and complaints

/** A Resend event about one email. Unknown or repeated events do nothing. */
export function handleEmailEvent(type: string, providerId: string, detail = '', now = Date.now()): boolean {
  const outcome = type === 'email.bounced' ? 'bounced' : type === 'email.complained' ? 'complained' : null;
  if (!outcome) return false;
  const businessId = recordEmailOutcome(providerId, outcome);
  const business = businessId && getBusiness(businessId);
  if (!business) return false;

  runAsBusiness({ businessId: business.id, demo: business.demo }, () => {
    const m = get<{ id: number; customerId: number; caseId: number | null; toAddr: string | null }>(
      'SELECT id, customer_id AS customerId, case_id AS caseId, to_addr AS toAddr FROM messages WHERE provider_id = ?',
      providerId,
    );
    if (!m) return;
    if (outcome === 'bounced') {
      run("UPDATE messages SET status = 'failed', error = ? WHERE id = ?", `Bounced${detail ? `: ${detail}` : ''}`, m.id);
      logEvent(m.customerId, m.caseId, 'send_failed', `The email to ${m.toAddr} bounced. Check the address.`, now);
      if (m.caseId) updateCase(m.caseId, { needs_attention: 1, attention_reason: 'Their email bounced. Check the address.' }, now);
    } else {
      logEvent(m.customerId, m.caseId, 'paused', 'They marked your reminder as spam. Reminders paused.', now);
      const active = m.caseId ? get<{ id: number }>("SELECT id FROM cases WHERE id = ? AND status = 'active'", m.caseId) : undefined;
      if (active) setCaseStatus(active.id, 'paused', now, { paused_at: now, needs_attention: 1, attention_reason: 'They marked your reminder as spam' });
    }
  });

  const week = emailStats(business.id, now - 7 * DAY);
  if (week.complained >= MAX_COMPLAINTS) {
    pauseBusinessEmail(business.id, 'Too many people marked reminders as spam this week', now);
  } else if (week.sent >= MIN_SAMPLE && week.bounced / week.sent > MAX_BOUNCE_RATE) {
    pauseBusinessEmail(business.id, 'Too many reminders bounced this week. Check your customers’ email addresses.', now);
  }
  return true;
}

// ---------------------------------------------------------------- the business's own domain

export const emailSendingReady = resendConfigured;

/** Start sending from the business's own address. Returns an error message, or null. */
export async function addOwnDomain(businessId: string, fromEmail: string, now = Date.now()): Promise<string | null> {
  const domain = fromEmail.split('@')[1]?.toLowerCase();
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return 'That doesn’t look like an email address.';
  if (/^(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|me|aol|proton|protonmail)\./.test(domain)) {
    return `You can’t send as an @${domain} address from another service. Use an address on your own domain.`;
  }
  const old = getEmailDomain(businessId);
  if (old && old.domain !== domain) await deleteDomain(old.resendId);
  if (old?.domain === domain) {
    saveEmailDomain({ ...old, fromEmail }, now);
    return null;
  }
  const r = await createDomain(domain);
  if (!r.ok) return /already/i.test(r.error) ? `${domain} is already set up in another Recoup account.` : `Couldn’t add ${domain}: ${r.error}`;
  saveEmailDomain({ businessId, fromEmail, domain, resendId: r.data.id, status: r.data.status, records: r.data.records ?? [] }, now);
  return null;
}

/** Ask Resend to check the DNS records now, and store what it says. */
export async function checkOwnDomain(businessId: string, now = Date.now()): Promise<EmailDomain | undefined> {
  const d = getEmailDomain(businessId);
  if (!d) return undefined;
  if (d.status !== 'verified') await verifyDomain(d.resendId);
  const r = await getDomain(d.resendId);
  if (r.ok) saveEmailDomain({ ...d, status: r.data.status, records: r.data.records ?? d.records }, now);
  return getEmailDomain(businessId);
}

export async function removeOwnDomain(businessId: string) {
  const d = getEmailDomain(businessId);
  if (!d) return;
  await deleteDomain(d.resendId);
  removeEmailDomain(businessId);
}
