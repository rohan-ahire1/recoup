# Design: Front desk

Recoup should feel like a capable, warm office manager, not a debt collector and not a finance terminal. People and relationships come first; numbers support them.

## Surface
- Operate mode throughout the app; the customer-facing pay page is a calm, single-task version of the same world.
- Ground is warm sand; content sits on white panels with generous radius. No nested panels.
- Plain-English summaries lead ("Dana usually pays. Just a little late, now and then."), with numbers beside them.

## Color (tokens in app/globals.css)
- sand `#F2EDE3` (ground), paper `#FFFFFF` (panels), linen `#EFE8DA` (quiet fills, chips), line `#E4DBCA`
- ink `#23201B`, ink-2 `#3B362E`, muted `#5E574B`, faint `#6E6657` (passes AA on sand, paper, linen and teal-soft; not on linen-2)
- field `#948770`: the border of anything you type into (3.5:1). Use `FIELD` from `app/components/ui.tsx`; never hand-roll a field.
- edge `rgb(35 32 27 / 6%)`: the 1px inner ring every paper panel gets (`<Panel>` does it).
- teal `#0F5C55` (the single action/brand accent), teal-soft `#E6F0EE`
- marigold `#D4932F` (attention: overdue, "to send" counts; always with a label, never as text), marigold-soft `#F6D9A6`, marigold-ink `#6B4510`
- aging-1…4: the light-to-dark ochre ramp for lateness charts.
- rust `#A8321F` (errors, disputes only)
- Primary button: ink fill with sand text. Teal marks selection and positive money (paid, recovered).

## Type
- Display: Bricolage Grotesque 600/700, only for page titles, customer names, and headline money. Five sizes, each with its own tracking:
  `text-money` 56 (-0.035em) · `text-title` 36 (-0.035em, every h1) · `text-heading` 28 (-0.025em, stats, wordmark) · `text-section` 22 (-0.02em, panel and dialog headings) · `text-lead` 19 (-0.01em, summary lines).
- Headline money uses `<BigMoney>`: the currency sign at half size and 70% opacity, cents dropped on round amounts.
- UI and body: Instrument Sans 400/500/600 for everything else, tabular numerals for money and dates.
- Text sizes: 12 (`text-xs`) / 13 / 14 (`text-sm`) / 15 (body) / 16 (`text-base`). Nothing else.

## Shape and depth
- Corners are tokens: `rounded-pay` 24 · `rounded-panel` 20 · `rounded-block` 14 (blocks inside a panel) · `rounded-control` 10 (buttons, fields) · `rounded-tooltip` 8 · `rounded-tail` 4 (bubble tails, chart tops) · `rounded-full` for chips, pills, dots.
- Panels are flat on sand; the one elevated element per screen (the composer; on Today, the teal "brought back" card) takes `0 20px 40px -24px rgba(35,32,27,.35)`.
- Buttons give a 2% press-in on click (`active:scale-[0.98]`); row chevrons nudge right on hover.

## Components
- Pills for navigation and filters; chips for tags; tone cards (name + one-line description) as radio buttons.
- Track-record dots: teal = on time, marigold = late, marigold ring = still open.
- Story timeline: a 2px linen rail with dots; messages as speech bubbles (ours on linen-white, theirs on linen).
- Premium features: a dashed linen box with a marigold "Premium · soon" chip; hidden entirely when AI is configured.

## Motion
- App screens: 150–200ms ease-out on hover/press and on disclosure. No page-load choreography; people come here to work.
- Public pages (landing): the hero settles in once on load (text, photo, then the reminder and "paid" cards), sections rise into view on scroll (CSS scroll timelines, no JS), photos ease-zoom on hover. Classes `enter*`, `reveal`, `reveal-mock`, `zoom` in `app/globals.css`.
- Everything moving sits behind `prefers-reduced-motion: no-preference`; without it the page is static and complete.

## Imagery
- Real photos of small-business owners at work (Unsplash, free licence), warm and daylight, never stock handshakes or piles of cash. Stored as WebP in `assets/img/`, served through `next/image` with blur placeholders; only the hero loads eagerly.
- Photos sit in `rounded-pay`/`rounded-panel` frames with the edge ring. Text over a photo goes on an ink gradient in sand.
- Product shots are built from the real components (Avatar, TrackDots, StatePill, bubbles), not screenshots, so they never drift from the app.

## Icons
One stroke family: 24×24, 1.5px stroke, round caps and joins, `currentColor`.

## Guardrails
`npm run check:design` (also part of `npm test` and CI) enforces this file:
- every text/surface pairing above is checked against WCAG AA using the live values in `app/globals.css`;
- app code may not use raw hex/rgb colours (a hex where code puts a colour; "#2041" in copy is an invoice number, not a colour), off-scale text sizes, Tailwind's default corner sizes or raw `rounded-[…]`, `tracking-*` overrides, `ring-line` on fields, bare marigold text, faint on linen-2, paper panels without their edge, or icon strokes other than 1.5.

Adding a new colour pairing? Add it to `PAIRS` in `scripts/design-check.mjs`. A line that genuinely must break a rule takes a `design-check-ignore` comment saying why.
