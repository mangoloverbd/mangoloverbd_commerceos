# Steadfast Status Flow Design

## Goal

Make Steadfast orders use the agreed operational meanings for Processing, In-Transit, and Flagged without changing the existing tabs or classification behavior for non-Steadfast orders.

## Behavior

- Steadfast Processing means the courier accepted the consignment but movement has not clearly started. Pending, In Review, Pickup Requested, and Processing courier states belong here. The existing order row continues to expose the consignment ID and tracking data.
- Steadfast In-Transit means the courier has physically moved the parcel or assigned it for delivery. Picked Up, In Transit, warehouse movement, dispatched, assigned to rider, and out-for-delivery states belong here.
- Steadfast Flagged means an exception requiring staff attention. Explicit `status = flagged` and fraud-risk data remain eligible for this bucket, unless the order has already reached a terminal courier state.
- Delivered, Cancelled, On Hold, Approved, Print, Ready To Ship, Pending, and Abandoned remain available. Their existing behavior is preserved for non-Steadfast orders.
- A Steadfast order is identified by `courier_name = "steadfast"`; legacy rows without `courier_name` continue using the existing fallback behavior.

## Data flow

The existing Steadfast dispatch, webhook, and polling routes continue writing `courier_status`, `status`, and `fulfillment_status`. The frontend classifier maps those persisted values into dashboard buckets. No schema change or new API route is required.

## Testing

Add classifier tests covering Steadfast pending/accepted states, Steadfast warehouse movement states, Steadfast fraud flags, terminal-state precedence, and preservation of a non-Steadfast order's existing classification.
