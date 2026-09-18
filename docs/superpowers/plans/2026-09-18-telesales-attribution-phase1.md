# Telesales Attribution (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record which staff member created, was assigned, confirmed, or cancelled every order, so the Phase 2 Staff Performance report has data to read.

**Architecture:** Six nullable attribution columns on `orders` and `social_inbox_orders`, plus an append-only `order_status_events` log. All stamping logic lives in a new pure module `server/orderAttribution.js` and is called from the three existing write paths. The Steadfast webhook writes events but is structurally forbidden from writing attribution columns, because it already rewrites `status` to `"confirmed"` on delivery.

**Tech Stack:** Node 20 ESM, Express, Supabase (PostgreSQL via `@supabase/supabase-js`), React 18 + Vite + TypeScript, TanStack Query v5, Vitest, Tailwind, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-09-18-telesales-performance-design.md`

## Global Constraints

- **Workspace guard:** every query on `orders`, `social_inbox_orders`, `order_status_events`, `user_roles` must filter `.eq("org_id", orgId)`. Never accept an org or tenant id from the client. (CLAUDE.md §4)
- **Auth guard:** every new route starts `getToken(req)` → `getUser(token)` → `if (!user) return res.status(401).json({ error: "Unauthorized" })` → `getUserOrg(supabase, user.id)`. (CLAUDE.md §5)
- **Frontend API calls:** always `apiFetch()` from `src/lib/api.ts`. Never raw `fetch()`. (CLAUDE.md §12.1)
- **Routing:** React Router v6 only. Never `wouter`. (CLAUDE.md §12.4)
- **Icons:** Phosphor Icons with `weight="light"`. Lucide only if Phosphor lacks the icon. (CLAUDE.md §12.5)
- **Design tokens:** background `bg-[#FAFAF8]`; labels `text-[8px] font-medium tracking-[0.3em] text-black uppercase`; values `text-2xl font-light`; currency always `৳`. (CLAUDE.md §8)
- **Migrations:** never run DDL at application startup. New file under `supabase/migrations/`, never edit `supabase/legacy-migrations/`. (CLAUDE.md §2)
- **New backend routes** go in `server/index.js` in their domain section. (CLAUDE.md §12.8)
- **TypeScript is strict.** No `any` without a comment explaining why. (CLAUDE.md §9)
- **No backfill.** Attribution columns stay null on pre-existing rows. Fabricated history is worse than blank history.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260918000000_staff_attribution.sql` | **Create.** Attribution columns, `order_status_events`, `user_roles.display_name`, indexes, RLS |
| `server/orderAttribution.js` | **Create.** Pure functions: status normalization, attribution patch building, event row building. No Express, no Supabase imports |
| `server/index.js` | **Modify.** Add `telesales` source; wire attribution into `POST /api/orders`, `PATCH /api/orders/:id`, the Steadfast webhook, `saveMetaInboxOrder`; add `GET /api/staff` and `PATCH /api/team-members/:id` |
| `src/lib/orderSource.ts` | **Modify.** Add the `telesales` option |
| `src/components/order-editor/StaffSelect.tsx` | **Create.** Staff dropdown, mirrors `OrderSourceSelect` exactly |
| `src/pages/NewOrder.tsx` | **Modify.** Render `StaffSelect`, submit `assigned_to` |
| `src/components/TeamManagement.tsx` | **Modify.** Editable name field per member |

`server/orderAttribution.js` is a separate module rather than inline code because `server/index.js` is already 12,955 lines. Pure functions let the status-transition rules be unit-tested without booting Express or mocking Supabase — and those rules are where the subtle bugs live.

## Test conventions in this codebase

Three established patterns. Follow them; do not invent a fourth.

1. **Pure module tests** — import the module directly and assert on return values. Example: `src/test/cog.test.ts` imports from `../../server/cog.js`.
2. **Migration tests** — read the `.sql` file as text and assert with regexes. Example: `src/test/abandonedCheckoutsSchema.test.ts`.
3. **Route wiring tests** — read `server/index.js` as text, slice out a route with `routeSection(startMarker, endMarker)`, assert the slice contains the required guards. Example: `src/test/abandonedCheckoutRouteWiring.test.ts`.

There is no integration test harness that boots Express against a live database. Do not add one in this plan.

---

### Task 1: Attribution schema migration

**Files:**
- Create: `supabase/migrations/20260918000000_staff_attribution.sql`
- Test: `src/test/staffAttributionSchema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: columns `created_by`, `assigned_to`, `confirmed_by`, `confirmed_at`, `cancelled_by`, `cancelled_at` on `public.orders` and `public.social_inbox_orders`; table `public.order_status_events`; column `public.user_roles.display_name`.

- [ ] **Step 1: Write the failing test**

Create `src/test/staffAttributionSchema.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260918000000_staff_attribution.sql",
);

describe("staff attribution schema", () => {
  it("adds nullable attribution columns to both order tables", async () => {
    const sql = await readFile(migrationPath, "utf8");

    for (const table of ["orders", "social_inbox_orders"]) {
      for (const column of [
        "created_by",
        "assigned_to",
        "confirmed_by",
        "cancelled_by",
      ]) {
        expect(sql).toMatch(
          new RegExp(`add column if not exists ${column} uuid`, "i"),
        );
      }
      expect(sql).toMatch(new RegExp(`alter table public\\.${table}`, "i"));
    }
    expect(sql).toMatch(/add column if not exists confirmed_at timestamptz/i);
    expect(sql).toMatch(/add column if not exists cancelled_at timestamptz/i);
  });

  it("never backfills attribution on existing rows", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).not.toMatch(/update public\.orders\s+set\s+(created_by|confirmed_by)/i);
    expect(sql).not.toMatch(
      /update public\.social_inbox_orders\s+set\s+(created_by|confirmed_by)/i,
    );
  });

  it("keeps every attribution column nullable", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).not.toMatch(
      /add column if not exists (created_by|assigned_to|confirmed_by|cancelled_by) uuid[^,;]*not null/i,
    );
  });

  it("creates an append-only status event log constrained to the two order tables", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/create table if not exists public\.order_status_events/i);
    expect(sql).toMatch(/order_table text not null/i);
    expect(sql).toMatch(/check \(order_table in \('orders', 'social_inbox_orders'\)\)/i);
    expect(sql).toMatch(/actor_kind text not null/i);
    expect(sql).toMatch(/check \(actor_kind in \('user', 'courier_webhook', 'system'\)\)/i);
    expect(sql).toMatch(/to_status text not null/i);
    expect(sql).toMatch(/org_id uuid not null/i);
  });

  it("indexes the report's access patterns", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/create index if not exists orders_org_confirmed_by_idx/i);
    expect(sql).toMatch(/create index if not exists orders_org_assigned_to_idx/i);
    expect(sql).toMatch(/create index if not exists social_inbox_orders_org_confirmed_by_idx/i);
    expect(sql).toMatch(/create index if not exists social_inbox_orders_org_assigned_to_idx/i);
    expect(sql).toMatch(/create index if not exists order_status_events_org_order_idx/i);
    expect(sql).toMatch(/create index if not exists order_status_events_org_actor_idx/i);
  });

  it("keeps the event log service-role only and adds staff display names", async () => {
    const sql = await readFile(migrationPath, "utf8");

    expect(sql).toMatch(/alter table public\.order_status_events enable row level security/i);
    expect(sql).not.toMatch(/grant .* on public\.order_status_events to (anon|authenticated)/i);
    expect(sql).toMatch(/alter table public\.user_roles\s+add column if not exists display_name text/i);
  });

  it("is transactional and idempotent", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql.trim().startsWith("begin;")).toBe(true);
    expect(sql.trim().endsWith("commit;")).toBe(true);
    const creates = sql.match(/create table (?!if not exists)/gi);
    expect(creates).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/staffAttributionSchema.test.ts`
Expected: FAIL — `ENOENT: no such file or directory` for the migration path.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260918000000_staff_attribution.sql`:

```sql
-- Staff attribution for the Telesales / User Performance report.
--
-- Records which staff member created, was assigned, confirmed, or cancelled
-- each order. Every column is nullable and nothing is backfilled: pre-existing
-- rows have no recorded actor and a fabricated one would corrupt the report.

begin;

alter table public.orders
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists assigned_to uuid references auth.users(id),
  add column if not exists confirmed_by uuid references auth.users(id),
  add column if not exists confirmed_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id),
  add column if not exists cancelled_at timestamptz;

