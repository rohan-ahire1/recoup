import { ImportForm } from '@/app/components/ImportForm';
import { PageTitle, Panel } from '@/app/components/ui';
import { requireBusiness } from '@/lib/auth';
import { STEPS } from '@/lib/sequence';
import { enterBusiness } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

const COLUMNS: [string, string][] = [
  ['Customer', 'Business or person’s name'],
  ['Email / Phone', 'At least one, for open invoices'],
  ['Invoice', 'Invoice number'],
  ['Amount', '$475 or 475.00'],
  ['Due', 'A date, or days late like 32d'],
  ['Paid', 'Paid date. Leave empty if unpaid'],
  ['Type', 'business or individual (optional)'],
  ['Contact, Description, Tags', 'Optional extras'],
];

export default async function ImportPage() {
  enterBusiness(await requireBusiness());
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <PageTitle title="Import invoices" sub="Include paid invoices too. Recoup learns how each customer usually pays and picks the right tone." />
        <ImportForm />
      </div>
      <aside className="flex flex-col gap-5">
        <Panel className="p-6">
          <h2 className="font-semibold">Columns Recoup understands</h2>
          <dl className="mt-3 flex flex-col gap-2.5 text-sm">
            {COLUMNS.map(([k, v]) => (
              <div key={k}>
                <dt className="font-semibold">{k}</dt>
                <dd className="text-muted">{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel className="p-6">
          <h2 className="font-semibold">What happens next</h2>
          <ol className="mt-3 flex flex-col gap-3 text-sm">
            {STEPS.map((s) => (
              <li key={s.step} className="flex gap-3">
                <span className="num w-12 shrink-0 text-faint">Day {s.day}</span>
                <span>{s.label}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-linen pt-3 text-sm text-muted">One message per customer, covering all their overdue invoices. Stops when they pay, reply, promise a date, or dispute.</p>
        </Panel>
      </aside>
    </div>
  );
}
