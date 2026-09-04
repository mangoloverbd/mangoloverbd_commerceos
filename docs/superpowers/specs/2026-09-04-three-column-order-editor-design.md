# Three-Column Order Editor

## Goal

Redesign the existing authenticated order detail page as a three-column order editor inspired by the supplied sales-order reference while preserving Merchant-Suite's current luxury-minimal visual language. The editor must keep the existing safe inventory workflow and add persistent fixed or percentage discounts to individual order items.

## Scope

- Keep the existing `/orders/:id` route and order-row navigation.
- Replace the stacked customer and line-item sections with customer, catalog, and cart columns on wide screens.
- Preserve customer editing, operational order metadata, inventory validation, and courier-dispatch locking.
- Add product search, variant selection, visible product imagery, SKU-like catalog identifiers, weight, stock availability, and cart controls.
- Add persistent per-item discounts in fixed-taka and percentage modes.
- Recalculate item totals, the aggregate order discount, and the net merchandise price on the server.
- Do not add customer reassignment/search, courier-history refresh, upselling, or a multi-step checkout flow in this iteration.

## Layout and Responsive Behavior

The page retains its current header, back navigation, warm off-white surfaces, restrained borders, Geist typography, Phosphor icons, and Framer Motion transitions.

On large screens, the editor uses three independently scrollable columns within the available dashboard height:

1. **Customer and order** — a compact customer summary with an explicit Edit action. Edit mode exposes name, phone, and delivery address with Apply and Cancel controls. Existing status, payment, delivery fee, courier, fraud, timestamps, and consignment details remain visible below it.
2. **Catalog** — a search field followed by product cards. Search matches product name, slug/SKU-like identifier, and variant labels. Each card shows its primary image, price, product weight, available stock, and variant choices. Products without variants have one Add to cart action; products with variants expose each variant with its adjusted price, weight, and stock.
3. **Cart** — one card per draft order item. Cards show image when the catalog reference remains available, name, identifier, selected variant/weight, original unit price, discount state, quantity stepper, remove action, and discounted line total. A sticky summary shows merchandise subtotal, item discounts, preserved legacy order discount when applicable, delivery fee, and final total, followed by Save changes and Cancel.

At narrower widths, the columns stack in customer → catalog → cart order. Controls remain keyboard accessible, touch targets remain usable, and critical actions do not depend on hover.

## Customer Editing

Customer details are read-only by default so the left column stays scannable. Selecting Edit changes only the customer card into an inline form. Apply updates the local draft; the page-level Save changes action persists customer and cart changes together from the user's perspective. Cancel inside the customer card restores the last loaded values, while the page-level Cancel returns to the orders dashboard without saving.

## Catalog and Cart Behavior

- Opening the page loads order detail. The product catalog loads for the middle column through the existing authenticated products API.
- Catalog results are filtered locally for immediate search feedback.
- A catalog product with no variants can be added directly.
- A catalog product with variants is added as the chosen variant. The same product/variant pair cannot appear twice; adding an existing pair increments its quantity.
- Availability is shown from product or variant stock. Existing quantity already reserved by this order is included when determining how far that line may be increased.
- Quantity cannot fall below one. Removing a line removes it only from the draft until Save changes.
- All cart mutation controls are disabled when the order has been dispatched. Customer fields remain governed by the existing endpoint behavior.
- Product images use the catalog's primary image and fall back to a neutral placeholder.
- The identifier displays a real SKU if the catalog gains one, otherwise the existing product slug; when neither exists, it is omitted rather than inventing data.
- Weight comes from the selected variant first and falls back to the product weight.

## Item Discounts

Each editable cart card has an Add discount action. It opens a compact dialog/popover with:

- a mode selector: Fixed amount or Percentage;
- a non-negative numeric value;
- a live preview of the discounted unit price and line total;
- Apply, Remove discount, and Cancel actions.

Fixed discounts are taka off each unit. Percentage discounts are applied to each unit's original catalog price. The server calculates and persists the resulting `unit_discount` amount. Discounts are capped so a unit price can never become negative. Percentage values must be between 0 and 100; fixed values cannot exceed the unit price.

Calculations use:

- gross line total = `unit_price × quantity`;
- line discount = `unit_discount × quantity`;
- net line total = `(unit_price − unit_discount) × quantity`;
- aggregate item discount = sum of line discounts;
- net merchandise price = gross merchandise subtotal − aggregate item discounts − preserved legacy order discount;
- final payable total = net merchandise price + delivery fee.

