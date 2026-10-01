export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Texts only go out between 8am and 9pm in the business's timezone. */
export const SMS_WINDOW_START_HOUR = 8;
export const SMS_WINDOW_END_HOUR = 21;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function localParts(ms: number, timeZone: string) {
  const parts = formatter(timeZone).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Calendar date (YYYY-MM-DD) of an instant in the given timezone. */
export function localDate(ms: number, timeZone: string): string {
  const p = localParts(ms, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function monthKey(ms: number, timeZone: string): string {
  const p = localParts(ms, timeZone);
  return `${p.year}-${pad(p.month)}`;
}

export function isSmsAllowed(ms: number, timeZone: string): boolean {
  const { hour } = localParts(ms, timeZone);
  return hour >= SMS_WINDOW_START_HOUR && hour < SMS_WINDOW_END_HOUR;
}

/** The earliest instant at or after `ms` when a text may be sent. */
export function nextSmsWindow(ms: number, timeZone: string): number {
  if (isSmsAllowed(ms, timeZone)) return ms;
  // Every real-world UTC offset is a multiple of 15 minutes, so stepping on
  // 15-minute boundaries lands exactly on 8:00 local.
  const step = 15 * MINUTE;
  let t = Math.ceil(ms / step) * step;
  for (let i = 0; i < 4 * 48; i++, t += step) {
    if (isSmsAllowed(t, timeZone)) return t;
  }
  return ms;
}

function dateToUtcMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((dateToUtcMs(toDate) - dateToUtcMs(fromDate)) / DAY);
}

export function shiftDate(date: string, days: number): string {
  return new Date(dateToUtcMs(date) + days * DAY).toISOString().slice(0, 10);
}

export function daysOverdue(dueDate: string, now: number, timeZone: string): number {
  return Math.max(0, daysBetween(dueDate, localDate(now, timeZone)));
}
