# Steadfast Print Queue Design

## Goal

Keep an order in the Dashboard and Warehouse **Print** queues after it is dispatched to Steadfast, until the merchant manually changes its business status to **Processing**. Terminal courier outcomes remain automatic exceptions.

## Current root cause

Steadfast dispatch already persists `status: "print"`. The shared frontend classifier in `src/lib/orderStatusFilters.ts` currently maps dispatched Steadfast orders to `processing` from courier status, even while their business status remains `print`. Both Dashboard and Warehouse detail use this classifier, so the order disappears from Print in both views.

## Behavior

The shared classifier will apply precedence in this order:

1. Terminal outcomes remain authoritative:
   - Delivered/partial delivered → `delivered`.
   - Cancelled/rejected/returned → `cancelled`.
2. For a dispatched Steadfast order whose business status is `print`, every non-terminal courier state remains in `print`, including Pending, In Review, Pickup Requested, transit/movement states, fraud flags, and courier exceptions.
3. Once the merchant manually changes the business status to `processing`, the existing Steadfast courier classification resumes:
   - Accepted-but-not-moving states → `processing`.
   - Physical movement or delivery assignment → `in_transit`.
   - Fraud or courier exception states → `flagged`.
4. Non-Steadfast and legacy orders retain their existing classification behavior.

The existing Print → Processing transition remains the merchant-controlled handoff and requires no API or schema change. The existing Dashboard and Warehouse views continue to share the same classifier, so both receive the behavior consistently.

## Implementation boundary

- Modify `src/lib/orderStatusFilters.ts` so the `print` business status wins over non-terminal Steadfast classification while preserving terminal precedence.
- Add regression tests in `src/test/orderStatusFilters.test.ts` for dispatched Print orders, terminal courier outcomes, manual Processing handoff, and non-Steadfast behavior.
- No database migration, server route change, or new state field is required.

## Data flow

Steadfast dispatch persists the order with business status `print`, courier identity, dispatch flag, and courier status. Dashboard and Warehouse fetch the order, pass it through `classifyOrderStatus`, and filter/count the result. A manual status update to `processing` changes the classifier input; subsequent courier updates can then move the order into Processing, In-Transit, or Flagged. Terminal courier updates continue to override the business queue status.

## Testing

Unit tests will verify:

- dispatched Steadfast Print orders stay in Print for initial, movement, fraud, and exception courier states;
- delivered, cancelled, and returned outcomes leave Print automatically;
- a manually Processing order is classified from its courier state;
- non-Steadfast behavior remains unchanged;
- status counts and filtering continue to use one bucket per order.
