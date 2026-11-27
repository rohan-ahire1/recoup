import { describe, expect, it } from 'vitest';
import { gmailLink, mailtoLink, outlookLink, smsLink } from '../lib/compose';
import { normalizePhone, parseAmount, parseDate, parseDue, parseInvoiceCsv } from '../lib/csv';
import { summarize, trackRecord } from '../lib/history';
import { renderTemplate, templateVars } from '../lib/templates';
import { BUILTIN_TONES } from '../lib/tones';

const NOW = Date.parse('2026-09-26T15:00:00Z');
const opts = { now: NOW, timeZone: 'America/Chicago' };

describe('CSV import', () => {
  it('reads the minimal overdue-only format', () => {
    const { rows, missingColumns, hasHistory } = parseInvoiceCsv('Customer\tPhone\tInvoice\tAmount\tDue\nJohn\t(312) 555-0142\t#1842\t$475\t32d', opts);
    expect(missingColumns).toEqual([]);
    expect(hasHistory).toBe(false);
    expect(rows[0].invoice).toMatchObject({ customerName: 'John', phone: '+13125550142', invoiceNumber: '1842', amountCents: 47500, dueDate: '2026-08-25', paid: false });
  });

  it('reads full history with paid dates, types, contacts and tags', () => {
    const text = [
      'Customer,Type,Contact,Email,Tags,Invoice,Description,Amount,Due,Paid',
      'Harbor Street Bakery,,Dana Ruiz,dana@x.co,Café; VIP,#1,Repair,$460,2026-05-01,2026-05-05',
      'Mika Tanaka,individual,,mika@x.co,,#2,Service,240,2026-09-01,',
      'Old Client,business,,old@x.co,,#3,Service,100,2026-01-01,yes',
    ].join('\n');
    const { rows, hasHistory } = parseInvoiceCsv(text, opts);
    expect(hasHistory).toBe(true);
    expect(rows[0].invoice).toMatchObject({ customerType: 'business', contactName: 'Dana Ruiz', tags: ['Café', 'VIP'], paid: true, paidDate: '2026-05-05' });
    expect(rows[1].invoice).toMatchObject({ customerType: 'individual', paid: false });
    expect(rows[2].invoice).toMatchObject({ paid: true, paidDate: null });
    expect(rows[2].warnings[0]).toMatch(/no date/);
  });

  it('lets paid history rows through without contact details, but not open ones', () => {
    const { rows } = parseInvoiceCsv('Customer,Email,Invoice,Amount,Due,Paid\nA,,#1,10,2026-01-01,2026-01-02\nB,,#2,10,2026-01-01,', opts);
    expect(rows[0].invoice).not.toBeNull();
    expect(rows[1].errors).toEqual(['Needs a valid phone number or email']);
  });

  it('normalizes fields', () => {
    expect(normalizePhone('1-312-555-0142')).toBe('+13125550142');
    expect(normalizePhone('xxx')).toBeNull();
    expect(parseAmount('$1,250.5')).toBe(125050);
    expect(parseAmount('0')).toBeNull();
    expect(parseDue('8/1/26', '2026-09-26')).toBe('2026-08-01');
    expect(parseDue('2/30/2026', '2026-09-26')).toBeNull();
  });

  it('reads Excel and accounting-export date formats', () => {
    for (const s of [
      '2026-08-25 00:00:00', '2026-08-25T00:00:00Z', '8/25/2026 0:00', '8/25/2026 12:00 AM', '8/25/2026 12:00 am',
      'Aug 25, 2026', 'August 25 2026', 'aug 25, 2026', 'AUGUST 25, 2026', '25 Aug 2026', '25-Aug-2026', '25-Aug-26', '25 august 2026',
    ]) expect(parseDate(s), s).toBe('2026-08-25');
    expect(parseDue('Aug 25, 2026', '2026-09-26')).toBe('2026-08-25');
    expect(parseDue('32d', '2026-09-26')).toBe('2026-08-25');
    expect(parseDate('2026-02-30 00:00')).toBeNull();
    expect(parseDate('Feb 30, 2026')).toBeNull();
    expect(parseDate('25/08/2026')).toBeNull();
  });

  it('reads USD-labelled amounts and rejects other currencies', () => {
    expect(parseAmount('$1,200.00 USD')).toBe(120000);
    expect(parseAmount('1200 USD')).toBe(120000);
    expect(parseAmount(' usd 1,200 ')).toBe(120000);
    expect(parseAmount('€50')).toBeNull();
    expect(parseAmount('50 EUR')).toBeNull();
    expect(parseAmount('-20')).toBeNull();
    expect(parseAmount('10.999')).toBeNull();
  });

  it('imports a whole CSV that uses month-name dates', () => {
    const text = [
      'Customer,Email,Invoice,Amount,Due,Paid',
      'A,a@x.co,#1,"$1,200.00 USD","Aug 25, 2026",',
      'B,b@x.co,#2,300 USD,25-Aug-2026,"Sep 1, 2026"',
    ].join('\n');
    const { rows } = parseInvoiceCsv(text, opts);
    expect(rows.map((r) => r.errors)).toEqual([[], []]);
    expect(rows[0].invoice).toMatchObject({ amountCents: 120000, dueDate: '2026-08-25' });
    expect(rows[1].invoice).toMatchObject({ amountCents: 30000, dueDate: '2026-08-25', paidDate: '2026-09-01' });
  });
});

