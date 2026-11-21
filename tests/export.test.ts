import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Customer } from '../lib/types';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'recoup-test-'));
const { invoiceCsv } = await import('../lib/views');
type Row = Parameters<typeof invoiceCsv>[0][number];

const customer = (name: string): Customer => ({
  id: 1, name, type: 'business', contactName: null, email: null, phone: null, preferredChannel: 'email',
  tags: [], templateSetId: null, doNotChase: false, optedOutSms: false, notes: null,
} as unknown as Customer);

const row = (name: string, description: string | null): Row =>
  ({
    id: 1, customerId: 1, number: '1001', description, amountCents: 78000, amountPaidCents: 0, issuedDate: '2026-08-01',
    dueDate: '2026-09-01', status: 'open', paidDate: null, caseId: null, createdAt: 0,
    customer: customer(name), owedCents: 78000, daysLate: 3, state: 'overdue',
  }) as Row;

describe('invoice CSV export', () => {
  it('keeps the same header row', () => {
    const [header] = invoiceCsv([row('Acme', null)]).split('\r\n');
    expect(header).toBe('Invoice,Customer,Type,Contact,Email,Phone,Description,Amount,Amount paid,Issued,Due,Paid,Status,Days late');
  });

  it('prefixes formula-looking cells with a quote', () => {
    const out = invoiceCsv([row('=SUM(A1:A2)', '@cmd')]);
    expect(out).toContain("'=SUM(A1:A2)");
    expect(out).toContain("'@cmd");
  });

  it('leaves normal cells, invoice numbers, amounts and dates alone', () => {
    const [, line] = invoiceCsv([row('Harbor Street Bakery', 'Repair')]).split('\r\n');
    expect(line).toBe('#1001,Harbor Street Bakery,business,,,,Repair,780.00,0.00,2026-08-01,2026-09-01,,overdue,3');
  });
});
