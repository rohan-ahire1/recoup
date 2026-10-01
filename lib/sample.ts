/**
 * Demo data: a small equipment-service business and its customers. The seed doesn't
 * write rows directly; it replays ~5 months day by day through the real engine, so
 * every reminder, reply, promise and payment in the demo actually happened in the app.
 */
import Papa from 'papaparse';
import { all, run, tx } from './db';
import { findCustomer, getOpenCase, listInstallments } from './repo';
import { choosePlan, importCsv, logReply, markAllSent, recordPayment, runDueActions, setDoNotChase } from './service';
import { saveSettings, setClockOffset } from './settings';
import { DAY, HOUR, localDate, localParts, shiftDate } from './time';
import type { ReplyKind } from './types';

const TZ = 'America/Chicago';

interface Spec {
  name: string;
  type: 'business' | 'individual';
  contact?: string;
  email?: string;
  phone?: string;
  tags: string[];
  /** Days late for each past (pre-Recoup) invoice, oldest first. */
  history: number[];
  every?: number;
  amount: number;
  /** Invoices that went overdue during the replay and were chased (dueAgo = days before today). */
  chased?: { desc: string; amount: number; dueAgo: number }[];
  /** Open today. Negative dueAgo = not due yet. */
  current: { desc: string; amount: number; dueAgo: number }[];
  doNotChase?: boolean;
  notes?: string;
}

