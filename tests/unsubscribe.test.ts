import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'recoup-unsub-'));
process.env.RESEND_API_KEY = 're_test';
process.env.EMAIL_FROM = 'reminders@mail.recoup.test';
process.env.PUBLIC_BASE_URL = 'https://recoup.test';

const a = await import('../lib/accounts');
const svc = await import('../lib/service');
const repo = await import('../lib/repo');
const { saveSettings } = await import('../lib/settings');
const { runAsBusiness } = await import('../lib/tenant');
const route = await import('../app/api/unsubscribe/[token]/route');

const sent: Record<string, unknown>[] = [];
beforeEach(() => {
  sent.length = 0;
  vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ id: `em_${sent.length}` }), { status: 200 });
  });
});
afterEach(() => vi.unstubAllGlobals());

const CSV = [
  'Customer,Email,Phone,Invoice,Amount,Due',
  'Dana,dana@x.co,,#1,100,2026-01-01',
  'Eli,eli@x.co,(312) 555-0123,#2,200,2026-01-01',
].join('\n');

async function business(name: string, mode: 'auto' | 'prepare' = 'prepare') {
  const b = a.createBusiness({ name });
  const tenant = a.tenantOf(b);
  await runAsBusiness(tenant, async () => {
    saveSettings({ businessName: name, replyToEmail: 'owner@x.test', mailingAddress: '1 Pier Rd', deliveryMode: mode });
    await svc.importCsv(CSV);
  });
  const token = (n: string) => runAsBusiness(tenant, () => repo.findCustomer({ name: n })!.payToken);
  return { tenant, token };
}

const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
const oneClick = (token: string, body = 'List-Unsubscribe=One-Click') =>
  route.POST(new Request(`https://recoup.test/api/unsubscribe/${token}`, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }), ctx(token));

describe('unsubscribe route', () => {
  it('opts out on a one-click POST and stops there on a GET', async () => {
    const { tenant, token } = await business('Harbor Bakery');
    const t = token('Dana');
    const get = await route.GET(new Request(`https://recoup.test/api/unsubscribe/${t}`), ctx(t));
    expect(get.status).toBe(200);
    expect(await get.text()).toContain('method="post"');
    expect(runAsBusiness(tenant, () => repo.findCustomer({ name: 'Dana' })!.optedOutEmail)).toBe(false);

    expect((await oneClick(t, 'nonsense=1')).status).toBe(400);
    expect(runAsBusiness(tenant, () => repo.findCustomer({ name: 'Dana' })!.optedOutEmail)).toBe(false);

    expect((await oneClick(t)).status).toBe(200);
    runAsBusiness(tenant, () => {
      const dana = repo.findCustomer({ name: 'Dana' })!;
      expect(dana.optedOutEmail).toBe(true);
      expect(repo.listEvents(dana.id).filter((e) => e.detail?.startsWith('Unsubscribed from email.'))).toHaveLength(1);
    });
    // Repeating it changes nothing.
    expect((await oneClick(t)).status).toBe(200);
    runAsBusiness(tenant, () => expect(repo.listEvents(repo.findCustomer({ name: 'Dana' })!.id).filter((e) => e.type === 'opted_out')).toHaveLength(1));
  });

  it('is rate limited per token', async () => {
    const { token } = await business('Limit Co');
    const t = token('Dana');
    const statuses: number[] = [];
    for (let i = 0; i < 22; i++) statuses.push((await oneClick(t, 'x=1')).status);
    expect(statuses.slice(0, 20).every((s) => s === 400)).toBe(true);
    expect(statuses[21]).toBe(429);
  });
});

describe('after unsubscribing', () => {
  it('marks a customer with no phone unreachable and prepares no email', async () => {
    const { tenant, token } = await business('No Phone Co');
    await oneClick(token('Dana'));
    await runAsBusiness(tenant, async () => {
      const dana = repo.findCustomer({ name: 'Dana' })!;
      await svc.runDueActions();
      expect(repo.getOpenCase(dana.id)?.status).toBe('unreachable');
      expect(repo.listCustomerMessages(dana.id).filter((m) => m.status === 'ready')).toHaveLength(0);
    });
  });

  it('switches a customer with a phone to text', async () => {
    const { tenant, token } = await business('Phone Co');
    await oneClick(token('Eli'));
    await runAsBusiness(tenant, async () => {
      const eli = repo.findCustomer({ name: 'Eli' })!;
      expect(eli.preferredChannel).toBe('sms');
      const open = repo.getOpenCase(eli.id)!;
      expect(open.status).not.toBe('unreachable');
      const ready = repo.listCustomerMessages(eli.id).filter((m) => m.status === 'ready');
      expect(ready.map((m) => m.channel)).toEqual(['sms']);
    });
  });

  it('lets the business undo it', async () => {
    const { tenant, token } = await business('Undo Co');
    await oneClick(token('Dana'));
    await runAsBusiness(tenant, async () => {
      const dana = repo.findCustomer({ name: 'Dana' })!;
      await svc.resubscribeEmail(dana.id);
      expect(repo.getCustomer(dana.id)!.optedOutEmail).toBe(false);
      expect(repo.getOpenCase(dana.id)?.status).toBe('active');
      expect(repo.listEvents(dana.id).some((e) => e.type === 'opted_in')).toBe(true);
    });
  });
});

describe('reminder emails', () => {
  it('carry the List-Unsubscribe headers and a footer link, and skip opted-out customers', async () => {
    const b = a.createBusiness({ name: 'Header Co' });
    const tenant = a.tenantOf(b);
    await runAsBusiness(tenant, async () => {
      saveSettings({ businessName: 'Header Co', replyToEmail: 'owner@x.test', mailingAddress: '1 Pier Rd', deliveryMode: 'auto' });
      await svc.importCsv(CSV);
    });
    expect(sent).toHaveLength(2);
    for (const mail of sent) {
      const to = (mail.to as string[])[0];
      const name = to === 'dana@x.co' ? 'Dana' : 'Eli';
      const t = runAsBusiness(tenant, () => repo.findCustomer({ name })!.payToken);
      const url = `https://recoup.test/api/unsubscribe/${t}`;
      expect(mail.headers).toEqual({ 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' });
      expect(String(mail.text)).toContain(`Don't want these emails? Unsubscribe: ${url}`);
    }

    // A customer who already opted out is never emailed again.
    const b2 = a.createBusiness({ name: 'Quiet Co' });
    const t2 = a.tenantOf(b2);
    sent.length = 0;
    await runAsBusiness(t2, async () => {
      saveSettings({ businessName: 'Quiet Co', replyToEmail: 'owner@x.test', mailingAddress: '1 Pier Rd', deliveryMode: 'auto' });
      await svc.importCsv('Customer,Email,Invoice,Amount,Due\nDana,dana@x.co,#1,100,2026-01-01');
      const dana = repo.findCustomer({ name: 'Dana' })!;
      expect(sent).toHaveLength(1);
      svc.unsubscribeEmail(dana.id);
      await svc.importCsv('Customer,Email,Invoice,Amount,Due\nDana,dana@x.co,#9,50,2026-01-02');
      await svc.runDueActions(Date.now() + 40 * 86_400_000);
    });
    expect(sent).toHaveLength(1);
  });
});