The existing `orders.discount` remains the aggregate discount used elsewhere in the application. For older orders whose existing order discount is not represented by item rows, the server derives a preserved legacy remainder as `orders.discount − existing item discounts`. Saving new item discounts updates `orders.discount` to the legacy remainder plus the new aggregate item discounts. This prevents unrelated item edits from silently erasing historical discounts.

## Data Model

Add the following fields to `order_items` through a canonical, data-preserving migration:

- `discount_type text null`, constrained to `fixed` or `percentage` when present;
- `discount_value numeric(12,2) not null default 0`, containing the user's entered fixed amount or percentage;
- `unit_discount numeric(12,2) not null default 0`, containing the server-calculated taka discount per unit.

All fields reject negative values. `unit_discount` cannot exceed `unit_price`. Existing rows remain undiscounted, and existing order-level discounts remain preserved through the legacy remainder calculation rather than being guessed or redistributed.

## API and Transaction Flow

`GET /api/orders/:id` continues to authenticate the user, resolve the fixed Mango Lover BD workspace, and return only the matching order and order items. It also returns the new item discount fields. Catalog enrichment supplies display image, slug identifier, product/variant weight, and current stock without allowing the client to choose an organization.

`PATCH /api/orders/:id/items` accepts product ID, optional variant ID, quantity, discount type, and discount value for each line. It validates the request shape and UUIDs before invoking the transactional database operation. Client-supplied unit prices, unit discounts, totals, stock, product names, and workspace IDs are ignored.

The existing `replace_order_items` transaction remains the serialization point. It:

1. locks and verifies the org-scoped order;
2. rejects item changes after courier dispatch;
3. validates product/variant ownership, quantity, and discount constraints;
4. locks affected inventory rows and applies stock deltas;
5. resolves authoritative catalog prices and calculates unit discounts;
6. replaces the order items with snapshot names, prices, and discount fields;
7. recalculates quantity, product summary, aggregate discount, and net order price atomically.

Any validation, inventory, or database failure leaves the order and stock unchanged. Customer-detail saving keeps the current authenticated, org-scoped PATCH endpoint. If one part of the page save fails, the UI surfaces the error and refreshes authoritative order data rather than presenting a partially successful draft as fully saved.

If a preserved legacy discount exceeds the new gross merchandise subtotal, the transaction rejects the cart edit instead of clamping or silently rewriting historical discount data.

## Error and Empty States

- Preserve the current loading, not-found, and API-error states.
- Show a clear empty catalog message and a retry action when product loading fails.
- Show a clear empty-cart state. Saving an empty cart is allowed only when no preserved legacy discount would exceed the resulting zero merchandise subtotal.
- Display detached legacy items, but require the merchant to remove or replace them before saving cart changes because they have no catalog identity that can be repriced safely. Customer-only saves remain available.
- Explain insufficient stock inline/toast and retain the user's draft for correction.
- Keep the existing dispatched-order lock notice visible in both the catalog and cart areas.
- Reject invalid discounts client-side for quick feedback and server-side for correctness.

## Testing

Follow test-driven development and extend the existing order-detail and order-item suites.

Frontend tests cover:

- three-column regions and responsive-safe DOM structure;
- read-only customer summary and Edit/Apply/Cancel behavior;
- product search by name and slug identifier;
- product and variant add-to-cart behavior, including duplicate incrementing;
- image, weight, stock, and variant rendering;
- quantity stepping and removal;
- fixed and percentage discount entry, preview, removal, and validation;
- subtotal, discount, delivery, and final-total calculations;
- save payloads and dispatched-order locking;
- loading, empty, and error states.

API/database tests cover:

- authentication and workspace isolation;
- migration constraints and generated types;
- rejection of malformed, negative, over-price, or over-100 discounts;
- authoritative server-side pricing and discount calculations;
- correct aggregate `orders.discount` and net `orders.price` values;
- preservation of legacy order discounts;
- inventory deltas and rollback on failure;
- courier-dispatch locking.

Completion requires targeted tests, the full Vitest suite, lint, production build, Supabase baseline verification, and a final diff/security review.

## Out of Scope

- Searching for or changing the order's customer identity.
- Refreshing external courier-delivery confidence within the editor.
- Promotional upsell recommendations.
- Editing catalog prices or stock from the order editor.
- A Next-step checkout wizard.
- Applying a new order-wide discount from this page.
