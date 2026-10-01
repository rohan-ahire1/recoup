import { NextResponse } from 'next/server';
import { isDemoMode } from '@/lib/providers';
import { seedDemo } from '@/lib/sample';

export const dynamic = 'force-dynamic';

export async function POST() {
  if (!isDemoMode()) return NextResponse.json({ error: 'Demo mode is off' }, { status: 403 });
  return NextResponse.json(await seedDemo());
}