const SPECS: Spec[] = [
  {
    name: 'Harbor Street Bakery', type: 'business', contact: 'Dana Ruiz', email: 'dana@harborstreetbakery.example', phone: '(312) 555-0164',
    tags: ['Café', 'Service plan'], history: [0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 1], every: 30, amount: 460,
    chased: [{ desc: 'Quarterly descaling', amount: 460, dueAgo: 118 }],
    current: [
      { desc: 'Espresso machine repair', amount: 780, dueAgo: 9 },
      { desc: 'Quarterly descaling', amount: 460, dueAgo: 3 },
    ],
  },
  {
    name: 'Lantern Coffee Roasters', type: 'business', contact: 'Priya Nair', email: 'priya@lanterncoffee.example', phone: '(773) 555-0188',
    tags: ['Roaster', 'Wholesale'], history: [0, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0], every: 28, amount: 980,
    current: [{ desc: 'Grinder burr set and install', amount: 1450, dueAgo: 8 }],
  },
  {
    name: 'Oak & Anvil Kitchen', type: 'business', contact: 'Tom Becker', email: 'tom@oakandanvil.example', phone: '(312) 555-0131',
    tags: ['Restaurant'], history: [9, 0, 14, 21, 0, 6, 30, 0], every: 45, amount: 520,
    chased: [{ desc: 'Steam wand rebuild', amount: 640, dueAgo: 140 }],
    current: [
      { desc: 'Two-group machine overhaul', amount: 920, dueAgo: 45 },
      { desc: 'Water filter replacement', amount: 310, dueAgo: 18 },
    ],
  },
  {
    name: 'Mika Tanaka', type: 'individual', phone: '(872) 555-0123', tags: ['Home'], history: [], amount: 0,
    current: [{ desc: 'Home machine descale and gaskets', amount: 240, dueAgo: 12 }],
  },
  {
    name: 'Blue Door Café', type: 'business', contact: 'Sam Lee', email: 'sam@bluedoorcafe.example', phone: '(312) 555-0172',
    tags: ['Café'], history: [0, 0, 0, 1, 0, 0, 0, 0], every: 40, amount: 385,
    chased: [{ desc: 'Monthly service', amount: 385, dueAgo: 60 }],
    current: [{ desc: 'Monthly service', amount: 385, dueAgo: 6 }],
  },
  {
    name: 'Greenline Offices', type: 'business', contact: 'Angela Brooks', email: 'angela.brooks@greenline.example', phone: '(773) 555-0101',
    tags: ['Office'], history: [0, 5, 0, 0, 8, 0, 0, 3, 0, 0], every: 90, amount: 610,
    current: [{ desc: 'Office machine service, Q2', amount: 610, dueAgo: 61 }],
  },
  {
    name: 'Jordan Ellis', type: 'individual', email: 'jordan.ellis@example.com', phone: '(312) 555-0147', tags: ['Home'],
    history: [12, 0, 20, 7], every: 70, amount: 180,
    current: [{ desc: 'Grinder repair', amount: 180, dueAgo: 40 }],
  },
  {
    name: 'Northside Gym', type: 'business', contact: 'Kim Nguyen', email: 'kim@northsidegym.example', phone: '(872) 555-0137',
    tags: ['Gym'], history: [0, 0, 0, 0, 3, 0], every: 60, amount: 350,
    current: [{ desc: 'Grinder replacement and 2 service visits', amount: 1125, dueAgo: 95 }],
  },
  {
    name: 'Hotel Marlowe', type: 'business', contact: 'Chris Park', email: 'chris.park@hotelmarlowe.example', phone: '(312) 555-0190',
    tags: ['Hotel', 'Service plan'], history: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0], every: 21, amount: 1200,
    chased: [{ desc: 'Banquet brewer install', amount: 1980, dueAgo: 100 }],
    current: [],
  },
  {
    name: 'Elena Petrova', type: 'individual', email: 'elena.petrova@example.com', phone: '(773) 555-0155', tags: ['Home'],
    history: [0, 6, 0, 0, 4], every: 60, amount: 220,
    current: [{ desc: 'Espresso machine tune-up', amount: 295, dueAgo: 2 }],
  },
  {
    name: 'Summit Dental', type: 'business', contact: 'Raj Patel', email: 'office@summitdental.example', phone: '(312) 555-0119',
    tags: ['Office'], history: [0, 0, 0, 0, 0, 2, 0], every: 60, amount: 410,
    current: [{ desc: 'Break room machine and plumbing', amount: 1380, dueAgo: 50 }],
  },
  {
    name: 'Corner Books & Coffee', type: 'business', contact: 'Lucy Ward', email: 'lucy@cornerbooks.example', tags: ['Café'],
    history: [0, 0], every: 45, amount: 260,
    current: [{ desc: 'Machine install and training', amount: 295, dueAgo: -6 }],
  },
  {
    name: 'Ben Okafor', type: 'individual', email: 'ben.okafor@example.com', phone: '(312) 555-0126', tags: ['Home'],
    history: [0], amount: 120, current: [{ desc: 'Home grinder repair', amount: 150, dueAgo: 20 }],
    doNotChase: true, notes: 'Family friend. I’ll call him myself.',
  },
  {
    name: 'Riverside Yoga Studio', type: 'business', contact: 'Maya Cole', email: 'maya@riversideyoga.example', tags: ['Studio'],
    history: [], amount: 0, current: [{ desc: 'Cold brew tower install', amount: 520, dueAgo: 1 }],
  },
];

type Scenario = { daysAgo: number; customer: string; act: (customerId: number, t: number) => Promise<void> | void };

const reply = (kind: ReplyKind, body: string, promiseDaysAhead?: number): Scenario['act'] => async (customerId, t) => {
  await logReply(
    {
      customerId,
      channel: 'email',
      body,
      kind,
      promiseDate: promiseDaysAhead !== undefined ? localDate(t + promiseDaysAhead * DAY, TZ) : null,
    },
    t,
  );
};
/** The customer pays what's being chased (not invoices that aren't due yet). */
const pay = (): Scenario['act'] => (customerId, t) => {
  const c = getOpenCase(customerId)!;
  const owed = all<{ s: number }>(
    "SELECT SUM(amount_cents - amount_paid_cents) AS s FROM invoices WHERE case_id = ? AND status IN ('open', 'disputed')",
    c.id,
  )[0].s;
  recordPayment({ customerId, amountCents: owed, source: 'online', method: 'card', now: t });
};

