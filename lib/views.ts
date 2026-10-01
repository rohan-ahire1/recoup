import { listAllInvoices, listCustomers } from './repo';
import { ageBucket } from './service';
import { getSettings } from './settings';
import { daysBetween, localDate } from './time';
import type { Customer, Invoice } from './types';

export type InvoiceQuery = { q?: string; status?: string; type?: string; min?: string; max?: string; age?: string; sort?: string };

export interface InvoiceRow extends Invoice {
  customer: Customer;
  owedCents: number;
  daysLate: number;
  /** open, overdue, not_due, paid, disputed, written_off */
  state: string;
}

export function invoiceRows(q: InvoiceQuery, now: number): InvoiceRow[] {
  const t = localDate(now, getSettings().timezone);
  const customers = new Map(listCustomers().map((c) => [c.id, c]));
  const min = q.min ? Number(q.min) * 100 : null;
  const max = q.max ? Number(q.max) * 100 : null;
  const rows: InvoiceRow[] = listAllInvoices().map((i) => {
    const owedCents = i.status === 'open' || i.status === 'disputed' ? i.amountCents - i.amountPaidCents : 0;
    const daysLate = i.status === 'paid' && i.paidDate ? Math.max(0, daysBetween(i.dueDate, i.paidDate)) : Math.max(0, daysBetween(i.dueDate, t));
    const state = i.status === 'open' ? (i.dueDate < t ? 'overdue' : 'not_due') : i.status;
    return { ...i, customer: customers.get(i.customerId)!, owedCents, daysLate, state };
  });
  const out = rows.filter((r) => {
    if (q.q) {
      const hay = `${r.number} ${r.description ?? ''} ${r.customer.name}`.toLowerCase();
      if (!hay.includes(q.q.toLowerCase().replace(/^#/, ''))) return false;
    }
    if (q.status === 'open' && !(r.state === 'overdue' || r.state === 'not_due' || r.state === 'disputed')) return false;
    if (q.status && q.status !== 'open' && r.state !== q.status) return false;
    if (q.type && r.customer.type !== q.type) return false;
    if (min !== null && r.amountCents < min) return false;
    if (max !== null && r.amountCents > max) return false;
    if (q.age && (r.state !== 'overdue' || ageBucket(r.daysLate)?.key !== q.age)) return false;
    return true;
  });
  const sorts: Record<string, (a: InvoiceRow, b: InvoiceRow) => number> = {
    due: (a, b) => b.dueDate.localeCompare(a.dueDate),
    oldest: (a, b) => a.dueDate.localeCompare(b.dueDate),
    amount: (a, b) => b.amountCents - a.amountCents,
    customer: (a, b) => a.customer.name.localeCompare(b.customer.name),
  };
  return out.sort(sorts[q.sort ?? 'due'] ?? sorts.due);
}