alter table public.social_inbox_orders
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists assigned_to uuid references auth.users(id),
  add column if not exists confirmed_by uuid references auth.users(id),
  add column if not exists confirmed_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id),
  add column if not exists cancelled_at timestamptz;

-- The report always filters by workspace, then staff member, then time.
create index if not exists orders_org_confirmed_by_idx
  on public.orders (org_id, confirmed_by, confirmed_at desc)
  where confirmed_by is not null;

create index if not exists orders_org_assigned_to_idx
  on public.orders (org_id, assigned_to, created_at desc)
  where assigned_to is not null;

create index if not exists social_inbox_orders_org_confirmed_by_idx
  on public.social_inbox_orders (org_id, confirmed_by, confirmed_at desc)
  where confirmed_by is not null;

create index if not exists social_inbox_orders_org_assigned_to_idx
  on public.social_inbox_orders (org_id, assigned_to, created_at desc)
  where assigned_to is not null;

-- Append-only transition log.
--
-- The attribution columns answer "who confirmed this" in one indexed read.
-- This log exists for what the columns cannot hold: the Steadfast webhook
-- rewrites orders.status to 'confirmed' on delivery, and an order can be
-- confirmed, cancelled, then re-confirmed by a different person. The columns
-- keep the latest writer; the log keeps the sequence.
create table if not exists public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  order_id uuid not null,
  order_table text not null check (order_table in ('orders', 'social_inbox_orders')),
  from_status text,
  to_status text not null,
  actor_id uuid references auth.users(id),
  actor_kind text not null check (actor_kind in ('user', 'courier_webhook', 'system')),
  created_at timestamptz not null default now()
);

create index if not exists order_status_events_org_order_idx
  on public.order_status_events (org_id, order_table, order_id, created_at);

create index if not exists order_status_events_org_actor_idx
  on public.order_status_events (org_id, actor_id, created_at desc)
  where actor_id is not null;

-- Server-only, matching the Meta token and AI audit tables: RLS on, no
-- authenticated or anon grant. All reads go through the Express API.
alter table public.order_status_events enable row level security;
grant all on public.order_status_events to service_role;

-- Staff currently have no name anywhere in the system; the only identifier is
-- the Supabase auth email. Reports and the order form need a human name.
alter table public.user_roles
  add column if not exists display_name text;

commit;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/staffAttributionSchema.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Verify the migration against the canonical baseline**

Run: `npm run verify:supabase-baseline`
Expected: exits 0. If it reports drift, stop and report the output — do not edit the baseline migration to make it pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260918000000_staff_attribution.sql src/test/staffAttributionSchema.test.ts
git commit -m "feat: add staff attribution columns and order status event log"
```

---

### Task 2: Telesales order source

**Files:**
- Modify: `server/index.js:743` (the `ORDER_SOURCE_VALUES` set)
- Modify: `src/lib/orderSource.ts:1-9` (the `ORDER_SOURCE_OPTIONS` array)
- Test: `src/test/orderSource.test.ts` (existing file — add cases)

**Interfaces:**
- Consumes: nothing.
- Produces: `"telesales"` accepted by `isCanonicalOrderSource()` server-side and present in `ORDER_SOURCE_OPTIONS` client-side. `OrderSource` union type gains `"telesales"`.

- [ ] **Step 1: Write the failing test**

Append to `src/test/orderSource.test.ts`:

```ts
describe("telesales source", () => {
  it("is a canonical option labelled Telesales", () => {
    expect(ORDER_SOURCE_OPTIONS).toContainEqual({
      value: "telesales",
      label: "Telesales",
    });
  });

  it("round-trips through normalization", () => {
    expect(normalizeOrderSource("telesales")).toBe("telesales");
    expect(normalizeOrderSource("  TELESALES  ")).toBe("telesales");
    expect(orderSourceLabel("telesales")).toBe("Telesales");
  });

  it("does not capture any pre-existing source value", () => {
    for (const legacy of [
      "website",
      "facebook",
      "instagram",
      "whatsapp",
      "phone",
      "manual_other",
      "shopify",
      "inbox",
      "custom_website_tracker",
      "storefront",
    ]) {
      expect(normalizeOrderSource(legacy)).not.toBe("telesales");
    }
  });

  it("is accepted by the server-side canonical source guard", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
    expect(source).toMatch(
      /const ORDER_SOURCE_VALUES = new Set\(\[[^\]]*"telesales"[^\]]*\]\)/,
    );
  });
});
```

Make sure the file's existing import line covers `ORDER_SOURCE_OPTIONS`, `normalizeOrderSource`, and `orderSourceLabel`. Read the top of the file first and extend the import rather than adding a second one.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/orderSource.test.ts`
Expected: FAIL — `telesales` is not in `ORDER_SOURCE_OPTIONS`, and `normalizeOrderSource("telesales")` returns `"manual_other"`.

