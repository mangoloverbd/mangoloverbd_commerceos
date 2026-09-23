# Order Risk Engine v2 — Merchant Suite Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Merchant Suite protection engine safe to operate in shadow mode while accepting signed storefront identity, fixing shared-IP throttling, and removing AI and fail-closed dependency decisions.

**Architecture:** Focused ESM modules own mode resolution, signed context verification, and network normalization; the two existing Express order routes pass verified metadata into the existing pipeline. The pipeline records legacy events in shadow mode without creating reviews or enforcing decisions; Plan D later replaces it with `server/risk/pipeline.js` and `order_risk_attempts`.

**Tech Stack:** Node 20 ESM, Express, Supabase Postgres, Upstash Redis, Vitest, JavaScript server and TypeScript tests.

## Global Constraints

- Read `docs/superpowers/plans/2026-09-23-order-risk-engine-v2/00-overview.md` and `docs/superpowers/specs/2026-09-23-order-risk-engine-v2-design.md` before implementation. Use the overview's names, signatures, keys, wire formats, and constants verbatim.
- Single tenant: filter user-data queries by resolved Mango Lover BD `org_id`; never accept an org id from a client. Preserve existing authentication and custom-store API-key checks.
- New reusable server logic goes in named-export ESM `server/risk/*.js`; keep the two routes and limiter wiring in `server/index.js`.
- Never log raw phone, address, IP, device ID, or user agent. Hash identities with `hashProtectionSignal(value, process.env.ORDER_PROTECTION_HASH_SECRET)` before storage or limiter keys. Always `normalizeBdPhone()` before using a phone; valid BD mobile is `^01[3-9]\d{8}$`.
- No AI calls in checkout. Dependency failure implies REVIEW/HOLD in active mode; `ORDER_PROTECTION_HASH_SECRET` missing remains a retryable configuration BLOCK. Shadow mode records the assessed decision but never creates a review or blocks the order.
- `STOREFRONT_CONTEXT_SECRET` must have at least 32 characters in both Vercel projects. Do not put it in any `VITE_` variable.
- Migration is additive, data-preserving, wrapped in `begin; … commit;`. Do not apply a remote migration, change production env vars, deploy, or submit a real order. Run `npm run verify:supabase-project` before any linked Supabase command and `npm run verify:supabase-baseline` before proposing deployment.
- Run targeted tests with `npx vitest run src/test/<file>.test.ts`; final checks are `npm test`, `npm run lint`, and `npm run build`. One imperative-style commit per task. Do not include unrelated working-tree changes in commits.

## Contract notes

- The approved spec §10.3 says `order_protection_events` becomes read-only in v2; this foundation explicitly continues writing that legacy table, including `mode`, until Plan D switches to `order_risk_attempts`. The new column is nullable for historical rows.
- The overview's `getTrustedRequestIp(req)` orders `x-vercel-forwarded-for → x-real-ip → x-forwarded-for[0] → socket`; the spec calls raw forwarded headers untrusted for public callers. This plan follows the fixed helper contract, but never treats fallback header IP as **signed client context** or device identity. Enforce proxy/header provenance at the deployment boundary before treating fallback IP as authoritative.
- A legacy review insert or event insert failure cannot safely return a 202 HOLD without a durable review. This plan catches Redis failures and produces HOLD only while Supabase review persistence works; a durable infrastructure-failure queue would require a separate design.

---

### Task 1: Signed client context with byte-identical storefront vector

**Files:**
- Create: `server/clientContext.js`
- Create: `src/test/clientContext.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `node:crypto`, `node:net` `isIP`; header `x-mlbd-client-context`.
- Produces: `CLIENT_CONTEXT_HEADER`, `signClientContext(context, secret) → string`, `verifyClientContext(headerValue, { secret, now = Date.now(), maxAgeMs = 60_000 } = {}) → { ok: true, context } | { ok: false, reason: "missing"|"unconfigured"|"malformed"|"bad_signature"|"expired"|"invalid" }`.

- [ ] **Step 1: Write the failing test** in `src/test/clientContext.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CLIENT_CONTEXT_HEADER, signClientContext, verifyClientContext } from "../../server/clientContext.js";

