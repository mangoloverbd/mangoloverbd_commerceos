# Order protection runbook

Order protection runs on the Merchant Suite server before an order is written or stock is changed.

## Configuration

- `ORDER_PROTECTION_MODE=off|shadow|active`: `off`/`disabled` is an emergency kill switch. An explicit `shadow` or `active` overrides the workspace setting; otherwise `${orgId}:order_protection_mode` selects the mode, defaulting to `shadow`.
- `ORDER_PROTECTION_HASH_SECRET`: server-only, at least 16 characters; rotate with a planned Redis key transition. If missing, risk assessment fails open and checkout proceeds; restore the secret promptly to regain audit and identity signals.
- `STOREFRONT_CONTEXT_SECRET`: server-only shared HMAC secret of at least 32 characters, identical in both Vercel projects. The storefront signs client IP, geo, device cookie, and checkout telemetry. Never use a `VITE_` prefix for it.
- `TURNSTILE_SECRET_KEY`: server-only Cloudflare secret; `VITE_TURNSTILE_SITE_KEY` is public. A failed challenge is one medium signal; missing or unavailable verification alone never delays checkout.
- Upstash Redis URL and token: used for identity links and velocity signals. The per-device submission limiter is advisory; Redis outages do not delay otherwise normal checkouts.

No AI call is made in checkout. Name, address, notes, honeypot, duplicate, timing and velocity checks are deterministic. An incomplete or vague address is assessed locally.

## Customer flow

The storefront submits canonical product/variant IDs to `/api/public/v1/:handle/orders` with a signed server-to-server client context. Merchant Suite assesses risk before any insert or decrement, then validates stock and prices. Attempts are recorded in `order_risk_attempts`; shadow mode never enforces a risk decision. Missing or expired context is recorded without holding an otherwise normal order.

In active mode, ALLOW creates the order and decrements stock. HOLD creates a durable staff review and returns HTTP 202. Explicit staff blocklist matches can return a generic BLOCK response; automated content and combined signals can only HOLD. No order or stock decrement is created for active HOLD/BLOCK. Authenticated custom-store webhooks are never held because their free-form items cannot be reconstructed by the review approval flow.

## Staff flow

Admins open `/order-protection` to review held submissions. Approval claims the hold before rechecking the catalog, recalculating shipping, creating the order, and decrementing stock. If the catalog or stock changed, the review remains on hold. Rejection closes the hold without creating an order.

## Rollout and monitoring

Keep mode in `shadow` for a measured rollout and compare recorded decisions with confirmed outcomes before switching to `active`. Monitor review volume, block precision, Turnstile failures, Redis availability, and false-positive reports. Never log raw address, phone, IP, device ID, or user-agent values. Do not use a real customer phone number or submit a real order for synthetic checks.
