import Anthropic from '@anthropic-ai/sdk';
import type { TemplateKey } from './sequence';
import type { MessageTemplate, TemplateSetContent } from './tones';
import type { ReplyKind } from './types';

/**
 * Premium AI features. They switch on when ANTHROPIC_API_KEY is set;
 * without it the UI shows them as "Premium · coming soon".
 */
export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const MODEL = 'claude-opus-5';

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

const VOICE = `You write accounts-receivable messages for a small business, sent in the owner's own name.
Be human, brief and respectful. Never threaten, shame, or mention collections agencies, credit scores or legal action.
Keep every placeholder in curly braces exactly as given (for example {pay_link}) so the app can fill them in.
Text messages must stay under 300 characters and end with "Reply STOP to opt out."`;

/** One JSON-schema call with the default refusal fallback; returns the parsed object. */
async function jsonCall<T>(system: string, prompt: string, schema: Record<string, unknown>, maxTokens: number): Promise<T> {
  const response = await anthropic().beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    system,
    messages: [{ role: 'user', content: prompt }],
  } as Anthropic.Beta.MessageCreateParamsNonStreaming);

  if (response.stop_reason === 'refusal') throw new Error('The AI declined this request.');
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  return JSON.parse(text) as T;
}

const messageSchema = {
  type: 'object',
  properties: { subject: { type: 'string' }, body: { type: 'string' } },
  required: ['subject', 'body'],
  additionalProperties: false,
};

/** Rewrite a prepared reminder using what we know about this customer. */
export async function personalizeMessage(input: {
  channel: 'email' | 'sms';
  subject: string | null;
  body: string;
  tone: string;
  customerSummary: string;
  recentConversation: string[];
}): Promise<{ subject: string; body: string }> {
  const prompt = `Rewrite this ${input.channel === 'sms' ? 'text message' : 'email'} so it feels personal to this customer, in a ${input.tone} tone.
Keep every fact, amount, invoice number and link exactly as written. ${input.channel === 'sms' ? 'Return an empty subject.' : ''}

About the customer: ${input.customerSummary}
Recent conversation, oldest first:
${input.recentConversation.length ? input.recentConversation.map((l) => `- ${l}`).join('\n') : '- (none)'}

Current subject: ${input.subject ?? ''}
Current message:
${input.body}`;
  return jsonCall(VOICE, prompt, messageSchema, 2000);
}

const templateSchema = {
  type: 'object',
  properties: Object.fromEntries(
    ['1', '2', '3', '4', 'installment'].map((k) => [
      `step_${k}`,
      {
        type: 'object',
        properties: { subject: { type: 'string' }, email: { type: 'string' }, sms: { type: 'string' } },
        required: ['subject', 'email', 'sms'],
        additionalProperties: false,
      },
    ]),
  ),
  required: ['step_1', 'step_2', 'step_3', 'step_4', 'step_installment'],
  additionalProperties: false,
};

/** Write a whole template set (every step, email and text) from a description. */
export async function generateTemplateSet(description: string, example: TemplateSetContent): Promise<TemplateSetContent> {
  const prompt = `Write a new set of reminder templates in this style: "${description}".
There are five messages: step 1 (friendly first reminder), step 2 (follow-up with payment link), step 3 (payment link, a little firmer),
step 4 (offer to split into 2 or 3 payments using {plan_link}), and installment (reminder that a plan payment is due).
Available placeholders: {first_name} {business_name} {sender_name} {signoff} {invoices} {invoices_detail} {is_are} {total} {oldest_days} {pay_link} {plan_link} {installment_amount} {installment_due_date}.
Here is an existing set for structure only; do not copy its wording:
${JSON.stringify(example)}`;
  const out = await jsonCall<Record<string, MessageTemplate>>(VOICE, prompt, templateSchema, 8000);
  const keys: TemplateKey[] = ['1', '2', '3', '4', 'installment'];
  return Object.fromEntries(keys.map((k) => [k, out[`step_${k}`]])) as TemplateSetContent;
}

const replySchema = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['promise', 'paid', 'dispute', 'plan', 'other'] },
    promise_date: { type: ['string', 'null'], description: 'YYYY-MM-DD when kind is promise, else null' },
    summary: { type: 'string', description: 'One short sentence for the business owner' },
  },
  required: ['kind', 'promise_date', 'summary'],
  additionalProperties: false,
};

/** Read a customer's reply: a promise (with a date), a claim they paid, a dispute, a plan request, or other. */
export async function classifyReply(text: string, today: string): Promise<{ kind: Exclude<ReplyKind, 'stop'>; promiseDate: string | null; summary: string }> {
  const out = await jsonCall<{ kind: Exclude<ReplyKind, 'stop'>; promise_date: string | null; summary: string }>(
    'You sort customer replies to payment reminders for a small business. Today is ' + today + '. Resolve relative dates like "Friday" to the next such date.',
    `Customer reply:\n"""${text}"""`,
    replySchema,
    1000,
  );
  return { kind: out.kind, promiseDate: out.promise_date, summary: out.summary };
}
