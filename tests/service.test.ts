import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// Each run gets its own throwaway database.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recoup-test-'));
process.env.DATA_DIR = dir;
const { enterBusiness } = await import('../lib/tenant');
const accounts = await import('../lib/accounts');
enterBusiness(accounts.tenantOf(accounts.createBusiness({ name: 'Test' })));

const svc = await import('../lib/service');
const repo = await import('../lib/repo');
const { DAY } = await import('../lib/time');
const { setClockOffset } = await import('../lib/settings');

const T0 = Date.parse('2026-09-01T15:00:00Z');
const day = (n: number) => T0 + n * DAY;
const date = (n: number) => new Date(day(n)).toISOString().slice(0, 10);

const csv = [
  'Customer,Contact,Email,Phone,Invoice,Description,Amount,Due,Paid',
  `Harbor Street Bakery,Dana Ruiz,dana@x.co,,#1,Repair,780,${date(-5)},`,
  `Harbor Street Bakery,Dana Ruiz,dana@x.co,,#2,Descale,460,${date(10)},`,
  `Harbor Street Bakery,Dana Ruiz,dana@x.co,,#0,Old,300,${date(-100)},${date(-95)}`,
  `Mika Tanaka,,,(312) 555-0123,#3,Service,240,${date(-2)},`,
].join('\n');

let harbor: number;
let mika: number;

beforeAll(async () => {
  setClockOffset(0);
  const result = await svc.importCsv(csv, day(0));
  expect(result.imported).toBe(4);
  harbor = repo.findCustomer({ name: 'Harbor Street Bakery' })!.id;
  mika = repo.findCustomer({ name: 'Mika Tanaka' })!.id;
});

describe('prepared-mode sequence', () => {
  it('opens one case per customer and prepares a draft covering only overdue invoices', () => {
    const s = svc.summarizeCustomer(repo.getCustomer(harbor)!, day(0));
    expect(s.state).toBe('active');
    expect(s.ready?.step).toBe(1);
    expect(s.ready?.channel).toBe('email');
    expect(s.ready?.body).toContain('invoice #1 for $780.00');
    expect(s.ready?.body).not.toContain('#2');
    // Mika has no email, so her reminder is a text.
    expect(svc.summarizeCustomer(repo.getCustomer(mika)!, day(0)).ready?.channel).toBe('sms');
  });

  it('waits for the owner, then continues after "mark sent"', async () => {
    await svc.runDueActions(day(5));
    const waiting = svc.summarizeCustomer(repo.getCustomer(harbor)!, day(5));
    expect(waiting.ready?.step).toBe(1); // still step 1: nothing new while it's unsent
    svc.markSent(waiting.ready!.id, day(5));
    await svc.runDueActions(day(7));
    expect(svc.summarizeCustomer(repo.getCustomer(harbor)!, day(7)).ready?.step).toBe(3);
  });

  it('pauses on a reply and keeps the promise date', async () => {
    const r = await svc.logReply({ customerId: harbor, channel: 'email', body: 'Paying Friday', kind: 'promise', promiseDate: date(10) }, day(7));
    expect(r.kind).toBe('promise');
    const s = svc.summarizeCustomer(repo.getCustomer(harbor)!, day(7));
    expect(s.state).toBe('promised');
    expect(s.ready).toBeUndefined(); // the waiting draft was superseded
  });

  it('closes the case once its invoices are paid, even with a newer invoice not yet due', async () => {
    svc.recordPayment({ customerId: harbor, amountCents: 78000, source: 'manual', now: day(8) });
    await svc.runDueActions(day(9));
    const s = svc.summarizeCustomer(repo.getCustomer(harbor)!, day(9));
    expect(s.openCase).toBeUndefined();
    expect(s.state).toBe('not_due');
    expect(s.owedCents).toBe(46000);
    // The paid invoice counts toward the track record: paid 13 days late.
    expect(s.record.lateness.at(-1)).toBe(13);
  });

  it('opens a fresh case when the next invoice goes overdue', async () => {
    await svc.runDueActions(day(11));
    const s = svc.summarizeCustomer(repo.getCustomer(harbor)!, day(11));
    expect(s.state).toBe('active');
    expect(s.ready?.body).toContain('invoice #2 for $460.00');
  });

  it('honors STOP by switching to email, or stopping when there is none', async () => {
    await svc.logReply({ customerId: mika, channel: 'sms', body: 'STOP', kind: 'stop' }, day(11));
    const s = svc.summarizeCustomer(repo.getCustomer(mika)!, day(11));
    expect(s.customer.optedOutSms).toBe(true);
    expect(s.state).toBe('unreachable');
  });

  it('counts recovered money only from chased invoices', () => {
    const o = svc.overview(day(11));
    expect(o.recoveredAll).toBe(78000);
  });
});

