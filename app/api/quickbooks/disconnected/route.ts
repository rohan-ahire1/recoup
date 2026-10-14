import { NextResponse } from 'next/server';
import { baseUrl } from '@/lib/templates';

export const dynamic = 'force-dynamic';

/**
 * Intuit's "Disconnect URL": where people land after disconnecting Recoup from
 * inside QuickBooks. The tokens stop working on their own; the next sync notices
 * and Settings asks them to connect again.
 */
export function GET() {
  return NextResponse.redirect(`${baseUrl()}/settings?qb=disconnected`);
}
