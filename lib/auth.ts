import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getBusiness, getSession, roleOf, SESSION_TTL, tenantOf, type Business, type Role, type Session } from './accounts';
import type { Tenant } from './tenant';

export const SESSION_COOKIE = 'recoup_session';

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL / 1000,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in session, or null. Doesn't redirect. */
export async function currentSession(): Promise<(Session & { token: string }) | null> {
  const token = await sessionToken();
  const s = token ? getSession(token) : undefined;
  return s && token ? { ...s, token } : null;
}

/** The signed-in session; sends anyone else to sign in. */
export async function requireSession(): Promise<Session & { token: string }> {
  const s = await currentSession();
  if (!s) redirect('/login');
  return s;
}

/**
 * The signed-in business for this request. Every page, layout, server action and
 * route handler that reads business data starts with
 * `enterBusiness(await requireBusiness())`.
 */
export async function requireBusiness(): Promise<Tenant & { business: Business }> {
  const s = await requireSession();
  const business = s.businessId ? getBusiness(s.businessId) : undefined;
  if (!business) redirect(s.userId ? '/welcome' : '/login');
  return { ...tenantOf(business), business };
}

/** What the session may do in a business. Anonymous demo sessions own their demo; nobody else has a role without a membership. */
export function roleIn(s: Session, business: Business): Role | undefined {
  if (!s.userId) return business.demo ? 'owner' : undefined;
  return roleOf(s.userId, business.id);
}

/**
 * Like requireBusiness, for what only an owner may do: delete the business, manage
 * the team, change email sending or QuickBooks. Members are sent back to Settings.
 */
export async function requireOwner(): Promise<Tenant & { business: Business }> {
  const t = await requireBusiness();
  if (roleIn(await requireSession(), t.business) !== 'owner') redirect('/settings?error=owner');
  return t;
}
