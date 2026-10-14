import type { Metadata } from 'next';
import { Contact, LegalPage } from '@/app/components/LegalPage';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Privacy · Recoup' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="October 14, 2026">
      <p>Recoup helps small businesses follow up on unpaid invoices. This page says what we keep, why, and who else sees it.</p>

      <h2>What we keep</h2>
      <ul>
        <li>Your account: your email address and your business’s name and settings.</li>
        <li>What you bring in: your customers’ names, email addresses and phone numbers, and their invoices and payments, from a file or from QuickBooks.</li>
        <li>What Recoup does: the reminders it prepares and sends, replies you log, and whether emails bounced or were marked as spam.</li>
      </ul>

      <h2>Why</h2>
      <p>Only to run Recoup for you: to send reminders in your name, show you who owes what, and stop when they pay. We don’t sell data, show ads, or use your customers’ details for anything else.</p>

      <h2>Who else sees it</h2>
      <ul>
        <li>Resend sends our email, so it handles each reminder’s address and text.</li>
        <li>If you connect QuickBooks, Intuit shares your customers and invoices with us. We only read; we never change anything in QuickBooks.</li>
        <li>If you use the AI features, the text involved goes to Anthropic to write the draft. It isn’t used to train their models.</li>
        <li>Our servers are rented from a hosting provider, which stores the data but doesn’t look at it.</li>
      </ul>

      <h2>Your customers</h2>
      <p>You bring your customers’ details to Recoup and decide who gets reminders, so you are responsible for having a good reason to contact them. Anyone can ask you to stop, and texts include STOP.</p>

      <h2>How long we keep it</h2>
      <p>As long as your account is open. Delete your business in Settings and its data is removed straight away; backups that contain it are gone within 14 days. Demo workspaces are deleted after 3 days.</p>

      <h2>Security</h2>
      <p>Each business’s data is kept in its own database. Connections are encrypted, and QuickBooks access tokens are encrypted at rest. Sign-in uses one-time email links, so there are no passwords to steal.</p>

      <h2>Questions</h2>
      <p>
        Write to <Contact />.
      </p>
    </LegalPage>
  );
}
