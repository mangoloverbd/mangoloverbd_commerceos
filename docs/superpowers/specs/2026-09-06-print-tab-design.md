# Print Tab Design

**Status:** Approved by user (2026-09-06)

## Goal

Add a `Print` step between `Approved` and `Processing` in the Dashboard Fulfillment Queue. Print is a manual waiting queue: only orders moved by hand from Approved appear there. Sending those orders to courier moves them to Processing. If all Print orders are sent, Print shows 0 / empty.

## Agreed flow (simple)

1. Approved —by hand only→ Print.
2. Print —auto on Steadfast/Pathao send→ Processing.
3. Print can go back to Approved or to On Hold by hand.
4. Print can go to Cancelled by hand (courier cancel/return still wins automatically, as today).
5. You cannot send to courier directly from Approved. You must move to Print first. This rule applies everywhere (Dashboard table + Order Detail page + any bulk send).
6. Old Processing orders that skipped Print stay as-is (grandfathered, no backfill).
7. Being in Print is enough to allow courier send. No forced proof that Invoice/Sticker was clicked.
8. Print uses the existing Invoice + Shipping sticker buttons. No new combined print format.

## Tab order and label

Order: All Orders, Pending, On Hold, Approved, Print, Processing, Ready To Ship, In-Transit, Delivered, Flagged, Cancelled.

- Label decision: user confirmed existing Invoice + Sticker buttons stay. Tab label stays `Print` (short).
- Print gets its own status dot color (pick at implementation time, must differ from Approved sky and Processing violet).
- Counts stay mutually exclusive: the ten operational counts sum to All Orders.

## Entry rule (strict)

- ONLY `Approved` (business status approved/confirmed) can be moved to Print.
- Moving from Pending, On Hold, or any other status to Print is rejected with a clear error ("Only Approved orders can move to Print").
- Print membership is explicit (real `status` value), never auto-filled from courier/fulfillment/fraud signals. This is what guarantees "only orders moved from approved, no other orders".

## Exit rules

- Courier send (Steadfast `/api/send-to-courier`, Pathao `/api/send-to-pathao`) on a Print order succeeds and the order becomes Processing (existing processing classification via sent-to-courier + early courier state, or explicit business status update at send time — implementation plan to pick one and keep both couriers consistent).
- Courier send on an Approved order is rejected everywhere with a clear error ("Move to Print first").
- Manual move Print → Approved allowed; Print → Cancelled allowed. Print → Pending/others not allowed.
- Cancelled/Delivered precedence from the current classifier stays: a Print order that gets cancelled/delivered downstream shows under Cancelled/Delivered, not Print. This keeps terminal states truthful.

## Empty-Print rule (user requirement)

Print is a flow-through queue, not a home. Every successful courier send removes that order from Print. Sending all Print orders → Print count is 0 and the filtered table shows the normal empty state.

## Printing behavior (no change)

- Keep current `printInvoice` (A4 invoice) and `printShippingLabels` (sticker) actions as-is.
- Clicking them does NOT change status. Status only changes via explicit move (Approved→Print, Print→Approved/Cancelled) or successful courier send (Print→Processing).
- Bulk selection + search + warehouse filter + pagination compose with the Print filter exactly like other statuses.

## Scope

- Frontend: add `print` to `ORDER_STATUS_FILTERS`, classifier, segmented control (position 5th), status dropdowns/actions (Dashboard table + Order Detail), block courier buttons for Approved with helpful message.
- Backend (`server/index.js` domain sections): validate transitions in `PATCH /api/orders/:id`; enforce Print-only entry and Approved→courier block in Steadfast + Pathao main-order send routes; inbox-order courier routes unchanged (separate social-inbox flow, no Approved/Print concept). Keep `org_id` guard + auth guards unchanged.
- No schema migration: `orders.status` is already free text. No new column. No storefront/public-API change.

## Non-goals

- No print-history/audit column (`printed_at`, `printed_by`) in this step. Add later only if merchant asks.
- No auto-move on Invoice/Sticker click.
- No change to fraud/Flagged logic, P&L analytics, Shopify auto-sync payload (sync must not overwrite an explicit Print status — plan to cover).
