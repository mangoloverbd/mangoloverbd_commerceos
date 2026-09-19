# Order Editor FraudShield Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show full FraudShield customer risk data on all four order editing surfaces, backed by a phone-keyed cache that keeps daily API usage under ~800 requests at 1200 orders/day.

**Architecture:** A new `fraud_checks` table stores one row per normalized phone holding the *complete* FraudShield response. A new `server/fraudShield.js` module owns the API client and cache resolution, with all I/O injected so it is unit-testable. Reads (`GET /api/fraud/lookup`) are cache-only and never spend quota; only explicit writes (`POST /api/fraud/check`) and a 5-minute cron warm do. One React component, `FraudPanel`, renders a collapsed strip on every surface.

**Tech Stack:** Express (ESM, Node 20), Supabase JS with the service-role client, React 18 + TypeScript, TanStack Query v5, Tailwind, Phosphor Icons, Vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-09-19-order-editor-fraud-panel-design.md`
**UI mockup (option C — Strip):** `docs/superpowers/specs/assets/2026-09-19-fraud-panel-demo.html` — open it in a browser before Task 6.

## Global Constraints

- **Single-tenant workspace guard.** Every query touching `fraud_checks` or `orders` MUST filter `.eq("org_id", orgId)`. `orgId` comes only from `getUserOrg(supabase, user.id)` — never from the request body, query string, or any client input. (`CLAUDE.md` §4, hard rule 2.)
- **Auth on every new route.** `const token = getToken(req); const { user } = await getUser(token); if (!user) return res.status(401).json({ error: "Unauthorized" });` at the top of each handler. (`CLAUDE.md` hard rule 3.)
- **Phone normalization.** Always `normalizeBdPhone()` (imported into `server/index.js:70` from `server/abandonedCheckouts.js:105`) before a phone reaches FraudShield or the cache. (`CLAUDE.md` hard rule 7.)
- **No DDL at runtime.** Schema changes go in `supabase/migrations/` only. `src/test/noRuntimeDatabaseMigrations.test.ts` enforces this — never add migration calls to `server/index.js`.
- **Frontend API calls use `apiFetch()`** from `src/lib/api.ts`. Never raw `fetch()` for authenticated endpoints. (`CLAUDE.md` hard rule 1.)
- **Icons:** Phosphor (`@phosphor-icons/react`) with `weight="light"`. (`CLAUDE.md` hard rule 5.)
- **Design tokens:** background `bg-[#FAFAF8]`; labels `text-[8px] font-medium uppercase tracking-[0.3em] text-black`. Status colours reuse the existing pills in `src/components/order-editor/CustomerPanel.tsx:108`: safe `#2e9e5b`/`#e3f5e9`, caution `#b97f1f`/`#fdf3e3`, high risk `#d05555`/`#fdecec`. **Introduce no new colours.**
- **New server routes go in the Fraud domain section of `server/index.js`**, next to the existing `app.post("/api/check-fraud"` at line 8225. Do not create new top-level server files except `server/fraudShield.js`.
- **API key** stays `process.env.FRAUDSHIELD_API_KEY`. Never move it to `app_settings`, never send it to the browser.
- **Constants (exact values):** `FRAUD_CACHE_TTL_DAYS = 30`, `FRAUD_ERROR_RETRY_HOURS = 1`, `FRAUD_QUOTA_RESERVE = 100`, `FRAUD_PENDING_CLAIM_SECONDS = 60`, `FRAUD_WARM_BATCH = 40`, `FRAUD_WARM_SPACING_MS = 400`, `FRAUD_WARM_LOOKBACK_DAYS = 7`.
- **Commit trailer.** Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```
- **Test commands:** `npx vitest run src/test/<file>` for one file, `npm test` for all, `npm run lint`, `npm run build`.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260919000000_fraud_checks_cache.sql` | **Create.** The `fraud_checks` table, indexes, RLS, grants. |
| `server/fraudShield.js` | **Create.** FraudShield client + cache resolution. All I/O injected as callbacks, following the `server/storefrontSeoRefresh.js` pattern. No Supabase import. |
| `server/index.js` | **Modify.** Delete `parseFraudShieldError` (line 758) and `checkFraudStatus` (line 785); import from the new module. Add Supabase adapters and five routes in the Fraud section. |
| `vercel.json` | **Modify.** Add the `*/5 * * * *` warm cron. |
| `src/lib/fraudRisk.ts` | **Create.** Shared presentation helpers: risk level → colour classes/label, phone masking, relative age. Pure, no React. |
| `src/hooks/useFraudCheck.ts` | **Create.** TanStack Query hook: cache-only lookup query + check mutation. |
| `src/components/order-editor/FraudPanel.tsx` | **Create.** The Strip component, all six states. |
| `src/components/order-editor/CustomerPanel.tsx` | **Modify.** Render `FraudPanel`; delete the dead `risk_level` field and type entry. |
| `src/pages/NewOrder.tsx` | **Modify.** Add the strip, remove the `runFraudCheck` checkbox. |
| `src/pages/AbandonedDetail.tsx` | **Modify.** Pass phone through to `CustomerPanel`. |
| `src/pages/InboxOrders.tsx` | **Unchanged.** It is a table, not an editor. Task 4 already routes its checks through the shared cache. |
| `src/components/FraudUsageMeter.tsx` | **Create.** Daily quota meter for Settings. |
| `src/pages/Settings.tsx` | **Modify.** Render the meter above `IntegrationSettings`. |

Tests created: `src/test/fraudChecksSchema.test.ts`, `src/test/fraudShield.test.ts`, `src/test/fraudShieldCache.test.ts`, `src/test/fraudRouteWiring.test.ts`, `src/test/fraudWarmCron.test.ts`, `src/test/fraudPanel.test.tsx`, `src/test/fraudPanelPlacement.test.tsx`, `src/test/fraudUsageMeter.test.tsx`.

---

### Task 1: `fraud_checks` migration

**Files:**
- Create: `supabase/migrations/20260919000000_fraud_checks_cache.sql`
- Test: `src/test/fraudChecksSchema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: table `public.fraud_checks` with columns `id uuid`, `org_id uuid`, `phone text`, `status text` (`'pending'|'ok'|'error'`), `payload jsonb`, `summary jsonb`, `error_message text`, `checked_at timestamptz`, `created_at timestamptz`, `updated_at timestamptz`; unique constraint on `(org_id, phone)`.

**Context:** This project verifies migrations by asserting on the SQL text, not by running them — see `src/test/abandonedCheckoutsSchema.test.ts` for the pattern. Copy the RLS/grant conventions from `supabase/migrations/20260911000000_add_abandoned_checkouts.sql`. The `update_updated_at_column()` trigger function already exists in the canonical baseline.

- [ ] **Step 1: Write the failing test**

Create `src/test/fraudChecksSchema.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260919000000_fraud_checks_cache.sql",
);

