# Steadfast Dispatch Keeps Orders in Print

## Goal

After an order is successfully sent to Steadfast, keep its business status as
`print` so the team has time to print the shipping label. The consignment ID
and courier tracking metadata must remain visible while the order is in Print.
The team can later manually move the order to `processing`.

## Design

- The single-order Steadfast endpoint will persist `status: "print"` on
  successful dispatch.
- The bulk Steadfast endpoint will persist `status: "print"` for every
  successful dispatch.
- Both endpoints will continue persisting `sent_to_courier`, `consignment_id`,
  `tracking_code`, `courier_status`, `courier_message`, and `courier_name`.
- The business-status transition rules will allow `print -> processing`.
  Existing restrictions for entering Print and other Print exits remain.
- The OrdersTable status menu and bulk transition planner will expose and allow
  `processing` for Print orders.
- Pathao dispatch behavior is unchanged.

## Error handling and isolation

Courier failures do not change the business status. Existing authentication,
fixed workspace resolution, and `org_id` filters remain unchanged. No schema
change is required.

## Verification

Tests will cover:

1. Single and bulk Steadfast source wiring keeps successful orders in Print.
2. A dispatched order is classified into the Print tab while its business
   status is Print.
3. Print orders can be manually transitioned to Processing through the shared
   transition helper and server guard.
