# Order protection runbook

Order protection runs on the Merchant Suite server before a storefront order is written or stock is changed.

## Required configuration

Set these values in the Merchant Suite deployment:

- `ORDER_PROTECTION_MODE=active`
- `ORDER_PROTECTION_HASH_SECRET` — a random secret of at least 16 characters; rotate only with a planned Redis key transition.
- `TURNSTILE_SECRET_KEY` — server-only Cloudflare Turnstile secret.
- `TURNSTILE_SITE_KEY` — public site key used to build the storefront.
- `ADDRESS_VALIDATION_MODEL=gpt-4o-mini` (the model checks every otherwise eligible order)
- `ADDRESS_VALIDATION_PROVIDER=openai`
- `ADDRESS_VALIDATION_TIMEOUT_MS=5000`
- Upstash Redis URL and token, because active protection fails closed when signal storage is unavailable.

The storefront project receives only `VITE_TURNSTILE_SITE_KEY`, the Merchant Suite public URL, the storefront ID, and the storefront handle. Never put the hash secret, Turnstile secret, or OpenAI key in a `VITE_` variable.

## Customer flow

1. Checkout renders a hidden honeypot and Turnstile challenge, then records a session ID and checkout start time.
2. The storefront sends canonical product/variant IDs to `/api/public/v1/:handle/orders`.
3. Merchant Suite validates stock and prices from Supabase, then runs deterministic checks. For every otherwise eligible order, GPT-4o-mini checks the customer name, address, and notes for a plausible deliverable address, gibberish/fake content, and harassment or abuse.
4. `ALLOW` creates the order and decrements stock atomically.
5. `REVIEW` creates a 30-day hold and returns HTTP 202. No order, stock decrement, or purchase event is created.
6. `BLOCK` returns a generic customer-safe message. No order, stock decrement, or purchase event is created. AI failures fail closed with a retryable response, so an order cannot bypass the check when OpenAI is unavailable.

## Staff flow

Admins open `/order-protection` to review held submissions. Approval claims the hold before rechecking the catalog, recalculating shipping, creating the order, and decrementing stock. If the catalog or stock changed, the review remains on hold. Rejection closes the hold without creating an order.

## Rollout and monitoring

Use `ORDER_PROTECTION_MODE=shadow` during a controlled rollout if that mode is implemented by the deployment wrapper; compare protection events with confirmed orders before switching to `active`. Monitor review volume, block volume, Turnstile failures, address-validation-unavailable events, and false-positive reports. Do not log raw address, phone, IP, or user-agent values.

## Synthetic checks

Run the Merchant Suite unit/integration tests and storefront order-service tests before deployment. A safe manual check uses a test storefront payload with a fake canonical variant and verifies the request is rejected before any order row is inserted. Do not use a real customer phone number or submit a real order to test this flow.
