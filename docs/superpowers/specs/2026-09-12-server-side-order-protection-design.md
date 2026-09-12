# Server-Side Storefront Order Protection Design

**Date:** 2026-09-12
**Repositories:** `mangoloverbd/mangoloverbd_commerceos` and `mangoloverbd/mangoloverbd_storefront`

## Goal

Reduce fake-order harassment without blocking normal Mango Lover BD customers, especially customers using Bangla or Banglish addresses.

The server remains authoritative. A rejected or held submission must not silently create a normal order, reduce inventory, send confirmation SMS, or trigger courier work.

## Current baseline

Merchant Suite `main` is currently at `ee1e279`. The relevant current code is:

- `server/index.js:6517` — authenticated `POST /api/custom-orders/webhook`, the current storefront order ingress.
- `server/index.js:10873` — `handlePublicHandleOrderSubmit`.
- `server/index.js:11174` — `POST /api/public/v1/:handle/orders`.
- `server/index.js:111` — shared OpenAI-compatible `aiChatCompletion` helper.
- `server/index.js:227-383` — Upstash limiter setup and public-read middleware.
- `.env.example:13-31` — existing AI configuration.

Storefront `main` is currently at `53895b6`. The relevant current code is:

- `api/orders.ts:114` — Vercel order validation and `:265` — Vercel order handler.
- `server/order-service.ts:6` — local order schema and `:63` — Merchant Suite forwarding.
- `server/routes.ts:91` — local `POST /api/orders` route.
- `client/src/components/order-dialog.tsx:174` — normal checkout submission.
- `client/src/features/sundarbans-honey/honey-checkout.tsx:257` — campaign checkout.
- `client/src/features/kalojira-mixed/kalojira-checkout.tsx:262` — campaign checkout.
- `client/src/features/honey-nut/honey-nut-checkout.tsx:149` — campaign checkout.

The storefront already has abandoned-checkout capture and `draftKey` forwarding. That feature stays separate from order protection.

## Architecture decisions

### 1. One reusable protection engine

Create a focused Merchant Suite module at `server/orderSubmissionProtection.js`. It will contain deterministic checks, risk-signal normalization, weighted scoring, address-validation prompt construction, and strict AI-result parsing. Route handlers will provide dependencies for Redis, Supabase, Turnstile, and AI so the core logic remains unit-testable.

The module will never trust client-provided scores, device identities, organization IDs, or decision values.

### 2. Three outcomes

- `ALLOW`: continue with the existing order flow.
- `REVIEW`: create a protected staff-review record with status `on_hold`; do not reduce stock, send confirmation SMS, or dispatch to a courier until staff approval.
- `BLOCK`: return a generic customer-safe error; do not create an order.

Hard failures such as a filled honeypot, failed Turnstile, obvious abuse/test content, exact duplicate, or exceeded limiter may block immediately. Soft signals such as fast checkout, network changes, or several attempts from one phone contribute to the score and normally produce `REVIEW` rather than an automatic block.

### 3. Explainable risk signals

The first version will support these reason codes:

- `honeypot_filled`
- `turnstile_failed`
- `rate_limit_exceeded`
- `phone_velocity_15m`
- `phone_velocity_1h`
- `phone_velocity_24h`
- `phone_many_sessions`
- `phone_network_change`
- `checkout_too_fast`
- `duplicate_submission`
- `address_missing`
- `address_too_short`
- `address_too_vague`
- `abusive_content`
- `test_or_fake_content`
- `address_validation_unavailable`

The final score is produced by deterministic server rules and is separate from the AI's 0–100 address score. The staff view will show the score, decision, and reason codes so a block is understandable.

### 4. Privacy-preserving signals

Use short-lived keyed hashes for phone, client session, IP, and user-agent/network signals. Do not log raw phone numbers, addresses, prompts, AI responses, or honeypot values. Redis counters expire automatically. Persistent risk events retain only reason codes, score, decision, route, timestamps, order ID when one exists, and keyed hashes.

The staff-review record stores only the customer/cart fields required to investigate a held order, has a fixed 30-day expiry, is workspace-scoped, and is scrubbed after expiry. No browser role receives direct database access.

### 5. Address validation

Run deterministic checks first. Do not call AI for clearly valid addresses or obvious hard failures. Call the dedicated validator only for ambiguous text, such as a plausible-looking but incomplete or low-information address.

