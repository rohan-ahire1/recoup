'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  accountDeletionPlan,
  businessesForUser,
  changeUserEmail,
  consumeEmailChangeToken,
  consumeLoginToken,
  createBusiness,
  createEmailChangeToken,
  createLoginToken,
  createSession,
  deleteBusiness,
  deleteSession,
  deleteSessionsForUser,
  deleteUser,
  emailTakenByOther,
  findOrCreateUser,
  getUser,
  makeRoomForDemo,
  maxLiveDemos,
  renameBusiness,
  setSessionBusiness,
  tenantOf,
} from '@/lib/accounts';
import { alert } from '@/lib/alert';
import { clearSessionCookie, currentSession, requireBusiness, requireSession, setSessionCookie } from '@/lib/auth';
import { normalizeEmail } from '@/lib/csv';
import { removeOwnDomain } from '@/lib/email';
import { disconnectQuickBooks } from '@/lib/quickbooks';
import { sendEmailChangeEmail, sendLoginEmail } from '@/lib/mailer';
import { allow } from '@/lib/rate-limit';
import { saveSettings } from '@/lib/settings';
import { enterBusiness, runAsBusiness } from '@/lib/tenant';

const MINUTE = 60_000;
const str = (form: FormData, key: string) => String(form.get(key) ?? '').trim().slice(0, 500);

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || 'local';
}

function validZone(zone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return 'America/Chicago';
  }
}

// ---------------------------------------------------------------- sign in

export async function requestLoginAction(form: FormData) {
  const email = normalizeEmail(str(form, 'email'));
  if (!email) redirect('/login?error=email');
  const ip = await clientIp();
  if (!allow(`login:ip:${ip}`, 20, 15 * MINUTE) || !allow(`login:email:${email}`, 5, 15 * MINUTE)) redirect('/login?error=slow');

  const sent = await sendLoginEmail(email, createLoginToken(email));
  if (!sent.ok) redirect('/login?error=send');
  const q = new URLSearchParams({ sent: email });
  if (sent.devLink) q.set('dev', sent.devLink);
  redirect(`/login?${q}`);
}

/** A button press, not a link visit: mail scanners open links and would use them up. */
export async function verifyLoginAction(form: FormData) {
  const email = consumeLoginToken(str(form, 'token'));
  if (!email) redirect('/login?error=expired');
  const user = findOrCreateUser(email);

  // Signing up from inside a demo: the old demo session just ends.
  const old = await currentSession();
  if (old) deleteSession(old.token);

  const business = businessesForUser(user.id).find((b) => !b.demo);
  await setSessionCookie(createSession({ userId: user.id, businessId: business?.id ?? null }));
  redirect(business ? '/' : '/welcome');
}

export async function signOutAction() {
  const s = await currentSession();
  if (s) deleteSession(s.token);
  await clearSessionCookie();
  redirect('/');
}

// ---------------------------------------------------------------- your account

/** Emails a link to the new address. Nothing changes until it's confirmed. */
export async function requestEmailChangeAction(form: FormData) {
  const s = await requireSession();
  const user = s.userId ? getUser(s.userId) : undefined;
  if (!user) redirect('/login');
  const email = normalizeEmail(str(form, 'newEmail'));
  if (!email) redirect('/settings?account=email-invalid#account');
  if (!allow(`email-change:user:${user.id}`, 3, 60 * MINUTE) || !allow(`email-change:ip:${await clientIp()}`, 10, 60 * MINUTE)) redirect('/settings?account=email-slow#account');
  if (email === user.email.toLowerCase()) redirect('/settings?account=email-same#account');
  if (emailTakenByOther(email, user.id)) redirect('/settings?account=email-taken#account');

  const sent = await sendEmailChangeEmail(email, createEmailChangeToken(user.id, email));
  if (!sent.ok) redirect('/settings?account=email-send#account');
  const q = new URLSearchParams({ account: 'email-sent', to: email });
  if (sent.devLink) q.set('dev', sent.devLink);
  redirect(`/settings?${q}#account`);
}

/** A button press, not a link visit: mail scanners open links and would use them up. */
export async function confirmEmailChangeAction(form: FormData) {
  const s = await requireSession();
  if (!s.userId) redirect('/login');
  const email = consumeEmailChangeToken(str(form, 'token'), s.userId);
  if (!email) redirect('/settings?account=email-expired#account');
  if (changeUserEmail(s.userId, email) !== 'ok') redirect('/settings?account=email-taken#account');
  redirect('/settings?account=email-changed#account');
}

export async function signOutEverywhereAction() {
  const s = await requireSession();
  if (s.userId) deleteSessionsForUser(s.userId);
  deleteSession(s.token);
  await clearSessionCookie();
  redirect('/login');
}

/** Businesses only this user owns are deleted like deleteBusinessAction does; shared ones just lose this member. */
export async function deleteAccountAction(form: FormData) {
  const s = await requireSession();
  const user = s.userId ? getUser(s.userId) : undefined;
  if (!user) redirect('/login');
  if (str(form, 'confirm').toLowerCase() !== user.email.toLowerCase()) redirect('/settings?account=delete-confirm#account');
  for (const b of accountDeletionPlan(user.id).remove) {
    await removeOwnDomain(b.id);
    await disconnectQuickBooks(b.id);
    deleteBusiness(b.id);
  }
  deleteUser(user.id);
  await clearSessionCookie();
  redirect('/?deleted=account');
}

// ---------------------------------------------------------------- businesses

export async function createBusinessAction(form: FormData) {
  const s = await requireSession();
  if (!s.userId) redirect('/login');
  const name = str(form, 'businessName');
  if (!name) redirect('/welcome?error=name');
  const existing = businessesForUser(s.userId).find((b) => !b.demo);
  const business = existing ?? createBusiness({ name, ownerId: s.userId });
  if (existing) renameBusiness(existing.id, name);

  await runAsBusiness(tenantOf(business), async () =>
    saveSettings({
      businessName: name,
      senderName: str(form, 'senderName'),
      replyToEmail: normalizeEmail(str(form, 'replyToEmail')) ?? '',
      timezone: validZone(str(form, 'timezone')),
      showDemoBar: false,
    }),
  );
  setSessionBusiness(s.token, business.id);
  redirect('/import?welcome=1');
}

export async function deleteBusinessAction(form: FormData) {
  const { business } = enterBusiness(await requireBusiness());
  if (str(form, 'confirm').toLowerCase() !== business.name.toLowerCase()) redirect('/settings?error=confirm');
  await removeOwnDomain(business.id);
  await disconnectQuickBooks(business.id);
  deleteBusiness(business.id);
  const s = await currentSession();
  if (s) deleteSession(s.token);
  await clearSessionCookie();
  redirect('/?deleted=1');
}

// ---------------------------------------------------------------- demo

export async function startDemoAction() {
  if (!allow(`demo:ip:${await clientIp()}`, 10, 60 * MINUTE)) redirect('/?error=slow');
  if (!allow('demo:global', 60, 10 * MINUTE)) redirect('/?error=busy');
  const max = maxLiveDemos();
  const room = makeRoomForDemo(max);
  if (room.full) void alert('Demo cap reached', `${max} live demos (MAX_LIVE_DEMOS). Expired and idle demos are removed to make room; new ones are refused while all are in use.`);
  if (!room.ok) redirect('/?error=busy');
  const business = createBusiness({ name: 'Ferro Service Co.', demo: true });
  const { seedDemo } = await import('@/lib/sample');
  await runAsBusiness(tenantOf(business), () => seedDemo());
  await setSessionCookie(createSession({ businessId: business.id }));
  redirect('/');
}
