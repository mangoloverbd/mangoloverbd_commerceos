# Order Detail Editing

## Goal

Allow a merchant to click any dashboard order, inspect it on a dedicated page, and edit its products using the existing product-editing page language. Product changes must update order totals and inventory safely.

## Scope

- Support all existing and future orders.
- Add a dedicated authenticated `/orders/:id` page.
- Allow adding products, removing products, and changing quantities for editable orders.
- Lock product edits after courier dispatch while keeping order details viewable.
- Preserve the existing customer, delivery, payment, fraud, and courier fields.

## Data Model

Add an `order_items` table scoped by `org_id` with:

- `id`, `org_id`, `order_id`
- Optional `product_id` and `variant_id` references
- Product and variant name snapshots
- Unit price snapshot and quantity
- Created and updated timestamps

Existing orders are backfilled into one or more items where their denormalized product text can be interpreted. Uninterpretable historical values remain as a legacy item so no order history is lost. The existing aggregate `orders.product`, `orders.quantity`, and `orders.price` fields remain synchronized for compatibility during the transition.

## API

- `GET /api/orders/:id`: return one org-scoped order with line items and editability metadata.
- `PATCH /api/orders/:id/items`: replace the requested line-item state after validating products, quantities, dispatch state, and totals.

The mutation is authenticated, derives `org_id` from the current workspace, recalculates totals server-side, and updates line items, order aggregates, and inventory atomically. Client-provided totals are ignored.

## UI

- Make order rows navigable to `/orders/:id` without breaking existing inline controls, selection, or bulk actions.
- Build `OrderDetail` using the loading, not-found, save, cancel, and button patterns from `ProductEdit`.
- Show customer/order summary and an editable line-item list.
- Use the existing product catalog to add products and choose variants.
- Disable add, remove, and quantity controls when the order has been sent to a courier.
- Show a clear locked state explaining why edits are unavailable.

## Inventory Rules

- Adding a line reserves the requested stock.
- Increasing quantity reserves only the difference.
- Decreasing quantity releases the difference.
- Removing a line releases its full quantity.
- The transaction fails without changing the order when available stock is insufficient.

## Verification

Test the migration/backfill, org isolation, detail loading, line-item validation, total recalculation, inventory deltas, dispatched-order locking, successful save, and rollback on failure. Run the project test suite, lint, typecheck, and production build.
