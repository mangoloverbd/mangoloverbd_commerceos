# Order Risk Engine v2 — Risk Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist workspace-scoped risk attempts and staff lists, make them queryable through a validated store, and scrub expired personal data in daily maintenance.

**Architecture:** A transactional migration creates the two private tables and links existing orders/reviews. A focused ESM store owns Supabase reads, mutations, validation, and retention. The existing CRON_SECRET-protected daily route invokes the retention operation best-effort.

**Tech Stack:** Node 20 ESM, Supabase Postgres and `@supabase/supabase-js`, Vitest, Express.

## Global Constraints

- Single tenant: every query on user data filters by the resolved Mango Lover BD `org_id`; never accept an org id from a client.
- Every new authenticated route: `requireOrderProtectionStaff(req)` → `if (!user) return 401`; mutations additionally require `role === "admin"` (403 otherwise).
- New server routes go in `server/index.js` in the `// ─── Order Protection Review Queue` section; pure logic goes in `server/risk/*.js` (ESM, no default exports).
- Identifiers (phone, device ID, fingerprint, network key, IP, user agent) are stored only as `hashProtectionSignal(value, process.env.ORDER_PROTECTION_HASH_SECRET)` except the explicitly listed display columns in `order_risk_attempts`.
- Never log raw phone, address, IP, device ID, or user agent.
- Always `normalizeBdPhone()` before using a phone; valid BD mobile = `^01[3-9]\d{8}$`.
- No AI calls anywhere in the checkout path.
- Checkout never loses an order because of our infrastructure: dependency failure ⇒ HOLD, never BLOCK.
- Merchant Suite tests: `src/test/*.test.ts(x)`, run `npx vitest run <file>`; import server modules as `../../server/...js`. Full checks: `npm test`, `npm run lint`, `npm run build`.
- Storefront tests: colocated `*.test.ts`, run `node --test <file>`; type check `npm run check`. Branch from `origin/main` (the local checkout is on another branch).
- Migrations: new files in `supabase/migrations/`, wrapped in `begin; … commit;`, RLS enabled, `revoke all … from anon, authenticated; grant all … to service_role;`. Add new tables to `scripts/verify-supabase-baseline.mjs`. **Do not apply remote migrations, change production env vars, deploy, or submit a real order during implementation.**
- UI: Phosphor icons `weight="light"`, `৳` for money, follow the existing `src/pages/OrderProtection.tsx` / `OrderProtectionReviewQueue.tsx` visual style, shadcn components from `src/components/ui/`, `apiFetch()` only.
- Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:` imperative style, one commit per task minimum.

Read `docs/superpowers/plans/2026-09-23-order-risk-engine-v2/00-overview.md` and `docs/superpowers/specs/2026-09-23-order-risk-engine-v2-design.md` before execution. Invoke the project `supabase` and `supabase-postgres-best-practices` skills before authoring SQL, `test-driven-development` before implementation, and `review` plus `verification-before-completion` before shipping. This plan only adds a store and augments the existing cron; it adds no public route. Do not overwrite unrelated staged work in `server/index.js`.

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/20260924000000_order_risk_engine_v2.sql` | Private risk tables, constraints, indexes, FK links |
| `scripts/verify-supabase-baseline.mjs` | Include both tables and required link columns in canonical local baseline |
| `src/test/orderRiskSchema.test.ts` | Migration and baseline contract assertions |
| `server/risk/store.js` | All §10 store exports and retention |
| `src/test/orderRiskStore.test.ts` | Chainable Supabase mock, validation and workspace isolation |
| `server/index.js` | Best-effort call from existing daily maintenance route |
| `src/test/orderRiskMaintenanceWiring.test.ts` | Authenticated source wiring assertion |

---

### Task 1: Transactional risk schema and baseline contract

**Files:**
- Create: `supabase/migrations/20260924000000_order_risk_engine_v2.sql`
- Modify: `scripts/verify-supabase-baseline.mjs:23-50,250-320`
- Test: `src/test/orderRiskSchema.test.ts`

**Interfaces:**
- Consumes: existing `public.orders(id, org_id)` and `public.order_protection_reviews(id, org_id)`.
- Produces: `public.order_risk_attempts`, `public.order_risk_list_entries`, `orders.risk_attempt_id`, `order_protection_reviews.attempt_id` exactly as shared contract §10; tables accessible to `service_role` only.

