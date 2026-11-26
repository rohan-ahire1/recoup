import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'recoup-account-settings-'));

// The request: a cookie jar and the caller's IP. redirect() throws, as it does in Next.
const { jar, hdrs, sendEmailChange, removeOwnDomain, disconnectQuickBooks } = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  hdrs: new Map<string, string>(),
  sendEmailChange: vi.fn(),
  removeOwnDomain: vi.fn(),
  disconnectQuickBooks: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k)! } : undefined),
    set: (k: string, v: string) => void jar.set(k, v),
    delete: (k: string) => void jar.delete(k),
  }),
  headers: async () => ({ get: (k: string) => hdrs.get(k) ?? null }),
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock('../lib/mailer', () => ({ sendEmailChangeEmail: sendEmailChange, sendLoginEmail: vi.fn() }));
vi.mock('../lib/email', () => ({ removeOwnDomain }));
vi.mock('../lib/quickbooks', () => ({ disconnectQuickBooks }));

const a = await import('../lib/accounts');
const act = await import('../app/account-actions');
const { businessDbFile } = await import('../lib/db');
const { runAsBusiness } = await import('../lib/tenant');
const repo = await import('../lib/repo');

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
/** Runs an action and returns where it redirected to. */
async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    const m = /^REDIRECT (.*)$/.exec((e as Error).message);
    if (m) return m[1];
    throw e;
  }
  throw new Error('did not redirect');
}
const signIn = (userId: string, businessId: string | null = null) => void jar.set('recoup_session', a.createSession({ userId, businessId }));
let n = 0;
const newUser = () => a.findOrCreateUser(`user${++n}@example.com`);

beforeEach(() => {
  jar.clear();
  hdrs.clear();
  hdrs.set('x-forwarded-for', `10.0.0.${++n}`);
  sendEmailChange.mockReset().mockResolvedValue({ ok: true });
  removeOwnDomain.mockReset();
  disconnectQuickBooks.mockReset();
});

describe('change email', () => {
  it('sends a link to the new address and changes nothing until it is confirmed', async () => {
    const u = newUser();
    signIn(u.id);
    const to = await redirectOf(() => act.requestEmailChangeAction(form({ newEmail: 'New@Example.com' })));
    expect(to).toContain('account=email-sent');
    expect(sendEmailChange).toHaveBeenCalledWith('new@example.com', expect.any(String));
    expect(a.getUser(u.id)!.email).toBe(u.email);

    const token = sendEmailChange.mock.calls[0][1] as string;
    expect(await redirectOf(() => act.confirmEmailChangeAction(form({ token })))).toContain('account=email-changed');
    expect(a.getUser(u.id)!.email).toBe('new@example.com');
    // Once only.
    expect(await redirectOf(() => act.confirmEmailChangeAction(form({ token })))).toContain('email-expired');
  });

  it('refuses an email another user already has, when asking and when confirming', async () => {
    const u = newUser();
    const other = newUser();
    signIn(u.id);
    expect(await redirectOf(() => act.requestEmailChangeAction(form({ newEmail: other.email.toUpperCase() })))).toContain('email-taken');
    expect(sendEmailChange).not.toHaveBeenCalled();

    // Someone signs up with the address after the link went out.
    await redirectOf(() => act.requestEmailChangeAction(form({ newEmail: 'late@example.com' })));
    const token = sendEmailChange.mock.calls[0][1] as string;
    a.findOrCreateUser('late@example.com');
    expect(await redirectOf(() => act.confirmEmailChangeAction(form({ token })))).toContain('email-taken');
    expect(a.getUser(u.id)!.email).toBe(u.email);
  });

  it('only works for the user it was made for, and is not a sign-in link', async () => {
    const u = newUser();
    const other = newUser();
    const token = a.createEmailChangeToken(u.id, 'mine@example.com');
    signIn(other.id);
    expect(await redirectOf(() => act.confirmEmailChangeAction(form({ token })))).toContain('email-expired');
    expect(a.getUser(other.id)!.email).not.toBe('mine@example.com');
    expect(a.consumeLoginToken(token)).toBeNull();
    // A sign-in link can't change an email.
    const login = a.createLoginToken('x@example.com');
    signIn(u.id);
    expect(await redirectOf(() => act.confirmEmailChangeAction(form({ token: login })))).toContain('email-expired');
  });

  it('rejects bad and unchanged addresses', async () => {
    const u = newUser();
    signIn(u.id);
    expect(await redirectOf(() => act.requestEmailChangeAction(form({ newEmail: 'nope' })))).toContain('email-invalid');
    expect(await redirectOf(() => act.requestEmailChangeAction(form({ newEmail: u.email })))).toContain('email-same');
    expect(sendEmailChange).not.toHaveBeenCalled();
  });

  it('is rate-limited per user', async () => {
    const u = newUser();
    signIn(u.id);
    const results: string[] = [];
    for (let i = 0; i < 4; i++) results.push(await redirectOf(() => act.requestEmailChangeAction(form({ newEmail: `try${i}-${u.id}@example.com` }))));
    expect(results.slice(0, 3).every((r) => r.includes('email-sent'))).toBe(true);
    expect(results[3]).toContain('email-slow');
    expect(sendEmailChange).toHaveBeenCalledTimes(3);
  });
});

