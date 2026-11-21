import { requireBusiness } from '@/lib/auth';
import { getNow } from '@/lib/settings';
import { enterBusiness } from '@/lib/tenant';
import { invoiceCsv, invoiceRows, type InvoiceQuery } from '@/lib/views';

export const dynamic = 'force-dynamic';

/** The Invoices page, as a spreadsheet: same filters, same rows. */
export async function GET(req: Request) {
  enterBusiness(await requireBusiness());
  const q = Object.fromEntries(new URL(req.url).searchParams) as InvoiceQuery;
  const rows = invoiceRows(q, getNow());
  return new Response(invoiceCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="recoup-invoices-${new Date(getNow()).toISOString().slice(0, 10)}.csv"`,
    },
  });
}
