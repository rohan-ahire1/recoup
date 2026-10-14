import Link from 'next/link';
import { markAllSentAction } from '@/app/actions';
import { Icon } from '@/app/components/icons';
import { SendPanel } from '@/app/components/SendPanel';
import { SubmitButton } from '@/app/components/SubmitButton';
import { Avatar, Empty, ListToolbar, PageTitle, Panel } from '@/app/components/ui';
import { aiEnabled } from '@/lib/ai';
import { requireBusiness } from '@/lib/auth';
import { formatDateTime, money, plural } from '@/lib/format';
import { providerStatus } from '@/lib/providers';
import { getCustomer, listMessagesByStatus } from '@/lib/repo';
import { STEPS } from '@/lib/sequence';
import { caseInvoices } from '@/lib/service';
import { getSettings } from '@/lib/settings';
import type { Message } from '@/lib/types';

export const dynamic = 'force-dynamic';

function labelOf(m: Message) {
  if (m.step) return STEPS.find((s) => s.step === m.step)!.label;
  if (m.actionKey?.startsWith('installment')) return 'Payment plan reminder';
  if (m.actionKey?.startsWith('reply-plan')) return 'Payment plan offer';
  return 'Message';
}

export default async function SendPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireBusiness();
  const { tab = 'ready' } = await searchParams;
  const { timezone } = getSettings();
  const ready = listMessagesByStatus(['ready']).reverse();
  const history = tab === 'history' ? listMessagesByStatus(['sent', 'received', 'failed'], 200) : [];
  const providers = providerStatus();
  const ai = aiEnabled();

  return (
    <>
      <ListToolbar flush={false}>
      <PageTitle
        title="To send"
        sub={
          providers.email === 'mock' && providers.sms === 'mock'
            ? 'Recoup drafts each reminder. Open it in your own email or messages, press send there, then mark it sent.'
            : 'Messages waiting for you. Connected channels can send straight from here.'
        }
        actions={
          tab === 'ready' && ready.length > 1 ? (
            <form action={markAllSentAction}>
              <SubmitButton variant="outline" icon="check" confirm={`Mark all ${ready.length} as sent? Only do this if you’ve sent them yourself.`} pendingLabel="Saving…">
                Mark all as sent
              </SubmitButton>
            </form>
          ) : null
        }
      />

      <nav aria-label="Messages" className="flex gap-1.5">
        {[
          ['ready', `Ready ${ready.length ? `(${ready.length})` : ''}`],
          ['history', 'Sent & received'],
        ].map(([k, l]) => (
          <Link
            key={k}
            href={k === 'ready' ? '/send' : '/send?tab=history'}
            aria-current={tab === k ? 'page' : undefined}
            className={`ease rounded-full px-4 py-2 text-[15px] ${tab === k ? 'bg-ink text-sand' : 'bg-linen text-ink hover:bg-linen-2'}`}
          >
            {l}
          </Link>
        ))}
      </nav>
      </ListToolbar>

      {tab === 'ready' ? (
        ready.length === 0 ? (
          <Empty title="Nothing to send" action={<Link href="/" className="font-semibold text-teal hover:underline">Back to Today</Link>}>
            You’re all caught up. New reminders show up here on the day they’re due.
          </Empty>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
            {ready.map((m) => {
              const customer = getCustomer(m.customerId)!;
              const invoices = m.caseId ? caseInvoices(customer.id, m.caseId) : [];
              return (
                <Panel key={m.id} className="flex flex-col gap-5 p-6 sm:p-7">
                  <div className="flex items-center gap-3">
                    <Avatar name={customer.name} type={customer.type} size={44} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/customers/${customer.id}`} className="font-semibold hover:underline">{customer.name}</Link>
                      <div className="text-sm text-muted">
                        {labelOf(m)} · {m.tone} · {plural(invoices.length, 'invoice')}, <span className="num">{money(invoices.reduce((s, i) => s + i.amountCents - i.amountPaidCents, 0))}</span>
                      </div>
                    </div>
                    <Link href={`/customers/${customer.id}`} aria-label={`Open ${customer.name}`} className="ease flex h-10 w-10 items-center justify-center rounded-full text-faint hover:bg-linen hover:text-ink">
                      <Icon name="chevronRight" />
                    </Link>
                  </div>
                  <SendPanel
                    draft={{ id: m.id, channel: m.channel as 'email' | 'sms', toAddr: m.toAddr, subject: m.subject, body: m.body, label: labelOf(m) }}
                    canSendNow={m.channel === 'email' ? providers.email !== 'mock' : providers.sms !== 'mock'}
                    aiEnabled={ai}
                    compact
                  />
                </Panel>
              );
            })}
          </div>
        )
      ) : history.length === 0 ? (
        <Empty title="No messages yet" />
      ) : (
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-linen">
            {history.map((m) => {
              const customer = getCustomer(m.customerId)!;
              const inbound = m.direction === 'inbound';
              return (
                <li key={m.id} className="grid gap-2 px-6 py-4 sm:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="text-sm">
                    <Link href={`/customers/${customer.id}`} className="font-semibold hover:underline">{customer.name}</Link>
                    <div className="mt-0.5 flex items-center gap-1.5 text-muted">
                      <Icon name={inbound ? 'arrowLeft' : m.channel === 'sms' ? 'message' : 'mail'} size={15} />
                      {inbound ? `Replied${m.channel === 'phone' ? ' by phone' : m.channel === 'sms' ? ' by text' : ''}` : `${labelOf(m)}`}
                    </div>
                    <div className="num text-faint">{formatDateTime(m.sentAt ?? m.createdAt, timezone)}</div>
                  </div>
                  <div className="min-w-0 text-[15px]">
                    {m.subject && <div className="font-semibold">{m.subject}</div>}
                    <p className={`line-clamp-3 whitespace-pre-wrap [overflow-wrap:anywhere] ${inbound ? 'text-ink' : 'text-ink-2'}`}>{m.body}</p>
                    {m.status === 'failed' && <p className="mt-1 text-sm text-rust">Failed: {m.error}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </>
  );
}
