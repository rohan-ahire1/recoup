# Recoup

**Polite, persistent reminders for invoices too small for a collections agency.**

Live: [recoup.rohanahire.com](https://recoup.rohanahire.com) (use "Try the demo" for a throwaway workspace)

## What it does

Small businesses often write off $100 to $2,000 invoices because chasing them isn't worth the time. Recoup takes a list of overdue invoices, groups them by customer, and prepares a short series of reminders for each one: one message per customer covering everything they owe. The series stops the moment the customer pays, replies, promises a date, or disputes.

The reminder sequence:

```
day 1   friendly reminder
day 4   follow-up with payment link
day 8   payment link
day 15  payment-plan offer
```

There is never more than one message waiting per customer, and always at least two days between messages.

## Key features

- **Customers, not just invoices.** Businesses and individuals with contacts, tags and notes. Each customer page shows the full story: invoices, messages, replies, promises and payments.
- **Payment track record.** Import paid invoices too, and Recoup works out whether this is a first slip or a habit, with a plain-English summary like *"Usually pays. Just a little late, now and then."*
- **Four tones.** Friendly, Professional, Concise and Firm, written for every step by email and text. Pick one per customer or leave it on Auto (Friendly for good payers, Firm for chronic late ones). Any tone can be duplicated and rewritten.
- **Send it your way.** Reminders are drafted into a **To send** queue. Open one prefilled in Gmail, Outlook or the mail app, open it as a text on your phone, or copy it, then mark it sent. With email configured, reminders can go out directly or automatically.
- **Replies that do something.** A promise pauses reminders until that date, a dispute stops them, "already paid" flags it for review, and "can I pay in parts" prepares a plan offer.
- **Customer payment page** in the business's name, showing how to pay (instructions or the business's own payment link) and letting the customer split the balance into 2 or 3 payments two weeks apart. Recoup never handles the money itself.
- **QuickBooks Online sync** (read-only). Customers and invoices sync hourly; a payment recorded in QuickBooks stops reminders.
- **Reports.** Today view, filters (status, type, payment pattern, amount, age, tag) with saved views, aging, recovered by month, recovery rate by tone, and CSV export.
- **Optional AI features** using the Anthropic API: personalizing a message from the customer's history, writing a new tone from a description, and reading a pasted reply to classify it (paid, promise with date, dispute, and so on). Hidden until `ANTHROPIC_API_KEY` is set. With `TYPESAFE_API_KEY` set, TypeSafe's Jev picks the reply type and unclear replies go to you to check. Each business gets 300 AI calls a month (`AI_MONTHLY_CAP`) and at most 30 in any 10 minutes; past that, replies are logged unread.

## Tech stack

- Next.js 15 (App Router, server actions), React 19, TypeScript
- Tailwind CSS v4
- SQLite through Node's built-in `node:sqlite` (Node 22.5+)
- Resend for email, QuickBooks Online OAuth, Anthropic SDK
- Vitest; GitHub Actions runs typecheck, tests and build on every push
- Deployed on a single Linux server with systemd and Caddy

## Architecture notes

- **The reminder engine is a pure function.** `lib/sequence.ts` takes a case, its history and a clock, and returns what to prepare next. Each action has an idempotency key so it is prepared at most once, which makes the engine easy to test and safe to re-run from the scheduler.
- **One database per business.** Accounts and sessions live in `accounts.db`; each business gets its own `tenants/<id>.db`. The current business is carried in `AsyncLocalStorage` (`lib/tenant.ts`), so library code never takes a business id argument and can't be pointed at the wrong tenant by mistake.
- **Passwordless sign-in** with single-use email links and HTTP-only session cookies.
- **Secrets at rest.** QuickBooks tokens are encrypted with AES-256-GCM (`lib/secret-box.ts`). Resend webhooks are verified with an HMAC signature and a five-minute replay window (`lib/svix.ts`).
- **Safe email sending.** A daily cap per business, and automatic sending pauses itself after too many bounces or spam complaints.
- **Demo workspaces** replay a sample business through the real engine, with controls to jump ahead a day or a week. They never send real email and are deleted after 3 days.

## Run it locally

Requires Node 22.5 or newer.

```bash
npm install
npm run seed   # a sample business with 14 customers and five months of history
npm run dev    # http://localhost:4310
```

With no keys set, it runs in demo mode: nothing is really sent, and a strip under the navigation lets you move time forward or reset the demo.

Other scripts:

```bash
npm test           # vitest
npm run typecheck
npm run build && npm start
```

### Things to try

1. **Today** shows the reminders that are ready and the customers who need you.
2. Open **Harbor Street Bakery**. Read the story, switch the tone, open the draft in Gmail, then **Mark as sent**.
3. Open **Oak & Anvil Kitchen**, open its **Payment page**, and choose *3 payments*.
4. Log a reply on **Riverside Yoga Studio**: *Promised to pay* holds reminders until that date.
5. On **Customers**, filter by *Often late* or *Over $500* and save the view.
6. On **Import**, use *Try a sample file* to see the preview.

