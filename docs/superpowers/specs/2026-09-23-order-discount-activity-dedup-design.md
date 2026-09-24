# Order Discount Activity Deduplication

## Goal

Keep the full Logs view concise when an order-discount change is already fully explained by the corresponding order-total change.

## Behavior

- Hide the generic `Order discount before → after` detail only when the same event has a total change with an exactly equal, opposite discount delta, and no item or other field changes.
- Keep the total before/after and signed delta in the centered summary.
- Preserve discount details when the total delta differs, another field or item also changed, or no total change is present.
- Apply the presentation rule to historical and new events without changing persisted activity data.
- Leave compact activity popovers unchanged.

## Verification

Presentation tests cover the redundant case, a distinct discount change that must remain visible, and full Logs rendering. Compact timeline tests continue to verify the existing before/after table.
