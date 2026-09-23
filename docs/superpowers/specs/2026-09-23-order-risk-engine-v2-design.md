# Order Risk Engine v2 — Fake Order Prevention Design

> Implementation safety adjustment (2026-09-23): The current worktree prioritizes
> uninterrupted genuine checkout over the original active-mode HOLD/BLOCK rules
> below. Missing signed context, secrets, or dependencies do not hold an otherwise
> ordinary order. Geography and weak-score combinations alone do not hold.
> Automated content and combined signals may hold but do not block; only explicit
> staff blocklists block. The per-device rate limiter is advisory. Authenticated
> custom webhooks proceed because their free-form items cannot be approved through
> the canonical-variant review flow. See `docs/runbooks/order-protection.md` for
> the implemented behavior. This is local work, not a production rollout.

**Date:** 2026-09-23
**Repositories:** `mangoloverbd/mangoloverbd_commerceos` (engine, data, dashboard) and `mangoloverbd/mangoloverbd_storefront` (client context capture, proxy)
**Replaces:** the scoring and AI parts of `2026-09-12-server-side-order-protection-design.md`. The review queue, hold/approve flow, and hashing helpers are kept.

## 1. Goal

Stop fake and harassment orders on the Mango Lover BD storefront — including orders placed with real people's phone numbers and orders from the known hater districts (রাজশাহী, নাটোর, নওগাঁ, চাঁপাইনবাবগঞ্জ) — while keeping checkout friction-free for genuine customers.

Every decision must be explainable in the dashboard the way the reference app shows it: decision, score, "why this decision" chips, cart, and risk logs.

### Hard product constraints

- **No OTP for normal customers.** No customer sees an extra verification step in v2. (OTP stays out of scope; see §12.)
- **No AI in the checkout path.** All checks are deterministic, run on our server, and cost nothing per order.
- **Never lose a real order.** When the engine is unsure, or a dependency is down, the order is **held for a staff call**, not blocked.
- **Block only on strong, independent evidence.** One weak or single-family signal can never block.

## 2. Evidence from production (last 30 days, website + storefront orders)

| Finding | Number | Design consequence |
|---|---|---|
| Orders from first-time phones | 496 of 507 (98%) | "New customer" cannot be a risk signal. |
| Cancelled website orders | 140 of ~500 (28%) | Large, real problem worth solving. |
| Cancellations with no reason recorded | 131 of 140 | We cannot measure accuracy today → cancel reason becomes required (§9). |
| Cancelled orders whose phone had **good** courier history | 16 of 24 checked | Haters use real people's numbers. Phone reputation alone fails; **device and network identity** are the primary signals. |
| Phones with **no** courier history | 5 cancelled vs 1 confirmed | Strong medium signal. |
| Addresses naming Rajshahi | 10 of 12 cancelled | Hater-region signal is real, but haters rarely type their district → IP location is needed too. |
| Protection when last active (Sep 12–14) | 24 of 59 attempts blocked (41%), 8 by Turnstile | v1 was far too aggressive and blocked real customers. |

## 3. Why v1 failed (must be fixed first)

1. **Merchant Suite never sees the customer's IP.** The storefront's Vercel function (`api/orders.ts`) calls Merchant Suite server-to-server without forwarding client IP, user agent, or geo. Every shopper appears as a Vercel server.
2. Because of (1), the order limiter (`10 per 15 min per IP`, `server/index.js:316`) is **shared by the entire store** → real customers got "Could not confirm order" at busy times.
3. `phone_network_change` compares rotating Vercel egress IPs → false flags.
4. `getClientIp()` trusts `cf-connecting-ip` first. Merchant Suite is not behind Cloudflare, so any client can spoof it.
5. Turnstile failure, Redis failure, and AI unavailability all **hard-block** (fail closed).
6. Cart/product checkout honeypot (`order-dialog.tsx:338`) sits outside the `<form>` → never submitted.
7. Storefront phone rule accepts any 11 digits (`12345678901`).
8. `clientSessionId` is per-tab `sessionStorage` — not a device identity.
9. `checkoutStartedAt` is set at component mount (≈ page load), not when checkout opens → "fast checkout" is meaningless.
10. `ORDER_PROTECTION_MODE=shadow` is documented but not implemented — any value other than `off` is fully active.
11. FraudShield runs only *after* the order is created → it cannot prevent anything.
12. Blocked attempts keep only hashes, so staff can't see what was blocked or why.

