import { describe, expect, it } from 'vitest';
import { daysBetween, daysOverdue, isSmsAllowed, localDate, localParts, monthKey, nextSmsWindow, shiftDate } from '../lib/time';

const CHI = 'America/Chicago';
const iso = (s: string) => Date.parse(s);

describe('localDate / localParts', () => {
  it('gives the business-local date, not UTC', () => {
    const t = iso('2026-09-01T03:00:00Z');
    expect(localDate(t, CHI)).toBe('2026-08-31');
    expect(localDate(t, 'UTC')).toBe('2026-09-01');
    expect(localParts(t, CHI)).toEqual({ year: 2026, month: 8, day: 31, hour: 22, minute: 0 });
  });

  it('handles half-hour and 45-minute offsets', () => {
    expect(localParts(iso('2026-09-01T00:00:00Z'), 'Asia/Kolkata')).toMatchObject({ day: 1, hour: 5, minute: 30 });
    expect(localParts(iso('2026-09-01T00:00:00Z'), 'Asia/Kathmandu')).toMatchObject({ day: 1, hour: 5, minute: 45 });
  });

  it('reports midnight as hour 0, not 24', () => {
    expect(localParts(iso('2026-09-01T05:00:00Z'), CHI).hour).toBe(0);
  });
});

describe('isSmsAllowed', () => {
  it('is false at 7:59 and 21:00 local, true at 8:00 and 20:59', () => {
    // 2026-09-01 is CDT (UTC-5)
    expect(isSmsAllowed(iso('2026-09-01T12:59:00Z'), CHI)).toBe(false); // 7:59
    expect(isSmsAllowed(iso('2026-09-01T13:00:00Z'), CHI)).toBe(true); // 8:00
    expect(isSmsAllowed(iso('2026-09-02T01:59:00Z'), CHI)).toBe(true); // 20:59
    expect(isSmsAllowed(iso('2026-09-02T02:00:00Z'), CHI)).toBe(false); // 21:00
  });

  it('uses local time, not UTC', () => {
    // 15:00Z is 8:00 in Los Angeles (PDT); 15:29Z is 20:59 in Kolkata but 21:14 in Kathmandu
    expect(isSmsAllowed(iso('2026-09-01T15:00:00Z'), 'America/Los_Angeles')).toBe(true);
    expect(isSmsAllowed(iso('2026-09-01T15:29:00Z'), 'Asia/Kolkata')).toBe(true);
    expect(isSmsAllowed(iso('2026-09-01T15:29:00Z'), 'Asia/Kathmandu')).toBe(false);
  });
});

describe('nextSmsWindow', () => {
  it('returns the input unchanged inside the window', () => {
    const t = iso('2026-09-01T15:07:00Z');
    expect(nextSmsWindow(t, CHI)).toBe(t);
    const edge = iso('2026-09-01T13:00:00Z'); // exactly 8:00
    expect(nextSmsWindow(edge, CHI)).toBe(edge);
  });

  it('moves 22:00 to 08:00 the next local day', () => {
    expect(nextSmsWindow(iso('2026-09-02T03:00:00Z'), CHI)).toBe(iso('2026-09-02T13:00:00Z'));
  });

  it('moves early-morning times to 08:00 the same local day', () => {
    expect(nextSmsWindow(iso('2026-09-01T09:00:00Z'), CHI)).toBe(iso('2026-09-01T13:00:00Z')); // 4:00 -> 8:00
  });

  it('lands exactly on 08:00 from 21:00 and from a time off the 15-minute grid', () => {
    expect(nextSmsWindow(iso('2026-09-02T02:00:00Z'), CHI)).toBe(iso('2026-09-02T13:00:00Z'));
    expect(nextSmsWindow(iso('2026-09-02T02:00:01Z'), CHI)).toBe(iso('2026-09-02T13:00:00Z'));
  });

  it('is correct across the fall-back change (2026-11-01, Chicago)', () => {
    // 22:00 CDT on 10-31 -> 08:00 CST on 11-01
    const from = iso('2026-11-01T03:00:00Z');
    const next = nextSmsWindow(from, CHI);
    expect(next).toBe(iso('2026-11-01T14:00:00Z'));
    expect(localParts(next, CHI)).toMatchObject({ day: 1, hour: 8, minute: 0 });
    // 22:00 CST on 11-01 -> 08:00 CST on 11-02
    const next2 = nextSmsWindow(iso('2026-11-02T04:00:00Z'), CHI);
    expect(next2).toBe(iso('2026-11-02T14:00:00Z'));
    expect(localParts(next2, CHI)).toMatchObject({ day: 2, hour: 8, minute: 0 });
  });

  it('is correct across the spring-forward change (2026-03-08, Chicago)', () => {
    // 22:00 CST on 03-07 -> 08:00 CDT on 03-08
    const next = nextSmsWindow(iso('2026-03-08T04:00:00Z'), CHI);
    expect(next).toBe(iso('2026-03-08T13:00:00Z'));
    expect(localParts(next, CHI)).toMatchObject({ day: 8, hour: 8, minute: 0 });
    // 22:00 CDT on 03-08 -> 08:00 CDT on 03-09
    const next2 = nextSmsWindow(iso('2026-03-09T03:00:00Z'), CHI);
    expect(next2).toBe(iso('2026-03-09T13:00:00Z'));
    expect(localParts(next2, CHI)).toMatchObject({ day: 9, hour: 8, minute: 0 });
  });

  it('lands on 08:00 local in Asia/Kolkata (+5:30)', () => {
    const next = nextSmsWindow(iso('2026-09-01T16:30:00Z'), 'Asia/Kolkata'); // 22:00 IST
    expect(next).toBe(iso('2026-09-02T02:30:00Z'));
    expect(localParts(next, 'Asia/Kolkata')).toMatchObject({ day: 2, hour: 8, minute: 0 });
  });

  it('lands on 08:00 local in Asia/Kathmandu (+5:45)', () => {
    const next = nextSmsWindow(iso('2026-09-01T16:15:00Z'), 'Asia/Kathmandu'); // 22:00 NPT
    expect(next).toBe(iso('2026-09-02T02:15:00Z'));
    expect(localParts(next, 'Asia/Kathmandu')).toMatchObject({ day: 2, hour: 8, minute: 0 });
  });
});

