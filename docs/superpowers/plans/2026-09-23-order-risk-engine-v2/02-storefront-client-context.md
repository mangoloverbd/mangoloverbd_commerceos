# Order Risk Engine v2 — Storefront Client Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supply Merchant Suite with signed, bounded customer context and fix the four storefront checkouts so genuine orders can be allowed, held, or blocked accurately.

**Architecture:** All implementation tasks edit **only the separate storefront repository** (`/Users/noorkarimmehedi/conductor/repos/mangoloverbd_storefront`); this plan is stored in commerceos for coordination. The Vercel function and local Express server validate browser hints, read a server-set device cookie, sign context with the same private secret, and omit the hints from the forwarded order body. One client hook collects telemetry and fingerprint traits for all four checkouts; a 202 review response becomes a terminal confirmation without a purchase event.

**Tech Stack:** Storefront React 19, TypeScript, Vercel Node functions, local Express, Zod, `node:test`/`node:assert/strict`; Node 24 for native TypeScript tests, `node --import tsx --test` where existing extensionless imports or `.js`-to-`.ts` resolution require it.

## Global Constraints

- Begin execution by creating a **storefront** branch/worktree at `origin/main` (`git -C /Users/noorkarimmehedi/conductor/repos/mangoloverbd_storefront fetch origin` then `git -C /Users/noorkarimmehedi/conductor/repos/mangoloverbd_storefront worktree add -b feat/order-risk-storefront <chosen-worktree-path> origin/main`). Never implement against the other branch in the current storefront checkout. Run every task and commit in that worktree; read its `AGENTS.md`/`CLAUDE.md` first.
- Shared contracts are fixed by `00-overview.md` §§2–3: header `x-mlbd-client-context`; `${payloadB64url}.${signatureHex}` with `payloadB64url = base64url(JSON.stringify(context))` and `signatureHex = HMAC-SHA256(STOREFRONT_CONTEXT_SECRET, payloadB64url)` hex. Secret is ≥32 chars in **both** Vercel projects, server-only, never `VITE_`-prefixed. Merchant Suite accepts age ≤60,000 ms and future skew ≤5,000 ms.
- Context v1 property order is `v, issuedAt, ip, userAgent, geo, deviceId, fingerprint, telemetry`; `geo` order is `country, region, city`; `telemetry` order is `firstInteractionAt, phoneCandidates, pastedFields`. `ip` comes from `x-vercel-forwarded-for` → `x-real-ip` → first `x-forwarded-for` hop, validated with `node:net` `isIP`; absent valid IP means no signed header. No `cf-connecting-ip` trust.
- Browser order additions are `deviceFingerprint?: string` (64 lowercase hex) and `checkoutTelemetry?: { firstInteractionAt?: string; phoneCandidates?: string[]; pastedFields?: Array<"name"|"phone"|"address"> }`. They move into the signed context and are **not** forwarded in the JSON body. Existing `website`, `turnstileToken`, `clientSessionId`, `checkoutStartedAt` stay in the body.
- Device cookie: `mlbd_did=<UUID v4>; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`, set by `/api/orders` and `/api/abandoned-carts` when missing/invalid. Browser JS must not read it.
- Valid BD mobile phone is `^01[3-9]\d{8}$`. Client validation and both order proxy validators must agree. No AI or OTP in checkout; missing/invalid context is handled as untrusted by Merchant Suite, not silently allowed.
- Storefront uses wouter and lucide-react, not Merchant Suite's router/icons. Preserve live product and stock validation and the existing `apiRequest`/abandoned-draft paths. No real order submissions, production env changes, deployment, database access, or secret commits during implementation.
- Colocated tests are `*.test.ts`, `node:assert/strict`; run `node --test <file>` for self-contained tests and `node --import tsx --test <file>` where source imports require TS resolution. Final checks: `npm run check`, touched tests, `npm run build`. Inspect `git status` after build because the catalog snapshot is generated. Commit one task at a time.

---

## File map

| Storefront file | Responsibility |
|---|---|
| `server/client-context.ts` | Header extraction, bounded context v1 construction, shared HMAC signing, telemetry parsing |
| `server/device-id.ts` | UUID v4 cookie parsing and Set-Cookie preservation |
| `api/orders.ts`, `server/order-service.ts`, `server/routes.ts` | Vercel/local validation and context-bearing order forwarding |
| `api/abandoned-carts.ts`, `server/abandoned-cart-service.ts` | Context-bearing abandoned capture with legacy IP header preserved |
| `client/src/lib/device-fingerprint.ts` | Browser trait collection and stable SHA-256 digest |
| `client/src/lib/order-protection.ts` | First-focus, phone/paste telemetry, fingerprint, Turnstile reset and payload assembly |
| `client/src/components/turnstile-challenge.tsx`, `order-hold-confirmation.tsx` | Token lifecycle and terminal HOLD confirmation |
| `client/src/components/order-dialog.tsx`, `client/src/features/{sundarbans-honey/honey,kalojira-mixed/kalojira,honey-nut/honey-nut}-checkout.tsx` | Four checkout surfaces |
| `client/src/features/{sundarbans-honey,kalojira-mixed,honey-nut}/order.ts` | Existing campaign payload phone validation |
| `.env.example` | Server-only secret template and deployment checklist |

## Task 1: Sign the exact shared client-context contract

**Files:** Create `server/client-context.ts`, `server/client-context.test.ts`.

**Interfaces:** Produces `CLIENT_CONTEXT_HEADER`, `CheckoutTelemetryInput`, `ClientContextV1`, `parseCheckoutTelemetry(value: unknown): CheckoutTelemetryInput | null`, `buildClientContext(req: {headers: IncomingHttpHeaders}, input: {deviceId: string|null; fingerprint?: string|null; telemetry?: CheckoutTelemetryInput|null; now?: number}): ClientContextV1|null`, `signClientContext(context: ClientContextV1, secret: string): string`, `createSignedClientContext(req, input, secret?: string): string|undefined`.

