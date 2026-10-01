'use client';

import { useState } from 'react';

export interface Column {
  label: string;
  value: number;
  display: string;
  /** Optional per-column fill (e.g. aging buckets darken with age). */
  color?: string;
}

/** Axis labels in dollars: $0, $500, $1.5k. (A named format, since functions can't cross from server to client.) */
function dollars(v: number): string {
  return v >= 1000 ? `$${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : `$${v}`;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * mag >= v / 2)! * mag;
  return Math.ceil(v / step) * step;
}

/**
 * Single-series columns: ≤24px thick, 4px rounded tops, square at the baseline,
 * hairline grid, value on hover/focus. No legend: the title names the series.
 */
export function ColumnChart({
  data,
  color = '#0f5c55',
  height = 168,
  highlightLast = false,
  label,
}: {
  data: Column[];
  color?: string;
  height?: number;
  highlightLast?: boolean;
  label: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const ticks = [max, max / 2, 0];

  return (
    <figure className="m-0" aria-label={label}>
      <div className="flex gap-3">
        <div className="num flex flex-col justify-between text-right text-xs text-faint" style={{ height }} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 leading-none last:translate-y-0">
              {dollars(t)}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height }} aria-hidden="true">
            {ticks.map((t) => (
              <div key={t} className={`h-px ${t === 0 ? 'bg-linen-2' : 'bg-linen'}`} />
            ))}
          </div>
          <div className="relative flex items-end gap-[2px]" style={{ height }}>
            {data.map((d, i) => {
              const h = d.value > 0 ? Math.max(3, (d.value / max) * height) : 0;
              const isActive = active === i;
              const dim = active !== null && !isActive;
              return (
                <button
                  key={d.label}
                  type="button"
                  className="group relative flex h-full flex-1 items-end justify-center outline-none"
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  aria-label={`${d.label}: ${d.display}`}
                >
                  <span
                    className="ease block w-full max-w-6 rounded-t-[4px] group-focus-visible:ring-2 group-focus-visible:ring-teal group-focus-visible:ring-offset-2"
                    style={{
                      height: h,
                      background: d.color ?? color,
                      opacity: dim ? 0.45 : highlightLast && i !== data.length - 1 && active === null ? 0.55 : 1,
                    }}
                  />
                  {isActive && (
                    <span
                      className="num pointer-events-none absolute z-10 -translate-y-2 rounded-lg bg-ink px-2 py-1 text-xs font-semibold whitespace-nowrap text-sand shadow-md"
                      style={{ bottom: h }}
                    >
                      {d.display}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex gap-[2px]" aria-hidden="true">
            {data.map((d) => (
              <span key={d.label} className="flex-1 text-center text-xs text-muted">
                {d.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.label}>
              <th scope="row">{d.label}</th>
              <td>{d.display}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
