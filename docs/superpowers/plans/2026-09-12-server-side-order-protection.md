# Server-Side Storefront Order Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-authoritative protection against automated, duplicate, abusive, and obviously fake storefront orders while allowing normal Bangla, Banglish, and English customers to check out.

**Architecture:** Merchant Suite owns the protection decision, authoritative product pricing, inventory checks, review records, and all order side effects. A reusable protection engine combines deterministic checks with short-lived keyed signals and calls `gpt-4o-mini` only for ambiguous addresses; it returns `ALLOW`, `REVIEW`, or `BLOCK`. The storefront submits non-sensitive challenge and timing signals through its server handlers to the versioned public API, while the existing custom webhook remains protected as a compatibility path.

**Tech Stack:** Express/Node 20, Supabase PostgreSQL and service-role API, Upstash Redis, Cloudflare Turnstile, OpenAI-compatible chat completions with a dedicated `gpt-4o-mini` address-validation configuration, React/TypeScript/Vite, React Router, Vitest, Testing Library, Playwright/browser QA.

## Global Constraints

- Keep all new commerce reads and checkout behind `/api/public/v1/:handle/...`; the storefront must not write directly to Supabase commerce tables.
- Preserve the fixed Mango Lover BD workspace guard and `.eq("org_id", orgId)` on every user-data query; never accept `org_id` from a browser request.
- Authenticate the custom webhook with its existing `x-api-key` before protection checks; resolve the workspace from the key or storefront handle on the server.
- Never trust browser-provided price, order number, score, decision, device identity, or organization ID.
- Run `normalizeBdPhone()` before phone comparison or any external phone operation.
- Use keyed hashes for phone, client session, IP, and user-agent/network signals; never persist raw signal values, prompts, AI responses, or honeypot values.
- Do not block an address solely because it is written in Bangla or Banglish, and do not use permanent invasive device fingerprinting.
- `REVIEW` creates a protected staff-review record with status `on_hold`; it does not create a normal order, decrement stock, send confirmation SMS, or dispatch a courier until approval.
- `BLOCK` and `REVIEW` must not emit storefront purchase analytics events.
- Address validation uses dedicated configuration `ADDRESS_VALIDATION_MODEL=gpt-4o-mini` and `ADDRESS_VALIDATION_PROVIDER=openai`; existing Order Chat/social AI configuration remains unchanged.
- Do not apply a remote Supabase migration, change production credentials, deploy, or create a real order during implementation.
- Use test-first development for each new behavior, run the repository’s existing checks, and inspect the complete diff before shipping.
- The Merchant Suite plan is stored in this repository. Storefront changes belong in a separate branch/worktree of `mangoloverbd/mangoloverbd_storefront`.

## Current File Map Revalidated Against Main

Merchant Suite `main` is `ee1e279` and storefront `main` is `53895b6` at planning time. Line numbers are navigation anchors and must be rechecked immediately before implementation.

Merchant Suite:

- `server/index.js:111` — shared `aiChatCompletion`; do not change its default provider/model behavior.
- `server/index.js:204-383` — Upstash Redis setup and public-read limiter; add a separate order-submission limiter rather than changing public catalog limits.
- `server/index.js:6517-6630` — current `POST /api/custom-orders/webhook`; this is the live storefront ingress and must be protected first.
- `server/index.js:10873-11064` — public handle order preparation, order insert, item insert, and stock decrement.
- `server/index.js:11172-11181` — public versioned routes; the order route currently uses `rateLimitPublicRead` and returns an older response shape.
- `server/index.js:1271-1370` — storefront-handle resolution and assignment.
- `server/index.js:2451-2465` and `server/index.js:2957-2966` — storefront provisioning comments and Vercel environment injection.
- `.env.example:13-31` — existing AI settings; add dedicated address-validation, Turnstile, hashing, and protection-mode settings without replacing existing AI settings.
- `supabase/migrations/` — canonical data-preserving migration location; the newest current migration is `20260911000000_add_abandoned_checkouts.sql`.
- `src/pages/Dashboard.tsx`, `src/components/AppSidebar.tsx`, and `src/App.tsx` — protected dashboard shell/navigation and route declarations.

Storefront:

- `api/orders.ts:114-176` — Vercel order validation and request type; `:265-310` — Vercel order handler and customer-facing response mapping.
- `server/order-service.ts:6-20` — local order schema; `:63-103` — local Merchant Suite forwarding.
- `server/routes.ts:91-123` — local `POST /api/orders` route.
- `client/src/components/order-dialog.tsx:174-255` — generic product/cart checkout submit path.
- `client/src/features/sundarbans-honey/honey-checkout.tsx:257-348` — Sundarbans Honey checkout submit path.
- `client/src/features/kalojira-mixed/kalojira-checkout.tsx:262-353` — Kalojira Mixed checkout submit path.
- `client/src/features/honey-nut/honey-nut-checkout.tsx:149-203` — Honey Nut checkout submit path.
- `client/src/lib/storefront-products.ts:1-15` — public catalog base URL and storefront ID.
- `client/src/pages/product.tsx:509-523` and `client/src/components/cart-drawer.tsx:232-265` — generic bundle construction; add authoritative product/variant identifiers to the order payload.
- `.env.example:1-27` — storefront URL, storefront ID, and webhook secret settings; document the public handle and Turnstile site key.

