import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'recoup-scheduler-'));

const { createBusiness } = await import('../lib/accounts');
const { runPool, runScheduler } = await import('../lib/scheduler');

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NTFY_URL;
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ids = Array.from({ length: 5 }, (_, i) => createBusiness({ name: `S${i}` }, 1000 + i).id);

describe('scheduler', () => {
  it('never runs more than the concurrency limit at once', async () => {
    let live = 0;
    let peak = 0;
    const left = await runPool(Array.from({ length: 10 }, (_, i) => i), 3, () => true, async () => {
      peak = Math.max(peak, ++live);
      await sleep(5);
      live--;
    });
    expect(left).toBe(0);
    expect(peak).toBe(3);
  });

  it('skips what the budget cannot cover, alerts once, and starts with those next time', async () => {
    process.env.NTFY_URL = 'https://ntfy.test/topic';
    const f = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response('ok'));
    vi.stubGlobal('fetch', f);
    const seen: string[][] = [[], []];
    for (const run of [0, 1]) {
      // The clock jumps 100ms every time it is read, so a 150ms budget lets two businesses start.
      let t = 0;
      const totals = await runScheduler({
        concurrency: 1,
        budgetMs: 150,
        now: () => (t += 100),
        process: async (b) => void seen[run].push(b.id),
      });
      expect(totals.businesses).toBe(seen[run].length);
      expect(totals.skipped).toBe(ids.length - seen[run].length);
      expect(totals.skipped).toBeGreaterThan(0);
    }
    expect(seen[0]).toEqual(ids.slice(0, seen[0].length));
    // Second run starts with the businesses the first one skipped.
    expect(seen[1].slice(0, ids.length - seen[0].length)).toEqual(ids.slice(seen[0].length, seen[0].length + seen[1].length));
    // One alert for the skipped businesses (the second run's identical alert falls in the 30-minute quiet period).
    expect(f.mock.calls.filter(([, init]) => String(init?.body).includes('skipped'))).toHaveLength(1);
  });

  it('runs everyone and sends no alert when time allows', async () => {
    process.env.NTFY_URL = 'https://ntfy.test/topic';
    const f = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response('ok'));
    vi.stubGlobal('fetch', f);
    const seen: string[] = [];
    const totals = await runScheduler({ concurrency: 2, budgetMs: 60_000, process: async (b) => void seen.push(b.id) });
    expect(totals.skipped).toBe(0);
    expect(seen.sort()).toEqual([...ids].sort());
    expect(f).not.toHaveBeenCalled();
  });
});