## 4. Architecture overview

```
Browser checkout ──► Storefront Vercel fn (/api/orders) ──► Merchant Suite POST /api/public/v1/:handle/orders
  - device ID cookie        - reads trusted Vercel IP + geo headers      - verify signed client context
  - fingerprint hash        - HMAC-signs "client context"                - collect signals (Redis, Supabase, FraudShield cache)
  - checkout telemetry      - forwards order + context                   - score → ALLOW / HOLD / BLOCK
                                                                         - persist attempt + evidence
                                                                         - update identity links
                                                                         - ALLOW: create order │ HOLD: review queue │ BLOCK: log only
```

The engine is a set of small, pure **signal detectors** plus one **decision function**. Detectors receive a normalized `RiskContext` and return `{ code, family, severity, points, evidence }` or nothing. Everything I/O-bound (Redis, Supabase, FraudShield) is gathered once, in parallel, before detectors run. This keeps each rule unit-testable and lets the dashboard show exact evidence (e.g. "This device used 4 different phones in 24h").

## 5. Identity: device, network, phone

Accuracy depends on three stable identities. Each is stored only as an HMAC hash (existing `hashProtectionSignal`, secret `ORDER_PROTECTION_HASH_SECRET`).

### 5.1 Device

- **Device ID:** random UUID set by the **storefront server** as a first-party, `HttpOnly`, `Secure`, `SameSite=Lax` cookie (`mlbd_did`, 1 year). Server-set cookies survive Safari's 7-day limit on script-set cookies. The storefront sends it to Merchant Suite inside the signed client context; the browser never sees or forges it via JS.
- **Fingerprint hash:** lightweight browser traits (screen, timezone, language, platform, hardware concurrency, canvas/WebGL hash) hashed client-side. Used only to **link** devices when the cookie is cleared (incognito, new browser). Never used alone to block.
- **Device key used by rules:** the device ID; a fingerprint match links a new device ID to an existing device cluster.

### 5.2 Network

- **Client IP:** Vercel's trusted `x-vercel-forwarded-for` / `x-real-ip`, read inside the storefront function and forwarded in the signed context. Merchant Suite stops trusting `cf-connecting-ip` and raw `x-forwarded-for` from public callers.
- **Network key:** IPv4 `/24` prefix or IPv6 `/64` prefix. Bangladesh mobile operators use carrier NAT, so thousands of real users share one mobile IP. Rules that count "phones per IP" apply **only to non-mobile networks**, and "network switching" compares network keys, not single IPs.
- **Network type:** `mobile` (Grameenphone AS24389, Robi AS24432, Banglalink AS45245, Teletalk AS45925), `broadband` (any other Bangladesh range), `foreign` (non-BD country — covers most VPN exits), or `unknown`. Classified from a committed Bangladesh-only prefix table generated from the public-domain iptoasn.com dataset (`scripts/build-bd-networks.mjs`, refreshed quarterly). No license key and no per-request API cost.
- **Geo:** Vercel `x-vercel-ip-city`, `x-vercel-ip-country-region` (`E` = Rajshahi division), `x-vercel-ip-country`, forwarded in the signed context.

### 5.3 Phone

- Normalized with `normalizeBdPhone()`; must match `01[3-9]XXXXXXXX` (client and server).
- Phone reputation from **this store** (delivered / cancelled-as-fake history) and from **FraudShield** (courier network history).

### 5.4 Identity links (Redis, hashed, TTL)

| Key | Contents | TTL |
|---|---|---|
| `op2:dev:phones:{device}` | distinct phones used by this device | 7 days |
| `op2:phone:devs:{phone}` | distinct devices that used this phone | 7 days |
| `op2:dev:nets:{device}` | distinct network keys, with timestamps | 24 h |
| `op2:net:phones:{net}` | distinct phones from a non-mobile network | 24 h |
| `op2:phone:attempts:{window}:{phone}` | attempt counters (15m / 1h / 24h) | window |
| `op2:dev:attempts:{window}:{device}` | attempt counters | window |