## Task 1: Define the Protection Contract and Initial Policy

**Files:**
- Create: `server/orderSubmissionProtection.js`
- Create: `src/test/orderProtectionContract.test.ts`
- Modify: `.env.example:13-31`
- Modify: `docs/superpowers/specs/2026-09-12-server-side-order-protection-design.md` only if implementation clarifies an already-decided contract

**Interfaces:**
- Produces `ORDER_PROTECTION_DECISIONS`, `ORDER_PROTECTION_REASON_CODES`, `ORDER_PROTECTION_THRESHOLDS`, `ProtectionInput`, `ProtectionSignals`, `ProtectionResult`, and `serializeProtectionResponse` for later tasks.
- Uses no network, Supabase, Redis, browser, or environment side effects in its exported policy constants.

- [ ] **Step 1: Write contract tests first.**

  Add tests that assert the exact decision values (`ALLOW`, `REVIEW`, `BLOCK`), the complete reason-code set, and the initial policy thresholds:

  ```ts
  import {
    ORDER_PROTECTION_DECISIONS,
    ORDER_PROTECTION_REASON_CODES,
    ORDER_PROTECTION_THRESHOLDS,
  } from "../../server/orderSubmissionProtection.js";

  test("publishes the stable protection contract", () => {
    expect(ORDER_PROTECTION_DECISIONS).toEqual(["ALLOW", "REVIEW", "BLOCK"]);
    expect(ORDER_PROTECTION_REASON_CODES).toEqual(expect.arrayContaining([
      "honeypot_filled", "turnstile_failed", "rate_limit_exceeded",
      "phone_velocity_15m", "phone_velocity_1h", "phone_velocity_24h",
      "phone_many_sessions", "phone_network_change", "checkout_too_fast",
      "duplicate_submission", "address_missing", "address_too_short",
      "address_too_vague", "abusive_content", "test_or_fake_content",
      "address_validation_unavailable",
    ]));
    expect(ORDER_PROTECTION_THRESHOLDS.reviewScore).toBe(40);
    expect(ORDER_PROTECTION_THRESHOLDS.checkoutTooFastSeconds).toBe(8);
  });
  ```

- [ ] **Step 2: Run the focused test and verify it fails.**

  Run `npm test -- src/test/orderProtectionContract.test.ts`.

  Expected result: FAIL because `server/orderSubmissionProtection.js` and its exports do not exist.

- [ ] **Step 3: Add the stable contract and policy constants.**

  Export the three decisions and exactly the reason codes listed in the approved design. Set these initial conservative thresholds in one exported object: phone attempts `3/15m`, `5/1h`, `8/24h`; at least `3` distinct client sessions for `phone_many_sessions`; at least `2` distinct keyed network signals for `phone_network_change`; checkout faster than `8` seconds for `checkout_too_fast`; `40` total soft-risk points for `REVIEW`; `60` AI risk points or AI abuse/test flags for a hard block. Use weights `25/20/20/15/10/10` for the six soft signal groups, cap the deterministic score at `100`, and keep the AI address score separate from that score.

  Define the serialized public result as:

  ```js
  {
    decision: "allow" | "review" | "block",
    score: number,
    reasonCodes: string[],
    customerMessage: string,
    retryable: boolean
  }
  ```

  The client never submits `score`, `decision`, or `reasonCodes` as authority.

- [ ] **Step 4: Run the focused test and verify it passes.**

  Run `npm test -- src/test/orderProtectionContract.test.ts`.

  Expected result: PASS.

- [ ] **Step 5: Document the new environment names and commit.**

  Add the following names to `.env.example` with comments that secrets remain server-only: `ORDER_PROTECTION_MODE=active`, `ORDER_PROTECTION_HASH_SECRET=`, `TURNSTILE_SECRET_KEY=`, `ADDRESS_VALIDATION_MODEL=gpt-4o-mini`, `ADDRESS_VALIDATION_PROVIDER=openai`, and `ADDRESS_VALIDATION_TIMEOUT_MS=5000`. Do not add real values.

  Commit with `git add server/orderSubmissionProtection.js src/test/orderProtectionContract.test.ts .env.example && git commit -m "feat: define order protection contract"`.

## Task 2: Implement the Pure Protection Engine with TDD

**Files:**
- Modify: `server/orderSubmissionProtection.js`
- Create: `src/test/orderSubmissionProtection.test.ts`

**Interfaces:**
- Consumes the contract from Task 1.
- Produces pure exports `normalizeProtectionInput(input)`, `detectDeterministicSignals(input)`, `calculateProtectionScore(signals)`, `parseAddressValidationResult(value)`, and `evaluateProtection(input, dependencies)`.
- `evaluateProtection` accepts dependency functions `{ countPhoneAttempts, countPhoneSessions, countPhoneNetworks, isDuplicate, validateTurnstile, validateAddress }` so unit tests never call external services.

