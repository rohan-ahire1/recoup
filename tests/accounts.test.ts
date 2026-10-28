import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'recoup-accounts-'));

const a = await import('../lib/accounts');
const { businessDbFile } = await import('../lib/db');
const svc = await import('../lib/service');
const repo = await import('../lib/repo');
const { runAsBusiness } = await import('../lib/tenant');
const { isDemoMode, providerStatus } = await import('../lib/providers');

const T0 = Date.parse('2026-10-01T12:00:00Z');

describe('sign-in links', () => {
  it('work once', () => {
    const token = a.createLoginToken(' Sam@Example.com ', T0);
    expect(a.consumeLoginToken(token, T0 + 1000)).toBe('sam@example.com');
    expect(a.consumeLoginToken(token, T0 + 2000)).toBeNull();
  });

  it('expire after 15 minutes', () => {
    const token = a.createLoginToken('sam@example.com', T0);
    expect(a.consumeLoginToken(token, T0 + a.LOGIN_TOKEN_TTL + 1)).toBeNull();
  });

  it('reject made-up tokens', () => {
    expect(a.consumeLoginToken('nope', T0)).toBeNull();
  });
});

describe('users and sessions', () => {
  it('treats email case-insensitively', () => {
    const u1 = a.findOrCreateUser('Lee@Example.com', T0);
    const u2 = a.findOrCreateUser('lee@example.com', T0);
    expect(u1.id).toBe(u2.id);
  });

  it('finds a session by its token and slides the expiry', () => {
    const user = a.findOrCreateUser('kai@example.com', T0);
    const b = a.createBusiness({ name: 'Kai Co', ownerId: user.id }, T0);
    const token = a.createSession({ userId: user.id, businessId: b.id }, T0);
    expect(a.getSession(token, T0 + 1000)).toMatchObject({ userId: user.id, businessId: b.id });
    // Used 10 days later, it's good for another 30 from then.
    const later = T0 + 10 * 86_400_000;
    expect(a.getSession(token, later)).toBeTruthy();
    expect(a.getSession(token, later + a.SESSION_TTL - 1000)).toBeTruthy();
    a.deleteSession(token);
    expect(a.getSession(token, T0)).toBeUndefined();
    expect(a.businessesForUser(user.id).map((x) => x.name)).toEqual(['Kai Co']);
  });
});

describe('payment links', () => {
  it('lead to the business that owns the customer', async () => {
    const b = a.createBusiness({ name: 'Pay Co' });
    const token = await runAsBusiness(a.tenantOf(b), async () => {
      await svc.importCsv('Customer,Email,Invoice,Amount,Due\nDana,dana@x.co,#9,100,2026-01-01');
      return repo.listCustomers()[0].payToken;
    });
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(a.businessForPayToken(token)?.id).toBe(b.id);
    expect(a.businessForPayToken('missing')).toBeUndefined();
  });
});

describe('demo workspaces', () => {
  it('are demo mode and never connected to real sending', () => {
    const demo = a.createBusiness({ name: 'Demo', demo: true });
    runAsBusiness(a.tenantOf(demo), () => {
      expect(isDemoMode()).toBe(true);
      expect(providerStatus().email).toBe('mock');
    });
  });

  it('are skipped by the scheduler and cleaned up when they expire', () => {
    const demo = a.createBusiness({ name: 'Old demo', demo: true }, T0);
    runAsBusiness(a.tenantOf(demo), () => repo.listCustomers());
    expect(a.listLiveBusinesses().some((b) => b.id === demo.id)).toBe(false);
    expect(fs.existsSync(businessDbFile(demo.id))).toBe(true);
    const session = a.createSession({ businessId: demo.id }, T0);

    a.cleanUp(T0 + a.DEMO_TTL + 1);
    expect(a.getBusiness(demo.id)).toBeUndefined();
    expect(fs.existsSync(businessDbFile(demo.id))).toBe(false);
    expect(a.getSession(session, T0 + 1000)).toBeUndefined();
  });
});

describe('the live demo cap', () => {
  // Far enough ahead that demos made by other tests have expired.
  const T1 = Date.parse('2031-01-01T12:00:00Z');
  const MIN = 60_000;

  it('counts only demos that have not expired', () => {
    const before = a.countLiveDemos(T1);
    const demo = a.createBusiness({ name: 'Counted', demo: true }, T1);
    a.createBusiness({ name: 'Real Co' }, T1);
    expect(a.countLiveDemos(T1 + 1)).toBe(before + 1);
    expect(a.countLiveDemos(T1 + a.DEMO_TTL + 1)).toBe(0);
    a.deleteBusiness(demo.id);
  });

  it('removes the oldest idle demo to make room for a third', () => {
    const t = T1 + 10 * a.DEMO_TTL;
    const expired = a.createBusiness({ name: 'Expired', demo: true }, t - a.DEMO_TTL - 1);
    const idle = a.createBusiness({ name: 'Idle', demo: true }, t);
    const busy = a.createBusiness({ name: 'Busy', demo: true }, t + MIN);
    runAsBusiness(a.tenantOf(idle), () => repo.listCustomers());
    a.createSession({ businessId: idle.id }, t);
    const busySession = a.createSession({ businessId: busy.id }, t + MIN);
    expect(a.getSession(busySession, t + 80 * MIN)).toBeTruthy();

    expect(a.makeRoomForDemo(2, t + 90 * MIN)).toEqual({ ok: true, full: true });
    expect(a.getBusiness(expired.id)).toBeUndefined();
    expect(a.getBusiness(idle.id)).toBeUndefined();
    expect(fs.existsSync(businessDbFile(idle.id))).toBe(false);
    expect(a.getBusiness(busy.id)).toBeTruthy();
    expect(a.countLiveDemos(t + 90 * MIN)).toBe(1);
    a.deleteBusiness(busy.id);
  });

  it('refuses cleanly when every demo is in use', () => {
    const t = T1 + 20 * a.DEMO_TTL;
    const one = a.createBusiness({ name: 'One', demo: true }, t);
    const two = a.createBusiness({ name: 'Two', demo: true }, t + 50 * MIN);
    const s1 = a.createSession({ businessId: one.id }, t);
    // Two has no session, but it's less than an hour old.
    expect(a.getSession(s1, t + 70 * MIN)).toBeTruthy();

    expect(a.makeRoomForDemo(2, t + 90 * MIN)).toEqual({ ok: false, full: true });
    expect(a.getBusiness(one.id)).toBeTruthy();
    expect(a.getBusiness(two.id)).toBeTruthy();
    expect(a.makeRoomForDemo(3, t + 90 * MIN)).toEqual({ ok: true, full: false });
    a.deleteBusiness(one.id);
    a.deleteBusiness(two.id);
  });
});

describe('deleting a business', () => {
  it('removes its rows, data file and payment links', async () => {
    const b = a.createBusiness({ name: 'Gone Co' });
    const token = await runAsBusiness(a.tenantOf(b), async () => {
      await svc.importCsv('Customer,Email,Invoice,Amount,Due\nDana,dana@x.co,#9,100,2026-01-01');
      return repo.listCustomers()[0].payToken;
    });
    a.deleteBusiness(b.id);
    expect(a.getBusiness(b.id)).toBeUndefined();
    expect(a.businessForPayToken(token)).toBeUndefined();
    expect(fs.existsSync(businessDbFile(b.id))).toBe(false);
  });
});