Abandoned-checkout captures also record `device → phone` links, so a hater typing several numbers before submitting is detected even if only one order is sent.

### 5.5 Signed client context (storefront → Merchant Suite)

The storefront function builds `{ ip, userAgent, geo: {country, region, city}, deviceId, fingerprintHash, telemetry, issuedAt }`, signs it with HMAC-SHA256 using a new shared secret `STOREFRONT_CONTEXT_SECRET`, and sends it in a header. Merchant Suite verifies the signature and rejects contexts older than 60 s. Without a valid signature the request is treated as untrusted: IP/device rules are skipped and the order is **held**, never allowed silently.

## 6. Signal catalogue

Severity drives points. **Families** make sure a block needs independent evidence.
Families: `IDENTITY` (phone), `DEVICE`, `NETWORK`, `BEHAVIOUR`, `CONTENT`, `LOCATION`, `HISTORY`, `LIST`.

### 6.1 Critical — block on their own (each is near-certain)

| Code | Family | Rule | Chip text |
|---|---|---|---|
| `honeypot_filled` | BEHAVIOUR | Hidden field has a value | Bot form fill |
| `blocklist_phone` | LIST | Phone on active blocklist | Blocked phone |
| `blocklist_device` | LIST | Device ID or fingerprint cluster on blocklist | Blocked device |
| `blocklist_network` | LIST | Non-mobile network key on blocklist | Blocked network |
| `abusive_content` | CONTENT | Name/address/notes match the abuse dictionary (§7.1) | Abusive text |
| `gibberish_content` | CONTENT | Name or address fails gibberish rules (§7.2) | Gibberish details |
| `test_content` | CONTENT | "test", "fake", "asdf", "demo", "abc" etc. as whole name/address | Test/fake details |

### 6.2 High — 40 points

| Code | Family | Rule | Chip text |
|---|---|---|---|
| `device_many_phones` | DEVICE | Device (or its fingerprint cluster) used ≥ 3 distinct phones in 7 days, counting abandoned drafts | One device, many phones |
| `phone_many_devices` | IDENTITY | Phone used from ≥ 3 distinct devices in 7 days | One phone, many devices |
| `phone_fake_history` | HISTORY | Phone has an order here cancelled as fake/fraud | Previous fake order |
| `device_fake_history` | HISTORY | Device/fingerprint linked to an order cancelled as fake/fraud | Device linked to fake order |
| `phone_burst_15m` | IDENTITY | ≥ 2 attempts from this phone in 15 min | Repeat order in 15 min |
| `device_burst_15m` | DEVICE | ≥ 3 attempts from this device in 15 min | Rapid repeat orders |
| `courier_bad_history` | HISTORY | FraudShield: ≥ 3 parcels and success rate < 50% | Poor delivery record |

### 6.3 Medium — 20 points

| Code | Family | Rule | Chip text |
|---|---|---|---|
| `device_switching_networks` | NETWORK | Device seen on ≥ 3 network keys (or ≥ 2 ASNs incl. a hosting ASN) in 1 h | Device switching networks |
| `network_many_phones` | NETWORK | Non-mobile network key used by ≥ 4 phones in 24 h | One network, many phones |
| `hosting_or_vpn_network` | NETWORK | IP belongs to hosting/VPN ASN or non-BD country | VPN / foreign network |
| `phone_velocity_24h` | IDENTITY | ≥ 3 attempts from this phone in 24 h | Velocity phone 24h |
| `courier_no_history` | HISTORY | FraudShield total parcels = 0 | No delivery history |
| `address_incomplete` | CONTENT | Address lacks a place marker (house/road/holding/flat/village/para/moholla/ward) **or** lacks a recognised area/thana/upazila/district (§7.3) | Incomplete address |
| `hater_region_ip` | LOCATION | IP city is Rajshahi/Natore/Naogaon/Chapainawabganj (division `E` alone is recorded as evidence only — it also covers Bogura, Pabna, Sirajganj, Joypurhat) | Hater region (network) |
| `hater_region_address` | LOCATION | Address names one of the four districts or their upazilas | Hater region (address) |
| `phone_retyped` | BEHAVIOUR | Phone field changed to ≥ 3 different valid numbers in one checkout | Phone changed repeatedly |
| `bot_check_failed` | BEHAVIOUR | Turnstile missing, failed, or expired | Bot check failed |