- [ ] **Step 1: Write failing tests for normal, fake, harassment, duplicate, and address cases.**

  Cover all of these inputs and outcomes:

  ```ts
  test("allows a normal Bangla address without calling AI", async () => {
    const validateAddress = vi.fn();
    const result = await evaluateProtection(normalInput({
      address: "ধানমন্ডি ৮ নম্বর রোড, বাড়ি ১২, ঢাকা",
    }), safeDependencies({ validateAddress }));
    expect(result.decision).toBe("ALLOW");
    expect(validateAddress).not.toHaveBeenCalled();
  });

  test("blocks a filled honeypot before any order side effect", async () => {
    const result = await evaluateProtection(normalInput({ website: "https://spam.test" }), safeDependencies());
    expect(result).toMatchObject({ decision: "BLOCK", reasonCodes: ["honeypot_filled"] });
  });

  test("blocks abusive or obvious test content without treating Banglish as abuse", async () => {
    const abusive = await evaluateProtection(normalInput({ notes: "asdf test order গালি" }), safeDependencies());
    const normalBanglish = await evaluateProtection(normalInput({ address: "Mirpur 10, lane 3, house 14" }), safeDependencies());
    expect(abusive.decision).toBe("BLOCK");
    expect(abusive.reasonCodes).toEqual(expect.arrayContaining(["abusive_content", "test_or_fake_content"]));
    expect(normalBanglish.decision).toBe("ALLOW");
  });

  test("holds repeated phone and session signals at the review threshold", async () => {
    const result = await evaluateProtection(normalInput(), safeDependencies({
      countPhoneAttempts: async () => ({ last15m: 3, last1h: 5, last24h: 8 }),
      countPhoneSessions: async () => 3,
      countPhoneNetworks: async () => 2,
    }));
    expect(result.decision).toBe("REVIEW");
    expect(result.score).toBe(100);
  });

  test("blocks an exact duplicate and never calls address AI", async () => {
    const validateAddress = vi.fn();
    const result = await evaluateProtection(normalInput(), safeDependencies({
      isDuplicate: async () => true,
      validateAddress,
    }));
    expect(result.decision).toBe("BLOCK");
    expect(result.reasonCodes).toContain("duplicate_submission");
    expect(validateAddress).not.toHaveBeenCalled();
  });
  ```

  Also test missing/short/vague addresses, checkout timing bounds, failed Turnstile, malformed AI JSON, Bangla/English mixed text, and AI timeout/unavailable behavior.

- [ ] **Step 2: Run the focused test and verify it fails.**

  Run `npm test -- src/test/orderSubmissionProtection.test.ts`.

  Expected result: FAIL because the pure functions are not implemented.

- [ ] **Step 3: Implement normalization and deterministic checks.**

  Normalize bounded strings, reject oversized signals, require a valid ISO `checkoutStartedAt` no more than 24 hours in the past and not in the future, normalize the phone with `normalizeBdPhone()`, and treat `clientSessionId` as a bounded opaque identifier. Detect honeypot content, repeated-character/test content, abuse patterns across name/address/notes, missing/short addresses, fast checkout, and duplicate fingerprints. The detector must not use a language denylist that rejects ordinary Bangla or Banglish.

- [ ] **Step 4: Implement scoring and strict AI-result parsing.**

  Add the exact weights and review threshold from Task 1. Parse only a JSON object with `action`, `addressPresent`, `abuse`, `testOrFake`, `vague`, `riskScore`, and `reason`; require a bounded integer risk score and booleans. Ignore extra keys, reject malformed types, trim the reason to a short safe string, and never include raw AI output in the returned result. AI hard-blocks only when it flags abuse/test content or reaches the configured risk threshold; an ambiguous but non-abusive result contributes `address_too_vague` and can produce `REVIEW`.

- [ ] **Step 5: Run the focused test and verify it passes.**

  Run `npm test -- src/test/orderSubmissionProtection.test.ts`.

  Expected result: PASS, including tests that assert no AI call for clearly valid or clearly invalid input and no raw address/prompt in the result object.

- [ ] **Step 6: Commit the pure engine.**

  Commit with `git add server/orderSubmissionProtection.js src/test/orderSubmissionProtection.test.ts && git commit -m "feat: add pure order protection engine"`.

## Task 3: Add Turnstile, Redis Signals, Hashing, and Persistence

**Files:**
- Create: `server/turnstile.js`
- Create: `server/orderProtectionStore.js`
- Create: `supabase/migrations/20260912000000_order_protection.sql`
- Create: `src/test/orderProtectionStore.test.ts`
- Create: `src/test/orderProtectionSchema.test.ts`
- Modify: `server/index.js:204-383`
- Modify: `.env.example:61-64` to document Redis/Turnstile protection settings in the appropriate existing sections

**Interfaces:**
- `server/turnstile.js` exports `verifyTurnstileToken({ token, remoteIp, secret, fetchImpl })` and returns `{ ok: boolean, unavailable?: boolean }` without logging token data.
- `server/orderProtectionStore.js` exports `hashProtectionSignal(value, secret)`, `buildSubmissionFingerprint(input, secret)`, `countRecentPhoneSignals`, `recordProtectionEvent`, `createProtectionReview`, `listProtectionReviews`, `getProtectionReview`, `claimProtectionReview`, `finishProtectionReview`, and `scrubExpiredProtectionData`.
- The store accepts injected Redis/Supabase-like dependencies and never logs raw phone, address, IP, user-agent, token, prompt, or response data.

