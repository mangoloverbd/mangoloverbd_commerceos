# Merchant Dashboard Courier Search Design

## Goal

Make the Merchant Suite order search find orders by customer name, phone number, order number, Steadfast consignment ID, or Steadfast tracking code.

## Design

Keep the existing single search input and client-side filtering flow. Extract matching into a small pure helper that normalizes the query and checks each searchable order field. Missing courier identifiers are treated as empty values, so older orders continue to work without special handling.

Search remains case-insensitive and substring-based, matching the current behavior for names, phones, and order numbers. Both numeric consignment IDs and text tracking codes are converted to strings before matching.

Update the input placeholder to communicate that courier identifiers are included. No database, API, schema, or pagination changes are needed because the dashboard already receives `consignment_id` and `tracking_code` on order rows.

## Testing

Add pure helper tests covering name, phone, order number, consignment ID, tracking code, case-insensitive matching, substring matching, and missing courier values. Add a dashboard wiring assertion proving the helper is used by the existing search flow and run the full Merchant Suite test/build checks.
