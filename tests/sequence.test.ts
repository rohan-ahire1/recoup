import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { allocatePayment, carrierKeyword, pickChannel, planActions, splitInstallments, type EngineInput } from '../lib/sequence';
import { DAY, HOUR, localParts } from '../lib/time';

const TZ = 'America/Chicago';
const START = Date.parse('2026-09-01T15:00:00Z'); // 10:00 in Chicago

const customer = { phone: '+13125550142', email: 'dana@example.com', optedOutSms: false, preferredChannel: 'email' as const, doNotChase: false };

function input(o: Partial<EngineInput> & { now: number }): EngineInput {
  return {
    status: 'active',
    startedAt: START,
    currentStep: 0,
    lastSentAt: null,
    pendingReady: false,
    customer,
    sentKeys: new Set(),
    installments: [],
    timeZone: TZ,
    autoSms: false,
    ...o,
  };
}

/** Replay hour by hour; `sendDelayHours` is how long the owner takes to send each draft. */
function replay(days: number, base: Partial<EngineInput> = {}, sendDelayHours = 1) {
  const log: { key: string; day: number }[] = [];
  const keys = new Set<string>();
  let currentStep = 0;
  let lastSentAt: number | null = null;
  let pending: { at: number } | null = null;
  for (let t = START; t <= START + days * DAY; t += HOUR) {
    if (pending && t >= pending.at) {
      lastSentAt = t;
      pending = null;
    }
    const plan = planActions(input({ ...base, now: t, sentKeys: keys, currentStep, lastSentAt, pendingReady: Boolean(pending) }));
    for (const a of plan.actions) {
      keys.add(a.key);
      log.push({ key: a.key, day: Math.floor((t - START) / DAY) + 1 });
      if (a.step) currentStep = Math.max(currentStep, a.step);
      pending = { at: t + sendDelayHours * HOUR };
    }
  }
  return log;
}

describe('sequence', () => {
  it('prepares one message per step on days 1, 4, 8 and 15', () => {
    expect(replay(20)).toEqual([
      { key: 'step:1', day: 1 },
      { key: 'step:2', day: 4 },
      { key: 'step:3', day: 8 },
      { key: 'step:4', day: 15 },
    ]);
  });

  it('waits for the owner: nothing new while a draft is unsent', () => {
    const plan = planActions(input({ now: START + 5 * DAY, currentStep: 1, sentKeys: new Set(['step:1']), pendingReady: true }));
    expect(plan.actions).toEqual([]);
    expect(plan.waitingOnOwner).toBe(true);
  });

  it('keeps a two-day gap after a late send instead of bunching messages', () => {
    // The owner sat on step 1 for five days. Two days after they sent it, step 3 is
    // already due, so the stale step 2 is skipped rather than sent back to back.
    const log = replay(20, {}, 5 * 24);
    expect(log).toEqual([
      { key: 'step:1', day: 1 },
      { key: 'step:3', day: 8 },
      { key: 'step:4', day: 15 },
    ]);
  });

  it('only prepares the latest due step after a long pause, not a burst', () => {
    const plan = planActions(input({ now: START + 9 * DAY }));
    expect(plan.actions.map((a) => a.key)).toEqual(['step:3']);
  });

  it('is idempotent: a claimed step is never prepared twice', () => {
    const plan = planActions(input({ now: START, sentKeys: new Set(['step:1']) }));
    expect(plan.actions).toEqual([]);
  });

  it('stops for every non-active status and for "don’t chase"', () => {
    for (const status of ['needs_you', 'promised', 'disputed', 'paused', 'unreachable', 'resolved'] as const) {
      expect(planActions(input({ now: START + 3 * DAY, status })).actions).toEqual([]);
    }
    expect(planActions(input({ now: START, customer: { ...customer, doNotChase: true } })).actions).toEqual([]);
  });

  it('uses the preferred channel and falls back when it is unavailable', () => {
    expect(pickChannel(customer)).toBe('email');
    expect(pickChannel({ ...customer, preferredChannel: 'sms' })).toBe('sms');
    expect(pickChannel({ ...customer, email: null })).toBe('sms');
    expect(pickChannel({ ...customer, email: null, optedOutSms: true })).toBeNull();
  });

  it('applies quiet hours to automatic texts only', () => {
    const late = Date.parse('2026-09-02T03:00:00Z'); // 22:00 in Chicago
    const sms = { ...customer, preferredChannel: 'sms' as const };
    expect(planActions(input({ now: late, startedAt: late, customer: sms, autoSms: false })).actions).toHaveLength(1);
    const auto = planActions(input({ now: late, startedAt: late, customer: sms, autoSms: true }));
    expect(auto.actions).toEqual([]);
    const p = localParts(auto.next!.at, TZ);
    expect([p.hour, p.minute]).toEqual([8, 0]);
  });
});

