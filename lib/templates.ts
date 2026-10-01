import { formatLongDate, money } from './format';
import { daysOverdue } from './time';

export const TEMPLATE_VARIABLES = [
  'first_name',
  'customer_name',
  'business_name',
  'sender_name',
  'signoff',
  'invoices',
  'invoices_detail',
  'is_are',
  'total',
  'oldest_days',
  'pay_link',
  'plan_link',
  'installment_amount',
  'installment_due_date',
] as const;

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? vars[key] : match));
}

export function baseUrl(): string {
  return (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 4310}`).replace(/\/$/, '');
}

export function payLink(payToken: string): string {
  return `${baseUrl()}/pay/${payToken}`;
}

/** "A, B and C" */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export interface VarsInput {
  customer: { name: string; contactName: string | null; payToken: string };
  invoices: { number: string; owedCents: number; dueDate: string }[];
  businessName: string;
  senderName: string;
  timeZone: string;
  now: number;
  installment?: { amountCents: number; dueAt: number };
}

export function firstName(customer: { name: string; contactName: string | null }): string {
  return (customer.contactName || customer.name).trim().split(/\s+/)[0] || 'there';
}

export function templateVars(input: VarsInput): Record<string, string> {
  const { customer, invoices, businessName, senderName, timeZone, now, installment } = input;
  const sorted = [...invoices].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const numbers = sorted.map((i) => `#${i.number}`);
  const total = sorted.reduce((s, i) => s + i.owedCents, 0);
  const link = payLink(customer.payToken);
  const single = sorted.length === 1;

  return {
    first_name: firstName(customer),
    customer_name: customer.name,
    business_name: businessName,
    sender_name: senderName,
    signoff: senderName && senderName !== businessName ? `${senderName}, ${businessName}` : businessName,
    invoices: `${single ? 'invoice' : 'invoices'} ${joinList(numbers)}`,
    invoices_detail: single
      ? `invoice ${numbers[0]} for ${money(total)}`
      : `invoices ${joinList(sorted.map((i) => `#${i.number} (${money(i.owedCents)})`))}, ${money(total)} in total`,
    is_are: single ? 'is' : 'are',
    total: money(total),
    oldest_days: String(sorted.length ? daysOverdue(sorted[0].dueDate, now, timeZone) : 0),
    pay_link: link,
    plan_link: `${link}?plan=1`,
    installment_amount: installment ? money(installment.amountCents) : '',
    installment_due_date: installment ? formatLongDate(installment.dueAt, timeZone) : '',
  };
}
