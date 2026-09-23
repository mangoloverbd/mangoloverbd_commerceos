# Order Risk Engine v2 — Implementation Plan Overview & Shared Contracts

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement each plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Read this file before any phase plan — every phase plan depends on the contracts below.

**Goal:** Replace the switched-off, AI-dependent order protection with a deterministic, device/network-aware risk engine that blocks only on strong independent evidence, holds uncertain orders for a staff call, and explains every decision in the dashboard.

**Spec:** `docs/superpowers/specs/2026-09-23-order-risk-engine-v2-design.md`

**Architecture:** The storefront's Vercel order proxy captures trusted client context (real IP, Vercel geo, server-set device cookie, browser fingerprint, checkout telemetry), HMAC-signs it, and forwards it to Merchant Suite. Merchant Suite verifies it, gathers facts (Redis identity links, order history, FraudShield cache, block/allow lists), runs pure per-family signal detectors, and a single decision function returns ALLOW / HOLD / BLOCK. Every attempt is persisted with its evidence; the dashboard renders it like the reference app.

**Tech Stack:** Merchant Suite — Node 20 ESM Express (`server/index.js` + focused modules in `server/risk/`), Supabase Postgres, Upstash Redis, React 18 + TanStack Query + shadcn/ui, Vitest. Storefront — Vercel Node functions in `api/`, Express dev server in `server/`, React client, `node --test`.

## Phase plans and order

| # | Plan file | Repo | Depends on |
|---|---|---|---|
| A | `01-merchant-suite-foundation.md` | commerceos | — |
| B | `02-storefront-client-context.md` | storefront | contracts §2–§3 (can ship before or after A) |
| C | `03-risk-data-model.md` | commerceos | — |
| D | `04-risk-engine.md` | commerceos | A, C |
| E | `05-risk-dashboard.md` | commerceos | C, D |
| F | `06-feedback-accuracy-rollout.md` | commerceos + ops | C, D, E |

A, B and C can be executed in parallel. Ship A + B first: that alone makes the existing engine safe to run in `shadow` mode.

## Global Constraints

- Single tenant: every query on user data filters by the resolved Mango Lover BD `org_id`; never accept an org id from a client.
- Every new authenticated route: `requireOrderProtectionStaff(req)` → `if (!user) return 401`; mutations additionally require `role === "admin"` (403 otherwise).
- New server routes go in `server/index.js` in the `// ─── Order Protection Review Queue` section; pure logic goes in `server/risk/*.js` (ESM, no default exports).
- Identifiers (phone, device ID, fingerprint, network key, IP, user agent) are stored only as `hashProtectionSignal(value, process.env.ORDER_PROTECTION_HASH_SECRET)` except the explicitly listed display columns in `order_risk_attempts`.
- Never log raw phone, address, IP, device ID, or user agent.
- Always `normalizeBdPhone()` before using a phone; valid BD mobile = `^01[3-9]\d{8}$`.
- No AI calls anywhere in the checkout path.
- Checkout never loses an order because of our infrastructure: dependency failure ⇒ ALLOW with a recorded reason, never BLOCK and never HOLD on infrastructure alone. A HOLD is only returned when a staff review row was actually written; if review creation fails the order proceeds.
- Merchant Suite tests: `src/test/*.test.ts(x)`, run `npx vitest run <file>`; import server modules as `../../server/...js`. Full checks: `npm test`, `npm run lint`, `npm run build`.
- Storefront tests: colocated `*.test.ts`, run `node --test <file>`; type check `npm run check`. Branch from `origin/main` (the local checkout is on another branch).
- Migrations: new files in `supabase/migrations/`, wrapped in `begin; … commit;`, RLS enabled, `revoke all … from anon, authenticated; grant all … to service_role;`. Add new tables to `scripts/verify-supabase-baseline.mjs`. **Do not apply remote migrations, change production env vars, deploy, or submit a real order during implementation.**
- UI: Phosphor icons `weight="light"`, `৳` for money, follow the existing `src/pages/OrderProtection.tsx` / `OrderProtectionReviewQueue.tsx` visual style, shadcn components from `src/components/ui/`, `apiFetch()` only.
- Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:` imperative style, one commit per task minimum.

---

## Shared contracts

These names, shapes, and constants are fixed. A phase plan may add private helpers, but must not rename or reshape anything below.

### 1. Protection mode — `server/risk/mode.js` (created in Plan A)

```js
export const PROTECTION_MODES = Object.freeze(["off", "shadow", "active"]);
// env ORDER_PROTECTION_MODE "off"|"disabled" always wins (kill switch).
// env "shadow"|"active" wins next. Otherwise the app setting `${orgId}:order_protection_mode`.
// Anything else/missing → "shadow".
export function resolveProtectionMode({ envMode, settingMode }) /* → "off"|"shadow"|"active" */;
export const PROTECTION_MODE_SETTING_SUFFIX = "order_protection_mode";
```

### 2. Signed client context (storefront → Merchant Suite)

- Header: `x-mlbd-client-context`
- Value: `${payloadB64url}.${signatureHex}` where `payloadB64url = base64url(JSON.stringify(context))` and `signatureHex = HMAC-SHA256(STOREFRONT_CONTEXT_SECRET, payloadB64url)` hex.
- Env: `STOREFRONT_CONTEXT_SECRET` (≥ 32 chars) in **both** Vercel projects.
- Max age: 60 000 ms from `issuedAt`; future skew tolerance 5 000 ms.
- Context v1:

```ts
type ClientContextV1 = {
  v: 1;
  issuedAt: string;                 // ISO
  ip: string;                       // from x-vercel-forwarded-for → x-real-ip → x-forwarded-for[0]
  userAgent: string | null;         // ≤ 400 chars
  geo: { country: string | null; region: string | null; city: string | null }; // city URI-decoded
  deviceId: string | null;          // UUID from server-set cookie mlbd_did
  fingerprint: string | null;       // 64 lowercase hex
  telemetry: {
    firstInteractionAt: string | null;               // ISO, first focus inside checkout form
    phoneCandidates: string[];                       // ≤ 5 distinct 11-digit strings typed in the phone field
    pastedFields: Array<"name" | "phone" | "address">;
  };
};
```

- Merchant Suite module `server/clientContext.js` (Plan A):

```js
export const CLIENT_CONTEXT_HEADER = "x-mlbd-client-context";
export function signClientContext(context, secret) /* → string (test/helper use) */;
export function verifyClientContext(headerValue, { secret, now = Date.now(), maxAgeMs = 60_000 } = {})
  /* → { ok: true, context: ClientContextV1 } | { ok: false, reason: "missing"|"unconfigured"|"malformed"|"bad_signature"|"expired"|"invalid" } */;
