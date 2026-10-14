'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { renameBusiness } from '@/lib/accounts';
import { requireBusiness } from '@/lib/auth';
import { normalizeEmail, normalizePhone, parseAmount } from '@/lib/csv';
import { isDemoMode } from '@/lib/providers';
import { getOpenCase, getTemplateSet } from '@/lib/repo';
import { TEMPLATE_KEYS } from '@/lib/sequence';
import * as svc from '@/lib/service';
import { getSettings, saveSettings, type DeliveryMode } from '@/lib/settings';
import { enterBusiness } from '@/lib/tenant';
import type { TemplateSetContent } from '@/lib/tones';
import type { Channel, ReplyKind } from '@/lib/types';

const refresh = () => revalidatePath('/', 'layout');
const num = (form: FormData, key: string) => Number(form.get(key));
const str = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

function requireDemo() {
  if (!isDemoMode()) throw new Error('Demo controls are only available in demo mode');
}

// ---------------------------------------------------------------- demo

export async function runNowAction() {
  enterBusiness(await requireBusiness());
  await svc.runDueActions();
  refresh();
}

export async function advanceAction(form: FormData) {
  enterBusiness(await requireBusiness());
  requireDemo();
  await svc.advanceClock(num(form, 'days') || 1);
  refresh();
}

export async function resetDemoAction() {
  enterBusiness(await requireBusiness());
  requireDemo();
  const { seedDemo } = await import('@/lib/sample');
  await seedDemo();
  refresh();
  redirect('/');
}

export async function simulatePaymentAction(form: FormData) {
  enterBusiness(await requireBusiness());
  requireDemo();
  const customerId = num(form, 'customerId');
  const c = getOpenCase(customerId);
  const owed = c ? svc.caseInvoices(customerId, c.id).reduce((s, i) => s + i.amountCents - i.amountPaidCents, 0) : 0;
  if (owed > 0) svc.recordPayment({ customerId, amountCents: owed, source: 'demo', method: 'card' });
  refresh();
}

// ---------------------------------------------------------------- drafts

export async function markSentAction(form: FormData) {
  enterBusiness(await requireBusiness());
  svc.markSent(num(form, 'id'));
  await svc.runDueActions();
  refresh();
}

export async function markAllSentAction() {
  enterBusiness(await requireBusiness());
  svc.markAllSent();
  refresh();
}

export async function skipAction(form: FormData) {
  enterBusiness(await requireBusiness());
  svc.skipMessage(num(form, 'id'));
  refresh();
}

export async function saveDraftAction(form: FormData) {
  enterBusiness(await requireBusiness());
  svc.saveDraft(num(form, 'id'), form.has('subject') ? str(form, 'subject') : null, String(form.get('body') ?? ''));
  refresh();
}

export async function sendNowAction(form: FormData) {
  enterBusiness(await requireBusiness());
  await svc.sendDraftNow(num(form, 'id'));
  refresh();
}

export async function personalizeAction(form: FormData) {
  enterBusiness(await requireBusiness());
  await svc.personalizeDraft(num(form, 'id'));
  refresh();
}

// ---------------------------------------------------------------- customers

export async function logReplyAction(form: FormData) {
  enterBusiness(await requireBusiness());
  const kind = str(form, 'kind') as ReplyKind | 'auto';
  await svc.logReply({
    customerId: num(form, 'customerId'),
    channel: (['email', 'sms', 'phone'].includes(str(form, 'channel')) ? str(form, 'channel') : 'email') as Channel | 'phone',
    body: str(form, 'body'),
    kind: ['promise', 'paid', 'dispute', 'plan', 'other', 'auto'].includes(kind) ? kind : 'other',
    promiseDate: str(form, 'promiseDate') || null,
  });
  refresh();
}

export async function pauseAction(form: FormData) {
  enterBusiness(await requireBusiness());
  svc.pauseCase(num(form, 'customerId'));
  refresh();
}

export async function resumeAction(form: FormData) {
  enterBusiness(await requireBusiness());
  await svc.resumeCase(num(form, 'customerId'));
  refresh();
}

export async function handledAction(form: FormData) {
  enterBusiness(await requireBusiness());
  svc.markHandled(num(form, 'customerId'));
  refresh();
}

export async function promiseAction(form: FormData) {
  enterBusiness(await requireBusiness());
  svc.setPromise(num(form, 'customerId'), str(form, 'date'));
  refresh();
}

export async function setToneAction(form: FormData) {
  enterBusiness(await requireBusiness());
  const v = str(form, 'templateSetId');
  svc.setCustomerTone(num(form, 'customerId'), v && v !== 'default' ? Number(v) : null);
  refresh();
}

export async function doNotChaseAction(form: FormData) {
  enterBusiness(await requireBusiness());
  await svc.setDoNotChase(num(form, 'customerId'), str(form, 'on') === '1');
  refresh();
}

