# Bulk SMS BD Integration Design

## Overview
Integrate Bulk SMS BD to automatically send SMS notifications to customers during order creation (via the custom website webhook) and order dispatch (when sent to Steadfast/Pathao). The configuration will be isolated per tenant.

## 1. Storage & Configuration
Store the following settings in `app_settings` (scoped by `org_id`):
- `bulksms_api_key`: API key for Bulk SMS BD.
- `bulksms_sender_id`: Approved Sender ID from Bulk SMS BD.
- `bulksms_enabled`: Boolean string (`"true"`/`"false"`) to toggle the service.
- `bulksms_confirmation_template`: Text template for order confirmation.
- `bulksms_dispatch_template`: Text template for dispatch.

## 2. Frontend Interface (`Settings.tsx`)
Add a new "Bulk SMS Integration" card to the Settings page:
- Toggle switch for `bulksms_enabled`.
- Input fields for API Key and Sender ID.
- Textareas for the Confirmation Template and Dispatch Template.
- Helper text clearly listing supported placeholders: `{customer_name}`, `{order_id}`, `{price}`, `{delivery_fee}`, `{courier_name}`, `{tracking_code}`.

## 3. Backend Logic (`server/index.js`)
- Add a new helper `sendBulkSms(orgId, eventType, orderData)`.
- **Flow:**
  1. Fetch `bulksms_*` settings for the `orgId`.
  2. If `bulksms_enabled` is missing or not `"true"`, or if `api_key`/`sender_id` are missing, exit silently.
  3. Select the template based on `eventType` ('confirmation' or 'dispatch').
  4. Replace placeholders with properties from `orderData`. Missing properties default to empty strings.
  5. Clean the customer phone number using the existing `normalizeBdPhone()` function.
  6. Encode the message using `encodeURIComponent()`.
  7. Make a non-blocking (fire-and-forget) `fetch` GET request to `http://bulksmsbd.net/api/smsapi?api_key=...&type=text&number=...&senderid=...&message=...`.
  8. Log the request and response internally for debugging, but catch all errors to avoid disrupting the main request flow.

## 4. Trigger Points
- **Order Confirmation:** In `app.post("/api/custom-orders/webhook")`, trigger `sendBulkSms(orgId, 'confirmation', order)` right after inserting the order into the database.
- **Order Dispatch:** 
  - In `app.post("/api/send-to-courier")` (Steadfast), trigger `sendBulkSms(orgId, 'dispatch', order)` immediately after receiving a successful response from Steadfast API (with the consignment ID).
  - In `app.post("/api/send-to-pathao")` (Pathao), trigger `sendBulkSms(orgId, 'dispatch', order)` immediately after receiving a successful response from Pathao API (with the consignment ID).

## 5. Error Handling & Resilience
- The SMS delivery function operates asynchronously relative to the HTTP response sent to the client.
- A failure in Bulk SMS BD (timeouts, invalid API keys) will not crash the Node.js process and will not cause the frontend courier dispatch action to fail.
- All errors from the SMS request are logged to `console.error` for traceability.
