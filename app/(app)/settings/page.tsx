import { deleteBusinessAction, signOutAction } from '@/app/account-actions';
import {
  addEmailDomainAction,
  checkEmailDomainAction,
  disconnectQuickBooksAction,
  removeEmailDomainAction,
  saveSettingsAction,
  syncQuickBooksAction,
  toggleDemoBarAction,
} from '@/app/actions';
import { SubmitButton } from '@/app/components/SubmitButton';
import { buttonClass, Chip, FIELD, PageTitle, Panel, PremiumBadge } from '@/app/components/ui';
import { aiEnabled, aiUsage } from '@/lib/ai';
import { getEmailDomain, getQuickBooks, getUser } from '@/lib/accounts';
import { dailyCap, senderFor } from '@/lib/email';
import { relativeTime } from '@/lib/format';
import { quickBooksConfigured } from '@/lib/quickbooks';
import { requireBusiness, requireSession } from '@/lib/auth';
import { isDemoMode, providerStatus } from '@/lib/providers';
import { getSettings } from '@/lib/settings';
import { enterBusiness } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'];

const QB_NOTICES: Record<string, { tone: 'teal' | 'rust'; text: string }> = {
  connected: { tone: 'teal', text: 'QuickBooks is connected and your invoices are in.' },
  synced: { tone: 'teal', text: 'Synced with QuickBooks.' },
  syncfailed: { tone: 'rust', text: 'Couldn’t sync with QuickBooks just now. We’ll keep trying every hour.' },
  failed: { tone: 'rust', text: 'Connecting QuickBooks didn’t work. Please try again.' },
  cancelled: { tone: 'rust', text: 'QuickBooks wasn’t connected.' },
  disconnected: { tone: 'rust', text: 'Recoup was disconnected from QuickBooks. Connect again to keep invoices in sync.' },
  removed: { tone: 'teal', text: 'QuickBooks is disconnected. Invoices already here stay.' },
};

function Connection({ id, name, detail, status }: { id?: string; name: string; detail: React.ReactNode; status: React.ReactNode }) {
  return (
    <li id={id} className="flex scroll-mt-24 flex-wrap items-center justify-between gap-3 py-4">
      <div className="min-w-0">
        <div className="font-semibold">{name}</div>
        <div className="text-sm text-muted">{detail}</div>
      </div>
      {status}
    </li>
  );
}

