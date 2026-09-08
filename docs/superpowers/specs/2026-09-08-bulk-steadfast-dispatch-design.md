# Bulk Steadfast Dispatch Design

**Status:** Approved by user (2026-09-08)

## Goal

Allow the merchant to select multiple orders in the Dashboard `Print` tab and send them to Steadfast in one bulk API request.

## Agreed flow

1. The merchant opens the `Print` status tab.
2. The merchant selects one or more Print orders using the existing row checkboxes.
3. A `Send to Steadfast` action is available in the existing selection action bar.
4. The server sends the selected orders to Steadfast's native `POST /api/v1/create_order/bulk-order` endpoint.
5. Steadfast returns an item-level result for each submitted order.
6. Successful orders are saved with their consignment and tracking values and move to `processing`.
7. Failed orders remain in Print and are reported by order number/invoice.
8. The request continues for all submitted orders even when individual items fail.

The bulk action is shown only while the `Print` filter is active. It operates on selected rows, not every order in the tab. The existing single-order Steadfast action remains unchanged.

When the Print filter is active, the selection action bar contains exactly: `Selection`, `Send to Steadfast`, `Invoice`, `Print`, `Excel`, `Delete`, and `Clear`. The `Fraud Check` action is not shown in this Print-tab selection bar.

## Steadfast request contract

The Merchant-Suite backend calls:

```text
POST https://portal.packzy.com/api/v1/create_order/bulk-order
```

Headers use the already configured workspace-scoped `Api-Key`, `Secret-Key`, and `Content-Type: application/json` values. The request body is:

```json
{
  "data": "[{\"invoice\":\"ORD-102\",\"recipient_name\":\"...\",\"recipient_phone\":\"017...\",\"recipient_address\":\"...\",\"cod_amount\":860,\"note\":\"...\",\"item_description\":\"...\"}]"
}
```

The backend limits one request to Steadfast's documented maximum of 500 orders. It uses the same invoice construction, Bangladeshi phone normalization, COD calculation, order-item lookup, and item formatting as the existing single-order route. Invoices must remain unique.

## Backend design

Add an authenticated route in `server/index.js` for the dashboard bulk action: `POST /api/send-to-courier/bulk`.

The route must:

- Resolve the current user and fixed Mango Lover BD `orgId`; never accept an organization id from the client.
- Validate a non-empty `orderIds` array with at most 500 entries.
- Load orders using both `.in("id", orderIds)` and `.eq("org_id", orgId)`.
- Treat missing IDs, non-Print orders, and already-dispatched orders as local failures without sending them to Steadfast.
- Normalize and validate every phone number before constructing the request.
- Fetch courier item data with the existing org-scoped helper.
- Call Steadfast once for the locally eligible orders.
- Match response rows to orders by the unique invoice value, not array position.
- Persist successful response rows with `status: "processing"`, `sent_to_courier: true`, `consignment_id`, `tracking_code`, `courier_status`, `courier_message`, and `courier_name: "steadfast"`, always guarded by `id` and `org_id`.
- Trigger the existing dispatch SMS behavior only for successful orders.
- Return this result shape: `{ success: boolean, processed: number, failed: number, succeeded: Array<{ orderId: string, orderNumber: string, order: Order }>, failures: Array<{ orderId: string | null, orderNumber: string | null, reason: string }> }`.

The existing single-order route should retain its current behavior. Shared payload/result helpers may be extracted only if that reduces duplication without changing the route contract.

## Frontend design

Modify `src/components/OrdersTable.tsx`:

- Add a callback prop from `Dashboard` indicating whether the Print filter is active, or pass the active filter through the existing table boundary.
- Add bulk Steadfast state separate from per-row send state.
- Call the new endpoint through `apiFetch()` with `{ orderIds }`.
- Disable the action while dispatch is running and show a spinner.
- Apply returned successful order records through `onOrderUpdate` so the Print list and counts update immediately.
- Clear only successful IDs from the selection; retain failed IDs for correction/retry.
- Show a concise summary with successful count and failed order numbers/reasons. A transport-level failure must leave the selection intact and show an error.

Modify `src/pages/Dashboard.tsx` to pass `isPrintView={statusFilter === "print"}` into `OrdersTable`. The action must not appear for All Orders, Approved, Processing, or other filters.

## Error handling

- Missing Steadfast credentials returns the existing configuration error and no order is changed.
- More than 500 selected IDs is rejected before the external request.
- Orders selected from a stale view are reported as local failures rather than silently omitted.
- Invalid phones are reported per order and are not included in the external payload.
- A non-2xx response or malformed bulk response is a request-level failure; no success updates are applied unless the response can be safely matched and validated.
- Steadfast item-level `status: "error"` results remain in Print.
- Database update errors are reported in the server result and must not be presented as courier success.

## Data isolation and security

All API calls use `apiFetch()` on the frontend. The backend authenticates with `getToken(req)` and `getUser(token)`, resolves the fixed workspace, uses workspace-prefixed settings, and applies `org_id` to every order and order-item read/write. Courier credentials never reach the browser.

No Supabase schema migration is needed. No public storefront or inbox-order behavior changes.

## Testing

Add tests covering:

- The frontend renders the bulk action only in the Print view.
- Selected Print orders call the bulk endpoint with the selected IDs.
- Successful returned orders update to Processing and successful selections clear.
- Per-order failures keep failed IDs selected and show the failure summary.
- The server source contains the authenticated bulk route, 500-item limit, bulk Steadfast path, JSON-encoded `data` payload, and org guards.
- Payload construction uses normalized phone values and the documented `item_description` field.

Run the focused tests, then the full Vitest suite, lint, and production build before completion.

## Non-goals

- No retry automation.
- No automatic send-all action.
- No parallel fan-out of individual courier requests.
- No new database table, column, audit history, or storefront change.
