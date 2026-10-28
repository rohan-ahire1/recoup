import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Claude is mocked; nothing here may reach the real API.
const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    beta = { messages: { create } };
  },
}));

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'recoup-ai-usage-'));
const { enterBusiness } = await import('../lib/tenant');
const accounts = await import('../lib/accounts');
const ai = await import('../lib/ai');
const svc = await import('../lib/service');
const repo = await import('../lib/repo');
const { setClockOffset } = await import('../lib/settings');

const MINUTE = 60_000;
const OCT = Date.parse('2026-10-01T00:00:00Z');
const newBusiness = (name: string) => accounts.createBusiness({ name }).id;

beforeEach(() => {
  create.mockReset();
  delete process.env.AI_MONTHLY_CAP;
  delete process.env.TYPESAFE_API_KEY;
});
afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe('reserveAiCall', () => {
  it('counts each call for the business and month', () => {
    const id = newBusiness('Counter');
    expect(ai.aiUsage(id, OCT).used).toBe(0);
    expect(ai.reserveAiCall(id, OCT)).toBeNull();
    expect(ai.reserveAiCall(id, OCT + MINUTE)).toBeNull();
    expect(ai.aiUsage(id, OCT)).toEqual({ used: 2, cap: 300 });
    // Another business has its own count.
    expect(ai.aiUsage(newBusiness('Other'), OCT).used).toBe(0);
  });

  it('refuses the 301st call in a month and says when it resets', () => {
    const id = newBusiness('Busy');
    // One a minute stays under the short-term limit, so only the monthly cap is tested.
    for (let i = 0; i < 300; i++) expect(ai.reserveAiCall(id, OCT + i * MINUTE)).toBeNull();
    expect(ai.reserveAiCall(id, OCT + 300 * MINUTE)).toBe('You’ve used this month’s AI allowance. It resets on Sunday, November 1.');
    expect(ai.aiUsage(id, OCT).used).toBe(300);
  });

  it('starts a new month at zero', () => {
    const id = newBusiness('Monthly');
    process.env.AI_MONTHLY_CAP = '2';
    expect(ai.reserveAiCall(id, OCT)).toBeNull();
    expect(ai.reserveAiCall(id, OCT + MINUTE)).toBeNull();
    expect(ai.reserveAiCall(id, OCT + 2 * MINUTE)).toMatch(/allowance/);
    const nov = Date.parse('2026-11-01T00:00:00Z');
    expect(ai.aiUsage(id, nov).used).toBe(0);
    expect(ai.reserveAiCall(id, nov)).toBeNull();
    expect(ai.aiUsage(id, nov).used).toBe(1);
  });

  it('allows at most 30 calls in 10 minutes', () => {
    const id = newBusiness('Burst');
    for (let i = 0; i < ai.AI_BURST_LIMIT; i++) expect(ai.reserveAiCall(id, OCT + i)).toBeNull();
    expect(ai.reserveAiCall(id, OCT + 31)).toMatch(/try again shortly/);
    expect(ai.reserveAiCall(id, OCT + 11 * MINUTE)).toBeNull();
  });
});

describe('when the allowance is used up', () => {
  it('logReply still logs the reply, unread, without calling Claude', async () => {
    const tenant = enterBusiness(accounts.tenantOf(accounts.createBusiness({ name: 'Spent' })));
    setClockOffset(0);
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const now = Date.now();
    await svc.importCsv(['Customer,Email,Invoice,Amount,Due', `Harbor Bakery,dana@x.co,#1,100,${new Date(now - 10 * 86_400_000).toISOString().slice(0, 10)}`].join('\n'), now);
    const customerId = repo.findCustomer({ name: 'Harbor Bakery' })!.id;
    for (let i = 0; i < 300; i++) accounts.takeAiCall(tenant.businessId, ai.aiMonth(now), 300);

    const r = await svc.logReply({ customerId, channel: 'email', body: 'I will pay Friday', kind: 'auto' }, now);
    expect(r.kind).toBe('other');
    expect(create).not.toHaveBeenCalled();
    expect(repo.listCustomerMessages(customerId).some((m) => m.direction === 'inbound' && m.body === 'I will pay Friday')).toBe(true);
  });

  it('personalizing refuses with the allowance message', async () => {
    const tenant = enterBusiness(accounts.tenantOf(accounts.createBusiness({ name: 'Spent too' })));
    for (let i = 0; i < 300; i++) accounts.takeAiCall(tenant.businessId, ai.aiMonth(Date.now()), 300);
    const call = ai.personalizeMessage({ channel: 'email', subject: 'Hi', body: 'Hello', tone: 'friendly', customerSummary: '', recentConversation: [] });
    await expect(call).rejects.toBeInstanceOf(ai.AiLimitError);
    await expect(call).rejects.toThrow(/AI allowance/);
    expect(create).not.toHaveBeenCalled();
  });
});