- [ ] **Step 1: Write the failing schema test** — create `src/test/orderRiskSchema.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = () => readFileSync(resolve(process.cwd(), "supabase/migrations/20260924000000_order_risk_engine_v2.sql"), "utf8");
const baseline = () => readFileSync(resolve(process.cwd(), "scripts/verify-supabase-baseline.mjs"), "utf8");

describe("risk engine schema", () => {
  it("creates private, transactional, constrained tables", () => {
    const sql = migration();
    expect(sql.trim().startsWith("begin;")).toBe(true);
    expect(sql.trim().endsWith("commit;")).toBe(true);
    for (const table of ["order_risk_attempts", "order_risk_list_entries"]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toMatch(new RegExp(`revoke all on public\\.${table} from anon, authenticated`, "i"));
      expect(sql).toMatch(new RegExp(`grant all on public\\.${table} to service_role`, "i"));
    }
    for (const column of ["phone_hash", "device_hash", "fingerprint_hash", "network_hash", "ip_hash", "user_agent_hash"]) {
      expect(sql).toContain(`${column} text null check (${column} ~ '^[0-9a-f]{64}$')`);
    }
    expect(sql).toContain("jsonb_typeof(signals) = 'array'");
    expect(sql).toContain("jsonb_typeof(items) = 'array'");
    expect(sql).toContain("expires_at timestamptz not null default (now() + interval '30 days')");
    expect(sql).toContain("unique (org_id, list, kind, value_hash)");
    expect(sql).toContain("value_hash ~ '^[0-9a-f]{64}$'");
    expect(sql).toContain("add column if not exists risk_attempt_id uuid");
    expect(sql).toContain("add column if not exists attempt_id uuid");
    expect(sql).toMatch(/references public\.order_risk_attempts\(id\) on delete set null/);
    for (const fragment of [
      "(org_id, created_at desc)", "(org_id, decision, created_at desc)",
      "(org_id, phone_hash)", "(org_id, device_hash)",
      "(org_id, fingerprint_hash)", "(org_id, network_hash)",
      "(org_id, order_id)", "where order_id is not null",
      "(expires_at)", "(org_id, list, created_at desc)",
      "where risk_attempt_id is not null",
    ]) expect(sql).toContain(fragment);
    expect(sql).not.toMatch(/grant\s+.*\s+to\s+(anon|authenticated)\b/i);
  });

  it("updates the local baseline runtime table and link-column contract", () => {
    const script = baseline();
    expect(script).toContain('"order_risk_attempts"');
    expect(script).toContain('"order_risk_list_entries"');
    expect(script).toContain("('orders', 'risk_attempt_id')");
    expect(script).toContain("('order_protection_reviews', 'attempt_id')");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/orderRiskSchema.test.ts`  
Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Write the minimal migration** — create `supabase/migrations/20260924000000_order_risk_engine_v2.sql`:

```sql
begin;

create table if not exists public.order_risk_attempts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  order_id uuid null,
  review_id uuid null,
  route text not null check (route in ('public_v1', 'custom_webhook')),
  mode text not null check (mode in ('shadow', 'active')),
  decision text not null check (decision in ('ALLOW', 'HOLD', 'BLOCK')),
  score integer not null check (score >= 0),
  signals jsonb not null default '[]'::jsonb check (jsonb_typeof(signals) = 'array'),
  reasons text[] not null default '{}',
  customer_name text null,
  phone text null,
  address text null,
  parsed_district text null,
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  total numeric null,
  phone_hash text null check (phone_hash ~ '^[0-9a-f]{64}$'),
  device_hash text null check (device_hash ~ '^[0-9a-f]{64}$'),
  fingerprint_hash text null check (fingerprint_hash ~ '^[0-9a-f]{64}$'),
  network_hash text null check (network_hash ~ '^[0-9a-f]{64}$'),
  ip_hash text null check (ip_hash ~ '^[0-9a-f]{64}$'),
  user_agent_hash text null check (user_agent_hash ~ '^[0-9a-f]{64}$'),
  ip_prefix text null,
  network_type text null,
  geo_city text null,
  geo_region text null,
  geo_country text null,
  user_agent_summary text null,
  context_trusted boolean not null default false,
  label text null check (label in ('fake', 'genuine')),
  labelled_at timestamptz null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create table if not exists public.order_risk_list_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  list text not null check (list in ('block', 'allow')),
  kind text not null check (kind in ('phone', 'device', 'fingerprint', 'network')),
  value_hash text not null check (value_hash ~ '^[0-9a-f]{64}$'),
  display_hint text null,
  reason text null,
  source_attempt_id uuid null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  expires_at timestamptz null,
  unique (org_id, list, kind, value_hash)
);

create index if not exists order_risk_attempts_org_created_idx on public.order_risk_attempts (org_id, created_at desc);
create index if not exists order_risk_attempts_org_decision_created_idx on public.order_risk_attempts (org_id, decision, created_at desc);
create index if not exists order_risk_attempts_org_phone_idx on public.order_risk_attempts (org_id, phone_hash);
create index if not exists order_risk_attempts_org_device_idx on public.order_risk_attempts (org_id, device_hash);
create index if not exists order_risk_attempts_org_fingerprint_idx on public.order_risk_attempts (org_id, fingerprint_hash);
create index if not exists order_risk_attempts_org_network_idx on public.order_risk_attempts (org_id, network_hash);
create index if not exists order_risk_attempts_org_order_idx on public.order_risk_attempts (org_id, order_id) where order_id is not null;
create index if not exists order_risk_attempts_expires_idx on public.order_risk_attempts (expires_at);
create index if not exists order_risk_list_entries_org_list_created_idx on public.order_risk_list_entries (org_id, list, created_at desc);

alter table public.orders add column if not exists risk_attempt_id uuid;
alter table public.order_protection_reviews add column if not exists attempt_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.orders'::regclass and conname = 'orders_risk_attempt_id_fkey') then
    alter table public.orders add constraint orders_risk_attempt_id_fkey foreign key (risk_attempt_id) references public.order_risk_attempts(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.order_protection_reviews'::regclass and conname = 'order_protection_reviews_attempt_id_fkey') then
    alter table public.order_protection_reviews add constraint order_protection_reviews_attempt_id_fkey foreign key (attempt_id) references public.order_risk_attempts(id) on delete set null;
  end if;
end
$$;
create index if not exists orders_risk_attempt_id_idx on public.orders (risk_attempt_id) where risk_attempt_id is not null;

alter table public.order_risk_attempts enable row level security;
alter table public.order_risk_list_entries enable row level security;
revoke all on public.order_risk_attempts from anon, authenticated;
revoke all on public.order_risk_list_entries from anon, authenticated;
grant all on public.order_risk_attempts to service_role;
grant all on public.order_risk_list_entries to service_role;

commit;
```

In `scripts/verify-supabase-baseline.mjs`, add these exact entries to `runtimeTables` immediately after `"order_protection_reviews",`:

```js
  "order_risk_attempts",
  "order_risk_list_entries",
```

Add these exact rows to the required-column `values` list (before `('abandoned_checkouts', 'draft_key')`):

```sql
      ('orders', 'risk_attempt_id'),
      ('order_protection_reviews', 'attempt_id'),
```

- [ ] **Step 4: Run tests and local schema verification**

Run: `npx vitest run src/test/orderRiskSchema.test.ts && npm run verify:supabase-baseline`  
Expected: PASS; baseline creates fresh local databases twice. It does **not** apply remote migrations.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260924000000_order_risk_engine_v2.sql scripts/verify-supabase-baseline.mjs src/test/orderRiskSchema.test.ts
git commit -m "feat: add private order risk schema"
```

### Task 2: Workspace-guarded risk store and retention

**Files:**
- Create: `server/risk/store.js`
- Test: `src/test/orderRiskStore.test.ts`

**Interfaces:**
- Consumes: Supabase service-role client; row objects use snake_case DB columns and include `org_id`. `orgId` is server-resolved, never client-selected.
- Produces (verbatim shared §10):

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

`entries` is an array of `{ kind, value_hash, display_hint?, expires_at? }`. The return of `createListEntries` is the upserted rows. Link helpers return the updated `{ id }` or `null` when the guarded target is missing. Scrub returns `{ scrubbed, deleted }`. The service client alone may perform the unscoped retention scan; every other query includes `eq("org_id", orgId)` and writes supply or filter `org_id`.

- [ ] **Step 1: Write the failing store test** — create `src/test/orderRiskStore.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  insertRiskAttempt, linkAttemptToOrder, linkAttemptToReview, listRiskAttempts,
  getRiskAttempt, listRelatedAttempts, findListHits, createListEntries,
  listListEntries, deleteListEntry, labelRiskAttempt, scrubExpiredRiskAttempts,
} from "../../server/risk/store.js";