describe('sign out everywhere', () => {
  it('deletes every session for the user, including this one, and leaves others alone', async () => {
    const u = newUser();
    const other = newUser();
    const phone = a.createSession({ userId: u.id });
    const laptop = a.createSession({ userId: u.id });
    const theirs = a.createSession({ userId: other.id });
    signIn(u.id);
    const mine = jar.get('recoup_session')!;

    expect(await redirectOf(() => act.signOutEverywhereAction())).toBe('/login');
    for (const t of [phone, laptop, mine]) expect(a.getSession(t)).toBeUndefined();
    expect(a.getSession(theirs)).toBeTruthy();
    expect(jar.has('recoup_session')).toBe(false);
  });
});

describe('delete my account', () => {
  it('needs the account email typed exactly and deletes nothing otherwise', async () => {
    const u = newUser();
    const b = a.createBusiness({ name: 'Keep Co', ownerId: u.id });
    signIn(u.id, b.id);
    expect(await redirectOf(() => act.deleteAccountAction(form({ confirm: 'wrong@example.com' })))).toContain('delete-confirm');
    expect(a.getUser(u.id)).toBeTruthy();
    expect(a.getBusiness(b.id)).toBeTruthy();
    expect(removeOwnDomain).not.toHaveBeenCalled();
  });

  it('deletes sole-owned businesses fully and the user with their sessions', async () => {
    const u = newUser();
    const b1 = a.createBusiness({ name: 'Solo One', ownerId: u.id });
    const b2 = a.createBusiness({ name: 'Solo Two', ownerId: u.id });
    await runAsBusiness(a.tenantOf(b1), async () => repo.listCustomers());
    const other = a.createSession({ userId: u.id });
    signIn(u.id, b1.id);

    expect(await redirectOf(() => act.deleteAccountAction(form({ confirm: u.email.toUpperCase() })))).toBe('/?deleted=account');
    for (const b of [b1, b2]) {
      expect(a.getBusiness(b.id)).toBeUndefined();
      expect(removeOwnDomain).toHaveBeenCalledWith(b.id);
      expect(disconnectQuickBooks).toHaveBeenCalledWith(b.id);
    }
    expect(fs.existsSync(businessDbFile(b1.id))).toBe(false);
    expect(a.getUser(u.id)).toBeUndefined();
    expect(a.getSession(other)).toBeUndefined();
    expect(jar.has('recoup_session')).toBe(false);
    // The address can sign up again as a fresh user.
    expect(a.findOrCreateUser(u.email).id).not.toBe(u.id);
  });

  it('keeps a business that has another owner, and only removes the membership', async () => {
    const u = newUser();
    const partner = newUser();
    const shared = a.createBusiness({ name: 'Shared Co', ownerId: partner.id });
    const solo = a.createBusiness({ name: 'Solo Co', ownerId: u.id });
    await runAsBusiness(a.tenantOf(shared), async () => repo.listCustomers());
    // Add u as a second owner of the shared business.
    const { DatabaseSync } = await import('node:sqlite');
    const raw = new DatabaseSync(path.join(process.env.DATA_DIR!, 'accounts.db'));
    raw.prepare("INSERT INTO memberships (user_id, business_id, role, created_at) VALUES (?, ?, 'owner', ?)").run(u.id, shared.id, Date.now());
    raw.close();

    expect(a.accountDeletionPlan(u.id)).toMatchObject({ remove: [{ id: solo.id }], leave: [{ id: shared.id }] });
    signIn(u.id, shared.id);
    await redirectOf(() => act.deleteAccountAction(form({ confirm: u.email })));

    expect(a.getBusiness(shared.id)).toBeTruthy();
    expect(fs.existsSync(businessDbFile(shared.id))).toBe(true);
    expect(a.businessesForUser(partner.id).map((b) => b.id)).toEqual([shared.id]);
    expect(removeOwnDomain).not.toHaveBeenCalledWith(shared.id);
    expect(disconnectQuickBooks).not.toHaveBeenCalledWith(shared.id);
    expect(a.getBusiness(solo.id)).toBeUndefined();
    expect(a.getUser(u.id)).toBeUndefined();
    expect(a.getUser(partner.id)).toBeTruthy();
  });
});
