import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'recoup-qb-'));
process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.QUICKBOOKS_CLIENT_ID = 'client';
process.env.QUICKBOOKS_CLIENT_SECRET = 'secret';

const a = await import('../lib/accounts');
const qb = await import('../lib/quickbooks');
const svc = await import('../lib/service');
const repo = await import('../lib/repo');
const box = await import('../lib/secret-box');
const { saveSettings } = await import('../lib/settings');
const { runAsBusiness } = await import('../lib/tenant');

afterEach(() => vi.unstubAllGlobals());

const customers: import('../lib/quickbooks').QbCustomer[] = [
  { Id: '1', DisplayName: 'Harbor Bakery', CompanyName: 'Harbor Bakery', GivenName: 'Ana', FamilyName: 'Ruiz', PrimaryEmailAddr: { Address: 'ana@harbor.test, books@harbor.test' } },
  { Id: '2', DisplayName: 'Sam Lee', GivenName: 'Sam', FamilyName: 'Lee', Mobile: { FreeFormNumber: '(555) 201-3344' } },
];

const invoice = (o: Partial<import('../lib/quickbooks').QbInvoice> & { Id: string }): import('../lib/quickbooks').QbInvoice => ({
  DocNumber: `10${o.Id}`,
  TxnDate: '2026-08-01',
  DueDate: '2026-08-31',
  TotalAmt: 500,
  Balance: 500,
  CustomerRef: { value: '1' },
  Line: [{ DetailType: 'SalesItemLineDetail', Description: 'Wedding cake' }],
  ...o,
});

describe('mapping QuickBooks records', () => {
  it('turns invoices and customers into Recoup rows', () => {
    const rows = qb.mapInvoices(
      [invoice({ Id: '1' }), invoice({ Id: '2', CustomerRef: { value: '2' }, DocNumber: undefined, Balance: 0, LinkedTxn: [{ TxnId: '90', TxnType: 'Payment' }] })],
      customers,
      new Map([['90', '2026-09-03']]),
    );
    expect(rows[0]).toMatchObject({
      qbId: '1',
      number: '101',
      description: 'Wedding cake',
      amountCents: 50000,
      paidCents: 0,
      dueDate: '2026-08-31',
      paidDate: null,
      customer: { qbId: '1', name: 'Harbor Bakery', type: 'business', contactName: 'Ana Ruiz', email: 'ana@harbor.test', phone: null },
    });
    expect(rows[1]).toMatchObject({ number: 'QB-2', paidCents: 50000, paidDate: '2026-09-03', customer: { type: 'individual', contactName: null, phone: '+15552013344' } });
  });
});

describe('syncing invoices', () => {
  const T = Date.parse('2026-10-14T15:00:00Z');
  const rows = (invs: import('../lib/quickbooks').QbInvoice[]) => qb.mapInvoices(invs, customers, new Map());

  it('adds new invoices, links ones imported from a file, and never duplicates', async () => {
    const b = a.createBusiness({ name: 'Sync Co' });
    await runAsBusiness(a.tenantOf(b), async () => {
      await svc.importCsv('Customer,Email,Invoice,Amount,Due\nHarbor Bakery,ana@harbor.test,101,500,2026-08-31', T);
      const first = await svc.syncInvoices(rows([invoice({ Id: '1' }), invoice({ Id: '2', CustomerRef: { value: '2' } })]), T);
      expect(first).toMatchObject({ added: 1, updated: 1 });
      const again = await svc.syncInvoices(rows([invoice({ Id: '1' }), invoice({ Id: '2', CustomerRef: { value: '2' } })]), T);
      expect(again).toEqual({ added: 0, updated: 0, paid: 0 });
      expect(repo.listCustomers().map((c) => c.name).sort()).toEqual(['Harbor Bakery', 'Sam Lee']);
    });
  });

  it('a payment recorded in QuickBooks closes the case and stops reminders', async () => {
    const b = a.createBusiness({ name: 'Paid Co' });
    await runAsBusiness(a.tenantOf(b), async () => {
      await svc.syncInvoices(rows([invoice({ Id: '1' })]), T);
      const customer = repo.listCustomers()[0];
      expect(repo.getOpenCase(customer.id)?.status).toBe('active');

      // Half paid, then the rest.
      expect((await svc.syncInvoices(rows([invoice({ Id: '1', Balance: 250 })]), T + 1000)).paid).toBe(1);
      expect(repo.getOpenCase(customer.id)).toBeTruthy();
      await svc.syncInvoices(rows([invoice({ Id: '1', Balance: 0 })]), T + 2000);
      expect(repo.getOpenCase(customer.id)).toBeUndefined();
      expect(repo.listPayments(customer.id).map((p) => p.amountCents)).toEqual([25000, 25000]);

      // The same QuickBooks state again records nothing new.
      expect((await svc.syncInvoices(rows([invoice({ Id: '1', Balance: 0 })]), T + 3000)).paid).toBe(0);
    });
  });

  it('doesn’t count a payment twice when the owner already recorded it here', async () => {
    const b = a.createBusiness({ name: 'Manual Co' });
    await runAsBusiness(a.tenantOf(b), async () => {
      await svc.syncInvoices(rows([invoice({ Id: '1' })]), T);
      const customer = repo.listCustomers()[0];
      svc.recordPayment({ customerId: customer.id, amountCents: 50000, source: 'manual', now: T + 500 });
      await svc.syncInvoices(rows([invoice({ Id: '1', Balance: 0 })]), T + 1000);
      expect(repo.listPayments(customer.id)).toHaveLength(1);
    });
  });

  it('writes off an invoice voided in QuickBooks', async () => {
    const b = a.createBusiness({ name: 'Void Co' });
    await runAsBusiness(a.tenantOf(b), async () => {
      await svc.syncInvoices(rows([invoice({ Id: '1' })]), T);
      await svc.syncInvoices(rows([invoice({ Id: '1', TotalAmt: 0, Balance: 0 })]), T + 1000);
      expect(repo.listCustomerInvoices(repo.listCustomers()[0].id)[0].status).toBe('written_off');
    });
  });
});

