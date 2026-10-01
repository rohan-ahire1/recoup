import { DAY, isSmsAllowed, nextSmsWindow } from './time';
import type { CaseStatus, Channel, Customer, Installment } from './types';

export interface SequenceStep {
  step: number;
  /** "Day N" of the case; day 1 is the day it opened. */
  day: number;
  label: string;
  short: string;
}

export const STEPS: SequenceStep[] = [
  { step: 1, day: 1, label: 'Friendly reminder', short: 'Reminder' },
  { step: 2, day: 4, label: 'Follow-up with payment link', short: 'Follow-up' },
  { step: 3, day: 8, label: 'Payment link', short: 'Payment link' },
  { step: 4, day: 15, label: 'Payment plan offer', short: 'Plan offer' },
];

export const PLAN_OFFER_STEP = 4;
export const INSTALLMENT_INTERVAL_DAYS = 14;
/** Never message the same customer twice within this window. */
export const MIN_GAP_DAYS = 2;

export type TemplateKey = '1' | '2' | '3' | '4' | 'installment';
export const TEMPLATE_KEYS: TemplateKey[] = ['1', '2', '3', '4', 'installment'];

export interface Action {
  /** Idempotency key: each key is prepared at most once per case. */
  key: string;
  channel: Channel;
  templateKey: TemplateKey;
  step?: number;
  installmentId?: number;
}

export interface NextAction {
  at: number;
  label: string;
}

export interface EngineInput {
  status: CaseStatus;
  startedAt: number;
  currentStep: number;
  lastSentAt: number | null;
  /** A prepared message is still waiting for the owner to send it. */
  pendingReady: boolean;
  customer: Pick<Customer, 'phone' | 'email' | 'optedOutSms' | 'preferredChannel' | 'doNotChase'>;
  sentKeys: Set<string>;
  installments: Pick<Installment, 'id' | 'seq' | 'dueAt' | 'paidAt'>[];
  now: number;
  timeZone: string;
  /** True when texts go out automatically, so quiet hours apply. */
  autoSms: boolean;
}

export interface EnginePlan {
  actions: Action[];
  next: NextAction | null;
  waitingOnOwner: boolean;
}

export function stepDueAt(startedAt: number, step: SequenceStep): number {
  return startedAt + (step.day - 1) * DAY;
}

export function availableChannels(c: EngineInput['customer']): Channel[] {
  const out: Channel[] = [];
  if (c.email) out.push('email');
  if (c.phone && !c.optedOutSms) out.push('sms');
  return out;
}

/** The customer's preferred channel when it's usable, otherwise whatever is. */
export function pickChannel(c: EngineInput['customer']): Channel | null {
  const available = availableChannels(c);
  if (available.includes(c.preferredChannel)) return c.preferredChannel;
  return available[0] ?? null;
}

function earliest(a: NextAction | null, b: NextAction): NextAction {
  return a && a.at <= b.at ? a : b;
}

/**
 * Decide what to prepare right now for one customer's case, and what comes next.
 * Pure: the caller supplies history and the clock, and carries out the actions.
 */
export function planActions(input: EngineInput): EnginePlan {
  const { status, startedAt, currentStep, lastSentAt, pendingReady, customer, sentKeys, installments, now, timeZone } = input;
  const actions: Action[] = [];
  let next: NextAction | null = null;

  if (customer.doNotChase || (status !== 'active' && status !== 'plan')) {
    return { actions, next, waitingOnOwner: false };
  }
  // One message at a time: nothing new until the owner sends (or skips) the last one.
  if (pendingReady) return { actions, next, waitingOnOwner: true };

  const channel = pickChannel(customer);
  if (!channel) return { actions, next, waitingOnOwner: false };

  // Respect a minimum gap after the last message, however late the owner sent it.
  const gapUntil = lastSentAt ? lastSentAt + MIN_GAP_DAYS * DAY : 0;
  const quiet = (at: number) => (channel === 'sms' && input.autoSms ? nextSmsWindow(at, timeZone) : at);
  const canSendNow = now >= gapUntil && !(channel === 'sms' && input.autoSms && !isSmsAllowed(now, timeZone));

  if (status === 'active') {
    // Only the latest due step is prepared; skipped steps are superseded, never sent in a burst.
    let target: SequenceStep | null = null;
    for (const s of STEPS) if (stepDueAt(startedAt, s) <= now && s.step > currentStep) target = s;

    if (target && !sentKeys.has(`step:${target.step}`)) {
      if (canSendNow) {
        actions.push({ key: `step:${target.step}`, channel, templateKey: String(target.step) as TemplateKey, step: target.step });
      } else {
        next = { at: quiet(Math.max(now, gapUntil)), label: target.label };
      }
    }
    const upcoming = STEPS.find((s) => s.step > Math.max(currentStep, target?.step ?? 0) && stepDueAt(startedAt, s) > now);
    if (upcoming && !next) {
      next = { at: quiet(Math.max(stepDueAt(startedAt, upcoming), gapUntil)), label: upcoming.label };
    }
  }

  if (status === 'plan') {
    for (const inst of installments) {
      // The first installment is paid when the plan is chosen.
      if (inst.paidAt || inst.seq === 1) continue;
      const key = `installment:${inst.id}`;
      if (sentKeys.has(key)) continue;
      const remindAt = inst.dueAt - DAY;
      const label = `Reminder for payment ${inst.seq}`;
      if (remindAt <= now && canSendNow) {
        actions.push({ key, channel, templateKey: 'installment', installmentId: inst.id });
        break;
      }
      next = earliest(next, { at: quiet(Math.max(remindAt, gapUntil, now)), label });
      break;
    }
  }

  return { actions, next, waitingOnOwner: false };
}

const STOP_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'OPTOUT', 'REVOKE']);
const START_WORDS = new Set(['START', 'UNSTOP', 'OPTIN']);

/** Carrier opt-out keywords only count when they're the whole text. */
export function carrierKeyword(body: string): 'stop' | 'start' | null {
  const word = body.trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (STOP_WORDS.has(word)) return 'stop';
  if (START_WORDS.has(word)) return 'start';
  return null;
}

/** Split a balance into `count` installments; the last one absorbs rounding. */
export function splitInstallments(balanceCents: number, count: number): number[] {
  const base = Math.floor(balanceCents / count);
  const parts = Array.from({ length: count }, () => base);
  parts[count - 1] += balanceCents - base * count;
  return parts;
}

/** Oldest-due first: how a customer-level payment is spread across open invoices. */
export function allocatePayment(
  amountCents: number,
  invoices: { id: number; dueDate: string; owedCents: number }[],
): { id: number; cents: number }[] {
  let left = amountCents;
  const out: { id: number; cents: number }[] = [];
  for (const inv of [...invoices].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id - b.id)) {
    if (left <= 0) break;
    const cents = Math.min(left, inv.owedCents);
    if (cents > 0) out.push({ id: inv.id, cents });
    left -= cents;
  }
  return out;
}
