# Detailed Order Audit Design

## Goal

Give every order editing surface an inline, readable, append-only history that answers who viewed or changed an order, what changed, why it changed, and how the order originally entered Mango Lover BD.

## Approved product decisions

- The timeline stays inline near the top of each editor, not in a modal.
- Views are meaningful: first view per staff member, then at most once per 30-minute inactivity window.
- Cancelling requires a structured reason and supports an optional note.
- A product or quantity added after creation requires one reason: `upsell`, `customer_request`, `correction`, `replacement`, or `other`.
- All staff with order access can expand exact before/after values.
- One save appears as one grouped timeline event with expandable changes.
- The original creation source is immutable. Later source edits are corrections, not origin rewrites.
- Existing orders receive no inferred historical backfill. Their timeline marks when detailed history began and records complete activity from rollout onward.

## Architecture

Create `order_activity_events`, a service-role-only append-only table. Keep `order_status_events` unchanged as the compatibility source for Staff Performance and pre-rollout status history.

Each detailed event contains:

- `org_id`, `order_table`, and `order_id` for the fixed-workspace guard.
- `event_type` and `category` for filtering and presentation.
- `actor_id` and `actor_kind` (`user`, `customer`, `integration`, `courier_webhook`, or `system`).
- `group_id` so changes from one editor save render as one event.
- `source_surface` such as pending queue, search, customer history, activity log, or direct link.
- `summary`, optional `reason_code` and `reason_note`.
- `changes` as a JSON array of typed before/after changes.
- `metadata` for non-sensitive event-specific context.
- `created_at` and optional `request_id` for idempotency.

The public browser never accesses this table. Authenticated Express routes resolve the current user and Mango Lover BD workspace, then query with `org_id`, `order_table`, and `order_id`.

## Schema

Add `order_activity_events` with these indexes:

1. `(org_id, order_table, order_id, created_at desc)` for inline timelines.
2. `(org_id, actor_id, created_at desc)` where `actor_id is not null` for staff reporting.
3. `(org_id, event_type, created_at desc)` for global Activity Log filters.
4. Unique `(org_id, request_id)` where `request_id is not null` for retry safety.
5. Unique meaningful-view bucket `(org_id, order_table, order_id, actor_id, view_bucket)` for `order.viewed` events.

Enable RLS, revoke `public`, `anon`, and `authenticated`, and grant only `service_role`.

Add immutable provenance columns to order-shaped tables where practical:

- `origin_source`
- `origin_actor_kind`
- `detailed_activity_started_at`

Existing rows remain null. New rows set provenance at creation. The API never exposes provenance columns as editable fields.

Add current cancellation context to regular and inbox orders:

- `cancellation_reason_code`
- `cancellation_reason_note`

These fields clear when an order is reopened, while the append-only cancellation event remains.

## Event model

### Lifecycle

- `order.created`
- `order.viewed`
- `order.edited`
- `order.assigned`
- `order.status_changed`
- `order.cancelled`
- `order.reopened`
- `order.deleted`

### Order contents and money

Changes inside `order.edited` use typed change keys:

- `customer_name`, `phone`, `address`, `notes`, `source`, `warehouse`
- `item_added`, `item_removed`, `item_quantity`, `item_variant`, `item_discount`
- `order_discount`, `delivery_fee`, `payment_method`, `advanced_payment`, `order_total`

Item additions and quantity increases carry `addition_reason`. Upsell value is the retained net value of additions marked `upsell`; later removals, quantity reductions, replacements, and discounts reduce that value.

### Operations

- `fraud.checked`, `fraud.overridden`
- `message.sent`, `message.failed`
- `courier.submitted`, `courier.failed`, `courier.status_changed`
- `document.printed`

The first implementation instruments operations already routed through `server/index.js`; future integrations use the same writer.

## Meaningful views

Opening an order calls a dedicated authenticated endpoint with a server-validated surface value. The server computes a UTC 30-minute bucket and inserts with a unique view key. Repeated opens in the same bucket are no-ops. The response says whether a new event was recorded.

This avoids refresh noise while answering who reviewed an order and from where. No IP address, device fingerprint, or browser identifier is stored.

## Cancellation workflow

Staff cancellations require one code:

- `customer_changed_mind`
- `customer_unreachable`
- `duplicate_order`
- `wrong_product_or_quantity`
- `pricing_issue`
- `delivery_charge_objection`
- `delivery_delay`
- `out_of_stock`
- `fraud_or_suspicious`
- `invalid_contact_information`
- `service_area_unavailable`
- `test_or_fake_order`
- `other`

`other` requires a note. System, courier, and integration transitions may use their own normalized reason without passing through the staff form.

## Grouped saves

The client creates one UUID per Save action and sends it to each existing mutation endpoint. Each endpoint validates the UUID and records its own typed changes using the same `group_id`. Timeline reads group adjacent rows by `group_id` into one expandable event.

This retains the existing validated order and inventory mutations. If a later part of a save fails, successful earlier mutations and their audit rows remain truthful instead of claiming a full rollback.

## Timeline API and UI

The per-order API returns:

- Provenance summary: origin, creator, created time, assignee, last editor, last edit time, and distinct viewer count.
- Grouped detailed events.
- Real pre-rollout status events not duplicated by detailed events.
- A synthetic `history.started` marker for existing orders without detailed history.

The inline component shows provenance first and five newest groups. “View all activity” expands the rest. Each row shows actor, action, timestamp, reason, monetary impact, and an expandable change list.

The global Activity Log shows summaries only. Exact customer values stay inside the order timeline.

## Failure behavior

- A business mutation remains the source of truth.
- Detailed audit insertion retries with an idempotent event ID.
- Critical staff cancellation validation happens before mutation.
- An audit write failure is logged with order and request context and never fabricates an event.
- Timeline reads gracefully fall back to legacy status history if the detailed table is not ready during deployment.

## Rollout

1. Apply the additive migration.
2. Deploy server writers and dual-read timeline APIs.
3. Deploy inline cancellation, addition-reason, provenance, and grouped timeline UI.
4. Verify new creation, view dedupe, grouped edits, cancellation, reopening, and workspace isolation.

No historical activity rows are generated.
