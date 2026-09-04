# Custom Store Order Linking Design

**Problem:** Orders received by `POST /api/custom-orders/webhook` contain legacy product text but no `order_items` catalog references. The order editor therefore cannot show product images or safely save the cart even when the catalog product and variant exist.

## Approved behavior

- Resolve product text only against products in the fixed Mango Lover BD workspace.
- Accept a product only when the most-specific textual match is unique.
- For products with variants, accept the catalog link only when the variant is unique or its attribute values uniquely match the incoming text.
- Preserve unmatched or ambiguous orders as detached legacy lines instead of linking the wrong inventory row.
- For future matched webhook orders, call the existing `replace_order_items` RPC after creating the order. The RPC remains authoritative for price, stock validation, inventory decrement, and item creation.
- If the RPC fails, delete the just-created order and return an error. Do not send confirmation SMS for an order whose inventory reservation failed.
- For historical orders without `order_items`, resolve the same unique match when the order detail is read. This virtual match supplies catalog IDs and image data but does not claim inventory was previously reserved; the first cart save performs the real transactional reservation.
- Keep authentication behavior, API-key workspace lookup, `org_id` guards, courier locking, and server-authoritative pricing unchanged.

## Data flow

```text
custom website webhook
  -> API key resolves fixed workspace
  -> legacy text matcher
       -> unique product + variant: create order -> replace_order_items RPC
       -> ambiguous / unmatched: create legacy order without inventory mutation
  -> confirmation SMS only after successful persistence

historical order detail
  -> authenticated workspace-scoped order lookup
  -> no stored order_items
  -> same legacy text matcher
       -> unique match: virtual editable line + catalog image/current stock
       -> ambiguous / unmatched: detached legacy warning
```

## Non-goals

- No remote migration or bulk historical inventory adjustment.
- No fuzzy or AI-based product matching.
- No arbitrary organization identifier accepted from the website payload.
- No storefront repository changes.
