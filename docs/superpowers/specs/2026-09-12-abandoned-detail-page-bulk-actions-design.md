# Abandoned Detail Page and Bulk Actions Design

## Goal

Make the Abandoned tab work like the rest of the fulfillment queue: clicking a
checkout opens a full edit page mirroring `/orders/:id`, and selecting rows
enables an Update Status button with the same styling as the orders toolbar.

This extends the abandoned queue actions spec (`2026-09-12`). Capture,
lifecycle, privacy, edit validation, and convert semantics are unchanged.

## Part 1 — Abandoned detail page

New route `/abandoned/:id` rendering `AbandonedDetail`, registered in
`src/App.tsx` next to `/orders/:id` as a protected route inside
`DashboardLayout`.

The page reuses the order-editor panels, not a copy of them:

- `CustomerPanel` as-is for name, phone, and address.
- `CatalogPanel` as-is for browsing catalog products. A catalog pick drops in
  as a name/variant/price line; catalog ids are not stored on drafts.
- `CartPanel` with draft-inapplicable slots hidden: no discount controls, no
  in-editor status changer, no notes or courier sections. Quantity, remove,
  delivery rate, and save stay.

State initializes from the draft; save calls the existing staff-edit
`PATCH /api/abandoned-checkouts/:id` body (no `action` key), so server
validation is identical to the dialog today. After save the page stays put,
refreshes the `["/api/abandoned-checkouts"]` cache, and toasts
"Checkout updated". A 404/409 surfaces "Checkout is no longer active" and
navigates back to the dashboard with the Abandoned tab selected.

Data loading reads the draft from the abandoned queue cache and refetches the
list when the cache is empty (direct-URL entry). A draft that is missing or
resolved renders a not-found state mirroring OrderDetail ("Checkout not
found." plus "Back to orders"). The header back button returns to `/` with the
Abandoned tab selected.

Row clicks in `AbandonedCheckoutQueue` navigate to `/abandoned/:id`.
Interactive descendants (checkboxes, buttons, links, copy icons) stop
propagation and keep their current behavior. All existing per-row quick
actions (Call, WhatsApp, Copy, Edit, Move-to, Dismiss) stay as-is.

## Part 2 — Bulk selection and Update Status

Queue rows gain checkboxes matching the orders table checkbox look, plus a
select-all control for the visible filtered queue. Selection lives in
`Dashboard.tsx` state (`selectedAbandonedIds: Set<string>`) and clears on tab
switch.

The dashboard toolbar renders an Update Status button in abandoned mode with
the identical styling: sky `PopButton`, `UpdateStatusIcon`, caret, and popover
menu (`data-testid="button-bulk-abandoned-status"`, menu
`data-testid="bulk-abandoned-status-menu"`). It is disabled while a bulk run
is in flight or nothing is selected. Menu items:

- Mark contacted → one PATCH per selected draft, skipping already-contacted
  rows in the summary count.
- Move to Pending / On Hold / Approved → one convert call per selected draft
  in row order, reusing the convert endpoint and its fail-closed guarantee.
- Dismiss → opens the existing dismiss confirm dialog listing the count;
  confirm dismisses each selected draft.

Bulk runs are sequential and tolerant: each draft is attempted, successes
update the cache incrementally, and the run ends with a summary toast
("3 orders created, 1 failed" / "4 checkouts marked as contacted"). Failed
drafts stay selected so staff sees what needs attention; a 404/409 on a draft
refreshes it out of the queue. After the run the abandoned cache and the
orders query refresh. The existing single-row actions are untouched.

## Non-goals

- Bulk convert with per-draft name/address overrides (bulk uses captured
  values; staff refines via the detail page or order editor).
- Discount, notes, courier, or status editing inside the detail page.
- Changing capture, expiry, scrubbing, recovery linkage, or convert pricing.

## Verification

- Component: row click navigates; interactive descendants do not; select-all
  and per-row checkboxes; bulk button disabled states.
- Page: detail renders from cache and from direct URL; not-found state;
  save persists via PATCH and refreshes cache; resolved-draft save
  navigates back with notice.
- Dashboard: bulk contacted/dismiss/convert flows, partial-failure summary,
  failed rows stay selected, queues refresh, menu styling matches the orders
  toolbar.
- Route: auth guard on `/abandoned/:id`; draft-ownership 404s for other
  workspaces (no new server routes are added by this change).
- Acceptance (synthetic data only): open a draft from the queue, edit and
  save on the page, select several drafts, bulk-convert to each status, and
  confirm orders land in the fulfillment queue with the drafts gone.
