import { NextResponse } from 'next/server';
import { cleanUp } from '@/lib/accounts';
import { runScheduler } from '@/lib/scheduler';

export const dynamic = 'force-dynamic';

/** Call every ~15 minutes from a scheduler. Idempotent. Refuses to run without CRON_SECRET. */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const demosRemoved = cleanUp();
  const totals = await runScheduler();
  return NextResponse.json({ ...totals, demosRemoved }, { status: totals.errors ? 500 : 200 });
}

export const POST = handle;
export const GET = handle;