describe("fraud_checks schema", () => {
  it("creates a service-role-only, workspace-scoped phone cache", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/create table if not exists public\.fraud_checks/i);
    expect(sql).toMatch(/org_id uuid not null/i);
    expect(sql).toMatch(/phone text not null check \(phone ~ '\^01\[0-9\]\{9\}\$'\)/i);
    expect(sql).toMatch(/status text not null check \(status in \('pending', 'ok', 'error'\)\)/i);
    expect(sql).toMatch(/payload jsonb check \(payload is null or jsonb_typeof\(payload\) = 'object'\)/i);
    expect(sql).toMatch(/summary jsonb check \(summary is null or jsonb_typeof\(summary\) = 'object'\)/i);
    expect(sql).toMatch(/unique \(org_id, phone\)/i);
    expect(sql).toMatch(/create index if not exists fraud_checks_org_checked_at_idx/i);
  });

  it("never exposes the cache to browser roles", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/alter table public\.fraud_checks enable row level security/i);
    expect(sql).toMatch(/revoke all on public\.fraud_checks from anon, authenticated/i);
    expect(sql).toMatch(/grant all on public\.fraud_checks to service_role/i);
  });

  it("wraps the change in a transaction and keeps updated_at maintained", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql.trim().startsWith("begin;") || sql.includes("\nbegin;")).toBe(true);
    expect(sql).toMatch(/commit;/i);
    expect(sql).toMatch(/create trigger update_fraud_checks_updated_at/i);
    expect(sql).toMatch(/execute function public\.update_updated_at_column\(\)/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/fraudChecksSchema.test.ts`
Expected: FAIL — `ENOENT: no such file or directory` for the migration path.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260919000000_fraud_checks_cache.sql`:

```sql
-- Phone-keyed FraudShield result cache. One row per normalized BD mobile
-- number per workspace, holding the complete upstream response. Exists so
-- repeat customers and repeated order-editor opens never spend a request
-- against FraudShield's daily limit.

begin;

create table if not exists public.fraud_checks (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  phone         text not null check (phone ~ '^01[0-9]{9}$'),
  status        text not null check (status in ('pending', 'ok', 'error')),
  payload       jsonb check (payload is null or jsonb_typeof(payload) = 'object'),
  summary       jsonb check (summary is null or jsonb_typeof(summary) = 'object'),
  error_message text,
  checked_at    timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, phone)
);

create index if not exists fraud_checks_org_checked_at_idx
on public.fraud_checks (org_id, checked_at desc);

drop trigger if exists update_fraud_checks_updated_at on public.fraud_checks;
create trigger update_fraud_checks_updated_at
before update on public.fraud_checks
for each row execute function public.update_updated_at_column();

alter table public.fraud_checks enable row level security;
revoke all on public.fraud_checks from anon, authenticated;
grant all on public.fraud_checks to service_role;

commit;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/fraudChecksSchema.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Confirm no runtime-DDL rule was broken**

Run: `npx vitest run src/test/noRuntimeDatabaseMigrations.test.ts`
Expected: PASS. (This task adds no server code, so it should be untouched — run it to be sure.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260919000000_fraud_checks_cache.sql src/test/fraudChecksSchema.test.ts
git commit -m "feat: add fraud_checks phone cache table

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: FraudShield client module

**Files:**
- Create: `server/fraudShield.js`
- Test: `src/test/fraudShield.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `FRAUD_CACHE_TTL_DAYS = 30`, `FRAUD_ERROR_RETRY_HOURS = 1`, `FRAUD_QUOTA_RESERVE = 100`, `FRAUD_PENDING_CLAIM_SECONDS = 60`
  - `parseFraudShieldError(status: number, body: string): string`
  - `deriveFraudSummary(payload: object, cleanedPhone: string): object`
  - `fetchFraudShield(cleanedPhone: string, apiKey: string, fetchImpl?): Promise<{ payload: object|null, summary: object|null, errorMessage: string|null }>`

**Context:** `server/index.js` currently holds `parseFraudShieldError` at line 758 and `checkFraudStatus` at line 785. This task creates the new module with the logic *widened* to retain the full payload. **Do not delete the originals yet** — Task 4 does that, so the server keeps working between commits.

The critical behaviour change: `checkFraudStatus` today discards `reviews`, `fraudRiskScore`, per-courier `success_ratio`, and `logo`. `fetchFraudShield` returns the raw body as `payload` and the existing derived shape as `summary`. **The `summary` shape must stay byte-identical** — `src/components/OrdersTable.tsx:256` and `server/ai-actions.js` read it.

**One intentional value fix.** `courierData` contains a `summary` entry that is FraudShield's own cross-courier aggregate, not a courier. The current loop treats it as one, so every stored total is roughly double the truth — a phone with 45 real parcels is stored as 80. `deriveFraudSummary` filters that key out. The object *shape* is unchanged, so no consumer breaks; the *numbers* become correct, which also fixes the percentage in `OrdersTable.FraudCell`. Cached rows written before this change are corrected on their next check.

`fetchImpl` is injected so tests never touch the network.

- [ ] **Step 1: Write the failing test**

Create `src/test/fraudShield.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  FRAUD_CACHE_TTL_DAYS,
  deriveFraudSummary,
  fetchFraudShield,
  parseFraudShieldError,
} from "../../server/fraudShield.js";

const OK_BODY = {
  courierData: {
    summary: { name: "Summary", total_parcel: 45, success_parcel: 42, cancelled_parcel: 3, success_ratio: 93.33 },
    steadfast: { name: "Steadfast", logo: "https://x/s.png", total_parcel: 25, success_parcel: 24, cancelled_parcel: 1, success_ratio: 96 },
    pathao: { name: "Pathao", logo: "https://x/p.png", total_parcel: 10, success_parcel: 9, cancelled_parcel: 1, success_ratio: 90 },
  },
  reviews: [
    { phone: "01700000000", commenter_phone: "01800000000", name: "Rahim", rating: 5, comment: "Genuine buyer.", created_at: "2026-05-01T10:15:00.000000Z" },
  ],
  fraudRiskScore: { score: 12, level: "safe", label: "নিরাপদ", breakdown: { success: 6, reports: 0, cancel: 4, volume: 2 } },
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("parseFraudShieldError", () => {
  it("explains upstream gateway failures in operator language", () => {
    expect(parseFraudShieldError(502, "")).toContain("502 Bad Gateway");
    expect(parseFraudShieldError(504, "")).toContain("504 Gateway Timeout");
  });

  it("names the credential problem on auth failures", () => {
    expect(parseFraudShieldError(401, '{"message":"nope"}')).toContain("Invalid or expired API key");
    expect(parseFraudShieldError(403, '{"message":"nope"}')).toContain("Invalid or expired API key");
  });

  it("reports quota exhaustion distinctly from other 4xx", () => {
    const message = parseFraudShieldError(429, '{"message":"Too Many Requests"}');
    expect(message).toMatch(/daily FraudShield limit/i);
    expect(message).not.toContain("Invalid or expired API key");
  });

  it("surfaces validation detail for a rejected phone", () => {
    const message = parseFraudShieldError(400, '{"message":"The phone field format is invalid."}');
    expect(message).toContain("The phone field format is invalid.");
  });

  it("still handles the BD Courier upstream failure signature", () => {
    expect(parseFraudShieldError(500, "BdCourierService null returned")).toMatch(/BD Courier data/i);
  });
});

describe("deriveFraudSummary", () => {
  it("produces the exact legacy summary shape OrdersTable reads", () => {
    const summary = deriveFraudSummary(OK_BODY, "01700000000");

    expect(summary).toEqual({
      mobile_number: "01700000000",
      total_parcels: 35,
      total_delivered: 33,
      total_cancel: 2,
      fraud_risk: "safe",
      success_rate: 94,
      last_delivery: "",
      apis: {
        Steadfast: { total_parcels: 25, total_delivered_parcels: 24, total_cancelled_parcels: 1 },
        Pathao: { total_parcels: 10, total_delivered_parcels: 9, total_cancelled_parcels: 1 },
      },
    });
  });

  it("excludes the API's own summary aggregate so totals are not double-counted", () => {
    const summary = deriveFraudSummary(OK_BODY, "01700000000");

    expect(summary.apis).not.toHaveProperty("Summary");
    expect(summary.total_parcels).toBe(35);
  });

  it("falls back to a ratio-derived risk level when the API omits fraudRiskScore", () => {
    const body = { courierData: { steadfast: { name: "Steadfast", total_parcel: 10, success_parcel: 4, cancelled_parcel: 6 } } };
    expect(deriveFraudSummary(body, "01700000000").fraud_risk).toBe("high");
  });

  it("reports a zero success rate rather than dividing by zero", () => {
    const body = { courierData: { steadfast: { name: "Steadfast", total_parcel: 0, success_parcel: 0, cancelled_parcel: 0 } } };
    expect(deriveFraudSummary(body, "01700000000").success_rate).toBe(0);
  });
});

describe("fetchFraudShield", () => {
  it("retains the complete upstream payload, not just the summary", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(OK_BODY));
    const result = await fetchFraudShield("01700000000", "key-1", fetchImpl);

    expect(result.errorMessage).toBeNull();
    expect(result.payload).toEqual(OK_BODY);
    expect(result.payload.reviews).toHaveLength(1);
    expect(result.payload.fraudRiskScore.label).toBe("নিরাপদ");
    expect(result.payload.courierData.steadfast.success_ratio).toBe(96);
    expect(result.summary.total_parcels).toBe(35);
  });

  it("authenticates with both header styles and posts the cleaned phone", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(OK_BODY));
    await fetchFraudShield("01700000000", "key-1", fetchImpl);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://fraudshield.bd/api/customer/check");
    expect(init.headers.Authorization).toBe("Bearer key-1");
    expect(init.headers["X-API-Key"]).toBe("key-1");
    expect(JSON.parse(init.body)).toEqual({ phone: "01700000000" });
  });

  it("returns an error without calling the API when the key is missing", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchFraudShield("01700000000", "", fetchImpl);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.errorMessage).toBe("No API key provided");
    expect(result.payload).toBeNull();
  });

  it("maps a non-ok response to a parsed error and no payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "{}" });
    const result = await fetchFraudShield("01700000000", "key-1", fetchImpl);

    expect(result.payload).toBeNull();
    expect(result.summary).toBeNull();
    expect(result.errorMessage).toMatch(/daily FraudShield limit/i);
  });

  it("reports malformed JSON rather than throwing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new Error("bad json"); },
      text: async () => "<html>",
    });
    const result = await fetchFraudShield("01700000000", "key-1", fetchImpl);

    expect(result.errorMessage).toMatch(/invalid JSON/i);
  });

  it("rejects a response missing courierData", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    const result = await fetchFraudShield("01700000000", "key-1", fetchImpl);

    expect(result.errorMessage).toMatch(/Unexpected response/i);
  });

  it("converts a thrown network error into a message", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    const result = await fetchFraudShield("01700000000", "key-1", fetchImpl);

    expect(result.errorMessage).toBe("Network error: ECONNRESET");
  });
});

describe("constants", () => {
  it("pins the cache window the cost model depends on", () => {
    expect(FRAUD_CACHE_TTL_DAYS).toBe(30);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/fraudShield.test.ts`
Expected: FAIL — cannot resolve `../../server/fraudShield.js`.

- [ ] **Step 3: Write the module**

Create `server/fraudShield.js`:

```js
// FraudShield client and cache policy. All I/O is injected so this module
// stays unit-testable and free of a Supabase or network import, matching the
// pattern in server/storefrontSeoRefresh.js.

export const FRAUD_CACHE_TTL_DAYS = 30;
export const FRAUD_ERROR_RETRY_HOURS = 1;
export const FRAUD_QUOTA_RESERVE = 100;
export const FRAUD_PENDING_CLAIM_SECONDS = 60;

const FRAUDSHIELD_CHECK_URL = "https://fraudshield.bd/api/customer/check";

export function parseFraudShieldError(status, body) {
  let message = body;
  try {
    const parsed = JSON.parse(body);
    message = parsed.message || parsed.error || parsed.details || body;
  } catch {
    // FraudShield sometimes returns plain text/HTML on upstream failures.
  }

  if (status === 502) {
    return "FraudShield server returned a 502 Bad Gateway. This usually indicates their origin database or upstream courier sync service is down.";
  }
  if (status === 504) {
    return "FraudShield server returned a 504 Gateway Timeout. The request timed out while querying courier records.";
  }
  if (status === 429) {
    return "Daily FraudShield limit reached. Checks resume after the limit resets.";
  }

  if (/BdCourierService|transformApiResponse|null returned/i.test(message)) {
    return "FraudShield is temporarily failing while reading BD Courier data. Please try again later or contact FraudShield support if it continues.";
  }

  const hint =
    status === 401 || status === 403
      ? "Invalid or expired API key"
      : `HTTP ${status}`;
  return `${hint}: ${String(message).substring(0, 200) || "(no body)"}`;
}

// Legacy summary shape. OrdersTable.FraudCell and server/ai-actions.js read
// this exact object out of orders.fraud_data — do not rename its keys.
export function deriveFraudSummary(payload, cleanedPhone) {
  // `summary` is FraudShield's own aggregate across couriers, not a courier.
  // The previous implementation counted it as one, doubling every total.
  const courierEntries = Object.entries(payload?.courierData || {})
    .filter(([key]) => key !== "summary");

  let totalParcels = 0;
  let totalDelivered = 0;
  let totalCancelled = 0;
  const apis = {};

  for (const [key, c] of courierEntries) {
    const total = c.total_parcel ?? c.total ?? 0;
    const delivered = c.success_parcel ?? c.successful ?? 0;
    const cancelled = c.cancelled_parcel ?? c.cancelled ?? 0;
    totalParcels += total;
    totalDelivered += delivered;
    totalCancelled += cancelled;
    apis[c.name ?? key] = {
      total_parcels: total,
      total_delivered_parcels: delivered,
      total_cancelled_parcels: cancelled,
    };
  }

  const successRate = totalParcels > 0
    ? Math.round((totalDelivered / totalParcels) * 100)
    : 0;

  const riskLevel =
    payload?.fraudRiskScore?.level ??
    (successRate >= 70 ? "low" : successRate >= 50 ? "medium" : "high");

  return {
    mobile_number: cleanedPhone,
    total_parcels: totalParcels,
    total_delivered: totalDelivered,
    total_cancel: totalCancelled,
    fraud_risk: riskLevel,
    success_rate: successRate,
    last_delivery: "",
    apis,
  };
}

// Caller must pass an already-normalized phone. Returns the full upstream body
// as `payload` plus the legacy `summary`, or an operator-readable message.
export async function fetchFraudShield(cleanedPhone, apiKey, fetchImpl = fetch) {
  const trimmedApiKey = String(apiKey || "").trim();
  if (!trimmedApiKey) {
    return { payload: null, summary: null, errorMessage: "No API key provided" };
  }

  try {
    const response = await fetchImpl(FRAUDSHIELD_CHECK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${trimmedApiKey}`,
        "X-API-Key": trimmedApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ phone: cleanedPhone }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[FraudShield] API returned error for ${cleanedPhone}: status ${response.status}`);
      return { payload: null, summary: null, errorMessage: parseFraudShieldError(response.status, errorBody) };
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      return {
        payload: null,
        summary: null,
        errorMessage: "FraudShield returned an invalid JSON response. Please try again later.",
      };
    }

    if (!payload?.courierData) {
      return {
        payload: null,
        summary: null,
        errorMessage: `Unexpected response: ${JSON.stringify(payload).substring(0, 200)}`,
      };
    }

    return { payload, summary: deriveFraudSummary(payload, cleanedPhone), errorMessage: null };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { payload: null, summary: null, errorMessage: `Network error: ${msg}` };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/fraudShield.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add server/fraudShield.js src/test/fraudShield.test.ts
git commit -m "feat: add FraudShield client retaining the full API payload

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Cache resolution policy

**Files:**
- Modify: `server/fraudShield.js` (append)
- Test: `src/test/fraudShieldCache.test.ts`

**Interfaces:**
- Consumes: `FRAUD_CACHE_TTL_DAYS`, `FRAUD_ERROR_RETRY_HOURS`, `FRAUD_PENDING_CLAIM_SECONDS`, `FRAUD_QUOTA_RESERVE` from Task 2.
- Produces:
  - `cacheState(row: object|null, now: Date): "missing" | "fresh" | "stale" | "claimed"`
  - `resolveFraudCheck({ readCache, writeCache, callApi, now, force }): Promise<{ row, spentRequest: boolean, skipped: string|null }>`
  - `shouldWarm(usage: object|null, reserve: number): boolean`
  - `selectPhonesToWarm({ orders, cachedRows, now, limit }): string[]`

**Context:** This is the policy layer. It performs no I/O itself: `readCache`, `writeCache`, and `callApi` are async callbacks that Task 4 binds to Supabase and `fetchFraudShield`.

Three behaviours are easy to get wrong and are specified by test:

1. **A failed re-check must not destroy good cached data.** If the row was `ok` and the new call fails, keep the old `payload`/`summary`, set `status: "error"` and `error_message`. The operator sees stale data plus a failure note rather than an empty panel.
2. **Claim before calling.** Write a `pending` row first. Another caller that sees a `pending` row younger than `FRAUD_PENDING_CLAIM_SECONDS` returns without spending a request. This stops the cron and an operator's click from both paying for the same phone.
3. **Warming fails closed.** If the usage endpoint is unreadable, `shouldWarm` returns `false`. Interactive checks still work — the user asked for those explicitly — but the automated drain must never guess about remaining quota.

`selectPhonesToWarm` receives raw `orders` rows and already-cached `fraud_checks` rows and returns normalized, deduplicated phones needing a check, newest order first. It imports `normalizeBdPhone` from `server/abandonedCheckouts.js`.

- [ ] **Step 1: Write the failing test**

Create `src/test/fraudShieldCache.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  cacheState,
  resolveFraudCheck,
  selectPhonesToWarm,
  shouldWarm,
} from "../../server/fraudShield.js";

