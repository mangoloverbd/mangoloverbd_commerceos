# Order Risk Engine v2 — Deterministic Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assess each storefront submission with deterministic, explainable device, network, phone, content and history signals; persist every attempt; enforce only strong evidence while holding uncertainty.

**Architecture:** Normalize and hash verified client context in `server/risk/context.js`; gather scoped facts from Redis, Supabase and a time-bounded cached FraudShield lookup. Pure detectors emit catalogued signals, and one decision function applies the shared thresholds. `server/risk/pipeline.js` owns persistence and staff hold creation; the existing two order routes call it before side effects and link successful orders afterward.

**Tech Stack:** Node 20 ESM, Supabase service-role client, Upstash Redis, Vitest, Express.

## Global Constraints

- Read `00-overview.md` and `2026-09-23-order-risk-engine-v2-design.md` first. Use shared §4–§12 names, signatures, thresholds, key formats and HTTP responses verbatim.
- Resolve the fixed Mango Lover BD `org_id` server-side. Every user-data query filters by `org_id`; no client-selected organization.
- No OTP and no AI call in checkout. Normalize BD phone before hashing or FraudShield (`^01[3-9]\\d{8}$`). No raw phone/address/IP/device/user agent in logs.
- Shadow persists the assessed decision but never enforces, reserves duplicates, creates reviews, or blocks normal checkout. Off bypasses assessment. Active HOLD has a durable review before 202.
- Redis/Supabase scoring failures ⇒ HOLD (FraudShield timeout skips courier signals); do not silently ALLOW. Missing hash secret remains a retryable configuration response.
- Mobile carrier NAT must never be enforced as a shared 20/15m network bucket. Missing/invalid signed context cannot be used to trust IP/device; active requests HOLD unless an independent critical signal blocks.
- Migration is local only. Do not apply remote DDL, change production env, deploy, or submit a real order.
- Every task: test red → minimal implementation → targeted test green → scoped commit. Final: `npm test`, `npm run lint`, `npm run build`, `npm run verify:supabase-baseline`, `git diff --check`.

## File map

| File | Responsibility |
|---|---|
| `server/risk/signals.js`, `decide.js` | Immutable catalog, thresholds, pure decision |
| `server/risk/dictionaries/*.json`, `content.js`, `location.js` | Pinned BD geography, abuse patterns, deterministic parsing |
| `server/risk/network.js`, `dictionaries/bdNetworks.json`, `scripts/build-bd-networks.mjs` | ASN prefix lookup/classification, quarterly refresh |
| `server/risk/context.js` | Bounded normalizer and HMAC identity hashes |
| `server/risk/links.js` | Expiring Redis identity graph/counters |
| `server/risk/gather.js`, `detect.js` | Concurrent scoped facts and family detectors |
| `server/risk/pipeline.js` | Mode, assessment, attempt/review persistence and order link |
| `server/index.js` | Two ingress paths, signed context, safe limiter, finalization, abandoned capture links |
| `src/test/orderRisk*.test.ts` | Pure rules, adapters, pipeline and route contracts |

---

### Task 1: Immutable signal catalog and one decision function

**Files:** Create `server/risk/signals.js`, `server/risk/decide.js`, `src/test/orderRiskDecision.test.ts`.

**Interfaces:** `FAMILIES`, `SEVERITY_POINTS`, `SIGNAL_DEFINITIONS`, `THRESHOLDS`, `createSignal(code,evidence)` and `decideRisk({signals,contextTrusted,dependencyUnavailable=false,engineError=false})` exactly as overview §5–§7.

- [ ] **Step 1: Write failing tests.** Assert critical honeypot BLOCK despite trust credit; staff allowlist ALLOW even with blocklist; 110 points with High only in IDENTITY HOLD; 100 with High in DEVICE and HISTORY BLOCK; LOCATION HOLD unless trusted delivered; untrusted context/dependency/engine error HOLD; low-only score 0–39 ALLOW; unknown code throws. Use `createSignal` for every fixture.
- [ ] **Step 2: Run** `npx vitest run src/test/orderRiskDecision.test.ts` and confirm missing modules.
- [ ] **Step 3: Implement.** Freeze the eight families, exact catalog codes/points and `THRESHOLDS` from overview. `createSignal` rejects unknown codes and returns `{code,family,severity,points,label,evidence}` with bounded, identifier-free evidence. In `decideRisk`, sort no input; return the original signal order, score `Math.max(0, sum(noncritical points))`, and ordered rule reasons. Check allowlist first, then critical, then cross-family block, then hold conditions.
- [ ] **Step 4: Rerun** targeted test; all pass.
- [ ] **Step 5: Commit** `feat: add deterministic risk decision`.

