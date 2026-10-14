import type { TemplateKey } from './sequence';

export interface MessageTemplate {
  subject: string;
  email: string;
  sms: string;
}

export type TemplateSetContent = Record<TemplateKey, MessageTemplate>;

export interface BuiltinTone {
  tone: 'friendly' | 'professional' | 'concise' | 'firm';
  name: string;
  description: string;
  templates: TemplateSetContent;
}

const STOP = 'Reply STOP to opt out.';

export const BUILTIN_TONES: BuiltinTone[] = [
  {
    tone: 'friendly',
    name: 'Friendly',
    description: 'Warm, first-name, no pressure',
    templates: {
      '1': {
        subject: 'A quick reminder about {invoices}',
        email: `Hi {first_name},\n\nHope all's well! Just a friendly reminder about {invoices_detail}, which {is_are} now past due.\n\nIf it's already on its way, thank you, and please ignore this. If anything looks off, just reply and I'll sort it out.\n\nThanks so much,\n{signoff}`,
        sms: `Hi {first_name}, it's {sender_name} from {business_name}. Friendly reminder about {invoices} ({total}), now past due. Already sent it? Thank you! ${STOP}`,
      },
      '2': {
        subject: 'Following up on {invoices}',
        email: `Hi {first_name},\n\nJust following up on {invoices_detail}. Here's what's due and how to pay:\n{pay_link}\n\nIf something's holding it up, reply to this email and we'll figure it out together.\n\nThanks,\n{signoff}`,
        sms: `Hi {first_name}, {sender_name} at {business_name} following up on {invoices} ({total}). See how to pay: {pay_link} ${STOP}`,
      },
      '3': {
        subject: 'How to pay {invoices}',
        email: `Hi {first_name},\n\nA quick nudge on {invoices_detail}. Everything you need to pay is here:\n{pay_link}\n\nThanks as always,\n{signoff}`,
        sms: `Hi {first_name}, a quick nudge on {invoices} ({total}) from {business_name}. How to pay: {pay_link} ${STOP}`,
      },
      '4': {
        subject: 'An easier way to pay {invoices}',
        email: `Hi {first_name},\n\nWe know money can get tight. If paying {total} at once is hard right now, you can split it into 2 or 3 payments, two weeks apart, with no fees:\n{plan_link}\n\nOr just reply and we'll work something out.\n\nThanks,\n{signoff}`,
        sms: `Hi {first_name}, we know things get tight. You can split {invoices} ({total}) into 2 or 3 payments here: {plan_link} Or just reply to talk. ${STOP}`,
      },
      installment: {
        subject: 'Your next payment for {invoices}',
        email: `Hi {first_name},\n\nA reminder that your next payment of {installment_amount} is due {installment_due_date}. You can pay here:\n{pay_link}\n\nThanks for keeping on track!\n{signoff}`,
        sms: `Hi {first_name}, reminder from {business_name}: your next payment of {installment_amount} is due {installment_due_date}. How to pay: {pay_link} ${STOP}`,
      },
    },
  },
  {
    tone: 'professional',
    name: 'Professional',
    description: 'Polite and businesslike',
    templates: {
      '1': {
        subject: 'Payment reminder: {invoices}',
        email: `Dear {first_name},\n\nThis is a reminder that {invoices_detail} {is_are} now past due.\n\nIf payment has already been sent, please disregard this message. If you have any questions about the invoice, reply to this email and we will be glad to help.\n\nKind regards,\n{signoff}`,
        sms: `Hello {first_name}, this is {business_name}. A reminder that {invoices} ({total}) {is_are} past due. Questions? Reply to this message. ${STOP}`,
      },
      '2': {
        subject: 'Second reminder: {invoices}',
        email: `Dear {first_name},\n\nWe have not yet received payment for {invoices_detail}. For your convenience, the balance and payment details are here:\n{pay_link}\n\nPlease let us know if there is anything we can clarify.\n\nKind regards,\n{signoff}`,
        sms: `Hello {first_name}, {business_name} here. Payment for {invoices} ({total}) is still outstanding. Payment details: {pay_link} ${STOP}`,
      },
      '3': {
        subject: 'Action needed: {invoices}',
        email: `Dear {first_name},\n\nOur records show {invoices_detail} {is_are} now {oldest_days} days past due. Please arrange payment at your earliest convenience:\n{pay_link}\n\nIf you have already paid, thank you. Please reply with the payment date so we can update our records.\n\nKind regards,\n{signoff}`,
        sms: `Hello {first_name}, {invoices} ({total}) from {business_name} {is_are} now {oldest_days} days past due. Please pay here: {pay_link} ${STOP}`,
      },
      '4': {
        subject: 'Payment arrangement available for {invoices}',
        email: `Dear {first_name},\n\nIf settling {total} in a single payment is difficult, we are happy to offer a plan of 2 or 3 installments, two weeks apart, at no additional cost:\n{plan_link}\n\nAlternatively, reply to this email to discuss other arrangements.\n\nKind regards,\n{signoff}`,
        sms: `Hello {first_name}, {business_name} can offer a 2 or 3 part payment plan for {invoices} ({total}), at no added cost: {plan_link} ${STOP}`,
      },
      installment: {
        subject: 'Upcoming installment: {installment_amount} due {installment_due_date}',
        email: `Dear {first_name},\n\nThis is a reminder that your next installment of {installment_amount} is due on {installment_due_date}. You can pay securely here:\n{pay_link}\n\nKind regards,\n{signoff}`,
        sms: `Hello {first_name}, your installment of {installment_amount} to {business_name} is due {installment_due_date}. Pay here: {pay_link} ${STOP}`,
      },
    },
  },
  {
    tone: 'concise',
    name: 'Concise',
    description: 'Two lines and the link',
    templates: {
      '1': {
        subject: 'Past due: {invoices}',
        email: `Hi {first_name},\n\nQuick reminder: {invoices_detail}, now past due. Questions? Just reply.\n\n{signoff}`,
        sms: `{business_name}: {invoices} ({total}) past due. Questions? Reply here. ${STOP}`,
      },
      '2': {
        subject: 'How to pay {invoices}',
        email: `Hi {first_name},\n\nHere's how to pay {invoices} ({total}): {pay_link}\n\n{signoff}`,
        sms: `{business_name}: how to pay {invoices} ({total}): {pay_link} ${STOP}`,
      },
      '3': {
        subject: 'Reminder: {total} still open',
        email: `Hi {first_name},\n\n{total} is still open on {invoices}. Pay here: {pay_link}\n\n{signoff}`,
        sms: `{business_name}: {total} still open on {invoices}. How to pay: {pay_link} ${STOP}`,
      },
      '4': {
        subject: 'Split {total} into payments',
        email: `Hi {first_name},\n\nPrefer to pay in parts? Split {total} into 2 or 3 payments: {plan_link}\n\n{signoff}`,
        sms: `{business_name}: split {total} into 2 or 3 payments: {plan_link} ${STOP}`,
      },
      installment: {
        subject: '{installment_amount} due {installment_due_date}',
        email: `Hi {first_name},\n\nNext payment: {installment_amount}, due {installment_due_date}. Pay here: {pay_link}\n\n{signoff}`,
        sms: `{business_name}: next payment {installment_amount} due {installment_due_date}. {pay_link} ${STOP}`,
      },
    },
  },
  {
    tone: 'firm',
    name: 'Firm',
    description: 'Clear deadlines, still respectful',
    templates: {
      '1': {
        subject: 'Overdue: {invoices}',
        email: `Hi {first_name},\n\nOur records show {invoices_detail} {is_are} overdue. Please arrange payment this week.\n\nIf you've already paid, reply with the payment date and we'll update our records.\n\nThank you,\n{signoff}`,
        sms: `Hi {first_name}, {invoices} ({total}) from {business_name} {is_are} overdue. Please arrange payment this week. ${STOP}`,
      },
      '2': {
        subject: 'Second notice: {invoices}',
        email: `Hi {first_name},\n\nThis is our second notice for {invoices_detail}. Please pay by the end of this week:\n{pay_link}\n\nIf there's a problem with the invoice, reply now so we can resolve it.\n\nThank you,\n{signoff}`,
        sms: `Hi {first_name}, second notice from {business_name}: {invoices} ({total}). Please pay by the end of this week: {pay_link} ${STOP}`,
      },
      '3': {
        subject: '{oldest_days} days overdue: {invoices}',
        email: `Hi {first_name},\n\nWe're now {oldest_days} days past due on {invoices_detail}. Please pay, or reply to let us know your plan, within 5 days:\n{pay_link}\n\nThank you,\n{signoff}`,
        sms: `Hi {first_name}, {invoices} ({total}) {is_are} now {oldest_days} days overdue. Please pay or reply within 5 days: {pay_link} ${STOP}`,
      },
      '4': {
        subject: 'Final reminder and payment options: {invoices}',
        email: `Hi {first_name},\n\nThis is our final automated reminder for {invoices_detail}. If paying {total} at once isn't possible, you can set up 2 or 3 payments, two weeks apart:\n{plan_link}\n\nIf we don't hear from you, {sender_name} will follow up personally.\n\nThank you,\n{signoff}`,
        sms: `Hi {first_name}, final reminder from {business_name} for {invoices} ({total}). Pay in full or set up 2 to 3 payments: {plan_link} ${STOP}`,
      },
      installment: {
        subject: 'Installment due {installment_due_date}',
        email: `Hi {first_name},\n\nYour installment of {installment_amount} is due {installment_due_date}. Please pay on time to keep your plan in place:\n{pay_link}\n\nThank you,\n{signoff}`,
        sms: `Hi {first_name}, your installment of {installment_amount} to {business_name} is due {installment_due_date}: {pay_link} ${STOP}`,
      },
    },
  },
];
