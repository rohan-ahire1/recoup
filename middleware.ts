import { NextResponse, type NextRequest } from 'next/server';

// The portfolio desktop at rohanahire.com opens Recoup in a window; nothing else may frame it.
// FRAME_ANCESTORS adds space-separated origins, e.g. for testing the portfolio locally.
const frameAncestors = ['https://rohanahire.com', ...(process.env.FRAME_ANCESTORS ?? '').split(/\s+/).filter(Boolean)];

const isProd = process.env.NODE_ENV === 'production';

function contentSecurityPolicy(nonce: string) {
  return [
    "default-src 'self'",
    // Next.js reads the nonce from this header and stamps it on its own scripts.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    `frame-ancestors ${frameAncestors.join(' ')}`,
    "base-uri 'self'",
    // Server actions post to this origin; the QuickBooks sign-in is a plain link.
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

/**
 * Sets a per-request CSP nonce, and sends signed-out visitors to / to the landing page
 * (signed-in ones get Today).
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  let csp: string | undefined;
  // The dev server needs eval for fast refresh, so the policy only applies to production builds.
  if (isProd) {
    const nonce = btoa(crypto.randomUUID());
    csp = contentSecurityPolicy(nonce);
    headers.set('x-nonce', nonce);
    headers.set('Content-Security-Policy', csp);
  }

  const res =
    req.nextUrl.pathname === '/' && !req.cookies.has('recoup_session')
      ? NextResponse.rewrite(new URL('/home', req.url), { request: { headers } })
      : NextResponse.next({ request: { headers } });
  if (csp) res.headers.set('Content-Security-Policy', csp);
  return res;
}

export const config = {
  matcher: [{ source: '/((?!api/|_next/static|_next/image|favicon).*)' }],
};