- [ ] **Step 1: Write failing tests.** Create `server/client-context.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildClientContext, signClientContext, createSignedClientContext, parseCheckoutTelemetry } from "./client-context.ts";

const secret = "test-context-secret-0123456789abcdef";
const fingerprint = "a".repeat(64);
const deviceId = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const context = {
  v: 1 as const, issuedAt: "2026-09-23T10:00:00.000Z", ip: "103.12.44.7",
  userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/128.0 Mobile",
  geo: { country: "BD", region: "C", city: "Dhaka" }, deviceId, fingerprint,
  telemetry: { firstInteractionAt: "2026-09-23T09:59:20.000Z", phoneCandidates: ["01712345678"], pastedFields: [] },
};
// Copy this identical literal into Merchant Suite Plan A's verification test.
const header = "eyJ2IjoxLCJpc3N1ZWRBdCI6IjIwMjYtMDktMjNUMTA6MDA6MDAuMDAwWiIsImlwIjoiMTAzLjEyLjQ0LjciLCJ1c2VyQWdlbnQiOiJNb3ppbGxhLzUuMCAoTGludXg7IEFuZHJvaWQgMTQpIENocm9tZS8xMjguMCBNb2JpbGUiLCJnZW8iOnsiY291bnRyeSI6IkJEIiwicmVnaW9uIjoiQyIsImNpdHkiOiJEaGFrYSJ9LCJkZXZpY2VJZCI6IjNmMmI4YzFlLTRkNWEtNGI2Yy04ZDdlLTlmMGExYjJjM2Q0ZSIsImZpbmdlcnByaW50IjoiYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYSIsInRlbGVtZXRyeSI6eyJmaXJzdEludGVyYWN0aW9uQXQiOiIyMDI2LTA5LTIzVDA5OjU5OjIwLjAwMFoiLCJwaG9uZUNhbmRpZGF0ZXMiOlsiMDE3MTIzNDU2NzgiXSwicGFzdGVkRmllbGRzIjpbXX19.df202c83d99119befb5ec3bcfd3b624e4617105f9d9e831f89990628511ac440";

test("shared cross-repo HMAC vector and key order", () => {
  assert.equal(signClientContext(context, secret), header);
  assert.deepEqual(buildClientContext({ headers: {
    "x-vercel-forwarded-for": "103.12.44.7", "user-agent": context.userAgent,
    "x-vercel-ip-country": "BD", "x-vercel-ip-country-region": "C", "x-vercel-ip-city": "Dhaka",
  } }, { deviceId, fingerprint, telemetry: context.telemetry, now: Date.parse(context.issuedAt) }), context);
});
test("trusted IP fallback, bounded geo, and missing-IP fail-open at transport", () => {
  const result = buildClientContext({ headers: {
    "x-vercel-forwarded-for": "bad", "x-real-ip": "103.12.44.7",
    "x-forwarded-for": "203.0.113.5, 10.0.0.1", "user-agent": "U".repeat(500),
    "x-vercel-ip-city": "Cox%27s%20Bazar",
  } }, { deviceId });
  assert.equal(result?.ip, "103.12.44.7");
  assert.equal(result?.userAgent?.length, 400);
  assert.equal(result?.geo.city, "Cox's Bazar");
  assert.equal(buildClientContext({ headers: { "cf-connecting-ip": "103.12.44.7" } }, { deviceId }), null);
  assert.equal(createSignedClientContext({ headers: { "x-real-ip": "103.12.44.7" } }, { deviceId }, "short"), undefined);
});
test("telemetry is bounded before signing", () => {
  assert.deepEqual(parseCheckoutTelemetry({ phoneCandidates: ["01712345678"], pastedFields: ["phone"] }),
    { phoneCandidates: ["01712345678"], pastedFields: ["phone"] });
  for (const value of [{ firstInteractionAt: "yesterday" }, { pastedFields: ["email"] },
    { phoneCandidates: Array(6).fill("01712345678") }, { phoneCandidates: ["abc"] }]) {
    assert.equal(parseCheckoutTelemetry(value), null);
  }
});
```

- [ ] **Step 2: Run:** `node --test server/client-context.test.ts`. **Expected:** FAIL resolving `./client-context.ts`.
- [ ] **Step 3: Implement.** Create `server/client-context.ts`:

```ts
import { createHmac } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { isIP } from "node:net";

export const CLIENT_CONTEXT_HEADER = "x-mlbd-client-context";
export type PastedField = "name" | "phone" | "address";
export type CheckoutTelemetryInput = { firstInteractionAt?: string; phoneCandidates?: string[]; pastedFields?: PastedField[] };
export type ClientContextV1 = {
  v: 1; issuedAt: string; ip: string; userAgent: string | null;
  geo: { country: string | null; region: string | null; city: string | null };
  deviceId: string | null; fingerprint: string | null;
  telemetry: { firstInteractionAt: string | null; phoneCandidates: string[]; pastedFields: PastedField[] };
};
type Request = { headers: IncomingHttpHeaders };
type Input = { deviceId: string | null; fingerprint?: string | null; telemetry?: CheckoutTelemetryInput | null; now?: number };
const header = (req: Request, name: string) => {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
};
const bounded = (value: string | undefined, max: number) => value?.trim().slice(0, max) || null;
const geo = (value: string | undefined) => {
  if (!value) return null;
  try { return bounded(decodeURIComponent(value), 80); } catch { return bounded(value, 80); }
};
export function parseCheckoutTelemetry(value: unknown): CheckoutTelemetryInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const result: CheckoutTelemetryInput = {};
  if (data.firstInteractionAt !== undefined) {
    if (typeof data.firstInteractionAt !== "string" || data.firstInteractionAt.length > 64
      || !Number.isFinite(Date.parse(data.firstInteractionAt))) return null;
    result.firstInteractionAt = data.firstInteractionAt;
  }
  if (data.phoneCandidates !== undefined) {
    if (!Array.isArray(data.phoneCandidates) || data.phoneCandidates.length > 5
      || !data.phoneCandidates.every((p) => typeof p === "string" && /^\d{11}$/.test(p))) return null;
    result.phoneCandidates = [...new Set(data.phoneCandidates as string[])];
  }
  if (data.pastedFields !== undefined) {
    if (!Array.isArray(data.pastedFields) || data.pastedFields.length > 3
      || !data.pastedFields.every((f) => f === "name" || f === "phone" || f === "address")) return null;
    result.pastedFields = [...new Set(data.pastedFields as PastedField[])];
  }
  return result;
}
export function buildClientContext(req: Request, input: Input): ClientContextV1 | null {
  let ip: string | null = null;
  for (const name of ["x-vercel-forwarded-for", "x-real-ip", "x-forwarded-for"]) {
    const candidate = header(req, name)?.split(",")[0]?.trim();
    if (candidate && isIP(candidate)) { ip = candidate; break; }
  }
  if (!ip) return null;
  const telemetry = input.telemetry ?? {};
  return {
    v: 1, issuedAt: new Date(input.now ?? Date.now()).toISOString(), ip,
    userAgent: bounded(header(req, "user-agent"), 400),
    geo: { country: geo(header(req, "x-vercel-ip-country")),
      region: geo(header(req, "x-vercel-ip-country-region")), city: geo(header(req, "x-vercel-ip-city")) },
    deviceId: input.deviceId,
    fingerprint: input.fingerprint && /^[0-9a-f]{64}$/.test(input.fingerprint) ? input.fingerprint : null,
    telemetry: { firstInteractionAt: telemetry.firstInteractionAt ?? null,
      phoneCandidates: telemetry.phoneCandidates ?? [], pastedFields: telemetry.pastedFields ?? [] },
  };
}
export function signClientContext(context: ClientContextV1, secret: string): string {
  const payload = Buffer.from(JSON.stringify(context)).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("hex")}`;
}
export function createSignedClientContext(req: Request, input: Input, secret?: string): string | undefined {
  if (!secret || secret.length < 32) return undefined;
  const context = buildClientContext(req, input);
  return context ? signClientContext(context, secret) : undefined;
}
```

- [ ] **Step 4: Run:** `node --test server/client-context.test.ts && npm run check`. **Expected:** PASS.
- [ ] **Step 5: Commit:** `git add server/client-context.ts server/client-context.test.ts && git commit -m "feat: sign storefront client context"`.

## Task 2: Issue and reuse the server-set device cookie

**Files:** Create `server/device-id.ts`, `server/device-id.test.ts`.

**Interfaces:** Produces `readOrCreateDeviceId(req: {headers: IncomingHttpHeaders}, res: {getHeader(name): OutgoingHttpHeader|undefined; setHeader(name,value): unknown}): {deviceId:string; isNew:boolean}`. The same helper is imported by both Vercel functions and local Express routes.

- [ ] **Step 1: Write failing test** in `server/device-id.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { readOrCreateDeviceId } from "./device-id.ts";