```

- Storefront module `server/client-context.ts` (Plan B) produces byte-identical signatures (`node:crypto` `createHmac("sha256", secret).update(payloadB64url).digest("hex")`, `Buffer.from(json).toString("base64url")`).

### 3. Storefront order body additions (browser → storefront proxy)

```ts
deviceFingerprint?: string;          // 64 hex
checkoutTelemetry?: {
  firstInteractionAt?: string;
  phoneCandidates?: string[];
  pastedFields?: Array<"name" | "phone" | "address">;
};
```

The proxy moves these into the signed context and does **not** forward them in the JSON body. Existing fields (`website`, `turnstileToken`, `clientSessionId`, `checkoutStartedAt`) remain in the body.
The device cookie is `mlbd_did` (UUID v4), `Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`, set by the storefront function on `/api/orders` and `/api/abandoned-carts` responses when absent.

### 4. Network helpers — `server/risk/network.js`

Created in Plan A:

```js
export function getTrustedRequestIp(req) /* x-vercel-forwarded-for → x-real-ip → x-forwarded-for[0] → socket; never cf-connecting-ip */;
export function networkKey(ip) /* "v4:103.12.44.0/24" | "v6:2001:db8:1:2::/64" | null */;
```

Added in Plan D:

```js
export const MOBILE_ASNS = Object.freeze([24389, 24432, 45245, 45925]);
export function lookupAsn(ip) /* → number|null, from server/risk/dictionaries/bdNetworks.json */;
export function classifyNetwork({ ip, country }) /* → { type: "mobile"|"broadband"|"foreign"|"unknown", asn: number|null } */;
```

### 5. Signals — `server/risk/signals.js` (Plan D)

```js
export const FAMILIES = Object.freeze(["IDENTITY","DEVICE","NETWORK","BEHAVIOUR","CONTENT","LOCATION","HISTORY","LIST"]);
export const SEVERITY_POINTS = Object.freeze({ critical: 100, high: 40, medium: 20, low: 10 });
export const SIGNAL_DEFINITIONS; // code → { family, severity: "critical"|"high"|"medium"|"low"|"trust", points, label }
export function createSignal(code, evidence) /* → Signal; throws on unknown code */;
```

```ts
type Signal = {
  code: string; family: Family;
  severity: "critical" | "high" | "medium" | "low" | "trust";
  points: number;          // trust signals negative
  label: string;           // chip text from spec §6
  evidence: string;        // human sentence, no raw IP/device id, e.g. "This device used 4 phones in 7 days"
};
```

Signal codes (exact): critical `blocklist_phone, blocklist_device, blocklist_network, abusive_content, gibberish_content, test_content`; high `honeypot_filled` (downgraded: password managers can fill hidden fields, so it holds for a call at most); high `device_many_phones, phone_many_devices, phone_fake_history, device_fake_history, phone_burst_15m, device_burst_15m, courier_bad_history`; medium `device_switching_networks, network_many_phones, hosting_or_vpn_network, phone_velocity_24h, courier_no_history, address_incomplete, hater_region_ip, hater_region_address, phone_retyped, bot_check_failed`; low `very_fast_checkout, phone_pasted, name_suspicious, quantity_unusual`; trust `trusted_delivered_customer (-60), trusted_device (-40), courier_strong_history (-15), staff_allowlist (-100)`.

`quantity_unusual` fires when any line quantity > 10 (constant `THRESHOLDS.unusualLineQuantity`).

### 6. Thresholds — `server/risk/signals.js` (Plan D)

```js
export const THRESHOLDS = Object.freeze({
  holdScore: 40, blockScore: 100, blockMinHighFamilies: 2,
  fastCheckoutSeconds: 12,
  devicePhones7d: 3, phoneDevices7d: 3, deviceNetworks1h: 3, networkPhones24h: 4,
  phoneBurst15m: 2, deviceBurst15m: 3, phoneVelocity24h: 3,
  courierBadMinParcels: 3, courierBadRate: 50, courierStrongMinParcels: 5, courierStrongRate: 90,
  phoneRetypedCandidates: 3, unusualLineQuantity: 10,
});
```

Counts passed to detectors **include the current attempt** (links and counters are recorded before counting).

### 7. Decision — `server/risk/decide.js` (Plan D)

```js
export function decideRisk({ signals, contextTrusted, dependencyUnavailable = false, engineError = false })
  /* → { decision: "ALLOW"|"HOLD"|"BLOCK", score: number, signals: Signal[], reasons: string[] } */;
