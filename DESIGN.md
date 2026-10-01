# Design: Front desk

Recoup should feel like a capable, warm office manager, not a debt collector and not a finance terminal. People and relationships come first; numbers support them.

## Surface
- Operate mode throughout the app; the customer-facing pay page is a calm, single-task version of the same world.
- Ground is warm sand; content sits on white panels with generous radius. No nested panels.
- Plain-English summaries lead ("Dana usually pays. Just a little late, now and then."), with numbers beside them.

## Color (tokens in app/globals.css)
- sand `#F2EDE3` (ground), paper `#FFFFFF` (panels), linen `#EFE8DA` (quiet fills, chips), line `#E4DBCA`
- ink `#23201B`, ink-2 `#3B362E`, muted `#5E574B`, faint `#7A7263` (only ≥14px, on white or sand)
- teal `#0F5C55` (the single action/brand accent), teal-soft `#E6F0EE`
- marigold `#E8A33D` (attention: overdue, "to send" counts), marigold-soft `#F6D9A6`, marigold-ink `#6B4510`
- rust `#A8321F` (errors, disputes only)
- Primary button: ink fill with sand text. Teal marks selection and positive money (paid, recovered).

## Type
- Display: Bricolage Grotesque 600/700, only for page titles, customer names, and headline money. Tracking -0.03em.
- UI and body: Instrument Sans 400/500/600 for everything else, tabular numerals for money and dates.
- Scale (px): 13 / 14 / 15 (body) / 17 / 22 / 30 / 52.

## Shape and depth
- Panels radius 24px; blocks inside a panel (message previews, notices, hover rows) 16px; controls, including text fields, 14px; chips fully round.
- Panels are flat on sand; the one elevated element per screen (the composer) takes `0 20px 40px -24px rgba(35,32,27,.35)`.

## Components
- Pills for navigation and filters; chips for tags; tone cards (name + one-line description) as radio buttons.
- Track-record dots: teal = on time, marigold = late, marigold ring = still open.
- Story timeline: a 2px linen rail with dots; messages as speech bubbles (ours on linen-white, theirs on linen).
- Premium features: a dashed linen box with a marigold "Premium · soon" chip; hidden entirely when AI is configured.

## Motion
150–200ms ease-out on hover/press and on disclosure. No page-load choreography.