### Environment variables

Everything is optional in development. Copy `.env.example` to `.env` and fill in only what you need.

| What | Variables |
| --- | --- |
| Public URL for links and sign-in emails | `PUBLIC_BASE_URL` |
| Scheduler (`POST /api/cron/run` every 15 minutes) | `CRON_SECRET` |
| Email via Resend | `RESEND_API_KEY`, `EMAIL_FROM`, `AUTH_EMAIL_FROM`, `RESEND_WEBHOOK_SECRET`, `EMAIL_DAILY_CAP` (default 200), `NEW_ACCOUNT_DAILY_CAP` (default 20 a day for accounts younger than `NEW_ACCOUNT_DAYS`, default 14, until they verify their own domain) |
| QuickBooks Online | `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_ENVIRONMENT`, `TOKEN_ENCRYPTION_KEY` |
| AI features | `ANTHROPIC_API_KEY`, `TYPESAFE_API_KEY` (optional, Jev sorts replies), `AI_MONTHLY_CAP` (AI calls per business per month, default 300) |
| Error alerts (ntfy) | `NTFY_URL` |
| Contact shown on Privacy and Terms | `SUPPORT_EMAIL` |
| Where databases live | `DATA_DIR` (default `./data`) |
| Most demo workspaces alive at once | `MAX_LIVE_DEMOS` (default 300) |

Without email keys, sign-in links are printed to the server log.

## Import format

`Customer, Type, Contact, Email, Phone, Tags, Invoice, Description, Amount, Issued, Due, Paid`

- Only **Customer, Invoice, Amount, Due** and **Email or Phone** are required. Common header names (Client, Balance, Due Date and so on) are recognized.
- **Due** is a date or days late (`32d`).
- **Paid** is the date an invoice was paid. Paid rows build the track record and are never chased.
- Up to 5 MB and 10,000 rows per file.

## Running it on a server

`deploy/` holds the production setup for one Linux server behind Caddy:

- `recoup.service` runs the app on 127.0.0.1:8793 with keys from `~/.config/recoup/server.env`.
- `recoup-cron.timer` calls the scheduler every 15 minutes.
- `recoup-backup.timer` takes a nightly `VACUUM INTO` copy of every database, checks it, and keeps 14 days.
- `Caddyfile.recoup` closes `/api/cron` to the outside and only exposes the Resend webhook.

`scripts/deploy.sh` pulls `main`, installs, builds, restarts, checks `/api/health`, and rolls back to the previous commit if the new one isn't healthy.

Before it touches the code, `deploy.sh` backs up every database with `scripts/backup-db.mjs` into `~/backups/recoup/pre-deploy/<sha>-<timestamp>/` (`<sha>` is the commit that was running; `DATA_DIR` and `BACKUP_DIR` override the paths, as for the nightly backup). It keeps the last 10 pre-deploy backups. If the backup fails, the deploy stops and the running app is left alone. A rollback only goes back to the old code: migrations stay applied, so it prints the pre-deploy backup's path and leaves restoring it to you. To restore, stop `recoup`, copy `accounts.db` and `tenants/` from the dated folder inside that backup over `data/`, and start it again.

## Project layout

```
lib/sequence.ts    Reminder engine: (case, history, clock) -> next action
lib/service.ts     Import, runner, drafts, replies, payments, plans, reports
lib/history.ts     Track record and plain-English summaries
lib/tones.ts       The four built-in tones
lib/compose.ts     Gmail / Outlook / mailto / sms links
lib/tenant.ts      Per-business database selection
lib/quickbooks.ts  QuickBooks Online sign-in and invoice sync
lib/email.ts       Sender, daily cap, bounces and complaints, custom domains
lib/ai.ts          Optional AI features
app/(app)/         Today, Customers, Invoices, To send, Templates, Reports, Settings, Import
app/pay/[token]/   Customer-facing payment page
tests/             Engine, import, history, tenants, email, webhooks, QuickBooks, service
```

`PRODUCT.md` and `DESIGN.md` describe the product rules and the design system.

## Compliance notes

*Not legal advice.*

- **Texts:** Recoup never sends texts itself; they open on the business's own phone. STOP always works.
- **FDCPA:** it mainly governs third-party collectors. Recoup sends everything in the business's own name.
- **Tone:** built-in templates never threaten or mention agencies, credit reporting or legal action, and the AI is instructed the same way.

## Known gaps

- Replies are logged by hand; Gmail/Outlook mailbox sync isn't built.
- Missed plan installments aren't chased yet.
- QuickBooks is the only accounting integration.
- One server with SQLite; running several servers would need Postgres.