- [ ] **Step 1: Write failing Turnstile and storage tests.**

  Test successful and failed Cloudflare responses, network failure as unavailable, HMAC output stability and non-reversibility, fingerprint stability, Redis TTLs, and persistence payloads containing only keyed hashes and reason codes:

  ```ts
  test("does not persist raw customer signals", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    await recordProtectionEvent({
      supabase: { from: () => ({ insert }) },
      secret: "test-secret",
      event: { orgId: "org-1", phone: "01712345678", address: "Dhaka house 1", decision: "BLOCK", score: 100, reasonCodes: ["honeypot_filled"] },
    });
    const payload = insert.mock.calls[0][0];
    expect(JSON.stringify(payload)).not.toContain("01712345678");
    expect(JSON.stringify(payload)).not.toContain("Dhaka house 1");
    expect(payload.phone_hash).toMatch(/^[a-f0-9]{64}$/);
  });
  ```

  Add a migration-shape test that checks both tables have `org_id`, expiry timestamps, decision/score/reason fields, and no public policy grants.

- [ ] **Step 2: Run focused tests and verify they fail.**

  Run `npm test -- src/test/orderProtectionStore.test.ts src/test/orderProtectionSchema.test.ts`.

  Expected result: FAIL because the adapters and migration do not exist.

- [ ] **Step 3: Add the migration.**

  Create `order_protection_events` with UUID primary key, `org_id`, nullable `order_id` and `review_id`, route, decision, score, `reason_codes text[]`, keyed signal hash columns, `created_at`, and `expires_at`. Create `order_protection_reviews` with UUID primary key, `org_id`, `status` constrained to `on_hold|approved|rejected|expired`, source route, required customer/cart fields needed for staff investigation and approval, score, reason codes, created/updated/expiry timestamps, and a scrub marker. Add indexes scoped by `(org_id, status, created_at)`, `(org_id, phone_hash, created_at)`, and `(org_id, expires_at)`.

  Enable RLS on both tables without adding anonymous/browser policies; backend service-role access remains the only data path. Add a safe, idempotent SQL cleanup function that scrubs expired review contact/cart data and marks expired reviews, preserving aggregate reason/decision metadata. The migration must contain no application-startup execution.

- [ ] **Step 4: Implement keyed hashes, Redis counters, duplicate reservation, and persistence.**

  Use HMAC-SHA-256 with `ORDER_PROTECTION_HASH_SECRET`. Store Redis counters under org-scoped keys with TTLs of 15 minutes, 1 hour, and 24 hours; retain only counts and keyed session/network sets. Reserve the exact-submission fingerprint with an atomic `SET NX EX` operation so concurrent duplicates produce one accepted reservation and subsequent duplicates return `duplicate_submission`. Store review data with a 30-day `expires_at`. Make cleanup idempotent.

- [ ] **Step 5: Add the dedicated limiter and Turnstile verifier.**

  In `server/index.js`, create a separate `rlOrderSubmission` using an Upstash sliding window of `10` submissions per `15m`, keyed by `orgId:ip:handle` after workspace/handle resolution. Do not change `rlPublicRead`. Use `cf-connecting-ip` first, then the first `x-forwarded-for` value, then the socket address, and hash the value before persistence. A Redis outage on the order-protection path returns a retryable `503` rather than silently allowing an unobservable flood; existing public-read fail-open behavior stays unchanged.

  Verify Turnstile server-side with `https://challenges.cloudflare.com/turnstile/v0/siteverify`, pass the remote IP when available, use a short timeout, and map an invalid token to `turnstile_failed` and an upstream failure to a retryable `503`. Never expose `TURNSTILE_SECRET_KEY` to Vite.

- [ ] **Step 6: Run focused tests and verify they pass.**

  Run `npm test -- src/test/orderProtectionStore.test.ts src/test/orderProtectionSchema.test.ts`.

  Expected result: PASS. Run `npm run verify:supabase-project` and `npm run verify:supabase-baseline` before any linked Supabase command; do not run a remote migration.

- [ ] **Step 7: Commit infrastructure adapters and migration.**

  Commit with `git add server/turnstile.js server/orderProtectionStore.js server/index.js supabase/migrations/20260912000000_order_protection.sql src/test/orderProtectionStore.test.ts src/test/orderProtectionSchema.test.ts .env.example && git commit -m "feat: add order protection signal storage"`.

## Task 4: Enforce Protection on Both Merchant Suite Order Paths

**Files:**
- Modify: `server/index.js:6517-6630`
- Modify: `server/index.js:10873-11064`
- Modify: `server/index.js:11172-11181`
- Modify: `src/test/orderProtectionRouteWiring.test.ts`
- Create: `src/test/orderProtectionIntegration.test.ts`

**Interfaces:**
- Consumes `evaluateProtection` and the Task 3 Turnstile/store adapters.
- Produces one internal protected submission flow used by both route handlers: `prepareProtectedSubmission`, `runOrderProtection`, `persistAllowedPublicOrder`, and `createHeldProtectionReview`.
- Returns stable customer-safe response shapes: `decision: "allow"` with `orderRef` for success, `decision: "review"` with `reviewId` and no order ID for a hold, and `decision: "block"` with a generic message and no internal reason details.

