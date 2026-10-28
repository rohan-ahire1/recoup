'use client';

import { useState } from 'react';
import { markSentAction, personalizeAction, saveDraftAction, sendNowAction, skipAction } from '@/app/actions';
import { copyText, gmailLink, mailtoLink, outlookLink, smsLink } from '@/lib/compose';
import { CopyButton } from './CopyButton';
import { Icon } from './icons';
import { SubmitButton } from './SubmitButton';
import { buttonClass, FIELD, PremiumTeaser } from './ui';

export interface Draft {
  id: number;
  channel: 'email' | 'sms';
  toAddr: string | null;
  subject: string | null;
  body: string;
  label: string;
}

/**
 * A prepared message and every way to send it: open it prefilled in the owner's
 * own mail or messages app, copy it, or send directly when a provider is connected.
 */
export function SendPanel({
  draft,
  canSendNow,
  aiEnabled,
  compact = false,
}: {
  draft: Draft;
  canSendNow: boolean;
  aiEnabled: boolean;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [opened, setOpened] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const isEmail = draft.channel === 'email';
  const to = draft.toAddr ?? '';
  const d = { to, subject: draft.subject ?? '', body: draft.body };
  const openProps = { target: '_blank', rel: 'noreferrer', onClick: () => setOpened(true) } as const;

  return (
    <div className="flex flex-col gap-4">
      {editing ? (
        <form
          action={async (fd) => {
            await saveDraftAction(fd);
            setEditing(false);
          }}
          className="flex flex-col gap-2 rounded-block bg-linen/60 p-4"
        >
          <input type="hidden" name="id" value={draft.id} />
          {isEmail && (
            <label className="text-sm font-semibold">
              Subject
              <input
                name="subject"
                defaultValue={draft.subject ?? ''}
                className={`mt-1 h-11 ${FIELD}`}
              />
            </label>
          )}
          <label className="text-sm font-semibold">
            Message
            <textarea
              name="body"
              defaultValue={draft.body}
              rows={isEmail ? 10 : 5}
              required
              className={`mt-1 py-2 text-[15px] leading-relaxed ${FIELD}`}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(false)} className={buttonClass('ghost', 'sm')}>
              Cancel
            </button>
            <SubmitButton variant="primary" size="sm" pendingLabel="Saving…">
              Save changes
            </SubmitButton>
          </div>
        </form>
      ) : (
        <div className="rounded-block bg-linen/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 text-sm text-muted">
              <span className="flex min-w-0 items-center gap-1.5">
                <Icon name={isEmail ? 'mail' : 'message'} size={15} />
                <span className="whitespace-nowrap">{isEmail ? 'Email' : 'Text'} to</span>
                <span className="truncate text-ink-2">{to}</span>
              </span>
            </div>
            <button type="button" onClick={() => setEditing(true)} className={`${buttonClass('ghost', 'sm')} -mt-1 -mr-2`}>
              <Icon name="edit" size={15} />
              Edit
            </button>
          </div>
          {isEmail && draft.subject && <div className="mt-2 font-semibold [overflow-wrap:anywhere]">{draft.subject}</div>}
          <div className={`mt-2 text-[15px] leading-relaxed whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere] ${compact ? 'line-clamp-4' : ''}`}>{draft.body}</div>
        </div>
      )}

      {aiEnabled && (
        <form action={async (fd) => setAiNote(await personalizeAction(fd))} className="flex flex-col items-start gap-2">
          <input type="hidden" name="id" value={draft.id} />
          <SubmitButton variant="outline" size="sm" icon="sparkle" pendingLabel="Rewriting…">
            Personalize with AI
          </SubmitButton>
          {aiNote && <p role="status" className="text-sm font-semibold text-rust">{aiNote}</p>}
        </form>
      )}

      {/* Sending it and marking it sent are one job, so they sit together; the upsell waits below. */}
      <div className="flex flex-col gap-2">
        {canSendNow ? (
          <form action={sendNowAction}>
            <input type="hidden" name="id" value={draft.id} />
            <SubmitButton variant="teal" size="lg" className="w-full" icon="arrowRight" pendingLabel="Sending…">
              Send now
            </SubmitButton>
          </form>
        ) : isEmail ? (
          <a href={gmailLink(d)} {...openProps} className={`${buttonClass('primary', 'lg')} w-full`}>
            Open in Gmail, ready to send
            <Icon name="external" size={16} />
          </a>
        ) : (
          <a href={smsLink(to, draft.body)} {...openProps} className={`${buttonClass('primary', 'lg')} w-full`}>
            Open in Messages
            <Icon name="external" size={16} />
          </a>
        )}
        <div className={`grid gap-2 ${isEmail ? 'grid-cols-3' : 'grid-cols-1'}`}>
          {isEmail && (
            <>
              <a href={outlookLink(d)} {...openProps} className={buttonClass('quiet')}>
                Outlook
              </a>
              <a href={mailtoLink(d)} {...openProps} className={buttonClass('quiet')}>
                Mail app
              </a>
            </>
          )}
          <CopyButton text={copyText(draft)} label={isEmail ? 'Copy' : 'Copy text'} onCopied={() => setOpened(true)} />
        </div>
        {!isEmail && !canSendNow && <p className="text-center text-sm text-muted">Opens your phone’s messaging app with the text filled in.</p>}

        {!canSendNow && (
          <div
            className={`ease mt-1 flex flex-wrap items-center justify-between gap-3 rounded-block py-2.5 pr-2.5 pl-4 ${
              opened ? 'bg-teal-soft' : 'ring-1 ring-line ring-inset'
            }`}
          >
            <span className="text-sm text-ink-2">{opened ? 'Sent it? Mark it so the next step can follow.' : 'After you send it, mark it sent.'}</span>
            <div className="flex gap-2">
              <form action={skipAction}>
                <input type="hidden" name="id" value={draft.id} />
                <SubmitButton variant="ghost" size="sm" pendingLabel="Skipping…">
                  Skip
                </SubmitButton>
              </form>
              <form action={markSentAction}>
                <input type="hidden" name="id" value={draft.id} />
                <SubmitButton variant={opened ? 'teal' : 'outline'} size="sm" icon="check" pendingLabel="Saving…">
                  Mark as sent
                </SubmitButton>
              </form>
            </div>
          </div>
        )}
      </div>

      {!aiEnabled && !compact && <PremiumTeaser title="Make it personal with AI" detail="Uses their history and past replies. Keeps your voice." />}
    </div>
  );
}
