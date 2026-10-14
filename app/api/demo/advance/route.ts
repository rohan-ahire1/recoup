import { NextResponse } from 'next/server';
import { requireBusiness } from '@/lib/auth';
import { isDemoMode } from '@/lib/providers';
import { advanceClock } from '@/lib/service';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  await requireBusiness();
  if (!isDemoMode()) return NextResponse.json({ error: 'Demo mode is off' }, { status: 403 });
  const { days = 1 } = (await req.json().catch(() => ({}))) as { days?: number };
  const n = Math.min(Math.max(Math.floor(Number(days)) || 1, 1), 60);
  const result = await advanceClock(n);
  return NextResponse.json({ ...result, nowIso: new Date(result.now).toISOString() });
}