- [ ] **Step 1: Write route and side-effect tests first.**

  Add tests that mock Supabase, Redis, Turnstile, AI, SMS/courier hooks, and the order allocator. Verify:

  - missing/invalid API key returns `401` before protection or database writes;
  - unknown handle returns `404` without exposing organization data;
  - honeypot, failed Turnstile, abuse/test content, duplicate, and limiter decisions create no normal order and do not decrement stock;
  - soft velocity produces `202` review and no normal order/item/stock write;
  - normal submissions calculate price, shipping, routing, and stock from server data;
  - all product, variant, settings, order, and item queries carry the resolved `org_id` guard;
  - both routes return equivalent decision semantics;
  - a second concurrent exact submission is blocked by the atomic fingerprint reservation;
  - address AI is called only for ambiguous addresses, with `gpt-4o-mini` dedicated configuration, and AI outage returns retryable `503` without creating an order.

- [ ] **Step 2: Run the focused tests and verify they fail.**

  Run `npm test -- src/test/orderProtectionRouteWiring.test.ts src/test/orderProtectionIntegration.test.ts`.

  Expected result: FAIL because neither route is wired to the protection engine.

- [ ] **Step 3: Normalize signals and protect the custom webhook.**

  Keep the existing `x-api-key` validation and `resolveCustomStoreOrgId` lookup first. Parse `website`, `turnstile_token`, `client_session_id`, `checkout_started_at`, and `abandoned_checkout_draft_key` as bounded untrusted fields. Preserve current draft-key recovery behavior. Run protection before the existing order-number allocation, routing, insert, item replacement, or any downstream side effect.

  Accept canonical `items` when supplied by the updated storefront. Keep legacy `product`, `quantity`, and price fields as a compatibility input, but never treat their price as authoritative. If a legacy compatibility payload reaches `REVIEW`, persist it as a protected manual-review record that cannot be auto-approved without a server-resolved catalog cart; this prevents a browser-provided legacy price from becoming an approved order.

- [ ] **Step 4: Refactor the public handler into prepare, decide, and persist phases.**

  In `handlePublicHandleOrderSubmit`, resolve the handle/org, validate signal bounds, normalize the phone, and validate the canonical item envelope. Fetch published products/variants with `.eq("org_id", orgId)`, calculate current item prices/shipping/routing on the server, and build an internal order draft. Pass only that draft plus normalized signals to protection. For `ALLOW`, reuse the existing insert/item/stock/cache flow. For `REVIEW`, save the normalized review payload and return before order insertion and stock decrement. For `BLOCK`, return before all order side effects.

  Change the public success response to include both the new canonical `orderRef` and the transition alias `orderId`, while preserving `total`, `shipping`, and `message`. Return `202` for a review, `403/409/422/429/503` as appropriate for blocked, duplicate, invalid-input, rate-limited, or unavailable cases, with generic customer-safe messages.

- [ ] **Step 5: Apply the same response contract to the compatibility route and update route wiring.**

  Preserve `POST /api/custom-orders/webhook`, but make it use the same engine and store. Keep `POST /api/public/v1/:handle/orders` as the canonical route and give it a dedicated order-submission limiter rather than `rateLimitPublicRead`. Do not add any route that accepts arbitrary `org_id`.

- [ ] **Step 6: Run focused tests and inspect the diff.**

  Run `npm test -- src/test/orderProtectionRouteWiring.test.ts src/test/orderProtectionIntegration.test.ts`, then `git diff --check` and `git diff -- server/index.js`.

  Expected result: PASS, with no raw PII in logs or persisted protection events and no unguarded user-data query in the changed route sections.

- [ ] **Step 7: Commit the protected order paths.**

  Commit with `git add server/index.js src/test/orderProtectionRouteWiring.test.ts src/test/orderProtectionIntegration.test.ts && git commit -m "feat: enforce protection on storefront orders"`.

## Task 5: Add Staff Review, Risk Logs, and Dashboard Controls

**Files:**
- Modify: `server/index.js` near the authenticated API route section
- Create: `src/test/orderProtectionReviewRoutes.test.ts`
- Create: `src/lib/orderProtection.ts`
- Create: `src/components/OrderProtectionReviewQueue.tsx`
- Create: `src/pages/OrderProtection.tsx`
- Create: `src/test/orderProtectionPage.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/AppSidebar.tsx`

**Interfaces:**
- Backend `GET /api/order-protection/reviews?status=on_hold`, `GET /api/order-protection/events`, and `PATCH /api/order-protection/reviews/:id` with body `{ action: "approve" | "reject" }`.
- Frontend `fetchProtectionReviews`, `fetchProtectionEvents`, and `updateProtectionReview` use `apiFetch()` only.
- Review approval consumes the protected server-side cart and returns `{ orderRef }` only after current product, price, shipping, routing, and stock checks succeed.

- [ ] **Step 1: Write failing API and UI tests.**

  Test that unauthenticated requests return `401`, authenticated requests resolve the current user’s Mango Lover BD org rather than accepting a query/body org, and every list/get/update query includes the org guard. Test allowed status transitions `on_hold -> approved|rejected`, rejection of repeated transitions, stale-stock approval returning `409` while keeping the review on hold, and successful approval creating exactly one normal order and decrementing stock exactly once.

  Test the page renders score, decision, reason codes, cart, customer contact, age, and status; shows approve/reject controls only for `on_hold`; and renders generic API errors without leaking internal reason text to a customer-facing surface.

- [ ] **Step 2: Run focused tests and verify they fail.**

  Run `npm test -- src/test/orderProtectionReviewRoutes.test.ts src/test/orderProtectionPage.test.tsx`.

  Expected result: FAIL because the routes, page, and client API do not exist.

