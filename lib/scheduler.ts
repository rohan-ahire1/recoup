import { getQuickBooks, listLiveBusinesses, markBusinessRun, tenantOf, type Business } from './accounts';
import { alert } from './alert';
import { QuickBooksError, syncDue, syncQuickBooks } from './quickbooks';
import { runDueActions } from './service';
import { runAsBusiness } from './tenant';

export interface RunTotals {
  businesses: number;
  skipped: number;
  prepared: number;
  sent: number;
  failed: number;
  synced: number;
  syncErrors: number;
  errors: number;
}

const positiveInt = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
};

/** Run `fn` over `items` with at most `limit` in flight. `shouldStart` is asked before each item; once it says no, the rest are left alone. Returns how many were left. */
export async function runPool<T>(items: T[], limit: number, shouldStart: () => boolean, fn: (item: T) => Promise<void>): Promise<number> {
  let next = 0;
  const worker = async () => {
    while (next < items.length && shouldStart()) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return items.length - next;
}

/** Pull QuickBooks first, so invoices paid there don't get one more reminder, then send what's due. */
async function processBusiness(b: Business, totals: RunTotals, problems: string[]) {
  const qb = getQuickBooks(b.id);
  if (qb && syncDue(qb)) {
    try {
      await runAsBusiness(tenantOf(b), () => syncQuickBooks());
      totals.synced++;
    } catch (err) {
      totals.syncErrors++;
      console.error(`QuickBooks sync failed for business ${b.id}`, err);
      // A business that disconnected from inside QuickBooks is their choice, not a fault.
      if (!(err instanceof QuickBooksError && err.disconnected)) problems.push(`QuickBooks sync, ${b.id}: ${String(err).slice(0, 200)}`);
    }
  }
  try {
    const r = await runAsBusiness(tenantOf(b), () => runDueActions());
    totals.prepared += r.prepared;
    totals.sent += r.sent;
    totals.failed += r.failed;
  } catch (err) {
    totals.errors++;
    console.error(`Scheduler failed for business ${b.id}`, err);
    problems.push(`Reminders, ${b.id}: ${String(err).slice(0, 200)}`);
  }
}

export interface RunOptions {
  concurrency?: number;
  budgetMs?: number;
  /** Replaces the per-business work; for tests. */
  process?: (b: Business, totals: RunTotals, problems: string[]) => Promise<void>;
  now?: () => number;
}

/** Work through every live business, oldest run first, a few at a time, and stop starting new ones when the time budget is used up. */
export async function runScheduler(opts: RunOptions = {}): Promise<RunTotals> {
  const concurrency = opts.concurrency ?? positiveInt(process.env.CRON_CONCURRENCY, 4);
  const budgetMs = opts.budgetMs ?? positiveInt(process.env.CRON_BUDGET_MS, 8 * 60_000);
  const now = opts.now ?? Date.now;
  const work = opts.process ?? processBusiness;
  const startedAt = now();
  const problems: string[] = [];
  const totals: RunTotals = { businesses: 0, skipped: 0, prepared: 0, sent: 0, failed: 0, synced: 0, syncErrors: 0, errors: 0 };

  totals.skipped = await runPool(
    listLiveBusinesses(),
    concurrency,
    () => now() - startedAt < budgetMs,
    async (b) => {
      totals.businesses++;
      markBusinessRun(b.id, now());
      await work(b, totals, problems);
    },
  );

  if (totals.skipped) await alert('scheduler skipped businesses', `Out of time (${Math.round(budgetMs / 1000)}s): ${totals.skipped} businesses skipped, ${totals.businesses} done. They go first next run.`);
  if (problems.length) await alert('scheduler problems', problems.join('\n'));
  return totals;
}
