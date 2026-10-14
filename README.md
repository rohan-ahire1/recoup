# Recoup

**Collections for invoices too small for collections agencies.**

Small businesses write off $100–$2,000 invoices because chasing them isn't worth their time. Recoup prepares a polite, persistent series of reminders for each customer, one message covering all of their overdue invoices. It stops the moment they pay, reply, promise a date, or dispute.

## What's in it

- **Customers, not just invoices.** Businesses and individuals, with contacts, tags, and notes. Each customer page tells the whole story: every invoice, message, reply, promise, and payment.
- **Payment track record.** Import paid invoices too, and Recoup works out whether this is a first slip or a pattern: *"Dana usually pays. Just a little late, now and then."*
- **Tones.** Friendly, Professional, Concise, and Firm, each written for every step by email and text. Pick one per customer, or leave it on **Auto**: Friendly for good payers, Firm for chronic late ones. You can duplicate any tone and write your own version.
- **Send it your way.** Recoup drafts each reminder into **To send**. Open it prefilled in Gmail, Outlook, or your mail app, open it as a text on your phone, or copy it, then mark it sent. With email sending on, reminders can go out directly or automatically.
- **Replies that do something.** Log what a customer said: a promise pauses reminders until the date, a dispute stops them, "already paid" flags it for you, and "can I pay in parts" prepares a plan offer.
- **Payment page** in your business's name: pay everything, or split it into 2 or 3 payments two weeks apart.
- **Tracking.** Today view, filters (status, type, pattern, amount, age, tag) with saved views, aging, recovered by month, recovery rate by tone, customer type, and payment pattern, plus CSV export.
- **AI (Premium).** Personalizing messages, writing new template sets, and reading replies. These show as *Premium · soon* until `ANTHROPIC_API_KEY` is set, and then they simply work.

The reminder sequence runs day 1 friendly reminder → day 4 follow-up with payment link → day 8 payment link → day 15 payment-plan offer. There's never more than one message waiting, and there are always at least two days between messages.

## Quick start

Requires Node 22.5+ (it uses the built-in `node:sqlite`).

```bash
npm install
npm run seed   # a sample business with 14 customers and five months of history
npm run dev    # http://localhost:4310
```

With no keys set, it runs in **demo mode**. Nothing is really sent, payment pages use test mode, and the strip under the navigation lets you jump ahead a day or a week, or reset the demo.

### Things to try

1. **Today** shows 4 reminders ready and 2 customers who need you.
2. Open **Harbor Street Bakery**. Read the story, switch the tone, open the draft in Gmail, then **Mark as sent**.
3. Open **Oak & Anvil Kitchen**, then use **Payment page** → *Open*, and choose *3 payments*.
4. Log a reply on **Riverside Yoga Studio**: *Promised to pay* holds reminders until the date.
5. **Customers**: filter by *Often late* or *Over $500*, then save the view.
6. **Import**: *Try a sample file* to see the preview with history.

## Import format

`Customer, Type, Contact, Email, Phone, Tags, Invoice, Description, Amount, Issued, Due, Paid`

- Only **Customer, Invoice, Amount, Due** and **Email or Phone** are required. Common header names (Client, Balance, Due Date, and so on) are recognized.
- **Due** is a date or days late (`32d`).
- **Paid** is the date an invoice was paid. Leave it empty for unpaid invoices. Paid rows build the track record and are never chased.
- Overdue-only files work too; add history later.
- Up to 5 MB and 10,000 rows per file.

## Going live

