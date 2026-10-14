import Link from 'next/link';
import { deleteViewAction, saveViewAction } from '@/app/actions';
import { AutoSubmitForm } from '@/app/components/AutoSubmit';
import { FilterBar } from '@/app/components/FilterBar';
import { Icon } from '@/app/components/icons';
import { SubmitButton } from '@/app/components/SubmitButton';
import { Avatar, ButtonLink, Chip, Empty, ListToolbar, PageTitle, Panel, ReliabilityDot, StatePill } from '@/app/components/ui';
import { requireBusiness } from '@/lib/auth';
import { formatDateTime, money, plural, relativeTime } from '@/lib/format';
import { allCustomerSummaries, ageBucket, AGE_BUCKETS, type CustomerSummary } from '@/lib/service';
import { getNow, getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

type Query = { q?: string; state?: string; type?: string; pattern?: string; min?: string; max?: string; age?: string; tag?: string; sort?: string };

const STATE_OPTIONS = [
  ['', 'Any status'],
  ['owing', 'Owes money'],
  ['active', 'Reminding'],
  ['needs_you', 'Needs you'],
  ['promised', 'Promised'],
  ['disputed', 'Disputed'],
  ['plan', 'On a plan'],
  ['paused', 'Paused'],
  ['not_chasing', 'Not chasing'],
  ['not_due', 'Not due yet'],
  ['clear', 'All paid'],
] as const;

function applyFilters(all: CustomerSummary[], q: Query) {
  const min = q.min ? Number(q.min) * 100 : null;
  const max = q.max ? Number(q.max) * 100 : null;
  let rows = all.filter((s) => {
    if (q.q) {
      const hay = `${s.customer.name} ${s.customer.contactName ?? ''} ${s.customer.email ?? ''} ${s.customer.tags.join(' ')}`.toLowerCase();
      if (!hay.includes(q.q.toLowerCase())) return false;
    }
    if (q.state === 'owing' && s.owedCents === 0) return false;
    if (q.state && q.state !== 'owing' && s.state !== q.state) return false;
    if (q.type && s.customer.type !== q.type) return false;
    if (q.pattern && s.record.reliability !== q.pattern) return false;
    if (min !== null && s.owedCents < min) return false;
    if (max !== null && s.owedCents > max) return false;
    if (q.age && ageBucket(s.oldestOverdueDays)?.key !== q.age) return false;
    if (q.tag && !s.customer.tags.includes(q.tag)) return false;
    return true;
  });
  const sorts: Record<string, (a: CustomerSummary, b: CustomerSummary) => number> = {
    owed: (a, b) => b.owedCents - a.owedCents,
    oldest: (a, b) => b.oldestOverdueDays - a.oldestOverdueDays,
    recent: (a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0),
    name: (a, b) => a.customer.name.localeCompare(b.customer.name),
  };
  rows = rows.sort(sorts[q.sort ?? 'owed'] ?? sorts.owed);
  return rows;
}

const select =
  'h-11 rounded-[var(--radius-control)] bg-paper pr-8 pl-3 text-[15px] ring-1 ring-line ring-inset focus:ring-teal appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat';
const chevron = { backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235e574b' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireBusiness();
  const q = await searchParams;
  const now = getNow();
  const { timezone, savedViews } = getSettings();
  const all = allCustomerSummaries(now);
  const rows = applyFilters(all, q);
  const tags = [...new Set(all.flatMap((s) => s.customer.tags))].sort();
  const query = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]).toString();
  const filtered = Boolean(query && query !== 'sort=owed');
  const owed = rows.reduce((s, r) => s + r.owedCents, 0);

  return (
    <>
      <ListToolbar>
      <PageTitle
        title="Customers"
        sub={
          <>
            {plural(rows.length, 'customer')}
            {filtered ? ` of ${all.length}` : ''} · <span className="num">{money(owed)}</span> owed
          </>
        }
        actions={<ButtonLink href="/import" variant="primary" icon="upload">Import invoices</ButtonLink>}
      />

      {savedViews.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">Saved views</span>
          {savedViews.map((v) => (
            <span key={v.name} className="group inline-flex items-center rounded-full bg-paper ring-1 ring-line">
              <Link href={`/customers?${v.query}`} className={`rounded-full py-1.5 pr-1 pl-3.5 text-sm ${v.query === query ? 'font-semibold text-teal' : ''}`}>
                {v.name}
              </Link>
              <form action={deleteViewAction}>
                <input type="hidden" name="name" value={v.name} />
                <button type="submit" aria-label={`Delete view ${v.name}`} className="ease flex h-7 w-7 items-center justify-center rounded-full text-faint hover:bg-linen hover:text-ink">
                  <Icon name="close" size={14} />
                </button>
              </form>
            </span>
          ))}
        </div>
      )}

      <AutoSubmitForm method="get" className="mb-5">
        <FilterBar active={Object.entries(q).filter(([k, v]) => v && k !== 'q' && k !== 'sort').length} search={
          <label className="relative min-w-0 flex-1 md:max-w-72">
          <span className="sr-only">Search customers</span>
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input
            type="text"
            name="q"
            defaultValue={q.q}
            placeholder="Search customers"
            title="Search by name, email or tag"
            className="h-11 w-full rounded-[var(--radius-control)] bg-paper pr-3 pl-10 ring-1 ring-line ring-inset placeholder:text-faint focus:ring-teal"
          />
        </label>
        }>
        <select name="state" defaultValue={q.state ?? ''} aria-label="Status" className={select} style={chevron}>
          {STATE_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <select name="type" defaultValue={q.type ?? ''} aria-label="Customer type" className={select} style={chevron}>
          <option value="">Businesses & people</option>
          <option value="business">Businesses</option>
          <option value="individual">Individuals</option>
        </select>
        <select name="pattern" defaultValue={q.pattern ?? ''} aria-label="Payment pattern" className={select} style={chevron}>
          <option value="">Any pattern</option>
          <option value="reliable">Reliable</option>
          <option value="sometimes_late">Sometimes late</option>
          <option value="often_late">Often late</option>
          <option value="new">New</option>
        </select>
        <select name="age" defaultValue={q.age ?? ''} aria-label="How overdue" className={select} style={chevron}>
          <option value="">Any age</option>
          {AGE_BUCKETS.map((b) => (
            <option key={b.key} value={b.key}>{b.label} late</option>
          ))}
        </select>
        {tags.length > 0 && (
          <select name="tag" defaultValue={q.tag ?? ''} aria-label="Tag" className={select} style={chevron}>
            <option value="">Any tag</option>
            {tags.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
        <span className="flex items-center gap-1 rounded-[var(--radius-control)] bg-paper px-3 ring-1 ring-line ring-inset">
          <span className="text-sm text-muted">Owed $</span>
          <input type="number" name="min" min={0} defaultValue={q.min} placeholder="min" aria-label="Minimum owed" className="num h-11 w-16 bg-transparent placeholder:text-faint focus:outline-none" />
          <span className="text-faint">–</span>
          <input type="number" name="max" min={0} defaultValue={q.max} placeholder="max" aria-label="Maximum owed" className="num h-11 w-16 bg-transparent placeholder:text-faint focus:outline-none" />
        </span>
        <select name="sort" defaultValue={q.sort ?? 'owed'} aria-label="Sort" className={select} style={chevron}>
          <option value="owed">Most owed</option>
          <option value="oldest">Longest overdue</option>
          <option value="recent">Recent activity</option>
          <option value="name">Name</option>
        </select>
        <button type="submit" className="sr-only">Apply filters</button>
        {filtered && (
          <Link href="/customers" className="px-2 text-sm font-semibold text-teal hover:underline">
            Clear
          </Link>
        )}
        </FilterBar>
      </AutoSubmitForm>

      {filtered && (
        <form action={saveViewAction} className="mb-5 flex flex-wrap items-center gap-2">
          <input type="hidden" name="query" value={query} />
          <label className="sr-only" htmlFor="view-name">Name this view</label>
          <input id="view-name" name="name" required placeholder="Name this view, e.g. Big and late" className="h-9 w-64 rounded-[var(--radius-control)] bg-paper px-3 text-sm ring-1 ring-line ring-inset placeholder:text-faint focus:ring-teal" />
          <SubmitButton size="sm" variant="outline" icon="plus" pendingLabel="Saving…">Save view</SubmitButton>
        </form>
      )}
      {rows.length > 0 && (
        <div className="hidden grid-cols-[2.75rem_minmax(0,2fr)_minmax(0,1.1fr)_7.5rem_minmax(0,1.3fr)] gap-x-4 rounded-t-[var(--radius-panel)] border-b border-linen bg-paper px-6 py-3 text-sm text-muted md:grid">
          <span />
          <span>Customer</span>
          <span>Pattern</span>
          <span className="text-right">Owed</span>
          <span>Status</span>
        </div>
      )}
      </ListToolbar>

      {rows.length === 0 ? (
        <Empty title={all.length ? 'No customers match' : 'No customers yet'} action={all.length ? <ButtonLink href="/customers">Clear filters</ButtonLink> : <ButtonLink href="/import" variant="primary">Import invoices</ButtonLink>}>
          {all.length ? 'Try loosening a filter.' : 'Import a spreadsheet of invoices to get started.'}
        </Empty>
      ) : (
        <Panel className="overflow-clip md:rounded-t-none">
          <ul className="divide-y divide-linen">
            {rows.map((s) => (
              <li key={s.customer.id}>
                <Link href={`/customers/${s.customer.id}`} className="ease grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-4 hover:bg-linen/40 md:grid-cols-[2.75rem_minmax(0,2fr)_minmax(0,1.1fr)_7.5rem_minmax(0,1.3fr)] md:px-6">
                  <Avatar name={s.customer.name} type={s.customer.type} size={44} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-semibold">{s.customer.name}</span>
                      {s.customer.tags.slice(0, 2).map((t) => (
                        <Chip key={t}>{t}</Chip>
                      ))}
                    </div>
                    <div className="truncate text-sm text-muted">
                      {s.customer.type === 'business' ? s.customer.contactName ?? 'Business' : 'Individual'}
                      {s.lastActivityAt ? ` · ${relativeTime(s.lastActivityAt, now)}` : ''}
                    </div>
                    <div className="mt-1 md:hidden">
                      <ReliabilityDot reliability={s.record.reliability} />
                    </div>
                  </div>
                  <div className="hidden md:block">
                    <ReliabilityDot reliability={s.record.reliability} />
                  </div>
                  <div className="col-start-3 row-start-1 self-start text-right md:col-start-auto md:row-start-auto md:self-center">
                    <div className={`num font-semibold ${s.owedCents ? '' : 'text-faint'}`}>{s.owedCents ? money(s.owedCents) : '—'}</div>
                    {s.oldestOverdueDays > 0 && <div className="num text-sm text-muted">{plural(s.oldestOverdueDays, 'day')} late</div>}
                  </div>
                  <div className="col-span-2 col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 md:col-span-1 md:col-start-auto md:flex-col md:items-start">
                    <StatePill state={s.state} />
                    <span className="text-sm text-muted">
                      {s.ready ? (
                        <span className="inline-flex items-center gap-1.5 font-semibold text-marigold-ink">
                          <span className="h-2 w-2 rounded-full bg-marigold" /> Ready to send
                        </span>
                      ) : s.state === 'promised' && s.openCase?.promiseDate ? (
                        `Pays by ${s.openCase.promiseDate.slice(5).replace('-', '/')}`
                      ) : s.next ? (
                        `${s.next.label}, ${formatDateTime(s.next.at, timezone).split(',')[0]}`
                      ) : null}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
