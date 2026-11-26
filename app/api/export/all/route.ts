import { NextResponse } from 'next/server';
import { requireBusiness } from '@/lib/auth';
import { all } from '@/lib/db';
import { allow } from '@/lib/rate-limit';
import { getNow, getSettings } from '@/lib/settings';
import { enterBusiness } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

/** Internal tokens and anything encrypted stay out of the file. */
const INTERNAL = /token|secret|encrypt|sealed/i;

function rows(table: string) {
  return all<Record<string, unknown>>(`SELECT * FROM ${table} ORDER BY id`).map((r) =>
    Object.fromEntries(Object.entries(r).filter(([k]) => !INTERNAL.test(k))),
  );
}

/** Everything a business has in Recoup, as one JSON file. */
export async function GET() {
  const { businessId, business } = enterBusiness(await requireBusiness());
  if (!allow(`export-all:${businessId}`, 5, 10 * 60_000)) {
    return NextResponse.json(
      { error: 'Too many downloads at once. Wait a few minutes and try again.' },
      { status: 429, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  const now = getNow();
  const { savedViews, ...settings } = getSettings();
  const body = {
    exportedAt: new Date(now).toISOString(),
    business: { name: business.name, settings },
    customers: rows('customers'),
    invoices: rows('invoices'),
    cases: rows('cases'),
    installments: rows('installments'),
    messages: rows('messages'),
    payments: rows('payments'),
    events: rows('events'),
    templateSets: rows('template_sets'),
    savedViews,
  };
  const slug = business.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'business';
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="recoup-${slug}-${new Date(now).toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