describe('the connection', () => {
  it('keeps tokens encrypted and refreshes them when they expire', async () => {
    const b = a.createBusiness({ name: 'Live Co' });
    const now = Date.now();
    a.saveQuickBooks({
      businessId: b.id,
      realmId: '4620816365',
      companyName: 'Live Co',
      accessToken: box.seal('old-access'),
      accessExpiresAt: now - 1000,
      refreshToken: box.seal('old-refresh'),
      refreshExpiresAt: now + 86_400_000,
      connectedAt: now,
    });
    const stored = a.getQuickBooks(b.id)!;
    expect(stored.accessToken).not.toContain('old-access');

    const calls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: { headers: Record<string, string>; body?: URLSearchParams }) => {
      calls.push(url);
      if (url.includes('/tokens/bearer')) {
        expect(init.body?.get('refresh_token')).toBe('old-refresh');
        return Response.json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600, x_refresh_token_expires_in: 8_640_000 });
      }
      expect(init.headers.Authorization).toBe('Bearer new-access');
      const q = new URL(url).searchParams.get('query') ?? '';
      if (q.startsWith('SELECT * FROM Invoice WHERE TxnDate')) return Response.json({ QueryResponse: { Invoice: [invoice({ Id: '1' })] } });
      if (q.startsWith('SELECT * FROM Customer')) return Response.json({ QueryResponse: { Customer: customers } });
      return Response.json({ QueryResponse: {} });
    });

    await runAsBusiness(a.tenantOf(b), async () => {
      saveSettings({ timezone: 'America/New_York' });
      expect(await qb.syncQuickBooks(now)).toMatchObject({ added: 1 });
      expect(repo.listCustomers()[0].name).toBe('Harbor Bakery');
    });
    const after = a.getQuickBooks(b.id)!;
    expect(box.open(after.refreshToken)).toBe('new-refresh');
    expect(after.lastSyncAt).toBe(now);
    expect(qb.syncDue(after, now + 60_000)).toBe(false);
    expect(qb.syncDue(after, now + 3_600_000)).toBe(true);
    expect(calls.filter((u) => u.includes('/tokens/bearer'))).toHaveLength(1);
  });

  it('notices when the business disconnected from inside QuickBooks', async () => {
    const b = a.createBusiness({ name: 'Gone Co' });
    const now = Date.now();
    a.saveQuickBooks({
      businessId: b.id,
      realmId: '1',
      companyName: null,
      accessToken: box.seal('a'),
      accessExpiresAt: now - 1,
      refreshToken: box.seal('r'),
      refreshExpiresAt: now + 1000,
      connectedAt: now,
    });
    vi.stubGlobal('fetch', async () => Response.json({ error: 'invalid_grant' }, { status: 400 }));
    await expect(runAsBusiness(a.tenantOf(b), () => qb.syncQuickBooks(now))).rejects.toThrow();
    expect(a.getQuickBooks(b.id)?.lastError).toBe('disconnected');
    expect(qb.syncDue(a.getQuickBooks(b.id)!, now + 7_200_000)).toBe(false);
  });
});