```

Order (as built — deliberately stricter about HOLD/BLOCK than first drafted, so genuine customers are never denied): `staff_allowlist` → ALLOW; `blocklist_*` critical → BLOCK (the only engine BLOCK); other critical content (`abusive_content`, `gibberish_content`, `test_content`) → HOLD; score = max(0, Σ points of non-critical). HOLD if `honeypot_filled`, score ≥ 80, confirmed fake history (`phone_fake_history`/`device_fake_history`), or score ≥ 100 with high signals spanning ≥ 2 non-velocity families. Repeat-attempt counters (`phone_burst_15m`, `device_burst_15m`, `phone_velocity_24h`) add points but never count as an independent family, so retries alone can only HOLD. `!contextTrusted`, `dependencyUnavailable`, and `engineError` are recorded as reasons only when another HOLD reason already fired — missing telemetry or an outage alone ⇒ ALLOW. The `custom_webhook` route always ALLOWs in active mode (its free-form items cannot be staff-approved) while still persisting the audit attempt. `reasons` lists which rule produced the decision (e.g. `"critical:test_content"`, `"score>=80"`, `"honeypot_filled"`, `"confirmed_fake_history"`, `"independent_high_families"`).

Wire format stays compatible with the current storefront: ALLOW → `200 {decision:"allow"}`; HOLD → `202 {decision:"review", reviewId}`; BLOCK → `403 {decision:"block", retryable:false}`.

### 8. Risk context & facts — Plan D

`server/risk/context.js`:

```js
export function buildRiskContext({ orgId, route, body, clientContext, contextTrusted, secret, now = Date.now(), turnstile })
  /* → RiskContext */;
```

```ts
type RiskContext = {
  orgId: string; route: "public_v1" | "custom_webhook"; now: number;
  customer: { name: string; phone: string; address: string; notes: string };
  items: Array<{ productId: string; variantId: string; quantity: number }>;
  honeypot: string;
  turnstile: "ok" | "failed" | "missing" | "unconfigured" | "unavailable";
  contextTrusted: boolean;
  ip: string | null; networkKey: string | null;
  network: { type: "mobile" | "broadband" | "foreign" | "unknown"; asn: number | null };
  geo: { country: string | null; region: string | null; city: string | null };
  deviceId: string | null; fingerprint: string | null; userAgent: string | null;
  telemetry: { firstInteractionAt: number | null; phoneCandidates: string[]; pastedFields: string[] };
  hashes: { phone: string | null; device: string | null; fingerprint: string | null; network: string | null; ip: string | null; userAgent: string | null };
};
```

`server/risk/gather.js`:

```js
export async function gatherRiskFacts(ctx, { redis, supabase, fraudLookup, fraudTimeoutMs = 2000 })
  /* → RiskFacts */;