describe('daysBetween / shiftDate', () => {
  it('crosses month ends', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1);
    expect(shiftDate('2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-04-30', '2026-05-31')).toBe(31);
  });

  it('handles the leap day 2028-02-29', () => {
    expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftDate('2028-02-28', 2)).toBe('2028-03-01');
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1);
  });

  it('crosses the year boundary', () => {
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2027-01-01', -1)).toBe('2026-12-31');
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365);
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366);
  });

  it('is signed and zero for the same date', () => {
    expect(daysBetween('2026-09-05', '2026-09-05')).toBe(0);
    expect(daysBetween('2026-09-05', '2026-09-01')).toBe(-4);
    expect(shiftDate('2026-09-05', 0)).toBe('2026-09-05');
  });

  it('is not thrown off by US DST changes', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
  });
});

describe('daysOverdue', () => {
  it('counts local calendar days past the due date', () => {
    expect(daysOverdue('2026-08-30', iso('2026-09-01T15:00:00Z'), CHI)).toBe(2);
  });

  it('uses the local date: 03:00Z on 09-01 is still 08-31 in Chicago', () => {
    expect(daysOverdue('2026-08-30', iso('2026-09-01T03:00:00Z'), CHI)).toBe(1);
    expect(daysOverdue('2026-08-30', iso('2026-09-01T03:00:00Z'), 'UTC')).toBe(2);
  });

  it('is 0 on the due date and never negative before it', () => {
    expect(daysOverdue('2026-09-01', iso('2026-09-01T15:00:00Z'), CHI)).toBe(0);
    expect(daysOverdue('2026-09-10', iso('2026-09-01T15:00:00Z'), CHI)).toBe(0);
    expect(daysOverdue('2027-01-01', iso('2026-01-01T00:00:00Z'), CHI)).toBe(0);
  });

  it('works across a year boundary', () => {
    expect(daysOverdue('2026-12-30', iso('2027-01-02T18:00:00Z'), CHI)).toBe(3);
  });
});

describe('monthKey', () => {
  it('puts 2026-10-01T02:00Z in 2026-09 for America/Los_Angeles', () => {
    expect(monthKey(iso('2026-10-01T02:00:00Z'), 'America/Los_Angeles')).toBe('2026-09');
    expect(monthKey(iso('2026-10-01T02:00:00Z'), 'UTC')).toBe('2026-10');
  });

  it('rolls back across a year boundary and zero-pads months', () => {
    expect(monthKey(iso('2027-01-01T03:00:00Z'), CHI)).toBe('2026-12');
    expect(monthKey(iso('2026-03-15T12:00:00Z'), CHI)).toBe('2026-03');
  });

  it('rolls forward for timezones ahead of UTC', () => {
    expect(monthKey(iso('2026-09-30T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-10');
  });
});
