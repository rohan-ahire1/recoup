import Link from 'next/link';
import { markInvoicePaidAction } from '@/app/actions';
import { AutoSubmitForm } from '@/app/components/AutoSubmit';
import { FilterBar } from '@/app/components/FilterBar';
import { Icon } from '@/app/components/icons';
import { SubmitButton } from '@/app/components/SubmitButton';
import { buttonClass, Empty, ListToolbar, PageTitle, Panel } from '@/app/components/ui';
import { formatShortDate, money, plural } from '@/lib/format';
import { AGE_BUCKETS } from '@/lib/service';
import { getNow } from '@/lib/settings';
import { invoiceRows, type InvoiceQuery, type InvoiceRow } from '@/lib/views';

export const dynamic = 'force-dynamic';

const select =
  'h-11 appearance-none rounded-[var(--radius-control)] bg-paper bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-8 pl-3 text-[15px] ring-1 ring-line ring-inset focus:ring-teal';
const chevron = { backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235e574b' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" };

function statusText(r: InvoiceRow) {
  switch (r.state) {
    case 'overdue':
      return <span className="font-semibold text-marigold-ink">{plural(r.daysLate, 'day')} late</span>;
    case 'not_due':
      return <span className="text-muted">Due {formatShortDate(r.dueDate)}</span>;
    case 'disputed':
      return <span className="font-semibold text-rust">Disputed</span>;
    case 'written_off':
      return <span className="text-faint">Written off</span>;
    default:
      return (
        <span className="text-muted">
          Paid{r.paidDate ? ` ${formatShortDate(r.paidDate)}` : ''}
          {r.paidDate && r.daysLate > 2 ? `, ${r.daysLate}d late` : ''}
        </span>
      );
  }
}

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<InvoiceQuery> }) {
  const q = await searchParams;
  const rows = invoiceRows(q, getNow());
  const query = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]).toString();
  const total = rows.reduce((s, r) => s + r.amountCents, 0);
  const owed = rows.reduce((s, r) => s + r.owedCents, 0);

  return (
    <>
      <ListToolbar flush={false}>
      <PageTitle
        title="Invoices"
        sub={
          <>
            {plural(rows.length, 'invoice')} · <span className="num">{money(total)}</span> billed · <span className="num">{money(owed)}</span> still owed
          </>
        }
        actions={
          <>
            <a href={`/api/export/invoices${query ? `?${query}` : ''}`} className={buttonClass('outline')}>
              <Icon name="download" /> Export CSV
            </a>
            <Link href="/import" className={buttonClass('primary')}>
              <Icon name="upload" /> Import
            </Link>
          </>
        }
      />

      <AutoSubmitForm method="get">
        <FilterBar active={Object.entries(q).filter(([k, v]) => v && k !== 'q' && k !== 'sort').length} search={
          <label className="relative min-w-0 flex-1 md:max-w-72">
          <span className="sr-only">Search invoices</span>
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input type="text" name="q" defaultValue={q.q} placeholder="Invoice #, customer, description" className="h-11 w-full rounded-[var(--radius-control)] bg-paper pr-3 pl-10 ring-1 ring-line ring-inset placeholder:text-faint focus:ring-teal" />
        </label>
        }>
        <select name="status" defaultValue={q.status ?? ''} aria-label="Status" className={select} style={chevron}>
          <option value="">Any status</option>
          <option value="open">Open</option>
          <option value="overdue">Overdue</option>
          <option value="not_due">Not due yet</option>
          <option value="disputed">Disputed</option>
          <option value="paid">Paid</option>
          <option value="written_off">Written off</option>
        </select>
        <select name="age" defaultValue={q.age ?? ''} aria-label="How overdue" className={select} style={chevron}>
          <option value="">Any age</option>
          {AGE_BUCKETS.map((b) => (
            <option key={b.key} value={b.key}>{b.label} late</option>
          ))}
        </select>
        <select name="type" defaultValue={q.type ?? ''} aria-label="Customer type" className={select} style={chevron}>
          <option value="">Businesses & people</option>
          <option value="business">Businesses</option>
          <option value="individual">Individuals</option>
        </select>
        <span className="flex items-center gap-1 rounded-[var(--radius-control)] bg-paper px-3 ring-1 ring-line ring-inset">
          <span className="text-sm text-muted">Amount $</span>
          <input type="number" name="min" min={0} defaultValue={q.min} placeholder="min" aria-label="Minimum amount" className="num h-11 w-16 bg-transparent placeholder:text-faint focus:outline-none" />
          <span className="text-faint">–</span>
          <input type="number" name="max" min={0} defaultValue={q.max} placeholder="max" aria-label="Maximum amount" className="num h-11 w-16 bg-transparent placeholder:text-faint focus:outline-none" />
        </span>
        <select name="sort" defaultValue={q.sort ?? 'due'} aria-label="Sort" className={select} style={chevron}>
          <option value="due">Newest due date</option>
          <option value="oldest">Oldest due date</option>
          <option value="amount">Largest amount</option>
          <option value="customer">Customer</option>
        </select>
        <button type="submit" className="sr-only">Apply filters</button>
        {query && (
          <Link href="/invoices" className="px-2 text-sm font-semibold text-teal hover:underline">Clear</Link>
        )}
        </FilterBar>
      </AutoSubmitForm>
      </ListToolbar>

      {rows.length === 0 ? (
        <Empty title="No invoices match" action={<Link href="/invoices" className={buttonClass()}>Clear filters</Link>}>Try loosening a filter.</Empty>
      ) : (
        <>
          {/* Phones and tablets: cards, so nothing scrolls sideways */}
          <Panel className="overflow-hidden lg:hidden">
            <ul className="divide-y divide-linen">
              {rows.map((r) => (
                <li key={r.id} className="flex items-start gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <Link href={`/customers/${r.customerId}`} className="font-semibold hover:underline">{r.customer.name}</Link>
                    <div className="truncate text-sm text-ink-2">
                      <span className="num text-faint">#{r.number}</span> · {r.description ?? 'Invoice'}
                    </div>
                    <div className="mt-1 text-sm">{statusText(r)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="num font-semibold">{money(r.amountCents)}</span>
                    {r.owedCents > 0 && (
                      <form action={markInvoicePaidAction}>
                        <input type="hidden" name="invoiceId" value={r.id} />
                        <SubmitButton variant="ghost" size="sm" pendingLabel="…">Mark paid</SubmitButton>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        <Panel className="hidden overflow-clip lg:block">
            <div>
              <table className="w-full text-left">
                <thead className="sticky-under-toolbar text-sm text-muted [&_th]:bg-paper [&_th]:shadow-[inset_0_-1px_0_var(--color-linen)]">
                  <tr className="border-b border-linen">
                    <th scope="col" className="px-6 py-3.5 font-normal">Invoice</th>
                    <th scope="col" className="px-3 py-3.5 font-normal">Customer</th>
                    <th scope="col" className="px-3 py-3.5 font-normal">For</th>
                    <th scope="col" className="px-3 py-3.5 text-right font-normal">Amount</th>
                    <th scope="col" className="px-3 py-3.5 font-normal">Status</th>
                    <th scope="col" className="px-6 py-3.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linen">
                  {rows.map((r) => (
                    <tr key={r.id} className="ease hover:bg-linen/40">
                      <td className="num px-6 py-3.5 text-sm text-muted">#{r.number}</td>
                      <td className="px-3 py-3.5">
                        <Link href={`/customers/${r.customerId}`} className="font-semibold hover:underline">{r.customer.name}</Link>
                      </td>
                      <td className="max-w-64 truncate px-3 py-3.5 text-ink-2">{r.description ?? '—'}</td>
                      <td className="num px-3 py-3.5 text-right font-semibold">
                        {money(r.amountCents)}
                        {r.amountPaidCents > 0 && r.owedCents > 0 && <span className="block text-sm font-normal text-muted">{money(r.owedCents)} left</span>}
                      </td>
                      <td className="px-3 py-3.5 text-sm">{statusText(r)}</td>
                      <td className="px-6 py-3.5 text-right">
                        {r.owedCents > 0 && (
                          <form action={markInvoicePaidAction} className="-my-2">
                            <input type="hidden" name="invoiceId" value={r.id} />
                            <SubmitButton variant="ghost" size="sm" pendingLabel="…">Mark paid</SubmitButton>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </>
  );
}