test("reuses UUID v4; replaces invalid cookie and preserves other Set-Cookie headers", () => {
  const id = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
  const headers = new Map<string, string | string[]>([["Set-Cookie", ["session=abc; Path=/"]]]);
  const res = { getHeader: (name: string) => headers.get(name),
    setHeader: (name: string, value: string | string[]) => { headers.set(name, value); } };
  assert.deepEqual(readOrCreateDeviceId({ headers: { cookie: `other=1; mlbd_did=${id}` } }, res), { deviceId: id, isNew: false });
  assert.deepEqual(headers.get("Set-Cookie"), ["session=abc; Path=/"]);
  const next = readOrCreateDeviceId({ headers: { cookie: "mlbd_did=11111111-1111-1111-8111-111111111111" } }, res);
  assert.equal(next.isNew, true);
  assert.match(next.deviceId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(headers.get("Set-Cookie"), ["session=abc; Path=/",
    `mlbd_did=${next.deviceId}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`]);
});
```

- [ ] **Step 2: Run:** `node --test server/device-id.test.ts`. **Expected:** FAIL resolving `./device-id.ts`.
- [ ] **Step 3: Implement** `server/device-id.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders, OutgoingHttpHeader } from "node:http";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function readOrCreateDeviceId(
  req: { headers: IncomingHttpHeaders },
  res: { getHeader(name: string): OutgoingHttpHeader | undefined; setHeader(name: string, value: string | string[]): unknown },
): { deviceId: string; isNew: boolean } {
  const part = req.headers.cookie?.split(";").find((entry) => entry.trim().startsWith("mlbd_did="));
  const current = part?.trim().slice("mlbd_did=".length);
  if (current && UUID_V4.test(current)) return { deviceId: current.toLowerCase(), isNew: false };
  const deviceId = randomUUID();
  const cookie = `mlbd_did=${deviceId}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;
  const existing = res.getHeader("Set-Cookie");
  const cookies = existing === undefined ? [] : Array.isArray(existing) ? [...existing].map(String) : [String(existing)];
  res.setHeader("Set-Cookie", [...cookies, cookie]);
  return { deviceId, isNew: true };
}
```

- [ ] **Step 4: Run:** `node --test server/device-id.test.ts && npm run check`. **Expected:** PASS.
- [ ] **Step 5: Commit:** `git add server/device-id.ts server/device-id.test.ts && git commit -m "feat: set first-party device cookie"`.

## Task 3: Validate order hints and sign both order proxy paths

**Files:** Modify `api/orders.ts`, `api/orders.test.ts`, `server/order-service.ts`, `server/order-service.test.ts`, `server/routes.ts`. Keep existing request size, item, draft-key, landing-attribution, ALLOW/HOLD/BLOCK handling intact.

**Interfaces:** `OrderRequest` and `orderRequestSchema` add optional `deviceFingerprint`, `checkoutTelemetry` as in Global Constraints. `processOrder(order, dependencies?: { …; clientContextHeader?: string })` sends `x-mlbd-client-context` only when supplied; route/handler derives it from `createSignedClientContext(req, {deviceId, fingerprint: order.deviceFingerprint, telemetry: order.checkoutTelemetry}, process.env.STOREFRONT_CONTEXT_SECRET)`. For injectability, handler dependency `processOrder?: (order, dependencies?: {clientContextHeader?:string}) => Promise<OrderProcessResult>` and local route dependency use the same second argument.

- [ ] **Step 1: Add failing tests** to `api/orders.test.ts` and `server/order-service.test.ts` (reuse each file's `validOrder`, `canonicalItems`, `dependencies`, request/response helpers):

```ts
// api/orders.test.ts
test("rejects fake 11-digit phones and malformed browser hints", () => {
  assert.throws(() => validateOrder({ ...validOrder, phone: "12345678901" }));
  assert.throws(() => validateOrder({ ...validOrder, deviceFingerprint: "A".repeat(64) }));
  assert.throws(() => validateOrder({ ...validOrder, checkoutTelemetry: { phoneCandidates: ["123"] } }));
  assert.deepEqual(validateOrder({ ...validOrder, deviceFingerprint: "a".repeat(64),
    checkoutTelemetry: { pastedFields: ["phone"] } }).checkoutTelemetry, { pastedFields: ["phone"] });
});
test("moves client hints to a signed header, leaving canonical body unchanged", async () => {
  let headers: Record<string, string> | undefined;
  let body: Record<string, unknown> | undefined;
  await processOrder(validateOrder({ ...validOrder, deviceFingerprint: "a".repeat(64),
    checkoutTelemetry: { phoneCandidates: ["01712345678"] } }), {
    ...dependencies, clientContextHeader: "signed.payload",
    fetchImpl: async (_url, init) => {
      headers = init?.headers as Record<string, string>; body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ orderRef: "ML-1" }), { status: 201 });
    },
  });
  assert.equal(headers?.["x-mlbd-client-context"], "signed.payload");
  assert.equal("deviceFingerprint" in (body ?? {}), false);
  assert.equal("checkoutTelemetry" in (body ?? {}), false);
});
// server/order-service.test.ts
test("local schema and forwarder match signed order contract", async () => {
  assert.throws(() => orderRequestSchema.parse({ ...validEnglishOrder, phone: "12345678901" }));
  const order = orderRequestSchema.parse({ ...validEnglishOrder, deviceFingerprint: "a".repeat(64),
    checkoutTelemetry: { firstInteractionAt: "2026-09-23T10:00:00.000Z", pastedFields: ["address"] } });
  let headers: Record<string, string> | undefined;
  let body: Record<string, unknown> | undefined;
  await processOrder(order, { ...dependencies, clientContextHeader: "signed.payload",
    fetchImpl: async (_url, init) => {
      headers = init?.headers as Record<string, string>; body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ orderRef: "ML-2" }), { status: 201 });
    } });
  assert.equal(headers?.["x-mlbd-client-context"], "signed.payload");
  assert.equal("deviceFingerprint" in (body ?? {}), false);
  assert.equal("checkoutTelemetry" in (body ?? {}), false);
});
```

Add a route test using existing `invokeLocalOrder`: inject `processOrder: async (_order, options) => { assert.match(options?.clientContextHeader ?? "", /^[\w-]+\.[0-9a-f]{64}$/); return {orderRef:"ML-3"}; }`, set `STOREFRONT_CONTEXT_SECRET` to the test secret with `try/finally` restoring the previous value, and send `x-real-ip: 103.12.44.7`. Extend the helper's `fetch` headers argument (and response result to include `set-cookie`) to assert the UUID cookie; add an equivalent Vercel handler injection test. Set `STOREFRONT_CONTEXT_SECRET` to a short value and assert no header for both paths. Existing `api/orders.test.ts` has **two stale exact-body assertions** lacking `items: canonicalItems`; update those expected objects to match the already-forwarded canonical items before relying on the full file's PASS.

- [ ] **Step 2: Run:** `node --import tsx --test api/orders.test.ts server/order-service.test.ts`. **Expected:** new phone/hint/header tests FAIL.
- [ ] **Step 3: Implement** the following precise additions, preserving all existing body fields. In `api/orders.ts` import `CLIENT_CONTEXT_HEADER, createSignedClientContext, parseCheckoutTelemetry` from `../server/client-context.js` and `readOrCreateDeviceId` from `../server/device-id.js` (Vercel's runtime-resolvable `.js` convention). Add these validated fields to `OrderRequest` and to `validateOrder` just before the return:

```ts
const deviceFingerprint = value.deviceFingerprint;
if (deviceFingerprint !== undefined && (typeof deviceFingerprint !== "string" || !/^[0-9a-f]{64}$/.test(deviceFingerprint))) throw new OrderValidationError();
const checkoutTelemetry = value.checkoutTelemetry === undefined ? undefined : parseCheckoutTelemetry(value.checkoutTelemetry);
if (value.checkoutTelemetry !== undefined && !checkoutTelemetry) throw new OrderValidationError();
// In the returned OrderRequest object:
...(deviceFingerprint !== undefined ? { deviceFingerprint } : {}),
...(checkoutTelemetry !== undefined ? { checkoutTelemetry } : {}),
```

Change `!/^\d{11}$/.test(phone)` to `!/^01[3-9]\d{8}$/.test(phone)`. Extend `OrderServiceDependencies` with `clientContextHeader?: string` and add `...(dependencies.clientContextHeader ? { [CLIENT_CONTEXT_HEADER]: dependencies.clientContextHeader } : {})` to the existing fetch headers (not the body). In `createOrderHandler` after POST-method guard call `const { deviceId } = readOrCreateDeviceId(req, res);`; after validation:

```ts
const clientContextHeader = createSignedClientContext(req, {
  deviceId, fingerprint: order.deviceFingerprint, telemetry: order.checkoutTelemetry,
}, process.env.STOREFRONT_CONTEXT_SECRET);
const result = await submitOrder(order, clientContextHeader ? { clientContextHeader } : {});
```

Rename the handler's local `process` function to `submitOrder` so it does not shadow Node's `process.env`; widen its injected signature to take the second options argument. In `server/order-service.ts`, import `CLIENT_CONTEXT_HEADER, type CheckoutTelemetryInput` from `./client-context.ts`; add to the Zod object:

```ts
deviceFingerprint: z.string().regex(/^[0-9a-f]{64}$/).optional(),
checkoutTelemetry: z.object({
  firstInteractionAt: z.string().max(64).refine((s) => Number.isFinite(Date.parse(s))).optional(),
  phoneCandidates: z.array(z.string().regex(/^\d{11}$/)).max(5).optional(),
  pastedFields: z.array(z.enum(["name", "phone", "address"])).max(3).optional(),
}).strict().optional(),
```

Change phone regex to `/^01[3-9]\d{8}$/`; add `clientContextHeader?: string` to service dependencies and conditional header as above. In `server/routes.ts`, import `createSignedClientContext` and `readOrCreateDeviceId`; immediately after the `/api/orders` handler starts, call `readOrCreateDeviceId(req, res)`; after schema parse pass signed header to `submitOrder(order, options)` using the same code as the Vercel handler. Widen `RouteDependencies.processOrder` to accept options and rename its local `process` binding to `submitOrder`. Do not forward the two new fields in either JSON body; retain all existing fields, including `items`.

- [ ] **Step 4: Run:** `node --import tsx --test api/orders.test.ts server/order-service.test.ts && npm run check`. **Expected:** PASS. Verify both handlers with valid and short/missing secret; no raw header when unconfigured.
- [ ] **Step 5: Commit:** `git add api/orders.ts api/orders.test.ts server/order-service.ts server/order-service.test.ts server/routes.ts && git commit -m "feat: forward signed order context on both server paths"`.

## Task 4: Carry signed context on abandoned-cart captures

**Files:** Modify `api/abandoned-carts.ts`, `api/abandoned-carts.test.ts`, `server/abandoned-cart-service.ts`, `server/abandoned-cart-service.test.ts`, `server/routes.ts`.

**Interfaces:** Keep `x-storefront-client-ip` on the Vercel path for compatibility. Add `clientContextHeader?: string` to capture-service options; route/handler signs with device ID and default empty telemetry, with `fingerprint: null`. The existing `AbandonedCartCapture` body remains strict and unchanged; no browser hints are inserted into it.

- [ ] **Step 1: Add failing tests** in `api/abandoned-carts.test.ts` and `server/abandoned-cart-service.test.ts`:

```ts
// api/abandoned-carts.test.ts: augment existing service forwarding test's dependencies
clientContextHeader: "signed.capture",
// and its exact expected header object:
"x-mlbd-client-context": "signed.capture",
// server/abandoned-cart-service.test.ts: augment existing service forwarding test likewise
clientContextHeader: "signed.capture",
// then assert:
assert.equal((requestInit?.headers as Record<string, string>)["x-mlbd-client-context"], "signed.capture");
```

Add Vercel/local handler tests injecting a capture processor that records its options. Send a valid capture with `x-vercel-forwarded-for` (or local `x-real-ip`), set `STOREFRONT_CONTEXT_SECRET` to `test-context-secret-0123456789abcdef` in `try/finally`, assert `options.clientContextHeader` matches `/^[\w-]+\.[0-9a-f]{64}$/`, `set-cookie` contains `mlbd_did=`, and decoded context has `deviceId` and empty telemetry. For Vercel, keep existing assertion that source does not import the local Express server; the shared pure modules are allowed.

- [ ] **Step 2: Run:** `node --import tsx --test api/abandoned-carts.test.ts server/abandoned-cart-service.test.ts`. **Expected:** new header/cookie assertions FAIL.
- [ ] **Step 3: Implement.** In `api/abandoned-carts.ts` import `CLIENT_CONTEXT_HEADER, createSignedClientContext` and `readOrCreateDeviceId` via `../server/*.js`; in `server/abandoned-cart-service.ts` import `CLIENT_CONTEXT_HEADER` via `./client-context.ts`. In both service dependency types add `clientContextHeader?: string` and to the existing fetch headers add:

```ts
...(dependencies.clientContextHeader ? { [CLIENT_CONTEXT_HEADER]: dependencies.clientContextHeader } : {}),
```

In Vercel handler after the POST-method guard (and before body validation):

```ts
const { deviceId } = readOrCreateDeviceId(req, res);
const clientContextHeader = createSignedClientContext(req, { deviceId, fingerprint: null, telemetry: {} }, process.env.STOREFRONT_CONTEXT_SECRET);
await processCapture(capture, {
  forwardedClientIp: getVercelClientIp(req),
  ...(clientContextHeader ? { clientContextHeader } : {}),
});
```

Widen `CaptureHandlerDependencies.processCapture` and its default adapter to pass `clientContextHeader` to `processAbandonedCartCapture`. In `server/routes.ts` perform the same cookie/signing step in `/api/abandoned-carts`, passing `{ clientContextHeader }` to the existing local capture service; widen `RouteDependencies.processAbandonedCartCapture` second argument accordingly. Preserve both Vercel's legacy `x-storefront-client-ip` and its existing capture body. Sign immediately before forwarding so `issuedAt` remains fresh.

- [ ] **Step 4: Run:** `node --import tsx --test api/abandoned-carts.test.ts server/abandoned-cart-service.test.ts && npm run check`. **Expected:** PASS.
- [ ] **Step 5: Commit:** `git add api/abandoned-carts.ts api/abandoned-carts.test.ts server/abandoned-cart-service.ts server/abandoned-cart-service.test.ts server/routes.ts && git commit -m "feat: sign abandoned checkout client context"`.

## Task 5: Hash guarded browser fingerprint traits

**Files:** Create `client/src/lib/device-fingerprint.ts`, `client/src/lib/device-fingerprint.test.ts`.

**Interfaces:** `collectFingerprintTraits(): Record<string, unknown>`; `hashTraits(traits: Record<string,unknown>): Promise<string>`; `computeDeviceFingerprint(): Promise<string|null>`. No raw traits leave the browser; no cookie or secret access.

- [ ] **Step 1: Write failing test** in `client/src/lib/device-fingerprint.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { collectFingerprintTraits, hashTraits, computeDeviceFingerprint } from "./device-fingerprint.ts";

test("stable SHA-256 is independent of object key insertion order", async () => {
  const expected = createHash("sha256").update('{"a":1,"b":{"x":2,"y":3}}').digest("hex");
  assert.equal(await hashTraits({ b: { y: 3, x: 2 }, a: 1 }), expected);
  assert.equal(await hashTraits({ a: 1, b: { x: 2, y: 3 } }), expected);
});
test("server render has guarded traits and returns a 64-hex fingerprint", async () => {
  assert.equal(typeof collectFingerprintTraits(), "object");
  const value = await computeDeviceFingerprint();
  assert.match(value ?? "", /^[0-9a-f]{64}$/);
});
```

- [ ] **Step 2: Run:** `node --test client/src/lib/device-fingerprint.test.ts`. **Expected:** FAIL resolving module.
- [ ] **Step 3: Implement** `client/src/lib/device-fingerprint.ts`:

```ts
const safe = (read: () => unknown) => { try { return read() ?? null; } catch { return null; } };
export function collectFingerprintTraits(): Record<string, unknown> {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const scr = typeof screen === "undefined" ? undefined : screen;
  const canvas = safe(() => document.createElement("canvas")) as HTMLCanvasElement | null;
  const canvasText = safe(() => {
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.font = "14px sans-serif"; ctx.fillText("Mango Lover BD 123", 2, 16);
    return canvas.toDataURL();
  });
  const webgl = safe(() => {
    const gl = canvas?.getContext("webgl");
    if (!gl) return null;
    const extension = gl.getExtension("WEBGL_debug_renderer_info");
    return extension ? { vendor: gl.getParameter(extension.UNMASKED_VENDOR_WEBGL),
      renderer: gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) } : null;
  });
  return {
    screen: safe(() => ({ width: scr?.width, height: scr?.height, colorDepth: scr?.colorDepth })),
    devicePixelRatio: safe(() => window.devicePixelRatio),
    timezone: safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    languages: safe(() => [...(nav?.languages ?? [])]), platform: safe(() => nav?.platform),
    hardwareConcurrency: safe(() => nav?.hardwareConcurrency),
    deviceMemory: safe(() => (nav as Navigator & { deviceMemory?: number } | undefined)?.deviceMemory),
    maxTouchPoints: safe(() => nav?.maxTouchPoints), canvasText, webgl,
  };
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  return value;
}
export async function hashTraits(traits: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(stable(traits)));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function computeDeviceFingerprint(): Promise<string | null> {
  try { return await hashTraits(collectFingerprintTraits()); } catch { return null; }
}
```

- [ ] **Step 4: Run:** `node --test client/src/lib/device-fingerprint.test.ts && npm run check`. **Expected:** PASS.
- [ ] **Step 5: Commit:** `git add client/src/lib/device-fingerprint.ts client/src/lib/device-fingerprint.test.ts && git commit -m "feat: hash browser device traits"`.

## Task 6: Collect checkout telemetry and resettable Turnstile state

**Files:** Modify `client/src/lib/order-protection.ts`, `client/src/lib/order-protection.test.ts`, `client/src/components/turnstile-challenge.tsx`; create `client/src/components/turnstile-challenge.test.ts` (source-level lifecycle assertion). Existing `getOrCreateClientSessionId` stays.

**Interfaces:** `useCheckoutProtectionSignals()` returns `formHandlers: {onFocusCapture, onPasteCapture}`, `trackPhoneCandidate(value:string):void`, `fingerprint:string|null`, `resetTurnstileSignal:number`, `resetTurnstile():void`, `buildProtectionPayload(website:string): {website:string; turnstileToken:string; clientSessionId:string; checkoutStartedAt:string; deviceFingerprint?:string; checkoutTelemetry:{firstInteractionAt?:string;phoneCandidates:string[];pastedFields:PastedField[]}}`, `setTurnstileToken`. `TurnstileChallenge` accepts `resetSignal?: number` and `onToken`.

- [ ] **Step 1: Write failing tests** in `client/src/lib/order-protection.test.ts` and new `client/src/components/turnstile-challenge.test.ts`:

```ts
// Add to order-protection.test.ts; import the new pure helpers.
import { addPhoneCandidate, addPastedField, firstFocusTimestamp } from "./order-protection";
test("first focus wins; only five distinct 11-digit candidates and named paste fields remain", () => {
  assert.equal(firstFocusTimestamp("2026-09-23T10:00:00.000Z", "2026-09-23T10:01:00.000Z"), "2026-09-23T10:00:00.000Z");
  assert.deepEqual(["01712345678", "01712345678", "01812345678", "01912345678", "01312345678", "01412345678", "01512345678", "abc"]
    .reduce(addPhoneCandidate, [] as string[]), ["01712345678", "01812345678", "01912345678", "01312345678", "01412345678"]);
  assert.deepEqual(["phone", "address", "phone", "email", "name"].reduce(addPastedField, [] as Array<"name"|"phone"|"address">), ["phone", "address", "name"]);
});
// turnstile-challenge.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
test("Turnstile resets existing widget and clears token when resetSignal changes", () => {
  const source = readFileSync(new URL("./turnstile-challenge.tsx", import.meta.url), "utf8");
  assert.match(source, /resetSignal/);
  assert.match(source, /window\.turnstile\.reset\(widgetIdRef\.current\)/);
  assert.match(source, /onToken\(""\)/);
});
```

- [ ] **Step 2: Run:** `node --import tsx --test client/src/lib/order-protection.test.ts client/src/components/turnstile-challenge.test.ts`. **Expected:** FAIL missing pure helpers/reset prop.
- [ ] **Step 3: Implement.** Add pure helpers and replace the old hook body in `order-protection.ts` (retain the session ID helper; replace its existing `useState` import with the import below):

```ts
import { useEffect, useRef, useState, type FocusEvent, type ClipboardEvent } from "react";
import { computeDeviceFingerprint } from "./device-fingerprint";
type Field = "name" | "phone" | "address";
export const firstFocusTimestamp = (current: string | null, incoming: string) => current ?? incoming;
export function addPhoneCandidate(current: string[], value: string): string[] {
  const phone = value.trim();
  return /^\d{11}$/.test(phone) && !current.includes(phone) && current.length < 5 ? [...current, phone] : current;
}
export function addPastedField(current: Field[], value: string): Field[] {
  return (value === "name" || value === "phone" || value === "address") && !current.includes(value)
    ? [...current, value] : current;
}
export function useCheckoutProtectionSignals() {
  const [clientSessionId] = useState(() => getOrCreateClientSessionId());
  const [mountedAt] = useState(() => new Date().toISOString());
  const firstInteractionAt = useRef<string | null>(null);
  const phoneCandidates = useRef<string[]>([]);
  const pastedFields = useRef<Field[]>([]);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [resetTurnstileSignal, setResetTurnstileSignal] = useState(0);
  useEffect(() => { void computeDeviceFingerprint().then(setFingerprint); }, []);
  const formHandlers = {
    onFocusCapture: (_event: FocusEvent<HTMLFormElement>) => {
      firstInteractionAt.current = firstFocusTimestamp(firstInteractionAt.current, new Date().toISOString());
    },
    onPasteCapture: (event: ClipboardEvent<HTMLFormElement>) => {
      const name = (event.target as HTMLInputElement | HTMLTextAreaElement).name;
      pastedFields.current = addPastedField(pastedFields.current, name);
    },
  };
  const trackPhoneCandidate = (value: string) => { phoneCandidates.current = addPhoneCandidate(phoneCandidates.current, value); };
  const resetTurnstile = () => { setTurnstileToken(""); setResetTurnstileSignal((n) => n + 1); };
  const buildProtectionPayload = (website: string) => ({
    website, turnstileToken, clientSessionId,
    checkoutStartedAt: firstInteractionAt.current ?? mountedAt,
    ...(fingerprint ? { deviceFingerprint: fingerprint } : {}),
    checkoutTelemetry: {
      ...(firstInteractionAt.current ? { firstInteractionAt: firstInteractionAt.current } : {}),
      phoneCandidates: [...phoneCandidates.current], pastedFields: [...pastedFields.current],
    },
  });
  return { formHandlers, trackPhoneCandidate, fingerprint, resetTurnstileSignal,
    resetTurnstile, buildProtectionPayload, setTurnstileToken };
}
```

In `turnstile-challenge.tsx`, accept `resetSignal = 0` and add an effect (with a ref storing the last signal) that ignores the initial mount and, on changes, calls `onToken("")` and `window.turnstile.reset(widgetIdRef.current)` only if the widget exists; if script has not rendered yet, its next render uses the new token. Keep the existing expiry/error callbacks. Use `useRef` for `onToken` to avoid rerendering the widget from a changed callback:

```tsx
const onTokenRef = useRef(onToken);
useEffect(() => { onTokenRef.current = onToken; }, [onToken]);
const previousReset = useRef(resetSignal);
useEffect(() => {
  if (previousReset.current === resetSignal) return;
  previousReset.current = resetSignal;
  onTokenRef.current("");
  if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
}, [resetSignal]);
```

Replace render callbacks with `onTokenRef.current(token)`/`onTokenRef.current("")` and remove `onToken` from the render effect dependencies.

- [ ] **Step 4: Run:** `node --import tsx --test client/src/lib/order-protection.test.ts client/src/components/turnstile-challenge.test.ts && npm run check`. **Expected:** PASS.
- [ ] **Step 5: Commit:** `git add client/src/lib/order-protection.ts client/src/lib/order-protection.test.ts client/src/components/turnstile-challenge.tsx client/src/components/turnstile-challenge.test.ts && git commit -m "feat: collect first-focus checkout telemetry"`.

## Task 7: Wire four checkouts and enforce the BD phone rule

**Files:** Modify `client/src/components/order-dialog.tsx`, three `client/src/features/*/*-checkout.tsx`, three `client/src/features/*/order.ts`, their `order.test.ts`, `client/src/lib/order-protection.test.ts`; create `client/src/checkout-risk-wiring.test.ts`.

**Interfaces:** Consumes Task 6 hook (`formHandlers`, `trackPhoneCandidate`, `buildProtectionPayload`, `resetTurnstileSignal`, `resetTurnstile`, `setTurnstileToken`). Preserve existing `beginCheckout` analytics on campaign form focus; its handler now calls both `beginCheckout()` and `formHandlers.onFocusCapture(event)`.

- [ ] **Step 1: Write failing source/invariant tests** in `client/src/checkout-risk-wiring.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const files = ["./components/order-dialog.tsx", "./features/sundarbans-honey/honey-checkout.tsx",
  "./features/kalojira-mixed/kalojira-checkout.tsx", "./features/honey-nut/honey-nut-checkout.tsx"];
test("every checkout wires protected form telemetry and resets Turnstile after submission", () => {
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /buildProtectionPayload\(website\)/, file);
    assert.match(source, /onPasteCapture=\{formHandlers\.onPasteCapture\}/, file);
    assert.match(source, /trackPhoneCandidate\(/, file);
    assert.match(source, /resetSignal=\{resetTurnstileSignal\}/, file);
    assert.match(source, /resetTurnstile\(\)/, file);
    assert.match(source, /\^01\[3-9\]\\d\{8\}\$/, file);
  }
});
test("dialog honeypot is a form child, never a success child", () => {
  const source = readFileSync(new URL("./components/order-dialog.tsx", import.meta.url), "utf8");
  const form = source.indexOf("<form");
  const honeypot = source.indexOf('name="website"');
  assert.ok(form >= 0 && honeypot > form && honeypot < source.indexOf("</form>", form));
  assert.equal(source.slice(0, form).includes('name="website"'), false);
});
```

Add to each campaign `order.test.ts` a failing case asserting its existing `build*OrderPayload` rejects `phone: "12345678901"` (use the existing valid fixture and pack setup in each file). This closes the currently permissive helper path even if the form validator is bypassed.

- [ ] **Step 2: Run:** `node --import tsx --test client/src/checkout-risk-wiring.test.ts client/src/features/sundarbans-honey/order.test.ts client/src/features/kalojira-mixed/order.test.ts client/src/features/honey-nut/order.test.ts`. **Expected:** new wiring and phone cases FAIL.
- [ ] **Step 3: Implement** the concrete changes in all four checkouts:

```tsx
// Hook destructuring replaces old clientSessionId/checkoutStartedAt/turnstileToken variables:
const { formHandlers, trackPhoneCandidate, buildProtectionPayload,
  resetTurnstileSignal, resetTurnstile, setTurnstileToken } = useCheckoutProtectionSignals();
// On each <form>:
onPasteCapture={formHandlers.onPasteCapture}
// Dialog only:
onFocusCapture={formHandlers.onFocusCapture}
// Three campaign forms (preserve begin_checkout):
onFocusCapture={(event) => { beginCheckout(); formHandlers.onFocusCapture(event); }}
// Controlled campaign phone input onChange:
onChange={(event) => { setPhone(event.target.value); trackPhoneCandidate(event.target.value); }}
// Dialog form onInput (preserve updateCapture):
onInput={(event) => {
  if ((event.target as HTMLInputElement).name === "phone") trackPhoneCandidate((event.target as HTMLInputElement).value);
  updateCapture();
}}
// On submit, after extracting website from FormData and before posting:
...buildProtectionPayload(website),
// On challenge:
<TurnstileChallenge onToken={setTurnstileToken} resetSignal={resetTurnstileSignal} />
// On all four post-attempt finally blocks:
resetTurnstile();
```

In `order-dialog.tsx`, move the existing `<input name="website" ... />` from the `orderSubmitted ?` success branch to the first child of `<form>`. Replace `/^\d{11}$/` with `/^01[3-9]\d{8}$/`, and set the Bengali phone error to `"১৩–১৯ সিরিজের ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর লিখুন।"`. Change the dialog phone `pattern` to `01[3-9][0-9]{8}`; likewise the Sundarbans/Kalojira patterns (Honey Nut currently has no pattern: add one). Replace the three campaign field validation regexes and Bengali error text identically. Remove obsolete explicit `website, turnstileToken, clientSessionId, checkoutStartedAt` payload entries; spread `buildProtectionPayload(website)` in their place. Retain every existing item, shipping, draft key, landing path and refresh field. Add `resetTurnstile()` to dialog `finally` and campaign `finally` so retries get a new token even after upstream/network/stock failures. In each of `client/src/features/sundarbans-honey/order.ts`, `kalojira-mixed/order.ts`, `honey-nut/order.ts`, replace its `/^\d{11}$/` phone regex with `/^01[3-9]\d{8}$/`.

- [ ] **Step 4: Run:** `node --import tsx --test client/src/checkout-risk-wiring.test.ts client/src/lib/order-protection.test.ts client/src/features/sundarbans-honey/order.test.ts client/src/features/kalojira-mixed/order.test.ts client/src/features/honey-nut/order.test.ts && npm run check`. **Expected:** PASS. Update any older source-level assertion only if its assertion describes moved markup; preserve its behavioral intent.
- [ ] **Step 5: Commit:** `git add client/src/components/order-dialog.tsx client/src/features client/src/lib/order-protection.test.ts client/src/checkout-risk-wiring.test.ts && git commit -m "fix: validate phones and send checkout telemetry"`.

## Task 8: Make HOLD a terminal confirmation on all four surfaces

**Files:** Create `client/src/components/order-hold-confirmation.tsx`, `client/src/components/order-hold-confirmation.test.ts`; modify `client/src/components/order-dialog.tsx`, three campaign checkout components, `client/src/checkout-risk-wiring.test.ts`. Existing three thank-you pages remain ALLOW-only.

**Interfaces:** `OrderHoldConfirmation(): JSX.Element` displays the exact approved Bangla wording. `OrderProtectionMessage` already accepts `retryable?: boolean`: pass the actual `OrderProtectionError.retryable` on BLOCK.

- [ ] **Step 1: Write failing tests** in `client/src/components/order-hold-confirmation.test.ts` (both test cases below use paths relative to this new file):

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
test("HOLD copy does not claim a confirmed purchase", () => {
  const source = readFileSync(new URL("./order-hold-confirmation.tsx", import.meta.url), "utf8");
  assert.match(source, /আপনার অর্ডারটি পেয়েছি। আমাদের টিম ফোন করে অর্ডারটি নিশ্চিত করবে।/);
  assert.doesNotMatch(source, /trackGoogleEcommerceEvent|trackMerchantSuiteEvent/);
});
test("all four checkouts replace the form on review and pass BLOCK retryability", () => {
  for (const file of ["./order-dialog.tsx", "../features/sundarbans-honey/honey-checkout.tsx",
    "../features/kalojira-mixed/kalojira-checkout.tsx", "../features/honey-nut/honey-nut-checkout.tsx"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /protectionDecision === "review"\s*\?\s*<OrderHoldConfirmation/, file);
    assert.match(source, /capture\.clear\(\)/, file);
    assert.match(source, /setProtectionRetryable\(error\.retryable\)/, file);
    assert.match(source, /retryable=\{protectionRetryable\}/, file);
  }
});
```

- [ ] **Step 2: Run:** `node --test client/src/components/order-hold-confirmation.test.ts`. **Expected:** FAIL missing component/conditional.
- [ ] **Step 3: Implement** `client/src/components/order-hold-confirmation.tsx`:

```tsx
export function OrderHoldConfirmation() {
  return <section role="status" aria-live="polite" className="mx-auto max-w-lg py-12 text-center">
    <h2 className="text-2xl font-semibold">অর্ডারটি পেয়েছি</h2>
    <p className="mt-4 text-base leading-7">আপনার অর্ডারটি পেয়েছি। আমাদের টিম ফোন করে অর্ডারটি নিশ্চিত করবে।</p>
  </section>;
}
```

In each checkout import this component; add `const [protectionRetryable, setProtectionRetryable] = useState(true);`. On typed block set `setProtectionRetryable(error.retryable)` and render `<OrderProtectionMessage decision="block" retryable={protectionRetryable} />` (existing component already handles its generic WhatsApp link). On 202 review set `protectionDecision` to `"review"`, `capture.clear()`, and stop further handling. In the dialog's review branch call `onSuccess?.()` to clear the cart via `cart-drawer.tsx`'s existing `onSuccess={clearCart}`, while retaining the no-op for product-page buy-now; do **not** set `orderSubmitted` or `orderRef` and do **not** call `trackMerchantSuiteEvent("purchased")` or `trackGoogleEcommerceEvent("purchase")`. Change the dialog's body choice from `orderSubmitted ? success : form` to `orderSubmitted ? success : protectionDecision === "review" ? <OrderHoldConfirmation /> : form`, with a close button outside the form for the review state. For campaign components, branch after the existing `status === "loading"` return and before the form return:

```tsx
if (protectionDecision === "review") return <OrderHoldConfirmation />;
```

Do not write an order confirmation to `sessionStorage` or navigate to a `/thank-you` page in a review branch; thank-you pages emit purchase analytics only for actual ALLOW orders. Ensure a repeated click cannot submit a held form (it is unmounted). Keep `capture.clear()` after both ALLOW and HOLD; don't finalize/recreate the held draft on dialog close.

- [ ] **Step 4: Run:** `node --import tsx --test client/src/components/order-hold-confirmation.test.ts client/src/checkout-risk-wiring.test.ts client/src/pages/google-analytics-wiring.test.ts client/src/abandoned-cart-checkout-wiring.test.ts && npm run check`. **Expected:** PASS.
- [ ] **Step 5: Commit:** `git add client/src/components/order-hold-confirmation.tsx client/src/components/order-hold-confirmation.test.ts client/src/components/order-dialog.tsx client/src/features client/src/checkout-risk-wiring.test.ts && git commit -m "feat: show received confirmation for held orders"`.

## Task 9: Document secret rollout and verify the storefront worktree

**Files:** Modify **storefront** `.env.example`; create `server/context-config.test.ts` (the deployment instructions are comments in `.env.example`, not a production change).

**Interfaces:** `STOREFRONT_CONTEXT_SECRET` must be the **same ≥32-character value** on both storefront and Merchant Suite; no `VITE_` version.

- [ ] **Step 1: Write failing test** `server/context-config.test.ts`:

```ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
test("deployment template documents the private shared context secret", () => {
  const source = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(source, /^STOREFRONT_CONTEXT_SECRET=$/m);
  assert.match(source, /at least 32 characters/);
  assert.match(source, /both Vercel projects/);
  assert.match(source, /redeploy/);
  assert.doesNotMatch(source, /^VITE_STOREFRONT_CONTEXT_SECRET=/m);
});
```

- [ ] **Step 2: Run:** `node --test server/context-config.test.ts`. **Expected:** FAIL missing env template entry.
- [ ] **Step 3: Append** to storefront `.env.example`:

```dotenv
# Server-only. Must equal Merchant Suite's STOREFRONT_CONTEXT_SECRET and contain
# at least 32 characters. Never prefix with VITE_ or expose in browser code.
STOREFRONT_CONTEXT_SECRET=

# Deployment checklist (after implementation, outside this plan's code changes):
# 1. Set the same randomly generated secret in both Vercel projects' server env.
# 2. Redeploy both projects so functions read the new env.
# 3. Verify a signed checkout context in shadow mode with synthetic fixtures.
# Do not change production env vars or submit a real order during implementation.
```

- [ ] **Step 4: Run:** `node --test server/context-config.test.ts && npm run check && node --import tsx --test server/client-context.test.ts server/device-id.test.ts api/orders.test.ts api/abandoned-carts.test.ts server/order-service.test.ts server/abandoned-cart-service.test.ts client/src/lib/device-fingerprint.test.ts client/src/lib/order-protection.test.ts client/src/components/turnstile-challenge.test.ts client/src/components/order-hold-confirmation.test.ts client/src/checkout-risk-wiring.test.ts client/src/features/sundarbans-honey/order.test.ts client/src/features/kalojira-mixed/order.test.ts client/src/features/honey-nut/order.test.ts client/src/pages/google-analytics-wiring.test.ts client/src/abandoned-cart-checkout-wiring.test.ts && npm run build && git status --short`. **Expected:** PASS; inspect and exclude any build-generated catalog snapshot unrelated to this work. Existing `api/orders.test.ts` stale expected bodies are explicitly fixed in Task 3. If unrelated baseline failures remain, record them without changing their implementation to hide the result.
- [ ] **Step 5: Commit:** `git add .env.example server/context-config.test.ts && git commit -m "docs: document shared storefront context secret"`. Review the storefront diff for request/response PII, missing `clientContextHeader` on either route, and unsafe browser exposure before handing Plan B to Plan A integration. No deployment in this task.

## Contract notes

- The design spec §5.5 calls the browser value `fingerprintHash`; shared overview §2 calls the signed field `fingerprint`. This plan uses **`fingerprint`** in context and **`deviceFingerprint`** in the browser body, exactly as the shared contract requires.
- The spec's generic “valid 11-digit phone” wording is superseded by the exact shared BD mobile rule `^01[3-9]\d{8}$`. The three campaign `order.ts` builders also validate phone and need the same fix.
- The storefront `origin/main` already has two stale exact-body assertions in `api/orders.test.ts` that omit `items` even though `processOrder` forwards them. Task 3 corrects those assertions to the existing public API contract.
- In local development `x-real-ip`/`x-forwarded-for` can be client-supplied; the shared header precedence is preserved for parity. Production provenance depends on the storefront function running behind trusted Vercel headers. Without a valid IP or configured secret, no header is emitted; Merchant Suite's untrusted-context HOLD behavior applies in active mode. Plan A must verify the same test-vector bytes.