const NOW = new Date("2026-09-19T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const DAY = 86_400_000;
const HOUR = 3_600_000;

describe("cacheState", () => {
  it("treats an absent row as missing", () => {
    expect(cacheState(null, NOW)).toBe("missing");
  });

  it("keeps an ok row fresh inside the 30-day window", () => {
    expect(cacheState({ status: "ok", checked_at: ago(29 * DAY) }, NOW)).toBe("fresh");
  });

  it("stales an ok row past the window", () => {
    expect(cacheState({ status: "ok", checked_at: ago(31 * DAY) }, NOW)).toBe("stale");
  });

  it("holds an error row for one hour before allowing a retry", () => {
    expect(cacheState({ status: "error", checked_at: ago(30 * 60_000) }, NOW)).toBe("fresh");
    expect(cacheState({ status: "error", checked_at: ago(2 * HOUR) }, NOW)).toBe("stale");
  });

  it("reports a recent pending row as claimed and an old one as stale", () => {
    expect(cacheState({ status: "pending", checked_at: ago(10_000) }, NOW)).toBe("claimed");
    expect(cacheState({ status: "pending", checked_at: ago(120_000) }, NOW)).toBe("stale");
  });
});

describe("resolveFraudCheck", () => {
  function harness(existing: unknown, apiResult: unknown) {
    const writes: unknown[] = [];
    return {
      writes,
      readCache: vi.fn().mockResolvedValue(existing),
      writeCache: vi.fn(async (patch: unknown) => { writes.push(patch); }),
      callApi: vi.fn().mockResolvedValue(apiResult),
    };
  }

  const OK_API = { payload: { courierData: {} }, summary: { total_parcels: 3 }, errorMessage: null };

  it("returns a fresh row without spending a request", async () => {
    const existing = { status: "ok", checked_at: ago(DAY), payload: { a: 1 }, summary: { b: 2 } };
    const h = harness(existing, OK_API);

    const result = await resolveFraudCheck({ ...h, now: NOW, force: false });

    expect(h.callApi).not.toHaveBeenCalled();
    expect(h.writeCache).not.toHaveBeenCalled();
    expect(result.spentRequest).toBe(false);
    expect(result.row).toBe(existing);
  });

  it("calls the API for a missing row and claims before calling", async () => {
    const h = harness(null, OK_API);

    const result = await resolveFraudCheck({ ...h, now: NOW, force: false });

    expect(h.callApi).toHaveBeenCalledOnce();
    expect(h.writes[0]).toMatchObject({ status: "pending" });
    expect(h.writes[1]).toMatchObject({ status: "ok", payload: { courierData: {} }, summary: { total_parcels: 3 }, error_message: null });
    expect(result.spentRequest).toBe(true);
  });

  it("re-checks a fresh row when forced", async () => {
    const h = harness({ status: "ok", checked_at: ago(DAY) }, OK_API);

    const result = await resolveFraudCheck({ ...h, now: NOW, force: true });

    expect(h.callApi).toHaveBeenCalledOnce();
    expect(result.spentRequest).toBe(true);
  });

  it("skips a phone another worker is already checking, even when forced", async () => {
    const h = harness({ status: "pending", checked_at: ago(5_000) }, OK_API);

    const result = await resolveFraudCheck({ ...h, now: NOW, force: true });

    expect(h.callApi).not.toHaveBeenCalled();
    expect(result.skipped).toBe("claimed");
    expect(result.spentRequest).toBe(false);
  });

  it("preserves the previous good payload when a re-check fails", async () => {
    const existing = { status: "ok", checked_at: ago(40 * DAY), payload: { keep: true }, summary: { total_parcels: 9 } };
    const h = harness(existing, { payload: null, summary: null, errorMessage: "FraudShield 502" });

    const result = await resolveFraudCheck({ ...h, now: NOW, force: false });

    expect(h.writes[1]).toMatchObject({
      status: "error",
      error_message: "FraudShield 502",
      payload: { keep: true },
      summary: { total_parcels: 9 },
    });
    expect(result.row.payload).toEqual({ keep: true });
  });

  it("stores a bare error row when there was nothing cached to preserve", async () => {
    const h = harness(null, { payload: null, summary: null, errorMessage: "No API key provided" });

    await resolveFraudCheck({ ...h, now: NOW, force: false });

    expect(h.writes[1]).toMatchObject({ status: "error", payload: null, summary: null, error_message: "No API key provided" });
  });
});

describe("shouldWarm", () => {
  it("allows warming with headroom above the reserve", () => {
    expect(shouldWarm({ remaining_today: 400 }, 100)).toBe(true);
  });

  it("stops warming at or below the reserve", () => {
    expect(shouldWarm({ remaining_today: 100 }, 100)).toBe(false);
    expect(shouldWarm({ remaining_today: 0 }, 100)).toBe(false);
  });

  it("fails closed when usage is unknown", () => {
    expect(shouldWarm(null, 100)).toBe(false);
    expect(shouldWarm({}, 100)).toBe(false);
  });
});

describe("selectPhonesToWarm", () => {
  const orders = [
    { phone: "01711111111", created_at: "2026-09-19T10:00:00Z" },
    { phone: "8801722222222", created_at: "2026-09-19T09:00:00Z" },
    { phone: "01711111111", created_at: "2026-09-19T08:00:00Z" },
    { phone: "01733333333", created_at: "2026-09-19T07:00:00Z" },
    { phone: "not-a-phone", created_at: "2026-09-19T06:00:00Z" },
    { phone: null, created_at: "2026-09-19T05:00:00Z" },
  ];

  it("normalizes, deduplicates, and drops phones that already have a fresh row", () => {
    const cachedRows = [{ phone: "01733333333", status: "ok", checked_at: ago(DAY) }];

    expect(selectPhonesToWarm({ orders, cachedRows, now: NOW, limit: 10 }))
      .toEqual(["01711111111", "01722222222"]);
  });

  it("re-warms a phone whose cached row has gone stale", () => {
    const cachedRows = [{ phone: "01733333333", status: "ok", checked_at: ago(60 * DAY) }];

    expect(selectPhonesToWarm({ orders, cachedRows, now: NOW, limit: 10 }))
      .toContain("01733333333");
  });

  it("honours the batch limit", () => {
    expect(selectPhonesToWarm({ orders, cachedRows: [], now: NOW, limit: 2 }))
      .toEqual(["01711111111", "01722222222"]);
  });

  it("returns nothing when every phone is cached", () => {
    const cachedRows = [
      { phone: "01711111111", status: "ok", checked_at: ago(DAY) },
      { phone: "01722222222", status: "ok", checked_at: ago(DAY) },
      { phone: "01733333333", status: "ok", checked_at: ago(DAY) },
    ];

    expect(selectPhonesToWarm({ orders, cachedRows, now: NOW, limit: 10 })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/fraudShieldCache.test.ts`
Expected: FAIL — `cacheState is not a function` (and the other three imports undefined).

- [ ] **Step 3: Append the policy layer to `server/fraudShield.js`**

Add this import at the top of the file, below the existing header comment:

```js
import { normalizeBdPhone } from "./abandonedCheckouts.js";
```

Then append:

```js
// ─── Cache policy ───────────────────────────────────────────────────────────

export function cacheState(row, now) {
  if (!row) return "missing";

  const checkedAt = new Date(row.checked_at).getTime();
  if (!Number.isFinite(checkedAt)) return "stale";
  const ageMs = now.getTime() - checkedAt;

  if (row.status === "pending") {
    return ageMs < FRAUD_PENDING_CLAIM_SECONDS * 1000 ? "claimed" : "stale";
  }
  if (row.status === "error") {
    return ageMs < FRAUD_ERROR_RETRY_HOURS * 3_600_000 ? "fresh" : "stale";
  }
  return ageMs < FRAUD_CACHE_TTL_DAYS * 86_400_000 ? "fresh" : "stale";
}

// Claims the phone with a `pending` row before calling, so a concurrent cron
// run and an operator's click cannot both pay for the same lookup. A failed
// re-check keeps whatever good data was already cached.
export async function resolveFraudCheck({ readCache, writeCache, callApi, now, force = false }) {
  const existing = await readCache();
  const state = cacheState(existing, now);

  if (state === "claimed") {
    return { row: existing, spentRequest: false, skipped: "claimed" };
  }
  if (!force && state === "fresh") {
    return { row: existing, spentRequest: false, skipped: null };
  }

  await writeCache({ status: "pending", checked_at: now.toISOString() });

  const result = await callApi();
  const next = result.errorMessage
    ? {
        status: "error",
        // Preserve the last good result so a transient upstream failure does
        // not blank the panel.
        payload: existing?.status === "ok" ? existing.payload ?? null : null,
        summary: existing?.status === "ok" ? existing.summary ?? null : null,
        error_message: result.errorMessage,
        checked_at: now.toISOString(),
      }
    : {
        status: "ok",
        payload: result.payload,
        summary: result.summary,
        error_message: null,
        checked_at: now.toISOString(),
      };

  await writeCache(next);
  return { row: next, spentRequest: true, skipped: null };
}

// Automated warming fails closed: if remaining quota is unknown, do not drain.
// Interactive checks are unaffected — the operator asked for those.
export function shouldWarm(usage, reserve) {
  const remaining = usage?.remaining_today;
  return Number.isFinite(remaining) && remaining > reserve;
}

export function selectPhonesToWarm({ orders, cachedRows, now, limit }) {
  const freshPhones = new Set(
    (cachedRows || [])
      .filter((row) => cacheState(row, now) !== "stale" && cacheState(row, now) !== "missing")
      .map((row) => row.phone),
  );

  const selected = [];
  const seen = new Set();
  for (const order of orders || []) {
    const phone = normalizeBdPhone(order.phone);
    if (!phone || seen.has(phone) || freshPhones.has(phone)) continue;
    seen.add(phone);
    selected.push(phone);
    if (selected.length >= limit) break;
  }
  return selected;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/fraudShieldCache.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Re-run Task 2's tests to confirm no regression**

Run: `npx vitest run src/test/fraudShield.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 6: Commit**

```bash
git add server/fraudShield.js src/test/fraudShieldCache.test.ts
git commit -m "feat: add FraudShield cache resolution policy

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Server routes

**Files:**
- Modify: `server/index.js` — delete lines 758-882 (`parseFraudShieldError`, `checkFraudStatus`), add an import, add adapters and three routes in the Fraud section near line 8225, reroute the two existing fraud routes
- Test: `src/test/fraudRouteWiring.test.ts`

**Interfaces:**
- Consumes: everything exported from `server/fraudShield.js` (Tasks 2 and 3).
- Produces:
  - `GET /api/fraud/lookup?phone=` → `{ phone, status, payload, summary, checkedAt, errorMessage }` or `{ phone, status: null }` when uncached. **Never calls FraudShield.**
  - `POST /api/fraud/check` `{ phone, force? }` → same shape plus `{ spentRequest }`.
  - `GET /api/fraud/usage` → `{ daily_limit, used_today, remaining_today, limit_resets_at, package }`.
  - Server helpers `readFraudCache(supabase, orgId, phone)`, `writeFraudCache(supabase, orgId, phone, patch)`, `runFraudCheck(supabase, orgId, phone, force)`.

**Context:** This project verifies route wiring by asserting on the text of `server/index.js` — see `src/test/abandonedCheckoutRouteWiring.test.ts` for the exact idiom, including the `routeSection(startMarker, endMarker)` helper. Copy that helper verbatim.

`getUserOrg(supabase, userId)` (line 626) returns `{ orgId, role }` and throws with a `statusCode` when the user has no org.

The two existing routes (`POST /api/check-fraud` line 8225, `POST /api/inbox-orders/check-fraud` line 8308) must keep their current request and response contracts — `src/components/OrdersTable.tsx:775` and `src/pages/InboxOrders.tsx` depend on them. Only their internals change: call `runFraudCheck` instead of `checkFraudStatus`, and keep writing `orders.fraud_data` / `social_inbox_orders.fraud_data` with the `summary` object exactly as before.

`getSettings(keys)` (line 1338) and `saveSettings(obj)` (line 1351) back the 5-minute usage memo under key `` `${orgId}:fraudshield_usage_cache` ``.

- [ ] **Step 1: Write the failing test**

Create `src/test/fraudRouteWiring.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

function routeSection(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("fraud route wiring", () => {
  it("imports the client from the extracted module and keeps no duplicate copy", () => {
    expect(source).toContain('from "./fraudShield.js"');
    expect(source).toContain("fetchFraudShield");
    expect(source).toContain("resolveFraudCheck");
    expect(source).not.toContain("async function checkFraudStatus(");
    expect(source).not.toContain("function parseFraudShieldError(");
  });

  it("authenticates and workspace-scopes every fraud route", () => {
    const routes = [
      routeSection('app.get("/api/fraud/lookup"', 'app.post("/api/fraud/check"'),
      routeSection('app.post("/api/fraud/check"', 'app.get("/api/fraud/usage"'),
      routeSection('app.get("/api/fraud/usage"', 'app.post("/api/check-fraud"'),
    ];

    for (const route of routes) {
      expect(route).toContain("getToken(req)");
      expect(route).toContain("getUser(token)");
      expect(route).toContain('return res.status(401).json({ error: "Unauthorized" })');
      expect(route).toContain("getUserOrg(supabase, user.id)");
    }
  });

  it("never accepts a workspace identifier from the client", () => {
    const fraudRoutes = routeSection('app.get("/api/fraud/lookup"', 'app.post("/api/inbox-orders/check-fraud"');
    expect(fraudRoutes).not.toMatch(/req\.body(?:\?\.)?\.org(?:Id|_id)/);
    expect(fraudRoutes).not.toMatch(/req\.query(?:\?\.)?\.org(?:Id|_id)/);
  });

  it("normalizes the client phone before it reaches the cache or the API", () => {
    const lookup = routeSection('app.get("/api/fraud/lookup"', 'app.post("/api/fraud/check"');
    const check = routeSection('app.post("/api/fraud/check"', 'app.get("/api/fraud/usage"');

    for (const route of [lookup, check]) {
      expect(route).toContain("normalizeBdPhone(");
      expect(route).toContain('return res.status(400).json({ error: "Invalid phone number" })');
    }
  });

  it("keeps the lookup route read-only so opening an order never spends quota", () => {
    const lookup = routeSection('app.get("/api/fraud/lookup"', 'app.post("/api/fraud/check"');

    expect(lookup).toContain("readFraudCache(supabase, orgId, phone)");
    expect(lookup).not.toContain("resolveFraudCheck");
    expect(lookup).not.toContain("fetchFraudShield");
    expect(lookup).not.toContain("incrementUsage");
  });

  it("spends quota only on the explicit check route", () => {
    const check = routeSection('app.post("/api/fraud/check"', 'app.get("/api/fraud/usage"');

    expect(check).toContain("runFraudCheck(supabase, orgId, phone");
    expect(check).toContain('incrementUsage(orgId, "fraud_checks")');
    expect(check).toContain("req.body?.force");
  });

  it("scopes every cache read and write to the resolved workspace", () => {
    const helpers = routeSection("async function readFraudCache", "app.post(\"/api/check-fraud\"");

    expect(helpers).toContain('.from("fraud_checks")');
    expect(helpers.match(/\.eq\("org_id", orgId\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(helpers).toContain('onConflict: "org_id,phone"');
  });

  it("routes the legacy order check through the cache while preserving its contract", () => {
    const legacy = routeSection('app.post("/api/check-fraud"', 'app.post("/api/inbox-orders/check-fraud"');

    expect(legacy).toContain("runFraudCheck(supabase, orgId,");
    expect(legacy).toContain("fraud_checked: true");
    expect(legacy).toContain("fraud_data");
    expect(legacy).toContain('.eq("org_id", orgId)');
    expect(legacy).toContain("fraudError");
  });

  it("routes the legacy inbox check through the cache too", () => {
    const legacy = routeSection('app.post("/api/inbox-orders/check-fraud"', "// ─── Unified Social Inbox");

    expect(legacy).toContain("runFraudCheck(supabase, orgId,");
    expect(legacy).toContain("parseInboxOrderNotes(order.notes)");
    expect(legacy).toContain('.eq("org_id", orgId)');
  });

  it("memoizes the usage proxy so the meter cannot become its own load source", () => {
    const usage = routeSection('app.get("/api/fraud/usage"', 'app.post("/api/check-fraud"');

    expect(usage).toContain("fraudshield_usage_cache");
    expect(usage).toContain("getSettings(");
    expect(usage).toContain("saveSettings(");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/fraudRouteWiring.test.ts`
Expected: FAIL — the first assertion, `expect(source).toContain('from "./fraudShield.js"')`.

- [ ] **Step 3: Remove the superseded functions from `server/index.js`**

Delete the whole of `function parseFraudShieldError(status, body) { ... }` (starts line 758) and `async function checkFraudStatus(phone, apiKey) { ... }` (starts line 785, ends just before `const MAX_MANUAL_SMS_LENGTH`). Leave `const MAX_MANUAL_SMS_LENGTH = 1000;` in place.

Add to the import block near the top of `server/index.js`, following the existing multi-line import style:

```js
import {
  FRAUD_QUOTA_RESERVE,
  fetchFraudShield,
  resolveFraudCheck,
  selectPhonesToWarm,
  shouldWarm,
} from "./fraudShield.js";
```

- [ ] **Step 4: Add the Supabase adapters immediately above `app.post("/api/check-fraud"`**

**Order matters.** Steps 4 and 5 both insert above `app.post("/api/check-fraud"`. The final file order must be: `readFraudCache` → `writeFraudCache` → `runFraudCheck` → `readFraudUsage` → `GET /api/fraud/lookup` → `POST /api/fraud/check` → `GET /api/fraud/usage` → the existing `POST /api/check-fraud`. The test's `routeSection` boundaries depend on exactly that sequence.

```js
// ─── FraudShield cache adapters ─────────────────────────────────────────────

async function readFraudCache(supabase, orgId, phone) {
  const { data } = await supabase
    .from("fraud_checks")
    .select("phone, status, payload, summary, error_message, checked_at")
    .eq("org_id", orgId)
    .eq("phone", phone)
    .maybeSingle();
  return data || null;
}

async function writeFraudCache(supabase, orgId, phone, patch) {
  const { error } = await supabase
    .from("fraud_checks")
    .upsert({ org_id: orgId, phone, ...patch }, { onConflict: "org_id,phone" });
  if (error) throw error;
}

// Single entry point for anything that may spend a FraudShield request.
async function runFraudCheck(supabase, orgId, phone, force = false) {
  const apiKey = (process.env.FRAUDSHIELD_API_KEY || "").trim();
  return resolveFraudCheck({
    now: new Date(),
    force,
    readCache: () => readFraudCache(supabase, orgId, phone),
    writeCache: (patch) => writeFraudCache(supabase, orgId, phone, patch),
    callApi: () => fetchFraudShield(phone, apiKey),
  });
}

async function readFraudUsage(orgId) {
  const apiKey = (process.env.FRAUDSHIELD_API_KEY || "").trim();
  if (!apiKey) return null;

  const cacheKey = `${orgId}:fraudshield_usage_cache`;
  const cached = await getSettings([cacheKey]);
  try {
    const parsed = JSON.parse(cached[cacheKey] || "null");
    if (parsed && Date.now() - parsed.at < 5 * 60_000) return parsed.data;
  } catch {
    // Corrupt memo — fall through and refetch.
  }

  try {
    const response = await fetch("https://fraudshield.bd/api/usage/daily-limit", {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (!response.ok) return null;
    const body = await response.json();
    const data = body?.data ?? null;
    if (data) await saveSettings({ [cacheKey]: JSON.stringify({ at: Date.now(), data }) });
    return data;
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Add the three routes immediately above `app.post("/api/check-fraud"`**

```js
// Cache-only. Deliberately never calls FraudShield — opening an order editor
// must not consume the daily request budget.
app.get("/api/fraud/lookup", async (req, res) => {
  try {
    const token = getToken(req);
    const { user } = await getUser(token);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    const phone = normalizeBdPhone(req.query.phone);
    if (!phone) return res.status(400).json({ error: "Invalid phone number" });

    const row = await readFraudCache(supabase, orgId, phone);
    if (!row) return res.json({ phone, status: null });

    return res.json({
      phone,
      status: row.status,
      payload: row.payload,
      summary: row.summary,
      checkedAt: row.checked_at,
      errorMessage: row.error_message,
    });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: e.message });
  }
});

app.post("/api/fraud/check", async (req, res) => {
  try {
    const token = getToken(req);
    const { user } = await getUser(token);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    const phone = normalizeBdPhone(req.body?.phone);
    if (!phone) return res.status(400).json({ error: "Invalid phone number" });

    const { row, spentRequest } = await runFraudCheck(supabase, orgId, phone, req.body?.force === true);
    if (spentRequest) incrementUsage(orgId, "fraud_checks").catch(() => {});

    return res.json({
      phone,
      status: row?.status ?? null,
      payload: row?.payload ?? null,
      summary: row?.summary ?? null,
      checkedAt: row?.checked_at ?? null,
      errorMessage: row?.error_message ?? null,
      spentRequest,
    });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: e.message });
  }
});

app.get("/api/fraud/usage", async (req, res) => {
  try {
    const token = getToken(req);
    const { user } = await getUser(token);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    return res.json(await readFraudUsage(orgId) ?? {});
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: e.message });
  }
});
```

- [ ] **Step 6: Reroute the two legacy routes**

In `app.post("/api/check-fraud"`, replace the single-order branch's call:

```js
// was: const { fraudData, errorMessage } = await checkFraudStatus(order.phone, fraudShieldApiKey);
const phone = normalizeBdPhone(order.phone);
if (!phone) return res.status(400).json({ error: "Order has no valid phone number" });

const { row, spentRequest } = await runFraudCheck(supabase, orgId, phone, true);
if (spentRequest) incrementUsage(orgId, "fraud_checks").catch(() => {});
const errorMessage = row?.error_message ?? null;
const dataToStore = row?.summary ?? { _error: errorMessage ?? "Unknown error" };
```

Everything after that (the `orders` update with `fraud_checked: true, fraud_data: dataToStore`, the re-select, and the `{ success: true, order: updatedOrder, fraudError: errorMessage }` response) stays exactly as it is.

Apply the same substitution in the bulk branch of the same route and in `app.post("/api/inbox-orders/check-fraud"`. Remove the now-unused `fraudShieldApiKey` locals and the `if (!fraudShieldApiKey) return res.status(400)...` guards — `fetchFraudShield` already returns `"No API key provided"` as an error message, which flows through `fraudError`. Also remove the unconditional `incrementUsage(orgId, "fraud_checks")` call near the top of each route; usage is now counted only when a request is actually spent.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run src/test/fraudRouteWiring.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 8: Run the full suite to catch contract regressions**

Run: `npm test`
Expected: PASS. Pay attention to `src/test/aiActions.test.ts`, `src/test/order-detail.test.ts`, and `src/test/noRuntimeDatabaseMigrations.test.ts`. If `aiActions.test.ts` fails on a missing `checkFraudStatus`, update `server/ai-actions.js` to import `fetchFraudShield` from `./fraudShield.js` instead — note that `server/ai-actions.js:378` only mentions it in a comment, so a comment update may be all that is needed.

- [ ] **Step 9: Lint**

Run: `npm run lint`
Expected: no new errors. Remove any locals the refactor orphaned.

- [ ] **Step 10: Commit**

```bash
git add server/index.js server/ai-actions.js src/test/fraudRouteWiring.test.ts
git commit -m "feat: add cached fraud lookup, check, and usage routes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Cron warming

**Files:**
- Modify: `server/index.js` — add `GET /api/internal/fraud-warm` beside the two existing internal cron routes (lines 2919 and 2971)
- Modify: `vercel.json`
- Test: `src/test/fraudWarmCron.test.ts`

**Interfaces:**
- Consumes: `runFraudCheck`, `readFraudUsage` (Task 4); `selectPhonesToWarm`, `shouldWarm`, `FRAUD_QUOTA_RESERVE` (Task 3).
- Produces: `GET /api/internal/fraud-warm` → `{ ok: true, scannedWorkspaces, checked, skipped }`.

**Context:** Existing cron routes authenticate with `isAuthorizedCronRequest(req.headers.authorization, process.env.CRON_SECRET)` (imported at `server/index.js:53` from `server/storefrontSeoRefresh.js:254`) and return 401 otherwise. Copy that exactly.

Workspace discovery mirrors `runAbandonedCheckoutMaintenance` (line 2933): select distinct `org_id` values, then loop. Here the source is `user_roles`, because the deployment's workspace always has at least one role row.

Sequential calls with `FRAUD_WARM_SPACING_MS = 400` between them keep a 40-item batch at roughly 16 seconds, inside the serverless limit. Do not parallelize — FraudShield rate-limits.

> **Deployment prerequisite:** the `*/5 * * * *` schedule requires Vercel Pro; Hobby allows daily crons only. If the project is on Hobby, keep this task's route (it is still useful to trigger manually) but the fallback is to call `warmFraudChecksForOrg` at the end of `POST /api/fetch-shopify-orders`. Confirm the plan tier before deploying.

- [ ] **Step 1: Write the failing test**

Create `src/test/fraudWarmCron.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
const vercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"));

function routeSection(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("fraud warm cron", () => {
  it("is registered on a five-minute schedule", () => {
    const cron = vercelConfig.crons.find((c: { path: string }) => c.path === "/api/internal/fraud-warm");
    expect(cron).toBeDefined();
    expect(cron.schedule).toBe("*/5 * * * *");
  });

  it("rejects unauthenticated callers with the shared cron secret check", () => {
    const route = routeSection('app.get("/api/internal/fraud-warm"', "// Apex (<=2 labels");

    expect(route).toContain("isAuthorizedCronRequest(req.headers.authorization, process.env.CRON_SECRET)");
    expect(route).toContain('return res.status(401).json({ error: "Unauthorized" })');
  });

  it("checks remaining quota before draining and holds back the reserve", () => {
    const warm = routeSection("async function warmFraudChecksForOrg", 'app.get("/api/internal/fraud-warm"');

    expect(warm).toContain("readFraudUsage(orgId)");
    expect(warm).toContain("shouldWarm(");
    expect(warm).toContain("FRAUD_QUOTA_RESERVE");
  });

  it("selects a bounded, workspace-scoped, recent batch", () => {
    const warm = routeSection("async function warmFraudChecksForOrg", 'app.get("/api/internal/fraud-warm"');

    expect(warm).toContain("selectPhonesToWarm(");
    expect(warm).toContain("FRAUD_WARM_BATCH");
    expect(warm).toContain("FRAUD_WARM_LOOKBACK_DAYS");
    expect(warm).toContain('.from("orders")');
    expect(warm).toContain('.from("fraud_checks")');
    expect(warm.match(/\.eq\("org_id", orgId\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("spaces calls out instead of firing the batch in parallel", () => {
    const warm = routeSection("async function warmFraudChecksForOrg", 'app.get("/api/internal/fraud-warm"');

    expect(warm).toContain("FRAUD_WARM_SPACING_MS");
    expect(warm).toContain("runFraudCheck(supabase, orgId, phone)");
    expect(warm).not.toContain("Promise.all");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/fraudWarmCron.test.ts`
Expected: FAIL — the cron entry is undefined.

- [ ] **Step 3: Add the constants to `server/fraudShield.js`**

Append to the constants block at the top of the file:

```js
export const FRAUD_WARM_BATCH = 40;
export const FRAUD_WARM_SPACING_MS = 400;
export const FRAUD_WARM_LOOKBACK_DAYS = 7;
```

Extend the `server/index.js` import from `./fraudShield.js` to include `FRAUD_WARM_BATCH`, `FRAUD_WARM_SPACING_MS`, and `FRAUD_WARM_LOOKBACK_DAYS`.

- [ ] **Step 4: Add the warm function and route beside the other internal cron routes**

Insert both directly after the existing `app.get("/api/internal/abandoned-checkouts-maintenance"` handler and directly before the `// Apex (<=2 labels` comment, with `warmFraudChecksForOrg` first and the route second. The test's `routeSection` boundaries depend on exactly that placement.

```js
// Pre-fetches risk data for phones on recent orders so the order editor is
// already populated when an operator opens it. Holds back FRAUD_QUOTA_RESERVE
// requests for interactive re-checks.
async function warmFraudChecksForOrg(supabase, orgId) {
  const usage = await readFraudUsage(orgId);
  if (!shouldWarm(usage, FRAUD_QUOTA_RESERVE)) return { checked: 0, skipped: "quota" };

  const since = new Date(Date.now() - FRAUD_WARM_LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("phone, created_at")
    .eq("org_id", orgId)
    .gte("created_at", since)
    .not("phone", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (ordersError) throw ordersError;

  const candidates = [...new Set((orders || []).map((o) => normalizeBdPhone(o.phone)).filter(Boolean))];
  if (candidates.length === 0) return { checked: 0, skipped: null };

  const { data: cachedRows, error: cacheError } = await supabase
    .from("fraud_checks")
    .select("phone, status, checked_at")
    .eq("org_id", orgId)
    .in("phone", candidates);
  if (cacheError) throw cacheError;

  const phones = selectPhonesToWarm({
    orders: orders || [],
    cachedRows: cachedRows || [],
    now: new Date(),
    limit: FRAUD_WARM_BATCH,
  });

  let checked = 0;
  for (const phone of phones) {
    if (checked > 0) await sleep(FRAUD_WARM_SPACING_MS);
    const { spentRequest } = await runFraudCheck(supabase, orgId, phone);
    if (spentRequest) {
      checked += 1;
      incrementUsage(orgId, "fraud_checks").catch(() => {});
    }
  }
  return { checked, skipped: null };
}

app.get("/api/internal/fraud-warm", async (req, res) => {
  if (!isAuthorizedCronRequest(req.headers.authorization, process.env.CRON_SECRET)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const supabase = getServiceSupabase();
    const { data: roleRows, error } = await supabase.from("user_roles").select("org_id").limit(1000);
    if (error) throw error;

    const orgIds = [...new Set((roleRows || []).map((row) => row.org_id).filter(Boolean))];
    let checked = 0;
    let skipped = null;
    for (const orgId of orgIds) {
      const result = await warmFraudChecksForOrg(supabase, orgId);
      checked += result.checked;
      skipped = skipped || result.skipped;
    }

    return res.json({ ok: true, scannedWorkspaces: orgIds.length, checked, skipped });
  } catch {
    console.warn("[FraudShield] warm run failed");
    return res.status(500).json({ error: "Could not warm fraud checks" });
  }
});
```

`sleep` already exists at `server/index.js:735`.

- [ ] **Step 5: Register the cron in `vercel.json`**

Add to the `crons` array:

```json
{ "path": "/api/internal/fraud-warm", "schedule": "*/5 * * * *" }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/test/fraudWarmCron.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Run the server-side suite and lint**

Run: `npx vitest run src/test/fraudRouteWiring.test.ts src/test/fraudShield.test.ts src/test/fraudShieldCache.test.ts && npm run lint`
Expected: all PASS, no new lint errors.

- [ ] **Step 8: Commit**

```bash
git add server/fraudShield.js server/index.js vercel.json src/test/fraudWarmCron.test.ts
git commit -m "feat: warm the fraud cache from a five-minute cron

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `FraudPanel` component

**Files:**
- Create: `src/lib/fraudRisk.ts`
- Create: `src/hooks/useFraudCheck.ts`
- Create: `src/components/order-editor/FraudPanel.tsx`
- Test: `src/test/fraudPanel.test.tsx`

**Interfaces:**
- Consumes: `GET /api/fraud/lookup`, `POST /api/fraud/check` (Task 4).
- Produces:
  - `src/lib/fraudRisk.ts`: `type FraudLevel = "safe" | "caution" | "high" | "unknown"`; `resolveFraudLevel(payload, summary): FraudLevel`; `RISK_STYLES: Record<FraudLevel, { pill: string; strip: string; accent: string; label: string }>`; `maskPhone(phone): string`; `relativeAge(iso, now?): string`; `courierRows(payload): Array<{ key: string; name: string; logo: string | null; total: number; success: number; ratio: number }>`
  - `src/hooks/useFraudCheck.ts`: `useFraudLookup(phone)`, `useFraudCheckMutation(phone)`
  - `src/components/order-editor/FraudPanel.tsx`: `export function FraudPanel({ phone, className }: { phone?: string | null; className?: string })`

**Context — read the mockup first.** Open `docs/superpowers/specs/assets/2026-09-19-fraud-panel-demo.html` in a browser and look at section "C — Strip". That is the target. Both the collapsed and expanded renderings are there, in both the safe and high-risk states, along with the four secondary states in the footer.

Key behaviours from the spec:

- Collapsed by default. **Auto-expanded on mount when the level is `high`.**
- The collapsed row takes the risk tint: untinted for safe, amber for caution, red for high.
- `reviews` is omitted entirely by the API when empty — never assume an array.
- The hero success figure comes from `summary.success_rate`; per-courier ratios come from `payload.courierData`.

**One deliberate refinement over the spec:** the spec described the panel reading `/api/fraud/usage` to disable its button at zero remaining. Fetching usage from every panel instance would make the meter its own load source. Instead, the panel disables the button when a check *returns* a quota error (`/daily FraudShield limit/i`). Same outcome for the operator, no extra request per render. The standalone meter in Settings still uses `GET /api/fraud/usage`.

- [ ] **Step 1: Write the failing test**

Create `src/test/fraudPanel.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FraudPanel } from "@/components/order-editor/FraudPanel";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));

const SAFE_PAYLOAD = {
  courierData: {
    steadfast: { name: "Steadfast", logo: "https://x/s.png", total_parcel: 25, success_parcel: 24, cancelled_parcel: 1, success_ratio: 96 },
    pathao: { name: "Pathao", logo: "https://x/p.png", total_parcel: 20, success_parcel: 18, cancelled_parcel: 2, success_ratio: 90 },
  },
  reviews: [
    { commenter_phone: "01800000000", rating: 5, comment: "Genuine buyer, paid on time.", created_at: "2026-05-01T10:15:00.000000Z" },
  ],
  fraudRiskScore: { score: 12, level: "safe", label: "নিরাপদ", breakdown: { success: 6, reports: 0, cancel: 4, volume: 2 } },
};

const SAFE_SUMMARY = { total_parcels: 45, total_delivered: 42, total_cancel: 3, success_rate: 93, fraud_risk: "safe" };

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function renderPanel(phone = "01711111111") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FraudPanel phone={phone} />
    </QueryClientProvider>,
  );
}

describe("FraudPanel", () => {
  beforeEach(() => { apiFetch.mockReset(); });

  it("reads from the cache-only endpoint and never posts on mount", async () => {
    apiFetch.mockResolvedValue(ok({ phone: "01711111111", status: "ok", payload: SAFE_PAYLOAD, summary: SAFE_SUMMARY, checkedAt: new Date().toISOString() }));
    renderPanel();

    await screen.findByText("93%");
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch.mock.calls[0][0]).toContain("/api/fraud/lookup?phone=01711111111");
    expect(apiFetch.mock.calls[0][1]?.method ?? "GET").toBe("GET");
  });

  it("shows the safe summary collapsed, with couriers hidden until expanded", async () => {
    apiFetch.mockResolvedValue(ok({ phone: "01711111111", status: "ok", payload: SAFE_PAYLOAD, summary: SAFE_SUMMARY, checkedAt: new Date().toISOString() }));
    renderPanel();

    await screen.findByText("Safe");
    expect(screen.getByText(/42 delivered/)).toBeInTheDocument();
    expect(screen.getByText(/3 cancelled/)).toBeInTheDocument();
    expect(screen.queryByText("Steadfast")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /details/i }));
    expect(screen.getByText("Steadfast")).toBeInTheDocument();
    expect(screen.getByText("96%")).toBeInTheDocument();
  });

  it("auto-expands a high-risk customer without a click", async () => {
    const payload = { ...SAFE_PAYLOAD, fraudRiskScore: { score: 78, level: "high", label: "ঝুঁকিপূর্ণ", breakdown: { success: 1, reports: 3, cancel: 24, volume: 2 } } };
    apiFetch.mockResolvedValue(ok({ phone: "01711111111", status: "ok", payload, summary: { ...SAFE_SUMMARY, success_rate: 33, fraud_risk: "high" }, checkedAt: new Date().toISOString() }));
    renderPanel();

    await screen.findByText("High risk");
    expect(screen.getByText("Steadfast")).toBeInTheDocument();
  });

  it("masks reviewer phone numbers", async () => {
    apiFetch.mockResolvedValue(ok({ phone: "01711111111", status: "ok", payload: SAFE_PAYLOAD, summary: SAFE_SUMMARY, checkedAt: new Date().toISOString() }));
    renderPanel();

    await screen.findByText("Safe");
    await userEvent.click(screen.getByRole("button", { name: /details/i }));
    expect(screen.getByText(/018\*\*\*\*0000/)).toBeInTheDocument();
    expect(screen.queryByText("01800000000")).not.toBeInTheDocument();
  });

  it("renders without a reviews section when the API omits the key", async () => {
    const payload = { ...SAFE_PAYLOAD };
    delete (payload as { reviews?: unknown }).reviews;
    apiFetch.mockResolvedValue(ok({ phone: "01711111111", status: "ok", payload, summary: SAFE_SUMMARY, checkedAt: new Date().toISOString() }));
    renderPanel();

    await screen.findByText("Safe");
    await userEvent.click(screen.getByRole("button", { name: /details/i }));
    expect(screen.queryByText(/reviews from other merchants/i)).not.toBeInTheDocument();
  });

  it("offers a Check button and spends a request only when it is pressed", async () => {
    apiFetch.mockResolvedValueOnce(ok({ phone: "01711111111", status: null }));
    renderPanel();

    const check = await screen.findByRole("button", { name: /^check$/i });
    expect(apiFetch).toHaveBeenCalledTimes(1);

    apiFetch.mockResolvedValueOnce(ok({ phone: "01711111111", status: "ok", payload: SAFE_PAYLOAD, summary: SAFE_SUMMARY, checkedAt: new Date().toISOString(), spentRequest: true }));
    await userEvent.click(check);

    await screen.findByText("Safe");
    expect(apiFetch.mock.calls[1][0]).toBe("/api/fraud/check");
    expect(apiFetch.mock.calls[1][1].method).toBe("POST");
  });

  it("treats a customer with no courier history as new, not risky", async () => {
    apiFetch.mockResolvedValue(ok({
      phone: "01711111111", status: "ok",
      payload: { courierData: {} },
      summary: { total_parcels: 0, total_delivered: 0, total_cancel: 0, success_rate: 0, fraud_risk: "low" },
      checkedAt: new Date().toISOString(),
    }));
    renderPanel();

    expect(await screen.findByText(/new customer/i)).toBeInTheDocument();
    expect(screen.queryByText(/high risk/i)).not.toBeInTheDocument();
  });

  it("surfaces a failed check with a retry", async () => {
    apiFetch.mockResolvedValue(ok({
      phone: "01711111111", status: "error", payload: null, summary: null,
      errorMessage: "FraudShield server returned a 502 Bad Gateway.", checkedAt: new Date().toISOString(),
    }));
    renderPanel();

    expect(await screen.findByText(/check failed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("disables the button after a quota error instead of letting it be retried", async () => {
    apiFetch.mockResolvedValueOnce(ok({ phone: "01711111111", status: null }));
    renderPanel();

    const check = await screen.findByRole("button", { name: /^check$/i });
    apiFetch.mockResolvedValueOnce(ok({
      phone: "01711111111", status: "error", payload: null, summary: null,
      errorMessage: "Daily FraudShield limit reached. Checks resume after the limit resets.",
      checkedAt: new Date().toISOString(), spentRequest: true,
    }));
    await userEvent.click(check);

    await screen.findByText(/daily limit reached/i);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^check$/i })).toBeDisabled();
    });
  });

  it("does not query at all without a valid BD phone", () => {
    renderPanel("012");
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/fraudPanel.test.tsx`
Expected: FAIL — cannot resolve `@/components/order-editor/FraudPanel`.

- [ ] **Step 3: Write `src/lib/fraudRisk.ts`**

```ts
export type FraudLevel = "safe" | "caution" | "high" | "unknown";

type FraudSummary = { success_rate?: number | null; fraud_risk?: string | null; total_parcels?: number | null } | null;
type FraudPayload = {
  courierData?: Record<string, { name?: string; logo?: string; total_parcel?: number; success_parcel?: number; success_ratio?: number }>;
  reviews?: Array<{ commenter_phone?: string; rating?: number; comment?: string; created_at?: string }>;
  fraudRiskScore?: { score?: number; level?: string; label?: string; breakdown?: Record<string, number> };
} | null;

// FraudShield's own level wins. The fallback mirrors the server's derivation
// so a payload predating fraudRiskScore still lands somewhere sensible.
export function resolveFraudLevel(payload: FraudPayload, summary: FraudSummary): FraudLevel {
  const raw = (payload?.fraudRiskScore?.level ?? summary?.fraud_risk ?? "").toLowerCase();
  if (raw === "safe" || raw === "low") return "safe";
  if (raw === "caution" || raw === "medium" || raw === "moderate") return "caution";
  if (raw === "high" || raw === "risky") return "high";

  const rate = summary?.success_rate;
  if (typeof rate !== "number") return "unknown";
  if (rate >= 70) return "safe";
  if (rate >= 50) return "caution";
  return "high";
}

// Reuses the order-status pill palette already in CustomerPanel.tsx — no new tokens.
export const RISK_STYLES: Record<FraudLevel, { pill: string; strip: string; accent: string; label: string }> = {
  safe:    { pill: "bg-[#e3f5e9] text-[#2e9e5b]", strip: "",                accent: "text-[#2e9e5b]", label: "Safe" },
  caution: { pill: "bg-[#fdf3e3] text-[#b97f1f]", strip: "bg-[#fdf3e3]",    accent: "text-[#b97f1f]", label: "Caution" },
  high:    { pill: "bg-[#fdecec] text-[#d05555]", strip: "bg-[#fdecec]",    accent: "text-[#d05555]", label: "High risk" },
  unknown: { pill: "bg-black/[0.05] text-black/60", strip: "",              accent: "text-black",     label: "Unknown" },
};

export function maskPhone(phone: string | null | undefined): string {
  const clean = String(phone || "").replace(/\D/g, "");
  return clean.length === 11 ? `${clean.slice(0, 3)}****${clean.slice(7)}` : "—";
}

export function relativeAge(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function courierRows(payload: FraudPayload) {
  return Object.entries(payload?.courierData || {})
    .filter(([key]) => key !== "summary")
    .map(([key, courier]) => {
      const total = courier.total_parcel ?? 0;
      const success = courier.success_parcel ?? 0;
      return {
        key,
        name: courier.name ?? key,
        logo: courier.logo ?? null,
        total,
        success,
        ratio: courier.success_ratio ?? (total > 0 ? Math.round((success / total) * 100) : 0),
      };
    });
}
```

- [ ] **Step 4: Write `src/hooks/useFraudCheck.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { normalizeBdPhone } from "@/lib/bdPhone";

export type FraudLookup = {
  phone: string;
  status: "ok" | "error" | "pending" | null;
  payload?: Record<string, unknown> | null;
  summary?: Record<string, number | string> | null;
  checkedAt?: string | null;
  errorMessage?: string | null;
  spentRequest?: boolean;
};

function lookupKey(phone: string | null) {
  return ["/api/fraud/lookup", phone] as const;
}

// Cache-only. Deliberately a GET so that opening an order editor never spends
// a FraudShield request.
export function useFraudLookup(phone: string | null | undefined) {
  const normalized = normalizeBdPhone(phone);
  return useQuery<FraudLookup>({
    queryKey: lookupKey(normalized),
    enabled: Boolean(normalized),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await apiFetch(`/api/fraud/lookup?phone=${normalized}`);
      if (!res.ok) throw new Error("Could not read fraud data");
      return res.json();
    },
  });
}

export function useFraudCheckMutation(phone: string | null | undefined) {
  const normalized = normalizeBdPhone(phone);
  const queryClient = useQueryClient();

  return useMutation<FraudLookup, Error, { force?: boolean } | void>({
    mutationFn: async (variables) => {
      const res = await apiFetch("/api/fraud/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized, force: variables?.force === true }),
      });
      if (!res.ok) throw new Error("Fraud check failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(lookupKey(normalized), data);
    },
  });
}
```

- [ ] **Step 5: Write `src/components/order-editor/FraudPanel.tsx`**

```tsx
import { useEffect, useState } from "react";
import { ArrowClockwise, CaretDown, CaretUp, ShieldCheck, ShieldWarning } from "@phosphor-icons/react";
import { useFraudCheckMutation, useFraudLookup } from "@/hooks/useFraudCheck";
import { RISK_STYLES, courierRows, maskPhone, relativeAge, resolveFraudLevel } from "@/lib/fraudRisk";
import { normalizeBdPhone } from "@/lib/bdPhone";

const LABEL = "text-[8px] font-medium uppercase tracking-[0.3em]";
const QUOTA_RE = /daily FraudShield limit/i;

export function FraudPanel({ phone, className = "" }: { phone?: string | null; className?: string }) {
  const normalized = normalizeBdPhone(phone);
  const lookup = useFraudLookup(phone);
  const check = useFraudCheckMutation(phone);
  const [expanded, setExpanded] = useState(false);

  const data = lookup.data;
  const payload = (data?.payload ?? null) as Parameters<typeof courierRows>[0];
  const summary = (data?.summary ?? null) as { total_parcels?: number; total_delivered?: number; total_cancel?: number; success_rate?: number; fraud_risk?: string } | null;
  const level = resolveFraudLevel(payload, summary);
  const styles = RISK_STYLES[level];

  const hasData = Boolean(payload && summary);
  const isNewCustomer = hasData && (summary?.total_parcels ?? 0) === 0;
  const quotaBlocked = QUOTA_RE.test(data?.errorMessage || "");
  // A quota error is not a failed check — it is a blocked one. It keeps the
  // Check affordance (disabled) rather than offering a Retry that cannot work.
  const failed = data?.status === "error" && !hasData && !quotaBlocked;
  const busy = lookup.isPending || check.isPending || data?.status === "pending";

  // The state that needs attention presents itself; safe stays one quiet row.
  useEffect(() => {
    if (level === "high" && hasData) setExpanded(true);
  }, [level, hasData]);

  if (!normalized) return null;

  const reviews = payload?.reviews;
  const couriers = courierRows(payload);
  const tint = hasData && !isNewCustomer ? styles.strip : "";

  return (
    <section aria-label="Customer risk" className={`overflow-hidden rounded-lg ring-1 ring-inset ring-black/[0.06] ${className}`}>
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${tint}`}>
        <p className={`${LABEL} ${tint ? styles.accent : "text-black"}`}>Customer risk</p>

        {busy ? (
          <span className="text-[12px] text-black/50">Loading…</span>
        ) : quotaBlocked && !hasData ? (
          <span className="text-[12px] text-black/50">Daily limit reached</span>
        ) : failed ? (
          <>
            <span className="text-[12px] text-[#d05555]">Check failed</span>
            <span className="min-w-0 truncate text-[11px] text-black/50">{data?.errorMessage}</span>
          </>
        ) : !hasData ? (
          <span className="text-[12px] text-black/50">Not checked yet</span>
        ) : isNewCustomer ? (
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${RISK_STYLES.unknown.pill}`}>New customer</span>
        ) : (
          <>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles.pill}`}>
              {level === "safe" ? <ShieldCheck weight="light" size={14} /> : <ShieldWarning weight="light" size={14} />}
              {styles.label}
            </span>
            <span className={`text-[15px] font-medium tabular-nums ${styles.accent}`}>{summary?.success_rate ?? 0}%</span>
            <span className="text-[12px] tabular-nums text-black/55">
              {summary?.total_delivered ?? 0} delivered · {summary?.total_cancel ?? 0} cancelled · {summary?.total_parcels ?? 0} total
            </span>
            {payload?.fraudRiskScore && (
              <span className="text-[12px] text-black/55">
                risk {payload.fraudRiskScore.score}/100{payload.fraudRiskScore.label ? ` · ${payload.fraudRiskScore.label}` : ""}
              </span>
            )}
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {data?.checkedAt && <span className="text-[11px] text-black/45">{relativeAge(data.checkedAt)}</span>}

          {hasData || failed ? (
            <button
              type="button"
              aria-label={failed ? "Retry" : "Re-check"}
              disabled={busy || quotaBlocked}
              onClick={() => check.mutate({ force: true })}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] text-black transition hover:bg-black/[0.05] disabled:opacity-40"
            >
              <ArrowClockwise weight="light" size={14} />
              {failed ? "Retry" : null}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || quotaBlocked}
              onClick={() => check.mutate({ force: false })}
              className="inline-flex h-8 items-center rounded-lg bg-black px-3 text-[12px] font-medium text-white transition hover:bg-black/90 disabled:opacity-40"
            >
              Check
            </button>
          )}

          {hasData && !isNewCustomer && (
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12px] text-black transition hover:bg-black/[0.05]"
            >
              {expanded ? "Hide" : "Details"}
              {expanded ? <CaretUp weight="light" size={12} /> : <CaretDown weight="light" size={12} />}
            </button>
          )}
        </div>
      </div>

      {expanded && hasData && (
        <div className="grid gap-7 border-t border-black/[0.07] bg-[#FAFAF8] px-4 py-4 sm:grid-cols-2">
          <div className="min-w-0">
            <p className={`${LABEL} text-black`}>By courier</p>
            <ul className="mt-3 grid gap-2">
              {couriers.map((courier) => (
                <li key={courier.key} className="flex items-center gap-2.5">
                  {courier.logo
                    ? <img src={courier.logo} alt="" className="h-5 w-5 shrink-0 rounded" />
                    : <span className="h-5 w-5 shrink-0 rounded bg-black/[0.08]" />}
                  <span className="min-w-0 flex-1 truncate text-[12px] text-black">{courier.name}</span>
                  <span className="text-[12px] tabular-nums text-black/50">{courier.success}/{courier.total}</span>
                  <span className={`w-10 text-right text-[12px] font-semibold tabular-nums ${courier.ratio >= 70 ? "text-[#2e9e5b]" : courier.ratio >= 50 ? "text-[#b97f1f]" : "text-[#d05555]"}`}>
                    {courier.ratio}%
                  </span>
                </li>
              ))}
            </ul>

            {payload?.fraudRiskScore?.breakdown && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {Object.entries(payload.fraudRiskScore.breakdown).map(([key, value]) => (
                  <span
                    key={key}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] tabular-nums ${
                      (key === "reports" || key === "cancel") && value > 0 ? "bg-[#fdecec] text-[#d05555]" : "bg-black/[0.04] text-black"
                    }`}
                  >
                    {key} <b className="font-semibold">{value}</b>
                  </span>
                ))}
              </div>
            )}
          </div>

          {Array.isArray(reviews) && reviews.length > 0 && (
            <div className="min-w-0">
              <p className={`${LABEL} text-black`}>Reviews from other merchants</p>
              <ul className="mt-2 divide-y divide-black/[0.07]">
                {reviews.map((review, index) => (
                  <li key={`${review.commenter_phone}-${index}`} className="flex gap-2.5 py-2.5">
                    <span className={`shrink-0 text-[11px] ${(review.rating ?? 0) >= 4 ? "text-[#2e9e5b]" : "text-[#d05555]"}`}>
                      {"★".repeat(review.rating ?? 0)}{"☆".repeat(Math.max(0, 5 - (review.rating ?? 0)))}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[12.5px] leading-snug text-black">{review.comment}</p>
                      <p className="mt-1 text-[11px] text-black/45">
                        {maskPhone(review.commenter_phone)}
                        {review.created_at ? ` · ${new Date(review.created_at).toLocaleDateString("en-BD")}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/test/fraudPanel.test.tsx`
Expected: PASS, 10 tests.

- [ ] **Step 7: Type-check and lint**

Run: `npm run build && npm run lint`
Expected: build succeeds, no new lint errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/fraudRisk.ts src/hooks/useFraudCheck.ts src/components/order-editor/FraudPanel.tsx src/test/fraudPanel.test.tsx
git commit -m "feat: add FraudPanel strip with cached lookup

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Wire the panel into the four surfaces

**Files:**
- Modify: `src/components/order-editor/CustomerPanel.tsx` — render `FraudPanel`, delete the dead `risk_level` field (line 316) and type entry (line 37), accept an optional `phone` fallback
- Modify: `src/pages/OrderDetail.tsx` — remove the dead `risk_level` from the `Order` type (line 42)
- Modify: `src/pages/NewOrder.tsx` — add the strip, remove the `runFraudCheck` checkbox
- Modify: `src/pages/AbandonedDetail.tsx` — pass the phone through (line 259)
- Test: `src/test/fraudPanelPlacement.test.tsx`

**Scope correction from the spec.** The spec listed `InboxOrders.tsx` as a fourth editing surface. It is not — it is a table whose `InboxFraudCell` (line 193) is the hover-card pattern, the same as `OrdersTable.FraudCell`, and it has no order editor view. Leave it alone: Task 4 already rerouted `POST /api/inbox-orders/check-fraud` through the cache, so its checks now populate the same phone cache the editors read, which is the benefit that mattered. The three genuine editing surfaces are `OrderDetail`, `NewOrder`, and `AbandonedDetail`.

**Interfaces:**
- Consumes: `FraudPanel` from Task 6.
- Produces: no new exports. `CustomerPanel`'s prop contract gains nothing — it reads the phone from the `customer` prop it already receives.

**Context:** `CustomerPanel` already receives `customer.phone`, so the strip needs no new prop there. `AbandonedDetail.tsx:259` currently passes `order={{}}`; the `customer` prop it passes already carries the phone, so that call site works once `CustomerPanel` renders the strip — verify and only change it if the phone is genuinely absent.

`NewOrder.tsx` holds the phone in local `phone` state (line ~73 area), so the strip binds directly to it. Deleting `runFraudCheck` also means deleting the post-create `apiFetch("/api/check-fraud")` block at `NewOrder.tsx:213-222` and the now-unused `ShieldCheck` import if nothing else uses it — note line 293's "Protected checkout" badge also uses `ShieldCheck`, so check before removing the import.

Existing tests `src/test/customerPanel.test.tsx` and `src/test/abandonedDetail.test.tsx` render these components; they will need a `QueryClientProvider` wrapper or a `vi.mock` of `@/components/order-editor/FraudPanel`. Prefer mocking the panel in those suites — they are testing other behaviour, and `src/test/fraudPanel.test.tsx` already covers the panel itself. `src/test/mobileWorkflowLayout.test.tsx:12` shows the existing mocking idiom for `CustomerPanel`.

- [ ] **Step 1: Write the failing test**

Create `src/test/fraudPanelPlacement.test.tsx`:

```tsx
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CustomerPanel } from "@/components/order-editor/CustomerPanel";

const apiFetch = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ phone: "01711111111", status: null }) }));
vi.mock("@/lib/api", () => ({ apiFetch }));

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("fraud panel placement", () => {
  it("renders the strip inside the customer panel", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <CustomerPanel
          order={{ id: "order-1", price: 500 }}
          customer={{ customerName: "Ayesha", phone: "01711111111", address: "Dhaka" }}
          onApply={vi.fn()}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText("Customer risk")).toBeInTheDocument();
  });

  it("drops the dead risk_level field that never had a matching key", () => {
    const panel = read("src/components/order-editor/CustomerPanel.tsx");
    const detail = read("src/pages/OrderDetail.tsx");

    expect(panel).not.toContain("risk_level");
    expect(detail).not.toContain("risk_level");
    expect(panel).not.toContain('<DetailField label="Fraud"');
  });

  it("replaces the write-only fraud checkbox on the new order page with the live strip", () => {
    const newOrder = read("src/pages/NewOrder.tsx");

    expect(newOrder).toContain("FraudPanel");
    expect(newOrder).toContain("phone={phone}");
    expect(newOrder).not.toContain("runFraudCheck");
    expect(newOrder).not.toContain('apiFetch("/api/check-fraud"');
  });

  it("keeps the abandoned checkout surface on the shared customer panel", () => {
    expect(read("src/pages/AbandonedDetail.tsx")).toContain("CustomerPanel");
  });

  it("leaves the inbox table on its own cell but routes its checks through the cache", () => {
    expect(read("src/pages/InboxOrders.tsx")).toContain("InboxFraudCell");
    expect(read("server/index.js")).toContain("runFraudCheck(supabase, orgId,");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/fraudPanelPlacement.test.tsx`
Expected: FAIL — `Unable to find a label with the text of: Customer risk`.

- [ ] **Step 3: Render the strip in `CustomerPanel.tsx` and delete the dead field**

Add the import:

```tsx
import { FraudPanel } from "@/components/order-editor/FraudPanel";
```

Delete `fraud_data?: { risk_level?: string } | null;` from the `CustomerOrder` type (line 37).

Delete `<DetailField label="Fraud" value={order.fraud_data?.risk_level} />` (line 316).

Insert the strip after the "Last orders" block and before the `<div className="mb-4 mt-4 h-px bg-black/[0.07]" />` divider:

```tsx
<FraudPanel phone={customer.phone} className="mt-4" />
```

- [ ] **Step 4: Remove the dead type entry in `OrderDetail.tsx`**

Delete `fraud_data?: { risk_level?: string } | null;` from the `Order` type (line 42).

- [ ] **Step 5: Wire `NewOrder.tsx`**

Add the import, render the strip directly under the phone input's grid cell:

```tsx
<div className="sm:col-span-2"><FraudPanel phone={phone} /></div>
```

Delete the `runFraudCheck` state declaration (line 73), the post-create check block (lines 213-222), and the checkbox `<label>` inside the footer at line 293 — keep the Cancel and Create buttons. Leave the `ShieldCheck` import if the "Protected checkout" badge still uses it.

- [ ] **Step 6: Verify `AbandonedDetail.tsx`**

`AbandonedDetail.tsx:259` already passes a `customer` prop carrying the phone, so the strip renders once Step 3 lands. Read the call site to confirm `customer.phone` is populated; if it is not, wire it from the checkout record. Make no change to `InboxOrders.tsx`.

- [ ] **Step 7: Fix the neighbouring suites**

Run: `npx vitest run src/test/customerPanel.test.tsx src/test/abandonedDetail.test.tsx src/test/mobileWorkflowLayout.test.tsx`

If they fail on a missing QueryClient, add to the top of each failing file:

```tsx
vi.mock("@/components/order-editor/FraudPanel", () => ({ FraudPanel: () => null }));
```

Those suites test other behaviour; `src/test/fraudPanel.test.tsx` covers the panel.

- [ ] **Step 8: Run the placement test**

Run: `npx vitest run src/test/fraudPanelPlacement.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 9: Full verification**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS. Do not proceed past a failure — fix it.

- [ ] **Step 10: Commit**

```bash
git add src/components/order-editor/CustomerPanel.tsx src/pages/OrderDetail.tsx src/pages/NewOrder.tsx src/pages/AbandonedDetail.tsx src/test/
git commit -m "feat: show the fraud strip on every order editing surface

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

---

### Task 8: Settings quota meter

**Files:**
- Create: `src/components/FraudUsageMeter.tsx`
- Modify: `src/pages/Settings.tsx:570`
- Test: `src/test/fraudUsageMeter.test.tsx`

**Interfaces:**
- Consumes: `GET /api/fraud/usage` (Task 4).
- Produces: `export function FraudUsageMeter()`.

**Context:** Spec §7 requires a visible daily-quota meter so the team is never surprised by an exhausted limit mid-afternoon. `FraudPanel` deliberately does *not* fetch usage — one request per panel instance would make the meter its own load source. This standalone component is the only consumer of `GET /api/fraud/usage`, and that route is memoized server-side for 5 minutes.

`Settings.tsx:570` renders `isAdmin ? <IntegrationSettings /> : (...)`. Wrap the admin branch in a fragment and put the meter above it. Quota is an integration concern and only admins manage integrations, so the non-admin branch stays untouched.

The endpoint returns `{}` when FraudShield has no key configured or is unreachable — render nothing in that case rather than a broken meter.

- [ ] **Step 1: Write the failing test**

Create `src/test/fraudUsageMeter.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FraudUsageMeter } from "@/components/FraudUsageMeter";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

function renderMeter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FraudUsageMeter />
    </QueryClientProvider>,
  );
}

