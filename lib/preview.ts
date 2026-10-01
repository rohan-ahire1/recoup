import { renderTemplate, templateVars } from './templates';

/** Sample values so template previews read like a real message. */
export const PREVIEW_VARS = {
  ...templateVars({
    customer: { name: 'Harbor Street Bakery', contactName: 'Dana Ruiz', payToken: 'example' },
    invoices: [
      { number: '2231', owedCents: 78000, dueDate: '2026-09-17' },
      { number: '2248', owedCents: 46000, dueDate: '2026-09-23' },
    ],
    businessName: 'Your business',
    senderName: 'You',
    timeZone: 'America/Chicago',
    now: Date.parse('2026-09-26T15:00:00Z'),
  }),
  pay_link: 'pay.example.com/h7Kx2',
  plan_link: 'pay.example.com/h7Kx2?plan=1',
  installment_amount: '$413.33',
  installment_due_date: 'Friday, October 10',
};

export function preview(text: string, businessName?: string, senderName?: string) {
  return renderTemplate(text, {
    ...PREVIEW_VARS,
    ...(businessName ? { business_name: businessName } : {}),
    ...(senderName ? { sender_name: senderName, signoff: `${senderName}, ${businessName ?? 'Your business'}` } : {}),
  });
}
