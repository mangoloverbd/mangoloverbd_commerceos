# Customer profile redesign — state (2026-09-30)

- Page lives uncommitted in .worktrees/customer-profile (feat/customer-profile): src/pages/CustomerDetail.tsx, src/components/customer-profile/CustomerContext.tsx.
- Round 1: restyled into white cards (hero value, tiles, outcome bar, 2-column). Tests 35/35, lint + tsc clean. User rejected the layout.
- Round 2: mockup canvas with 3 directions: https://claude.ai/artifact/9MuLX1Qr9hFX7JVsxEErPK
  A Dossier (identity rail + tabs), B Timeline (single event feed), C Console (next action + orders table).
- Next: user picks a direction (or mix) → implement in the worktree, keep test labels (Internal note, Add note, Manual tags, Save customer context, Reload saved context, Call customer, Create order, Retry, "Delivered order value", "may include copied inbox orders").

## Implemented A (2026-09-30)
- CustomerDetail.tsx rebuilt as rail + tabs (Overview/Orders/Notes/Activity); panels stay mounted so drafts survive tab switches.
- CustomerContext.tsx: notes card first, staff context second (Notes tab two columns).
- Order table switches to columns by card width (Tailwind v4 @container / @2xl), fixing collapsed Products column on narrow screens.
- Tests updated to click the Notes tab + new draft-survives-tab test. Full suite 1759/1759 and build OK before the last table fix; focused 36/36 after.
- Open: on mobile the rail stacks above the tabs (long scroll before tabs).
- Removed lg:sticky from rail (taller than scroll area; could not pin, likely Safari jitter). Chrome frames p95 16.8ms before and after; WebKit not testable here.
- Real double-scroll cause: tablist overflow-x-auto + underline at -bottom-px made it a 41/40px vertical scroller. Removed overflow; only <main> scrolls now (checked 1280 + 390).
- Stacked layout per user: customer card full width on top (identity+actions | details | FraudShield across on xl), tabs below, Overview sections one per row. Double-scroll report still unexplained in real app; asked for console scroller dump.
- Filled customer card gaps (follow-up + needs-handling/latest order in col 1; next step + latest note in col 2, removed from Overview). Notes tab cards equal height. New base/date-picker/date-picker.tsx (single-date, same parts as DateRangePicker) for follow-up date.
- Order editor: 'View customer profile' moved from grey bar into sticky toolbar next to order number as a pill matching Order source chip.
- Shipped: PR #139 squash-merged to main as 507025f (v0.1.0.44). Vercel preview passed before merge.