describe("FraudUsageMeter", () => {
  beforeEach(() => { apiFetch.mockReset(); });

  it("shows today's usage against the daily limit", async () => {
    apiFetch.mockResolvedValue(ok({
      daily_limit: 1000, used_today: 230, remaining_today: 770,
      limit_resets_at: "2026-09-19T23:59:59+06:00",
      package: { name: "Professional", days_remaining: 49 },
    }));
    renderMeter();

    expect(await screen.findByText("770")).toBeInTheDocument();
    expect(screen.getByText(/230 used/)).toBeInTheDocument();
    expect(screen.getByText(/1000/)).toBeInTheDocument();
  });

  it("names the plan and its remaining days when one is active", async () => {
    apiFetch.mockResolvedValue(ok({
      daily_limit: 1000, used_today: 10, remaining_today: 990,
      limit_resets_at: "2026-09-19T23:59:59+06:00",
      package: { name: "Professional", days_remaining: 49 },
    }));
    renderMeter();

    expect(await screen.findByText(/Professional/)).toBeInTheDocument();
    expect(screen.getByText(/49 days/)).toBeInTheDocument();
  });

  it("warns when the remaining budget drops into the reserve", async () => {
    apiFetch.mockResolvedValue(ok({
      daily_limit: 1000, used_today: 960, remaining_today: 40,
      limit_resets_at: "2026-09-19T23:59:59+06:00", package: null,
    }));
    renderMeter();

    const remaining = await screen.findByText("40");
    expect(remaining.className).toContain("d05555");
  });

  it("renders nothing when FraudShield usage is unavailable", async () => {
    apiFetch.mockResolvedValue(ok({}));
    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <FraudUsageMeter />
      </QueryClientProvider>,
    );

    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(container.querySelector("[aria-label='FraudShield daily usage']")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/fraudUsageMeter.test.tsx`
Expected: FAIL — cannot resolve `@/components/FraudUsageMeter`.

- [ ] **Step 3: Write `src/components/FraudUsageMeter.tsx`**

```tsx
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { FRAUD_QUOTA_RESERVE } from "@/lib/fraudRisk";

type FraudUsage = {
  daily_limit?: number;
  used_today?: number;
  remaining_today?: number;
  limit_resets_at?: string;
  package?: { name?: string; days_remaining?: number } | null;
};

const LABEL = "text-[8px] font-medium uppercase tracking-[0.3em] text-black";

export function FraudUsageMeter() {
  const { data } = useQuery<FraudUsage>({
    queryKey: ["/api/fraud/usage"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await apiFetch("/api/fraud/usage");
      if (!res.ok) throw new Error("Could not read FraudShield usage");
      return res.json();
    },
  });

  const limit = data?.daily_limit;
  const used = data?.used_today ?? 0;
  const remaining = data?.remaining_today ?? 0;
  if (!Number.isFinite(limit)) return null;

  const low = remaining <= FRAUD_QUOTA_RESERVE;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const resets = data?.limit_resets_at
    ? new Date(data.limit_resets_at).toLocaleTimeString("en-BD", { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <section aria-label="FraudShield daily usage" className="mb-4 rounded-lg bg-[#FAFAF8] px-5 py-4 ring-1 ring-inset ring-black/[0.06]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ShieldCheck weight="light" size={18} className="text-black" />
        <p className={LABEL}>FraudShield today</p>
        <p className={`text-2xl font-light tabular-nums ${low ? "text-[#d05555]" : "text-black"}`}>{remaining}</p>
        <p className="text-[12px] text-black/55">
          remaining · {used} used of {limit}
          {resets ? ` · resets ${resets}` : ""}
        </p>
        {data?.package?.name && (
          <p className="ml-auto text-[12px] text-black/55">
            {data.package.name}
            {Number.isFinite(data.package.days_remaining) ? ` · ${data.package.days_remaining} days left` : ""}
          </p>
        )}
      </div>
      <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-black/[0.08]">
        <div className={`h-full rounded-full ${low ? "bg-[#d05555]" : "bg-[#2e9e5b]"}`} style={{ width: `${pct}%` }} />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Export the reserve constant from `src/lib/fraudRisk.ts`**

Append:

```ts
// Mirrors FRAUD_QUOTA_RESERVE in server/fraudShield.js — the request budget
// held back from automated warming for interactive re-checks.
export const FRAUD_QUOTA_RESERVE = 100;
```

- [ ] **Step 5: Render it in `src/pages/Settings.tsx`**

Import `FraudUsageMeter`, then change the admin branch at line 570 from `isAdmin ? <IntegrationSettings /> : (` to:

```tsx
isAdmin ? (
  <>
    <FraudUsageMeter />
    <IntegrationSettings />
  </>
) : (
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/test/fraudUsageMeter.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 7: Full verification**

Run: `npm test && npm run lint && npm run build`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/FraudUsageMeter.tsx src/lib/fraudRisk.ts src/pages/Settings.tsx src/test/fraudUsageMeter.test.tsx
git commit -m "feat: show FraudShield daily quota in settings

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

## Deployment checklist

Not code — do these before or alongside the first production deploy.

- [ ] Apply `supabase/migrations/20260919000000_fraud_checks_cache.sql`. Run `npm run verify:supabase-project` first, and `npm run verify:supabase-baseline` before proposing it for deployment (`CLAUDE.md` §2).
- [ ] Confirm the FraudShield daily request ceiling actually purchasable. The documented Professional tier is 100/day; steady state here needs ~700-950/day. If the ceiling lands below ~1000, narrow the warm query in `warmFraudChecksForOrg` to a subset (for example COD orders above a value threshold) — a change to one `.select()` chain, not to the architecture.
- [ ] Confirm the Vercel plan supports `*/5 * * * *` crons. Hobby allows daily only; on Hobby, call `warmFraudChecksForOrg` at the end of `POST /api/fetch-shopify-orders` instead.
- [ ] Confirm `CRON_SECRET` and `FRAUDSHIELD_API_KEY` are set in the production environment.
