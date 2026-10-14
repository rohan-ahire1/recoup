import { NextResponse } from 'next/server';
import { cleanUp, listLiveBusinesses, tenantOf } from '@/lib/accounts';
import { runDueActions } from '@/lib/service';
import { runAsBusiness } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

/** Call every ~15 minutes from a scheduler. Idempotent. Refuses to run without CRON_SECRET. */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const totals = { businesses: 0, prepared: 0, sent: 0, failed: 0, errors: 0, demosRemoved: cleanUp() };
  for (const b of listLiveBusinesses()) {
    totals.businesses++;
    try {
      const r = await runAsBusiness(tenantOf(b), () => runDueActions());
      totals.prepared += r.prepared;
      totals.sent += r.sent;
      totals.failed += r.failed;
    } catch (err) {
      totals.errors++;
      console.error(`Scheduler failed for business ${b.id}`, err);
    }
  }
  return NextResponse.json(totals, { status: totals.errors ? 500 : 200 });
}

export const POST = handle;
export const GET = handle;
