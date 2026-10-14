import type { Metadata } from 'next';
import { Contact, LegalPage } from '@/app/components/LegalPage';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Terms · Recoup' };

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="October 14, 2026">
      <p>By using Recoup you agree to these terms. They’re short on purpose.</p>

      <h2>What Recoup is</h2>
      <p>A tool that sends polite payment reminders in your business’s name, for invoices your customers really owe you. It isn’t a collections agency, and doesn’t collect money for you.</p>

      <h2>Your part</h2>
      <ul>
        <li>Only add real invoices and customers you have a business relationship with.</li>
        <li>Keep your customers’ details accurate, and stop reminding anyone who disputes a debt until it’s sorted out.</li>
        <li>Don’t use Recoup to threaten, harass or mislead anyone, or to send anything other than reminders about your own invoices.</li>
        <li>Follow the laws that apply to you, including rules on contacting people about debts and on sending texts.</li>
      </ul>

      <h2>Sending limits</h2>
      <p>To protect delivery for every business, each one has a daily email limit, and automatic email pauses if too many reminders bounce or are marked as spam. We may suspend an account that’s being misused.</p>

      <h2>Your data</h2>
      <p>
        It stays yours. You can export your invoices or delete your business at any time. See <a className="font-semibold text-teal underline" href="/privacy">Privacy</a> for the details.
      </p>

      <h2>No guarantees</h2>
      <p>We work hard to keep Recoup running and correct, but it’s provided as it is. We can’t promise any customer will pay, and we aren’t liable for lost payments or indirect losses. Where the law allows, our total liability is limited to what you paid us in the last 12 months.</p>

      <h2>Changes</h2>
      <p>If these terms change in a way that matters, we’ll tell you by email before the change applies. You can stop using Recoup at any time.</p>

      <h2>Questions</h2>
      <p>
        Write to <Contact />.
      </p>
    </LegalPage>
  );
}
