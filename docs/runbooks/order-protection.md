# Order protection runbook

Order protection runs on the Merchant Suite server before an order is written or stock is changed.

## Configuration

- `ORDER_PROTECTION_MODE=off|shadow|active`: `off`/`disabled` is an emergency kill switch. An explicit `shadow` or `active` overrides the workspace setting; otherwise `${orgId}:order_protection_mode` selects the mode, defaulting to `shadow`.
- `ORDER_PROTECTION_HASH_SECRET`: server-only, at least 16 characters; rotate with a planned Redis key transition. If missing, checkout returns a retryable 503 BLOCK until the operator fixes configuration.
- `STOREFRONT_CONTEXT_SECRET`: server-only shared HMAC secret of at least 32 characters, identical in both Vercel projects. The storefront signs client IP, geo, device cookie, and checkout telemetry. Never use a `VITE_` prefix for it.
- `TURNSTILE_SECRET_KEY`: server-only Cloudflare secret; `VITE_TURNSTILE_SITE_KEY` is public. A missing secret does not penalize checkout. A missing, expired, failed, or unavailable challenge requests a review.
- Upstash Redis URL and token: used for signal counters, duplicate reservations, and the 5/device, 20/network, 60/untrusted-IP per 15-minute submission limits. Redis unavailability requests a HOLD in active mode rather than a dependency BLOCK.

No AI call is made in checkout. Name, address, notes, honeypot, duplicate, timing and velocity checks are deterministic. An incomplete or vague address is assessed locally.

## Customer flow

The storefront submits canonical product/variant IDs to `/api/public/v1/:handle/orders` with a signed server-to-server client context. Merchant Suite validates stock and prices, then assesses the order before any insert or decrement. The legacy evaluator records the assessed decision in `order_protection_events` with `mode`; shadow mode always proceeds as ALLOW and creates no review or duplicate reservation. Plan D moves attempts to `order_risk_attempts`.

In active mode, ALLOW creates the order and decrements stock. REVIEW creates a durable staff hold and returns HTTP 202. BLOCK returns a generic customer-safe message. No order, stock decrement, or purchase event is created for active HOLD/BLOCK. Missing hash configuration is a retryable 503 response; staff should restore the secret rather than ask the customer to change details.

## Staff flow

Admins open `/order-protection` to review held submissions. Approval claims the hold before rechecking the catalog, recalculating shipping, creating the order, and decrementing stock. If the catalog or stock changed, the review remains on hold. Rejection closes the hold without creating an order.

## Rollout and monitoring

Keep mode in `shadow` for a measured rollout and compare recorded decisions with confirmed outcomes before switching to `active`. Monitor review volume, block precision, Turnstile failures, Redis availability, and false-positive reports. Never log raw address, phone, IP, device ID, or user-agent values. Do not use a real customer phone number or submit a real order for synthetic checks.
