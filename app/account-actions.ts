'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  acceptInvite,
  businessesForUser,
  consumeLoginToken,
  createBusiness,
  createLoginToken,
  createInvite,
  createSession,
  deleteBusiness,
  deleteSession,
  discardInvite,
  findOrCreateUser,
  getUser,
  isTeamMember,
  makeRoomForDemo,
  maxLiveDemos,
  renameBusiness,
  roleOf,
  setSessionBusiness,
  tenantOf,
} from '@/lib/accounts';
import { alert } from '@/lib/alert';
import { clearSessionCookie, currentSession, requireOwner, requireSession, setSessionCookie } from '@/lib/auth';
import { normalizeEmail } from '@/lib/csv';
import { removeOwnDomain } from '@/lib/email';
import { disconnectQuickBooks } from '@/lib/quickbooks';
import { sendInviteEmail, sendLoginEmail } from '@/lib/mailer';
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

// ---------------------------------------------------------------- businesses

export async function createBusinessAction(form: FormData) {
  const s = await requireSession();
  if (!s.userId) redirect('/login');
  const name = str(form, 'businessName');
  if (!name) redirect('/welcome?error=name');
  // Only a business this person owns is set up here; a team member shouldn't rename someone else's.
  const existing = businessesForUser(s.userId).find((b) => !b.demo && roleOf(s.userId!, b.id) === 'owner');
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
  const { business } = enterBusiness(await requireOwner());
  if (str(form, 'confirm').toLowerCase() !== business.name.toLowerCase()) redirect('/settings?error=confirm');
  await removeOwnDomain(business.id);
  await disconnectQuickBooks(business.id);
  deleteBusiness(business.id);
  const s = await currentSession();
  if (s) deleteSession(s.token);
  await clearSessionCookie();
  redirect('/?deleted=1');
}

// ---------------------------------------------------------------- team

/** Switch the session to another business the person belongs to. */
export async function switchBusinessAction(form: FormData) {
  const s = await requireSession();
  const id = str(form, 'businessId');
  if (!s.userId || !roleOf(s.userId, id)) redirect('/');
  setSessionBusiness(s.token, id);
  redirect('/');
}

export async function inviteTeammateAction(form: FormData) {
  const { business } = enterBusiness(await requireOwner());
  const s = await requireSession();
  const inviter = s.userId ? getUser(s.userId) : undefined;
  if (business.demo || !inviter) redirect('/settings');
  const email = normalizeEmail(str(form, 'email'));
  if (!email) redirect('/settings?team=email#team');
  const role = str(form, 'role') === 'owner' ? 'owner' : 'member';
  if (isTeamMember(business.id, email)) redirect('/settings?team=member#team');
  if (!allow(`invite:business:${business.id}`, 10, 60 * MINUTE)) redirect('/settings?team=slow#team');

  const token = createInvite({ businessId: business.id, email, role, invitedBy: inviter.id });
  const sent = await sendInviteEmail(email, token, { businessName: business.name, inviterEmail: inviter.email });
  if (!sent.ok) {
    discardInvite(token);
    redirect('/settings?team=send#team');
  }
  const q = new URLSearchParams({ team: 'sent', to: email });
  if (sent.devLink) q.set('dev', sent.devLink);
  redirect(`/settings?${q}#team`);
}

/** A button press, not a link visit: mail scanners open links and would use them up. */
export async function acceptInviteAction(form: FormData) {
  const joined = acceptInvite(str(form, 'token'));
  if (!joined) redirect('/invite/verify?error=expired');

  const old = await currentSession();
  if (old) deleteSession(old.token);
  await setSessionCookie(createSession({ userId: joined.user.id, businessId: joined.business.id }));
  redirect('/');
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
