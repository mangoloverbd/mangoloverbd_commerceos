# New Order Customer Autofill Design

## Goal

Help staff create repeat-customer orders faster. When a valid Bangladeshi phone number matches an earlier order, the New Order page fills the customer's name and delivery address from the most recent matching order.

## User Experience

- The lookup starts automatically after the phone number becomes valid.
- While the lookup runs, the rest of the order form remains usable.
- If a previous order is found, only empty name and address fields are filled.
- Text already entered by the operator is never replaced.
- A small confirmation message says that a previous customer was found.
- If there is no match or the lookup fails, the form continues to work normally without autofill.
- Clicking **New customer** clears the phone, name, address, and any previous-customer message.

## Architecture

Add an authenticated customer lookup endpoint to `server/index.js`. It accepts a phone number, normalizes and validates it, resolves the signed-in user's fixed Mango Lover BD workspace, and searches only orders with that `org_id`. The query returns only the latest matching order's customer name and address.

The New Order page calls this endpoint with `apiFetch()` when `normalizeBdPhone()` returns a valid number. The request is keyed by the normalized phone so stale responses cannot populate the form after the operator changes the number.

## Data Rules

- Match normalized Bangladeshi phone numbers, including stored `+880`, `880`, and local `01` forms.
- Prefer the newest matching order by `created_at`.
- Return only `customer_name`, `address`, and enough metadata for the UI to identify a match.
- Never accept an organization identifier from the client.
- Always filter the order query by the resolved `org_id`.

## Error Handling

- Invalid phone input returns a client error and does not query orders.
- No matching order returns a successful response with no customer.
- Server or network errors do not block manual order creation and do not clear existing form values.
- Rapid phone changes must not apply an older request's result to the newer number.

## Testing

- Server tests cover authentication, workspace filtering, phone normalization, newest-order selection, no match, and invalid input.
- New Order page tests cover successful autofill, preserving operator-entered values, no match, request failure, stale responses, and reset behavior.
- Existing order creation and fraud-check behavior must remain unchanged.

## Out of Scope

- Selecting from multiple saved addresses.
- Autofilling products, payment method, notes, or order source.
- Creating a separate customer-address database.
