export type Channel = 'email' | 'sms';
export type CustomerType = 'business' | 'individual';

export type InvoiceStatus = 'open' | 'paid' | 'disputed' | 'written_off';

export type CaseStatus =
  | 'active' // sequence running
  | 'needs_you' // customer replied or something needs a human; sequence paused
  | 'promised' // customer promised a date; sequence waits until it passes
  | 'disputed' // customer disputes; sequence stopped until resolved
  | 'paused' // paused by the owner
  | 'plan' // on a payment plan
  | 'unreachable' // no channel left
  | 'resolved'; // nothing left to collect

export const OPEN_CASE_STATUSES: CaseStatus[] = ['active', 'needs_you', 'promised', 'disputed', 'paused', 'plan', 'unreachable'];

export type MessageStatus = 'ready' | 'sent' | 'failed' | 'skipped' | 'received';

export type ReplyKind = 'promise' | 'paid' | 'dispute' | 'plan' | 'stop' | 'other';

export type Tone = 'friendly' | 'professional' | 'concise' | 'firm' | 'custom';

export interface Customer {
  id: number;
  name: string;
  type: CustomerType;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  preferredChannel: Channel;
  tags: string[];
  templateSetId: number | null;
  doNotChase: boolean;
  optedOutSms: boolean;
  notes: string | null;
  payToken: string;
  createdAt: number;
}

export interface Invoice {
  id: number;
  customerId: number;
  number: string;
  description: string | null;
  amountCents: number;
  amountPaidCents: number;
  issuedDate: string | null;
  dueDate: string;
  status: InvoiceStatus;
  paidDate: string | null;
  caseId: number | null;
  createdAt: number;
}

export interface Case {
  id: number;
  customerId: number;
  status: CaseStatus;
  startedAt: number;
  currentStep: number;
  lastSentAt: number | null;
  pausedAt: number | null;
  promiseDate: string | null;
  needsAttention: boolean;
  attentionReason: string | null;
  resolvedAt: number | null;
  createdAt: number;
}

export interface Installment {
  id: number;
  caseId: number;
  seq: number;
  amountCents: number;
  dueAt: number;
  paidAt: number | null;
}

export interface Message {
  id: number;
  customerId: number;
  caseId: number | null;
  /** 'phone' only for replies logged from a call. */
  channel: Channel | 'phone';
  direction: 'outbound' | 'inbound';
  actionKey: string | null;
  step: number | null;
  tone: string | null;
  toAddr: string | null;
  subject: string | null;
  body: string;
  status: MessageStatus;
  provider: string | null;
  error: string | null;
  replyKind: ReplyKind | null;
  createdAt: number;
  sentAt: number | null;
}

export interface Payment {
  id: number;
  customerId: number;
  caseId: number | null;
  amountCents: number;
  method: string | null;
  source: string;
  paidAt: number;
}

export interface CustomerEvent {
  id: number;
  customerId: number;
  caseId: number | null;
  type: string;
  detail: string | null;
  createdAt: number;
}
