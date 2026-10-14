import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recoup-tenant-'));
process.env.DATA_DIR = dir;

const { runAsBusiness } = await import('../lib/tenant');
const { db, businessDbFile, deleteBusinessDb } = await import('../lib/db');
const svc = await import('../lib/service');
const repo = await import('../lib/repo');
const { getSettings, saveSettings } = await import('../lib/settings');

const { createBusiness, tenantOf } = await import('../lib/accounts');
const A = tenantOf(createBusiness({ name: 'A' }));
const B = tenantOf(createBusiness({ name: 'B' }));
const csv = ['Customer,Email,Invoice,Amount,Due', 'Harbor Street Bakery,dana@x.co,#1,780,2026-01-01'].join('\n');

describe('one database per business', () => {
  it('refuses to touch a database outside a business', () => {
    expect(() => db()).toThrow(/No business/);
  });

  it('rejects ids that could escape the data folder', () => {
    expect(() => runAsBusiness({ businessId: '../x', demo: false }, () => 1)).toThrow(/Invalid business id/);
  });

  it('keeps customers and settings apart', async () => {
    await runAsBusiness(A, async () => {
      await svc.importCsv(csv);
      saveSettings({ businessName: 'Business A' });
    });
    await runAsBusiness(B, async () => {
      expect(repo.listCustomers()).toHaveLength(0);
      expect(getSettings().businessName).not.toBe('Business A');
    });
    runAsBusiness(A, () => {
      expect(repo.listCustomers().map((c) => c.name)).toEqual(['Harbor Street Bakery']);
      expect(getSettings().businessName).toBe('Business A');
    });
  });

  it('keeps the business across awaits and interleaved requests', async () => {
    const tick = () => new Promise((r) => setTimeout(r, 5));
    const seen = await Promise.all([
      runAsBusiness(A, async () => (await tick(), repo.listCustomers().length)),
      runAsBusiness(B, async () => (await tick(), repo.listCustomers().length)),
    ]);
    expect(seen).toEqual([1, 0]);
  });

  it('records the schema version', () => {
    runAsBusiness(A, () => {
      expect(db().prepare('PRAGMA user_version').get()).toEqual({ user_version: 1 });
    });
  });

  it('deletes a business for good', () => {
    expect(fs.existsSync(businessDbFile(B.businessId))).toBe(true);
    deleteBusinessDb(B.businessId);
    expect(fs.existsSync(businessDbFile(B.businessId))).toBe(false);
  });
});
