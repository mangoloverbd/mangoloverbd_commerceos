# Debug Report: Meta Inbox Product Context And Order Capture

## Symptom

Meta AI replies drifted between products during a Messenger/Instagram/WhatsApp conversation, repeated a product the customer rejected, and did not create a pending Inbox Order after the customer provided delivery details and said to place the order.

## Root Cause

The Meta webhook auto-reply path sent only the latest customer message plus an optional recent image to OpenAI. It did not include recent conversation history, so corrections like "not glass cup" were not available to the model. The webhook path also had no order-capture step that inserted into `social_inbox_orders`.

## Fix

`server/index.js` now sends recent conversation history into the Meta auto-reply prompt, uses the recent image for all text follow-ups within the image window, extracts confirmed order details from the conversation, and inserts a pending `social_inbox_orders` row when the customer explicitly asks to place/confirm an order. The missing authenticated Inbox Orders list/update/delete API routes were also restored.

## Verification

- `node --check server/index.js`
- `npm test`
- `npm run build`