- [ ] **Step 3: Add authenticated review and event endpoints.**

  Use the existing `getToken(req)` → `getUser(token)` → role/org resolution pattern. `GET /api/order-protection/reviews` supports `on_hold`, `approved`, `rejected`, and `expired`, defaults to `on_hold`, orders newest first, and returns only the fields needed by staff. `GET /api/order-protection/events` returns scrubbed reason/decision logs and keyed signal metadata, never raw phone/address/IP/session/user-agent values.

- [ ] **Step 4: Implement safe approval and rejection.**

  Claim a review with an atomic `WHERE org_id = currentOrg AND status = 'on_hold'` transition so two staff members cannot approve it concurrently. On approval, re-fetch every referenced product/variant with the fixed org guard, require published/current stock, recalculate current price and shipping, run routing, insert the normal order/items, decrement stock with a conditional stock check, and mark the review approved only after all required writes succeed. If a price/stock/catalog check fails, release the claim back to `on_hold` and return `409`; do not trust stored browser totals. On rejection, mark the review rejected without touching stock or creating an order. Preserve a protection event linked to the review/order.

- [ ] **Step 5: Build the dashboard queue and route.**

  Add a protected `/order-protection` page with the existing warm off-white design, Phosphor light-weight icons, accessible status labels, score/reason chips, cart/contact details, and explicit approve/reject confirmation. Keep the customer-safe block text separate from the staff explanation. Add a sidebar entry and route declaration through React Router v6. Use Framer Motion only for the queue’s existing dashboard-style transitions.

- [ ] **Step 6: Run focused tests and commit.**

  Run `npm test -- src/test/orderProtectionReviewRoutes.test.ts src/test/orderProtectionPage.test.tsx` and `git diff --check`.

  Commit with `git add server/index.js src/lib/orderProtection.ts src/components/OrderProtectionReviewQueue.tsx src/pages/OrderProtection.tsx src/App.tsx src/components/AppSidebar.tsx src/test/orderProtectionReviewRoutes.test.ts src/test/orderProtectionPage.test.tsx && git commit -m "feat: add order protection review queue"`.

## Task 6: Move Storefront Checkout to the Versioned Contract

**Repository:** `mangoloverbd/mangoloverbd_storefront` on a branch based on its current `main` (`53895b6`).

**Files:**
- Modify: `api/orders.ts:1-310`
- Modify: `server/order-service.ts:1-103`
- Modify: `server/routes.ts:91-123`
- Modify: `client/src/lib/storefront-products.ts:1-15`
- Modify: `server/index.js:2451-2465,2957-2966` in Merchant Suite to inject the public handle and site key during storefront provisioning
- Modify: `.env.example:1-27`
- Create: `api/order-protection-errors.ts`
- Create: `server/order-protection-errors.ts`
- Modify: `api/orders.test.ts`, `server/order-service.test.ts`, and the relevant `server/routes` test coverage

**Interfaces:**
- Storefront server handlers send `ProtectionInput` fields and canonical `items` to `POST /api/public/v1/:handle/orders`.
- `processOrder` returns `{ orderRef: string, decision: "allow" }` or `{ decision: "review", reviewId: string }` and throws a typed error containing upstream `code`, `decision`, `retryable`, and HTTP status.
- Provisioning injects `VITE_STOREFRONT_HANDLE`, `STOREFRONT_HANDLE`, and `VITE_TURNSTILE_SITE_KEY` alongside the existing URL/ID/secret values; secret values remain server-only.

- [ ] **Step 1: Write failing storefront contract tests.**

  Assert that both Vercel and local handlers accept bounded protection fields, forward the public handle URL, send `items` and `shipping_zone_id`, preserve `abandoned_checkout_draft_key`, parse `decision: "review"` as a non-error hold, parse `decision: "block"` into a typed customer-safe error, and accept the transition `order_id` response while preferring canonical `orderRef`.

- [ ] **Step 2: Run the storefront focused tests and verify they fail.**

  From the storefront repository, run `npx vitest run api/orders.test.ts server/order-service.test.ts`.

  Expected result: FAIL for the new public URL, signal, canonical payload, and review response assertions.

- [ ] **Step 3: Extend validation and server forwarding.**

  Add optional fields `turnstileToken`, `website`, `clientSessionId`, and `checkoutStartedAt` with strict size/format bounds to the Vercel Zod schema and local schema. Add canonical `items: Array<{ productId: string; variantId: string; quantity: number }>` and `shippingZoneId` to the server payload, while retaining the existing bundle fields for compatibility during the migration. Resolve the public handle from `STOREFRONT_HANDLE`; fail configuration clearly if it is absent rather than silently routing to an unprotected endpoint.

  Forward only server-owned secrets in `server/order-service.ts` and `api/orders.ts`. Send `x-api-key` only to the compatibility route if a fallback is explicitly needed; the canonical public route uses the handle and does not expose the secret to browser code. Preserve the draft key exactly as the existing abandoned-cart feature expects.

- [ ] **Step 4: Add typed response/error parsing in both server handlers.**

  Parse `{ decision, orderRef, orderId, reviewId, error, code, retryable }`. A `202` review result must not call Meta Purchase CAPI or be converted to a generic upstream failure. A blocked result must preserve machine-readable codes for the UI but expose only customer-safe messages. Network/5xx failures remain retryable and never trigger purchase analytics.

