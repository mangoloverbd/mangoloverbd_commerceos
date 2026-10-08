# Audit: abandoned-source-label

## Files changed
- src/lib/orderSource.ts
- src/components/OrdersTable.tsx
- src/components/order-editor/CustomerPanel.tsx
- src/pages/OrderDetail.tsx
- src/test/orderSourceDisplayLabel.test.ts (new)
- src/test/ordersTableSourceChip.test.tsx
- src/test/customerPanel.test.tsx
- src/components/order-editor/IndividualSmsDialog.tsx (follow-up)
- src/test/individualSmsDialog.test.tsx (follow-up)
- src/test/order-detail.test.ts (follow-up)

## Per file
- src/lib/orderSource.ts: added `isAbandonedCheckoutOrder(source, originSource)` and `orderSourceDisplayLabel(source, originSource)`. "Abandoned" only when origin_source === "abandoned_checkout" AND normalizeOrderSource(source) === "website"; otherwise orderSourceLabel(source). ORDER_SOURCE_OPTIONS unchanged.
- src/components/OrdersTable.tsx: `origin_source?: string | null` on Order; order-source-chip uses the display label and Chip color "rose" for abandoned (rose was unused in ORDER_SOURCE_CHIP_COLORS). Import of orderSourceLabel replaced (no longer used in the file).
- src/components/order-editor/CustomerPanel.tsx: optional `originSource` prop; read-only "Order source" label uses display helper. Icon unchanged (website icon). No editable source select exists in CustomerPanel.
- src/pages/OrderDetail.tsx: `origin_source?: string | null` on local order type; passes `originSource={order.origin_source}`.
- Tests: new unit tests for the helper; OrdersTable chip tests (Abandoned + rose, staff-changed facebook stays Facebook/blue); CustomerPanel label tests.

## Deviations
- Added exported `isAbandonedCheckoutOrder` helper (not in plan) so the chip color and label share one rule instead of duplicating the condition in OrdersTable.

## Skipped
- MobileOrderCards.tsx: does not render order source. Customer-level (CustomerDataTable, MobileCustomerCards) and Returns.tsx skipped per plan. AbandonedCheckoutQueue not touched (abandoned checkouts, not orders).

## Follow-up: SMS amount on order edit page
- OrderDetail.tsx: `amountDue = Math.max(0, roundTaka(totals.finalTotal - clampedAdvance))` from live cart totals; passed as `smsAmount`, with `smsAdvancePaid={clampedAdvance}`.
- CustomerPanel.tsx: optional `smsAmount`, `smsAdvancePaid`; dialog gets `price={smsAmount ?? order.price}` and `advancePaid={smsAdvancePaid}`.
- IndividualSmsDialog.tsx: optional `advancePaid`; quick-insert row labelled "Amount due" when advancePaid > 0, else "Order total". {{total}} = amount passed in.
- Tests: order-detail.test.ts (items ৳700, delivery ৳100, advance ৳200 -> "Please receive" template has ৳600 and "Insert amount due"; no advance -> ৳800 and "Insert order total"); individualSmsDialog.test.tsx label tests. Red run first showed ৳700 (price without delivery).

## Results
- Targeted (6 files incl. follow-up): 76 tests passed. Full `npx vitest run`: 247 files, 1701 tests passed.
- eslint on touched files: exit 0, no output.
- tsc grep: one hit, `OrdersTable.tsx(1112,26) TS2339 missingOrderNumbers` — pre-existing on HEAD (line 1111 in HEAD), not in this diff. Also `order-detail.test.ts(880,94) TS2769` on a pre-existing OrdersTable createElement call (not in my appended block, which starts at line 890).

## Open risks
- Relies on GET /api/orders and GET order detail returning origin_source (select("*")); not verified against the live DB.