- [ ] **Step 3: Add the option client-side**

In `src/lib/orderSource.ts`, add to `ORDER_SOURCE_OPTIONS` between `phone` and `manual_other`:

```ts
export const ORDER_SOURCE_OPTIONS = [
  { value: "website", label: "Website" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Phone" },
  { value: "telesales", label: "Telesales" },
  { value: "manual_other", label: "Manual / Other" },
] as const;
```

No change to `normalizeOrderSource` is needed: it already returns any value present in `ORDER_SOURCE_OPTIONS` and falls back to `manual_other` otherwise.

- [ ] **Step 4: Add the value server-side**

In `server/index.js`, change the set on line 743:

```js
const ORDER_SOURCE_VALUES = new Set(["website", "facebook", "instagram", "whatsapp", "phone", "telesales", "manual_other"]);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/test/orderSource.test.ts src/test/orderSourceRouteWiring.test.ts`
Expected: PASS. Run the second file too — it asserts on the source guard and must not regress.

- [ ] **Step 6: Commit**

```bash
git add server/index.js src/lib/orderSource.ts src/test/orderSource.test.ts
git commit -m "feat: add telesales order source"
```

---

### Task 3: `server/orderAttribution.js` pure module

**Files:**
- Create: `server/orderAttribution.js`
- Test: `src/test/orderAttribution.test.ts`

**Interfaces:**
- Consumes: nothing. This module imports nothing and touches no I/O.
- Produces, relied on by Tasks 4 and 5:
  - `normalizeAttributionStatus(value: string | null | undefined): string`
  - `isApprovedStatus(status: string): boolean`
  - `isCancelledStatus(status: string): boolean`
  - `buildAttributionPatch({ fromStatus, toStatus, actorId, actorKind, now }): Record<string, unknown>`
  - `buildStatusEvent({ orgId, orderId, orderTable, fromStatus, toStatus, actorId, actorKind }): Record<string, unknown> | null`
  - `ORDER_TABLES: readonly ["orders", "social_inbox_orders"]`

- [ ] **Step 1: Write the failing test**

Create `src/test/orderAttribution.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  normalizeAttributionStatus,
  isApprovedStatus,
  isCancelledStatus,
  buildAttributionPatch,
  buildStatusEvent,
} from "../../server/orderAttribution.js";

const ACTOR = "11111111-1111-1111-1111-111111111111";
const NOW = "2026-09-18T10:00:00.000Z";

describe("normalizeAttributionStatus", () => {
  it("lowercases, trims, and collapses separators", () => {
    expect(normalizeAttributionStatus("  Partial Delivered ")).toBe("partial_delivered");
    expect(normalizeAttributionStatus("READY-TO-SHIP")).toBe("ready_to_ship");
  });

  it("maps null and undefined to an empty string", () => {
    expect(normalizeAttributionStatus(null)).toBe("");
    expect(normalizeAttributionStatus(undefined)).toBe("");
  });
});

describe("status predicates", () => {
  it("treats approved and confirmed as the same business state", () => {
    expect(isApprovedStatus("approved")).toBe(true);
    expect(isApprovedStatus("confirmed")).toBe(true);
    expect(isApprovedStatus("pending")).toBe(false);
  });

  it("treats cancelled, canceled, and rejected as cancellation", () => {
    expect(isCancelledStatus("cancelled")).toBe(true);
    expect(isCancelledStatus("canceled")).toBe(true);
    expect(isCancelledStatus("rejected")).toBe(true);
    expect(isCancelledStatus("returned")).toBe(false);
  });
});

describe("buildAttributionPatch", () => {
  it("stamps the confirmer when a user approves a pending order", () => {
    expect(
      buildAttributionPatch({
        fromStatus: "pending",
        toStatus: "approved",
        actorId: ACTOR,
        actorKind: "user",
        now: NOW,
      }),
    ).toEqual({ confirmed_by: ACTOR, confirmed_at: NOW });
  });

  it("stamps the canceller and leaves the confirmer intact", () => {
    expect(
      buildAttributionPatch({
        fromStatus: "approved",
        toStatus: "cancelled",
        actorId: ACTOR,
        actorKind: "user",
        now: NOW,
      }),
    ).toEqual({ cancelled_by: ACTOR, cancelled_at: NOW });
  });

  it("clears the cancellation when a cancelled order is re-approved", () => {
    expect(
      buildAttributionPatch({
        fromStatus: "cancelled",
        toStatus: "approved",
        actorId: ACTOR,
        actorKind: "user",
        now: NOW,
      }),
    ).toEqual({
      confirmed_by: ACTOR,
      confirmed_at: NOW,
      cancelled_by: null,
      cancelled_at: null,
    });
  });

  it("returns an empty patch for the courier webhook, whatever the transition", () => {
    for (const toStatus of ["approved", "confirmed", "cancelled", "delivered"]) {
      expect(
        buildAttributionPatch({
          fromStatus: "processing",
          toStatus,
          actorId: null,
          actorKind: "courier_webhook",
          now: NOW,
        }),
      ).toEqual({});
    }
  });

  it("returns an empty patch when the status did not actually change", () => {
    expect(
      buildAttributionPatch({
        fromStatus: "approved",
        toStatus: "confirmed",
        actorId: ACTOR,
        actorKind: "user",
        now: NOW,
      }),
    ).toEqual({});
  });

  it("returns an empty patch for transitions that are neither approval nor cancellation", () => {
    expect(
      buildAttributionPatch({
        fromStatus: "approved",
        toStatus: "print",
        actorId: ACTOR,
        actorKind: "user",
        now: NOW,
      }),
    ).toEqual({});
  });

  it("refuses to stamp a user transition with no actor id", () => {
    expect(
      buildAttributionPatch({
        fromStatus: "pending",
        toStatus: "approved",
        actorId: null,
        actorKind: "user",
        now: NOW,
      }),
    ).toEqual({});
  });
});

describe("buildStatusEvent", () => {
  it("builds a workspace-scoped event row", () => {
    expect(
      buildStatusEvent({
        orgId: "org-1",
        orderId: "order-1",
        orderTable: "orders",
        fromStatus: "pending",
        toStatus: "approved",
        actorId: ACTOR,
        actorKind: "user",
      }),
    ).toEqual({
      org_id: "org-1",
      order_id: "order-1",
      order_table: "orders",
      from_status: "pending",
      to_status: "approved",
      actor_id: ACTOR,
      actor_kind: "user",
    });
  });

  it("logs courier transitions with a null actor", () => {
    expect(
      buildStatusEvent({
        orgId: "org-1",
        orderId: "order-1",
        orderTable: "orders",
        fromStatus: "processing",
        toStatus: "delivered",
        actorId: null,
        actorKind: "courier_webhook",
      }),
    ).toMatchObject({ actor_id: null, actor_kind: "courier_webhook" });
  });

  it("returns null when the normalized status did not change", () => {
    expect(
      buildStatusEvent({
        orgId: "org-1",
        orderId: "order-1",
        orderTable: "orders",
        fromStatus: "approved",
        toStatus: "Confirmed",
        actorId: ACTOR,
        actorKind: "user",
      }),
    ).toBeNull();
  });

  it("returns null for an unknown order table rather than writing a bad row", () => {
    expect(
      buildStatusEvent({
        orgId: "org-1",
        orderId: "order-1",
        orderTable: "invoices",
        fromStatus: "pending",
        toStatus: "approved",
        actorId: ACTOR,
        actorKind: "user",
      }),
    ).toBeNull();
  });

  it("records order creation with a null from_status", () => {
    expect(
      buildStatusEvent({
        orgId: "org-1",
        orderId: "order-1",
        orderTable: "orders",
        fromStatus: null,
        toStatus: "confirmed",
        actorId: ACTOR,
        actorKind: "user",
      }),
    ).toMatchObject({ from_status: null, to_status: "confirmed" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/orderAttribution.test.ts`
