# Extracted Order Numbering & Ordering Fix — Design

**Date:** 2026-06-18
**Status:** Approved (design phase)

## Problem

Two issues on the orders list, both rooted in how extracted (manually-created) orders are numbered and sorted today:

1. **Extracted orders always clump at the top.** When an order is created from the Order Extraction page, it appears above all Shopify-synced orders instead of in chronological position. Root cause: `GET /api/orders` sorts by the `order_number` column as **text, descending** (`server/index.js:3512-3537`). Extracted order numbers look like `MAN-1718700000000` (prefix `M`, ASCII 77); Shopify order numbers look like `#1001` (prefix `#`, ASCII 35). Since `M` > `#`, every extracted order sorts above every Shopify order regardless of when it was created. (Latent side bug: text sort also mis-orders Shopify numbers past 3-4 digits — `#999` shows above `#1001`.)
2. **Extracted order numbers are too long.** Extracted orders get `order_number = "MAN-" + Date.now()` (`server/index.js:3587-3590`), e.g. `MAN-1718700000000`. Shopify orders get the clean `#1001` from Shopify's `order.name`. The user wants extracted numbers to be short and Shopify-like (e.g. `#6696`), while remaining visually distinguishable from Shopify orders.

## Goals

- Extracted order numbers are short (`#M-<n>`), per-org sequential, and distinguishable from Shopify `#<n>` numbers.
- The orders list reflects when each order entered the system (newest first), with extracted and Shopify orders interleaved by recency — no source-based clumping.
- Existing `MAN-<timestamp>` rows are migrated to the new format so the table is consistent.

## Non-Goals

- No new DB column (no `source` column). Source distinguishability stays via the `#M-` prefix and the negative `shopify_order_id` sign, consistent with the current design.
- No change to the extraction endpoint itself (`POST /api/extract-order-from-text` still returns structured data only; numbering happens at order creation).
- No change to "actual order date" semantics — we sort by system-entry time (`created_at`), not by when a Shopify order physically occurred. (Acceptable because Shopify syncs in this project pull recent orders, not bulk backfills.)

## Design

### 1. Order number generation

Add a helper `getNextManualOrderSeq(orgId)` in `server/index.js`:

- Reads `<orgId>:manual_order_seq` from `app_settings` (using the existing `getSettings`/`saveSettings` org-scoped pattern).
- Atomically increments via a conditional `UPDATE app_settings SET value = value + 1 WHERE key = $orgKey AND value = $old RETURNING value`, retrying on conflict so two near-simultaneous creations can't both claim the same sequence number.
- Falls back to `1` (initializing the row) if no counter exists yet.

In the `POST /api/orders` creation path (`server/index.js:3587-3590`), replace:

```js
if (!row.order_number) row.order_number = `MAN-${Date.now()}`;
```

with:

```js
if (!row.order_number) row.order_number = `#M-${await getNextManualOrderSeq(orgId)}`;
```

The negative `shopify_order_id` logic stays as-is — still needed to satisfy the `BIGINT UNIQUE NOT NULL` constraint without colliding with real (positive) Shopify IDs.

### 2. Ordering fix

In `GET /api/orders` (`server/index.js:3512-3537`), change:

```js
.order("order_number", { ascending: false })
```

to:

```js
.order("created_at", { ascending: false })
```

This puts the most recently created/synced order first, regardless of source, interleaving extracted and Shopify orders by system-entry time. It also fixes the latent string-sort bug on Shopify numbers. No frontend change is needed — `OrdersTable` renders the server-provided order as-is (`src/components/OrdersTable.tsx:1066`), and `Dashboard.tsx` only filters, never re-sorts.

### 3. Migration of existing `MAN-<timestamp>` orders

Add an idempotent startup migration `migrateManualOrderNumbers()` alongside the existing cold-start migrations (`migrateInboxOrdersTable`, `migrateMultiTenancy` in `server/index.js`).

For each org that has rows matching `order_number LIKE 'MAN-%'`:

1. Select those rows ordered by `created_at ASC`.
2. Renumber them in place to `#M-1`, `#M-2`, … preserving their chronological order.
3. Set `<orgId>:manual_order_seq` to `count + 1` so subsequent new extractions continue the sequence without collision.

Idempotency: once renumbered, rows no longer match `MAN-%`, so re-runs are no-ops.

### 4. Number format

`#M-<n>` (e.g. `#M-1`, `#M-2`, …), starting at 1 per org. Short, clean, and visually distinguishable from Shopify's `#1001`.

## Affected Files

| File | Change |
|---|---|
| `server/index.js` | Add `getNextManualOrderSeq()` helper; change order-number generation in `POST /api/orders`; change sort in `GET /api/orders`; add `migrateManualOrderNumbers()` startup migration and register it with the other cold-start migrations. |

No frontend, schema, or settings-page changes.

## Testing

- Unit/integration: creating two extracted orders in rapid succession yields consecutive `#M-n` numbers with no duplicate.
- `GET /api/orders` returns rows ordered by `created_at` desc (extracted and Shopify interleaved by recency).
- Migration: a `MAN-<timestamp>` row becomes `#M-1` after cold start; running the migration again is a no-op; new extractions after migration continue from `count + 1`.
- Multi-tenancy: sequence counters are org-scoped — org A's `#M-1` does not affect org B.

## Risks

- **Counter race condition:** mitigated by the conditional `UPDATE ... RETURNING` with retry. Acceptable for this workload; if contention ever appears, escalate to a Postgres sequence (Approach C from brainstorming).
- **Migration safety:** the startup migration only touches rows still matching `MAN-%`; it is idempotent and re-runnable. Org-scoped so it cannot cross tenants.