### Task 2: Pinned dictionaries, content and BD network classification

**Files:** Create `server/risk/content.js`, `location.js`, `dictionaries/bdLocations.json`, `dictionaries/abuse.json`, `dictionaries/bdNetworks.json`, `scripts/build-bd-networks.mjs`; modify `network.js`; test `src/test/orderRiskReferenceData.test.ts`.

**Interfaces:** `parseBdLocation(address) → {districtId,districtName,hasPlaceMarker,hasArea}`; `classifyContent({name,address,notes}, extraTerms) → string[]`; `MOBILE_ASNS`, `lookupAsn(ip)`, `classifyNetwork({ip,country})` in overview §4. Network prefix lookup is binary-searchable, longest-prefix where ranges overlap.

- [ ] **Step 1: Tests red.** Assert 8 divisions/64 districts/494 upazilas from pinned `nuhil/bangladesh-geocode` commit `5622f68bd07a98e076edcf8100bf0db6a75b9854`; exact four hater district ids `15,16,18,19`; disambiguate Durgapur/Shibganj/Nawabganj unless district is also present. Test Bangla/English abuse obfuscation and benign place names. Test mobile ASNs 24389/24432/45245/45925, BD broadband, foreign, unknown, IPv6 and mapped v4.
- [ ] **Step 2: Run** `npx vitest run src/test/orderRiskReferenceData.test.ts`; confirm failures.
- [ ] **Step 3: Implement.** Fetch source assets over HTTPS at pinned commit and record source/license in script comments; generate deterministic JSON, no runtime external API. The iptoasn builder reads downloaded gz TSV, filters BD rows, validates address ranges and sorts them; commit generated data, not the full global dataset. Match whole short abuse terms after zero-width/separator/digit normalization; avoid broad substring false positives.
- [ ] **Step 4: Rerun** targeted test and the generator reproducibility check.
- [ ] **Step 5: Commit** `feat: pin BD location and network reference data`.

### Task 3: Normalized, hashed risk context and expiring Redis links

**Files:** Create `server/risk/context.js`, `links.js`, `src/test/orderRiskContext.test.ts`, `src/test/orderRiskLinks.test.ts`.

**Interfaces:** `buildRiskContext({orgId,route,body,clientContext,contextTrusted,secret,now,turnstile})` returns overview §8 RiskContext. `recordIdentityLinks(redis,ctx,{countAttempt=true}={})` and `readIdentityCounts(redis,ctx)` return overview §9 counts (current attempt included).

- [ ] **Step 1: Tests red.** Reject malformed body and invalid phone before hashing; unsigned browser hints never populate device/geo; signed phone candidates are normalized and bounded; all hashes are HMACs and raw identifiers never appear in Redis keys/values. Test TTL 7d device/phone sets, 1h device networks with 24h key TTL, 24h non-mobile network phones, 15m/24h counters; capture `countAttempt:false` links but does not increment counters. Redis failure propagates for gather to mark unavailable.
- [ ] **Step 2: Run** targeted files and confirm missing modules.
- [ ] **Step 3: Implement.** Use `normalizeBdPhone`, `hashProtectionSignal`, `networkKey` and Task 2 classifiers. Strip/validate all optional metadata, never trust body device/fingerprint/IP. Use `op2:{org}:...` keys from overview §9; pipeline records links before reading counts. Use Redis `zadd/zremrangebyscore/zcard` for the sliding 1h network set and `sadd/scard/expire` for distinct links.
- [ ] **Step 4: Rerun** targeted tests.
- [ ] **Step 5: Commit** `feat: capture hashed risk identity links`.

### Task 4: Scoped fact gathering and explainable detectors

**Files:** Create `server/risk/gather.js`, `detect.js`, `src/test/orderRiskGather.test.ts`, `src/test/orderRiskDetect.test.ts`.

**Interfaces:** `gatherRiskFacts(ctx,{redis,supabase,fraudLookup,fraudTimeoutMs=2000}) → RiskFacts` and `detectSignals(ctx,facts,config) → Signal[]` from overview §8.