Expected: FAIL — cannot resolve `../../server/orderAttribution.js`.

- [ ] **Step 3: Write the implementation**

Create `server/orderAttribution.js`:

```js
// Staff attribution for order status transitions.
//
// Pure functions only — no Express, no Supabase, no clock. The callers in
// server/index.js supply the actor and the timestamp. Keeping this module
// I/O-free is what makes the transition rules testable, and those rules are
// where the subtle bugs live.

export const ORDER_TABLES = Object.freeze(["orders", "social_inbox_orders"]);

const ACTOR_KINDS = new Set(["user", "courier_webhook", "system"]);
const APPROVED_STATES = new Set(["approved", "confirmed"]);
const CANCELLED_STATES = new Set(["cancelled", "canceled", "rejected"]);

// Mirrors normalizeBusinessStatus in server/index.js — keep in sync.
export function normalizeAttributionStatus(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function isApprovedStatus(status) {
  return APPROVED_STATES.has(normalizeAttributionStatus(status));
}

export function isCancelledStatus(status) {
  return CANCELLED_STATES.has(normalizeAttributionStatus(status));
}

// Returns the columns to merge into the order update, or {} when this
// transition earns no attribution.
//
// Only 'user' transitions ever stamp a name. The Steadfast webhook sets
// status to 'confirmed' on delivery (server/index.js), so letting it through
// here would overwrite the real confirmer on every delivered parcel.
export function buildAttributionPatch({ fromStatus, toStatus, actorId, actorKind, now }) {
  if (actorKind !== "user") return {};
  if (!actorId) return {};

  const from = normalizeAttributionStatus(fromStatus);
  const to = normalizeAttributionStatus(toStatus);
  if (!to || from === to) return {};

  if (APPROVED_STATES.has(to)) {
    const patch = { confirmed_by: actorId, confirmed_at: now };
    // Re-approving a cancelled order clears the cancellation: the order is no
    // longer cancelled. The event log retains the full history.
    if (CANCELLED_STATES.has(from)) {
      patch.cancelled_by = null;
      patch.cancelled_at = null;
    }
    return patch;
  }

  if (CANCELLED_STATES.has(to)) {
    return { cancelled_by: actorId, cancelled_at: now };
  }

  return {};
}

// Returns the row to insert into order_status_events, or null when there is
// nothing worth logging.
export function buildStatusEvent({
  orgId,
  orderId,
  orderTable,
  fromStatus,
  toStatus,
  actorId,
  actorKind,
}) {
  if (!orgId || !orderId) return null;
  if (!ORDER_TABLES.includes(orderTable)) return null;
  if (!ACTOR_KINDS.has(actorKind)) return null;

  const to = normalizeAttributionStatus(toStatus);
  if (!to) return null;

  // fromStatus null means the order was just created; there is no prior state.
  const isCreation = fromStatus === null || fromStatus === undefined;
  const from = isCreation ? null : normalizeAttributionStatus(fromStatus);
  if (!isCreation && from === to) return null;

  return {
    org_id: orgId,
    order_id: orderId,
    order_table: orderTable,
    from_status: from,
    to_status: to,
    actor_id: actorId ?? null,
    actor_kind: actorKind,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/orderAttribution.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Commit**

```bash
git add server/orderAttribution.js src/test/orderAttribution.test.ts
git commit -m "feat: add pure order attribution module"
```

---

### Task 4: Wire attribution into order create and update

**Files:**
- Modify: `server/index.js:7158-7250` (`POST /api/orders`)
- Modify: `server/index.js:7253-7325` (`PATCH /api/orders/:id`)
- Test: `src/test/orderAttributionRouteWiring.test.ts`

**Interfaces:**
- Consumes: `buildAttributionPatch`, `buildStatusEvent` from Task 3; the `telesales` source from Task 2; the schema from Task 1.
- Produces: a helper `recordStatusEvent(supabase, event)` used again by Task 5.

Context the implementer needs: `src/pages/NewOrder.tsx:199` submits `status: "confirmed"`, so every manually created order is born already approved. Creation must therefore stamp `confirmed_by` as well as `created_by`.

- [ ] **Step 1: Write the failing test**

Create `src/test/orderAttributionRouteWiring.test.ts`:

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

describe("order attribution wiring", () => {
  it("imports the pure attribution module rather than inlining the rules", () => {
    expect(source).toMatch(
      /import \{[^}]*buildAttributionPatch[^}]*\} from "\.\/orderAttribution\.js"/,
    );
    expect(source).toMatch(/buildStatusEvent/);
  });

  it("stamps creator and assignee on order creation", () => {
    const create = routeSection(
      'app.post("/api/orders"',
      'app.patch("/api/orders/:id"',
    );

    expect(create).toContain("row.created_by = user.id");
    expect(create).toContain("assigned_to");
    expect(create).toContain('actorKind: "user"');
  });

  it("validates assigned_to against this workspace and never trusts the client id", () => {
    const create = routeSection(
      'app.post("/api/orders"',
      'app.patch("/api/orders/:id"',
    );

    expect(create).toContain("assertWorkspaceMember");
    expect(create).toMatch(/status\(400\)/);
    // The org must come from the session, never the request body.
    expect(create).not.toMatch(/req\.body(?:\?\.)?\.org(?:Id|_id)/);
  });

  // NewOrder.tsx submits status: "confirmed", so a manual order is born
  // approved and the creator is also its confirmer. The patch builder decides
  // that from the transition rather than the route hardcoding it.
  it("runs the creation status through the attribution patch builder", () => {
    const create = routeSection(
      'app.post("/api/orders"',
      'app.patch("/api/orders/:id"',
    );

    expect(create).toContain("buildAttributionPatch");
    expect(create).toContain("fromStatus: null");
    expect(create).toContain("toStatus: row.status");
    expect(create).toContain("Object.assign(row,");
  });

  it("stamps attribution and logs an event on status change", () => {
    const patch = routeSection(
      'app.patch("/api/orders/:id"',
      'app.post("/api/orders/:id/send-sms"',
    );

    expect(patch).toContain("buildAttributionPatch");
    expect(patch).toContain("buildStatusEvent");
    expect(patch).toContain("orderCheck.status");
    expect(patch).toContain('actorKind: "user"');
    expect(patch).toContain('.eq("org_id", orgId)');
  });

  it("writes events through a helper that cannot fail the order write", () => {
    const helper = routeSection(
      "async function recordStatusEvent",
      'app.post("/api/orders"',
    );
    expect(helper).toContain('.from("order_status_events")');
    // An audit-log failure must not roll back or 500 the order it describes.
    expect(helper).toContain("console.error");
    expect(helper).not.toContain("throw");
  });

  it("validates the assignee against user_roles in the resolved workspace", () => {
    const guard = routeSection(
      "async function assertWorkspaceMember",
      "async function recordStatusEvent",
    );
    expect(guard).toContain('.from("user_roles")');
    expect(guard).toContain('.eq("org_id", orgId)');
    expect(guard).toContain('.eq("user_id", userId)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/orderAttributionRouteWiring.test.ts`
