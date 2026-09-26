# Require Customer Details Before Order Approval

## Goal

Prevent an order from entering Approved unless it has a customer name, phone number, and delivery address.

## Scope

Apply the rule to all staff-controlled approval paths:

- `PATCH /api/orders/:id` when an existing order transitions into Approved (`approved` or `confirmed`);
- `POST /api/orders` when a manual order is created directly as Approved;
- `POST /api/abandoned-checkouts/:id/convert` when an abandoned checkout is converted to Approved.

Only nonblank values are required. For the name, `customer_name` may fall back to `contact_name`. Existing phone normalization/validation rules remain in effect. Pending and On Hold actions are unchanged.

## Behavior

- The server is authoritative for all three paths and checks before changing status or inserting an order.
- Missing fields return HTTP `400`, code `approval_customer_details_required`, the missing field names, and a message staff can understand.
- A failed abandoned-checkout conversion leaves the checkout active and available to edit and retry.
- Existing forms continue to validate their fields; the API guard prevents bypassing those checks.

## Testing

- Unit-test missing-field detection, trimming, and the `contact_name` fallback.
- Cover each server approval path and confirm non-approval statuses remain unaffected.
- Verify abandoned conversions with missing details do not proceed and the dashboard keeps failed checkouts selected while showing the server message.
- Run focused tests, the full test suite, lint, and production build.
