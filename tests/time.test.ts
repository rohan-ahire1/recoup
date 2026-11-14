import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  daysOverdue,
  isSmsAllowed,
  localDate,
  localParts,
  monthKey,
  nextSmsWindow,
  shiftDate,
} from '../lib/time';

const CHICAGO = 'America/Chicago';
const KOLKATA = 'Asia/Kolkata';
const KATHMANDU = 'Asia/Kathmandu';
const LOS_ANGELES = 'America/Los_Angeles';

const at = (iso: string) => Date.parse(iso);

describe('localDate / localParts', () => {
  it('reports the business local date, not the UTC date', () => {
    const ms = at('2026-09-01T03:00:00Z'); // 22:00 on 31 Aug in Chicago
    expect(localDate(ms, CHICAGO)).toBe('2026-08-31');
    expect(localParts(ms, CHICAGO)).toEqual({ year: 2026, month: 8, day: 31, hour: 22, minute: 0 });
  });

  it('handles half-hour and quarter-hour offsets', () => {
    const ms = at('2026-01-01T00:00:00Z');
    expect(localParts(ms, KOLKATA)).toEqual({ year: 2026, month: 1, day: 1, hour: 5, minute: 30 });
    expect(localDate(ms, KOLKATA)).toBe('2026-01-01');
    // +5:45 is 05:45, not 05:30.
    expect(localParts(ms, KATHMANDU)).toEqual({ year: 2026, month: 1, day: 1, hour: 5, minute: 45 });
  });

  it('tracks the US DST transitions', () => {
    // On 2026-03-08 the clocks spring forward at 02:00 CST, so 08:00 is already CDT.
    expect(localParts(at('2026-03-08T13:00:00Z'), CHICAGO)).toEqual({ year: 2026, month: 3, day: 8, hour: 8, minute: 0 });
    expect(localParts(at('2026-03-08T14:00:00Z'), CHICAGO)).toEqual({ year: 2026, month: 3, day: 8, hour: 9, minute: 0 });
    // On 2026-11-01 the clocks fall back at 02:00 CDT: local 01:00 happens twice,
    // at 06:00Z (CDT) and again at 07:00Z (CST).
    expect(localParts(at('2026-11-01T06:00:00Z'), CHICAGO)).toEqual({ year: 2026, month: 11, day: 1, hour: 1, minute: 0 });
    expect(localParts(at('2026-11-01T07:00:00Z'), CHICAGO)).toEqual({ year: 2026, month: 11, day: 1, hour: 1, minute: 0 });
    expect(localParts(at('2026-11-01T08:00:00Z'), CHICAGO)).toEqual({ year: 2026, month: 11, day: 1, hour: 2, minute: 0 });
  });
});

describe('isSmsAllowed', () => {
  // Chicago is UTC-5 in September, so local wall times map to these instants.
  it('is false at 7:59 and 21:00 local, true at 8:00 and 20:59', () => {
    expect(isSmsAllowed(at('2026-09-01T12:59:00Z'), CHICAGO)).toBe(false); // 07:59
    expect(isSmsAllowed(at('2026-09-01T13:00:00Z'), CHICAGO)).toBe(true); // 08:00
    expect(isSmsAllowed(at('2026-09-02T01:59:00Z'), CHICAGO)).toBe(true); // 20:59
    expect(isSmsAllowed(at('2026-09-02T02:00:00Z'), CHICAGO)).toBe(false); // 21:00
  });

  it('uses the local clock on DST transition days', () => {
    expect(isSmsAllowed(at('2026-03-08T13:00:00Z'), CHICAGO)).toBe(true); // 08:00 CDT
    expect(isSmsAllowed(at('2026-03-08T12:59:00Z'), CHICAGO)).toBe(false); // 06:59 CST
    expect(isSmsAllowed(at('2026-11-01T14:00:00Z'), CHICAGO)).toBe(true); // 08:00 CST
    expect(isSmsAllowed(at('2026-11-01T13:00:00Z'), CHICAGO)).toBe(false); // 07:00 CST
  });

  it('respects half-hour offsets', () => {
    expect(isSmsAllowed(at('2026-06-01T02:29:00Z'), KOLKATA)).toBe(false); // 07:59
    expect(isSmsAllowed(at('2026-06-01T02:30:00Z'), KOLKATA)).toBe(true); // 08:00
    expect(isSmsAllowed(at('2026-06-01T02:14:00Z'), KATHMANDU)).toBe(false); // 07:59 (+5:45)
    expect(isSmsAllowed(at('2026-06-01T02:15:00Z'), KATHMANDU)).toBe(true); // 08:00
  });
});

