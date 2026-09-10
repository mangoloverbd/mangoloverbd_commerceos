# Pending Order Confirmation SMS Design

## Decision

Send the confirmation SMS immediately after a new pending order is successfully saved. This applies to dashboard orders, storefront webhook orders, and Social Inbox orders. The executive then contacts the customer and confirms the order by phone; changing the order to Approved or Confirmed must not send another confirmation SMS.

## Data flow

- Dashboard and storefront orders use the shared `sendBulkSms(orgId, "confirmation", order)` helper after persistence succeeds.
- Social Inbox orders are stored in `social_inbox_orders`; their phone is currently embedded in the notes field, so the SMS call receives an adapted order object with the extracted phone, contact name, total, and row id.
- SMS submission remains awaited and isolated: a BulkSMSBD failure is logged but does not undo a saved order.
- Dispatch SMS behavior remains unchanged.

## Validation and duplicate prevention

- Do not send from the order status update route.
- Do not send if order or item persistence fails.
- Send at most once per successful create request. Existing Social Inbox deduplication remains in place before insertion.

## Testing

Regression tests will assert the three creation paths call the confirmation helper after persistence and that the status update route does not call it.