### 6.4 Low — 10 points

| Code | Family | Rule | Chip text |
|---|---|---|---|
| `very_fast_checkout` | BEHAVIOUR | < 12 s from first checkout field focus to submit | Very fast checkout |
| `phone_pasted` | BEHAVIOUR | Phone and address both pasted, no keystrokes | Pasted details |
| `name_suspicious` | CONTENT | Name has digits, a single character, or equals the address | Suspicious name |
| `quantity_unusual` | BEHAVIOUR | Quantity above the product's configured normal max | Unusual quantity |

### 6.5 Trust credits — negative points

Trust credits reduce the score but **never cancel a Critical signal** and never lower the score below 0.

| Code | Points | Rule | Chip text (green) |
|---|---|---|---|
| `trusted_delivered_customer` | −60 | Phone has ≥ 1 delivered order here and no fake cancellation | Delivered before |
| `trusted_device` | −40 | Device linked to a delivered order here | Trusted device |
| `courier_strong_history` | −15 | FraudShield ≥ 5 parcels and ≥ 90% success | Good delivery record |
| `staff_allowlist` | −100 | Phone, device or network on staff allowlist | Allowlisted |

`courier_strong_history` is deliberately small: 16 of 24 fake orders used numbers with good history.

## 7. Content rules (replace the AI check)

All dictionaries live in `server/risk/dictionaries/` as versioned data files and can be extended by the merchant in Settings (merchant additions stored in `app_settings`).

### 7.1 Abuse dictionary

- Bangla, Banglish, and English terms, including common spellings.
- Normalization before matching: lowercase, strip zero-width characters, collapse repeated letters (`fuuuck` → `fuck`), remove separators between letters (`f.u.c.k`, `চ ু দ`), map digit/letter swaps (`0→o`, `1→i`, `3→e`, `@→a`).
- Whole-word matching for short words, to avoid blocking real place names.

### 7.2 Gibberish rules

- Keyboard runs (`asdf`, `qwer`, `zxcv`, `hjkl`) or the same character ≥ 5 times.
- Latin text with no vowels across ≥ 6 letters, or vowel ratio < 15%.
- Address made only of digits/symbols.
- No token in the address matches the BD location dictionary **and** no place marker **and** length < 15 characters.

### 7.3 BD location dictionary

- 8 divisions, 64 districts, 494 upazilas (generated from the MIT-licensed `nuhil/bangladesh-geocode` dataset pinned at commit `5622f68`), and major Dhaka/Chattogram areas (Mirpur, Pallabi, Uttara, Dhanmondi, Mohammadpur, …) with Bangla and English spellings and common misspellings.
- Used for `address_incomplete`, `hater_region_address`, gibberish detection, and to show a parsed **District** in the dashboard.
- Hater districts are a merchant setting (default: Rajshahi, Natore, Naogaon, Chapainawabganj with their upazilas).

## 8. Decision function

Evaluated in this order:

1. **Staff allowlist hit** → `ALLOW` (still logged).
2. **Any Critical signal** → `BLOCK`.
3. Compute `score = Σ points (High/Medium/Low) + Σ trust credits`, floored at 0.
4. **BLOCK** if `score ≥ 100` **and** High signals come from **at least two different families**.
5. **HOLD** if any of:
   - `score ≥ 40`
   - any `LOCATION` signal, unless `trusted_delivered_customer`
   - signed client context missing or invalid
   - a dependency needed for scoring was unavailable (Redis, Supabase)
6. Otherwise → `ALLOW`.

Rationale:

- Requiring two independent families for a block means one noisy detector (e.g. a shared family phone, carrier NAT) can never block a real customer.
- Location only holds: the business itself is in Paba, Rajshahi, local genuine buyers exist, and mobile IP geolocation in Bangladesh is imprecise.
- Dependency failure **holds** instead of blocking, so real orders are never lost.

### Worked example: the reference order

Velocity phone 24h (20) + one phone, many devices (40) + device switching networks (20) + incomplete address (20) + very fast checkout (10) = **110**.
Only one High signal (IDENTITY family) → rule 4 is not met → **HOLD**, not block. Staff call; if fake, one click blocks phone + device + network, and every later attempt from that device becomes an instant `BLOCK` via `blocklist_device`. This is intentionally stricter about blocking than the reference app, which likely blocked a customer who may have been real.

