# Abandoned Cart Recovery Queue Design

## Goal

Give Mango Lover BD staff a durable, manual-only queue of shoppers who enter a valid Bangladeshi phone number during checkout but do not complete an order. The queue appears as an **Abandoned Carts** tab immediately after **All Orders** in Merchant Suite's fulfillment area.

The feature covers the main storefront cart checkout and these campaign landing pages:

- `/step/sundarbans-natural-honey`
- `/step/kalojira-mixed`
- `/step/honey-nut`

An abandoned checkout is not an order. It never changes inventory, revenue, fulfillment status, order counts, or SMS behavior.

## Approved behavior

### Capture and data flow

1. A storefront checkout creates or updates a draft only after its phone field passes the existing Bangladeshi 11-digit validation.
2. The browser creates one opaque UUID `draft_key` per checkout interaction and retains it in `sessionStorage`. Repeated changes update the same draft instead of creating duplicate rows.
3. After the valid-phone threshold, a shared storefront helper debounces capture updates and also saves on field blur. It retries a failed capture after the next form/cart interaction, browser focus, or return to the network.
4. The main storefront sends its current cart items. Each campaign page sends its selected pack, quantity, price and delivery snapshot. All surfaces also send the current optional name and address, source identifier, and a whitelisted set of campaign parameters.
5. The browser posts only to a same-origin storefront endpoint. A Vercel serverless handler in production and the equivalent local Express route validate the request, then call Merchant Suite with the existing server-only `CUSTOM_ORDERS_API_KEY`.
6. Merchant Suite resolves the fixed Mango Lover BD workspace from that API key and upserts the draft under its resolved `org_id`. The browser never receives an API key and never supplies an organization identifier.
7. A successful existing `/api/orders` request includes the optional draft key through the same secret-backed path. After the real order, order items, and inventory operation succeed, Merchant Suite marks the linked draft as recovered and removes it from the active queue.
8. A missing, invalid, stale, or already-resolved draft key never prevents a valid order from being placed. Recovery-link failures are retried by reconciliation; they must not turn an already-persisted order into an apparent checkout failure.

The abandonment draft key is distinct from the proposed client session signal in the separate server-side order-protection work. Neither feature depends on the other.

### Data model

Merchant Suite owns a new `public.abandoned_checkouts` table. It is not represented as an `orders` row or order status and is accessible only through Merchant Suite server routes.

| Field | Purpose |
| --- | --- |
| `id` | Server-generated UUID primary key. |
| `org_id` | Required fixed Mango Lover BD workspace guard. |
| `draft_key` | Browser-generated opaque UUID; unique with `org_id` for idempotent capture. |
| `status` | `open`, `contacted`, `dismissed`, `recovered`, or `expired`. |
| `customer_name`, `phone`, `address` | Latest captured partial checkout data; nullable except that a new draft has a validated phone. |
| `cart` | Structured JSON snapshot of items, product/variant labels, quantities, and captured prices. It is descriptive only, never an inventory reservation. |
| `subtotal`, `delivery_rate`, `total` | Numeric captured estimates for staff context. |
| `source` and `source_path` | Main storefront or one of the three campaign pages, plus the fixed route path. |
| `campaign` | Whitelisted UTM/campaign metadata only; no arbitrary query-string persistence. |
| `contacted_at`, `resolved_at`, `resolution` | Manual follow-up and terminal-state audit timestamps/reason. |
| `expires_at` | Fixed at 30 days after first capture; client updates cannot extend it. |
| `created_at`, `updated_at` | Standard audit timestamps. |

`orders` gains an optional, workspace-scoped `abandoned_checkout_id` relationship. Merchant Suite verifies that the referenced draft belongs to the resolved `org_id` before inserting it. That durable association lets a maintenance pass reconcile a draft if the post-order state update was interrupted.

The migration creates the supporting composite workspace relationship and indexes for `(org_id, status, expires_at)` and `(org_id, created_at desc)`. RLS is enabled on `abandoned_checkouts`; `anon` and `authenticated` receive no direct table grants or policies. Merchant Suite's service-role routes retain explicit `org_id` filters on every query.

### API boundary

The storefront gains a same-origin `POST /api/abandoned-carts` endpoint. Its payload is small, bounded, and schema-validated:

- UUID draft key;
- allowed source and fixed source path;
- bounded line items, quantities, prices, and totals;
- optional bounded name and address;
- a normalized valid phone number;
- whitelisted campaign metadata.

The handler rejects unknown fields and oversized or malformed payloads, rate-limits capture, and forwards only validated data to a new private Merchant Suite custom-store endpoint authenticated by `x-api-key`.

Merchant Suite exposes these authenticated dashboard routes:

- `GET /api/abandoned-checkouts` for active drafts and their active count;
- `PATCH /api/abandoned-checkouts/:id` for allowed staff state transitions;
- an internal custom-store upsert route used only by the storefront server;
- existing custom-order submission wiring extended with an optional draft key for recovery.

Dashboard routes use `getToken(req)`, `getUser(token)`, and the resolved Mango Lover BD `org_id`. They never trust a route parameter or browser field as a workspace identifier.

### Dashboard queue

Merchant Suite adds **Abandoned Carts** after **All Orders** in the existing tab row. Its count is the number of active `open` and `contacted` records only. It is deliberately outside `ORDER_STATUS_FILTERS`, so existing order classification, All Orders counts, status tabs, warehouse filters, courier actions, and analytics remain unchanged.

Selecting the tab replaces `OrdersTable` with a dedicated responsive abandoned-checkout queue. It shows:

- captured time and source;
- customer name when available and the validated phone number;
- address preview when available;
- products, variants, quantities, and captured estimated total;
- `New` or `Contacted` state.

Staff can:

- call the customer with a `tel:` link;
- open a manual WhatsApp conversation with a normalized `wa.me` link;
- copy the captured checkout summary;
- mark the record contacted;
- dismiss the record after a confirmation step.

The queue supports search by name, phone, product, and source. New records sort before contacted records. Recovered, dismissed, and expired records are archived rather than shown in the active queue. There is no v1 action to turn a draft into an order, send a message automatically, dispatch a courier, run fraud checks, or bulk-edit real-order statuses.

### Lifecycle, privacy, and resilience

- The feature is manual-only. It sends no recovery SMS, automated WhatsApp message, email, additional Meta event, or advertising audience update. Call and WhatsApp links are staff actions only; existing storefront purchase tracking remains unchanged.
- A short, non-blocking checkout notice explains that incomplete checkout details may be saved so the team can assist. The storefront privacy information is updated to describe this purpose and 30-day retention.
- A daily authenticated Merchant Suite maintenance pass marks expired drafts and clears personal fields no later than `expires_at`. It keeps only minimal, non-contact audit metadata needed for recovery outcomes and the durable order relationship. It does not alter the personal data retained on a completed real order.
- Recovered and dismissed drafts leave the active queue immediately. A recovered record is linked only after the real order is durably created; it never creates a duplicate order or changes an order's normal lifecycle.
- Draft-capture failure is non-blocking. The shopper can still order successfully; actual price, stock, and order validation always come from the existing checkout path.
- Draft-capture code must not send customer identity, address, phone, or cart contents to Google Analytics, Meta, PostHog, route URLs, API query strings, browser logs, or server logs. A staff-initiated `wa.me` link is the only phone-in-URL exception. Existing successful-purchase tracking remains unchanged. Error logging uses redacted identifiers and error categories only.

## Non-goals

- Recording anonymous add-to-cart events as recoverable leads.
- Treating an abandoned checkout as an `orders` row or fulfillment status.
- Automatic SMS, WhatsApp, email, or retargeting campaigns.
- Converting a draft directly into a real order from the queue.
- Reserving inventory or promising a captured price.
- Replacing the existing order-protection, checkout, fraud, courier, or customer-management flows.

## Verification

### Storefront

- Unit-test payload shaping, draft-key persistence, valid-phone capture, retry behavior, and customer-data exclusion from analytics.
- Cover the main cart checkout and all three campaign checkout forms.
- Test Vercel and local server handlers against the same validation and forwarding behavior.
- Verify no secret or organization identifier is exposed in browser code.
- Verify a normal checkout still succeeds if draft capture is unavailable.

### Merchant Suite

- Test migration constraints, service-role-only access, workspace-scoped queries, input validation, rate limiting, and idempotent upsert behavior.
- Test allowed lifecycle transitions: `open → contacted`, `open/contacted → dismissed`, `open/contacted → recovered`, and expiry from every unresolved state.
- Test that a successful custom-store order links and recovers the matching draft only after the order/item persistence path succeeds.
- Test reconciliation when recovery status update fails after an order is persisted.
- Test 30-day cleanup scrubs personal fields while leaving real orders unchanged.
- Test tab placement after All Orders, separate count behavior, search, call/WhatsApp/copy actions, dismiss confirmation, and mobile rendering.

### End-to-end acceptance

Using synthetic data only:

1. Enter a valid phone in each checkout surface and confirm one active draft appears in the Abandoned Carts tab.
2. Change pack/cart data and confirm the existing draft updates rather than duplicating.
3. Mark a draft contacted and dismiss another; confirm both leave or remain in the expected active state.
4. Complete a real order from a captured draft; confirm it appears as a normal order and the draft is recovered rather than counted as an active abandonment.
5. Advance a test record beyond 30 days; confirm the active queue excludes it and its personal fields are scrubbed.
6. Confirm no production customer data or real orders are created during QA.