- [ ] **Step 5: Update Merchant Suite provisioning and configuration documentation.**

  Read the org’s assigned handle with the existing `getStorefrontHandle(orgId)` helper during Vercel environment injection. Add `VITE_STOREFRONT_HANDLE` and server `STOREFRONT_HANDLE` values, plus the public Turnstile site key. Update comments to identify `/api/public/v1/{handle}/orders` as canonical and `/api/custom-orders/webhook` as compatibility-only. Do not put `TURNSTILE_SECRET_KEY`, `ORDER_PROTECTION_HASH_SECRET`, or AI credentials in any `VITE_` variable.

- [ ] **Step 6: Run storefront tests, typecheck, and commit the storefront branch.**

  Run `npx vitest run api/orders.test.ts server/order-service.test.ts`, `npm run check`, and `git diff --check` in the storefront repository.

  Commit with `git add api server client/src/lib/storefront-products.ts .env.example && git commit -m "feat: use protected public checkout contract"`.

## Task 7: Add Challenge, Timing, Honeypot, and Review UX to All Four Checkouts

**Repository:** `mangoloverbd/mangoloverbd_storefront` on the same feature branch as Task 6.

**Files:**
- Create: `client/src/lib/order-protection.ts`
- Create: `client/src/components/turnstile-challenge.tsx`
- Create: `client/src/components/order-protection-message.tsx`
- Modify: `client/src/components/order-dialog.tsx:174-255`
- Modify: `client/src/features/sundarbans-honey/honey-checkout.tsx:257-348`
- Modify: `client/src/features/kalojira-mixed/kalojira-checkout.tsx:262-353`
- Modify: `client/src/features/honey-nut/honey-nut-checkout.tsx:149-203`
- Modify: `client/src/pages/product.tsx:509-523`
- Modify: `client/src/components/cart-drawer.tsx:232-265`
- Modify: `.env.example:7-27`
- Create or modify: the existing generic and campaign checkout tests under `client/src/components/` and `client/src/features/*/`

**Interfaces:**
- `getOrCreateClientSessionId(storage)` returns a bounded random session ID stored only in `sessionStorage`.
- `createCheckoutProtectionSignals({ checkoutStartedAt, clientSessionId, website, turnstileToken })` returns the exact server request field names.
- `TurnstileChallenge` renders Cloudflare’s explicit widget with `VITE_TURNSTILE_SITE_KEY`, reports a token/reset state, and renders nothing sensitive into analytics.

- [ ] **Step 1: Write failing client tests.**

  Test session ID persistence/format, checkout timer behavior, hidden honeypot presence, Turnstile token inclusion, canonical product/variant IDs in generic and campaign payloads, and these response states for every checkout: normal success, `REVIEW` hold, `BLOCK`, invalid address, duplicate, rate limit, and retryable service outage. Assert that Meta/Google purchase events fire only after `ALLOW` with an order reference.

- [ ] **Step 2: Run the focused client tests and verify they fail.**

  From the storefront repository, run the affected Vitest files with `npx vitest run`.

  Expected result: FAIL for missing signal helpers, widget, payload fields, and hold/error states.

- [ ] **Step 3: Implement session/timing and Turnstile helpers.**

  Record `checkoutStartedAt` when each checkout opens/mounts, not when the submit button is pressed. Generate a random opaque client session ID once per browser session. Add a visually hidden but accessible-to-automation honeypot input named `website` with an empty default; do not autofocus it and do not include its value in analytics. Load Turnstile explicitly, reset it after a failed submission, and prevent submit while a required challenge is unresolved. If no site key is configured in local development, render a development-safe empty challenge but keep the server capable of rejecting missing tokens in active production mode.

- [ ] **Step 4: Update generic product/cart checkout payloads.**

  Extend `OrderDialogBundle` and the bundle builders in `client/src/pages/product.tsx` and `client/src/components/cart-drawer.tsx` so each line contains server-resolvable `productId`, `variantId`, and quantity. Keep display title/details/prices for UI only; the Merchant Suite remains price authority. Add the protection fields to the existing `apiRequest("POST", "/api/orders", payload)` path and keep `draftKey` forwarding unchanged.

- [ ] **Step 5: Update all three campaign checkouts.**

  In the Sundarbans Honey, Kalojira Mixed, and Honey Nut submit handlers, add protection signals to the already refreshed variant payload. Preserve each campaign’s address-building function, live product/inventory refresh, payment/tracking fields, draft capture, and existing field validation. Replace the current catch-all error path with typed mapping: review shows a hold message without a fake order number, block shows a generic retry/contact message, and retryable errors invite a later retry. No purchase confirmation route or purchase event is entered without `ALLOW` and `orderRef`.

- [ ] **Step 6: Add customer-safe message rendering and accessibility checks.**

  Show Bengali-friendly copy for review (“আপনার অর্ডারটি যাচাই করা হচ্ছে…”) and generic block/unavailable copy; do not show scores, internal reason codes, IP/device language, or “harassment/fraud” accusations to the customer. Use existing live-region announcements, focus the first actionable error, and keep the visual treatment consistent with the four current checkout surfaces.

