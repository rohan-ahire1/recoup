import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'recoup-email-'));
process.env.RESEND_API_KEY = 're_test';
process.env.EMAIL_FROM = 'reminders@mail.recoup.test';

const a = await import('../lib/accounts');
const email = await import('../lib/email');
const svc = await import('../lib/service');
const repo = await import('../lib/repo');
const { getSettings, saveSettings } = await import('../lib/settings');
const { runAsBusiness } = await import('../lib/tenant');
const { verifySvix } = await import('../lib/svix');

const sent: Record<string, unknown>[] = [];
let nextId = 0;

beforeEach(() => {
  sent.length = 0;
  vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: `em_${++nextId}` }), { status: 200 });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.EMAIL_DAILY_CAP;
});

const CSV = 'Customer,Email,Invoice,Amount,Due\nDana,dana@x.co,#1,100,2026-01-01\nEli,eli@x.co,#2,200,2026-01-01\nFay,fay@x.co,#3,300,2026-01-01';

async function autoBusiness(name: string) {
  const b = a.createBusiness({ name });
  await runAsBusiness(a.tenantOf(b), async () => {
    saveSettings({ businessName: name, replyToEmail: 'owner@harbor.test', mailingAddress: '1 Pier Rd, Portland, ME', deliveryMode: 'auto' });
    await svc.importCsv(CSV);
  });
  return b;
}

describe('the shared sender', () => {
  it('sends as "Business via Recoup" with replies to the business and its address in the footer', async () => {
    await autoBusiness('Harbor Bakery');
    expect(sent).toHaveLength(3);
    expect(sent[0]).toMatchObject({ from: 'Harbor Bakery via Recoup <reminders@mail.recoup.test>', reply_to: 'owner@harbor.test' });
    expect(String(sent[0].text)).toMatch(/--\nHarbor Bakery\n1 Pier Rd, Portland, ME\nReply to this email to reach them\.$/);
  });

  it('holds reminders back once the daily cap is reached', async () => {
    process.env.EMAIL_DAILY_CAP = '2';
    const b = await autoBusiness('Capped Co');
    expect(sent).toHaveLength(2);
    runAsBusiness(a.tenantOf(b), () => {
      const statuses = repo.listCustomers().flatMap((c) => repo.listCustomerMessages(c.id).map((m) => m.status));
      expect(statuses.sort()).toEqual(['ready', 'sent', 'sent']);
    });
  });

  it('sends from the business’s own address once its domain is verified', async () => {
    const b = a.createBusiness({ name: 'Own Domain Co' });
    a.saveEmailDomain({ businessId: b.id, fromEmail: 'billing@own.test', domain: 'own.test', resendId: 'd_1', status: 'verified', records: [] });
    runAsBusiness(a.tenantOf(b), () => {
      saveSettings({ businessName: 'Own Domain Co.', replyToEmail: 'me@own.test' });
      expect(email.senderFor(b.id, getSettings())).toEqual({ from: 'Own Domain Co <billing@own.test>', replyTo: 'me@own.test' });
    });
  });
});

describe('bounces and complaints', () => {
  it('a bounce fails the message and flags the customer', async () => {
    const b = await autoBusiness('Bounce Co');
    expect(email.handleEmailEvent('email.bounced', 'nope')).toBe(false);
    const id = `em_${nextId}`;
    expect(email.handleEmailEvent('email.bounced', id, 'Mailbox does not exist')).toBe(true);
    // Resend retries webhooks; the second delivery changes nothing.
    expect(email.handleEmailEvent('email.bounced', id)).toBe(false);
    runAsBusiness(a.tenantOf(b), () => {
      const m = repo.listCustomers().flatMap((c) => repo.listCustomerMessages(c.id)).find((x) => x.status === 'failed');
      expect(m?.error).toBe('Bounced: Mailbox does not exist');
      const c = repo.getOpenCase(m!.customerId)!;
      expect(c.needsAttention).toBe(true);
    });
  });

  it('two spam complaints in a week pause automatic email for that business', async () => {
    const b = await autoBusiness('Spammy Co');
    const ids = [`em_${nextId}`, `em_${nextId - 1}`];
    email.handleEmailEvent('email.complained', ids[0]);
    expect(email.sendingBlocked(b.id)).toBeNull();
    email.handleEmailEvent('email.complained', ids[1]);
    expect(email.sendingBlocked(b.id)).toMatch(/spam/);
    runAsBusiness(a.tenantOf(b), () => {
      expect(repo.listCustomers().map((c) => repo.getOpenCase(c.id)?.status).filter((s) => s === 'paused')).toHaveLength(2);
    });
  });
});

describe('webhook signatures', () => {
  const secret = `whsec_${Buffer.from('a secret key for tests').toString('base64')}`;
  const sign = (id: string, ts: string, body: string) =>
    `v1,${createHmac('sha256', Buffer.from('a secret key for tests')).update(`${id}.${ts}.${body}`).digest('base64')}`;

  it('accepts a correct, fresh signature and nothing else', () => {
    const now = Date.parse('2026-10-14T12:00:00Z');
    const ts = String(now / 1000);
    const body = '{"type":"email.bounced"}';
    expect(verifySvix(secret, { id: 'msg_1', timestamp: ts, signature: `v1,bad ${sign('msg_1', ts, body)}` }, body, now)).toBe(true);
    expect(verifySvix(secret, { id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, body) }, body + ' ', now)).toBe(false);
    expect(verifySvix(secret, { id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, body) }, body, now + 10 * 60_000)).toBe(false);
    expect(verifySvix(secret, { id: null, timestamp: ts, signature: sign('msg_1', ts, body) }, body, now)).toBe(false);
  });
});
