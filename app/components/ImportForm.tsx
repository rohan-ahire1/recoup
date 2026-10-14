'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Icon } from './icons';
import { buttonClass } from './ui';

interface PreviewRow {
  line: number;
  raw: Record<string, string>;
  invoice: {
    customerName: string;
    customerType: 'business' | 'individual' | null;
    invoiceNumber: string;
    description: string | null;
    amountCents: number;
    dueDate: string;
    paid: boolean;
    paidDate: string | null;
  } | null;
  errors: string[];
  warnings: string[];
  duplicate: boolean;
  existingCustomer: boolean;
}

interface Preview {
  missingColumns: string[];
  hasHistory: boolean;
  rows: PreviewRow[];
  summary: { total: number; ready: number; duplicates: number; errors: number; customers: number; paidCount: number; overdueCount: number; overdueCents: number };
}

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export function ImportForm() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showAll, setShowAll] = useState(false);

  async function load(text: string, name: string) {
    setError('');
    setCsv(text);
    setFileName(name);
    setBusy(true);
    try {
      const res = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv: text, dryRun: true }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not read that file');
      setPreview(data);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Import failed');
      router.push('/customers');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  function reset() {
    setPreview(null);
    setCsv('');
    setError('');
    setShowAll(false);
    if (input.current) input.current.value = '';
  }

  if (!preview) {
    return (
      <div className="flex flex-col gap-4">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) await load(await f.text(), f.name);
          }}
          className={`ease flex cursor-pointer flex-col items-center justify-center rounded-panel border-2 border-dashed px-6 py-16 text-center ${
            dragging ? 'border-teal bg-teal-soft' : 'border-linen-2 bg-paper hover:border-faint'
          }`}
        >
          <Icon name="upload" size={28} className="text-teal" />
          <span className="mt-3 text-base font-semibold">{busy ? 'Reading…' : 'Drop a CSV here, or choose a file'}</span>
          <span className="mt-1 max-w-md text-muted">From QuickBooks, Xero, FreshBooks, Jobber, or any spreadsheet. You’ll see exactly what happens before anything is sent.</span>
          <input
            ref={input}
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await load(await f.text(), f.name);
            }}
          />
        </label>
        {error && <p className="rounded-block bg-rust-soft px-4 py-3 text-sm text-rust">{error}</p>}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            className={buttonClass('quiet', 'sm')}
            onClick={async () => {
              const res = await fetch('/api/sample-csv');
              await load(await res.text(), 'sample-invoices.csv');
            }}
          >
            Try a sample file
          </button>
          <a href="/api/sample-csv?download=1" className="font-semibold text-teal hover:underline">
            Download the template
          </a>
        </div>
      </div>
    );
  }

  const { summary } = preview;
  const rows = showAll ? preview.rows : preview.rows.filter((r) => !r.invoice || r.warnings.length || r.duplicate || !r.invoice.paid).slice(0, 40);
  return (
    <div className="flex flex-col gap-5">
      {preview.missingColumns.length > 0 ? (
        <div className="rounded-block bg-rust-soft px-5 py-4 text-rust">
          <p className="font-semibold">{fileName} is missing: {preview.missingColumns.join(', ')}.</p>
          <p className="mt-1 text-sm">Rename the headers to match the template, then try again.</p>
        </div>
      ) : (
        <div className="rounded-panel bg-paper p-6 ring-1 ring-edge ring-inset shadow-[var(--shadow-lift)]">
          <p className="text-sm text-muted">{fileName}</p>
          <p className="display mt-1 text-section font-bold text-balance">
            {summary.customers} customers, {summary.ready} invoices.{' '}
            {summary.overdueCount > 0 ? (
              <span className="text-teal">
                {summary.overdueCount} overdue ({money(summary.overdueCents)}) will get reminders.
              </span>
            ) : (
              'Nothing is overdue yet.'
            )}
          </p>
          <ul className="mt-3 flex flex-col gap-1 text-sm text-ink-2">
            {summary.paidCount > 0 && <li>{summary.paidCount} paid invoices become each customer’s track record.</li>}
            {!preview.hasHistory && <li>No paid invoices in this file. Reminders still work; add paid ones any time to see who usually pays late.</li>}
            {summary.duplicates > 0 && <li>{summary.duplicates} already imported, skipped.</li>}
            {summary.errors > 0 && <li className="text-rust">{summary.errors} can’t be imported (see below).</li>}
            <li>Nothing is sent now. First reminders land in To send.</li>
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" disabled={busy || summary.ready === 0} onClick={confirmImport} className={buttonClass('primary')}>
              {busy ? 'Importing…' : `Import ${summary.ready} invoices`}
            </button>
            <button type="button" onClick={reset} className={buttonClass('ghost')}>
              Choose another file
            </button>
          </div>
        </div>
      )}
      {error && <p className="rounded-block bg-rust-soft px-4 py-3 text-sm text-rust">{error}</p>}

      {preview.rows.length > 0 && (
        <div className="overflow-hidden rounded-panel bg-paper ring-1 ring-edge ring-inset">
          <div className="flex items-center justify-between px-6 pt-5 pb-2">
            <h2 className="font-semibold">{showAll ? 'Every row' : 'Open invoices and anything to check'}</h2>
            <button type="button" onClick={() => setShowAll((v) => !v)} className="text-sm font-semibold text-teal hover:underline">
              {showAll ? 'Show fewer' : `Show all ${preview.rows.length} rows`}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-muted">
                <tr className="border-b border-linen">
                  <th scope="col" className="px-6 py-2.5 font-normal">Line</th>
                  <th scope="col" className="px-3 py-2.5 font-normal">Customer</th>
                  <th scope="col" className="px-3 py-2.5 font-normal">Invoice</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-normal">Amount</th>
                  <th scope="col" className="px-3 py-2.5 font-normal">Due</th>
                  <th scope="col" className="px-6 py-2.5 font-normal">Check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-linen">
                {rows.map((r) => (
                  <tr key={r.line} className={!r.invoice ? 'bg-rust-soft/50' : r.duplicate ? 'opacity-55' : ''}>
                    <td className="num px-6 py-2.5 text-faint">{r.line}</td>
                    <td className="px-3 py-2.5">
                      {r.invoice?.customerName ?? Object.values(r.raw)[0]}
                      {r.invoice && <span className="block text-xs text-faint">{r.existingCustomer ? 'Existing customer' : r.invoice.customerType === 'business' ? 'Business' : 'Individual'}</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {r.invoice ? `#${r.invoice.invoiceNumber}` : '—'}
                      {r.invoice?.description && <span className="block max-w-56 truncate text-xs text-faint">{r.invoice.description}</span>}
                    </td>
                    <td className="num px-3 py-2.5 text-right">{r.invoice ? money(r.invoice.amountCents) : '—'}</td>
                    <td className="num px-3 py-2.5 whitespace-nowrap text-muted">{r.invoice?.dueDate ?? '—'}</td>
                    <td className="px-6 py-2.5">
                      {!r.invoice ? (
                        <span className="text-rust">{r.errors.join('. ')}</span>
                      ) : r.duplicate ? (
                        <span className="text-muted">Already imported</span>
                      ) : r.warnings.length ? (
                        <span className="text-marigold-ink">{r.warnings.join('. ')}</span>
                      ) : r.invoice.paid ? (
                        <span className="text-muted">Paid {r.invoice.paidDate ?? ''}</span>
                      ) : (
                        <span className="font-semibold text-teal">Open</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