describe('payment page', () => {
  it('flags "I’ve sent payment" for the business to check, once', () => {
    svc.reportPaymentSent(mika, day(10));
    svc.reportPaymentSent(mika, day(10));
    const s = svc.summarizeCustomer(repo.getCustomer(mika)!, day(10));
    expect(s.openCase?.status).toBe('needs_you');
    expect(s.openCase?.attentionReason).toMatch(/sent payment/);
    expect(s.ready).toBeUndefined();
    expect(repo.listEvents(mika).filter((e) => e.type === 'claims_paid')).toHaveLength(1);
  });

  it('a recorded payment closes it', () => {
    svc.recordPayment({ customerId: mika, amountCents: 24000, source: 'manual', now: day(11) });
    expect(svc.summarizeCustomer(repo.getCustomer(mika)!, day(11)).openCase).toBeUndefined();
  });
});

describe('recorded payments count only what was applied', () => {
  let overpaid: number;
  let partial: number;

  beforeAll(async () => {
    const text = [
      'Customer,Contact,Email,Phone,Invoice,Description,Amount,Due,Paid',
      `Overpaid Co,Pat Quinn,pat@overpaid.co,,#10,Repair,780,${date(-1)},`,
      `Partial Co,Sam Ortiz,sam@partial.co,,#20,Service,500,${date(-1)},`,
    ].join('\n');
    expect((await svc.importCsv(text, day(12))).imported).toBe(2);
    overpaid = repo.findCustomer({ name: 'Overpaid Co' })!.id;
    partial = repo.findCustomer({ name: 'Partial Co' })!.id;
  });

  it('stores only the applied amount when a payment is more than is owed', () => {
    const before = svc.overview(day(13)).recoveredAll;
    const r = svc.recordPayment({ customerId: overpaid, amountCents: 100000, source: 'manual', now: day(13) });
    const payments = repo.listPayments(overpaid);
    expect(payments).toHaveLength(1);
    expect(payments[0].amountCents).toBe(78000);
    expect(svc.overview(day(13)).recoveredAll).toBe(before + 78000);
    const detail = repo.listEvents(overpaid).filter((e) => e.type === 'payment').at(-1)!.detail;
    expect(detail).toBe("Paid $1,000.00 recorded by you. $220.00 is more than was owed and isn't counted. All caught up.");
    expect(r).toEqual({ duplicate: false, applied: 78000 });
  });

  it('adds no payment row when nothing is owed', () => {
    const before = svc.overview(day(14)).recoveredAll;
    const r = svc.recordPayment({ customerId: overpaid, amountCents: 5000, source: 'manual', now: day(14) });
    expect(repo.listPayments(overpaid)).toHaveLength(1); // only the first payment
    expect(svc.overview(day(14)).recoveredAll).toBe(before);
    const detail = repo.listEvents(overpaid).filter((e) => e.type === 'payment').at(-1)!.detail;
    expect(detail).toBe('Payment of $50.00 recorded, but nothing was owed.');
    expect(r).toEqual({ duplicate: false, applied: 0 });
  });

  it('leaves a normal partial payment unchanged', () => {
    const r = svc.recordPayment({ customerId: partial, amountCents: 20000, source: 'manual', now: day(13) });
    expect(r).toEqual({ duplicate: false, applied: 20000 });
    expect(repo.listPayments(partial)).toHaveLength(1);
    expect(repo.listPayments(partial)[0].amountCents).toBe(20000);
    const detail = repo.listEvents(partial).filter((e) => e.type === 'payment').at(-1)!.detail;
    expect(detail).toBe('Paid $200.00 recorded by you. $300.00 still overdue.');
  });
});
