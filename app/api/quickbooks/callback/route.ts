import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireBusiness } from '@/lib/auth';
import { connectQuickBooks, STATE_COOKIE, syncQuickBooks } from '@/lib/quickbooks';
import { baseUrl } from '@/lib/templates';
import { runAsBusiness } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

/** Intuit sends the business back here after they approve (or cancel) the connection. */
export async function GET(req: Request) {
  const tenant = await requireBusiness();
  const q = new URL(req.url).searchParams;
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete({ name: STATE_COOKIE, path: '/api/quickbooks' });
  const state = q.get('state') ?? '';
  const back = state.endsWith('.import') ? 'import' : 'settings';
  const done = (result: string) => NextResponse.redirect(`${baseUrl()}/${back}?qb=${result}`);

  if (!expected || state !== expected || tenant.demo) return done('failed');
  const code = q.get('code');
  const realmId = q.get('realmId');
  if (!code || !realmId) return done(q.get('error') === 'access_denied' ? 'cancelled' : 'failed');

  return runAsBusiness(tenant, async () => {
    try {
      await connectQuickBooks(code, realmId);
    } catch (err) {
      console.error('QuickBooks connect failed', err);
      return done('failed');
    }
    try {
      await syncQuickBooks();
    } catch (err) {
      // Connected; the scheduler will try the sync again.
      console.error('QuickBooks first sync failed', err);
      return done('syncfailed');
    }
    return NextResponse.redirect(`${baseUrl()}/${back === 'import' ? '' : 'settings'}?qb=connected`);
  });
}