describe('payment plans', () => {
  const planStart = START + 15 * DAY;
  const installments = [
    { id: 11, seq: 1, dueAt: planStart, paidAt: planStart },
    { id: 12, seq: 2, dueAt: planStart + 14 * DAY, paidAt: null },
    { id: 13, seq: 3, dueAt: planStart + 28 * DAY, paidAt: null },
  ];
  const at = (now: number, keys: string[] = []) => planActions(input({ now, status: 'plan', installments, sentKeys: new Set(keys), currentStep: 4 }));

  it('reminds the day before each remaining installment, once', () => {
    expect(at(planStart + 12 * DAY).actions).toEqual([]);
    expect(at(planStart + 13 * DAY).actions.map((a) => a.key)).toEqual(['installment:12']);
    expect(at(planStart + 13 * DAY, ['installment:12']).actions).toEqual([]);
  });

  it('prepares one missed-payment message once an installment is over 3 days late', () => {
    const due = planStart + 14 * DAY;
    expect(at(due + 3 * DAY, ['installment:12']).actions).toEqual([]);
    const late = at(due + 3 * DAY + HOUR, ['installment:12']);
    expect(late.actions).toEqual([{ key: 'installment-missed:12', channel: 'email', templateKey: 'installment_missed', installmentId: 12 }]);
    expect(at(due + 5 * DAY, ['installment:12', 'installment-missed:12']).actions).toEqual([]);
  });

  it('does not chase an installment that was paid', () => {
    const paid = installments.map((i) => (i.id === 12 ? { ...i, paidAt: planStart + 15 * DAY } : i));
    const plan = planActions(input({ now: planStart + 20 * DAY, status: 'plan', installments: paid, sentKeys: new Set(['installment:12']), currentStep: 4 }));
    expect(plan.actions.map((a) => a.key)).not.toContain('installment-missed:12');
  });

  it('keeps the minimum gap and quiet hours for missed-payment texts', () => {
    const sms = { ...customer, preferredChannel: 'sms' as const };
    const due = planStart + 14 * DAY;
    const run = (now: number, lastSentAt: number | null) =>
      planActions(input({ now, status: 'plan', installments, customer: sms, autoSms: true, lastSentAt, sentKeys: new Set(['installment:12']), currentStep: 4 }));
    expect(run(due + 4 * DAY, due + 3.5 * DAY).actions).toEqual([]);
    expect(run(due + 4 * DAY, due + 3.5 * DAY).next?.at).toBeGreaterThan(due + 4 * DAY);
    const night = Date.parse('2026-10-20T04:00:00Z'); // 11pm Chicago
    expect(planActions(input({ now: night, status: 'plan', installments: [{ id: 12, seq: 2, dueAt: night - 4 * DAY, paidAt: null }], customer: sms, autoSms: true, sentKeys: new Set(['installment:12']) })).actions).toEqual([]);
  });

  it('splits balances exactly', () => {
    expect(splitInstallments(10000, 3)).toEqual([3333, 3333, 3334]);
    expect(splitInstallments(124000, 2)).toEqual([62000, 62000]);
  });
});