const orgId = "20000000-0000-0000-0000-000000000001";
const id = "30000000-0000-0000-0000-000000000001";
const other = "30000000-0000-0000-0000-000000000002";
const hash = "a".repeat(64);

function mockSupabase(results: Array<{ data?: unknown; error?: Error | null; count?: number }> = []) {
  const queries: Array<{ table: string; calls: Array<[string, ...unknown[]]> }> = [];
  const supabase = {
    from(table: string) {
      const query = { table, calls: [] as Array<[string, ...unknown[]]> };
      queries.push(query);
      const chain: Record<string, (...args: unknown[]) => unknown> = {};
      for (const method of ["select", "insert", "update", "upsert", "delete", "eq", "in", "or", "not", "lt", "gte", "order", "limit", "maybeSingle", "single"]) {
        chain[method] = (...args: unknown[]) => {
          query.calls.push([method, ...args]);
          return chain;
        };
      }
      chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        Promise.resolve(results.shift() ?? { data: [], error: null, count: 0 }).then(resolve, reject);
      return chain;
    },
  };
  return { supabase, queries };
}

function guarded(queries: ReturnType<typeof mockSupabase>["queries"]) {
  expect(queries.length).toBeGreaterThan(0);
  for (const query of queries) expect(query.calls).toContainEqual(["eq", "org_id", orgId]);
}

