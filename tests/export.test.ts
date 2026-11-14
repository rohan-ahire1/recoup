import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { invoiceCsv, type InvoiceRow } from '../lib/views';
import type { Customer, Invoice } from '../lib/types';

const customer = (o: Partial<Customer> = {}): Customer => ({
  id: 1,
  name: 'Harbor Bakery',
  type: 'business',
  contactName: 'Ana Ruiz',
  email: 'ana@harbor.test',
  phone: null,
  preferredChannel: 'email',
  tags: [],
  templateSetId: null,
  doNotChase: false,
  optedOutSms: false,
  notes: null,
  payToken: 'tok',
  createdAt: 0,
  ...o,
});

const row = (o: Partial<Invoice> & { customer?: Customer; daysLate?: number; state?: string } = {}): InvoiceRow => ({
  id: 1,
  customerId: 1,
  number: '1001',
  description: 'Wedding cake',
  amountCents: 78000,
  amountPaidCents: 0,
  issuedDate: '2026-08-01',
  dueDate: '2026-08-31',
  status: 'open',
  paidDate: null,
  caseId: null,
  createdAt: 0,
  customer: customer(),
  owedCents: 78000,
  daysLate: 3,
  state: 'overdue',
  ...o,
});

const parse = (csv: string) => Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });

describe('invoice CSV export', () => {
  it('escapes formula cells from customer names and descriptions', () => {
    const csv = invoiceCsv([
      row({ customer: customer({ name: '=SUM(A1:A2)' }), description: '@cmd' }),
      row({ customer: customer({ name: '+cmd|calc' }) }),
      row({ customer: customer({ name: '-2+3' }) }),
    ]);
    const rows = parse(csv).data;
    expect(rows[0].Customer).toBe("'=SUM(A1:A2)");
    expect(rows[0].Description).toBe("'@cmd");
    expect(rows[1].Customer).toBe("'+cmd|calc");
    expect(rows[2].Customer).toBe("'-2+3");
  });

  it('leaves ordinary values, invoice numbers and amounts unchanged', () => {
    const rows = parse(invoiceCsv([row()])).data;
    expect(rows[0]).toMatchObject({
      Customer: 'Harbor Bakery',
      Invoice: '#1001',
      Amount: '780.00',
      'Amount paid': '0.00',
      Issued: '2026-08-01',
      Due: '2026-08-31',
      Status: 'overdue',
    });
  });

  it('keeps the header row the same as before', () => {
    expect(parse(invoiceCsv([row()])).meta.fields).toEqual([
      'Invoice',
      'Customer',
      'Type',
      'Contact',
      'Email',
      'Phone',
      'Description',
      'Amount',
      'Amount paid',
      'Issued',
      'Due',
      'Paid',
      'Status',
      'Days late',
    ]);
  });
});