Use `gpt-4o-mini` through a dedicated server-side configuration:

```env
ADDRESS_VALIDATION_MODEL=gpt-4o-mini
ADDRESS_VALIDATION_PROVIDER=openai
```

The existing Order Chat/social AI configuration must not be changed. The validator receives only the customer name and address as untrusted data and must return strict JSON containing an action, address-presence flag, abuse/test/vagueness flags, integer risk score, and short reason. A timeout or malformed response returns a retryable error and does not create a normal order.

AI checks plausibility and abuse indicators; they do not prove a person owns a phone number or that an address exists.

### 6. Protect both current and target order paths

The current storefront sends orders through `/api/custom-orders/webhook`, so that route is the primary enforcement point for the live storefront. The versioned `/api/public/v1/:handle/orders` route will receive the same protection pipeline for the approved public API architecture and other storefront clients.

New storefront checkout code will use the versioned public API contract. The custom webhook remains protected and supported during migration so the current storefront cannot bypass the controls and no live checkout path is left unprotected.

## Request signals

The storefront will add non-persistent fields to its server request:

```ts
type ProtectionInput = {
  turnstileToken?: string;
  website?: string;
  clientSessionId?: string;
  checkoutStartedAt?: string;
};
```

The server validates length, format, and time bounds. `clientSessionId` is only a secondary signal; it is never treated as proof of identity. The server derives its own IP/network signal and applies the Mango Lover BD workspace guard.

## Order decision flow

```text
checkout submission
  → route authentication/secret check
  → honeypot and Turnstile
  → required fields and normalized phone
  → deterministic abuse/address checks
  → phone/session/network velocity checks
  → AI address check only when ambiguous
  → score and ALLOW / REVIEW / BLOCK
  → only ALLOW continues to stock and order creation
```

For `REVIEW`, the staff-review record contains the cart and necessary contact details, but the normal `orders` table and inventory remain untouched until approval. Approval will reuse the existing server-side product, price, stock, workspace, and order-number checks rather than trusting values captured from the browser.

## Implementation tasks

The implementation plan will contain eight independently testable tasks:

1. Define the risk contract, reason codes, thresholds, customer messages, retention rules, and the protected review-record shape.
2. Add the pure protection module and unit tests using test-first development.
3. Add Turnstile verification, dedicated order rate limiting, keyed signal hashing, velocity counters, and the privacy-preserving persistence migration.
4. Integrate the pipeline into `/api/custom-orders/webhook` and `/api/public/v1/:handle/orders`, preserving all workspace guards and preventing side effects on block/review.
5. Add the staff review/risk-log API and dashboard view for score, reasons, cart, status, approval, and rejection.
6. Update storefront Vercel/local server handlers to send signals, preserve error codes, and use the versioned public checkout contract while retaining the protected compatibility path.
7. Update all four storefront checkout surfaces with Turnstile, session timing, honeypot, and customer-safe error rendering.
8. Run full unit, integration, build, lint, browser, and synthetic abuse verification; document rollout and monitoring without changing production credentials or creating real orders.

## Security and safety boundaries

- Never accept `org_id`, risk score, decision, or price authority from the browser.
- Preserve `.eq("org_id", orgId)` on every user-data query.
- Keep Turnstile secret and AI credentials server-only.
- Use `normalizeBdPhone()` before phone comparison or external phone operations.
- Do not block an address solely because it uses Bangla or Banglish.
- Do not use permanent invasive device fingerprinting.
- Do not send raw customer data to analytics or Meta tracking for protection decisions.
- Do not deploy, change production secrets, apply a remote migration, or create real orders during development without explicit approval.

## Success criteria

- Automated, repeated, obvious fake, abusive, and duplicate submissions are blocked or held before normal order creation.
- Normal Bangla, Banglish, and English addresses can complete checkout.
- Review decisions are visible to staff with useful reason codes.
- Blocked/reviewed requests do not reduce stock, send SMS, dispatch couriers, or create normal orders.
- Current webhook and versioned public API paths enforce the same protection rules.
- Vercel and local storefront checkout behavior remains equivalent.
- Tests cover hard blocks, soft signals, false-positive-safe addresses, malformed AI responses, service outages, duplicate races, and privacy boundaries.