describe("risk store", () => {
  it("inserts a scoped attempt and links an order and a review", async () => {
    const { supabase, queries } = mockSupabase([
      { data: { id } }, { data: { id } }, { data: { id: other } },
      { data: { id } }, { data: { id } }, { data: { id: other } }, { data: { id } },
    ]);
    expect(await insertRiskAttempt(supabase, { org_id: orgId, route: "public_v1", mode: "shadow", decision: "HOLD", score: 40, expires_at: "2026-10-23T00:00:00.000Z" })).toEqual({ id });
    await linkAttemptToOrder(supabase, { orgId, attemptId: id, orderId: other });
    await linkAttemptToReview(supabase, { orgId, attemptId: id, reviewId: other });
    expect(queries[0].calls).toContainEqual(["insert", expect.objectContaining({ org_id: orgId })]);
    guarded(queries.slice(1));
    expect(queries.some(q => q.table === "orders" && q.calls.some(c => c[0] === "update" && (c[1] as { risk_attempt_id: string }).risk_attempt_id === id))).toBe(true);
    expect(queries.some(q => q.table === "order_protection_reviews" && q.calls.some(c => c[0] === "update" && (c[1] as { attempt_id: string }).attempt_id === id))).toBe(true);
    expect(queries.some(q => q.table === "order_risk_attempts" && q.calls.some(c => c[0] === "update" && (c[1] as { order_id?: string }).order_id === other))).toBe(true);
    expect(queries.some(q => q.table === "order_risk_attempts" && q.calls.some(c => c[0] === "update" && (c[1] as { review_id?: string }).review_id === other))).toBe(true);
  });

  it("validates filtered pagination and gets only scoped attempts", async () => {
    const { supabase, queries } = mockSupabase([{ data: [] }, { data: { id } }]);
    await listRiskAttempts(supabase, { orgId, decision: "hold", limit: 10, before: "2026-09-23T00:00:00Z" });
    expect(queries[0].calls).toContainEqual(["eq", "decision", "HOLD"]);
    expect(queries[0].calls).toContainEqual(["lt", "created_at", "2026-09-23T00:00:00.000Z"]);
    expect(queries[0].calls).toContainEqual(["limit", 10]);
    expect(await getRiskAttempt(supabase, { orgId, attemptId: id })).toEqual({ id });
    guarded(queries);
    await expect(listRiskAttempts(supabase, { orgId, decision: "BLOCK" })).rejects.toThrow();
    await expect(listRiskAttempts(supabase, { orgId, limit: 101 })).rejects.toThrow();
    await expect(listRiskAttempts(supabase, { orgId, before: "yesterday" })).rejects.toThrow();
    await expect(getRiskAttempt(supabase, { orgId, attemptId: "bad" })).rejects.toThrow();
  });

  it("finds recent related activity by any validated identity", async () => {
    const { supabase, queries } = mockSupabase([{ data: [] }]);
    await listRelatedAttempts(supabase, { orgId, attempt: { id, phone_hash: hash, device_hash: null, fingerprint_hash: hash }, days: 7, limit: 5 });
    guarded(queries);
    expect(queries[0].calls).toContainEqual(["or", `phone_hash.eq.${hash},fingerprint_hash.eq.${hash}`]);
    expect(queries[0].calls).toContainEqual(["not", "id", "eq", id]);
    expect(queries[0].calls).toContainEqual(["limit", 5]);
    await expect(listRelatedAttempts(supabase, { orgId, attempt: { id, phone_hash: "bad" } })).rejects.toThrow();
  });

  it("uses active hashed list entries and upserts staff decisions", async () => {
    const { supabase, queries } = mockSupabase([
      { data: [{ list: "block", kind: "phone", value_hash: hash }, { list: "allow", kind: "device", value_hash: hash }] },
      { data: [{ id }] }, { data: [] }, { data: [{ id }] },
    ]);
    expect(await findListHits(supabase, { orgId, hashes: { phone: hash, device: hash } })).toEqual({ block: ["phone"], allow: ["device"] });
    await createListEntries(supabase, { orgId, list: "block", entries: [{ kind: "phone", value_hash: hash, display_hint: "017••••448" }], reason: "Staff confirmed fake", sourceAttemptId: id, createdBy: other });
    await listListEntries(supabase, { orgId, list: "block" });
    await deleteListEntry(supabase, { orgId, entryId: id });
    guarded(queries);
    expect(queries[0].calls.find(c => c[0] === "or")?.[1]).toMatch(/^expires_at\.is\.null,expires_at\.gt\.\d{4}-/);
    expect(queries[1].calls).toContainEqual(["upsert", expect.arrayContaining([expect.objectContaining({ org_id: orgId, kind: "phone", reason: "Staff confirmed fake" })]), { onConflict: "org_id,list,kind,value_hash" }]);
    await expect(findListHits(supabase, { orgId, hashes: { phone: "raw-phone" } })).rejects.toThrow();
    await expect(createListEntries(supabase, { orgId, list: "block", entries: [{ kind: "phone", value_hash: "bad" }] })).rejects.toThrow();
  });

  it("labels attempts and scrubs 30-day PII before deleting 180-day rows", async () => {
    const { supabase, queries } = mockSupabase([{ data: { id } }, { count: 2 }, { count: 1 }]);
    await labelRiskAttempt(supabase, { orgId, attemptId: id, label: "fake" });
    expect(await scrubExpiredRiskAttempts(supabase, { now: new Date("2026-09-23T00:00:00Z") })).toEqual({ scrubbed: 2, deleted: 1 });
    guarded(queries.slice(0, 1));
    expect(queries[1].calls).toContainEqual(["update", expect.objectContaining({ customer_name: null, phone: null, address: null, ip_prefix: null, items: [] })]);
    expect(queries[1].calls).toContainEqual(["not", "phone", "is", null]);
    expect(queries[2].calls).toContainEqual(["lt", "created_at", "2026-03-27T00:00:00.000Z"]);
    await expect(labelRiskAttempt(supabase, { orgId, attemptId: id, label: "unknown" })).rejects.toThrow();
  });

  it("throws Supabase errors instead of silently returning empty results", async () => {
    const { supabase } = mockSupabase([{ error: new Error("database unavailable") }]);
    await expect(getRiskAttempt(supabase, { orgId, attemptId: id })).rejects.toThrow("database unavailable");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/orderRiskStore.test.ts`  
Expected: FAIL because `server/risk/store.js` does not exist.

- [ ] **Step 3: Write minimal implementation** — create `server/risk/store.js`:

```js
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const KINDS = ["phone", "device", "fingerprint", "network"];

function uuid(value, name) {
  if (typeof value !== "string" || !UUID.test(value)) throw new TypeError(`Invalid ${name}`);
  return value;
}
function hash(value, name) {
  if (typeof value !== "string" || !HASH.test(value)) throw new TypeError(`Invalid ${name}`);
  return value;
}
function listName(value) {
  if (value !== "block" && value !== "allow") throw new TypeError("Invalid list");
  return value;
}
function pageSize(value) {
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new TypeError("Invalid limit");
  return value;
}
function isoDate(value, name) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) throw new TypeError(`Invalid ${name}`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new TypeError(`Invalid ${name}`);
  return parsed.toISOString();
}
async function result(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
function ensureRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new TypeError("Invalid attempt");
  uuid(row.org_id, "org_id");
  if (!["public_v1", "custom_webhook"].includes(row.route) || !["shadow", "active"].includes(row.mode) || !["ALLOW", "HOLD", "BLOCK"].includes(row.decision) || !Number.isInteger(row.score) || row.score < 0) throw new TypeError("Invalid risk attempt");
  isoDate(row.expires_at, "expires_at");
  for (const key of ["phone_hash", "device_hash", "fingerprint_hash", "network_hash", "ip_hash", "user_agent_hash"]) {
    if (row[key] != null) hash(row[key], key);
  }
  for (const key of ["order_id", "review_id"]) if (row[key] != null) uuid(row[key], key);
  if (row.signals != null && !Array.isArray(row.signals)) throw new TypeError("Invalid signals");
  if (row.items != null && !Array.isArray(row.items)) throw new TypeError("Invalid items");
  return row;
}

export async function insertRiskAttempt(supabase, row) {
  return result(supabase.from("order_risk_attempts").insert(ensureRow(row)).select("id").single());
}

export async function linkAttemptToOrder(supabase, { orgId, attemptId, orderId }) {
  uuid(orgId, "orgId"); uuid(attemptId, "attemptId"); uuid(orderId, "orderId");
  const attempt = await result(supabase.from("order_risk_attempts").select("id").eq("org_id", orgId).eq("id", attemptId).maybeSingle());
  if (!attempt) return null;
  const order = await result(supabase.from("orders").update({ risk_attempt_id: attemptId }).eq("org_id", orgId).eq("id", orderId).select("id").maybeSingle());
  if (!order) return null;
  await result(supabase.from("order_risk_attempts").update({ order_id: orderId }).eq("org_id", orgId).eq("id", attemptId));
  return order;
}

export async function linkAttemptToReview(supabase, { orgId, attemptId, reviewId }) {
  uuid(orgId, "orgId"); uuid(attemptId, "attemptId"); uuid(reviewId, "reviewId");
  const attempt = await result(supabase.from("order_risk_attempts").select("id").eq("org_id", orgId).eq("id", attemptId).maybeSingle());
  if (!attempt) return null;
  const review = await result(supabase.from("order_protection_reviews").update({ attempt_id: attemptId }).eq("org_id", orgId).eq("id", reviewId).select("id").maybeSingle());
  if (!review) return null;
  await result(supabase.from("order_risk_attempts").update({ review_id: reviewId }).eq("org_id", orgId).eq("id", attemptId));
  return review;
}

export async function listRiskAttempts(supabase, { orgId, decision = "all", limit = 50, before = null }) {
  uuid(orgId, "orgId"); pageSize(limit);
  if (!["all", "allow", "hold", "block"].includes(decision)) throw new TypeError("Invalid decision");
  let query = supabase.from("order_risk_attempts").select("*").eq("org_id", orgId);
  if (decision !== "all") query = query.eq("decision", decision.toUpperCase());
  if (before != null) query = query.lt("created_at", isoDate(before, "before"));
  return (await result(query.order("created_at", { ascending: false }).limit(limit))) || [];
}

export async function getRiskAttempt(supabase, { orgId, attemptId }) {
  uuid(orgId, "orgId"); uuid(attemptId, "attemptId");
  return result(supabase.from("order_risk_attempts").select("*").eq("org_id", orgId).eq("id", attemptId).maybeSingle());
}

export async function listRelatedAttempts(supabase, { orgId, attempt, days = 7, limit = 50 }) {
  uuid(orgId, "orgId"); uuid(attempt?.id, "attempt.id"); pageSize(limit);
  if (!Number.isInteger(days) || days < 1 || days > 180) throw new TypeError("Invalid days");
  const terms = [];
  for (const key of ["phone_hash", "device_hash", "fingerprint_hash"]) {
    if (attempt[key] != null) terms.push(`${key}.eq.${hash(attempt[key], key)}`);
  }
  if (!terms.length) return [];
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  return (await result(supabase.from("order_risk_attempts").select("*").eq("org_id", orgId).gte("created_at", since).or(terms.join(",")).not("id", "eq", attempt.id).order("created_at", { ascending: false }).limit(limit))) || [];
}

export async function findListHits(supabase, { orgId, hashes }) {
  uuid(orgId, "orgId");
  const values = [];
  for (const kind of KINDS) if (hashes?.[kind] != null) values.push(hash(hashes[kind], kind));
  const hits = { block: [], allow: [] };
  if (!values.length) return hits;
  const rows = await result(supabase.from("order_risk_list_entries").select("list, kind, value_hash").eq("org_id", orgId).in("value_hash", values).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`));
  for (const row of rows || []) if ((row.list === "block" || row.list === "allow") && KINDS.includes(row.kind) && hashes[row.kind] === row.value_hash && !hits[row.list].includes(row.kind)) hits[row.list].push(row.kind);
  return hits;
}

export async function createListEntries(supabase, { orgId, list, entries, reason = null, sourceAttemptId = null, createdBy = null }) {
  uuid(orgId, "orgId"); listName(list);
  if (!Array.isArray(entries) || !entries.length) throw new TypeError("Invalid entries");
  if (sourceAttemptId != null) uuid(sourceAttemptId, "sourceAttemptId");
  if (createdBy != null) uuid(createdBy, "createdBy");
  if (reason != null && typeof reason !== "string") throw new TypeError("Invalid reason");
  const rows = entries.map(entry => {
    if (!entry || !KINDS.includes(entry.kind)) throw new TypeError("Invalid kind");
    hash(entry.value_hash, "value_hash");
    if (entry.display_hint != null && typeof entry.display_hint !== "string") throw new TypeError("Invalid display_hint");
    return { org_id: orgId, list, kind: entry.kind, value_hash: entry.value_hash, display_hint: entry.display_hint ?? null, reason, source_attempt_id: sourceAttemptId, created_by: createdBy, expires_at: entry.expires_at == null ? null : isoDate(entry.expires_at, "expires_at") };
  });
  return (await result(supabase.from("order_risk_list_entries").upsert(rows, { onConflict: "org_id,list,kind,value_hash" }).select("*").eq("org_id", orgId))) || [];
}

export async function listListEntries(supabase, { orgId, list }) {
  uuid(orgId, "orgId"); listName(list);
  return (await result(supabase.from("order_risk_list_entries").select("*").eq("org_id", orgId).eq("list", list).order("created_at", { ascending: false }))) || [];
}

export async function deleteListEntry(supabase, { orgId, entryId }) {
  uuid(orgId, "orgId"); uuid(entryId, "entryId");
  return result(supabase.from("order_risk_list_entries").delete().eq("org_id", orgId).eq("id", entryId).select("id").maybeSingle());
}

export async function labelRiskAttempt(supabase, { orgId, attemptId, label }) {
  uuid(orgId, "orgId"); uuid(attemptId, "attemptId");
  if (label !== "fake" && label !== "genuine") throw new TypeError("Invalid label");
  return result(supabase.from("order_risk_attempts").update({ label, labelled_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", attemptId).select("*").maybeSingle());
}

export async function scrubExpiredRiskAttempts(supabase, { now = new Date() } = {}) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError("Invalid now");
  // This internal service-role maintenance operation sweeps all workspaces; no client supplies its scope.
  const { count: scrubbed, error: scrubError } = await supabase.from("order_risk_attempts")
    .update({ customer_name: null, phone: null, address: null, ip_prefix: null, items: [] }, { count: "exact" })
    .lt("expires_at", now.toISOString()).not("phone", "is", null);
  if (scrubError) throw scrubError;
  const cutoff = new Date(now.getTime() - 180 * 86_400_000).toISOString();
  const { count: deleted, error: deleteError } = await supabase.from("order_risk_attempts")
    .delete({ count: "exact" }).lt("created_at", cutoff);
  if (deleteError) throw deleteError;
  return { scrubbed: scrubbed || 0, deleted: deleted || 0 };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/orderRiskStore.test.ts`  
Expected: PASS, including validation, guarded queries, list expiry, and retention counts.

- [ ] **Step 5: Commit**

```bash
git add server/risk/store.js src/test/orderRiskStore.test.ts
git commit -m "feat: add workspace-scoped risk store"
```

### Task 3: Best-effort daily risk retention

**Files:**
- Modify: `server/index.js:73-80,2980-2992`
- Test: `src/test/orderRiskMaintenanceWiring.test.ts`

**Interfaces:**
- Consumes: `scrubExpiredRiskAttempts(supabase, { now?: Date }) → { scrubbed, deleted }` from Task 2, existing `getServiceSupabase()` and `isAuthorizedCronRequest`.
- Produces: Existing `/api/internal/abandoned-checkouts-maintenance` response remains `{ ok: true, scannedWorkspaces, recovered, expired, scrubbed }`; risk cleanup is best-effort and never prevents the existing daily job.

- [ ] **Step 1: Write the failing source-wiring test** — create `src/test/orderRiskMaintenanceWiring.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const server = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

describe("daily risk retention", () => {
  it("runs only after cron auth and catches risk cleanup failures without logging personal data", () => {
    expect(server).toMatch(/import\s*\{\s*scrubExpiredRiskAttempts\s*\}\s*from\s*"\.\/risk\/store\.js"/);
    const start = server.indexOf('app.get("/api/internal/abandoned-checkouts-maintenance"');
    const end = server.indexOf("// Pre-fetches risk data", start);
    expect(start).toBeGreaterThan(-1);
    const route = server.slice(start, end);
    expect(route.indexOf("isAuthorizedCronRequest(req.headers.authorization, process.env.CRON_SECRET)"))
      .toBeLessThan(route.indexOf("scrubExpiredRiskAttempts"));
    expect(route).toMatch(/try\s*\{[\s\S]*?await scrubExpiredRiskAttempts\(getServiceSupabase\(\)\)[\s\S]*?\}\s*catch\s*\{\s*console\.warn\("\[OrderRisk\] maintenance failed"\);\s*\}/);
    expect(route.indexOf("runAbandonedCheckoutMaintenance()"))
      .toBeLessThan(route.indexOf("scrubExpiredRiskAttempts"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/orderRiskMaintenanceWiring.test.ts`  
Expected: FAIL because the risk cleanup is not wired into the daily route.

- [ ] **Step 3: Add the minimal route change** — add this import beside the existing order-protection imports in `server/index.js`:

```js
import { scrubExpiredRiskAttempts } from "./risk/store.js";
```

Inside the existing route's outer `try`, immediately after `const result = await runAbandonedCheckoutMaintenance();` and before `return res.json(...)`, insert:

```js
    try {
      await scrubExpiredRiskAttempts(getServiceSupabase());
    } catch {
      console.warn("[OrderRisk] maintenance failed");
    }
```

Keep the existing CRON_SECRET guard, outer error handler, and response unchanged. Never log the caught error; its message may contain customer data.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/orderRiskMaintenanceWiring.test.ts src/test/abandonedCheckoutMaintenanceWiring.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit** — inspect `git diff -- server/index.js` and `git diff --cached -- server/index.js` before staging. If the existing index contains another session's hunks (in `server/index.js` or elsewhere), defer the commit until that owner has cleared them; `git add -p` alone does not unstage existing hunks. With a clean index, stage only this task's import, route hunk and test; inspect the entire staged diff before committing.

```bash
git add src/test/orderRiskMaintenanceWiring.test.ts
git add -p server/index.js
git diff --cached
git commit -m "feat: scrub expired order risk attempts daily"
```

## Final local verification

- [ ] Verify the baseline, suite, lint and build:

```bash
npm run verify:supabase-baseline
npm test
npm run lint
npm run build
```

Expected: all exit 0. The baseline uses disposable local Postgres databases. If checks fail, fix the specific change using a failing test → minimal code → passing test cycle and rerun the failed check. Run `review` and `verification-before-completion` before claiming completion. Do **not** apply the migration remotely; the ship workflow applies it later, after `npm run verify:supabase-project` and `npm run verify:supabase-baseline`.

## Contract notes

- Shared §10 supersedes spec §10.2's `source_order_id`: the list table uses `source_attempt_id`. It also includes `reasons`, `phone_hash`, `ip_hash`, `user_agent_hash`, `geo_country`, `context_trusted`, and accuracy labels absent from the abbreviated design spec. This plan follows the shared contract verbatim.
- The global workspace guard has one necessary exception: daily retention scans all workspaces with the service-role client because the cron has no user context and cannot accept a client-supplied org id. Every user-facing store query is `org_id`-guarded. The migration retains UUID FKs on existing order/review links; the store checks the attempt and target's workspace before linking.
- Upsert needs `SELECT` for the returned rows and the unique `(org_id, list, kind, value_hash)` constraint; service-role grants both. Hashes remain after PII scrub until deletion at 180 days.
