# Multi-Item Storefront Order Design

## Goal

Ensure an order containing two different storefront products remains two distinct order lines in Merchant Suite.

## Root cause

The legacy custom-store webhook stores storefront cart contents in the aggregate `orders.product` field. Its routing and persistence path only creates `order_items` when exactly one catalog match exists. Multi-product summaries therefore fall back to one synthetic line in the order detail view.

## Approved behavior

- Parse legacy product summaries into independent product lines, including leading `Nx` and trailing `xN` quantities. Commas inside parenthesized variant attributes are not delimiters.
- Resolve every line against the fixed workspace catalog.
- Persist all lines through the existing `replace_order_items` RPC only when every line has a complete catalog match. The RPC remains authoritative for prices, stock, and item creation.
- Leave unmatched or ambiguous multi-product orders as legacy text rather than linking the wrong inventory.
- When reading an order with no stored `order_items`, render one fallback item per parsed legacy line and allocate the stored order total across the lines while preserving the exact total.
- Keep the canonical public storefront endpoint unchanged because it already inserts every structured item.

## Testing

- Unit test legacy summary parsing for multiple products and quantities.
- Unit test legacy leading quantities and commas inside variant attributes.
- Add wiring assertions that the custom-store webhook persists all complete matches and does not use the single-item-only condition.
- Add order-detail coverage for multiple structured lines and dashboard-list fallback wiring.
