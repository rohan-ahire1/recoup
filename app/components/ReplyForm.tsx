'use client';

import { useState } from 'react';
import { logReplyAction } from '@/app/actions';
import { SubmitButton } from './SubmitButton';
import { PremiumBadge } from './ui';

const OUTCOMES = [
  { value: 'promise', label: 'Promised to pay', hint: 'Reminders wait until the date' },
  { value: 'plan', label: 'Wants to pay in parts', hint: 'A plan offer gets ready to send' },
  { value: 'paid', label: 'Says they already paid', hint: 'Flags it for you to check' },
  { value: 'dispute', label: 'Disputes the invoice', hint: 'Stops reminders until sorted' },
  { value: 'other', label: 'Something else', hint: 'Pauses reminders for you to reply' },
] as const;

/** Log what a customer said (from your inbox, a call, or a text) and what it means. */
export function ReplyForm({ customerId, firstName, aiEnabled, defaultChannel }: { customerId: number; firstName: string; aiEnabled: boolean; defaultChannel: 'email' | 'sms' }) {
  const [kind, setKind] = useState<string>(aiEnabled ? 'auto' : 'promise');
  const defaultDate = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  return (
    <form action={logReplyAction} className="flex flex-col gap-4">
      <input type="hidden" name="customerId" value={customerId} />
      <label className="text-sm font-semibold">
        What did {firstName} say?
        <textarea
          name="body"
          required
          rows={3}
          placeholder="Paste their reply, or jot down what they said on the phone"
          className="mt-1.5 block w-full rounded-[var(--radius-control)] bg-paper px-3 py-2 text-[15px] font-normal ring-1 ring-line ring-inset placeholder:text-faint focus:ring-teal"
        />
      </label>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">Came in by</legend>
        <div className="flex gap-2">
          {(['email', 'sms', 'phone'] as const).map((c) => (
            <label key={c} className="ease flex h-9 cursor-pointer items-center rounded-full px-3.5 text-sm ring-1 ring-line ring-inset has-[:checked]:bg-ink has-[:checked]:text-sand has-[:checked]:ring-ink">
              <input type="radio" name="channel" value={c} defaultChecked={c === defaultChannel} className="sr-only" />
              {c === 'email' ? 'Email' : c === 'sms' ? 'Text' : 'Phone call'}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1.5 text-sm font-semibold">What does it mean?</legend>
        <div className="grid gap-2">
          <label className={`flex items-center gap-3 rounded-2xl px-3.5 py-2.5 ring-inset ${aiEnabled ? 'cursor-pointer ring-1 ring-line has-[:checked]:bg-teal-soft has-[:checked]:ring-2 has-[:checked]:ring-teal' : 'border-[1.5px] border-dashed border-linen-2'}`}>
            <input type="radio" name="kind" value="auto" disabled={!aiEnabled} checked={kind === 'auto'} onChange={() => setKind('auto')} className="accent-teal" />
            <span className="flex-1 text-sm">
              <span className="font-semibold">Let AI read it</span>
              <span className="block text-faint">Spots promises, dates, disputes and payment claims</span>
            </span>
            {!aiEnabled && <PremiumBadge />}
          </label>
          {OUTCOMES.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-3 rounded-2xl px-3.5 py-2.5 ring-1 ring-line ring-inset has-[:checked]:bg-teal-soft has-[:checked]:ring-2 has-[:checked]:ring-teal">
              <input type="radio" name="kind" value={o.value} checked={kind === o.value} onChange={() => setKind(o.value)} className="accent-teal" />
              <span className="text-sm">
                <span className="font-semibold">{o.label}</span>
                <span className="block text-faint">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {kind === 'promise' && (
        <label className="text-sm font-semibold">
          Pay by
          <input type="date" name="promiseDate" defaultValue={defaultDate} required className="num mt-1.5 block h-11 rounded-[var(--radius-control)] bg-paper px-3 font-normal ring-1 ring-line ring-inset focus:ring-teal" />
        </label>
      )}
      <SubmitButton variant="primary" pendingLabel="Saving…">
        Save reply
      </SubmitButton>
    </form>
  );
}
