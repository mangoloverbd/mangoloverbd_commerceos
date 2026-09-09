# Steadfast Variant Name Fix

## Problem

Orders dispatched to Steadfast from the dashboard can fail during local payload preparation with `readableVariantName is not defined`. The failure affects the bulk dispatch flow used by Print-tab multi-selection and can also affect the single-order dispatch flow because both use the same courier item formatter.

## Design

Define the missing `readableVariantName()` helper beside the existing courier item formatting helpers in `server/index.js`. The helper will produce a readable string for variant values represented as plain text, JSON-encoded text, or attribute objects, returning `null` when no meaningful value exists.

Keep `formatCourierItems()` as the shared formatter for courier item descriptions. Both Steadfast dispatch routes will continue using their existing documented endpoints and payload fields; only the local variant-label formatting behavior changes.

## Error handling

Variant formatting must never throw for null, malformed, or unexpected values. Malformed JSON falls back to the original text. Dispatch validation, workspace guards, credentials, phone normalization, courier requests, and order updates remain unchanged.

## Testing

Add regression coverage that exercises the formatter with representative variant values and verifies the Steadfast dispatch source uses the shared formatter in both single and bulk paths. Run the focused tests, then the full test suite, lint, and production build.

## Scope

This change is limited to dashboard order dispatch through Steadfast. It does not change the Steadfast API contract, database schema, Pathao behavior, inbox-order dispatch, or unrelated working-tree changes.
