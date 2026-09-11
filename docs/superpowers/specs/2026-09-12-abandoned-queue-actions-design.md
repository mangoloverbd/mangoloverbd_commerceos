# Abandoned Queue Actions Design (Copy, Edit, Convert)

## Goal

Give Mango Lover BD staff full working power inside the dashboard Abandoned tab:
per-field copy buttons for phone and address, full draft editing like the pending
order editor, and one-click conversion of a draft into a real order in Pending,
On Hold, or Approved status.

This extends the abandoned cart recovery queue (`2026-09-11` spec). That spec's
capture, lifecycle, and privacy rules are unchanged.

## Part 1 — Per-field copy

Each abandoned queue row shows the validated phone number as visible text
(today it exists only inside Call/WhatsApp button labels) and keeps the address
line. A small copy-icon button sits beside each field and copies that field's
raw value via `navigator.clipboard`. The existing Copy-summary button is
unchanged. Copy failures surface the same polite inline status message the queue
already uses.

## Part 2 — Edit draft like a pending order

Each row gains an Edit button opening `AbandonedCheckoutEditDialog`, scoped to
draft fields:

- Contact: customer name, phone, address. Phone must re-validate as an 11-digit
  Bangladeshi number; an invalid phone blocks save.
- Cart lines: product name (required), variant name (optional), quantity
  (integer >= 1), unit price (number >= 0). Lines can be added and removed, but
  saving with zero lines is blocked.
- Delivery rate is editable. Subtotal recomputes from lines; total equals
  subtotal plus delivery. There is no discount field: drafts carry estimates
  only, and discount can be set in the order editor after conversion.

Persistence extends `PATCH /api/abandoned-checkouts/:id` to accept field
updates alongside the existing `contacted` / `dismissed` actions, guarded by
the same bounds as capture validation (bounded item count, string lengths,
quantities, prices, totals; unknown fields rejected). Only `open` and
`contacted` drafts are editable. Edits to a resolved draft (recovered,
dismissed, expired) are rejected with a 409 and the queue refreshes the row
out. All staff routes keep `getToken` / `getUser` auth and the resolved Mango
Lover BD `org_id` filter, including a draft-ownership check before any update.

## Part 3 — Convert draft to a real order

Each row gains a "Move to" menu with Pending, On Hold, and Approved. Choosing a
status opens a confirm dialog showing the captured summary with editable name
and address fields (drafts always have a valid phone; name and address are
optional, and staff just spoke to the customer, so gaps are filled here instead
of creating a junk order). Confirm calls the new
`POST /api/abandoned-checkouts/:id/convert` with `{ status, customer_name?,
address? }`.

Server behavior, in order:

1. Auth + resolved workspace; load the draft and verify it belongs to the
   workspace and is still `open` or `contacted`, else 404/409.
2. Build order items from the draft cart at captured prices (staff-confirmed on
   the call, so no re-pricing). Attempt an exact catalog name match to attach
   `product_id` / `variant_id` for COGS and P&L; fall back to name-only lines
   when there is no match. Matching is case-insensitive on trimmed names, and
   variants match only within the matched product.
3. Create the order through the same path as manual `POST /api/orders`:
   manual order number, warehouse auto-routing, requested status, `phone`
   normalized via `normalizeBdPhone`, and the standard confirmation SMS.
4. Set `orders.abandoned_checkout_id` to the draft and mark the draft
   `recovered` with `resolved_at`. A convert racing an already-resolved draft
   fails closed: no order is created.

After conversion the row leaves the active queue (recovered), the abandoned
count decrements, and a toast shows the new order number. The converted order
behaves like any manual order: counted in All Orders, eligible for courier
dispatch, editable in the order editor. Like all manual orders, creation does
not decrement stock.

## Non-goals

- Automated outreach, bulk convert, or converting a draft into any status
  outside Pending / On Hold / Approved.
- Changing capture, expiry, 30-day scrubbing, or recovery-link reconciliation.
- Editing or converting resolved (recovered / dismissed / expired) drafts.

## Verification

- Unit: phone normalization on edit, totals recomputation, cart-summary and
  copy-summary helpers with edited values.
- Component: per-field copy buttons, edit dialog validation (bad phone, zero
  quantity, negative price, empty cart), convert dialog prefill, resolved-draft
  refresh-out, queue counts.
- Route: convert happy path per status, draft-ownership rejection across
  workspaces, double-convert conflict creating exactly one order, edit bounds
  rejection, no order created when the draft is already resolved.
- Acceptance (synthetic data only): capture a draft, edit contact and cart,
  copy phone and address, convert to each status, confirm each order appears in
  the fulfillment queue with the right status and the draft leaves the Abandoned
  tab.