Expected: FAIL — no import of `./orderAttribution.js`, no `recordStatusEvent`.

- [ ] **Step 3: Add the import and shared helpers**

In `server/index.js`, add to the import block at the top of the file (next to the other local `server/*.js` imports):

```js
import { buildAttributionPatch, buildStatusEvent } from "./orderAttribution.js";
```

Then add these two helpers immediately **above** `app.post("/api/orders"` so the `routeSection` markers in the test resolve:

```js
// ── Order attribution ────────────────────────────────────────────────────────

// Confirms a user id belongs to this workspace before it is stored as an
// assignee. The id arrives from the client, so it is never trusted directly.
async function assertWorkspaceMember(supabase, orgId, userId) {
  if (!userId) return false;
  const { data } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

// Best-effort append to the transition log. A failure here must never fail the
// order write that triggered it — the log is an audit trail, not a source of
// truth for order state.
async function recordStatusEvent(supabase, event) {
  if (!event) return;
  const { error } = await supabase.from("order_status_events").insert(event);
  if (error) console.error("[attribution] event insert failed:", error.message);
}
```

- [ ] **Step 4: Wire the create route**

In `POST /api/orders`, after `row.order_number = await getNextManualOrderNumber(orgId);` and the `if (!row.status) row.status = "pending";` line, insert:

```js
    row.created_by = user.id;

    // The staff member credited with the order. Defaults to whoever is filling
    // the form; the New Order page lets a telesales lead be named instead.
    const requestedAssignee = req.body?.assigned_to;
    if (requestedAssignee !== undefined && requestedAssignee !== null) {
      if (typeof requestedAssignee !== "string") {
        return res.status(400).json({ error: "Invalid assigned_to" });
      }
      if (!(await assertWorkspaceMember(supabase, orgId, requestedAssignee))) {
        return res.status(400).json({ error: "Assigned staff member not found in this workspace" });
      }
      row.assigned_to = requestedAssignee;
    } else {
      row.assigned_to = user.id;
    }

    // Manual orders are created already approved, so the creator is also the
    // confirmer. buildAttributionPatch decides whether that is true.
    const createdAtIso = new Date().toISOString();
    Object.assign(row, buildAttributionPatch({
      fromStatus: null,
      toStatus: row.status,
      actorId: user.id,
      actorKind: "user",
      now: createdAtIso,
    }));
```

Then, after the successful insert and the `order_items` insert — immediately before `await sendBulkSms(orgId, "confirmation", data);` — add:

```js
    await recordStatusEvent(supabase, buildStatusEvent({
      orgId,
      orderId: data.id,
      orderTable: "orders",
      fromStatus: null,
      toStatus: data.status,
      actorId: user.id,
      actorKind: "user",
    }));
```

- [ ] **Step 5: Wire the update route**

In `PATCH /api/orders/:id`, the existing code already fetches `orderCheck` and validates the print state machine. Replace the final update-and-return block:

```js
    const { error: updErr } = await supabase.from("orders").update(update).eq("id", req.params.id).eq("org_id", orgId);
    if (updErr) throw updErr;
    const { data } = await supabase.from("orders").select("*").eq("id", req.params.id).eq("org_id", orgId).single();
    return res.json({ success: true, order: data });
```

with:

```js
    if (update.status !== undefined) {
      Object.assign(update, buildAttributionPatch({
        fromStatus: orderCheck.status,
        toStatus: update.status,
        actorId: user.id,
        actorKind: "user",
        now: new Date().toISOString(),
      }));
    }

    const { error: updErr } = await supabase.from("orders").update(update).eq("id", req.params.id).eq("org_id", orgId);
    if (updErr) throw updErr;

    if (update.status !== undefined) {
      await recordStatusEvent(supabase, buildStatusEvent({
        orgId,
        orderId: req.params.id,
        orderTable: "orders",
        fromStatus: orderCheck.status,
        toStatus: update.status,
        actorId: user.id,
        actorKind: "user",
      }));
    }

    const { data } = await supabase.from("orders").select("*").eq("id", req.params.id).eq("org_id", orgId).single();
    return res.json({ success: true, order: data });
```

