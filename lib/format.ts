import type { CaseStatus, InvoiceStatus } from './types';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function money(cents: number): string {
  return usd.format(cents / 100);
}

/** Drops cents on round amounts, for headline numbers. */
export function moneyShort(cents: number): string {
  return cents % 100 === 0 ? usdWhole.format(cents / 100) : usd.format(cents / 100);
}

export function formatDate(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(new Date(ms));
}

export function formatDateTime(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}

export function formatLongDate(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'long', day: 'numeric' }).format(
    new Date(ms),
  );
}

export function relativeTime(ms: number, now: number): string {
  const diff = now - ms;
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [86_400_000, 'day'],
    [3_600_000, 'hour'],
    [60_000, 'minute'],
  ];
  for (const [size, name] of units) {
    if (abs >= size) {
      const n = Math.round(abs / size);
      const label = `${n} ${name}${n === 1 ? '' : 's'}`;
      return diff >= 0 ? `${label} ago` : `in ${label}`;
    }
  }
  return 'just now';
}

export function formatPhone(e164: string | null): string {
  if (!e164) return '';
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

export const CASE_LABELS: Record<CaseStatus | 'clear' | 'not_chasing' | 'not_due', string> = {
  active: 'Reminding',
  needs_you: 'Needs you',
  promised: 'Promised',
  disputed: 'Disputed',
  paused: 'Paused',
  plan: 'On a plan',
  unreachable: 'Unreachable',
  resolved: 'Resolved',
  clear: 'All paid',
  not_chasing: 'Not chasing',
  not_due: 'Not due yet',
};

export const INVOICE_LABELS: Record<InvoiceStatus, string> = {
  open: 'Open',
  paid: 'Paid',
  disputed: 'Disputed',
  written_off: 'Written off',
};

export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s&]/gu, '').split(/\s+/).filter((w) => w && w !== '&');
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00Z`));
}

export function formatDateLong(date: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}