const secret = "test-context-secret-0123456789abcdef";
const context = {
  v: 1, issuedAt: "2026-09-23T10:00:00.000Z", ip: "103.12.44.7",
  userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/128.0 Mobile",
  geo: { country: "BD", region: "C", city: "Dhaka" },
  deviceId: "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e", fingerprint: "a".repeat(64),
  telemetry: { firstInteractionAt: "2026-09-23T09:59:20.000Z", phoneCandidates: ["01712345678"], pastedFields: [] },
};
const expected = "eyJ2IjoxLCJpc3N1ZWRBdCI6IjIwMjYtMDktMjNUMTA6MDA6MDAuMDAwWiIsImlwIjoiMTAzLjEyLjQ0LjciLCJ1c2VyQWdlbnQiOiJNb3ppbGxhLzUuMCAoTGludXg7IEFuZHJvaWQgMTQpIENocm9tZS8xMjguMCBNb2JpbGUiLCJnZW8iOnsiY291bnRyeSI6IkJEIiwicmVnaW9uIjoiQyIsImNpdHkiOiJEaGFrYSJ9LCJkZXZpY2VJZCI6IjNmMmI4YzFlLTRkNWEtNGI2Yy04ZDdlLTlmMGExYjJjM2Q0ZSIsImZpbmdlcnByaW50IjoiYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYSIsInRlbGVtZXRyeSI6eyJmaXJzdEludGVyYWN0aW9uQXQiOiIyMDI2LTA5LTIzVDA5OjU5OjIwLjAwMFoiLCJwaG9uZUNhbmRpZGF0ZXMiOlsiMDE3MTIzNDU2NzgiXSwicGFzdGVkRmllbGRzIjpbXX19.df202c83d99119befb5ec3bcfd3b624e4617105f9d9e831f89990628511ac440";
describe("signed client context", () => {
  it("matches the storefront vector and verifies at 60 seconds", () => {
    expect(CLIENT_CONTEXT_HEADER).toBe("x-mlbd-client-context");
    expect(signClientContext(context, secret)).toBe(expected);
    expect(verifyClientContext(expected, { secret, now: Date.parse(context.issuedAt) + 60_000 })).toEqual({ ok: true, context });
    expect(verifyClientContext(expected, { secret, now: Date.parse(context.issuedAt) + 60_001 })).toEqual({ ok: false, reason: "expired" });
  });
  it("rejects tampering, stale/future time, invalid fields and missing configuration", () => {
    const now = Date.parse(context.issuedAt);
    expect(verifyClientContext(undefined, { secret, now }).reason).toBe("missing");
    expect(verifyClientContext(expected, { secret: "short", now }).reason).toBe("unconfigured");
    expect(verifyClientContext(`${expected.slice(0, -1)}1`, { secret, now }).reason).toBe("bad_signature");
    expect(verifyClientContext("bad", { secret, now }).reason).toBe("malformed");
    expect(verifyClientContext(signClientContext({ ...context, issuedAt: "2026-09-23T10:00:05.001Z" }, secret), { secret, now }).reason).toBe("invalid");
    for (const change of [
      { ip: "not-an-ip" }, { deviceId: "bad" }, { fingerprint: "ABC" }, { userAgent: "a".repeat(401) },
      { geo: { ...context.geo, city: "x".repeat(81) } },
      { telemetry: { ...context.telemetry, phoneCandidates: ["01712345678", "01712345678"] } },
      { telemetry: { ...context.telemetry, phoneCandidates: ["01712345678", "01812345678", "01912345678", "01612345678", "01512345678", "01412345678"] } },
      { telemetry: { ...context.telemetry, pastedFields: ["coupon"] } },
    ]) {
      expect(verifyClientContext(signClientContext({ ...context, ...change }, secret), { secret, now }).reason).toBe("invalid");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails.** Run: `npx vitest run src/test/clientContext.test.ts`. Expected: FAIL because `server/clientContext.js` does not exist.
- [ ] **Step 3: Write minimal implementation** in `server/clientContext.js` and add the env example:

```js
import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
export const CLIENT_CONTEXT_HEADER = "x-mlbd-client-context";
const iso = (s) => typeof s === "string" && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString() === s;
const nullable = (value, valid) => value === null || valid(value);
const shortGeo = (s) => typeof s === "string" && s.length <= 80;
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v, required) => object(v) && Object.keys(v).length === required.length && required.every((k) => Object.hasOwn(v, k));
const shape = (c) => keys(c, ["v", "issuedAt", "ip", "userAgent", "geo", "deviceId", "fingerprint", "telemetry"])
  && c.v === 1 && iso(c.issuedAt) && typeof c.ip === "string" && isIP(c.ip) !== 0
  && nullable(c.userAgent, (v) => typeof v === "string" && v.length <= 400)
  && keys(c.geo, ["country", "region", "city"])
  && [c.geo.country, c.geo.region, c.geo.city].every((v) => nullable(v, shortGeo))
  && nullable(c.deviceId, (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))
  && nullable(c.fingerprint, (v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v))
  && keys(c.telemetry, ["firstInteractionAt", "phoneCandidates", "pastedFields"])
  && nullable(c.telemetry.firstInteractionAt, iso)
  && Array.isArray(c.telemetry.phoneCandidates) && c.telemetry.phoneCandidates.length <= 5
  && c.telemetry.phoneCandidates.every((v) => typeof v === "string" && /^\d{11}$/.test(v))
  && new Set(c.telemetry.phoneCandidates).size === c.telemetry.phoneCandidates.length
  && Array.isArray(c.telemetry.pastedFields) && c.telemetry.pastedFields.length <= 3
  && c.telemetry.pastedFields.every((v) => ["name", "phone", "address"].includes(v))
  && new Set(c.telemetry.pastedFields).size === c.telemetry.pastedFields.length;
export function signClientContext(context, secret) {
  const payload = Buffer.from(JSON.stringify(context)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("hex")}`;
}
export function verifyClientContext(headerValue, { secret, now = Date.now(), maxAgeMs = 60_000 } = {}) {
  if (typeof secret !== "string" || secret.length < 32) return { ok: false, reason: "unconfigured" };
  if (headerValue === undefined || headerValue === null || headerValue === "") return { ok: false, reason: "missing" };
  if (typeof headerValue !== "string" || headerValue.length > 4096 || !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(headerValue)) return { ok: false, reason: "malformed" };
  const [payload, signature] = headerValue.split(".");
  const expected = Buffer.from(createHmac("sha256", secret).update(payload).digest("hex"), "hex");
  if (!timingSafeEqual(Buffer.from(signature, "hex"), expected)) return { ok: false, reason: "bad_signature" };
  let context;
  try {
    const bytes = Buffer.from(payload, "base64url");
    if (bytes.toString("base64url") !== payload) return { ok: false, reason: "malformed" };
    context = JSON.parse(bytes.toString("utf8"));
  } catch { return { ok: false, reason: "malformed" }; }
  if (!shape(context)) return { ok: false, reason: "invalid" };
  const age = now - Date.parse(context.issuedAt);
  if (age > maxAgeMs) return { ok: false, reason: "expired" };
  if (age < -5_000) return { ok: false, reason: "invalid" };
  return { ok: true, context };
}
```

```dotenv
# Server-only shared HMAC key for storefront → Merchant Suite context (32+ characters; same in both Vercel projects).
STOREFRONT_CONTEXT_SECRET=
```

Remove the three obsolete `ADDRESS_VALIDATION_*` example lines in Task 5. Keep the env comment next to `ORDER_PROTECTION_HASH_SECRET`.
- [ ] **Step 4: Run test to verify it passes.** Run: `npx vitest run src/test/clientContext.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.** Run: `git add server/clientContext.js src/test/clientContext.test.ts .env.example && git commit -m "feat: verify signed storefront client context"`.

### Task 2: Network identity and safe IP fallback

**Files:**
- Create: `server/risk/network.js`
- Create: `src/test/riskNetwork.test.ts`
- Modify: `server/index.js` (`getClientIp`, `rateLimitPublicRead`, `allowAbandonedCheckoutCapture`)
- Modify: `src/test/abandonedCheckoutRouteWiring.test.ts`

**Interfaces:**
- Consumes: Express `req`, `node:net` `isIP`, Task 1 `verifyClientContext`, `CLIENT_CONTEXT_HEADER`.
- Produces: `getTrustedRequestIp(req) → string|null`, `networkKey(ip) → "v4:103.12.44.0/24"|"v6:2001:db8:1:2::/64"|null`.

- [ ] **Step 1: Write failing tests** in `src/test/riskNetwork.test.ts` and replace the old `cf-connecting-ip` ordering assertion in `src/test/abandonedCheckoutRouteWiring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getTrustedRequestIp, networkKey } from "../../server/risk/network.js";
describe("network identity", () => {
  it("uses the contracted header order, validates addresses, and ignores Cloudflare", () => {
    expect(getTrustedRequestIp({ headers: { "cf-connecting-ip": "198.51.100.9", "x-vercel-forwarded-for": "103.12.44.7", "x-real-ip": "203.0.113.2" } })).toBe("103.12.44.7");
    expect(getTrustedRequestIp({ headers: { "x-vercel-forwarded-for": "bad", "x-real-ip": "203.0.113.2" } })).toBe("203.0.113.2");
    expect(getTrustedRequestIp({ headers: { "x-forwarded-for": "203.0.113.3, 10.0.0.1" } })).toBe("203.0.113.3");
    expect(getTrustedRequestIp({ headers: { "cf-connecting-ip": "198.51.100.9" }, socket: { remoteAddress: "10.0.0.5" } })).toBe("10.0.0.5");
  });
  it("collapses IPv4 /24, IPv6 /64 and IPv4-mapped IPv6", () => {
    expect(networkKey("103.12.44.7")).toBe("v4:103.12.44.0/24");
    expect(networkKey("2001:0db8:0001:0002::abcd")).toBe("v6:2001:db8:1:2::/64");
    expect(networkKey("2001:db8:1:2:3:4:5:6")).toBe("v6:2001:db8:1:2::/64");
    expect(networkKey("::ffff:103.12.44.7")).toBe("v4:103.12.44.0/24");
    expect(networkKey("::ffff:670c:2c07")).toBe("v4:103.12.44.0/24");
    expect(networkKey("invalid")).toBeNull();
  });
});
```

```ts
// Replace the existing capture-IP test body, retaining its surrounding routeSection helper.
const limiter = routeSection("async function allowAbandonedCheckoutCapture", "const rateLimitAI");
expect(limiter).toContain('req.headers["x-storefront-client-ip"]');
expect(limiter).toContain("getTrustedRequestIp(req)");
expect(limiter).not.toContain("cf-connecting-ip");
```

- [ ] **Step 2: Run tests to verify failure.** Run: `npx vitest run src/test/riskNetwork.test.ts src/test/abandonedCheckoutRouteWiring.test.ts`. Expected: missing module and old Cloudflare trust fail.
- [ ] **Step 3: Write minimal implementation.** Create `server/risk/network.js`:

```js
import { isIP } from "node:net";
const first = (value) => (Array.isArray(value) ? value[0] : value)?.split(",")[0]?.trim();
const valid = (value) => typeof value === "string" && !value.includes("%") && isIP(value.trim()) ? value.trim() : null;
export function getTrustedRequestIp(req) {
  for (const header of ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"]) {
    const ip = valid(first(req?.headers?.[header]));
    if (ip) return ip;
  }
  return valid(req?.socket?.remoteAddress);
}
function groups(ip) {
  let source = ip.toLowerCase();
  const suffix = source.slice(source.lastIndexOf(":") + 1);
  if (suffix.includes(".")) {
    const [a, b, c, d] = suffix.split(".").map(Number);
    source = `${source.slice(0, source.lastIndexOf(":") + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = source.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 && missing < 1) return null;
  const all = halves.length === 2 ? [...head, ...Array(missing).fill("0"), ...tail] : head;
  return all.length === 8 && all.every((v) => /^[0-9a-f]{1,4}$/.test(v)) ? all.map((v) => Number.parseInt(v, 16)) : null;
}
export function networkKey(ip) {
  const address = valid(ip);
  if (!address) return null;
  const v4 = (value) => `v4:${value.split(".").slice(0, 3).map(Number).join(".")}.0/24`;
  if (isIP(address) === 4) return v4(address);
  const parts = groups(address);
  if (!parts) return null;
  if (parts.slice(0, 5).every((v) => v === 0) && parts[5] === 0xffff) {
    return v4([parts[6] >> 8, parts[6] & 255, parts[7] >> 8, parts[7] & 255].join("."));
  }
  return `v6:${parts.slice(0, 4).map((v) => v.toString(16)).join(":")}::/64`;
}
```

In `server/index.js`, replace `getClientIp` body with `return getTrustedRequestIp(req);`, import the network helpers, and make `rateLimitPublicRead` use `getTrustedRequestIp(req) || "unknown"`. In `allowAbandonedCheckoutCapture`, after the verified `x-api-key`/org resolution already performed by the route, replace its `clientIp` expression with:

```js
const signed = verifyClientContext(req.headers[CLIENT_CONTEXT_HEADER], { secret: process.env.STOREFRONT_CONTEXT_SECRET });
const clientIp = signed.ok ? signed.context.ip : isIP(forwardedClientIp) ? forwardedClientIp : getTrustedRequestIp(req) || "unknown";
```

Keep `x-storefront-client-ip` only here because `/api/custom-orders/abandoned-checkouts` resolves its `x-api-key` before calling the limiter. Never use that unsigned header on public order routes. Hash the capture limiter's `clientIp` with `hashProtectionSignal(clientIp, process.env.ORDER_PROTECTION_HASH_SECRET || "order-protection-unconfigured")` before composing its Redis identifier; the same key is stable within the deployment.
- [ ] **Step 4: Run tests to verify pass.** Run: `npx vitest run src/test/riskNetwork.test.ts src/test/abandonedCheckoutRouteWiring.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.** Run: `git add server/risk/network.js server/index.js src/test/riskNetwork.test.ts src/test/abandonedCheckoutRouteWiring.test.ts && git commit -m "fix: normalize trusted network identity"`.

### Task 3: Resolve protection mode and persist shadow decisions

**Files:**
- Create: `server/risk/mode.js`
- Create: `src/test/riskMode.test.ts`
- Create: `supabase/migrations/20260923120000_order_protection_events_mode.sql`
- Modify: `server/orderProtectionPipeline.js`, `server/orderProtectionStore.js`, `server/index.js`
- Modify: `src/test/orderProtectionIntegration.test.ts`, `src/test/orderProtectionSchema.test.ts`, `src/test/orderProtectionRouteWiring.test.ts`, `src/test/orderProtectionStore.test.ts`

**Interfaces:**
- Consumes: `getSettings([`${orgId}:order_protection_mode`])`, existing `protectOrderSubmission`, `recordProtectionEvent`.
- Produces: `PROTECTION_MODES`, `PROTECTION_MODE_SETTING_SUFFIX`, `resolveProtectionMode({ envMode, settingMode }) → "off"|"shadow"|"active"`; legacy pipeline accepts `mode` and event payload includes `mode`.

- [ ] **Step 1: Write failing tests.** Add `src/test/riskMode.test.ts`:

```ts
import { expect, test } from "vitest";
import { PROTECTION_MODES, PROTECTION_MODE_SETTING_SUFFIX, resolveProtectionMode } from "../../server/risk/mode.js";
test("env kill switch and explicit mode win; missing setting is shadow", () => {
  expect(PROTECTION_MODES).toEqual(["off", "shadow", "active"]);
  expect(PROTECTION_MODE_SETTING_SUFFIX).toBe("order_protection_mode");
  expect(resolveProtectionMode({ envMode: "disabled", settingMode: "active" })).toBe("off");
  expect(resolveProtectionMode({ envMode: "off", settingMode: "active" })).toBe("off");
  expect(resolveProtectionMode({ envMode: "active", settingMode: "shadow" })).toBe("active");
  expect(resolveProtectionMode({ envMode: "shadow", settingMode: "active" })).toBe("shadow");
  expect(resolveProtectionMode({ envMode: "", settingMode: "active" })).toBe("active");
  expect(resolveProtectionMode({ envMode: "unknown", settingMode: "unknown" })).toBe("shadow");
});
```

Add to `src/test/orderProtectionIntegration.test.ts`:

```ts
test("shadow records a would-block event but proceeds without review or duplicate reservation", async () => {
  const recordEvent = vi.fn();
  const createReview = vi.fn();
  const reserveFingerprint = vi.fn();
  const result = await protectOrderSubmission({
    mode: "shadow", input: { ...input, website: "spam" },
    requestMeta: { ip: "203.0.113.5", network: "v4:203.0.113.0/24" },
    dependencies: dependencies({ recordEvent, createReview, reserveFingerprint }),
  });
  expect(result.protection.decision).toBe("ALLOW");
  expect(result.response.decision).toBe("allow");
  expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({ mode: "shadow", decision: "BLOCK", reviewId: null }));
  expect(createReview).not.toHaveBeenCalled();
  expect(reserveFingerprint).not.toHaveBeenCalled();
});
```

Add to `src/test/orderProtectionSchema.test.ts`:

```ts
test("adds nullable, constrained mode to legacy events without rewriting old rows", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260923120000_order_protection_events_mode.sql"), "utf8");
  expect(sql).toContain("add column if not exists mode text");
  expect(sql).toContain("check (mode in ('shadow', 'active'))");
  expect(sql).not.toContain("set not null");
  expect(sql).toContain("begin;");
  expect(sql).toContain("commit;");
});
```

In `src/test/orderProtectionRouteWiring.test.ts`, replace the obsolete `isOrderProtectionEnabled` string assertion with `expect(source).toContain('if (mode === "off" || !rlOrderSubmission) return true;');` (Task 4 changes this to the three limiter checks). In `src/test/orderProtectionStore.test.ts`, pass `mode: "shadow"` in the event fixture and assert `payload.mode === "shadow"`. For every existing integration test that expects an enforced BLOCK or REVIEW, pass `mode: "active"` explicitly; default missing mode now resolves to shadow.
- [ ] **Step 2: Run tests to verify failure.** Run: `npx vitest run src/test/riskMode.test.ts src/test/orderProtectionIntegration.test.ts src/test/orderProtectionSchema.test.ts src/test/orderProtectionRouteWiring.test.ts src/test/orderProtectionStore.test.ts`. Expected: missing module/migration and shadow assertion fail.
- [ ] **Step 3: Write minimal implementation.** Create `server/risk/mode.js`:

```js
export const PROTECTION_MODES = Object.freeze(["off", "shadow", "active"]);
export const PROTECTION_MODE_SETTING_SUFFIX = "order_protection_mode";
export function resolveProtectionMode({ envMode, settingMode }) {
  const env = typeof envMode === "string" ? envMode.trim().toLowerCase() : "";
  if (env === "off" || env === "disabled") return "off";
  if (env === "shadow" || env === "active") return env;
  const setting = typeof settingMode === "string" ? settingMode.trim().toLowerCase() : "";
  return setting === "active" || setting === "shadow" || setting === "off" ? setting : "shadow";
}
```

Create migration:

```sql
begin;
alter table public.order_protection_events add column if not exists mode text;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.order_protection_events'::regclass and conname = 'order_protection_events_mode_check') then
    alter table public.order_protection_events add constraint order_protection_events_mode_check check (mode in ('shadow', 'active'));
  end if;
end $$;
commit;
```

In `server/orderProtectionStore.js`, add `mode: event.mode` to `recordProtectionEvent`'s `payload`. In `server/orderProtectionPipeline.js`, replace `isOrderProtectionEnabled` import with `resolveProtectionMode`; replace the existing function signature/off branch with:

```js
export async function protectOrderSubmission({ input: rawInput, requestMeta = {}, dependencies = {}, mode = resolveProtectionMode({ envMode: process.env.ORDER_PROTECTION_MODE }) }) {
  if (mode === "off") return {
    protection: { decision: "ALLOW", score: 0, reasonCodes: [], customerMessage: "Order details accepted.", retryable: false },
    response: { decision: "allow" }, fingerprint: null,
  };
}
```

The closing brace above marks the extent of the replacement excerpt, not the end of the original function. Keep all existing subsequent statements. Replace its reservation condition with `const shouldReserve = mode === "active" && (protection.decision === "ALLOW" || protection.decision === "REVIEW");`, and its review condition with `if (mode === "active" && protection.decision === "REVIEW")`. Add `mode` to `buildEvent(input, requestMeta, protection, reviewId, mode)` and its returned object, and call it as `buildEvent(input, requestMeta, protection, review?.id || null, mode)` for either recording path. Immediately after recording and before `serializeProtectionResponse`, add:

```js
if (mode === "shadow") {
  const allowed = { decision: "ALLOW", score: 0, reasonCodes: [], customerMessage: "Order details accepted.", retryable: false };
  return { protection: allowed, response: { decision: "allow" }, review: null, fingerprint };
}
```

Do not reserve in shadow, so a shadow request cannot poison an active duplicate reservation. Missing hash secret remains retryable BLOCK in both modes because no safely hashed event can be written.

In `server/index.js` for each order handler, after resolving `orgId` and before limiter/pipeline calls:

```js
const modeKey = `${orgId}:${PROTECTION_MODE_SETTING_SUFFIX}`;
const settings = await getSettings([modeKey]);
const mode = resolveProtectionMode({ envMode: process.env.ORDER_PROTECTION_MODE, settingMode: settings[modeKey] });
```

Pass `mode` to `allowOrderSubmission` and `protectOrderSubmission`. Update the events read route select list to include `mode`; update `ProtectionEvent` in `src/lib/orderProtection.ts` to `mode: "shadow" | "active" | null` if this select is added. The legacy UI may display it as a badge in Plan E; exposing it now prevents shadow results being mistaken for enforcement.
- [ ] **Step 4: Run tests to verify pass.** Run: `npx vitest run src/test/riskMode.test.ts src/test/orderProtectionIntegration.test.ts src/test/orderProtectionSchema.test.ts src/test/orderProtectionRouteWiring.test.ts src/test/orderProtectionStore.test.ts`. Expected: PASS. Run `npm run verify:supabase-baseline` locally after migration; expected: PASS (no remote DDL).
- [ ] **Step 5: Commit.** Run: `git add server/risk/mode.js server/orderProtectionPipeline.js server/orderProtectionStore.js server/index.js src/lib/orderProtection.ts src/test/riskMode.test.ts src/test/orderProtectionIntegration.test.ts src/test/orderProtectionSchema.test.ts src/test/orderProtectionRouteWiring.test.ts src/test/orderProtectionStore.test.ts supabase/migrations/20260923120000_order_protection_events_mode.sql && git commit -m "feat: record legacy risk decisions in shadow mode"`.

### Task 4: Wire verified context and re-key order limiter

**Files:**
- Modify: `server/index.js` (both order routes, `allowOrderSubmission`, limiter setup)
- Modify: `server/orderProtectionPipeline.js` (device session and trusted remote IP)
- Modify: `src/test/orderProtectionIntegration.test.ts`, `src/test/orderProtectionRouteWiring.test.ts`
- Create: `src/test/orderLimiterWiring.test.ts`

**Interfaces:**
- Consumes: Task 1 `verifyClientContext`, `CLIENT_CONTEXT_HEADER`; Task 2 `getTrustedRequestIp`, `networkKey`; Task 3 mode; `hashProtectionSignal`.
- Produces: trusted `requestMeta = { ip, network, userAgent, deviceId }` for the legacy pipeline and `allowOrderSubmission(req, res, orgId, handle = "*", mode, clientContext = null)`; existing per-phone session hash uses trusted `deviceId` when present.

- [ ] **Step 1: Write failing tests.** Add `src/test/orderLimiterWiring.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
test("both ingress paths verify context before limiting and use hashed device/network or trusted IP", () => {
  const custom = source.slice(source.indexOf('app.post("/api/custom-orders/webhook"'), source.indexOf("// ─── Live Visitor Tracking"));
  const publicRoute = source.slice(source.indexOf("async function handlePublicHandleOrderSubmit"), source.indexOf("async function handlePublicHandleProducts"));
  for (const section of [custom, publicRoute]) {
    expect(section).toContain("verifyClientContext(req.headers[CLIENT_CONTEXT_HEADER]");
    expect(section.indexOf("verifyClientContext(")).toBeLessThan(section.indexOf("await allowOrderSubmission("));
    expect(section).toContain("networkKey(clientContext.ip)");
    expect(section).toContain("deviceId: clientContext.deviceId");
  }
  const limiter = source.slice(source.indexOf("async function allowOrderSubmission"), source.indexOf("const PRODUCT_IMAGES_BUCKET"));
  expect(limiter).toContain("rlOrderDevice.limit(");
  expect(limiter).toContain("rlOrderNetwork.limit(");
  expect(limiter).toContain("rlOrderUntrustedIp.limit(");
  expect(limiter).toContain("return true;");
  expect(limiter).not.toContain("res.status(503)");
});
```

Add to `src/test/orderProtectionIntegration.test.ts`:

```ts
test("trusted device becomes the session counter identity and verified IP reaches Turnstile", async () => {
  const recordPhoneSignal = vi.fn();
  const verifyTurnstile = vi.fn().mockResolvedValue({ ok: true });
  await protectOrderSubmission({
    mode: "active", input,
    requestMeta: { ip: "103.12.44.7", network: "v4:103.12.44.0/24", deviceId: "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e" },
    dependencies: dependencies({ recordPhoneSignal, verifyTurnstile }),
  });
  expect(recordPhoneSignal).toHaveBeenCalledWith(expect.objectContaining({ requestMeta: expect.objectContaining({ deviceId: "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e" }) }));
  expect(verifyTurnstile).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify failure.** Run: `npx vitest run src/test/orderLimiterWiring.test.ts src/test/orderProtectionIntegration.test.ts src/test/orderProtectionRouteWiring.test.ts`. Expected: limiter and context assertions fail.
- [ ] **Step 3: Write minimal implementation.** In `server/index.js`, replace `rlOrderSubmission` with three `Ratelimit` instances (same Upstash Redis):

```js
rlOrderDevice = new Ratelimit({ redis: redisClient, limiter: Ratelimit.slidingWindow(5, "15 m"), prefix: "rl:order-submission:device" });
rlOrderNetwork = new Ratelimit({ redis: redisClient, limiter: Ratelimit.slidingWindow(20, "15 m"), prefix: "rl:order-submission:network" });
rlOrderUntrustedIp = new Ratelimit({ redis: redisClient, limiter: Ratelimit.slidingWindow(60, "15 m"), prefix: "rl:order-submission:untrusted-ip" });
```

Replace `allowOrderSubmission`'s identifier/check body with:

```js
async function allowOrderSubmission(req, res, orgId, handle = "*", mode, clientContext = null) {
  if (mode === "off" || !rlOrderDevice || !rlOrderNetwork || !rlOrderUntrustedIp) return true;
  const secret = process.env.ORDER_PROTECTION_HASH_SECRET;
  if (!secret || secret.length < 16) return true; // pipeline returns retryable configuration BLOCK
  const network = clientContext ? networkKey(clientContext.ip) : null;
  const checks = clientContext?.deviceId
    ? [[rlOrderDevice, `dev:${hashProtectionSignal(clientContext.deviceId, secret)}`],
       [rlOrderNetwork, `net:${hashProtectionSignal(network || clientContext.ip, secret)}`]]
    : [[rlOrderUntrustedIp, `ip:${hashProtectionSignal(getTrustedRequestIp(req) || "unknown", secret)}`]];
  try {
    for (const [limiter, key] of checks) {
      const { success, limit, remaining, reset } = await limiter.limit(`${orgId}:${handle}:${key}`);
      res.setHeader("X-RateLimit-Limit", limit);
      res.setHeader("X-RateLimit-Remaining", remaining);
      res.setHeader("X-RateLimit-Reset", reset);
      if (!success && mode === "active") {
        const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
        res.setHeader("Retry-After", retryAfter);
        res.status(429).json({ error: "rate_limit_exceeded", message: "Too many order attempts. Please try again shortly.", retryAfter });
        return false;
      }
    }
    return true;
  } catch {
    console.warn("[OrderProtection] order limiter unavailable");
    return true;
  }
}
```

At both routes, after mode resolution and before limiter, verify the header and construct metadata:

```js
const verified = verifyClientContext(req.headers[CLIENT_CONTEXT_HEADER], { secret: process.env.STOREFRONT_CONTEXT_SECRET });
const clientContext = verified.ok ? verified.context : null;
const requestMeta = {
  ip: clientContext?.ip || getTrustedRequestIp(req),
  network: networkKey(clientContext?.ip || getTrustedRequestIp(req)),
  userAgent: clientContext?.userAgent ?? req.headers["user-agent"],
  deviceId: clientContext?.deviceId || null,
};
```

Pass `clientContext` to `allowOrderSubmission(req, res, orgId, handle, mode, clientContext)`, and `requestMeta` and `mode` to `protectOrderSubmission`. Make the code spell `networkKey(clientContext.ip)` in the trusted branch so the source-wiring assertion explicitly verifies it. In the pipeline use `remoteIp: requestMeta.ip` for Turnstile and `sessionHash: (requestMeta.deviceId || input.clientSessionId) ? hashProtectionSignal(requestMeta.deviceId || input.clientSessionId, secret) : null`; use `requestMeta.network` for `networkHash`. Preserve `clientSessionId` fallback only for untrusted requests. Do not expose verification reasons or raw identifiers in logs.
- [ ] **Step 4: Run tests to verify pass.** Run: `npx vitest run src/test/orderLimiterWiring.test.ts src/test/orderProtectionIntegration.test.ts src/test/orderProtectionRouteWiring.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.** Run: `git add server/index.js server/orderProtectionPipeline.js src/test/orderLimiterWiring.test.ts src/test/orderProtectionIntegration.test.ts src/test/orderProtectionRouteWiring.test.ts && git commit -m "fix: limit orders by verified device and network"`.

### Task 5: Deterministic checkout and fail-to-hold dependencies

**Files:**
- Modify: `server/orderSubmissionProtection.js`, `server/orderProtectionPipeline.js`, `server/orderProtectionStore.js`, `server/turnstile.js`, `server/index.js`, `.env.example`, `docs/runbooks/order-protection.md`
- Delete: `server/addressValidation.js`, `src/test/addressValidation.test.ts`
- Modify: `src/test/orderSubmissionProtection.test.ts`, `src/test/orderProtectionContract.test.ts`, `src/test/orderProtectionIntegration.test.ts`, `src/test/orderProtectionVerification.test.ts`, `src/test/orderProtectionStore.test.ts`

**Interfaces:**
- Consumes: existing deterministic `evaluateProtection`, `verifyTurnstileToken`, Redis count/reservation/signal writes.
- Produces: `verifyTurnstileToken` returns `{ ok: false, unconfigured: true }` for missing secret; Turnstile failure adds 20 points and requests REVIEW; Turnstile unavailable and Redis unavailable request REVIEW; missing hash secret remains retryable BLOCK.

- [ ] **Step 1: Write failing tests.** Replace AI-specific cases in `src/test/orderSubmissionProtection.test.ts` (`allows … after all-order AI`, `blocks gibberish … AI`, `blocks AI-detected harassment`, `fails closed … AI`, `fails closed … Turnstile`, `parses … address-validation JSON`) with:

```ts
test("no address validator is required; vague addresses get deterministic review", async () => {
  const normal = await evaluateProtection(normalInput(), safeDependencies({ validateAddress: undefined }));
  const vague = await evaluateProtection(normalInput({ address: "near the market" }), safeDependencies({ validateAddress: undefined }));
  expect(normal.decision).toBe("ALLOW");
  expect(vague).toMatchObject({ decision: "REVIEW", reasonCodes: ["address_too_vague"] });
});
test("failed Turnstile adds 20 points and holds, while unconfigured adds nothing", async () => {
  const failed = await evaluateProtection(normalInput(), safeDependencies({ validateTurnstile: async () => ({ ok: false }) }));
  const unavailable = await evaluateProtection(normalInput(), safeDependencies({ validateTurnstile: async () => ({ ok: false, unavailable: true }) }));
  const unconfigured = await evaluateProtection(normalInput(), safeDependencies({ validateTurnstile: async () => ({ ok: false, unconfigured: true }) }));
  expect(failed).toMatchObject({ decision: "REVIEW", score: 20, reasonCodes: ["turnstile_failed"] });
  expect(unavailable).toMatchObject({ decision: "REVIEW", reasonCodes: ["turnstile_failed"] });
  expect(unconfigured).toMatchObject({ decision: "ALLOW", score: 0, reasonCodes: [] });
});
```

Retain existing deterministic honeypot, abusive/test content, missing/short address, duplicate, and velocity tests. Remove `parseAddressValidationResult` import and all `validateAddress` fixtures. In `src/test/orderProtectionIntegration.test.ts`, add:

```ts
test("Redis counts unavailable produces a durable review, not a BLOCK", async () => {
  const createReview = vi.fn().mockResolvedValue({ id: "review-redis" });
  const result = await protectOrderSubmission({
    mode: "active", input,
    dependencies: dependencies({ redis: null, createReview, recordEvent: vi.fn() }),
  });
  expect(result.protection.decision).toBe("REVIEW");
  expect(result.review?.id).toBe("review-redis");
  expect(createReview).toHaveBeenCalledOnce();
});
```

In `src/test/orderProtectionStore.test.ts`, add a missing-secret Turnstile case:

```ts
test("missing Turnstile configuration does not penalize checkout", async () => {
  expect(await verifyTurnstileToken({ token: "x", secret: "" })).toEqual({ ok: false, unconfigured: true });
  expect(await verifyTurnstileToken({ token: "", secret: "configured" })).toEqual({ ok: false });
});
```

Update `src/test/orderProtectionContract.test.ts` to remove `address_invalid`, `address_validation_unavailable`, and `aiHardBlockRiskScore` expectations while keeping `address_too_vague`. Update `src/test/orderProtectionVerification.test.ts` to assert `STOREFRONT_CONTEXT_SECRET=`, no `ADDRESS_VALIDATION_` and runbook `shadow`/`Redis`/`retryable` wording instead of `gpt-4o-mini`.
- [ ] **Step 2: Run tests to verify failure.** Run: `npx vitest run src/test/orderSubmissionProtection.test.ts src/test/orderProtectionContract.test.ts src/test/orderProtectionIntegration.test.ts src/test/orderProtectionVerification.test.ts src/test/orderProtectionStore.test.ts`. Expected: AI-dependent assertions and Redis/Turnstile fail-to-hold tests fail.
- [ ] **Step 3: Write minimal implementation.** In `server/orderSubmissionProtection.js`, delete `parseAddressValidationResult`, `ADDRESS_ACTIONS`, `aiHardBlockRiskScore`, `address_invalid`, and `address_validation_unavailable`. Remove the `validateAddress` branch entirely; keep deterministic missing/short BLOCK and abusive/test BLOCK, and add `address_too_vague` when `signals.addressVague`. Replace Turnstile early BLOCK with:

```js
let turnstileFailed = false;
if (typeof dependencies.validateTurnstile === "function") {
  try {
    const check = await dependencies.validateTurnstile(input);
    turnstileFailed = !check?.ok && !check?.unconfigured;
  } catch { turnstileFailed = true; }
}
```

After `scoredSignals`, add `if (turnstileFailed) reasonCodes.push("turnstile_failed");`, then calculate and return:

```js
const score = Math.min(100, calculateProtectionScore(scoredSignals) + (turnstileFailed ? 20 : 0));
return result(
  score >= ORDER_PROTECTION_THRESHOLDS.reviewScore || scoredSignals.phoneVelocity15m || turnstileFailed || dependencies.dependencyUnavailable
    ? "REVIEW" : "ALLOW",
  score,
  reasonCodes,
);
```

In `server/turnstile.js`, split the initial guard:

```js
if (typeof secret !== "string" || !secret.trim()) return { ok: false, unconfigured: true };
if (typeof token !== "string" || !token.trim()) return { ok: false };
```

In `server/orderProtectionPipeline.js`, catch `countRecentPhoneSignals` rejection and map `counts.unavailable` to `dependencyUnavailable: true` for `evaluateProtection`, with zero counts as placeholders for scoring only. Catch Redis `exists` in the `isDuplicate` adapter, `recordPhoneSignal`, and `reserveSubmissionFingerprint` exceptions; set the same `dependencyUnavailable` flag and force REVIEW, not BLOCK. When the reservation returns `{ unavailable: true }`, also force REVIEW. For an available duplicate reservation that explicitly loses (`{ reserved: false, unavailable: false }`), preserve duplicate BLOCK. Pass the flag to `evaluateProtection`; after all writes, if it became true later and the result was ALLOW, change it to `REVIEW` with the existing review customer message before creating the durable review. Persist REVIEW via `createProtectionReview`, then record the legacy event, without logging PII. Shadow still records the would-be outcome but returns ALLOW; active REVIEW returns existing 202 response. Keep missing `ORDER_PROTECTION_HASH_SECRET` as retryable BLOCK before Redis access.

Remove `validateAddressWithAI` import and both dependencies in `server/index.js`; delete `server/addressValidation.js` and its dedicated test. In `.env.example`, remove `ADDRESS_VALIDATION_MODEL`, `ADDRESS_VALIDATION_PROVIDER`, `ADDRESS_VALIDATION_TIMEOUT_MS`. Rewrite the relevant runbook paragraphs: `ORDER_PROTECTION_MODE=off|shadow|active` precedence, `${orgId}:order_protection_mode` setting and shadow event recording without reviews, server-only `STOREFRONT_CONTEXT_SECRET`, 5/device + 20/network + 60/untrusted-IP limits per 15m, deterministic address checks, Turnstile failed/missing/unavailable and Redis unavailable → HOLD in active mode, missing Turnstile secret → no penalty, missing hash secret → retryable 503 BLOCK and operator configuration fix, no AI checkout, and no order/stock/purchase event on active HOLD/BLOCK. State that shadow decisions are recorded in `order_protection_events` until Plan D.
- [ ] **Step 4: Run tests to verify pass.** Run: `npx vitest run src/test/orderSubmissionProtection.test.ts src/test/orderProtectionContract.test.ts src/test/orderProtectionIntegration.test.ts src/test/orderProtectionVerification.test.ts src/test/orderProtectionStore.test.ts src/test/orderProtectionRouteWiring.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.** Run: `git add server/orderSubmissionProtection.js server/orderProtectionPipeline.js server/orderProtectionStore.js server/turnstile.js server/index.js server/addressValidation.js .env.example docs/runbooks/order-protection.md src/test/addressValidation.test.ts src/test/orderSubmissionProtection.test.ts src/test/orderProtectionContract.test.ts src/test/orderProtectionIntegration.test.ts src/test/orderProtectionVerification.test.ts src/test/orderProtectionStore.test.ts && git commit -m "fix: hold uncertain checkout decisions without AI"`.

### Task 6: Complete verification and route-contract gate

**Files:**
- Test: `src/test/orderProtectionRouteWiring.test.ts`, `src/test/abandonedCheckoutRouteWiring.test.ts`, `src/test/orderLimiterWiring.test.ts`
- Review: `server/index.js`, `server/orderProtectionPipeline.js`, `docs/runbooks/order-protection.md`

**Interfaces:**
- Consumes: Task 1–5 modules and both unchanged customer-facing route response formats.
- Produces: evidence that public v1 and custom webhook protection run before order insert, shadow returns normal order success, active REVIEW returns 202 and active BLOCK returns 403 (configuration BLOCK remains retryable 503).

- [ ] **Step 1: Write failing regression assertions** in `src/test/orderProtectionRouteWiring.test.ts`:

```ts
it("resolves settings and signed context before protection on both routes", () => {
  const custom = sectionBetween('app.post("/api/custom-orders/webhook"', "// ─── Live Visitor Tracking");
  const storefront = sectionBetween("async function handlePublicHandleOrderSubmit", "async function handlePublicHandleProducts");
  for (const route of [custom, storefront]) {
    expect(route).toContain("PROTECTION_MODE_SETTING_SUFFIX");
    expect(route).toContain("verifyClientContext(req.headers[CLIENT_CONTEXT_HEADER]");
    expect(route.indexOf("verifyClientContext(")).toBeLessThan(route.indexOf("await protectOrderSubmission("));
    expect(route).toContain("mode,");
  }
  expect(source).not.toContain('from "./addressValidation.js"');
  expect(source).not.toContain('req.headers["cf-connecting-ip"]');
});
```

- [ ] **Step 2: Run targeted tests.** Run: `npx vitest run src/test/orderProtectionRouteWiring.test.ts src/test/abandonedCheckoutRouteWiring.test.ts src/test/orderLimiterWiring.test.ts`. Expected: FAIL if any source-wiring/contract assertion was omitted; otherwise PASS, in which case proceed directly to the full checks rather than making a gratuitous code change.
- [ ] **Step 3: Make the minimal repair if the regression test fails.** For the specific missing route block, use the exact code below before `await allowOrderSubmission`:

```js
const modeKey = `${orgId}:${PROTECTION_MODE_SETTING_SUFFIX}`;
const settings = await getSettings([modeKey]);
const mode = resolveProtectionMode({ envMode: process.env.ORDER_PROTECTION_MODE, settingMode: settings[modeKey] });
const verified = verifyClientContext(req.headers[CLIENT_CONTEXT_HEADER], { secret: process.env.STOREFRONT_CONTEXT_SECRET });
const clientContext = verified.ok ? verified.context : null;
```

For any other failure, repair the named invariant from its owning task and rerun its focused test before the full checks; do not alter unrelated source or weaken assertions.
- [ ] **Step 4: Run tests and build to verify pass.** Run: `npm test`, `npm run lint`, `npm run build`, then `npm run verify:supabase-baseline` locally. Expected: all exit 0. Examine `git diff --check` and `git status --short`; confirm only intended files are staged and the unrelated pre-existing staged `server/index.js` changes are not included in a commit. Do not apply the migration remotely.
- [ ] **Step 5: Commit only if Step 3 changed files.** Run: `git add src/test/orderProtectionRouteWiring.test.ts && git commit -m "test: guard risk foundation route wiring"`. If no changes were needed, record the final command outputs in the execution handoff and make no empty commit.
