import { NextResponse } from 'next/server';
import { cleanUp, getQuickBooks, listLiveBusinesses, tenantOf } from '@/lib/accounts';
import { alert } from '@/lib/alert';
import { QuickBooksError, syncDue, syncQuickBooks } from '@/lib/quickbooks';
import { runDueActions } from '@/lib/service';
import { runAsBusiness } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

/** Call every ~15 minutes from a scheduler. Idempotent. Refuses to run without CRON_SECRET. */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const problems: string[] = [];
  const totals = { businesses: 0, prepared: 0, sent: 0, failed: 0, synced: 0, syncErrors: 0, errors: 0, demosRemoved: cleanUp() };
  for (const b of listLiveBusinesses()) {
    totals.businesses++;
    // Pull QuickBooks first, so invoices paid there don't get one more reminder.
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
  if (problems.length) await alert('scheduler problems', problems.join('\n'));
  return NextResponse.json(totals, { status: totals.errors ? 500 : 200 });
}

export const POST = handle;
export const GET = handle;