Note: `assigned_to`, `created_by`, `confirmed_by`, and `cancelled_by` are deliberately **not** added to the route's `allowed` array. Attribution is derived from who is acting, never accepted from the request body on update.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/test/orderAttributionRouteWiring.test.ts src/test/orderAttribution.test.ts`
Expected: PASS.

- [ ] **Step 7: Verify the server still boots**

Run: `node --check server/index.js`
Expected: no output, exit 0.

- [ ] **Step 8: Commit**

```bash
git add server/index.js src/test/orderAttributionRouteWiring.test.ts
git commit -m "feat: stamp staff attribution on order create and update"
```

---

### Task 5: Lock the Steadfast webhook out of attribution

This is the highest-value test in the plan. `server/index.js:7946` sets `patch.status = "confirmed"` when a parcel is delivered. If attribution ever leaks into that path, every delivery silently overwrites the real confirmer's name and the report becomes quietly wrong rather than loudly broken.

**Files:**
- Modify: `server/index.js:7899-7960` (`POST /api/webhooks/steadfast`)
- Modify: `server/index.js` — `saveMetaInboxOrder` (around line 8945)
- Test: `src/test/steadfastAttributionIsolation.test.ts`

**Interfaces:**
- Consumes: `buildStatusEvent`, `recordStatusEvent` from Tasks 3 and 4.
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Create `src/test/steadfastAttributionIsolation.test.ts`:

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

const webhook = () =>
  routeSection('app.post("/api/webhooks/steadfast"', "// ── Returns ──");