- [ ] **Step 7: Run all storefront tests and commit.**

  Run `npx vitest run`, `npm run check`, and `git diff --check` from the storefront repository.

  Commit with `git add client .env.example && git commit -m "feat: add checkout protection signals"`.

## Task 8: Verify, Document, and Prepare a Safe Rollout

**Files:**
- Create: `docs/runbooks/order-protection.md`
- Modify: `.env.example`
- Modify: `README.md` only if the existing setup section is the established location for environment/runbook links
- Create: `src/test/orderProtectionVerification.test.ts`
- Modify: `src/test/mangoLoverDeploymentBoundary.test.ts` or the closest existing deployment-boundary test if needed
- Modify: storefront test coverage from Tasks 6-7

**Interfaces:**
- Produces a reproducible local verification matrix and rollout/runbook instructions.
- Does not alter production state, credentials, Supabase data, or real order records.

- [ ] **Step 1: Add synthetic verification tests.**

  Cover this matrix with mocked dependencies and assert both response and side effects:

  | Scenario | Expected result | Normal order/stock side effect |
  |---|---|---|
  | Valid Bangla address | `ALLOW` / `201` | exactly one order and stock decrement |
  | Valid Banglish address | `ALLOW` / `201` | exactly one order and stock decrement |
  | Empty/short address | `BLOCK` / `422` | none |
  | Filled honeypot | `BLOCK` / `403` | none |
  | Invalid Turnstile | `BLOCK` / `403` | none |
  | 3+ phone attempts plus session/network changes | `REVIEW` / `202` | none until staff approval |
  | Exact concurrent duplicate | first `ALLOW`, second `BLOCK` / `409` | one order and one stock decrement |
  | Obvious test/abusive content | `BLOCK` / `403` | none |
  | Ambiguous address with valid AI result | policy result | no raw AI data persisted |
  | Ambiguous address with AI outage/malformed JSON | `503` retryable | none |
  | Review approved after stock change | `409` and remains on hold | none |
  | Review approved with current stock | `orderRef` returned | one order and one stock decrement |

- [ ] **Step 2: Run Merchant Suite verification.**

  Run `npm test`, `npm run lint`, `npm run build`, `npm run verify:supabase-project`, `npm run verify:supabase-baseline`, and `npm audit --omit=dev`. Expected result: tests/build pass, lint has no errors, the Supabase checks pass, and no new high/critical audit issue is introduced. If an existing audit warning remains, record its package and status in the runbook rather than hiding it.

- [ ] **Step 3: Run storefront verification.**

  From the storefront repository, run `npx vitest run`, `npm run check`, `npm run build`, and `npm audit --omit=dev`. Expected result: all tests/type checks/build pass and both Vercel and local server handlers use the same protected request/response contract.

- [ ] **Step 4: Perform browser QA with no real order creation.**

  Use mocked Merchant Suite responses or a disposable local Supabase fixture to verify all four checkout surfaces. Check normal Bangla/Banglish checkout, missing/invalid Turnstile, honeypot automation, review hold rendering, block rendering, duplicate retry, no purchase analytics on hold/block, preserved abandoned-cart capture/draft key behavior, mobile layout, keyboard focus, and live-region announcements. Use the dashboard page to inspect a synthetic review and exercise approve/reject with mocked catalog/stock responses.

- [ ] **Step 5: Write the runbook.**

  Document required server settings and secret ownership, storefront public settings, the exact customer/staff outcomes, Redis/Turnstile/OpenAI outage behavior, 30-day retention and scrub behavior, safe monitoring metrics (counts by decision/reason code, latency, AI availability, review aging), and rollback by setting `ORDER_PROTECTION_MODE=shadow` or `off` without removing database tables. State that `gpt-4o-mini` checks only ambiguous address/abuse cases and cannot prove address existence or phone ownership.

- [ ] **Step 6: Review security and final diff.**

  Inspect `git diff origin/main...`, confirm no secrets or raw PII are present, confirm every changed backend data query carries the org guard, confirm no browser bundle contains a secret, and confirm no startup code executes DDL. Review the migration and route behavior for duplicate races and side-effect ordering.

- [ ] **Step 7: Commit documentation and verification artifacts.**

  In Merchant Suite, commit with `git add docs/runbooks/order-protection.md src/test/orderProtectionVerification.test.ts .env.example src/test/mangoLoverDeploymentBoundary.test.ts && git commit -m "docs: add order protection rollout runbook"`. Commit any storefront verification-only changes in the storefront repository with a separate conventional commit.

## Completion Criteria

- All eight tasks are complete in their respective repositories.
- The live custom webhook and canonical public v1 route enforce the same server-side decision pipeline.
- Normal Bangla, Banglish, and English customers can complete checkout without an AI call when deterministic checks are clearly safe.
- Automated, repeated, duplicate, abusive, and obvious fake submissions are blocked or held before normal order creation.
- Review staff can see useful score/reason/cart information and approve only after fresh server-side catalog, price, shipping, routing, and stock checks.
- Blocked and reviewed submissions do not decrement inventory, send confirmation SMS, dispatch couriers, or emit purchase analytics.
- Merchant Suite and storefront test suites, type checks, builds, lint, security checks, and browser QA pass.
- Production rollout remains an explicit operator action; no credentials, remote migration, deployment, or real order is changed by the implementation work.
