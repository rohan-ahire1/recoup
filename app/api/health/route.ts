import { NextResponse } from 'next/server';
import { countBusinesses, listLiveBusinesses, tenantOf } from '@/lib/accounts';
import { db } from '@/lib/db';
import { runAsBusiness } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

/** For uptime checks: 200 when the accounts database and a business database both answer. */
export function GET() {
  const checks: Record<string, string> = {};
  try {
    countBusinesses();
    checks.accounts = 'ok';
  } catch (err) {
    console.error('Health: accounts database', err);
    checks.accounts = 'error';
  }
  try {
    const b = listLiveBusinesses()[0];
    if (b) runAsBusiness(tenantOf(b), () => db().prepare('SELECT count(*) FROM invoices').get());
    checks.business = b ? 'ok' : 'none yet';
  } catch (err) {
    console.error('Health: business database', err);
    checks.business = 'error';
  }
  const ok = Object.values(checks).every((v) => v === 'ok' || v === 'none yet');
  return NextResponse.json({ ok, ...checks }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
}
