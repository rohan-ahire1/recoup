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

describe('plan payments mark installments paid', () => {
  const planCsv = (name: string, amount: number) =>
    ['Customer,Contact,Email,Phone,Invoice,Description,Amount,Due,Paid', `${name},Pat,${name.replace(/ /g, '').toLowerCase()}@x.co,,#${name.replace(/ /g, '')},Job,${amount},${date(-3)},`].join('\n');

  async function startPlan(name: string, amount: number, count: 2 | 3 = 3) {
    await svc.importCsv(planCsv(name, amount), day(20));
    const id = repo.findCustomer({ name })!.id;
    const installments = svc.choosePlan(id, count, day(20));
    return { id, caseId: installments[0].caseId, installments };
  }

  it('applies a manual payment to installments in order', async () => {
    const { id, caseId, installments } = await startPlan('Plan Order Co', 900);
    const [a, b] = installments;
    svc.recordPayment({ customerId: id, amountCents: a.amountCents + b.amountCents, source: 'manual', now: day(21) });
    const after = repo.listInstallments(caseId);
    expect(after[0].paidAt).toBe(day(21));
    expect(after[1].paidAt).toBe(day(21));
    expect(after[2].paidAt).toBeFalsy();
  });

  it('marks nothing for a payment smaller than one installment, then covers it cumulatively', async () => {
    const { id, caseId, installments } = await startPlan('Plan Partial Co', 900);
    const first = installments[0].amountCents;
    svc.recordPayment({ customerId: id, amountCents: first - 100, source: 'manual', now: day(21) });
    expect(repo.listInstallments(caseId).every((i) => !i.paidAt)).toBe(true);
    svc.recordPayment({ customerId: id, amountCents: 100, source: 'manual', now: day(22) });
    const after = repo.listInstallments(caseId);
    expect(after[0].paidAt).toBe(day(22));
    expect(after[1].paidAt).toBeFalsy();
  });

  it('resolves the case once every installment is covered', async () => {
    const { id, caseId, installments } = await startPlan('Plan Done Co', 900);
    svc.recordPayment({ customerId: id, amountCents: installments[0].amountCents, source: 'manual', now: day(21) });
    svc.recordPayment({ customerId: id, amountCents: installments[1].amountCents + installments[2].amountCents, source: 'manual', now: day(22) });
    expect(repo.listInstallments(caseId).every((i) => i.paidAt)).toBe(true);
    expect(repo.getOpenCase(id)).toBeUndefined();
  });

  it('marks only the given installment when an installmentId is passed', async () => {
    const { id, caseId, installments } = await startPlan('Plan Explicit Co', 900);
    svc.recordPayment({ customerId: id, amountCents: installments[0].amountCents, installmentId: installments[1].id, source: 'manual', now: day(21) });
    const after = repo.listInstallments(caseId);
    expect(after.map((i) => !!i.paidAt)).toEqual([false, true, false]);
  });

  it('skips the ready reminder of an installment that is now paid', async () => {
    const { id, caseId, installments } = await startPlan('Plan Reminder Co', 900);
    const second = installments[1];
    await svc.runDueActions(second.dueAt - DAY / 2);
    const key = `installment:${second.id}`;
    const ready = repo.listMessagesByStatus(['ready']).find((m) => m.actionKey === key);
    expect(ready).toBeDefined();
    svc.recordPayment({ customerId: id, amountCents: installments[0].amountCents + second.amountCents, source: 'manual', now: second.dueAt });
    expect(repo.getMessage(ready!.id)!.status).toBe('skipped');
    expect(repo.listInstallments(caseId)[1].paidAt).toBeTruthy();
  });
});