describe("steadfast webhook attribution isolation", () => {
  // The webhook sets status to "confirmed" on delivery. If it also wrote
  // confirmed_by, every delivered parcel would overwrite the staff member who
  // actually confirmed the order.
  it("never writes any attribution column", () => {
    const section = webhook();
    for (const column of [
      "confirmed_by",
      "confirmed_at",
      "cancelled_by",
      "cancelled_at",
      "created_by",
      "assigned_to",
    ]) {
      expect(section).not.toContain(column);
    }
  });

  it("never calls buildAttributionPatch", () => {
    expect(webhook()).not.toContain("buildAttributionPatch");
  });

  it("logs the transition as courier_webhook with no actor", () => {
    const section = webhook();
    expect(section).toContain("buildStatusEvent");
    expect(section).toContain('actorKind: "courier_webhook"');
    expect(section).toContain("actorId: null");
  });

  it("still keeps the transition workspace-scoped", () => {
    expect(webhook()).toContain('.eq("org_id", order.org_id)');
  });

  it("logs bot-created inbox orders as system, not as a user", () => {
    const save = routeSection(
      "async function saveMetaInboxOrder",
      "async function sendMetaMessage",
    );
    expect(save).toContain('actorKind: "system"');
    expect(save).not.toContain("confirmed_by");
    expect(save).not.toContain("created_by");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/steadfastAttributionIsolation.test.ts`
Expected: FAIL on the `buildStatusEvent` / `actorKind` assertions. The "never writes attribution" assertions should already pass — that is correct, they are regression guards.

- [ ] **Step 3: Add event logging to the webhook**

In `POST /api/webhooks/steadfast`, the existing code ends with:

```js
    await supabase.from("orders").update(patch).eq("id", order.id).eq("org_id", order.org_id);
    console.log(`[Steadfast Webhook] Order ${order.id} status updated: ${order.courier_status} → ${status}`);
    return res.status(200).json({ ok: true, updated: true });
```

Change the `select` on the order lookup earlier in the handler from:

```js
      .select("id, org_id, courier_status")
```

to:

```js
      .select("id, org_id, courier_status, status")
```

Then replace the closing block with:

```js
    await supabase.from("orders").update(patch).eq("id", order.id).eq("org_id", order.org_id);

    // Log only — never stamp attribution here. patch.status becomes
    // "confirmed" on delivery, so writing an actor would overwrite the staff
    // member who actually approved the order. See server/orderAttribution.js,
    // which refuses any actorKind other than "user" for exactly this reason.
    // The isolation is enforced by src/test/steadfastAttributionIsolation.test.ts.
    if (patch.status !== undefined) {
      await recordStatusEvent(supabase, buildStatusEvent({
        orgId: order.org_id,
        orderId: order.id,
        orderTable: "orders",
        fromStatus: order.status,
        toStatus: patch.status,
        actorId: null,
        actorKind: "courier_webhook",
      }));
    }

    console.log(`[Steadfast Webhook] Order ${order.id} status updated: ${order.courier_status} → ${status}`);
    return res.status(200).json({ ok: true, updated: true });
```

- [ ] **Step 4: Log bot-created inbox orders as system**

`saveMetaInboxOrder` inserts into `social_inbox_orders` with `const { data, error } = await supabase...insert({...})` and ends with `return { order: data, duplicate: false };`.

Immediately **before** that return statement, add the event log. The AI bot has no authenticated user, so `created_by` stays null and the actor kind is `system`:

```js
  await recordStatusEvent(supabase, buildStatusEvent({
    orgId,
    orderId: data.id,
    orderTable: "social_inbox_orders",
    fromStatus: null,
    toStatus: data.status,
    actorId: null,
    actorKind: "system",
  }));

  return { order: data, duplicate: false };
```

Do not add `created_by` or `confirmed_by` here: no human created this order, and a fabricated actor would credit a staff member for the bot's work.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/test/steadfastAttributionIsolation.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Verify the server still boots**

Run: `node --check server/index.js`
Expected: no output, exit 0.

- [ ] **Step 7: Commit**

```bash
git add server/index.js src/test/steadfastAttributionIsolation.test.ts
git commit -m "feat: log courier transitions without touching staff attribution"
```

---

### Task 6: Staff roster and display name endpoints

`GET /api/team-members` is admin-only (`requireAdmin`, `server/index.js:1234`), so a telesales team member cannot load the dropdown they need. This task adds a member-safe roster plus the ability to edit names.

**Files:**
- Modify: `server/index.js` — add `GET /api/staff` and `PATCH /api/team-members/:id` in the Auth / Roles section near `server/index.js:1234`
- Test: `src/test/staffRosterRouteWiring.test.ts`

**Interfaces:**
- Consumes: `user_roles.display_name` from Task 1; `getUserOrg`, `getToken`, `getUser`, `requireAdmin`, `getAuthUserEmail` (all existing in `server/index.js`).
- Produces:
  - `GET /api/staff` → `{ staff: Array<{ user_id: string; display_name: string }> }`
  - `PATCH /api/team-members/:id` body `{ display_name: string | null }` → `{ success: true, member: { id, user_id, display_name } }`

- [ ] **Step 1: Write the failing test**

Create `src/test/staffRosterRouteWiring.test.ts`:

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

describe("GET /api/staff", () => {
  const staff = () =>
    routeSection('app.get("/api/staff"', 'app.get("/api/team-members"');

  it("is guarded by auth but not restricted to admins", () => {
    const section = staff();
    expect(section).toContain("getUser(getToken(req))");
    expect(section).toMatch(/status\(401\)/);
    expect(section).not.toContain("requireAdmin");
  });

  it("is scoped to the resolved workspace", () => {
    const section = staff();
    expect(section).toContain("getUserOrg(supabase, user.id)");
    expect(section).toContain('.eq("org_id", orgId)');
  });

  it("returns only user_id and display_name, never emails or roles", () => {
    const section = staff();
    expect(section).toContain("display_name");
    expect(section).not.toContain("getAuthUserEmail");
    expect(section).not.toMatch(/\brole\b/);
  });
});

describe("PATCH /api/team-members/:id", () => {
  const rename = () =>
    routeSection(
      'app.patch("/api/team-members/:id"',
      'app.delete("/api/team-members/:id"',
    );

  it("is admin-only and workspace-scoped", () => {
    const section = rename();
    expect(section).toContain("requireAdmin");
    expect(section).toContain('.eq("org_id", orgId)');
  });

  it("only ever writes display_name", () => {
    const section = rename();
    expect(section).toContain("display_name");
    expect(section).not.toContain("role:");
    expect(section).not.toContain("org_id:");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/staffRosterRouteWiring.test.ts`
Expected: FAIL — neither route exists.

- [ ] **Step 3: Add the roster endpoint**

In `server/index.js`, immediately **above** `app.get("/api/team-members"`, add:

```js
// Member-safe staff roster for the order form's assignee dropdown.
// /api/team-members is admin-only, so a telesales member cannot use it.
// This returns only what a dropdown needs: no emails, no roles.
app.get("/api/staff", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    const { data, error } = await supabase
      .from("user_roles")
      .select("user_id, display_name")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });
    if (error) throw error;

    return res.json({
      staff: (data || []).map((row) => ({
        user_id: row.user_id,
        display_name: row.display_name || "Unnamed member",
      })),
    });
  } catch (err) {
    return sendError(res, err);
  }
});
```

- [ ] **Step 4: Add the rename endpoint**

Immediately **above** `app.delete("/api/team-members/:id"`, add:

```js
app.patch("/api/team-members/:id", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { supabase, orgId } = admin;

    const raw = req.body?.display_name;
    if (raw !== null && typeof raw !== "string") {
      return res.status(400).json({ error: "display_name must be text or null" });
    }
    const displayName = raw === null ? null : raw.trim().slice(0, 80) || null;

    const { data, error } = await supabase
      .from("user_roles")
      .update({ display_name: displayName })
      .eq("id", req.params.id)
      .eq("org_id", orgId)
      .select("id, user_id, display_name")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Team member not found" });

    return res.json({ success: true, member: data });
  } catch (err) {
    return sendError(res, err);
  }
});
```

- [ ] **Step 5: Include display_name in the existing roster**

In `GET /api/team-members`, change the select from:

```js
      .select("id, user_id, role, org_id, created_at")
```

to:

```js
      .select("id, user_id, role, org_id, display_name, created_at")
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/test/staffRosterRouteWiring.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 7: Verify the server still boots**

Run: `node --check server/index.js`
Expected: no output, exit 0.

- [ ] **Step 8: Commit**

```bash
git add server/index.js src/test/staffRosterRouteWiring.test.ts
git commit -m "feat: add member-safe staff roster and display name endpoints"
```

---

### Task 7: Staff selector on the New Order form

**Files:**
- Create: `src/components/order-editor/StaffSelect.tsx`
- Modify: `src/pages/NewOrder.tsx:74` (state), `:207` (submit payload), `:258` (layout)
- Test: `src/test/staffSelect.test.tsx`

**Interfaces:**
- Consumes: `GET /api/staff` from Task 6; `assigned_to` acceptance from Task 4.
- Produces: `StaffSelect` component with props `{ value: string | null; onChange: (userId: string) => void; disabled?: boolean; compact?: boolean }`.

`StaffSelect` mirrors `src/components/order-editor/OrderSourceSelect.tsx` exactly — same `Select`/`SelectItem` primitives, same `triggerClassName` sizing — so the two controls sit side by side without visual drift.

- [ ] **Step 1: Write the failing test**

Create `src/test/staffSelect.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { StaffSelect } from "@/components/order-editor/StaffSelect";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api";

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("StaffSelect", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("lists staff returned by the roster endpoint", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        staff: [
          { user_id: "u1", display_name: "Rakib" },
          { user_id: "u2", display_name: "Nadia" },
        ],
      }),
    } as Response);

    renderWithQuery(<StaffSelect value="u1" onChange={() => {}} />);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/api/staff");
    });
    expect(await screen.findByText("Rakib")).toBeInTheDocument();
  });

  it("stays usable when the roster fails to load", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("network"));

    renderWithQuery(<StaffSelect value={null} onChange={() => {}} />);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalled();
    });
    expect(screen.getByLabelText("Telesales staff")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/staffSelect.test.tsx`
Expected: FAIL — cannot resolve `@/components/order-editor/StaffSelect`.

- [ ] **Step 3: Write the component**

Create `src/components/order-editor/StaffSelect.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Select, SelectItem } from "@/components/base/select/select";
import { apiFetch } from "@/lib/api";

type StaffMember = {
  user_id: string;
  display_name: string;
};

type StaffSelectProps = {
  value: string | null;
  onChange: (userId: string) => void;
  disabled?: boolean;
  compact?: boolean;
};