describe('nextSmsWindow', () => {
  it('returns the input unchanged when already inside the window', () => {
    const inside = at('2026-09-01T17:07:33.250Z'); // 12:07:33 Chicago
    expect(nextSmsWindow(inside, CHICAGO)).toBe(inside);
    const kathmanduInside = at('2026-06-01T04:12:34Z'); // 09:57:34 Kathmandu
    expect(nextSmsWindow(kathmanduInside, KATHMANDU)).toBe(kathmanduInside);
  });

  it('jumps from 22:00 to 08:00 the next local day', () => {
    const from = at('2026-09-01T03:00:00Z'); // 22:00 Chicago on 31 Aug
    const next = nextSmsWindow(from, CHICAGO);
    expect(next).toBe(at('2026-09-01T13:00:00Z'));
    expect(localParts(next, CHICAGO)).toEqual({ year: 2026, month: 9, day: 1, hour: 8, minute: 0 });
  });

  it('jumps from 21:00 (first disallowed minute) to 08:00', () => {
    expect(nextSmsWindow(at('2026-09-02T02:00:00Z'), CHICAGO)).toBe(at('2026-09-02T13:00:00Z'));
  });

  it('crosses the US fall-back change (2026-11-01)', () => {
    const from = at('2026-11-01T03:00:00Z'); // 22:00 CDT on 31 Oct
    const next = nextSmsWindow(from, CHICAGO);
    // After the change Chicago is UTC-6, so 08:00 CST is 14:00Z.
    expect(next).toBe(at('2026-11-01T14:00:00Z'));
    expect(localParts(next, CHICAGO)).toEqual({ year: 2026, month: 11, day: 1, hour: 8, minute: 0 });
  });

  it('crosses the US spring-forward change (2026-03-08)', () => {
    const from = at('2026-03-08T04:00:00Z'); // 22:00 CST on 7 Mar
    const next = nextSmsWindow(from, CHICAGO);
    // After the change Chicago is UTC-5, so 08:00 CDT is 13:00Z.
    expect(next).toBe(at('2026-03-08T13:00:00Z'));
    expect(localParts(next, CHICAGO)).toEqual({ year: 2026, month: 3, day: 8, hour: 8, minute: 0 });
  });

  it('lands on 08:00 local in half-hour and quarter-hour timezones', () => {
    const fromKolkata = at('2026-06-01T16:30:00Z'); // 22:00 IST
    const nextKolkata = nextSmsWindow(fromKolkata, KOLKATA);
    expect(nextKolkata).toBe(at('2026-06-02T02:30:00Z'));
    expect(localParts(nextKolkata, KOLKATA)).toEqual({ year: 2026, month: 6, day: 2, hour: 8, minute: 0 });

    const fromKathmandu = at('2026-06-01T16:15:00Z'); // 22:00 NPT (+5:45)
    const nextKathmandu = nextSmsWindow(fromKathmandu, KATHMANDU);
    expect(nextKathmandu).toBe(at('2026-06-02T02:15:00Z'));
    expect(localParts(nextKathmandu, KATHMANDU)).toEqual({ year: 2026, month: 6, day: 2, hour: 8, minute: 0 });
  });

  it('stays on the same local day when woken before 08:00', () => {
    const from = at('2026-09-01T10:00:00Z'); // 05:00 Chicago
    const next = nextSmsWindow(from, CHICAGO);
    expect(next).toBe(at('2026-09-01T13:00:00Z'));
    expect(localDate(next, CHICAGO)).toBe('2026-09-01');
  });
});

describe('daysBetween / shiftDate', () => {
  it('counts across month ends', () => {
    expect(daysBetween('2026-01-31', '2026-03-01')).toBe(29);
    expect(daysBetween('2026-04-30', '2026-06-01')).toBe(32);
    expect(daysBetween('2026-03-01', '2026-01-31')).toBe(-29);
  });

  it('counts across a leap day', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2028-02-29', '2028-03-01')).toBe(1);
    expect(daysBetween('2028-02-28', '2028-02-29')).toBe(1);
  });

  it('counts across year boundaries', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
    expect(daysBetween('2026-01-01', '2025-12-31')).toBe(-1);
  });

  it('shifts over month ends, leap days and year ends', () => {
    expect(shiftDate('2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftDate('2028-02-29', 1)).toBe('2028-03-01');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('shifts by whole calendar days regardless of DST', () => {
    expect(shiftDate('2026-11-01', 1)).toBe('2026-11-02');
    expect(shiftDate('2026-03-08', -1)).toBe('2026-03-07');
    expect(shiftDate('2026-03-08', 1)).toBe('2026-03-09');
  });
});

describe('daysOverdue', () => {
  it('measures lateness in business-local calendar days', () => {
    const now = at('2026-09-01T03:00:00Z'); // 31 Aug local in Chicago
    expect(daysOverdue('2026-08-31', now, CHICAGO)).toBe(0);
    expect(daysOverdue('2026-08-29', now, CHICAGO)).toBe(2);
    expect(daysOverdue('2026-08-30', now, CHICAGO)).toBe(1);
  });

  it('never goes negative when the invoice is not due yet', () => {
    const now = at('2026-09-01T12:00:00Z'); // 1 Sep Chicago
    expect(daysOverdue('2026-09-01', now, CHICAGO)).toBe(0);
    expect(daysOverdue('2026-09-02', now, CHICAGO)).toBe(0);
    expect(daysOverdue('2027-01-01', now, CHICAGO)).toBe(0);
  });
});

describe('monthKey', () => {
  it('uses the business-local month, not the UTC month', () => {
    // 2026-10-01T02:00Z is still 30 Sep (19:00 PDT) in Los Angeles.
    expect(monthKey(at('2026-10-01T02:00:00Z'), LOS_ANGELES)).toBe('2026-09');
    expect(monthKey(at('2026-10-01T06:59:00Z'), LOS_ANGELES)).toBe('2026-09'); // 23:59 PDT on 30 Sep
    expect(monthKey(at('2026-10-01T08:00:00Z'), LOS_ANGELES)).toBe('2026-10');
  });

  it('rolls over the year boundary locally', () => {
    expect(monthKey(at('2026-01-01T07:59:00Z'), LOS_ANGELES)).toBe('2025-12');
    expect(monthKey(at('2026-01-01T08:00:00Z'), LOS_ANGELES)).toBe('2026-01');
  });
});