```

```ts
type RiskFacts = {
  links: { devicePhones7d: number; phoneDevices7d: number; deviceNetworks1h: number; networkPhones24h: number };
  attempts: { phone15m: number; phone24h: number; device15m: number };
  history: { phoneDelivered: number; phoneFakeCancelled: number; deviceDelivered: number; deviceFakeCancelled: number };
  courier: { totalParcels: number; successRate: number } | null;
  lists: { block: Array<"phone"|"device"|"fingerprint"|"network">; allow: Array<"phone"|"device"|"fingerprint"|"network"> };
  unavailable: Array<"redis" | "supabase" | "fraudshield">;
};
```

Delivered = `orders.courier_status in ('delivered','delivered_approval_pending')`. Fake = `orders.status = 'cancelled' and cancellation_reason_code in ('fraud_or_suspicious','test_or_fake_order')`. `fraudshield` unavailability is **not** a dependency failure for `decideRisk` (signal is simply skipped).

`server/risk/detect.js`:

```js
export function detectSignals(ctx, facts, config) /* → Signal[] */;
// config: { haterDistrictIds: string[], extraAbuseTerms: string[] }
```

### 9. Redis keys — `server/risk/links.js` (Plan D)

All values are HMAC hashes; `{org}` is the org id.

| Key | Type | TTL |
|---|---|---|
| `op2:{org}:dev:phones:{device}` | set of phone hashes | 7 d |
| `op2:{org}:fp:phones:{fingerprint}` | set of phone hashes | 7 d |
| `op2:{org}:phone:devs:{phone}` | set of device hashes | 7 d |
| `op2:{org}:dev:nets:{device}` | sorted set network hash → ms timestamp | 1 h window, key TTL 24 h |
| `op2:{org}:net:phones:{network}` | set of phone hashes (non-mobile networks only) | 24 h |
| `op2:{org}:cnt:phone:15m:{phone}` / `:24h:` | counter | 15 m / 24 h |
| `op2:{org}:cnt:dev:15m:{device}` | counter | 15 m |

```js
export async function recordIdentityLinks(redis, ctx, { countAttempt = true } = {});
export async function readIdentityCounts(redis, ctx) /* → { links, attempts } as in RiskFacts */;
```

Abandoned-checkout captures call `recordIdentityLinks(redis, ctx, { countAttempt: false })` for every valid phone candidate.

### 10. Tables (Plan C)

`public.order_risk_attempts`

| column | type | notes |
|---|---|---|
| id | uuid pk default gen_random_uuid() | |
| org_id | uuid not null | |
| order_id | uuid null | set after ALLOW order insert / review approval |
| review_id | uuid null | set when HOLD creates a review |
| route | text not null | `public_v1` \| `custom_webhook` |
| mode | text not null check in ('shadow','active') | |
| decision | text not null check in ('ALLOW','HOLD','BLOCK') | |
| score | integer not null check (score >= 0) | |
| signals | jsonb not null default '[]' | Signal[] |
| reasons | text[] not null default '{}' | from decideRisk |
| customer_name, phone, address | text null | scrubbed after 30 d |
| parsed_district | text null | district English name |
| items | jsonb not null default '[]' | |
| total | numeric null | |
| phone_hash, device_hash, fingerprint_hash, network_hash, ip_hash, user_agent_hash | text null | |
| ip_prefix | text null | e.g. `103.12.44.0/24` (scrubbed after 30 d) |
| network_type | text null | |
| geo_city, geo_region, geo_country | text null | |
| user_agent_summary | text null | e.g. `Chrome 128 · Android` |
| context_trusted | boolean not null default false | |
| label | text null check in ('fake','genuine') | accuracy ground truth |
| labelled_at | timestamptz null | |
| created_at | timestamptz not null default now() | |
| expires_at | timestamptz not null | now() + 30 d (PII scrub) |

`public.order_risk_list_entries`

| column | type |
|---|---|
| id | uuid pk |
| org_id | uuid not null |
| list | text not null check in ('block','allow') |
| kind | text not null check in ('phone','device','fingerprint','network') |
| value_hash | text not null |
| display_hint | text null |
| reason | text null |
| source_attempt_id | uuid null |
| created_by | uuid null |
| created_at | timestamptz not null default now() |
| expires_at | timestamptz null |
| unique (org_id, list, kind, value_hash) | |

Also: `orders.risk_attempt_id uuid null`, `order_protection_reviews.attempt_id uuid null`.

Store module `server/risk/store.js` (Plan C):

```js
export async function insertRiskAttempt(supabase, row) /* → { id } */;
export async function linkAttemptToOrder(supabase, { orgId, attemptId, orderId });
export async function linkAttemptToReview(supabase, { orgId, attemptId, reviewId });
export async function listRiskAttempts(supabase, { orgId, decision = "all", limit = 50, before = null });
export async function getRiskAttempt(supabase, { orgId, attemptId });
export async function listRelatedAttempts(supabase, { orgId, attempt, days = 7, limit = 50 });
export async function findListHits(supabase, { orgId, hashes }) /* hashes: {phone,device,fingerprint,network} → { block: kind[], allow: kind[] } */;
export async function createListEntries(supabase, { orgId, list, entries, reason, sourceAttemptId, createdBy });
export async function listListEntries(supabase, { orgId, list });
export async function deleteListEntry(supabase, { orgId, entryId });
export async function labelRiskAttempt(supabase, { orgId, attemptId, label });
export async function scrubExpiredRiskAttempts(supabase, { now = new Date() });
```

### 11. Pipeline — `server/risk/pipeline.js` (Plan D)

```js
export async function assessOrderRisk({ orgId, route, body, headers, requestIp, deps })
  /* deps: { supabase, redis, secret, contextSecret, turnstileSecret, fraudLookup, getSetting }
     → { mode: "off"|"shadow"|"active", decision, score, signals, attemptId: string|null, enforced: boolean, ctx } */;
