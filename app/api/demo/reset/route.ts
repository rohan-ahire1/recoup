import { NextResponse } from 'next/server';
import { requireBusiness } from '@/lib/auth';
import { isDemoMode } from '@/lib/providers';
import { seedDemo } from '@/lib/sample';
import { enterBusiness } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

export async function POST() {
  enterBusiness(await requireBusiness());
  if (!isDemoMode()) return NextResponse.json({ error: 'Demo mode is off' }, { status: 403 });
  return NextResponse.json(await seedDemo());
}