export function StaffSelect({ value, onChange, disabled = false, compact = false }: StaffSelectProps) {
  const { data: staff = [] } = useQuery<StaffMember[]>({
    queryKey: ["/api/staff"],
    queryFn: async () => {
      const res = await apiFetch("/api/staff");
      const body = await res.json();
      return body.staff ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <Select
      aria-label="Telesales staff"
      selectedKey={value ?? undefined}
      onSelectionChange={(key) => onChange(String(key))}
      isDisabled={disabled}
      size={compact ? "sm" : "md"}
      triggerClassName={compact ? "h-8 min-w-0 text-[12px]" : "h-10 min-w-0 text-[13px]"}
    >
      {staff.map((member) => (
        <SelectItem key={member.user_id} id={member.user_id} textValue={member.display_name}>
          {member.display_name}
        </SelectItem>
      ))}
    </Select>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/staffSelect.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Wire it into the New Order form**

In `src/pages/NewOrder.tsx`:

Add the import next to the existing `OrderSourceSelect` import:

```tsx
import { StaffSelect } from "@/components/order-editor/StaffSelect";
```

Add state next to the existing `source` state (line 74), defaulting to the logged-in user. The page already has access to auth via `useAuth()`; if it does not import it yet, add `import { useAuth } from "@/hooks/useAuth";` and `const { user } = useAuth();`:

```tsx
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
```

and immediately after, keep it defaulted to the current user until the operator changes it:

```tsx
  useEffect(() => {
    if (!assignedTo && user?.id) setAssignedTo(user.id);
  }, [assignedTo, user?.id]);
```

Add `assigned_to: assignedTo` to the JSON body next to `source` (line 207):

```tsx
           source,
           assigned_to: assignedTo,
```

Render the control beside the order source field (line 258), matching its label styling exactly:

```tsx
<label className="block text-[10px] font-medium uppercase tracking-[0.16em] text-black">Telesales staff<div className="mt-2"><StaffSelect value={assignedTo} onChange={setAssignedTo} disabled={creating} /></div></label>
```

- [ ] **Step 6: Verify the build and full suite**

Run: `npm run build && npx vitest run`
Expected: build succeeds; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/order-editor/StaffSelect.tsx src/pages/NewOrder.tsx src/test/staffSelect.test.tsx
git commit -m "feat: add telesales staff selector to the new order form"
```

---

### Task 8: Editable staff names in Team Management

**Files:**
- Modify: `src/components/TeamManagement.tsx`
- Test: `src/test/teamManagementDisplayName.test.tsx`

**Interfaces:**
- Consumes: `PATCH /api/team-members/:id` from Task 6; `display_name` on the `GET /api/team-members` response.
- Produces: nothing downstream.

- [ ] **Step 1: Write the failing test**

Create `src/test/teamManagementDisplayName.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "admin-1", email: "admin@example.com" } }),
}));
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ isAdmin: true }),
}));

import { apiFetch } from "@/lib/api";
import { TeamManagement } from "@/components/TeamManagement";

describe("TeamManagement display names", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("shows the email as a fallback when a member has no name", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        members: [
          { id: "r1", user_id: "u1", role: "team_member", email: "rakib@example.com", display_name: null },
        ],
      }),
    } as Response);

    render(<TeamManagement />);

    expect(await screen.findByDisplayValue("")).toBeInTheDocument();
    expect(screen.getByText("rakib@example.com")).toBeInTheDocument();
  });

  it("saves a new name to the rename endpoint", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        members: [
          { id: "r1", user_id: "u1", role: "team_member", email: "rakib@example.com", display_name: null },
        ],
      }),
    } as Response);

    render(<TeamManagement />);
    const input = await screen.findByLabelText("Name for rakib@example.com");

    await userEvent.type(input, "Rakib");
    await userEvent.tab();

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/team-members/r1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ display_name: "Rakib" }),
        }),
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/teamManagementDisplayName.test.tsx`
Expected: FAIL — there is no name input in the component.

- [ ] **Step 3: Add display_name to the component**

In `src/components/TeamManagement.tsx`, extend the `TeamMember` interface:

```tsx
interface TeamMember {
  id: string;
  user_id: string;
  role: "admin" | "team_member";
  email?: string;
  org_id?: string;
  display_name?: string | null;
  created_at?: string;
}
```

Add a save handler alongside the existing `handleCreateMember`:

```tsx
  const handleRename = async (member: TeamMember, name: string) => {
    const next = name.trim();
    if (next === (member.display_name || "")) return;
    try {
      const res = await apiFetch(`/api/team-members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: next || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to save name");
      setMembers((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, display_name: next || null } : m)),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save name");
    }
  };
```

In the member list row, add a name input that saves on blur. Place it above the existing email display and keep the email visible as the fallback identifier:

```tsx
<input
  aria-label={`Name for ${member.email}`}
  defaultValue={member.display_name || ""}
  placeholder="Add name"
  onBlur={(e) => handleRename(member, e.target.value)}
  className="w-full bg-transparent text-sm font-medium text-black outline-none placeholder:text-black/30"
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/teamManagementDisplayName.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Run the full verification**

Run: `npm run lint && npm run build && npx vitest run`
Expected: lint clean, build succeeds, all tests pass. Paste the real output — do not claim success without it.

- [ ] **Step 6: Commit**

```bash
git add src/components/TeamManagement.tsx src/test/teamManagementDisplayName.test.tsx
git commit -m "feat: add editable staff display names to team management"
```

---

## Phase 1 completion checklist

Do not report this phase complete until every line below has real output backing it.

- [ ] `npx vitest run` — full suite green, including the pre-existing tests
- [ ] `npm run lint` — clean
- [ ] `npm run build` — succeeds, no type errors
- [ ] `node --check server/index.js` — exit 0
- [ ] `npm run verify:supabase-baseline` — exit 0
- [ ] Manual check: create an order through the New Order form, confirm `created_by`, `assigned_to`, `confirmed_by`, and `confirmed_at` are all populated, and that one `order_status_events` row exists with `actor_kind = 'user'`
- [ ] Manual check: a `team_member` login can open the New Order form and see the staff dropdown populated

## What this phase deliberately does not do

- No report page. That is Phase 2.
- No backfill of historical orders.
- No assignment of storefront or Shopify orders — decided 2026-09-18, they stay unassigned permanently.
- No `unit` field on products. All weight reporting is in kg.