const connected = <span className="rounded-full bg-teal-soft px-3 py-1 text-sm font-semibold text-teal-strong">Connected</span>;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string; domainError?: string; checked?: string; qb?: string }>;
}) {
  const { business } = enterBusiness(await requireBusiness());
  const session = await requireSession();
  const user = session.userId ? getUser(session.userId) : undefined;
  const { saved, error, domainError, checked, qb } = await searchParams;
  const s = getSettings();
  const p = providerStatus();
  const canAuto = p.email !== 'mock';
  const sender = senderFor(business.id, s);
  const domain = getEmailDomain(business.id);
  const qbo = getQuickBooks(business.id);
  const qbNotice = qb ? QB_NOTICES[qb] : undefined;
  const ai = aiEnabled() ? aiUsage(business.id) : null;
  const aiDetail = (
    <>
      Personalizes messages, writes templates, and reads customer replies.
      {ai && <span className="block">AI used this month: {ai.used} of {ai.cap}</span>}
    </>
  );
  const connectQb = (
    <a href="/api/quickbooks/connect" className={buttonClass('outline', 'sm')}>
      {qbo ? 'Connect again' : 'Connect'}
    </a>
  );
  let qbStatus: React.ReactNode;
  if (business.demo) qbStatus = <Chip tone="outline">Off in the demo</Chip>;
  else if (!quickBooksConfigured()) qbStatus = <Chip tone="outline">Not set up yet</Chip>;
  else if (!qbo || qbo.lastError === 'disconnected') qbStatus = connectQb;
  else
    qbStatus = (
      <div className="flex flex-wrap gap-2">
        <form action={syncQuickBooksAction}>
          <SubmitButton variant="outline" size="sm" pendingLabel="Syncing…">Sync now</SubmitButton>
        </form>
        <form action={disconnectQuickBooksAction}>
          <SubmitButton variant="quiet" size="sm" pendingLabel="Disconnecting…" confirm="Disconnect QuickBooks? Invoices already in Recoup stay, but payments in QuickBooks won’t stop reminders any more.">
            Disconnect
          </SubmitButton>
        </form>
      </div>
    );
  const now = Date.now();
  const qbDetail = !qbo
    ? 'Bring in customers and invoices automatically. A payment recorded in QuickBooks stops the reminders.'
    : qbo.lastError === 'disconnected'
      ? 'Disconnected. Connect again to keep invoices in sync.'
      : `${qbo.companyName ?? 'Connected'}${qbo.lastSyncAt ? ` · synced ${relativeTime(qbo.lastSyncAt, now)}` : ''}${qbo.lastError ? ' · last sync failed' : ''}`;
  const zones = TIMEZONES.includes(s.timezone) ? TIMEZONES : [s.timezone, ...TIMEZONES];
  const field = `mt-1 h-11 ${FIELD}`;

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="Settings" />
      <form action={saveSettingsAction} className="flex flex-col gap-6">
        <Panel className="grid gap-4 p-6 text-sm font-semibold sm:grid-cols-2 sm:p-7">
          <h2 className="display text-section font-bold sm:col-span-2">Your business</h2>
          <label>
            Business name
            <input name="businessName" defaultValue={s.businessName} required className={field} />
            <span className="mt-1 block font-normal text-faint">Customers see this on every message and payment page.</span>
          </label>
          <label>
            Sign messages as
            <input name="senderName" defaultValue={s.senderName} placeholder="Marco" className={field} />
            <span className="mt-1 block font-normal text-faint">Your first name makes reminders feel personal.</span>
          </label>
          <label>
            Time zone
            <select name="timezone" defaultValue={s.timezone} className={field}>
              {zones.map((z) => (
                <option key={z} value={z}>{z.replace('_', ' ').replace('America/', '')}</option>
              ))}
            </select>
          </label>
          <label>
            Reply-to email
            <input name="replyToEmail" type="email" defaultValue={s.replyToEmail} placeholder="you@yourbusiness.com" className={field} />
            <span className="mt-1 block font-normal text-faint">Customers’ replies to reminders land here.</span>
          </label>
          <label className="sm:col-span-2">
            Mailing address
            <input name="mailingAddress" defaultValue={s.mailingAddress} maxLength={300} placeholder="12 Main St, Springfield, IL 62701" className={field} />
            <span className="mt-1 block font-normal text-faint">Printed at the bottom of emails Recoup sends for you. Needed for sending automatically.</span>
          </label>
        </Panel>

        <Panel className="grid gap-4 p-6 text-sm font-semibold sm:p-7">
          <div>
            <h2 className="display text-section font-bold">How customers pay you</h2>
            <p className="font-normal text-muted">Shown on each customer’s payment page, under what they owe. Recoup never handles the money.</p>
          </div>
          <label>
            Payment instructions
            <textarea
              name="payInstructions"
              defaultValue={s.payInstructions}
              rows={4}
              maxLength={2000}
              placeholder={'Bank transfer: Ferro Service Co., routing 000000000, account 0000000\nZelle: pay@ferroservice.com\nChecks to 12 Main St, Springfield'}
              className={`${field} h-auto py-2.5`}
            />
          </label>
          <label>
            Link to your payment page <span className="font-normal text-faint">(optional)</span>
            <input name="payLink" defaultValue={s.payLink} placeholder="https://square.link/u/…" className={field} />
            <span className="mt-1 block font-normal text-faint">Square, PayPal, Stripe, QuickBooks or any page where customers can pay by card.</span>
          </label>
        </Panel>

        <Panel className="flex flex-col gap-3 p-6 sm:p-7">
          <h2 className="display text-section font-bold">Sending</h2>
          {error === 'address' && <p className="text-sm font-semibold text-rust">Add your mailing address above to send automatically.</p>}
          {business.emailPausedAt && (
            <p className="rounded-block bg-rust-soft px-4 py-3 text-sm text-rust">
              <span className="font-semibold">Automatic email is paused.</span> {business.emailPausedReason} Reminders wait in “To send” until we turn it back on. Reply to your sign-in email to ask.
            </p>
          )}
          {[
            { v: 'prepare', title: 'I’ll send them myself', detail: 'Recoup drafts each reminder. You open it in Gmail, Outlook, your mail app or your phone, and press send.' },
            { v: 'auto', title: 'Send automatically', detail: canAuto ? `Emails go out on their own, up to ${dailyCap()} a day. Texts still open on your phone for you to send.` : 'Email sending isn’t set up on this server yet.' },
          ].map((o) => (
            <label key={o.v} className={`ease flex gap-3 rounded-block px-4 py-3.5 ring-1 ring-line ring-inset has-[:checked]:bg-teal-soft has-[:checked]:ring-2 has-[:checked]:ring-teal ${o.v === 'auto' && !canAuto ? 'opacity-60' : 'cursor-pointer'}`}>
              <input type="radio" name="deliveryMode" value={o.v} defaultChecked={s.deliveryMode === o.v} disabled={o.v === 'auto' && !canAuto} className="mt-1 accent-teal" />
              <span>
                <span className="font-semibold">{o.title}</span>
                <span className="block text-sm text-muted">{o.detail}</span>
              </span>
            </label>
          ))}
        </Panel>

        <div className="flex items-center gap-3">
          <SubmitButton variant="primary" pendingLabel="Saving…">Save settings</SubmitButton>
          {saved && <span className="text-sm font-semibold text-teal">Saved</span>}
        </div>
      </form>

      {canAuto && (
        <Panel id="email" className="mt-8 flex scroll-mt-24 flex-col gap-4 p-6 text-sm sm:p-7">
          <div>
            <h2 className="display text-section font-bold">Email address</h2>
            <p className="text-muted">
              Automatic emails come from <span className="font-semibold text-ink break-all">{sender.from}</span>
              {sender.replyTo ? <>, and replies go to <span className="font-semibold text-ink">{sender.replyTo}</span></> : '. Add a reply-to email above so replies reach you'}.
            </p>
          </div>
          {domainError && <p className="font-semibold text-rust">{domainError}</p>}
          {!domain ? (
            <form action={addEmailDomainAction} className="flex flex-col gap-3 border-t border-linen pt-4">
              <span className="font-semibold">Send from your own address</span>
              <span className="text-muted">Optional. Use an address on your own domain, like billing@yourbusiness.com. You’ll add a few DNS records where your domain is managed.</span>
              <div className="flex flex-wrap gap-2">
                <input name="fromEmail" type="email" required placeholder="billing@yourbusiness.com" aria-label="Address to send from" className={`h-11 max-w-xs ${FIELD}`} />
                <SubmitButton variant="outline" pendingLabel="Adding…">Set up</SubmitButton>
              </div>
            </form>
          ) : domain.status === 'verified' ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linen pt-4">
              <span>
                <span className="font-semibold">Sending as {domain.fromEmail}</span>
                <span className="block text-muted">{domain.domain} is verified.</span>
              </span>
              <form action={removeEmailDomainAction}>
                <SubmitButton variant="outline" pendingLabel="Removing…" confirm={`Stop sending from ${domain.fromEmail}? Emails go back to the Recoup address.`}>Stop using it</SubmitButton>
              </form>
            </div>
          ) : (
            <div className="flex flex-col gap-3 border-t border-linen pt-4">
              <span className="font-semibold">Almost there: verify {domain.domain}</span>
              <span className="text-muted">
                Add these records where you manage {domain.domain} (GoDaddy, Cloudflare, Squarespace…), then check. Changes can take up to a few hours to show up.
                {checked && domain.status !== 'verified' && <span className="block font-semibold text-rust">Not verified yet{domain.status === 'failed' ? ': the records didn’t match' : ''}.</span>}
              </span>
              <div className="overflow-x-auto rounded-block ring-1 ring-line">
                <table className="w-full text-left text-xs">
                  <thead className="bg-linen/60 text-muted">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Type</th>
                      <th className="px-3 py-2 font-semibold">Name</th>
                      <th className="px-3 py-2 font-semibold">Value</th>
                      <th className="px-3 py-2 font-semibold">Priority</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-linen">
                    {domain.records.map((r) => (
                      <tr key={`${r.type}-${r.name}-${r.value}`} className="align-top">
                        <td className="px-3 py-2 font-semibold">{r.type}</td>
                        <td className="px-3 py-2 font-mono break-all">{r.name}</td>
                        <td className="min-w-48 px-3 py-2 font-mono break-all">{r.value}</td>
                        <td className="px-3 py-2">{r.priority ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-2">
                <form action={checkEmailDomainAction}>
                  <SubmitButton variant="primary" pendingLabel="Checking…">Check now</SubmitButton>
                </form>
                <form action={removeEmailDomainAction}>
                  <SubmitButton variant="outline" pendingLabel="Removing…">Cancel</SubmitButton>
                </form>
              </div>
            </div>
          )}
        </Panel>
      )}

      {isDemoMode() && (
        <Panel className="mt-8 flex flex-wrap items-center justify-between gap-4 p-6 sm:p-7">
          <div className="min-w-0">
            <h2 className="display text-section font-bold">Demo controls</h2>
            <p className="text-sm text-muted">
              The strip under the top bar for skipping ahead a day or a week, or resetting the sample data. {s.showDemoBar ? 'Showing.' : 'Hidden.'}
            </p>
          </div>
          <form action={toggleDemoBarAction}>
            <input type="hidden" name="on" value={s.showDemoBar ? '0' : '1'} />
            <SubmitButton variant={s.showDemoBar ? 'outline' : 'primary'} pendingLabel="Saving…">
              {s.showDemoBar ? 'Hide demo controls' : 'Show demo controls'}
            </SubmitButton>
          </form>
        </Panel>
      )}

      <Panel className="mt-8 p-6 sm:p-7">
        <h2 className="display text-section font-bold">Connections</h2>
        <p className="text-sm text-muted">Everything works without them.</p>
        {qbNotice && <p className={`mt-3 text-sm font-semibold ${qbNotice.tone === 'teal' ? 'text-teal' : 'text-rust'}`}>{qbNotice.text}</p>}
        <ul className="divide-y divide-linen">
          <Connection id="quickbooks" name="QuickBooks Online" detail={qbDetail} status={qbStatus} />
          <Connection name="Gmail or Outlook mailbox" detail="Send from your own address and see replies here automatically." status={<Chip tone="outline">Coming soon</Chip>} />
          <Connection name="Email sending" detail="Send reminders directly, without opening your mail app." status={p.email !== 'mock' ? connected : <Chip tone="outline">{isDemoMode() ? 'Off in the demo' : 'Not set up yet'}</Chip>} />
          <Connection name="AI assistant" detail={aiDetail} status={ai ? connected : <PremiumBadge />} />
        </ul>
      </Panel>

      <Panel className="mt-8 flex flex-col gap-5 p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="display text-section font-bold">Account</h2>
            <p className="text-sm text-muted">{user ? <>Signed in as {user.email}</> : 'You’re trying the demo.'}</p>
          </div>
          <form action={signOutAction}>
            <SubmitButton variant="outline" pendingLabel="Signing out…">{user ? 'Sign out' : 'Leave the demo'}</SubmitButton>
          </form>
        </div>
        {!business.demo && (
          <form action={deleteBusinessAction} className="flex flex-col gap-3 border-t border-linen pt-5 text-sm">
            <span className="font-semibold">Delete {business.name}</span>
            <span className="text-muted">Removes every customer, invoice, message and setting for good. Download your invoices first if you need them.</span>
            {error === 'confirm' && <span className="font-semibold text-rust">Type the business name exactly to confirm.</span>}
            <div className="flex flex-wrap gap-2">
              <input name="confirm" placeholder={`Type “${business.name}” to confirm`} aria-label="Business name to confirm" className={`h-11 max-w-xs ${FIELD}`} />
              <SubmitButton variant="danger" pendingLabel="Deleting…" confirm="Delete this business and all of its data? This can’t be undone.">Delete business</SubmitButton>
            </div>
          </form>
        )}
      </Panel>
    </div>
  );
}
