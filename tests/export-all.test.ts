import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'recoup-export-'));

let signedIn: unknown;
vi.mock('@/lib/auth', () => ({ requireBusiness: async () => signedIn }));

const { createBusiness, tenantOf } = await import('../lib/accounts');
const { runAsBusiness } = await import('../lib/tenant');
const { saveSettings } = await import('../lib/settings');
const svc = await import('../lib/service');
const { GET } = await import('../app/api/export/all/route');

const csv = (name: string) => ['Customer,Email,Invoice,Amount,Due', `${name},x@x.co,#1,100,2026-01-01`].join('\n');

const A = createBusiness({ name: 'Acme Plumbing' });
const B = createBusiness({ name: 'Bravo Bakery' });
const as = (b: typeof A) => (signedIn = { ...tenantOf(b), business: b });

await runAsBusiness(tenantOf(A), async () => {
  await svc.importCsv(csv('Alpha Customer'));
  saveSettings({ savedViews: [{ name: 'Late', query: 'state=overdue' }] });
});
await runAsBusiness(tenantOf(B), () => svc.importCsv(csv('Bravo Customer')));

describe('export all', () => {
  beforeEach(() => as(A));

  it('has every table, no pay tokens, and is not cached', async () => {
    const res = await GET();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="recoup-acme-plumbing-\d{4}-\d\d-\d\d\.json"$/);
    const text = await res.text();
    const data = JSON.parse(text);
    for (const k of ['customers', 'invoices', 'cases', 'installments', 'messages', 'payments', 'events', 'templateSets', 'savedViews']) {
      expect(Array.isArray(data[k]), k).toBe(true);
    }
    expect(data.business.name).toBe('Acme Plumbing');
    expect(data.business.settings).toHaveProperty('timezone');
    expect(data.customers).toHaveLength(1);
    expect(data.invoices).toHaveLength(1);
    expect(data.savedViews).toEqual([{ name: 'Late', query: 'state=overdue' }]);
    expect(text).not.toMatch(/pay_token/);
  });

  it('only includes the signed-in business', async () => {
    const a = await (await GET()).text();
    expect(a).toContain('Alpha Customer');
    expect(a).not.toContain('Bravo');
    as(B);
    const b = await (await GET()).text();
    expect(b).toContain('Bravo Customer');
    expect(b).not.toContain('Alpha');
  });

  it('limits how often one business can download', async () => {
    const C = createBusiness({ name: 'Cedar' });
    as(C);
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await GET()).status);
    expect(codes).toEqual([200, 200, 200, 200, 200, 429]);
  });
});