### Customer-facing responses

| Decision | HTTP | Customer sees |
|---|---|---|
| ALLOW | 200 | Current order-confirmed flow and thank-you page |
| HOLD | 202 | Same visual "order received" confirmation with: "আমাদের টিম ফোন করে অর্ডারটি নিশ্চিত করবে।" No purchase pixel. |
| BLOCK | 403 | Generic "তথ্যগুলো একবার দেখে আবার চেষ্টা করুন।" plus WhatsApp link. Never reveal which rule fired. |

## 9. Accuracy system (how it becomes "most accurate")

1. **Ground-truth labels** for every protected order:
   - `fake`: cancelled with reason `test_or_fake_order` or `fraud_or_suspicious`, or held attempt rejected as fake.
   - `genuine`: courier status delivered, or held attempt approved and later delivered.
   - `unknown`: everything else (excluded from metrics).
2. **Required cancel reason** for website/storefront orders in the order editor. A fake/fraud reason opens a one-click "Block phone / device / network" confirmation.
3. **Per-rule accuracy report** (Order Protection → Accuracy tab): for each signal, the times it fired, % fake, % genuine, and false-block count over 7/30 days. Overall: block precision, hold rate, fake orders that slipped through as ALLOW.
4. **Tuning:** weights and thresholds are code constants in v2, changed only from the report's evidence. Hater districts, word lists, and the allow/block lists are merchant settings.
5. **Targets before going from shadow to active:**
   - Block precision ≥ 97% (of shadow BLOCKs, ≥ 97% labelled fake).
   - Hold rate ≤ 15% of website orders.
   - ≥ 70% of labelled fake orders would have been held or blocked.

## 10. Data model (Supabase, via `supabase/migrations/`)

### 10.1 `order_risk_attempts` (new)

One row per checkout submission, **including blocked ones**, so staff see every attempt like the reference app.
Fields: `id`, `org_id`, `order_id` (nullable), `review_id` (nullable), `route`, `mode` (`shadow`/`active`), `decision`, `score`, `signals jsonb` (array of `{code, family, severity, points, evidence}`), `customer_name`, `phone`, `address`, `parsed_district`, `items jsonb`, `total`, `device_hash`, `fingerprint_hash`, `network_hash`, `ip_prefix` (e.g. `103.12.44.0/24`), `network_type`, `geo_city`, `geo_region`, `user_agent_summary` (browser + OS only), `created_at`, `expires_at`.
Retention: personal fields are scrubbed after 30 days by the existing maintenance cron; hashes, signals, and decision are kept 180 days for accuracy reporting.

### 10.2 `order_risk_list_entries` (new)

`id`, `org_id`, `list` (`block`/`allow`), `kind` (`phone`/`device`/`fingerprint`/`network`), `value_hash`, `display_hint` (masked, e.g. `017••••448`, `Device ab12`), `reason`, `source_order_id`, `created_by`, `created_at`, `expires_at` (phones/devices: none by default; networks: 30 days).

### 10.3 Existing tables

- `order_protection_reviews` stays as the HOLD queue; add `attempt_id`.
- `order_protection_events` becomes read-only history and is not written in v2.
- `orders`: add `risk_attempt_id` so any order opens its risk details.

All queries keep the `org_id` guard; RLS stays enabled with no public policies.

## 11. Dashboard

### 11.1 Order Protection page (`/order-protection`)

Tabs: **Held** (default), **Blocked**, **All attempts**, **Lists**, **Accuracy**.
Rows: time, customer, masked phone, district, total, decision chip, score, top 2 signal chips.

### 11.2 Risk details drawer (matches the reference, plus more)

- **Header:** Attempt/Order number.
- **Grid:** Site · Phone · Total (৳) · Decision · Score · Order status · Delivery address · Parsed district.
- **Why this decision:** chips coloured by severity (red High/Critical, amber Medium, grey Low, green Trust). Hovering or tapping a chip shows its evidence, e.g. "This device used 4 phones in the last 7 days".
- **Device & network:** device short ID, browser/OS, network type (mobile / broadband / VPN), city/division, networks seen in the last hour.
- **Linked activity:** other phones used by this device, other devices used by this phone, each with its last decision. This is the key hater-investigation view.
- **Cart items.**
- **Risk logs:** every attempt from this phone or device, with decision and time.
- **Actions:** Approve & create order (existing claim flow) · Reject · Block phone · Block device · Block network · Mark genuine (adds allowlist + label).

