# Extracted Order Numbering & Ordering Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the long `MAN-<timestamp>` extracted order numbers with short, per-org `#M-<n>` numbers, and make the orders list sort by recency instead of alphabetically by order number.

**Architecture:** Keep all changes inside `server/index.js` (the existing single-file backend). Add a race-safe per-org sequence helper backed by `app_settings`, update the order creation endpoint, fix the order list query sort, and add an idempotent startup migration to backfill existing `MAN-<timestamp>` rows.

**Tech Stack:** Node.js 20 + Express ESM, Supabase (`@supabase/supabase-js`), Vitest for source-code tests.

---

## File Map

| File | Responsibility |
|---|---|
| `server/index.js` | The only file that changes. Houses: new `getNextManualOrderSeq()` helper, order number generation in `POST /api/orders`, sort fix in `GET /api/orders`, and `migrateManualOrderNumbers()` startup migration. |
| `src/test/manualOrderNumbering.test.ts` | Source-code assertion tests verifying the changes exist in the expected locations and use the expected patterns. |

---

### Task 1: Add `getNextManualOrderSeq()` helper

**Files:**
- Modify: `server/index.js:878` (insert after `saveOrgSettings`)

- [ ] **Step 1: Write the failing test**

Create `src/test/manualOrderNumbering.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("manual order numbering", () => {
  const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

  it("defines a race-safe per-org sequence helper", () => {
    expect(source).toContain("async function getNextManualOrderSeq(orgId)");
    expect(source).toContain('orgSettingKey(orgId, "manual_order_seq")');
    expect(source).toContain('ignoreDuplicates: true');
    expect(source).toContain('.eq("value", currentStr)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/manualOrderNumbering.test.ts`
Expected: FAIL — `getNextManualOrderSeq` not found.

- [ ] **Step 3: Insert the helper in `server/index.js:878`**

Insert this block immediately after the closing brace of `saveOrgSettings` (after line 877) and before `async function getProductStockMap(orgId)` at line 879:

```js
async function getNextManualOrderSeq(orgId) {
  const supabase = getServiceSupabase();
  const key = orgSettingKey(orgId, "manual_order_seq");
  const now = new Date().toISOString();

  // Ensure a counter row exists. ignoreDuplicates protects progress if another
  // process already initialized or incremented it.
  await supabase
    .from("app_settings")
    .upsert({ key, value: "0", updated_at: now }, { onConflict: "key", ignoreDuplicates: true });

  for (let attempt = 0; attempt < 8; attempt++) {
    const { data: existing } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    const currentStr = existing?.value ?? "0";
    const current = parseInt(currentStr, 10) || 0;
    const next = current + 1;

    const { data: updated, error } = await supabase
      .from("app_settings")
      .update({ value: String(next), updated_at: now })
      .eq("key", key)
      .eq("value", currentStr)
      .select("value");

    if (error) throw error;
    if (updated && updated.length > 0) return next;
  }

  throw new Error("Failed to allocate manual order sequence after retries");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/manualOrderNumbering.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/index.js src/test/manualOrderNumbering.test.ts
git commit -m "feat: add per-org manual order sequence helper

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Use `#M-<seq>` in `POST /api/orders`

**Files:**
- Modify: `server/index.js:3590`

- [ ] **Step 1: Write the failing test**

Append to the existing test in `src/test/manualOrderNumbering.test.ts`:

```ts
  it("creates manual orders with #M-<seq> numbers", () => {
    const createRoute = source.slice(
      source.indexOf('app.post("/api/orders"'),
      source.indexOf('app.patch("/api/orders/:id"')
    );
    expect(createRoute).toContain("await getNextManualOrderSeq(orgId)");
    expect(createRoute).toContain('#M-${await getNextManualOrderSeq(orgId)}');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/manualOrderNumbering.test.ts`
Expected: FAIL — new assertions not found in source.

- [ ] **Step 3: Replace `MAN-<Date.now()>` generation**

In `server/index.js:3590`, change:

```js
if (!row.order_number) row.order_number = `MAN-${Date.now()}`;
```

to:

```js
if (!row.order_number) row.order_number = `#M-${await getNextManualOrderSeq(orgId)}`;
```

Leave the negative `shopify_order_id` generation above it unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/manualOrderNumbering.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/index.js src/test/manualOrderNumbering.test.ts
git commit -m "feat: generate short #M-<seq> numbers for extracted orders

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Fix order list sorting to `created_at` desc

**Files:**
- Modify: `server/index.js:3525`

- [ ] **Step 1: Write the failing test**

Append to the existing test in `src/test/manualOrderNumbering.test.ts`:

```ts
  it("sorts orders by recency (created_at desc) instead of order_number", () => {
    const listRoute = source.slice(
      source.indexOf('app.get("/api/orders"'),
      source.indexOf('app.get("/api/orders/recent-notifications"')
    );
    expect(listRoute).toContain('.order("created_at", { ascending: false })');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/manualOrderNumbering.test.ts`
Expected: FAIL — `created_at` sort not found.

- [ ] **Step 3: Change the sort in `GET /api/orders`**

In `server/index.js:3525`, change:

```js
.order("order_number", { ascending: false });
```

to:

```js
.order("created_at", { ascending: false });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/manualOrderNumbering.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/index.js src/test/manualOrderNumbering.test.ts
git commit -m "fix: sort orders by created_at desc to interleave extracted and Shopify orders

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Add `migrateManualOrderNumbers()` startup migration

**Files:**
- Modify: `server/index.js:7517` (insert before `migrateInboxOrdersTable`)

- [ ] **Step 1: Write the failing test**

Append to the existing test in `src/test/manualOrderNumbering.test.ts`:

```ts
  it("defines a migration that renumbers legacy MAN-<timestamp> orders", () => {
    expect(source).toContain("async function migrateManualOrderNumbers()");
    expect(source).toContain('.like("order_number", "MAN-%")');
    expect(source).toContain('order_number: `#M-${seq}`');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/manualOrderNumbering.test.ts`
Expected: FAIL — migration function not found.

- [ ] **Step 3: Insert the migration function**

Insert the following block immediately before `async function migrateInboxOrdersTable()` at `server/index.js:7517`:

```js
async function migrateManualOrderNumbers() {
  const supabase = getServiceSupabase();

  const { data: legacy, error } = await supabase
    .from("orders")
    .select("id, org_id, created_at, order_number")
    .like("order_number", "MAN-%");

  if (error) {
    console.warn("[Migrate Manual Order Numbers] fetch error:", error.message);
    return;
  }
  if (!legacy || legacy.length === 0) {
    console.log("[Migrate Manual Order Numbers] no legacy rows found");
    return;
  }

  const byOrg = new Map();
  for (const row of legacy) {
    if (!byOrg.has(row.org_id)) byOrg.set(row.org_id, []);
    byOrg.get(row.org_id).push(row);
  }

  for (const [orgId, rows] of byOrg) {
    rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    let maxSeq = 0;
    for (let i = 0; i < rows.length; i++) {
      const seq = i + 1;
      maxSeq = seq;
      const { error: updErr } = await supabase
        .from("orders")
        .update({ order_number: `#M-${seq}` })
        .eq("id", rows[i].id)
        .eq("org_id", orgId);
      if (updErr) {
        console.warn(`[Migrate Manual Order Numbers] update error for order ${rows[i].id}:`, updErr.message);
      }
    }

    // Seed the counter so new extractions continue after the migrated set.
    const key = orgSettingKey(orgId, "manual_order_seq");
    const { data: existing } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    const existingVal = existing?.value ? parseInt(existing.value, 10) || 0 : 0;
    if (maxSeq > existingVal) {
      await saveSettings({ [key]: String(maxSeq) });
    }
  }

  console.log(`[Migrate Manual Order Numbers] renumbered ${legacy.length} order(s) across ${byOrg.size} org(s).`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/test/manualOrderNumbering.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/index.js src/test/manualOrderNumbering.test.ts
git commit -m "feat: add migration to renumber legacy MAN-<timestamp> orders

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Wire the migration into startup

**Files:**
- Modify: `server/index.js:7857-7859` (awaited listener path) and `server/index.js:7870-7872` (serverless cold-start path)

- [ ] **Step 1: Write the failing test**

Append to the existing test in `src/test/manualOrderNumbering.test.ts`:

```ts
  it("registers the migration in both startup paths", () => {
    const listenerStart = source.slice(
      source.indexOf("Server running on port"),
      source.indexOf("startServer().catch")
    );
    expect(listenerStart).toContain("await migrateManualOrderNumbers()");

    const serverlessStart = source.slice(
      source.indexOf("// Serverless cold-start"),
      source.indexOf("export default app")
    );
    expect(serverlessStart).toContain("migrateManualOrderNumbers()");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/manualOrderNumbering.test.ts`
Expected: FAIL — migration not registered.

- [ ] **Step 3: Await migration in the listener path**

In `server/index.js:7857-7859`, add `await migrateManualOrderNumbers();` between `migrateInboxOrdersTable()` and `bootstrapAiProductContext()`:

```js
        await ensureAppSettingsTable();
        await migrateInboxOrdersTable();
        await migrateMultiTenancy();
        await migrateManualOrderNumbers();
        await bootstrapAiProductContext();
```

- [ ] **Step 4: Fire-and-forget migration in the serverless path**

In `server/index.js:7870-7872`, add `migrateManualOrderNumbers().catch(() => {});` to match the existing migrations:

```js
  ensureAppSettingsTable().catch(() => {});
  migrateMultiTenancy().catch(() => {});
  migrateInboxOrdersTable().catch(() => {});
  migrateManualOrderNumbers().catch(() => {});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/test/manualOrderNumbering.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/index.js src/test/manualOrderNumbering.test.ts
git commit -m "chore: register manual order migration on startup

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Verify the complete change end-to-end

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: All existing tests plus the new `manualOrderNumbering.test.ts` pass.

- [ ] **Step 2: Run the linter**

Run: `npm run lint`
Expected: No errors introduced in `server/index.js` or `src/test/manualOrderNumbering.test.ts`.

- [ ] **Step 3: Build the frontend**

Run: `npm run build`
Expected: Build succeeds with no new TypeScript errors.

- [ ] **Step 4: Start the dev server and smoke-test**

Run:
```bash
npm run dev
```

Then in another terminal:
1. Create a manual order via the Extraction page (`/extract`) and confirm the created order has a number like `#M-1` (or the next sequence number for the current org).
2. Sync or create some Shopify orders if possible, then check the orders list (`/`) and confirm:
   - Extracted orders are not all at the top.
   - The list is ordered newest-first by creation time, interleaving extracted and Shopify orders.
   - No `MAN-<timestamp>` values remain (unless the migration was skipped or run on a serverless path without prior DB rows; in that case confirm it runs and renumbers on the next awaited listener start).

- [ ] **Step 5: Commit if smoke-test required any fixes**

If the smoke-test surfaced no issues, nothing to commit. If there were fixes, commit them with `fix:` messages and rerun the test suite.

- [ ] **Step 6: Final review with `/review` skill**

Before shipping, invoke the `review` skill to check for auth gaps, org_id isolation, SQL safety, and hard-rule compliance.

---

## Self-Review Checklist

- **Spec coverage:**
  - `#M-<n>` numbering → Task 1 + Task 2.
  - `created_at` desc ordering → Task 3.
  - Legacy `MAN-<timestamp>` migration → Task 4 + Task 5.
  - Multi-tenancy (org-scoped counter and migration) → Tasks 1 and 4 use `orgSettingKey(orgId, ...)`.
  - No frontend/schema changes → none in the plan.
- **Placeholder scan:** No TBD, TODO, or "implement later" found. Every step contains exact code and commands.
- **Type consistency:** `getNextManualOrderSeq` returns an integer; `order_number` is interpolated as `#M-${...}`. Counter stored as `String`. Values round-trip through `parseInt(..., 10)`. `created_at` sort matches existing `recent-notifications` pattern.
- **Auth/org isolation:** Order creation and order listing already resolve `orgId` via `getUserOrg`; the migration groups updates by `org_id` and seeds counters by `orgId`. No new unscoped queries.
- **Hard rules:** No new server files created; all DB access stays in `server/index.js`. New route auth guards are unchanged (existing routes already guard). Supabase schema unchanged (no `source` column, no new tables).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-18-extracted-order-numbering-implementation-plan.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — I execute tasks in this session using `executing-plans`, batch execution with checkpoints.

Which approach would you like?