- [ ] **Step 1: Tests red.** Assert all Supabase `orders` and list queries have `org_id`; delivered and fake-cancel status codes exact; cache-backed FraudShield uses normalized phone and 2s timeout, timeout only skips courier signals. Redis or Supabase failures populate `unavailable`; no raw PII logs. Detector fixtures cover every catalog code, all thresholds counting current attempt, four districts only HOLD, ambiguous upazilas no location signal, mobile network-many-phones suppressed, strong courier history is only −15.
- [ ] **Step 2: Run** targeted files and confirm failures.
- [ ] **Step 3: Implement.** Gather independent reads with `Promise.allSettled`, return zero placeholders only alongside explicit unavailability. Query only columns needed, indexed equality filters by `org_id` and hash/phone. Normalize FraudShield response in a bounded adapter. Pure detector functions construct evidence sentences from counts and labels, never raw IP/device ids; list allow/block hits come from `findListHits`.
- [ ] **Step 4: Rerun** targeted tests.
- [ ] **Step 5: Commit** `feat: gather and explain order risk signals`.

### Task 5: Durable pipeline and mode semantics

**Files:** Create `server/risk/pipeline.js`, `src/test/orderRiskPipeline.test.ts`; modify `server/orderProtectionStore.js` only if a narrow review adapter is needed.

**Interfaces:** `assessOrderRisk({orgId,route,body,headers,requestIp,deps})` and `finalizeOrderRisk({supabase,orgId,attemptId,orderId})` from overview §11. `deps` includes `{supabase,redis,secret,contextSecret,turnstileSecret,fraudLookup,getSetting}`.

- [ ] **Step 1: Tests red.** Off bypasses all work; shadow persists ALLOW/HOLD/BLOCK assessment with `enforced:false`, no review, and proceeds. Active untrusted/Redis/Supabase failure HOLD creates durable review and attempts to persist risk row; critical BLOCK persists; good ALLOW persists and later links order. Missing hash secret returns retryable configuration result. Failure to persist a review never returns 202; no misleading purchase response. Assert no AI invocation and no raw PII log.
- [ ] **Step 2: Run** `npx vitest run src/test/orderRiskPipeline.test.ts`.
- [ ] **Step 3: Implement.** Resolve mode via the fixed org setting, verify HMAC, build context, record/read links, gather facts, detect, decide, persist attempt with `insertRiskAttempt`. For active HOLD create review using existing `createProtectionReview`, then link attempt/review; if attempt persistence fails, preserve the review and return a safe recoverable result rather than silently ALLOW. `finalizeOrderRisk` uses `linkAttemptToOrder` after durable order creation. Do not let a best-effort order-link error roll back a successful order.
- [ ] **Step 4: Rerun** targeted tests.
- [ ] **Step 5: Commit** `feat: persist and enforce risk assessments`.

### Task 6: Route, capture and limiter integration

**Files:** Modify `server/index.js`; create `src/test/orderRiskRouteWiring.test.ts`, extend `src/test/orderProtectionRouteWiring.test.ts` and `src/test/abandonedCheckoutRouteWiring.test.ts`.

**Interfaces:** Both order routes run `assessOrderRisk` before order numbering/insert/stock. `ALLOW` returns existing success; active HOLD `202 {decision:"review",reviewId}`, active BLOCK `403 {decision:"block",retryable:false}`. Abandoned capture records candidate identity links without order counters. Successful orders call `finalizeOrderRisk` after insert.

- [ ] **Step 1: Tests red.** Assert auth/API-key and fixed org resolution precede assessment; both paths use identical pipeline; signed context cannot be spoofed by body/header fallbacks. Assert network limiter only enforces for verified non-mobile network, device bucket for signed device, no shared mobile bucket; an unsigned IP limit cannot block a genuine order before HOLD. Verify active HOLD/BLOCK skip order/SMS/stock/purchase event and shadow preserves existing order responses.
- [ ] **Step 2: Run** route-focused tests and confirm failures.
- [ ] **Step 3: Implement.** Replace the legacy pipeline calls and route-local mode resolution with `assessOrderRisk`, retain existing validation and workspace guards. Use `classifyNetwork` for the limiter gate. Pass only server-verified capture context into `recordIdentityLinks`; do not accept arbitrary org ID or browser hint in the payload. Keep generic customer messages and typed storefront response fields.
- [ ] **Step 4: Rerun** all route tests, then full suite, lint, build and local baseline verifier.
- [ ] **Step 5: Commit** `feat: wire risk engine to storefront orders`.

## Review gates

After each task inspect `git diff --check` and staged files. Before claiming complete, run `review` and `verification-before-completion` skills, verify both repositories' targeted order tests, and inspect one synthetic ALLOW/HOLD/BLOCK route flow with mocked data. Do not deploy or apply migrations remotely during this implementation.