### 11.3 Order editor

A **Risk** tab on website orders showing the same drawer content for allowed orders. When staff later find a fake order, they can block its identities from there.

### 11.4 Settings → Order protection

Mode (`off` / `shadow` / `active`, stored in settings; the env var remains an emergency kill switch that wins), hater districts, extra abuse words, staff allowlist (phones, networks).

Design follows AGENTS.md §8: `#FAFAF8` background, borderless panels, Phosphor icons `weight="light"`, ৳ for amounts.

## 12. Out of scope (v2)

- OTP. Kept as a possible v3 option for `device_many_phones` + `LOCATION` combinations only, if the accuracy report shows held fake volume stays high.
- AI checks at checkout.
- Cross-merchant shared reputation (single-tenant deployment).
- Paid IP intelligence APIs.

## 13. Implementation phases

Each phase ships independently behind shadow mode.

### Phase 0 — Foundation fixes (both repos)
1. Storefront: signed client context in `api/orders.ts` and `server/order-service.ts` (IP, UA, geo, device ID, telemetry); same for `api/abandoned-carts.ts`.
2. Merchant Suite: verify context; replace `getClientIp()` for public routes; remove `cf-connecting-ip` trust.
3. Order limiter keyed by real network key + device (e.g. 5 per 15 min per device, 20 per 15 min per non-mobile network), never a shared bucket.
4. Implement real `shadow` mode: score, persist, then always proceed as ALLOW.
5. Remove the AI address validation from the checkout path; delete the fail-closed branches (Turnstile, Redis, AI → HOLD instead of BLOCK).
6. Storefront: move honeypot inside the form in `order-dialog.tsx`; phone regex `^01[3-9]\d{8}$` on all four checkouts; set `checkoutStartedAt` on first field focus; refresh the Turnstile token after each submit.

### Phase 1 — Device identity & telemetry (storefront)
1. Server-set `mlbd_did` cookie in the storefront function.
2. Fingerprint hash module.
3. Checkout telemetry: first-focus time, phone edit count/distinct numbers, paste flags.
4. Handle 202 HOLD as a confirmation-style screen on all four checkouts.

### Phase 2 — Risk engine v2 (Merchant Suite)
1. `server/risk/` module: context normalizer, signal detectors (one file per family), decision function, dictionaries.
2. Parallel signal gathering: Redis links, store history, FraudShield (cached; 2 s timeout; timeout = signal skipped, not failure). FraudShield moves before order creation for phones not in cache.
3. Bangladesh network prefix table (iptoasn) + classifier; quarterly refresh via script.
4. Identity link writes, including from abandoned-checkout captures.

### Phase 3 — Data model
Migrations for `order_risk_attempts`, `order_risk_list_entries`, new FK columns; scrub job extension; baseline verification (`npm run verify:supabase-baseline`).

### Phase 4 — Dashboard
Order Protection tabs, risk drawer, order editor Risk tab, block/allow actions, Settings section.

### Phase 5 — Feedback & accuracy
Required cancel reason for website orders; block-on-fake-cancel flow; accuracy report and labels.

### Phase 6 — Rollout
1. Deploy with mode `shadow` for 7 days.
2. Review the Accuracy tab against §9 targets; tune weights.
3. Switch to `active`. Monitor hold rate and block precision daily for the first week, then weekly.

## 14. Performance and reliability budget

- Added checkout latency ≤ 500 ms p95 (Redis calls pipelined; FraudShield cached, 2 s cap).
- Any engine exception → HOLD with `engine_error`, never a lost order and never a silent ALLOW.
- No raw IP, phone, or address in logs.

## 15. Open decisions

1. Hold message wording (Bangla) — confirm the proposed text.
2. Staff/office phones and networks for the allowlist.
3. Whether blocked devices should see the generic block message (default) or a "silent hold" (order looks received but is never processed). The default is the generic message.
