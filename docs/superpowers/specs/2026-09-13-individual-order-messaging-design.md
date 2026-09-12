# Individual Order SMS and WhatsApp Actions

## Goal

Add two individual-customer communication actions to the authenticated order editor:

- Compose and send a one-off SMS through the existing Bulk SMS BD integration.
- Open a blank WhatsApp chat for the saved customer phone number in a new tab.

These actions are separate from automated order confirmation and dispatch SMS. They must not trigger or modify those existing flows.

## Decisions

- The actions live beside the saved phone number in the order editor's customer panel.
- Individual SMS uses a freeform composer, not the automated confirmation or dispatch templates.
- The composer includes optional quick-insert controls for customer/order values.
- WhatsApp opens `https://wa.me/<international-number>` with no prefilled text and does not send through the WhatsApp Business API.
- The saved order phone is the recipient. If customer details are being edited, the operator must apply those changes before using either action.
- No database migration, message history, delivery-status table, or new Settings template is included in this first slice.

## User experience

### Customer panel actions

When the customer panel is in its read-only state and the saved phone is valid, show compact `SMS` and `WhatsApp` actions beside the existing copy-phone action.

- Disable both actions when the saved phone is missing or invalid.
- Keep them unavailable while the customer editor is open, so unsaved phone changes cannot be used accidentally.
- Preserve the existing luxury-minimal panel styling and Phosphor light-weight icon convention.
- Keep the actions usable at mobile widths without changing the panel's existing edit workflow.

### SMS composer

The SMS action opens a modal containing:

- Recipient phone number and order number for confirmation.
- An empty, editable message textarea.
- Quick-insert controls that insert resolved values, rather than raw template tokens, for at least customer name, order number, order total, and delivery address.
- A Unicode-safe character count.
- Cancel and `Send SMS` actions.

The send action is disabled for an empty/whitespace-only message, while a request is in flight, or when the order has no valid saved phone. On success, close the modal and show a success toast. On failure, keep the message available for correction/retry and show a concise error.

The composer submits the exact text entered by the operator. It does not call the automated confirmation helper and does not change order data.

### WhatsApp action

The WhatsApp action opens a new browser tab using the normalized Bangladesh number in international format (`8801XXXXXXXXX`). It opens a blank chat and does not prefill or send a message. Use a regular link/new-tab interaction so browser popup blocking is minimized.

## Backend design

Add this authenticated order-scoped action:

`POST /api/orders/:id/send-sms`

Request body:

```json
{ "message": "...operator-composed text..." }
```

The route must:

1. Extract and validate the Supabase JWT with the existing auth helpers.
2. Resolve the current Mango Lover BD `org_id` from the authenticated user's role.
3. Load the order by `id` and `org_id`; never accept a client-supplied recipient phone or organization id.
4. Validate the message as a non-empty string of at most 1,000 Unicode code points before contacting the gateway.
5. Normalize the saved order phone with `normalizeBdPhone()` and reject invalid numbers.
6. Read the existing workspace-scoped Bulk SMS settings: enabled flag, API key, and sender ID.
7. Submit the exact message through the existing Bulk SMS BD API formatting and recipient conversion (`880...`) logic.
8. Return a success response only when Bulk SMS BD accepts the submission.

The gateway call should be factored so manual sending can reuse the existing credential, phone-normalization, URL-encoding, and response-validation behavior without changing automatic confirmation/dispatch semantics. Server logs may record operational success/failure with a masked recipient, but must not log API keys or the full message body.

Suggested response behavior:

- `401` for missing/invalid authentication.
- `404` when the order is not in the current workspace.
- `422` for invalid message or phone input.
- `409` when Bulk SMS is disabled or incompletely configured.
- `502` when the gateway rejects the submission or cannot be reached.
- `200` with a minimal success payload after accepted submission.

## Data flow

```text
Order editor customer panel
  ├─ SMS → compose locally → POST order-scoped message
  │          → auth + org-guarded order lookup
  │          → normalize saved phone + read Bulk SMS credentials
  │          → Bulk SMS BD → success/error toast
  └─ WhatsApp → normalize saved phone in browser → open wa.me in new tab
```

Neither action writes a message record or mutates the order. Existing automatic confirmation and dispatch trigger points remain unchanged.

## Error handling and safety

- All frontend requests use `apiFetch()`.
- The SMS route uses the fixed workspace guard and does not trust a client-provided phone number.
- Gateway credentials remain server-side and are never returned to the browser.
- Invalid Bangladesh numbers are rejected before any external request.
- A gateway failure must be visible to the operator but must not alter the order or cause an unrelated order-editor save to fail.
- The WhatsApp action is unavailable when a valid number cannot be derived; it should not open a malformed `wa.me` URL.
- The action must be explicit: opening a WhatsApp chat does not imply that a message was sent.

## Testing strategy

Add coverage for:

- Customer panel rendering of SMS/WhatsApp actions and disabled states.
- SMS modal opening, quick-insert behavior, empty-message validation, loading state, successful submission, and retryable failure.
- Exact request payload propagation to the order-scoped SMS endpoint.
- WhatsApp URL generation for common Bangladesh phone formats and rejection of invalid numbers.
- Backend authentication and Mango Lover BD workspace scoping.
- Backend use of the stored order phone rather than a client-supplied recipient.
- Bulk SMS disabled/misconfigured, invalid-phone, gateway-rejection, and accepted-submission responses.
- Regression proof that manual SMS does not invoke automated confirmation or dispatch behavior.

## Out of scope

- SMS delivery history, audit logs, scheduled messages, campaigns, or bulk manual sending.
- WhatsApp Business API sending, templates, or conversation synchronization.
- New SMS settings or a separate manual-message template.
- Changing the existing automated confirmation or dispatch SMS triggers.
- Sending to unsaved customer edits.

## Success criteria

An operator can open an order, see the customer's saved phone, compose and explicitly send a one-off SMS through Bulk SMS BD, or open a blank WhatsApp chat in one click. Invalid numbers and integration failures are handled clearly, while existing automated SMS behavior remains unchanged.
