import { deleteBusinessAction, signOutAction } from '@/app/account-actions';
import { saveSettingsAction, toggleDemoBarAction } from '@/app/actions';
import { SubmitButton } from '@/app/components/SubmitButton';
import { Chip, FIELD, PageTitle, Panel, PremiumBadge } from '@/app/components/ui';
import { aiEnabled } from '@/lib/ai';
import { getUser } from '@/lib/accounts';
import { requireBusiness, requireSession } from '@/lib/auth';
import { isDemoMode, providerStatus } from '@/lib/providers';
import { getSettings } from '@/lib/settings';
import { enterBusiness } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

const TIMEZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'];

function Connection({ name, detail, status }: { name: string; detail: string; status: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-4">
      <div className="min-w-0">
        <div className="font-semibold">{name}</div>
        <div className="text-sm text-muted">{detail}</div>
      </div>
      {status}
    </li>
  );
}

const connected = <span className="rounded-full bg-teal-soft px-3 py-1 text-sm font-semibold text-teal-strong">Connected</span>;

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { business } = enterBusiness(await requireBusiness());
  const session = await requireSession();
  const user = session.userId ? getUser(session.userId) : undefined;
  const { saved, error } = await searchParams;
  const s = getSettings();
  const p = providerStatus();
  const canAuto = p.email !== 'mock' || p.sms !== 'mock';
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
          </label>
        </Panel>

        <Panel className="flex flex-col gap-3 p-6 sm:p-7">
          <h2 className="display text-section font-bold">Sending</h2>
          {[
            { v: 'prepare', title: 'I’ll send them myself', detail: 'Recoup drafts each reminder. You open it in Gmail, Outlook, your mail app or your phone, and press send.' },
            { v: 'auto', title: 'Send automatically', detail: canAuto ? 'Reminders go out on their own through your connected email or texting service.' : 'Connect an email or texting service below first.' },
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
        <p className="text-sm text-muted">Set these up on the server (see the README). Everything works without them.</p>
        <ul className="divide-y divide-linen">
          <Connection name="Gmail or Outlook mailbox" detail="Send from your own address and see replies here automatically." status={<Chip tone="outline">Coming soon</Chip>} />
          <Connection name="Email sending (Resend)" detail="Send reminders directly, without opening your mail app." status={p.email !== 'mock' ? connected : <Chip tone="outline">RESEND_API_KEY</Chip>} />
          <Connection name="Texting (Twilio)" detail="Send texts directly and receive replies. Needs a registered business number." status={p.sms !== 'mock' ? connected : <Chip tone="outline">TWILIO_*</Chip>} />
          <Connection name="Online payments (Stripe)" detail="Customers pay by card on their payment page." status={p.payments !== 'mock' ? connected : <Chip tone="outline">Test mode</Chip>} />
          <Connection name="AI assistant" detail="Personalizes messages, writes templates, and reads customer replies." status={aiEnabled() ? connected : <PremiumBadge />} />
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