const SCENARIOS: Scenario[] = [
  // Months ago: the chased invoices that were recovered.
  { daysAgo: 131, customer: 'Oak & Anvil Kitchen', act: pay() },
  { daysAgo: 113, customer: 'Harbor Street Bakery', act: reply('promise', 'So sorry, slow month. Paying Friday!', 4) },
  { daysAgo: 109, customer: 'Harbor Street Bakery', act: pay() },
  { daysAgo: 97, customer: 'Hotel Marlowe', act: pay() },
  { daysAgo: 57, customer: 'Blue Door Café', act: pay() },
  // Recently.
  { daysAgo: 20, customer: 'Summit Dental', act: (id, t) => { choosePlan(id, 3, t); const first = listInstallments(getOpenCase(id)!.id)[0]; recordPayment({ customerId: id, amountCents: first.amountCents, installmentId: first.id, source: 'online', method: 'card', now: t }); } },
  { daysAgo: 6, customer: 'Summit Dental', act: (id, t) => { const next = listInstallments(getOpenCase(id)!.id).find((i) => !i.paidAt)!; recordPayment({ customerId: id, amountCents: next.amountCents, installmentId: next.id, source: 'online', method: 'card', now: t }); } },
  { daysAgo: 5, customer: 'Lantern Coffee Roasters', act: pay() },
  { daysAgo: 5, customer: 'Northside Gym', act: reply('dispute', 'The second visit didn’t fix the grinder. We’re not paying for that visit until it actually works.') },
  { daysAgo: 4, customer: 'Blue Door Café', act: pay() },
  { daysAgo: 3, customer: 'Jordan Ellis', act: reply('promise', 'Sorry about this! I’ll pay it by Friday.', 5) },
  { daysAgo: 2, customer: 'Greenline Offices', act: reply('paid', 'We paid this on the 2nd by check. Can you check on your end?') },
  { daysAgo: 1, customer: 'Oak & Anvil Kitchen', act: reply('plan', 'Cash flow is rough this month. Any chance I can pay this off in parts?') },
];

const REPLAY_DAYS = 150;

/** 10am today in the demo's time zone: the demo's "now". */
function demoNow(): number {
  const now = Date.now();
  let t = Date.parse(`${localDate(now, TZ)}T15:00:00Z`);
  t -= (localParts(t, TZ).hour - 10) * HOUR;
  return t;
}

interface Row {
  Customer: string; Type: string; Contact: string; Email: string; Phone: string; Tags: string;
  Invoice: string; Description: string; Amount: string; Issued: string; Due: string; Paid: string;
}

const HISTORY_DESCS = ['Monthly service', 'Quarterly descaling', 'Repair visit', 'Parts and labor', 'Water filter replacement', 'Preventive maintenance'];

function buildRows(specs: Spec[], end: string, firstNumber: number, replayStart: string): Row[] {
  const rows: Omit<Row, 'Invoice'>[] = [];
  const base = (s: Spec) => ({
    Customer: s.name, Type: s.type, Contact: s.contact ?? '', Email: s.email ?? '', Phone: s.phone ?? '', Tags: s.tags.join('; '),
  });
  for (const s of specs) {
    s.history.forEach((late, i) => {
      const due = shiftDate(replayStart, -10 - (s.history.length - 1 - i) * (s.every ?? 30));
      const cents = s.amount + ((i * 37) % 5) * 15;
      rows.push({ ...base(s), Description: HISTORY_DESCS[(i + s.name.length) % HISTORY_DESCS.length], Amount: cents.toFixed(2), Issued: shiftDate(due, -30), Due: due, Paid: shiftDate(due, late) });
    });
    for (const inv of [...(s.chased ?? []), ...s.current]) {
      const due = shiftDate(end, -inv.dueAgo);
      rows.push({ ...base(s), Description: inv.desc, Amount: inv.amount.toFixed(2), Issued: shiftDate(due, -30), Due: due, Paid: '' });
    }
  }
  rows.sort((a, b) => a.Issued.localeCompare(b.Issued) || a.Customer.localeCompare(b.Customer));
  return rows.map((r, i) => ({ ...r, Invoice: `#${firstNumber + i}` }));
}