describe('payments and keywords', () => {
  it('pays the oldest invoices first', () => {
    const invoices = [
      { id: 2, dueDate: '2026-09-10', owedCents: 46000 },
      { id: 1, dueDate: '2026-09-01', owedCents: 78000 },
    ];
    expect(allocatePayment(100000, invoices)).toEqual([
      { id: 1, cents: 78000 },
      { id: 2, cents: 22000 },
    ]);
  });

  it('only treats a bare carrier keyword as STOP', () => {
    expect(carrierKeyword('STOP')).toBe('stop');
    expect(carrierKeyword(' stop. ')).toBe('stop');
    expect(carrierKeyword('please stop texting me')).toBeNull();
    expect(carrierKeyword('START')).toBe('start');
  });
});

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'recoup-seq-'));
const { runAsBusiness } = await import('../lib/tenant');
const accounts = await import('../lib/accounts');
const svc = await import('../lib/service');
const repo = await import('../lib/repo');
const tenant = accounts.tenantOf(accounts.createBusiness({ name: 'Seq Test' }));

describe('missed plan payments in the runner', () => {
  const T0 = Date.parse('2026-09-01T15:00:00Z');
  const day = (n: number) => T0 + n * DAY;
  const date = (n: number) => new Date(day(n)).toISOString().slice(0, 10);

  it('prepares the missed-payment message after 3 days, once, and flags attention at 7', () =>
    runAsBusiness(tenant, async () => {
      const csv = ['Customer,Contact,Email,Phone,Invoice,Description,Amount,Due,Paid', `Plan Payer,Pat,pat@x.co,,#9,Work,600,${date(-5)},`].join('\n');
      await svc.importCsv(csv, day(0));
      const customerId = repo.findCustomer({ name: 'Plan Payer' })!.id;
      svc.choosePlan(customerId, 2, day(0)); // payment 2 is due on day 14
      const first = repo.readyMessageForCase(repo.getOpenCase(customerId)!.id);
      if (first) svc.markSent(first.id, day(0));
      const caseOf = () => repo.getOpenCase(customerId)!;
      const missedKeys = () => repo.listCustomerMessages(customerId).filter((m) => m.actionKey?.startsWith('installment-missed'));
      const events = () => repo.listEvents(customerId).filter((e) => e.type === 'installment_missed');

      await svc.runDueActions(day(13)); // the day-before reminder
      const reminder = repo.readyMessageForCase(caseOf().id)!;
      expect(reminder.actionKey).toMatch(/^installment:/);
      svc.markSent(reminder.id, day(13));

      await svc.runDueActions(day(17)); // exactly 3 days late: not yet
      expect(missedKeys()).toHaveLength(0);
      expect(caseOf().needsAttention).toBe(false);

      await svc.runDueActions(day(18)); // 4 days late
      const missed = repo.readyMessageForCase(caseOf().id)!;
      expect(missed.actionKey).toMatch(/^installment-missed:/);
      expect(missed.body).toContain('$300.00');
      svc.markSent(missed.id, day(18));
      await svc.runDueActions(day(19));
      expect(missedKeys()).toHaveLength(1);
      expect(caseOf().needsAttention).toBe(false);

      await svc.runDueActions(day(21)); // 7 days late
      expect(caseOf().needsAttention).toBe(true);
      expect(caseOf().attentionReason).toBe('Missed payment 2 of the plan');
      expect(events()).toHaveLength(1);

      // Clearing the flag doesn't bring it back or log it again.
      repo.updateCase(caseOf().id, { needs_attention: 0, attention_reason: null }, day(21));
      await svc.runDueActions(day(22));
      expect(caseOf().needsAttention).toBe(false);
      expect(events()).toHaveLength(1);
    }));
});