describe('track record', () => {
  const paid = (due: string, paidDate: string) => ({ dueDate: due, paidDate, status: 'paid' });

  it('labels customers from their history', () => {
    const reliable = trackRecord(Array.from({ length: 8 }, () => paid('2026-01-01', '2026-01-02')));
    expect(reliable.reliability).toBe('reliable');
    expect(summarize(reliable, 'Priya')).toMatch(/almost always pays on time/);

    const sometimes = trackRecord([paid('2026-01-01', '2026-01-01'), paid('2026-02-01', '2026-02-10'), paid('2026-03-01', '2026-03-01')]);
    expect(sometimes).toMatchObject({ reliability: 'sometimes_late', lateCount: 1, avgDaysLate: 9 });

    const often = trackRecord([paid('2026-01-01', '2026-01-20'), paid('2026-02-01', '2026-02-15'), paid('2026-03-01', '2026-03-01')]);
    expect(often.reliability).toBe('often_late');

    expect(trackRecord([paid('2026-01-01', '2026-01-01')]).reliability).toBe('new');
  });

  it('ignores open invoices and paid ones without a date', () => {
    const r = trackRecord([{ dueDate: '2026-01-01', paidDate: null, status: 'paid' }, { dueDate: '2026-01-01', paidDate: null, status: 'open' }]);
    expect(r.paidCount).toBe(0);
  });
});

describe('templates and send links', () => {
  const vars = templateVars({
    customer: { name: 'Harbor Street Bakery', contactName: 'Dana Ruiz', payToken: 'tok' },
    invoices: [
      { number: '2248', owedCents: 46000, dueDate: '2026-09-23' },
      { number: '2231', owedCents: 78000, dueDate: '2026-09-17' },
    ],
    businessName: 'Ferro Service Co.',
    senderName: 'Marco',
    timeZone: 'America/Chicago',
    now: NOW,
  });

  it('covers several invoices in one message, oldest first', () => {
    expect(vars.first_name).toBe('Dana');
    expect(vars.invoices).toBe('invoices #2231 and #2248');
    expect(vars.invoices_detail).toBe('invoices #2231 ($780.00) and #2248 ($460.00), $1,240.00 in total');
    expect(vars.oldest_days).toBe('9');
    expect(vars.signoff).toBe('Marco, Ferro Service Co.');
  });

  it('leaves no unfilled placeholders in any built-in tone', () => {
    const full = { ...vars, installment_amount: '$413.33', installment_due_date: 'Friday, October 10' };
    for (const tone of BUILTIN_TONES) {
      for (const [key, t] of Object.entries(tone.templates)) {
        for (const text of [t.subject, t.email, t.sms]) {
          expect(renderTemplate(text, full), `${tone.name} ${key}`).not.toMatch(/\{\w+\}/);
        }
        expect(t.sms, `${tone.name} ${key} sms`).toMatch(/Reply STOP to opt out\.$/);
      }
    }
  });

  it('builds prefilled compose links', () => {
    const d = { to: 'dana@x.co', subject: 'Invoice #2231', body: 'Hi Dana,\nPay here: https://x.co/pay?a=1&b=2' };
    expect(gmailLink(d)).toBe(
      'https://mail.google.com/mail/?view=cm&fs=1&to=dana%40x.co&su=Invoice%20%232231&body=Hi%20Dana%2C%0APay%20here%3A%20https%3A%2F%2Fx.co%2Fpay%3Fa%3D1%26b%3D2',
    );
    expect(outlookLink(d)).toContain('outlook.office.com/mail/deeplink/compose?to=dana%40x.co&subject=');
    expect(mailtoLink(d)).toMatch(/^mailto:dana@x\.co\?subject=Invoice%20%232231&body=/);
    expect(smsLink('+13125550142', 'Hi & bye')).toBe('sms:+13125550142?&body=Hi%20%26%20bye');
  });
});
