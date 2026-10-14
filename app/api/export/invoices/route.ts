import Papa from 'papaparse';
import { requireBusiness } from '@/lib/auth';
import { getNow } from '@/lib/settings';
import { invoiceRows, type InvoiceQuery } from '@/lib/views';

export const dynamic = 'force-dynamic';

/** The Invoices page, as a spreadsheet: same filters, same rows. */
export async function GET(req: Request) {
  await requireBusiness();
  const q = Object.fromEntries(new URL(req.url).searchParams) as InvoiceQuery;
  const rows = invoiceRows(q, getNow()).map((r) => ({
    Invoice: `#${r.number}`,
    Customer: r.customer.name,
    Type: r.customer.type,
    Contact: r.customer.contactName ?? '',
    Email: r.customer.email ?? '',
    Phone: r.customer.phone ?? '',
    Description: r.description ?? '',
    Amount: (r.amountCents / 100).toFixed(2),
    'Amount paid': (r.amountPaidCents / 100).toFixed(2),
    Issued: r.issuedDate ?? '',
    Due: r.dueDate,
    Paid: r.paidDate ?? '',
    Status: r.state.replace('_', ' '),
    'Days late': r.state === 'overdue' || r.state === 'paid' ? String(r.daysLate) : '',
  }));
  return new Response(Papa.unparse(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="recoup-invoices-${new Date(getNow()).toISOString().slice(0, 10)}.csv"`,
    },
  });
}
