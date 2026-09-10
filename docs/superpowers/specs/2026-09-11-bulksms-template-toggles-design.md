# Bulk SMS Template Toggles Design

## Decision

Add independent on/off controls for the Order Confirmation Template and Order Dispatch Template in the Bulk SMS BD settings section. The existing global Bulk SMS switch remains the master control.

## Settings and compatibility

Use the existing org-scoped `app_settings` key-value store with two new keys:

- `bulksms_confirmation_enabled`
- `bulksms_dispatch_enabled`

The settings API already accepts the Bulk SMS settings payload, so no database migration is required. A missing per-template key is interpreted as enabled. This preserves current behavior for existing Mango Lover BD settings until the user explicitly turns a message type off.

## UI

Within the enabled Bulk SMS configuration panel, place a Switch beside each template label. The switches load from `/api/settings`, update local state, and save through the existing `/api/settings` endpoint. The confirmation switch controls confirmation messages; the dispatch switch controls dispatch messages. The global switch continues to hide the configuration panel and disables all SMS when off.

## Backend behavior

`sendBulkSms(orgId, type, order)` will load both flags and return early when the flag matching `type` is exactly `"false"`. All existing creation and courier dispatch paths continue to call this helper, so the toggle behavior is consistent across dashboard, storefront, Social Inbox, Steadfast, and Pathao flows. Other SMS formatting, recipient normalization, awaiting, and BulkSMSBD response handling remain unchanged.

## Testing

Add regression coverage for backend flag selection and missing-key compatibility. Update the Bulk SMS settings UI test to verify both switches render and that the saved payload includes both flags. Run the full Vitest suite, lint, build, and `git diff --check`.
