import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireBusiness } from '@/lib/auth';
import { authorizeUrl, quickBooksConfigured, STATE_COOKIE } from '@/lib/quickbooks';
import { baseUrl } from '@/lib/templates';

export const dynamic = 'force-dynamic';

/** Start connecting QuickBooks: off to Intuit's sign-in, with a one-time state to check on the way back. */
export async function GET(req: Request) {
  const { business } = await requireBusiness();
  const back = new URL(req.url).searchParams.get('from') === 'import' ? 'import' : 'settings';
  if (business.demo || !quickBooksConfigured()) return NextResponse.redirect(`${baseUrl()}/${back}`);
  const state = `${randomBytes(18).toString('base64url')}.${back}`;
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/quickbooks',
    maxAge: 600,
  });
  return NextResponse.redirect(authorizeUrl(state));
}
