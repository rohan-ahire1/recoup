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
