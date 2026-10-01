import { NextResponse } from 'next/server';
import { runDueActions } from '@/lib/service';

export const dynamic = 'force-dynamic';

/** Call every ~15 minutes from a scheduler. Idempotent. */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await runDueActions());
}

export const POST = handle;
export const GET = handle;
