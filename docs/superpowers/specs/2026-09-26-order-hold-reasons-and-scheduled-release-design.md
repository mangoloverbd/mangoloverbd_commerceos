# Order Hold Reasons and Scheduled Release

## Goal

Replace the free-text On Hold box with Bengali preset reasons and allow a customer-requested delivery date to automatically return an order to Pending after that date.

## Scope

Apply to staff-managed orders in the `orders` table, across:

- Order Detail status editor;
- order-row status menu;
- Dashboard bulk status actions; and
- Warehouse bulk status actions.

Bulk actions apply one selected hold reason and date to each selected order. Social inbox orders and automated risk holds are not included. Existing risk holds without a scheduled return date remain unchanged.

## Bengali Reasons

Store stable reason codes and render these Bengali labels in the UI:

| Code | Label |
|---|---|
| `customer_requested_after_date` | গ্রাহক নির্দিষ্ট তারিখের পরে পার্সেল নিতে চান |
| `contact_later` | গ্রাহক পরে যোগাযোগ করতে বলেছেন |
| `awaiting_customer_confirmation` | গ্রাহকের নিশ্চিতকরণের অপেক্ষায় |
| `contact_details_change` | ঠিকানা বা ফোন নম্বর সংশোধনের অপেক্ষায় |
| `order_change_requested` | অর্ডার পরিবর্তনের অনুরোধ |
| `payment_confirmation_pending` | পেমেন্ট নিশ্চিতকরণের অপেক্ষায় |
| `advance_payment_pending` | অগ্রিম পেমেন্টের জন্য অর্ডার হোল্ডে রাখা হয়েছে |
| `temporarily_out_of_stock` | পণ্য সাময়িকভাবে স্টকে নেই |
| `courier_delivery_issue` | কুরিয়ার/ডেলিভারি সমস্যা |
| `other` | অন্যান্য |

Choosing “অন্যান্য” shows an optional short detail field. The selected reason and optional detail are internal order information, not customer-facing copy.

## Hold Date and Automatic Release

- A return date is required only for `customer_requested_after_date`.
- The selected date is the last Bangladesh calendar day the order remains On Hold. The date may be today or later, but not in the past according to `Asia/Dhaka`.
- The existing daily maintenance job runs at about 9:15 AM Bangladesh time. On its first run after the selected date, it changes the order to Pending if the order is still On Hold.
- If staff changes the order to another status before then, the scheduled release does nothing. The release operation is idempotent and rechecks the current status/date before writing.
- Preserve the selected reason and detail after automatic release. Record an activity/status-history event as a system action, including the reason and scheduled date.
- Record a hold reason in the same activity entry as each On Hold status change. Render its Bengali label beside the status change; include optional detail and scheduled date when present.
- Reasons without a return date stay On Hold until staff changes the status.

## Data and API Behavior

Add these structured columns to `orders`:

- `hold_reason_code text` for the stable reason code;
- `hold_reason_detail text` for optional “Other” detail; and
- `hold_until_date date` for the optional return date.

Use matching API fields: `hold_reason_code`, `hold_reason_detail`, and `hold_until_date`. Keep the existing general `notes` field unchanged; it is reused in invoices and courier instructions.

When staff moves an order to On Hold through the authenticated order API, validate that the reason is supported and that the date is present exactly when required. Apply the same validation to the reason/date payload from all UI surfaces. Preserve the existing authentication and fixed `org_id` guards.

The maintenance job selects only orders with a scheduled return date that has passed and status `on_hold` (including supported legacy hold aliases where applicable). It updates each row with its `org_id` filter, changes status to `pending`, and records the system status event. It does not release unscheduled, automated-risk, or already-changed orders.

Existing on-hold orders are not backfilled with a reason or a return date. They remain on hold until staff changes them.

## UI Behavior

- In Order Detail, replace the hold-note textarea with a reason picker, conditional “Other” detail input, and conditional required date input.
- In the order-row status menu, selecting On Hold opens the same reason/date flow before saving.
- In the order-row cancellation dialog, show Bengali reason labels and a Bengali empty prompt, and open the reason menu upward. Preserve existing reason codes; keep the label, explanatory copy, note, and buttons in English.
- Dashboard and Warehouse bulk On Hold actions collect one reason/date and apply them to the selected orders.
- Show the saved reason and, when present, the scheduled date while the order is on hold. Preserve the reason in activity history after release.
- Keep general Notes available separately and do not overwrite it with hold metadata.

## Error Handling

- Reject missing/unsupported reasons and invalid date/reason combinations with a clear 400 response; do not change the order status.
- Validate the shared reason/date before starting a bulk request. If invalid, send no updates. If individual requests later fail for operational reasons, report those failures while keeping successful updates.
- A failed or delayed maintenance run leaves due orders unchanged for retry on the next run; each successful order is recorded once.

## Testing

- Unit-test reason-code validation, optional “Other” detail, Bangladesh date rules, and required date behavior.
- UI-test all Bengali options, conditional inputs, individual holds, and bulk holds from Dashboard and Warehouse.
- Route-test authentication, workspace scoping, invalid requests, and status atomicity.
- Test scheduled release for date boundaries, still-On-Hold filtering, risk holds without dates, already-changed orders, retry/idempotency, preserved reason, and system activity history.
- Test that staff holds and automatic releases show the Bengali hold reason in the same activity entry as their status change, and cancellation labels remain Bengali while submitted codes remain unchanged.
- Verify the migration against the canonical Supabase baseline before proposing deployment.