export async function updateCustomerAction(form: FormData) {
  enterBusiness(await requireBusiness());
  const id = num(form, 'customerId');
  const email = str(form, 'email');
  const phone = str(form, 'phone');
  svc.updateCustomerDetails(id, {
    name: str(form, 'name'),
    type: str(form, 'type'),
    contactName: str(form, 'contactName'),
    email: email ? normalizeEmail(email) : null,
    phone: phone ? normalizePhone(phone) : null,
    preferredChannel: str(form, 'preferredChannel') === 'sms' ? 'sms' : 'email',
    tags: str(form, 'tags').split(/[,;]/).map((t) => t.trim()).filter(Boolean),
    notes: str(form, 'notes'),
  });
  await svc.runDueActions();
  refresh();
  redirect(`/customers/${id}`);
}

// ---------------------------------------------------------------- invoices & payments

export async function markInvoicePaidAction(form: FormData) {
  enterBusiness(await requireBusiness());
  svc.markInvoicePaid(num(form, 'invoiceId'));
  await svc.runDueActions();
  refresh();
}

export async function writeOffAction(form: FormData) {
  enterBusiness(await requireBusiness());
  await svc.writeOffInvoice(num(form, 'invoiceId'));
  refresh();
}

export async function recordPaymentAction(form: FormData) {
  enterBusiness(await requireBusiness());
  const cents = parseAmount(str(form, 'amount'));
  if (!cents) return;
  svc.recordPayment({ customerId: num(form, 'customerId'), amountCents: cents, source: 'manual', method: str(form, 'method') || null });
  await svc.runDueActions();
  refresh();
}

// ---------------------------------------------------------------- templates

function contentFrom(form: FormData, base: TemplateSetContent): TemplateSetContent {
  const out = { ...base };
  for (const key of TEMPLATE_KEYS) {
    out[key] = {
      subject: str(form, `${key}.subject`) || base[key].subject,
      email: str(form, `${key}.email`) || base[key].email,
      sms: str(form, `${key}.sms`) || base[key].sms,
    };
  }
  return out;
}

export async function duplicateTemplateAction(form: FormData) {
  enterBusiness(await requireBusiness());
  const base = getTemplateSet(num(form, 'baseId'));
  if (!base) return;
  const id = svc.createTemplateSet(`${base.name} (my version)`, base.description ?? '', base.templates);
  refresh();
  redirect(`/templates/${id}`);
}

export async function createTemplateWithAIAction(form: FormData) {
  enterBusiness(await requireBusiness());
  const id = await svc.createTemplateSetWithAI(str(form, 'name'), str(form, 'description'));
  refresh();
  redirect(`/templates/${id}`);
}

export async function updateTemplateAction(form: FormData) {
  enterBusiness(await requireBusiness());
  const id = num(form, 'id');
  const set = getTemplateSet(id);
  if (!set) return;
  svc.updateTemplateSet(id, str(form, 'name'), str(form, 'description'), contentFrom(form, set.templates));
  refresh();
  redirect(`/templates/${id}?saved=1`);
}

export async function deleteTemplateAction(form: FormData) {
  enterBusiness(await requireBusiness());
  svc.deleteTemplateSet(num(form, 'id'));
  refresh();
  redirect('/templates');
}

export async function setDefaultTemplateAction(form: FormData) {
  enterBusiness(await requireBusiness());
  const v = str(form, 'id');
  saveSettings({ defaultTemplateSet: v === 'auto' ? 'auto' : Number(v) });
  refresh();
}

// ---------------------------------------------------------------- settings & views

export async function saveSettingsAction(form: FormData) {
  const { businessId } = enterBusiness(await requireBusiness());
  const current = getSettings();
  const timezone = str(form, 'timezone') || current.timezone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    throw new Error(`Unknown time zone: ${timezone}`);
  }
  const businessName = str(form, 'businessName') || current.businessName;
  renameBusiness(businessId, businessName);
  saveSettings({
    businessName,
    senderName: str(form, 'senderName'),
    timezone,
    replyToEmail: str(form, 'replyToEmail'),
    deliveryMode: (str(form, 'deliveryMode') as DeliveryMode) === 'auto' ? 'auto' : 'prepare',
  });
  refresh();
  redirect('/settings?saved=1');
}

export async function saveViewAction(form: FormData) {
  enterBusiness(await requireBusiness());
  const name = str(form, 'name');
  const query = str(form, 'query');
  if (!name) return;
  const views = getSettings().savedViews.filter((v) => v.name !== name);
  saveSettings({ savedViews: [...views, { name, query }] });
  refresh();
}

export async function deleteViewAction(form: FormData) {
  enterBusiness(await requireBusiness());
  saveSettings({ savedViews: getSettings().savedViews.filter((v) => v.name !== str(form, 'name')) });
  refresh();
}

export async function toggleDemoBarAction(form: FormData) {
  enterBusiness(await requireBusiness());
  saveSettings({ showDemoBar: str(form, 'on') === '1' });
  refresh();
}
