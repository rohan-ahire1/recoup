# Recoup

## Purpose
Collections for invoices too small for collections agencies. Small and medium businesses write off $100–$2,000 invoices because chasing them isn't worth their time. Recoup prepares and sends a polite, persistent sequence of reminders, and it stops the moment a customer pays, replies, promises a date, or disputes.

## Users
Owners and office managers of SMEs: service businesses, trades, agencies, suppliers. They are not finance people. They check in between other work, often on a phone, and they care about keeping the customer relationship intact.

## Jobs
- See who owes what, and whether this is a first slip or a pattern.
- Send the right reminder in the right tone with as little effort as possible.
- Know what needs their personal attention (replies, disputes, broken promises) and ignore the rest.
- Track money owed and recovered over time.

## Core concepts
- **Customer**: a business or an individual, with a contact person, email, phone, preferred channel, tags, and a tone.
- **Invoice**: open, paid, disputed or written off. Paid history (with paid dates) powers each customer's track record.
- **Case**: one reminder sequence per customer covering all of their overdue invoices. One message per customer, never one per invoice.
- **Sequence**: day 1 friendly reminder → day 4 follow-up with link → day 8 payment link → day 15 payment-plan offer.
- **Tone**: Friendly, Professional, Concise, Firm (built-in template sets), plus the business's own sets.
- **Track record**: on-time rate, average days late and a plain-English summary, derived from paid history.

## Delivery
- **Prepared (default)**: Recoup drafts each message into "To send". The owner sends it with one click: open prefilled in Gmail, Outlook or their mail app, open prefilled as a text on a phone, or copy. Then they mark it sent.
- **Automatic**: when an email or SMS provider is connected, messages go out on their own.
- Mailbox integration (Gmail/Outlook sync) is planned, not built.

## AI (Premium)
Personalizing messages from history, writing new template sets from a description, and reading customer replies. Shown as "Premium · coming soon" unless `ANTHROPIC_API_KEY` is configured, in which case the features work and the badge is hidden.

## Constraints
- Messages go out in the business's name, never Recoup's.
- STOP must always work for texts. No threatening language in built-in templates.
- Never claim capabilities that aren't built (for example, email-open tracking in prepared mode).

## Platform
Web (responsive; phone use is common).

## Stack
Next.js App Router, TypeScript, Tailwind v4, SQLite via node:sqlite.