export async function finalizeOrderRisk({ supabase, orgId, attemptId, orderId });
```

`enforced` is false in `shadow`/`off` (route proceeds as ALLOW). HOLD in `active` creates the review via existing `createProtectionReview` and links it.

### 12. HTTP API for the dashboard (Plan E, admin role for mutations)

| Method & path | Returns |
|---|---|
| `GET /api/order-protection/attempts?decision=hold\|block\|allow\|all&before=<iso>&limit=<1-100>` | `{ attempts: AttemptSummary[] }` |
| `GET /api/order-protection/attempts/:id` | `{ attempt, related: AttemptSummary[], review, order }` |
| `GET /api/orders/:id/risk` | `{ attempt \| null }` |
| `GET /api/order-protection/lists?list=block\|allow` | `{ entries }` |
| `POST /api/order-protection/lists` `{ attemptId, list, kinds[], reason }` | `{ entries }` — hashes read server-side from the attempt |
| `DELETE /api/order-protection/lists/:id` | `{ success: true }` |
| `POST /api/order-protection/attempts/:id/label` `{ label: "fake"\|"genuine" }` (Plan F) | `{ attempt }` |
| `GET /api/order-protection/accuracy?days=7\|30` (Plan F) | `{ overall, signals }` |
| `GET/PUT /api/order-protection/settings` (Plan E) | `{ mode, haterDistrictIds, extraAbuseTerms }` |

Settings keys: `${orgId}:order_protection_mode`, `${orgId}:order_protection_hater_districts` (JSON array of district ids, default `["15","16","18","19"]` = Rajshahi, Natore, Chapainawabganj, Naogaon in the pinned dataset), `${orgId}:order_protection_extra_abuse_terms` (JSON array of strings).

### 13. Reference data

- `nuhil/bangladesh-geocode` commit `5622f68bd07a98e076edcf8100bf0db6a75b9854` (MIT): `divisions/divisions.json`, `districts/districts.json`, `upazilas/upazilas.json` (phpMyAdmin export — the data array is the element with `type === "table"`). 8 divisions, 64 districts, 494 upazilas. Rajshahi division id `2`.
- Ambiguous upazila names that must **not** count as hater-district evidence alone: `Durgapur` (also Netrokona), `Shibganj` (also Bogura), `Nawabganj` (Dhaka/Dinajpur upazilas).
- iptoasn.com `ip2asn-v4.tsv.gz`, `ip2asn-v6.tsv.gz` (public domain): columns `range_start range_end AS_number country_code AS_description`; keep rows where country is `BD` (~3 000 v4 ranges).

## Self-review checklist for each phase plan

- [ ] Every contract name above used verbatim.
- [ ] Every task has failing test → implementation → passing test → commit.
- [ ] No step leaves a placeholder.
- [ ] No remote migration, deploy, or production env change.
