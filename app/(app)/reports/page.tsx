import Link from 'next/link';
import { ColumnChart } from '@/app/components/ColumnChart';
import { RateBars } from '@/app/components/RateBars';
import { Avatar, PageTitle, Panel, Stat } from '@/app/components/ui';
import { money, plural } from '@/lib/format';
import { allCustomerSummaries, breakdowns, overview } from '@/lib/service';
import { getNow } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const AGING_COLORS = ['#f2c57c', '#e8a33d', '#c07a17', '#8a5610'];

export default function ReportsPage() {
  const now = getNow();
  const o = overview(now);
  const b = breakdowns(now);
  const top = allCustomerSummaries(now)
    .filter((s) => s.owedCents > 0)
    .sort((a, z) => z.owedCents - a.owedCents)
    .slice(0, 6);

  return (
    <>
      <PageTitle title="Reports" sub="What’s owed, what came back, and what works." />

      <Panel className="mb-6 grid gap-6 p-6 sm:grid-cols-2 sm:p-7 lg:grid-cols-4">
        <Stat label="Owed right now" value={money(o.owedCents)} sub={`${plural(o.owingCustomers, 'customer')}`} />
        <Stat label="Recovered with Recoup" value={money(o.recoveredAll)} sub={`${money(o.recoveredThisMonth)} this month`} />
        <Stat label="Recovery rate" value={`${Math.round(o.recoveryRate * 100)}%`} sub="of everything that went overdue" />
        <Stat label="Typical time to get paid" value={b.avgDaysToRecover === null ? '—' : plural(b.avgDaysToRecover, 'day')} sub={`across ${plural(b.resolvedCount, 'recovered case')}`} />
      </Panel>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel className="p-6 sm:p-7">
          <h2 className="display text-[22px] font-bold">Recovered each month</h2>
          <p className="mb-5 text-sm text-muted">Payments on invoices that Recoup chased.</p>
          <ColumnChart label="Money recovered each month" data={o.months.map((m) => ({ label: m.label, value: m.cents / 100, display: money(m.cents) }))} highlightLast height={200} />
        </Panel>
        <Panel className="p-6 sm:p-7">
          <h2 className="display text-[22px] font-bold">How late the money is</h2>
          <p className="mb-5 text-sm text-muted">Overdue balances by days past due. The older it gets, the harder it is to collect.</p>
          <ColumnChart
            label="Overdue money by days past due"
            data={o.aging.map((a, i) => ({ label: a.label, value: a.cents / 100, display: `${money(a.cents)} · ${plural(a.count, 'invoice')}`, color: AGING_COLORS[i] }))}
           
            height={200}
          />
        </Panel>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Panel className="p-6 sm:p-7">
          <h2 className="display text-[22px] font-bold">By tone</h2>
          <p className="mb-5 text-sm text-muted">Tone of the last message before the case closed or now.</p>
          <RateBars rows={b.byTone} empty="Send a few reminders to see which tone works best." />
        </Panel>
        <Panel className="p-6 sm:p-7">
          <h2 className="display text-[22px] font-bold">Businesses vs people</h2>
          <p className="mb-5 text-sm text-muted">Recovered out of what went overdue.</p>
          <RateBars rows={b.byType} empty="No overdue invoices yet." />
        </Panel>
        <Panel className="p-6 sm:p-7">
          <h2 className="display text-[22px] font-bold">By payment pattern</h2>
          <p className="mb-5 text-sm text-muted">Based on each customer’s paid history.</p>
          <RateBars rows={b.byReliability} empty="Import paid invoices to see patterns." />
        </Panel>
      </div>

      <Panel className="p-6 sm:p-7">
        <h2 className="display mb-4 text-[22px] font-bold">Who owes the most</h2>
        <ul className="divide-y divide-linen">
          {top.map((s) => (
            <li key={s.customer.id}>
              <Link href={`/customers/${s.customer.id}`} className="ease -mx-3 flex items-center gap-4 rounded-2xl px-3 py-3 hover:bg-linen/50">
                <Avatar name={s.customer.name} type={s.customer.type} size={36} />
                <span className="min-w-0 flex-1 font-semibold">{s.customer.name}</span>
                <span className="text-sm text-muted">{s.oldestOverdueDays ? `${plural(s.oldestOverdueDays, 'day')} late` : 'Not due yet'}</span>
                <span className="num w-28 text-right font-semibold">{money(s.owedCents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
