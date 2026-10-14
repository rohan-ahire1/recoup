import { NextResponse, type NextRequest } from 'next/server';

/** Signed-out visitors to / see the landing page; signed-in ones get Today. */
export function middleware(req: NextRequest) {
  if (!req.cookies.has('recoup_session')) return NextResponse.rewrite(new URL('/home', req.url));
  return NextResponse.next();
}

export const config = { matcher: '/' };