function toCsv(rows: Row[]): string {
  return Papa.unparse(rows, {
    columns: ['Customer', 'Type', 'Contact', 'Email', 'Phone', 'Tags', 'Invoice', 'Description', 'Amount', 'Issued', 'Due', 'Paid'],
  });
}

/** A smaller file for trying the importer: three new customers, with history. */
export function sampleUploadCsv(): string {
  const end = localDate(Date.now(), TZ);
  const specs: Spec[] = [
    { name: 'Maple Street Diner', type: 'business', contact: 'Rosa Diaz', email: 'rosa@maplediner.example', phone: '(312) 555-0102', tags: ['Restaurant'], history: [0, 3, 0, 9, 0, 0], every: 30, amount: 340, current: [{ desc: 'Espresso machine repair', amount: 465, dueAgo: 14 }] },
    { name: 'Theo Grant', type: 'individual', email: 'theo.grant@example.com', phone: '(773) 555-0104', tags: ['Home'], history: [15, 0, 22], every: 60, amount: 150, current: [{ desc: 'Home machine service', amount: 190, dueAgo: 31 }] },
    { name: 'Bright Smile Orthodontics', type: 'business', contact: 'Helen Wu', email: 'frontdesk@brightsmile.example', tags: ['Office'], history: [0, 0, 0, 0], every: 90, amount: 380, current: [{ desc: 'Break room machine install', amount: 820, dueAgo: 5 }, { desc: 'Filter subscription', amount: 90, dueAgo: -10 }] },
  ];
  return toCsv(buildRows(specs, end, 3001, shiftDate(end, -30)));
}

/** Wipe everything and replay the demo business from scratch. */
export async function seedDemo() {
  tx(() => {
    for (const table of ['payments', 'installments', 'events', 'messages', 'invoices', 'cases', 'customers']) run(`DELETE FROM ${table}`);
    run("DELETE FROM template_sets WHERE builtin = 0");
    run("DELETE FROM settings WHERE key IN ('clockOffsetMs', 'savedViews')");
  });
  saveSettings({ businessName: 'Ferro Service Co.', senderName: 'Marco', timezone: TZ, deliveryMode: 'prepare', defaultTemplateSet: 'auto' });

  const end = demoNow();
  const start = end - REPLAY_DAYS * DAY;
  // Replay in the past: the clock offset makes getNow() agree with the replay.
  setClockOffset(start - Date.now());
  const csv = toCsv(buildRows(SPECS, localDate(end, TZ), 2001, localDate(start, TZ)));
  await importCsv(csv, start);
  for (const s of SPECS) {
    const c = findCustomer({ name: s.name })!;
    if (s.notes) run('UPDATE customers SET notes = ? WHERE id = ?', s.notes, c.id);
    if (s.type === 'individual' && !s.email) run("UPDATE customers SET preferred_channel = 'sms' WHERE id = ?", c.id);
    if (s.doNotChase) await setDoNotChase(c.id, true, start);
  }

  for (let d = REPLAY_DAYS; d >= 0; d--) {
    const t = end - d * DAY;
    setClockOffset(t - Date.now());
    await runDueActions(t);
    for (const sc of SCENARIOS.filter((x) => x.daysAgo === d)) {
      await sc.act(findCustomer({ name: sc.customer })!.id, t + 3 * HOUR);
    }
    await runDueActions(t + 4 * HOUR);
    // The owner kept up with "To send" until the last couple of days.
    if (d >= 2) markAllSent(t + 5 * HOUR);
  }
  setClockOffset(end - Date.now());
  return { customers: SPECS.length };
}
