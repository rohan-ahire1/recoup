import { daysBetween } from './time';

export type Reliability = 'new' | 'reliable' | 'sometimes_late' | 'often_late';

export const RELIABILITY_LABELS: Record<Reliability, string> = {
  new: 'New',
  reliable: 'Reliable',
  sometimes_late: 'Sometimes late',
  often_late: 'Often late',
};

export interface PastInvoice {
  dueDate: string;
  paidDate: string | null;
  status: string;
}

export interface TrackRecord {
  paidCount: number;
  onTimeCount: number;
  lateCount: number;
  /** Mean days late across the invoices that were late. */
  avgDaysLate: number;
  maxDaysLate: number;
  reliability: Reliability;
  /** Per paid invoice in date order: days late (0 = on time). */
  lateness: number[];
}

/** A payment within this many days of the due date still counts as on time. */
export const GRACE_DAYS = 2;

export function trackRecord(invoices: PastInvoice[]): TrackRecord {
  const paid = invoices
    .filter((i) => i.status === 'paid' && i.paidDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const lateness = paid.map((i) => Math.max(0, daysBetween(i.dueDate, i.paidDate!)));
  const late = lateness.filter((d) => d > GRACE_DAYS);
  const onTimeCount = paid.length - late.length;
  const avgDaysLate = late.length ? Math.round(late.reduce((a, b) => a + b, 0) / late.length) : 0;

  let reliability: Reliability;
  if (paid.length < 3) reliability = 'new';
  else if (onTimeCount / paid.length >= 0.85) reliability = 'reliable';
  else if (onTimeCount / paid.length >= 0.55) reliability = 'sometimes_late';
  else reliability = 'often_late';

  return {
    paidCount: paid.length,
    onTimeCount,
    lateCount: late.length,
    avgDaysLate,
    maxDaysLate: late.length ? Math.max(...late) : 0,
    reliability,
    lateness,
  };
}

/** One plain-English line about how this customer pays. */
export function summarize(record: TrackRecord, firstName: string): string {
  const who = firstName || 'This customer';
  switch (record.reliability) {
    case 'new':
      return record.paidCount === 0
        ? `No payment history with ${who} yet.`
        : `Still getting to know ${who}. Only ${record.paidCount} paid invoice${record.paidCount === 1 ? '' : 's'} so far.`;
    case 'reliable':
      return `${who} almost always pays on time. This is out of character.`;
    case 'sometimes_late':
      return `${who} usually pays. Just a little late, now and then.`;
    case 'often_late':
      return `${who} often pays late, by about ${record.avgDaysLate} days. Worth staying on top of.`;
  }
}

/** The tone Recoup suggests when a customer is set to "Auto". */
export function suggestedTone(reliability: Reliability): 'friendly' | 'professional' | 'firm' {
  if (reliability === 'often_late') return 'firm';
  if (reliability === 'new') return 'professional';
  return 'friendly';
}