| What | Variables | Notes |
| --- | --- | --- |
| AI features | `ANTHROPIC_API_KEY` | Uses Claude Opus 5, with the server-side refusal fallback. |
| Email sending (Resend) | `RESEND_API_KEY`, `EMAIL_FROM` | One shared sender for every business: "Harbor Bakery via Recoup <`EMAIL_FROM`>", replies to the business. Enables **Send now** and **Send automatically**. A business can verify its own domain in Settings. |
| Bounces and complaints | `RESEND_WEBHOOK_SECRET` | Point a Resend webhook (`email.bounced`, `email.complained`) at `/api/webhooks/resend`. Bounces flag the customer; too many pause that business's automatic email. |
| Daily cap | `EMAIL_DAILY_CAP` | Automatic emails per business per day. Default 200. |
| QuickBooks Online | `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_ENVIRONMENT`, `TOKEN_ENCRYPTION_KEY` | Read-only. Register `/api/quickbooks/callback` as the redirect URI and `/api/quickbooks/disconnected` as the disconnect URL. Syncs on connect, then hourly from the scheduler; a payment in QuickBooks stops reminders. Tokens are encrypted with `TOKEN_ENCRYPTION_KEY`. |
| Links | `PUBLIC_BASE_URL` | Used in payment links and sign-in emails. |
| Sign-in emails | `AUTH_EMAIL_FROM` | Sender address for sign-in links (with `RESEND_API_KEY`). Required in production. |
| Alerts | `NTFY_URL` | An ntfy topic URL. Unexpected server errors and scheduler problems send a push, at most once per 30 minutes per error. |
| Support contact | `SUPPORT_EMAIL` | Shown on the Privacy and Terms pages. |
| Health | | `GET /api/health` is 200 when the accounts and business databases answer. |
| Scheduler | `CRON_SECRET` | Call `POST /api/cron/run` every 15 minutes (`Authorization: Bearer …`). |

Demo controls only exist in demo workspaces ("Try the demo" on the home page). They never send real email and are deleted after 3 days.

## Running it on a server

Files in `deploy/` describe the production setup on one Linux server behind Caddy:

- `recoup.service` runs the app on 127.0.0.1:8793. Keys go in `~/.config/recoup/server.env` (see `.env.example`); data lives in `data/`.
- `recoup-cron.timer` runs `scripts/cron.sh` every 15 minutes, which POSTs `/api/cron/run` locally with `CRON_SECRET`.
- `recoup-backup.timer` runs `scripts/backup-db.sh` nightly: a `VACUUM INTO` copy of every database into `~/backups/recoup/<date>/`, checked and kept 14 days. To restore a business, stop the app and copy its `tenants/<id>.db` back into `data/tenants/`.
- `Caddyfile.recoup` is the site block: `/api/cron` is closed from outside, and of the webhooks only `/api/webhooks/resend` is open.

Deploy with `scripts/deploy.sh` on the server. It pulls main, installs, builds, restarts and checks `/api/health`, and goes back to the previous commit if the new one isn't healthy. Logs: `journalctl -u recoup`, `journalctl -u recoup-cron`, `journalctl -u recoup-backup`.

## Project layout

```
lib/sequence.ts   The engine: pure function from (case, history, clock) to what to prepare next
lib/service.ts    Import, runner, drafts, replies, payments, plans, reports
lib/history.ts    Track record and plain-English summaries
lib/tones.ts      The four built-in tones
lib/compose.ts    Gmail / Outlook / mailto / sms links
lib/ai.ts         Premium AI features (Anthropic SDK)
lib/quickbooks.ts QuickBooks Online sign-in and invoice sync
lib/email.ts      Reminder sender, daily cap, bounces and complaints, own domains
lib/sample.ts     Demo business, replayed through the real engine
app/(app)/        Today, Customers, Invoices, To send, Templates, Reports, Settings, Import
app/pay/[token]/  Customer-facing payment page
tests/            Engine, import, history, templates, webhooks, and end-to-end service tests
PRODUCT.md, DESIGN.md   Product truth and the "Front desk" design system
```

## Compliance notes

*Not legal advice.*

- **Texts:** automated texts need prior consent (TCPA). STOP always works. Recoup never sends texts itself: they open on the business's own phone.
- **FDCPA:** it mostly governs third-party collectors. Recoup sends everything in the business's own name. Running it as a service that collects *for* other businesses changes that. State laws vary.
- **Tone:** built-in templates never threaten or mention agencies, credit, or legal action. The AI is instructed the same way.

## Known gaps

See PRODUCT.md.
