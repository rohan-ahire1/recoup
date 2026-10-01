import { money } from '@/lib/format';

export interface RateRow {
  label: string;
  chased: number;
  recovered: number;
  cases: number;
}

/** Recovery rate per group: one teal bar on a linen track, value at the tip in ink. */
export function RateBars({ rows, empty }: { rows: RateRow[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="flex flex-col gap-4">
      {rows.map((r) => {
        const rate = r.chased ? Math.min(1, r.recovered / r.chased) : 0;
        return (
          <li key={r.label} title={`${money(r.recovered)} recovered of ${money(r.chased)} chased, across ${r.cases} case${r.cases === 1 ? '' : 's'}`}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold">{r.label}</span>
              <span className="num text-muted">
                <span className="font-semibold text-ink">{Math.round(rate * 100)}%</span> · {money(r.recovered)} of {money(r.chased)}
              </span>
            </div>
            <div className="mt-1.5 h-2.5 rounded-full bg-linen">
              <div className="h-full rounded-full bg-teal" style={{ width: `${Math.max(rate * 100, rate > 0 ? 2 : 0)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
