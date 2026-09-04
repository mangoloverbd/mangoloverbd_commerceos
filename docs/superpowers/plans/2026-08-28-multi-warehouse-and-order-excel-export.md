# Multi-Warehouse Routing and Order Excel Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the merchant create unlimited warehouses, assign products to them, have incoming orders route to the right warehouse automatically, and export selected orders to `.xlsx`.

**Architecture:** A warehouse is a routing label, not an inventory location — stock stays one number per product/variant. Pure decision logic lives in a new `server/warehouseRouting.js` module (following the existing `server/shippingCalculation.js` pattern) so it is unit-testable without booting Express; database access stays in `server/index.js`. The warehouse is resolved once at order creation and stored on the order row as a snapshot. The Excel export splits into a pure row builder in `src/lib/` (unit-tested, following `src/lib/customerExport.ts`) and a thin download wrapper.

**Tech Stack:** Node 20 ESM Express, Supabase Postgres via `@supabase/supabase-js`, React 18 + Vite + TypeScript, TanStack Query v5, TanStack Table, Tailwind, shadcn/ui, Framer Motion, Vitest, `exceljs`.

**Spec:** `docs/superpowers/specs/2026-08-28-multi-warehouse-and-order-excel-export-design.md`

## Global Constraints

- Single-tenant deployment. Every server query that touches user data filters by the `org_id` resolved from `user_roles`; never accept an org or tenant id from the client.
- Every new route starts with `const { user } = await getUser(getToken(req)); if (!user) return res.status(401).json({ error: "Unauthorized" });` then `const { orgId } = await getUserOrg(supabase, user.id);`.
- **No runtime DDL.** `src/test/noRuntimeDatabaseMigrations.test.ts` fails the build if `server/index.js` gains schema migrations or Management API calls. All schema changes go in `supabase/migrations/`.
- Frontend calls the API only through `apiFetch()` from `src/lib/api.ts`.
- New routes go in `src/App.tsx`; React Router v6 only, never `wouter`.
- Page icons use Phosphor with `weight="light"`. The sidebar is the exception: its icons are inline two-tone SVGs using `style={{ fill: 'var(--fillg)' }}` with a `0.4`-opacity secondary path.
- Currency renders as `৳`. Weight renders in kg with up to 3 decimals.
- TypeScript is strict. No `any` without a comment explaining why.
- New dependency pinned exactly: `"exceljs": "4.4.0"`.
- Stock is never split per warehouse. Do not add per-warehouse stock columns.
- Tests live in `src/test/`, run with `npx vitest run <file>`.
- Commit after every task with an imperative `feat:` / `fix:` / `chore:` message.

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `supabase/migrations/20260829000000_warehouses.sql` | `warehouses` table, warehouse/weight columns, RLS |
| `server/warehouseRouting.js` | Pure warehouse-resolution and weight-calculation functions |
| `server/variantMatching.js` | Pure variant-label matching and the "needs a variant" predicate |
| `src/lib/orderExcelExport.ts` | Pure `.xlsx` row builder + download wrapper |
| `src/hooks/useWarehouses.ts` | Shared warehouse list query |
| `src/pages/Warehouses.tsx` | Warehouse list page |
| `src/pages/WarehouseDetail.tsx` | One warehouse: details, figures, products, orders |
| `src/components/WarehouseDialog.tsx` | Shared create/edit dialog |
| `src/test/warehouseSchema.test.ts` | Asserts the migration declares the table and columns |
| `src/test/warehouseRouting.test.ts` | Unit tests for the resolver |
| `src/test/warehouseApiRoutes.test.ts` | CRUD route registration and guard assertions |
| `src/test/warehouseDetailApi.test.ts` | Detail + bulk-assign route assertions |
| `src/test/orderRoutingWiring.test.ts` | Both order paths call the resolver and store its result |
| `src/test/warehouseOverrideApi.test.ts` | Manual override, `warehouse_auto`, orders filter |
| `src/test/productWeightApi.test.ts` | Weight parsing on product and variant routes |
| `src/test/productWeightForm.test.ts` | Hook, shared types, and both product forms |
| `src/test/productsWarehouseColumn.test.ts` | Products page column and bulk assign |
| `src/test/orderExcelExport.test.ts` | Unit tests for the row builder |
| `src/test/ordersTableWarehouse.test.ts` | Orders table column, override, Excel button |
| `src/test/warehousePageRouting.test.ts` | Route + sidebar + list page + dialog wiring |
| `src/test/warehouseDetailPage.test.ts` | Detail page data layer and embedded orders table |
| `src/test/dashboardWarehouseFilter.test.ts` | Dashboard warehouse filter |
| `src/test/inboxVariantCapture.test.ts` | Variant matching, capture, UI, and dispatch guard |

**Modified:** `scripts/verify-supabase-baseline.mjs`, `server/index.js`, `src/App.tsx`, `src/components/AppSidebar.tsx`, `src/components/OrdersTable.tsx`, `src/pages/Dashboard.tsx`, `src/pages/Products.tsx`, `src/pages/products/shared.tsx`, `src/pages/ProductNew.tsx`, `src/pages/ProductEdit.tsx`, `src/pages/InboxOrders.tsx`, `package.json`.

**Task order:** 1 schema · 2 pure routing · 3 warehouse CRUD API · 4 detail + bulk assign API ·
5 wire routing into both order paths · 6 manual override + orders filter · 7 weight on product and
variant APIs · 8 shared hook + product form fields · 9 Products page column and bulk assign ·
10 pure Excel builder · 11 OrdersTable column, override, Excel button · 12 Warehouses list page,
dialog, sidebar, routes · 13 Warehouse detail page with embedded orders table · 14 Dashboard
warehouse filter · 15 inbox variant capture + dispatch guard.

---

### Task 1: Schema migration

The repo has exactly one migration, `20260828000000_canonical_greenfield_baseline.sql`, and
`scripts/verify-supabase-baseline.mjs` hardcodes that path. We add a **second** migration rather
than editing the baseline, because the baseline may already have been applied to the live
project, and we make the verifier apply every migration in order so it stays meaningful.

**Files:**
- Create: `supabase/migrations/20260829000000_warehouses.sql`
- Create: `src/test/warehouseSchema.test.ts`
- Modify: `scripts/verify-supabase-baseline.mjs:12-16`

**Interfaces:**
- Consumes: nothing.
- Produces: table `public.warehouses (id, org_id, name, address, contact_person, phone, is_default, deleted_at, created_at, updated_at)`; columns `products.warehouse_id`, `products.weight_kg`, `product_variants.weight_kg`, `orders.warehouse_id`, `orders.warehouse_auto`, `orders.weight_kg`, `social_inbox_orders.warehouse_id`, `social_inbox_orders.warehouse_auto`, `social_inbox_orders.weight_kg`.

- [ ] **Step 1: Write the failing test**

Create `src/test/warehouseSchema.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260829000000_warehouses.sql",
);

describe("warehouse migration", () => {
  it("creates the warehouses table with RLS enabled", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toMatch(/create table public\.warehouses\b/i);
    expect(sql).toMatch(/alter table public\.warehouses enable row level security/i);
  });

  it("enforces a single default warehouse per org", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toMatch(/unique index warehouses_org_default_idx/i);
    expect(sql).toMatch(/where is_default and deleted_at is null/i);
  });

  it("adds warehouse and weight columns to commerce tables", async () => {
    const sql = await readFile(migrationPath, "utf8");
    for (const column of [
      "alter table public.products add column warehouse_id",
      "alter table public.products add column weight_kg",
      "alter table public.product_variants add column weight_kg",
      "alter table public.orders add column warehouse_id",
      "alter table public.orders add column warehouse_auto",
      "alter table public.orders add column weight_kg",
      "alter table public.social_inbox_orders add column warehouse_id",
      "alter table public.social_inbox_orders add column warehouse_auto",
      "alter table public.social_inbox_orders add column weight_kg",
    ]) {
      expect(sql.toLowerCase()).toContain(column);
    }
  });

  it("seeds the Mango Lover default warehouse", async () => {
    const sql = await readFile(migrationPath, "utf8");
    expect(sql).toContain("Mango Lover");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/warehouseSchema.test.ts`
Expected: FAIL — `ENOENT: no such file or directory ... 20260829000000_warehouses.sql`

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260829000000_warehouses.sql`:

```sql
-- Warehouses are routing labels, not inventory locations. Stock remains one
-- number per product/variant; see the 2026-08-28 design spec.

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  name text not null,
  address text,
  contact_person text,
  phone text,
  is_default boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index warehouses_org_name_idx
on public.warehouses (org_id, name)
where deleted_at is null;

create unique index warehouses_org_default_idx
on public.warehouses (org_id)
where is_default and deleted_at is null;

create index warehouses_org_listing_idx
on public.warehouses (org_id, deleted_at, created_at desc);

create trigger update_warehouses_updated_at
before update on public.warehouses
for each row execute function public.update_updated_at_column();

alter table public.warehouses enable row level security;

alter table public.products add column warehouse_id uuid references public.warehouses(id);
alter table public.products add column weight_kg numeric(10, 3) check (weight_kg is null or weight_kg >= 0);
alter table public.product_variants add column weight_kg numeric(10, 3) check (weight_kg is null or weight_kg >= 0);

alter table public.orders add column warehouse_id uuid references public.warehouses(id);
alter table public.orders add column warehouse_auto boolean not null default true;
alter table public.orders add column weight_kg numeric(10, 3) check (weight_kg is null or weight_kg >= 0);

alter table public.social_inbox_orders add column warehouse_id uuid references public.warehouses(id);
alter table public.social_inbox_orders add column warehouse_auto boolean not null default true;
alter table public.social_inbox_orders add column weight_kg numeric(10, 3) check (weight_kg is null or weight_kg >= 0);

create index products_org_warehouse_idx on public.products (org_id, warehouse_id);
create index orders_org_warehouse_created_idx on public.orders (org_id, warehouse_id, created_at desc);
create index social_inbox_orders_org_warehouse_idx on public.social_inbox_orders (org_id, warehouse_id, created_at desc);

-- Seed the single default warehouse for the existing workspace.
insert into public.warehouses (org_id, name, is_default)
select distinct org_id, 'Mango Lover', true
from public.user_roles
where org_id is not null
on conflict do nothing;

revoke all on public.warehouses from anon, authenticated;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/warehouseSchema.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Make the baseline verifier apply every migration**

In `scripts/verify-supabase-baseline.mjs`, replace the hardcoded single-file constant (lines
12–16) so the script applies all migrations in filename order. Add `readdirSync` to the existing
`node:fs` import, then:

```js
const migrationsDir = join(root, "supabase/migrations");
const migrationPaths = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => join(migrationsDir, name));
```

Then update every later use of `migrationPath` to loop over `migrationPaths` in order, applying
each with the same `psql` invocation the script already uses.

- [ ] **Step 6: Verify the migration actually applies**

Run: `npm run verify:supabase-baseline`
Expected: PASS. If PostgreSQL binaries are missing locally the script exits with a clear
"Install PostgreSQL or set PG_BINDIR" message — in that case set `PG_BINDIR` and re-run rather
than skipping this step, because a syntax error here is invisible to the Vitest test.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260829000000_warehouses.sql src/test/warehouseSchema.test.ts scripts/verify-supabase-baseline.mjs
git commit -m "feat: add warehouses table and warehouse/weight columns"
```

---

### Task 2: Pure routing and weight logic

**Files:**
- Create: `server/warehouseRouting.js`
- Create: `src/test/warehouseRouting.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces two pure functions imported by `server/index.js` in Task 5:
  - `resolveWarehouseId({ items, productsById, productsByName, defaultWarehouseId }) -> string | null`
  - `computeOrderWeightKg({ items, variantsById, productsById }) -> number | null`

  `items` is an array of `{ productId?: string, variantId?: string, product?: string, quantity?: number }`.
  `productsById` is `Record<string, { id, name, warehouse_id, weight_kg }>`.
  `productsByName` is `Record<string, sameShape>` keyed by lowercased trimmed name.
  `variantsById` is `Record<string, { id, product_id, weight_kg }>`.

- [ ] **Step 1: Write the failing tests**

Create `src/test/warehouseRouting.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeOrderWeightKg, resolveWarehouseId } from "../../server/warehouseRouting.js";

const MANGO_WH = "11111111-1111-1111-1111-111111111111";
const MAIN_WH = "22222222-2222-2222-2222-222222222222";

const PRODUCTS = {
  "p-tshirt": { id: "p-tshirt", name: "Cotton T-Shirt", warehouse_id: MAIN_WH, weight_kg: 0.3 },
  "p-mango": { id: "p-mango", name: "Kacha Aam", warehouse_id: MANGO_WH, weight_kg: null },
  "p-none": { id: "p-none", name: "Gift Box", warehouse_id: null, weight_kg: 1 },
};
const BY_NAME = {
  "cotton t-shirt": PRODUCTS["p-tshirt"],
  "kacha aam": PRODUCTS["p-mango"],
  "gift box": PRODUCTS["p-none"],
};
const VARIANTS = {
  "v-1kg": { id: "v-1kg", product_id: "p-mango", weight_kg: 1 },
  "v-5kg": { id: "v-5kg", product_id: "p-mango", weight_kg: 5 },
  "v-noweight": { id: "v-noweight", product_id: "p-mango", weight_kg: null },
};

const args = (items) => ({
  items,
  productsById: PRODUCTS,
  productsByName: BY_NAME,
  defaultWarehouseId: MAIN_WH,
});

describe("resolveWarehouseId", () => {
  it("uses the product id when the item carries one", () => {
    expect(resolveWarehouseId(args([{ productId: "p-mango", quantity: 1 }]))).toBe(MANGO_WH);
  });

  it("falls back to a case-insensitive name match", () => {
    expect(resolveWarehouseId(args([{ product: "  KACHA AAM ", quantity: 2 }]))).toBe(MANGO_WH);
  });

  it("uses the default warehouse when nothing matches", () => {
    expect(resolveWarehouseId(args([{ product: "Unknown Thing" }]))).toBe(MAIN_WH);
  });

  it("uses the default warehouse when the product has no warehouse assigned", () => {
    expect(resolveWarehouseId(args([{ productId: "p-none" }]))).toBe(MAIN_WH);
  });

  it("takes the first resolvable product when an order spans two warehouses", () => {
    expect(
      resolveWarehouseId(args([{ productId: "p-mango" }, { productId: "p-tshirt" }])),
    ).toBe(MANGO_WH);
  });

  it("skips unresolvable items before falling back", () => {
    expect(
      resolveWarehouseId(args([{ product: "Mystery" }, { productId: "p-mango" }])),
    ).toBe(MANGO_WH);
  });

  it("returns null when there is no default warehouse", () => {
    expect(
      resolveWarehouseId({ ...args([{ product: "Mystery" }]), defaultWarehouseId: null }),
    ).toBeNull();
  });
});
```

Append the weight tests to the same file:

```ts
const weightArgs = (items) => ({ items, variantsById: VARIANTS, productsById: PRODUCTS });

describe("computeOrderWeightKg", () => {
  it("prefers the variant weight over the product weight", () => {
    expect(computeOrderWeightKg(weightArgs([{ variantId: "v-5kg", productId: "p-mango", quantity: 1 }]))).toBe(5);
  });

  it("multiplies by quantity", () => {
    expect(computeOrderWeightKg(weightArgs([{ variantId: "v-1kg", quantity: 3 }]))).toBe(3);
  });

  it("sums across items", () => {
    expect(
      computeOrderWeightKg(weightArgs([
        { variantId: "v-1kg", quantity: 2 },
        { productId: "p-tshirt", quantity: 1 },
      ])),
    ).toBe(2.3);
  });

  it("falls back to the product weight when the variant has none", () => {
    expect(computeOrderWeightKg(weightArgs([{ variantId: "v-noweight", productId: "p-mango" }]))).toBeNull();
  });

  it("treats a missing quantity as one", () => {
    expect(computeOrderWeightKg(weightArgs([{ productId: "p-tshirt" }]))).toBe(0.3);
  });

  it("returns null when any single item has no known weight", () => {
    expect(
      computeOrderWeightKg(weightArgs([
        { productId: "p-tshirt", quantity: 1 },
        { productId: "p-mango", quantity: 1 },
      ])),
    ).toBeNull();
  });

  it("returns null for an empty item list", () => {
    expect(computeOrderWeightKg(weightArgs([]))).toBeNull();
  });

  it("rounds to three decimals", () => {
    const variants = { "v-third": { id: "v-third", product_id: "p-mango", weight_kg: 0.3333 } };
    expect(computeOrderWeightKg({ items: [{ variantId: "v-third", quantity: 3 }], variantsById: variants, productsById: PRODUCTS })).toBe(1);
  });
});
```

Note the fourth weight test: `v-noweight` has no weight and its parent `p-mango` has no weight
either, so the whole order's weight is `null` — the spec's rule that a partially known weight is
never reported.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/warehouseRouting.test.ts`
Expected: FAIL — `Cannot find module '../../server/warehouseRouting.js'`

- [ ] **Step 3: Write the implementation**

Create `server/warehouseRouting.js`:

```js
// Pure warehouse-routing helpers. No database access — callers pass in lookup
// maps so this module stays unit-testable (same pattern as shippingCalculation.js).

function lookupProduct(item, productsById, productsByName) {
  if (item.productId && productsById[item.productId]) return productsById[item.productId];
  const raw = item.productName ?? item.product;
  const name = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (name && productsByName[name]) return productsByName[name];
  return null;
}

// Returns the warehouse for an order: the first resolvable product's warehouse,
// otherwise the org's default warehouse, otherwise null.
export function resolveWarehouseId({ items, productsById, productsByName, defaultWarehouseId }) {
  for (const item of items || []) {
    const product = lookupProduct(item, productsById || {}, productsByName || {});
    if (product?.warehouse_id) return product.warehouse_id;
  }
  return defaultWarehouseId || null;
}

// Returns the order's total weight in kg, or null if ANY item's weight is unknown.
// A partially summed weight would look correct on a courier document, so we
// report nothing instead.
export function computeOrderWeightKg({ items, variantsById, productsById }) {
  const list = items || [];
  if (list.length === 0) return null;

  let total = 0;
  for (const item of list) {
    const variant = item.variantId ? (variantsById || {})[item.variantId] : null;
    const productId = item.productId || variant?.product_id;
    const product = productId ? (productsById || {})[productId] : null;

    const unit = variant?.weight_kg ?? product?.weight_kg ?? null;
    if (unit === null || unit === undefined) return null;

    const quantity = Math.max(1, Number.parseInt(item.quantity, 10) || 1);
    total += Number(unit) * quantity;
  }
  return Math.round(total * 1000) / 1000;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/test/warehouseRouting.test.ts`
Expected: PASS (15 tests)

- [ ] **Step 5: Commit**

```bash
git add server/warehouseRouting.js src/test/warehouseRouting.test.ts
git commit -m "feat: add pure warehouse routing and order weight helpers"
```

---

### Task 3: Warehouse CRUD API

**Files:**
- Modify: `server/index.js` — add a `// ─── Warehouses ───` section immediately before the
  `app.get("/api/products"` route at line 8434
- Create: `src/test/warehouseApiRoutes.test.ts`

**Interfaces:**
- Consumes: the `warehouses` table from Task 1; existing helpers `getToken`, `getUser`,
  `getServiceSupabase`, `getUserOrg`.
- Produces: `GET /api/warehouses`, `POST /api/warehouses`, `PATCH /api/warehouses/:id`,
  `DELETE /api/warehouses/:id`. List responses have shape
  `{ warehouses: Array<{ id, name, address, contact_person, phone, is_default, product_count }> }`.

- [ ] **Step 1: Write the failing test**

The codebase tests `server/index.js` routes by asserting on its source text (see
`src/test/customersApiRoutes.test.ts`). Follow that convention.

Create `src/test/warehouseApiRoutes.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const server = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

describe("warehouse API routes", () => {
  it("registers the CRUD routes", () => {
    expect(server).toContain('app.get("/api/warehouses"');
    expect(server).toContain('app.post("/api/warehouses"');
    expect(server).toContain('app.patch("/api/warehouses/:id"');
    expect(server).toContain('app.delete("/api/warehouses/:id"');
  });

  it("guards every warehouse route with auth and the org filter", () => {
    const section = server.slice(
      server.indexOf('app.get("/api/warehouses"'),
      server.indexOf('app.get("/api/products"'),
    );
    const handlers = section.split(/app\.(?:get|post|patch|delete)\("\/api\/warehouses/).slice(1);
    expect(handlers.length).toBeGreaterThanOrEqual(4);
    for (const handler of handlers) {
      expect(handler).toContain("getUser(getToken(req))");
      expect(handler).toContain('res.status(401).json({ error: "Unauthorized" })');
      expect(handler).toContain("getUserOrg(supabase, user.id)");
      expect(handler).toContain('.eq("org_id", orgId)');
    }
  });

  it("refuses to delete the default warehouse and soft-deletes the rest", () => {
    expect(server).toContain("Cannot delete the default warehouse");
    expect(server).toContain("deleted_at: new Date().toISOString()");
  });

  it("clears the previous default when a new one is set", () => {
    expect(server).toContain("clearOtherDefaultWarehouses");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/warehouseApiRoutes.test.ts`
Expected: FAIL — first assertion, `app.get("/api/warehouses"` not found.

- [ ] **Step 3: Write the routes**

Insert immediately before `app.get("/api/products"` in `server/index.js`:

```js
// ─── Warehouses ───────────────────────────────────────────────────────────────

async function clearOtherDefaultWarehouses(supabase, orgId, keepId) {
  const query = supabase
    .from("warehouses")
    .update({ is_default: false })
    .eq("org_id", orgId)
    .eq("is_default", true);
  if (keepId) query.neq("id", keepId);
  await query;
}

async function getDefaultWarehouseId(supabase, orgId) {
  const { data } = await supabase
    .from("warehouses")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_default", true)
    .is("deleted_at", null)
    .maybeSingle();
  return data?.id || null;
}

app.get("/api/warehouses", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    const { data: rows, error } = await supabase
      .from("warehouses")
      .select("id, name, address, contact_person, phone, is_default, created_at")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw error;

    const { data: products } = await supabase
      .from("products")
      .select("id, warehouse_id")
      .eq("org_id", orgId);

    const counts = {};
    let unassigned = 0;
    for (const p of products || []) {
      if (p.warehouse_id) counts[p.warehouse_id] = (counts[p.warehouse_id] || 0) + 1;
      else unassigned += 1;
    }

    return res.json({
      warehouses: (rows || []).map((w) => ({
        ...w,
        product_count: (counts[w.id] || 0) + (w.is_default ? unassigned : 0),
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
```

Then the create route:

```js
app.post("/api/warehouses", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Warehouse name is required" });
    const isDefault = req.body?.is_default === true;

    const { data, error } = await supabase
      .from("warehouses")
      .insert({
        org_id: orgId,
        name,
        address: req.body?.address || null,
        contact_person: req.body?.contact_person || null,
        phone: req.body?.phone || null,
        is_default: false,
      })
      .select()
      .single();
    if (error) {
      if (error.code === "23505" || error.code === "23P01" || /duplicate/i.test(error.message)) {
        return res.status(409).json({ error: "A warehouse with that name already exists" });
      }
      throw error;
    }

    if (isDefault) {
      await clearOtherDefaultWarehouses(supabase, orgId, data.id);
      await supabase.from("warehouses").update({ is_default: true }).eq("id", data.id).eq("org_id", orgId);
      data.is_default = true;
    }

    return res.json({ warehouse: data });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: e.message });
  }
});
```

Then update and soft delete:

```js
app.patch("/api/warehouses/:id", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    const updates = {};
    for (const field of ["name", "address", "contact_person", "phone"]) {
      if (req.body?.[field] !== undefined) {
        updates[field] = field === "name" ? String(req.body[field]).trim() : req.body[field] || null;
      }
    }
    if (updates.name === "") return res.status(400).json({ error: "Warehouse name is required" });

    const makeDefault = req.body?.is_default === true;
    if (makeDefault) {
      await clearOtherDefaultWarehouses(supabase, orgId, req.params.id);
      updates.is_default = true;
    }

    const { data, error } = await supabase
      .from("warehouses")
      .update(updates)
      .eq("id", req.params.id)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .select()
      .single();
    if (error) throw error;
    return res.json({ warehouse: data });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: e.message });
  }
});

app.delete("/api/warehouses/:id", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    const { data: existing } = await supabase
      .from("warehouses")
      .select("id, is_default")
      .eq("id", req.params.id)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing) return res.status(404).json({ error: "Warehouse not found" });
    if (existing.is_default) {
      return res.status(400).json({ error: "Cannot delete the default warehouse" });
    }

    await supabase
      .from("products")
      .update({ warehouse_id: null })
      .eq("org_id", orgId)
      .eq("warehouse_id", req.params.id);

    const { error } = await supabase
      .from("warehouses")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .eq("org_id", orgId);
    if (error) throw error;
    return res.json({ success: true });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: e.message });
  }
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/test/warehouseApiRoutes.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/index.js src/test/warehouseApiRoutes.test.ts
git commit -m "feat: add warehouse CRUD API routes"
```

---

### Task 4: Warehouse detail API and bulk product assignment

**Files:**
- Modify: `server/index.js` — add to the `// ─── Warehouses ───` section from Task 3
- Test: `src/test/warehouseDetailApi.test.ts`

**Interfaces:**
- Consumes: `getDefaultWarehouseId(supabase, orgId)` from Task 3
- Produces:
  - `GET /api/warehouses/:id` → `{ warehouse, summary: { product_count, total_stock, published_count }, products: Array<{ id, name, selling_price, stock_quantity, weight_kg, published, assigned_explicitly }> }`
  - `POST /api/products/bulk-assign-warehouse` body `{ product_ids: string[], warehouse_id: string | null }` → `{ updated: number }`

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

describe("warehouse detail API", () => {
  it("registers the detail and bulk-assign routes", () => {
    expect(source).toContain('app.get("/api/warehouses/:id"');
    expect(source).toContain('app.post("/api/products/bulk-assign-warehouse"');
  });

  it("returns unassigned products on the default warehouse", () => {
    expect(source).toContain("assigned_explicitly");
    expect(source).toContain("includeUnassigned");
  });

  it("guards both routes with auth and the org filter", () => {
    const detail = source.slice(source.indexOf('app.get("/api/warehouses/:id"'));
    const handler = detail.slice(0, detail.indexOf("\n});"));
    expect(handler).toContain('return res.status(401).json({ error: "Unauthorized" })');
    expect(handler).toContain('.eq("org_id", orgId)');

    const bulk = source.slice(source.indexOf('app.post("/api/products/bulk-assign-warehouse"'));
    const bulkHandler = bulk.slice(0, bulk.indexOf("\n});"));
    expect(bulkHandler).toContain('return res.status(401).json({ error: "Unauthorized" })');
    expect(bulkHandler).toContain('.eq("org_id", orgId)');
    expect(bulkHandler).toContain('.in("id", productIds)');
  });

  it("never accepts an org id from the client", () => {
    const bulk = source.slice(source.indexOf('app.post("/api/products/bulk-assign-warehouse"'));
    const bulkHandler = bulk.slice(0, bulk.indexOf("\n});"));
    expect(bulkHandler).not.toContain("req.body.org_id");
    expect(bulkHandler).not.toContain("req.body?.org_id");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/warehouseDetailApi.test.ts`
Expected: FAIL — `app.get("/api/warehouses/:id"` not found.

- [ ] **Step 3: Write the detail route**

Add to the Warehouses section, after `app.delete("/api/warehouses/:id"`:

```js
app.get("/api/warehouses/:id", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    const { data: warehouse } = await supabase
      .from("warehouses")
      .select("id, name, address, contact_person, phone, is_default, created_at")
      .eq("id", req.params.id)
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });

    const includeUnassigned = warehouse.is_default === true;
    let query = supabase
      .from("products")
      .select("id, name, selling_price, stock_quantity, weight_kg, published, warehouse_id")
      .eq("org_id", orgId)
      .order("name", { ascending: true });
    query = includeUnassigned
      ? query.or(`warehouse_id.eq.${warehouse.id},warehouse_id.is.null`)
      : query.eq("warehouse_id", warehouse.id);

    const { data: rows, error } = await query;
    if (error) throw error;

    const products = (rows || []).map((p) => ({
      id: p.id,
      name: p.name,
      selling_price: p.selling_price,
      stock_quantity: p.stock_quantity,
      weight_kg: p.weight_kg,
      published: p.published,
      assigned_explicitly: p.warehouse_id === warehouse.id,
    }));

    return res.json({
      warehouse,
      summary: {
        product_count: products.length,
        total_stock: products.reduce((sum, p) => sum + (Number(p.stock_quantity) || 0), 0),
        published_count: products.filter((p) => p.published).length,
      },
      products,
    });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: e.message });
  }
});
```

- [ ] **Step 4: Write the bulk-assign route**

Add directly after the detail route. Passing `warehouse_id: null` clears the assignment, which
returns those products to the default warehouse.

```js
app.post("/api/products/bulk-assign-warehouse", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    const productIds = Array.isArray(req.body?.product_ids) ? req.body.product_ids : [];
    if (productIds.length === 0) {
      return res.status(400).json({ error: "product_ids is required" });
    }

    const warehouseId = req.body?.warehouse_id || null;
    if (warehouseId) {
      const { data: warehouse } = await supabase
        .from("warehouses")
        .select("id")
        .eq("id", warehouseId)
        .eq("org_id", orgId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!warehouse) return res.status(404).json({ error: "Warehouse not found" });
    }

    const { data, error } = await supabase
      .from("products")
      .update({ warehouse_id: warehouseId })
      .eq("org_id", orgId)
      .in("id", productIds)
      .select("id");
    if (error) throw error;

    return res.json({ updated: (data || []).length });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ error: e.message });
  }
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/test/warehouseDetailApi.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/index.js src/test/warehouseDetailApi.test.ts
git commit -m "feat: add warehouse detail and bulk product assignment routes"
```

---

### Task 5: Wire routing into both order-creation paths

Storefront checkout and social inbox capture are the only two live order sources. Both must
call the same pure helpers so routing can never diverge.

**Files:**
- Modify: `server/index.js` — import Task 2 helpers; `handlePublicHandleOrderSubmit` (~8737); `saveMetaInboxOrder` (~7115)
- Test: `src/test/orderRoutingWiring.test.ts`

**Interfaces:**
- Consumes: `resolveWarehouseId`, `computeOrderWeightKg` from `server/warehouseRouting.js`; `getDefaultWarehouseId` from Task 3
- Produces: `resolveOrderRouting(supabase, orgId, items)` in `server/index.js`, returning
  `{ warehouseId: string | null, warehouseAuto: true, weightKg: number | null }`.
  `items` is `Array<{ productId?: string, variantId?: string, productName?: string, quantity?: number }>`.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

describe("order routing wiring", () => {
  it("imports the pure routing helpers", () => {
    expect(source).toContain('from "./warehouseRouting.js"');
    expect(source).toContain("resolveWarehouseId");
    expect(source).toContain("computeOrderWeightKg");
  });

  it("defines a single shared resolveOrderRouting helper", () => {
    expect(source).toContain("async function resolveOrderRouting(supabase, orgId, items)");
    expect(source.match(/async function resolveOrderRouting\(/g)?.length).toBe(1);
    expect(source).toContain("warehouseAuto: true");
  });

  it("uses it on the storefront checkout path", () => {
    const start = source.indexOf("async function handlePublicHandleOrderSubmit");
    const handler = source.slice(start, start + 12000);
    expect(handler).toContain("await resolveOrderRouting(supabase, orgId, orderItems)");
    expect(handler).toContain("warehouse_id: routing.warehouseId");
    expect(handler).toContain("warehouse_auto: routing.warehouseAuto");
    expect(handler).toContain("weight_kg: routing.weightKg");
  });

  it("uses it on the social inbox capture path", () => {
    const start = source.indexOf("async function saveMetaInboxOrder");
    const handler = source.slice(start, start + 4000);
    expect(handler).toContain("await resolveOrderRouting(supabase, orgId,");
    expect(handler).toContain("warehouse_id: routing.warehouseId");
    expect(handler).toContain("weight_kg: routing.weightKg");
  });

  it("selects weight and warehouse columns on the checkout lookups", () => {
    const start = source.indexOf("async function handlePublicHandleOrderSubmit");
    const handler = source.slice(start, start + 12000);
    expect(handler).toContain("id, product_id, org_id, attributes, price_adjustment, stock_quantity, weight_kg");
    expect(handler).toContain("id, name, selling_price, published, weight_kg, warehouse_id");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/orderRoutingWiring.test.ts`
Expected: FAIL — `from "./warehouseRouting.js"` not found.

- [ ] **Step 3: Add the import and the shared resolver**

Add the import beside the existing `./shippingCalculation.js` import at the top of
`server/index.js`:

```js
import { resolveWarehouseId, computeOrderWeightKg } from "./warehouseRouting.js";
```

Add `resolveOrderRouting` inside the `// ─── Warehouses ───` section, after
`getDefaultWarehouseId`:

```js
// Resolves the warehouse and total weight for a new order. Used by every order-creation
// path so routing can never diverge between sources. Called once, at creation; the result
// is a snapshot stored on the order row and is never recomputed.
async function resolveOrderRouting(supabase, orgId, items) {
  const list = Array.isArray(items) ? items : [];
  const defaultWarehouseId = await getDefaultWarehouseId(supabase, orgId);
  if (list.length === 0) {
    return { warehouseId: defaultWarehouseId, warehouseAuto: true, weightKg: null };
  }

  const variantIds = [...new Set(list.map((i) => i.variantId).filter(Boolean))];
  const variantsById = {};
  if (variantIds.length > 0) {
    const { data } = await supabase
      .from("product_variants")
      .select("id, product_id, weight_kg")
      .in("id", variantIds)
      .eq("org_id", orgId);
    for (const v of data || []) variantsById[v.id] = v;
  }

  const productIds = [
    ...new Set([
      ...list.map((i) => i.productId).filter(Boolean),
      ...Object.values(variantsById).map((v) => v.product_id).filter(Boolean),
    ]),
  ];
  const productsById = {};
  if (productIds.length > 0) {
    const { data } = await supabase
      .from("products")
      .select("id, name, weight_kg, warehouse_id")
      .in("id", productIds)
      .eq("org_id", orgId);
    for (const p of data || []) productsById[p.id] = p;
  }

  // Name fallback for items that carry no id (social inbox capture).
  const productsByName = {};
  const names = list.map((i) => i.productName ?? i.product).filter(Boolean);
  if (names.length > 0) {
    const { data } = await supabase
      .from("products")
      .select("id, name, weight_kg, warehouse_id")
      .eq("org_id", orgId)
      .in("name", names);
    for (const p of data || []) {
      productsByName[String(p.name).trim().toLowerCase()] = p;
      if (!productsById[p.id]) productsById[p.id] = p;
    }
  }

  return {
    warehouseId: resolveWarehouseId({ items: list, productsById, productsByName, defaultWarehouseId }),
    warehouseAuto: true,
    weightKg: computeOrderWeightKg({ items: list, variantsById, productsById }),
  };
}
```

- [ ] **Step 4: Wire the storefront checkout path**

In `handlePublicHandleOrderSubmit`, widen the two existing selects so the resolver's inputs
carry weight and warehouse:

```js
// was: .select("id, product_id, org_id, attributes, price_adjustment, stock_quantity")
.select("id, product_id, org_id, attributes, price_adjustment, stock_quantity, weight_kg")
```

```js
// was: .select("id, name, selling_price, published")
.select("id, name, selling_price, published, weight_kg, warehouse_id")
```

Then, immediately after the `const productSummary = orderItems...join(", ");` block, add:

```js
    // ── Warehouse routing and weight (snapshot, resolved once) ───────────
    const routing = await resolveOrderRouting(supabase, orgId, orderItems);
```

`orderItems` already carries `productId`, `variantId`, `productName`, and `quantity` per line,
so this is an exact id match with no name guessing.

Add three fields to `orderRow`, after `source: "storefront",`:

```js
      warehouse_id: routing.warehouseId,
      warehouse_auto: routing.warehouseAuto,
      weight_kg: routing.weightKg,
```

- [ ] **Step 5: Wire the social inbox capture path**

In `saveMetaInboxOrder`, replace the inline `items:` array with a named constant built before
the insert, then resolve routing from it. Add above the `const { data, error } = await supabase`
call:

```js
  const items = [
    {
      product: order.product_name,
      quantity: order.quantity,
      unit_price: order.unit_price,
      variant_id: order.variant_id || null,
    },
  ];

  const routing = await resolveOrderRouting(
    supabase,
    orgId,
    items.map((i) => ({
      productName: i.product,
      variantId: i.variant_id || undefined,
      quantity: i.quantity,
    })),
  );
```

Then in the insert object, replace the inline `items: [...]` line with `items,` and add after
`status: "pending",`:

```js
      warehouse_id: routing.warehouseId,
      warehouse_auto: routing.warehouseAuto,
      weight_kg: routing.weightKg,
```

`order.variant_id` is populated by Task 14; until then it is `undefined` and the weight falls
back to `products.weight_kg`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/test/orderRoutingWiring.test.ts src/test/warehouseRouting.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/index.js src/test/orderRoutingWiring.test.ts
git commit -m "feat: route new orders to a warehouse and compute order weight"
```

---

### Task 6: Manual warehouse override and the orders warehouse filter

**Files:**
- Modify: `server/index.js` — `GET /api/orders` (~5239), `PATCH /api/orders/:id` (~5728), `PATCH /api/social/inbox-orders/:id` (~8357)
- Test: `src/test/warehouseOverrideApi.test.ts`

**Interfaces:**
- Produces: `GET /api/orders?warehouse_id=<uuid>` filters to one warehouse; `warehouse_id` and
  `weight_kg` become writable on both PATCH routes, and writing `warehouse_id` forces
  `warehouse_auto = false`.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

function handlerFor(anchor: string): string {
  const start = source.indexOf(anchor);
  expect(start).toBeGreaterThan(-1);
  const rest = source.slice(start);
  return rest.slice(0, rest.indexOf("\n});"));
}

describe("warehouse manual override", () => {
  it("allows warehouse_id and weight_kg on the orders PATCH route", () => {
    const handler = handlerFor('app.patch("/api/orders/:id"');
    expect(handler).toContain('"warehouse_id"');
    expect(handler).toContain('"weight_kg"');
    expect(handler).toContain("update.warehouse_auto = false");
  });

  it("allows warehouse_id and weight_kg on the inbox orders PATCH route", () => {
    const handler = handlerFor('app.patch("/api/social/inbox-orders/:id"');
    expect(handler).toContain('"warehouse_id"');
    expect(handler).toContain('"weight_kg"');
    expect(handler).toContain("update.warehouse_auto = false");
  });

  it("never lets a client set warehouse_auto directly", () => {
    const orders = handlerFor('app.patch("/api/orders/:id"');
    const inbox = handlerFor('app.patch("/api/social/inbox-orders/:id"');
    expect(orders).not.toContain('"warehouse_auto"');
    expect(inbox).not.toContain('"warehouse_auto"');
  });

  it("filters GET /api/orders by warehouse_id when asked", () => {
    const handler = handlerFor('app.get("/api/orders"');
    expect(handler).toContain("req.query.warehouse_id");
    expect(handler).toContain('.eq("warehouse_id", warehouseFilter)');
    expect(handler).toContain('.eq("org_id", orgId)');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/warehouseOverrideApi.test.ts`
Expected: FAIL — `"warehouse_id"` not in the orders PATCH allowed list.

- [ ] **Step 3: Extend `PATCH /api/orders/:id`**

Add the two fields to the `allowed` array and force the auto flag off. `warehouse_auto` is
deliberately not in `allowed` — it is derived, never client-supplied.

```js
    const allowed = ["status", "notes", "courier_status", "consignment_id", "tracking_code", "courier_message", "sent_to_courier", "fraud_checked", "fraud_data", "price", "delivery_rate", "warehouse_id", "weight_kg"];
    const update = {};
    for (const k of allowed) { if (req.body[k] !== undefined) update[k] = req.body[k]; }
    // A human setting the warehouse means it is no longer a guess.
    if (update.warehouse_id !== undefined) update.warehouse_auto = false;
```

- [ ] **Step 4: Extend `PATCH /api/social/inbox-orders/:id`**

Same change, in the same shape:

```js
    const allowed = ["status", "notes", "sent_to_courier", "consignment_id", "tracking_code", "courier_status", "courier_message", "fraud_checked", "fraud_data", "delivery_rate", "items", "total_price", "contact_name", "warehouse_id", "weight_kg"];
    const update = {};
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) update[key] = req.body[key];
    }
    if (update.warehouse_id !== undefined) update.warehouse_auto = false;
```

- [ ] **Step 5: Add the warehouse filter to `GET /api/orders`**

Replace the query block with a conditionally chained one:

```js
    const warehouseFilter = typeof req.query.warehouse_id === "string" ? req.query.warehouse_id : null;
    let query = supabase
      .from("orders")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (warehouseFilter) query = query.eq("warehouse_id", warehouseFilter);
    const { data: allData, error } = await query;
    if (error) throw error;
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/test/warehouseOverrideApi.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/index.js src/test/warehouseOverrideApi.test.ts
git commit -m "feat: allow manual warehouse override and filter orders by warehouse"
```

---

### Task 7: Weight and warehouse on the product and variant APIs

Weight is entered when the product and its variants are created. The variant weight is
authoritative; `products.weight_kg` is only a fallback for products with no variants.

**Files:**
- Modify: `server/index.js` — `POST /api/products/save` (~9035), `PATCH /api/products/:id` (~9478), `POST /api/products/:id/variants` (~9854), `PATCH /api/products/:id/variants/:variantId` (~9888), `GET /api/products`
- Test: `src/test/productWeightApi.test.ts`

**Interfaces:**
- Produces: `weight_kg` accepted on product save/patch and variant create/patch;
  `warehouse_id` accepted on product save/patch; `GET /api/products` returns both.
  Helper `parseWeightKg(value)` → `number | null`, rounding to 3 decimals, rejecting
  negatives and non-numbers by returning `null`.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

function handlerFor(anchor: string): string {
  const start = source.indexOf(anchor);
  expect(start).toBeGreaterThan(-1);
  const rest = source.slice(start);
  return rest.slice(0, rest.indexOf("\n});"));
}

describe("product and variant weight fields", () => {
  it("defines a single weight parser", () => {
    expect(source).toContain("function parseWeightKg(value)");
    expect(source.match(/function parseWeightKg\(/g)?.length).toBe(1);
  });

  it("accepts weight and warehouse on product save", () => {
    const handler = handlerFor('app.post("/api/products/save"');
    expect(handler).toContain("weight_kg: parseWeightKg(p.weight_kg)");
    expect(handler).toContain("warehouse_id: p.warehouse_id || null");
    expect(handler).toContain("weight_kg: parseWeightKg(v.weight_kg)");
  });

  it("accepts weight and warehouse on product patch", () => {
    const handler = handlerFor('app.patch("/api/products/:id"');
    expect(handler).toContain('"weight_kg"');
    expect(handler).toContain('"warehouse_id"');
    expect(handler).toContain("update.weight_kg = parseWeightKg(update.weight_kg)");
  });

  it("accepts weight on variant create and patch", () => {
    expect(handlerFor('app.post("/api/products/:id/variants"')).toContain(
      "weight_kg: parseWeightKg(weight_kg)",
    );
    expect(handlerFor('app.patch("/api/products/:id/variants/:variantId"')).toContain(
      "patch.weight_kg = parseWeightKg(req.body.weight_kg)",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/productWeightApi.test.ts`
Expected: FAIL — `function parseWeightKg(value)` not found.

- [ ] **Step 3: Add the parser**

Add to the `// ─── Warehouses ───` section, beside `resolveOrderRouting`:

```js
// Weight in kg, rounded to 3 decimals. Returns null for blank, non-numeric,
// or negative input so an unknown weight stays genuinely unknown.
function parseWeightKg(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1000) / 1000;
}
```

- [ ] **Step 4: Wire it into the four routes**

In `POST /api/products/save`, add to the `rows.push({ ... })` object, after `cog:`:

```js
        weight_kg: parseWeightKg(p.weight_kg),
        warehouse_id: p.warehouse_id || null,
```

and to the `variantRows.push({ ... })` object, after `stock_quantity:`:

```js
          weight_kg: parseWeightKg(v.weight_kg),
```

In `PATCH /api/products/:id`, extend `allowed` and normalise:

```js
    const allowed = ["name", "url", "image_url", "selling_price", "cog", "published", "slug", "description", "compare_at_price", "weight_kg", "warehouse_id"];
    const update = {};
    for (const k of allowed) { if (req.body[k] !== undefined) update[k] = req.body[k]; }
    if (update.weight_kg !== undefined) update.weight_kg = parseWeightKg(update.weight_kg);
    if (update.warehouse_id !== undefined) update.warehouse_id = update.warehouse_id || null;
```

In `POST /api/products/:id/variants`, destructure and insert the field:

```js
    const { attributes, cog, stock_quantity, price_adjustment, weight_kg } = req.body;
```

```js
        price_adjustment: parseFloat(price_adjustment) || 0,
        weight_kg: parseWeightKg(weight_kg),
```

In `PATCH /api/products/:id/variants/:variantId`, after the `price_adjustment` line:

```js
    if (req.body.weight_kg !== undefined) patch.weight_kg = parseWeightKg(req.body.weight_kg);
```

`GET /api/products` and `GET /api/products/:id/variants` both select `*`, so the new columns
are returned without any change there. Confirm this by reading both handlers; if either has an
explicit column list, add `weight_kg` (and `warehouse_id` for products) to it.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/test/productWeightApi.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/index.js src/test/productWeightApi.test.ts
git commit -m "feat: accept product and variant weight and product warehouse"
```

---

### Task 8: Shared warehouse data layer and the product form fields

**Files:**
- Create: `src/hooks/useWarehouses.ts`
- Modify: `src/pages/products/shared.tsx` — add `weight_kg` / `warehouse_id` to types and `weight` to `ComboFields`
- Modify: `src/pages/ProductNew.tsx` — weight field, warehouse picker, per-variant weight
- Modify: `src/pages/ProductEdit.tsx` — weight field, warehouse picker
- Test: `src/test/productWeightForm.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Warehouse = {
    id: string; name: string; address: string | null; contact_person: string | null;
    phone: string | null; is_default: boolean; created_at: string; product_count?: number;
  };
  export function useWarehouses(): {
    warehouses: Warehouse[];
    isLoading: boolean;
    refetch: () => Promise<unknown>;
  };
  export const WAREHOUSES_QUERY_KEY = "/api/warehouses";
  ```
- `ProductVariant` and `Product` gain `weight_kg: number | null`; `Product` gains
  `warehouse_id: string | null`; `ComboFields` gains `weight: string`.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("product weight and warehouse form fields", () => {
  it("exposes a shared warehouses hook", () => {
    const hook = read("src/hooks/useWarehouses.ts");
    expect(hook).toContain("export function useWarehouses");
    expect(hook).toContain('export const WAREHOUSES_QUERY_KEY = "/api/warehouses"');
    expect(hook).toContain("apiFetch");
  });

  it("carries weight and warehouse through the shared product types", () => {
    const shared = read("src/pages/products/shared.tsx");
    expect(shared).toContain("weight_kg: number | null");
    expect(shared).toContain("warehouse_id: string | null");
    expect(shared).toContain("weight: string");
  });

  it("adds a weight input and a warehouse picker to both product forms", () => {
    for (const file of ["src/pages/ProductNew.tsx", "src/pages/ProductEdit.tsx"]) {
      const source = read(file);
      expect(source).toContain('label="Weight (kg)"');
      expect(source).toContain("useWarehouses");
      expect(source).toContain("warehouse_id:");
    }
  });

  it("adds a per-variant weight field on the add-product page", () => {
    const source = read("src/pages/ProductNew.tsx");
    expect(source).toContain("Weight (kg)");
    expect(source).toContain("updateCombo(key, { weight: v })");
    expect(source).toContain("weight_kg:");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/productWeightForm.test.ts`
Expected: FAIL — `src/hooks/useWarehouses.ts` does not exist (ENOENT).

- [ ] **Step 3: Create the hook**

`src/hooks/useWarehouses.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export type Warehouse = {
  id: string;
  name: string;
  address: string | null;
  contact_person: string | null;
  phone: string | null;
  is_default: boolean;
  created_at: string;
  product_count?: number;
};

export const WAREHOUSES_QUERY_KEY = "/api/warehouses";

export function useWarehouses() {
  const { data, isLoading, refetch } = useQuery<{ warehouses: Warehouse[] }>({
    queryKey: [WAREHOUSES_QUERY_KEY],
    queryFn: async () => {
      const res = await apiFetch("/api/warehouses");
      if (!res.ok) {
        throw new Error((await res.json().catch(() => ({}))).error || "Failed to load warehouses");
      }
      return res.json();
    },
  });

  return { warehouses: data?.warehouses ?? [], isLoading, refetch };
}
```

- [ ] **Step 4: Extend the shared product types**

In `src/pages/products/shared.tsx`:

```ts
export type ProductVariant = {
  id: string;
  product_id: string;
  attributes: Record<string, string>;
  cog: number;
  stock_quantity: number;
  price_adjustment: number;
  weight_kg: number | null;
  org_id: string | null;
  created_at: string;
};
```

Add to `Product`, after `stock_quantity: number;`:

```ts
  weight_kg: number | null;
  warehouse_id: string | null;
```

And widen `ComboFields`:

```ts
export type ComboFields = { stock: string; price: string; cog: string; weight: string };
```

Fixing `ComboFields` breaks the three `?? { stock: "", price: "", cog: "" }` defaults in
`ProductNew.tsx` under TS strict. Update all three to
`?? { stock: "", price: "", cog: "", weight: "" }`.

- [ ] **Step 5: Add the fields to `ProductNew.tsx`**

Add the import and state:

```tsx
import { useWarehouses } from "@/hooks/useWarehouses";
```

```tsx
  const { warehouses } = useWarehouses();
  const [weight, setWeight] = useState("");
  const [warehouseId, setWarehouseId] = useState<string>("");
```

Add the weight input beside the existing `Stock quantity` input:

```tsx
          <BuiInput label="Weight (kg)" type="number" value={weight} onChange={setWeight} placeholder="0.000" />
```

Add the warehouse picker beside the Status select, following the same shape:

```tsx
          <div className="flex flex-col justify-end space-y-1.5">
            <FormSectionLabel>Warehouse</FormSectionLabel>
            <BuiSelect
              aria-label="Warehouse"
              triggerClassName="h-9"
              selectedKey={warehouseId || "default"}
              onSelectionChange={(k) => setWarehouseId(k === "default" ? "" : String(k))}
            >
              <BuiSelectItem id="default" textValue="Default warehouse">Default warehouse</BuiSelectItem>
              {warehouses.map((w) => (
                <BuiSelectItem key={w.id} id={w.id} textValue={w.name}>{w.name}</BuiSelectItem>
              ))}
            </BuiSelect>
          </div>
```

Add the per-variant weight field to the combination row. Widen the grid template from
`md:grid-cols-[1fr_110px_120px_110px]` to `md:grid-cols-[1fr_110px_120px_110px_110px]` and add,
after the COG label:

```tsx
                  <label className="space-y-1">
                    <span className="block text-caption-1-medium text-text-tertiary">Weight (kg)</span>
                    <BuiInput size="small" type="number" value={d.weight} onChange={(v) => updateCombo(key, { weight: v })} placeholder={weight || "0.000"} />
                  </label>
```

In `submit()`, carry both through. In `generatedVariants`:

```tsx
        return {
          attributes: attrs,
          cog: parseFloat(d.cog || cog) || 0,
          stock_quantity: Math.max(0, parseInt(d.stock || "0", 10) || 0),
          selling_price: px ? parseFloat(px) || 0 : null,
          weight_kg: (d.weight || weight) ? parseFloat(d.weight || weight) : null,
        };
```

and in the product payload, after `stock_quantity:`:

```tsx
            weight_kg: weight ? parseFloat(weight) : null,
            warehouse_id: warehouseId || null,
```

- [ ] **Step 6: Add the fields to `ProductEdit.tsx`**

Same import, plus state seeded from the product:

```tsx
  const { warehouses } = useWarehouses();
  const [weight, setWeight] = useState(product.weight_kg == null ? "" : String(product.weight_kg));
  const [warehouseId, setWarehouseId] = useState(product.warehouse_id ?? "");
```

`ProductEdit` does not currently import the Select, so add it beside the Input import:

```tsx
import { Select as BuiSelect, SelectItem as BuiSelectItem } from "@/components/base/select/select";
```

Add the weight input after `Stock quantity`, and the warehouse picker in the same grid (the same
markup as Step 5, reusing `FormSectionLabel`). Then add to the PATCH body after `stock_quantity:`:

```tsx
          weight_kg: weight ? parseFloat(weight) : null,
          warehouse_id: warehouseId || null,
```

Existing variant weights are edited from the Products page variant editor in Task 9, not here.

- [ ] **Step 7: Run the test and the type check**

Run: `npx vitest run src/test/productWeightForm.test.ts`
Expected: PASS

Run: `npm run build`
Expected: type-checks and bundles with no errors.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useWarehouses.ts src/pages/products/shared.tsx src/pages/ProductNew.tsx src/pages/ProductEdit.tsx src/test/productWeightForm.test.ts
git commit -m "feat: add weight and warehouse fields to the product forms"
```

---

### Task 9: Products page warehouse column, bulk assign, and variant weight

**Files:**
- Modify: `src/pages/Products.tsx` — new `warehouse` column, a bulk "Assign to warehouse" action in the existing selection row, and a weight field in the variant popover
- Test: `src/test/productsWarehouseColumn.test.ts`

**Interfaces:**
- Consumes: `useWarehouses`, `WAREHOUSES_QUERY_KEY` (Task 8); `POST /api/products/bulk-assign-warehouse` (Task 4); `PATCH /api/products/:id/variants/:variantId` accepting `weight_kg` (Task 7)
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/pages/Products.tsx"), "utf8");

describe("products page warehouse controls", () => {
  it("renders a warehouse column with an inline picker", () => {
    expect(source).toContain('id: "warehouse"');
    expect(source).toContain("useWarehouses");
    expect(source).toContain("Default warehouse");
  });

  it("offers a bulk assign-to-warehouse action on selection", () => {
    expect(source).toContain("assignSelectedToWarehouse");
    expect(source).toContain("/api/products/bulk-assign-warehouse");
    expect(source).toContain("product_ids");
  });

  it("edits variant weight from the variant popover", () => {
    expect(source).toContain("weightDraft");
    expect(source).toContain("body.weight_kg");
  });

  it("invalidates the warehouses query after assigning", () => {
    expect(source).toContain("WAREHOUSES_QUERY_KEY");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/productsWarehouseColumn.test.ts`
Expected: FAIL — `id: "warehouse"` not found.

- [ ] **Step 3: Add the warehouse column**

Add the import at the top of `src/pages/Products.tsx`:

```tsx
import { useWarehouses, WAREHOUSES_QUERY_KEY } from "@/hooks/useWarehouses";
```

Call the hook inside the list component, beside the existing `useState` declarations:

```tsx
  const { warehouses } = useWarehouses();
```

Add this column definition immediately after the `selling_price` column. `BuiSelect` and
`BuiSelectItem` are already imported in this file.

```tsx
    {
      id: "warehouse",
      header: ({ column }) => <SortHeader column={column} title="Warehouse" />,
      meta: { align: "center" } as ColMeta,
      accessorFn: (row) => warehouses.find((w) => w.id === row.warehouse_id)?.name ?? "",
      cell: ({ row }) => {
        const product = row.original;
        return (
          <div onClick={(e) => e.stopPropagation()} className="mx-auto w-[150px]">
            <BuiSelect
              aria-label={`Warehouse for ${product.name}`}
              triggerClassName="h-8"
              selectedKey={product.warehouse_id ?? "default"}
              onSelectionChange={(k) => assignProductsToWarehouse([product.id], k === "default" ? null : String(k))}
            >
              <BuiSelectItem id="default" textValue="Default warehouse">Default warehouse</BuiSelectItem>
              {warehouses.map((w) => (
                <BuiSelectItem key={w.id} id={w.id} textValue={w.name}>{w.name}</BuiSelectItem>
              ))}
            </BuiSelect>
          </div>
        );
      },
      enableSorting: true,
    } as ColumnDef<Product>,
```

- [ ] **Step 4: Add the assign helpers and the bulk action**

Add beside the existing `draftSelected` / `deleteSelected` functions:

```tsx
  async function assignProductsToWarehouse(productIds: string[], warehouseId: string | null) {
    try {
      const res = await apiFetch("/api/products/bulk-assign-warehouse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_ids: productIds, warehouse_id: warehouseId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to assign warehouse");
      await qc.invalidateQueries({ queryKey: ["/api/products"] });
      await qc.invalidateQueries({ queryKey: [WAREHOUSES_QUERY_KEY] });
      const label = warehouseId
        ? warehouses.find((w) => w.id === warehouseId)?.name ?? "warehouse"
        : "the default warehouse";
      toast.success(`${json.updated} product${json.updated === 1 ? "" : "s"} moved to ${label}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to assign warehouse");
    }
  }

  async function assignSelectedToWarehouse(warehouseId: string | null) {
    const ids = table.getSelectedRowModel().rows.map((r) => r.original.id);
    if (ids.length === 0) return;
    await assignProductsToWarehouse(ids, warehouseId);
    setRowSelection({});
  }
```

Add the control inside the existing `{selectedCount > 0 && (<>…</>)}` block, before the Draft
button:

```tsx
                <div className="w-[190px]">
                  <BuiSelect
                    aria-label="Assign selected products to warehouse"
                    triggerClassName="h-9"
                    placeholder={`Assign to warehouse (${selectedCount})`}
                    selectedKey={null}
                    onSelectionChange={(k) => assignSelectedToWarehouse(k === "default" ? null : String(k))}
                  >
                    <BuiSelectItem id="default" textValue="Default warehouse">Default warehouse</BuiSelectItem>
                    {warehouses.map((w) => (
                      <BuiSelectItem key={w.id} id={w.id} textValue={w.name}>{w.name}</BuiSelectItem>
                    ))}
                  </BuiSelect>
                </div>
```

If `BuiSelect` does not accept `selectedKey={null}`, hold a local
`const [bulkWarehouseKey, setBulkWarehouseKey] = useState<string | null>(null);` and reset it to
`null` inside `assignSelectedToWarehouse` after the call, passing `selectedKey={bulkWarehouseKey}`.

- [ ] **Step 5: Add weight to the variant popover**

In `VariantChip`, add the draft state beside `cogDraft`:

```tsx
  const [weightDraft, setWeightDraft] = useState(variant.weight_kg == null ? "" : String(variant.weight_kg));
```

Reset it in the click-outside handler alongside the other two drafts, and add `variant.weight_kg`
to that effect's dependency array.

Send it in `save()`:

```tsx
      const body: Record<string, unknown> = { stock_quantity: Math.max(0, parseInt(stockDraft, 10) || 0) };
      body.weight_kg = weightDraft === "" ? null : parseFloat(weightDraft);
      if (isAdmin) body.cog = parseFloat(cogDraft) || 0;
```

Add the field to the popover, after the Stock block:

```tsx
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-black/40">Weight (kg)</label>
                <input type="number" min={0} step="0.001" value={weightDraft}
                  onChange={e => setWeightDraft(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && save()}
                  className={cn(INPUT_CLS, "h-9")} />
              </div>
```

- [ ] **Step 6: Run the test and the type check**

Run: `npx vitest run src/test/productsWarehouseColumn.test.ts`
Expected: PASS

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Products.tsx src/test/productsWarehouseColumn.test.ts
git commit -m "feat: assign warehouses and edit variant weight from the products page"
```

---

### Task 10: Pure Excel row builder

Splitting the row shaping from the workbook writing is what makes the export testable — the
builder is pure, and only the thin wrapper touches `exceljs` and the DOM.

**Files:**
- Modify: `package.json` — add `"exceljs": "4.4.0"`
- Create: `src/lib/orderExcelExport.ts`
- Test: `src/test/orderExcelExport.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ExportableOrder = {
    order_number?: string | null;
    customer_name?: string | null;
    contact_name?: string | null;
    phone?: string | null;
    address?: string | null;
    product?: string | null;
    items?: Array<{ product?: string | null; quantity?: number | null }> | null;
    quantity?: number | null;
    weight_kg?: number | null;
    price?: number | null;
    total_price?: number | null;
    warehouse_id?: string | null;
    consignment_id?: number | string | null;
    id: string;
  };
  export const ORDER_EXPORT_COLUMNS: readonly string[]; // the 10 headers, in order
  export function buildOrderExportRows(
    orders: ExportableOrder[],
    warehouseNames: Record<string, string>,
    options?: { inbox?: boolean },
  ): Array<Array<string | number | null>>;
  export function orderExportFileName(date: Date, warehouseName?: string | null): string;
  export async function downloadOrderExcel(
    orders: ExportableOrder[],
    warehouseNames: Record<string, string>,
    options?: { inbox?: boolean; warehouseName?: string | null },
  ): Promise<void>;
  ```

- [ ] **Step 1: Add the dependency**

```bash
npm install --save-exact exceljs@4.4.0
```

Confirm `package.json` shows `"exceljs": "4.4.0"` with no caret.

- [ ] **Step 2: Write the failing test**

Create `src/test/orderExcelExport.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ORDER_EXPORT_COLUMNS,
  buildOrderExportRows,
  orderExportFileName,
  type ExportableOrder,
} from "@/lib/orderExcelExport";

const warehouseNames = { "wh-1": "Mango Lover", "wh-2": "Rajshahi Mango" };

const dispatched: ExportableOrder = {
  id: "o1",
  order_number: "#S1001",
  customer_name: "নূর করিম",
  phone: "01712345678",
  address: "বাড়ি ১২, রোড ৩, ধানমন্ডি, ঢাকা",
  product: "Himsagar Mango (5kg) x2",
  quantity: 2,
  weight_kg: 10,
  price: 2400,
  warehouse_id: "wh-1",
  consignment_id: 998877,
};

describe("order excel export rows", () => {
  it("declares the ten columns in the agreed order", () => {
    expect([...ORDER_EXPORT_COLUMNS]).toEqual([
      "Order Number",
      "Customer Name",
      "Phone",
      "Address",
      "Product",
      "Quantity",
      "Weight (kg)",
      "COD Amount",
      "Warehouse",
      "Steadfast ID",
    ]);
  });

  it("maps a dispatched order to one row, Bangla intact", () => {
    expect(buildOrderExportRows([dispatched], warehouseNames)).toEqual([
      ["#S1001", "নূর করিম", "01712345678", "বাড়ি ১২, রোড ৩, ধানমন্ডি, ঢাকা",
        "Himsagar Mango (5kg) x2", 2, 10, 2400, "Mango Lover", 998877],
    ]);
  });
});
```

Append the remaining cases to the same file:

```ts
describe("order excel export edge cases", () => {
  it("leaves weight and Steadfast ID blank when unknown", () => {
    const rows = buildOrderExportRows(
      [{ ...dispatched, weight_kg: null, consignment_id: null }],
      warehouseNames,
    );
    expect(rows[0][6]).toBe("");
    expect(rows[0][9]).toBe("");
  });

  it("falls back to the default warehouse label when the id is unknown", () => {
    expect(buildOrderExportRows([{ ...dispatched, warehouse_id: null }], warehouseNames)[0][8]).toBe("");
    expect(buildOrderExportRows([{ ...dispatched, warehouse_id: "gone" }], warehouseNames)[0][8]).toBe("");
  });

  it("uses inbox field names and the IO- order number prefix", () => {
    const rows = buildOrderExportRows(
      [{
        id: "io1",
        contact_name: "রিয়া",
        phone: "01822222222",
        address: "চট্টগ্রাম",
        items: [{ product: "Amrapali (1kg)", quantity: 3 }],
        total_price: 900,
        weight_kg: 3,
        warehouse_id: "wh-2",
      }],
      warehouseNames,
      { inbox: true },
    );
    expect(rows[0][0]).toBe("IO-io1");
    expect(rows[0][1]).toBe("রিয়া");
    expect(rows[0][4]).toBe("Amrapali (1kg) x3");
    expect(rows[0][5]).toBe(3);
    expect(rows[0][7]).toBe(900);
    expect(rows[0][8]).toBe("Rajshahi Mango");
  });

  it("emits one row per order, in the order given", () => {
    const rows = buildOrderExportRows(
      [dispatched, { ...dispatched, id: "o2", order_number: "#S1002" }],
      warehouseNames,
    );
    expect(rows.map((r) => r[0])).toEqual(["#S1001", "#S1002"]);
  });

  it("names the file by date, and by warehouse when one is given", () => {
    const date = new Date("2026-08-28T10:00:00Z");
    expect(orderExportFileName(date)).toBe("orders-2026-08-28.xlsx");
    expect(orderExportFileName(date, "Mango Lover")).toBe("orders-mango-lover-2026-08-28.xlsx");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/test/orderExcelExport.test.ts`
Expected: FAIL — cannot resolve `@/lib/orderExcelExport`.

- [ ] **Step 4: Write the builder**

Create `src/lib/orderExcelExport.ts`:

```ts
// Pure row shaping for the order .xlsx export, plus a thin download wrapper.
// The builder is pure so it can be unit-tested; only `downloadOrderExcel`
// touches exceljs and the DOM.

export type ExportableOrder = {
  id: string;
  order_number?: string | null;
  customer_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  address?: string | null;
  product?: string | null;
  items?: Array<{ product?: string | null; quantity?: number | null }> | null;
  quantity?: number | null;
  weight_kg?: number | null;
  price?: number | null;
  total_price?: number | null;
  warehouse_id?: string | null;
  consignment_id?: number | string | null;
};

export const ORDER_EXPORT_COLUMNS = [
  "Order Number",
  "Customer Name",
  "Phone",
  "Address",
  "Product",
  "Quantity",
  "Weight (kg)",
  "COD Amount",
  "Warehouse",
  "Steadfast ID",
] as const;

const COLUMN_WIDTHS = [14, 22, 14, 40, 34, 10, 12, 14, 18, 16];

function itemsSummary(items: ExportableOrder["items"]): string {
  return (items || [])
    .map((i) => `${i.product ?? ""}${i.quantity ? ` x${i.quantity}` : ""}`.trim())
    .filter(Boolean)
    .join(", ");
}

function itemsQuantity(items: ExportableOrder["items"]): number {
  return (items || []).reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
}
```

Continue in the same file:

```ts
export function buildOrderExportRows(
  orders: ExportableOrder[],
  warehouseNames: Record<string, string>,
  options: { inbox?: boolean } = {},
): Array<Array<string | number | null>> {
  return (orders || []).map((order) => {
    const orderNumber = options.inbox
      ? `IO-${order.id}`
      : order.order_number ?? "";
    const name = options.inbox
      ? order.contact_name ?? order.customer_name ?? ""
      : order.customer_name ?? order.contact_name ?? "";
    const product = options.inbox
      ? itemsSummary(order.items)
      : order.product ?? itemsSummary(order.items);
    const quantity = options.inbox
      ? itemsQuantity(order.items) || ""
      : order.quantity ?? itemsQuantity(order.items) || "";
    const cod = options.inbox
      ? order.total_price ?? ""
      : order.price ?? order.total_price ?? "";

    return [
      orderNumber,
      name,
      order.phone ?? "",
      order.address ?? "",
      product,
      quantity === null || quantity === undefined ? "" : quantity,
      // A partially known weight is worse than a blank cell on a courier
      // document, so the server writes null and we render nothing.
      order.weight_kg ?? "",
      cod === null || cod === undefined ? "" : cod,
      (order.warehouse_id && warehouseNames[order.warehouse_id]) || "",
      order.consignment_id ?? "",
    ];
  });
}

export function orderExportFileName(date: Date, warehouseName?: string | null): string {
  const day = date.toISOString().slice(0, 10);
  if (!warehouseName) return `orders-${day}.xlsx`;
  const slug = warehouseName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug ? `orders-${slug}-${day}.xlsx` : `orders-${day}.xlsx`;
}
```

- [ ] **Step 5: Write the download wrapper**

Append to `src/lib/orderExcelExport.ts`. `exceljs` is imported dynamically so it is code-split
out of the initial bundle and never loaded unless someone exports.

```ts
export async function downloadOrderExcel(
  orders: ExportableOrder[],
  warehouseNames: Record<string, string>,
  options: { inbox?: boolean; warehouseName?: string | null } = {},
): Promise<void> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Orders");

  sheet.addRow([...ORDER_EXPORT_COLUMNS]);
  sheet.getRow(1).font = { bold: true };
  sheet.columns = COLUMN_WIDTHS.map((width) => ({ width }));

  for (const row of buildOrderExportRows(orders, warehouseNames, { inbox: options.inbox })) {
    sheet.addRow(row);
  }

  // Weight (col 7) and COD (col 8) as numbers, not text.
  sheet.getColumn(7).numFmt = "0.000";
  sheet.getColumn(8).numFmt = "#,##0.00";

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = orderExportFileName(new Date(), options.warehouseName ?? null);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
```

Setting `sheet.columns` after `addRow` replaces only the widths, not the data. If the installed
`exceljs` clears the header row when `columns` is assigned, move the `sheet.columns = ...`
assignment above the `sheet.addRow([...ORDER_EXPORT_COLUMNS])` call and re-run the test.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/test/orderExcelExport.test.ts`
Expected: PASS — all 7 cases.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/orderExcelExport.ts src/test/orderExcelExport.test.ts
git commit -m "feat: add the order xlsx export row builder"
```

---

### Task 11: Orders table — warehouse column, inline override, Excel button

`OrdersTable` is purely presentational (`orders`, `loading`, `onStatusUpdate`, `onOrderUpdate`;
no fetching of its own), which is why the warehouse detail page in Task 13 can embed it unchanged.
Keep it that way: the warehouse list comes from the `useWarehouses` hook, and the override
PATCHes through `apiFetch` then calls the existing `onOrderUpdate` callback.

**Files:**
- Modify: `src/components/OrdersTable.tsx` — `Order` type, warehouse column, inline override, Excel button in the selection bar
- Test: `src/test/ordersTableWarehouse.test.ts`

**Interfaces:**
- Consumes: `useWarehouses` (Task 8); `downloadOrderExcel` (Task 10); `PATCH /api/orders/:id` accepting `warehouse_id` (Task 6)
- Produces: `Order` gains `warehouse_id?: string | null`, `warehouse_auto?: boolean | null`, `weight_kg?: number | null`. `OrdersTableProps` is unchanged, so existing call sites keep compiling.

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/components/OrdersTable.tsx"), "utf8");

describe("orders table warehouse support", () => {
  it("carries the new order fields on the Order type", () => {
    expect(source).toContain("warehouse_id?: string | null");
    expect(source).toContain("warehouse_auto?: boolean | null");
    expect(source).toContain("weight_kg?: number | null");
  });

  it("renders a warehouse cell with an inline override", () => {
    expect(source).toContain("useWarehouses");
    expect(source).toContain("handleWarehouseChange");
    expect(source).toContain('data-testid="select-order-warehouse-');
  });

  it("marks auto-routed warehouses as guessed", () => {
    expect(source).toContain("warehouse_auto");
    expect(source).toContain("Auto");
  });

  it("adds an Excel button to the selection bar beside Print", () => {
    expect(source).toContain('data-testid="button-export-excel"');
    expect(source).toContain("downloadOrderExcel");
    expect(source).toContain("handleExportExcel");
  });

  it("keeps the component free of its own order fetching", () => {
    expect(source).not.toContain('apiFetch("/api/orders")');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/ordersTableWarehouse.test.ts`
Expected: FAIL — `warehouse_id?: string | null` not found.

- [ ] **Step 3: Extend the `Order` type and add the imports**

Add to `interface Order`, after `fulfillment_status?: string | null;`:

```tsx
  warehouse_id?: string | null;
  warehouse_auto?: boolean | null;
  weight_kg?: number | null;
```

Add the imports:

```tsx
import { useWarehouses } from "@/hooks/useWarehouses";
import { downloadOrderExcel } from "@/lib/orderExcelExport";
import { Select as BuiSelect, SelectItem as BuiSelectItem } from "@/components/base/select/select";
import { Table as TableIcon } from "lucide-react";
```

- [ ] **Step 4: Add the warehouse cell and the override handler**

Inside `OrdersTable`, beside the other hooks:

```tsx
  const { warehouses } = useWarehouses();
  const warehouseNames = useMemo(
    () => Object.fromEntries(warehouses.map((w) => [w.id, w.name])),
    [warehouses],
  );

  const handleWarehouseChange = async (order: Order, warehouseId: string | null) => {
    try {
      const res = await apiFetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ warehouse_id: warehouseId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to change warehouse");
      onOrderUpdate?.(json.order);
      toast.success("Warehouse updated");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to change warehouse");
    }
  };
```

Add the header between `Items` and `Total`:

```tsx
            <TableHead className="text-[10px] font-bold uppercase tracking-[0.15em] text-black py-3 h-auto text-center">Warehouse</TableHead>
```

and the matching cell in the row body, in the same position (immediately before the
`<TableCell>` holding `EditableTotalCell`):

```tsx
                  <TableCell className="text-center py-3">
                    <div className="mx-auto flex w-[160px] flex-col items-stretch gap-0.5">
                      <BuiSelect
                        aria-label={`Warehouse for ${order.order_number}`}
                        data-testid={`select-order-warehouse-${order.id}`}
                        triggerClassName="h-8"
                        selectedKey={order.warehouse_id ?? "default"}
                        onSelectionChange={(k) => handleWarehouseChange(order, k === "default" ? null : String(k))}
                      >
                        <BuiSelectItem id="default" textValue="Unassigned">Unassigned</BuiSelectItem>
                        {warehouses.map((w) => (
                          <BuiSelectItem key={w.id} id={w.id} textValue={w.name}>{w.name}</BuiSelectItem>
                        ))}
                      </BuiSelect>
                      {order.warehouse_id && order.warehouse_auto !== false && (
                        <span className="text-[8px] font-medium tracking-[0.3em] text-black/35 uppercase">Auto</span>
                      )}
                    </div>
                  </TableCell>
```

The `Auto` label is what distinguishes a guessed warehouse from one a human set — the PATCH in
Task 6 flips `warehouse_auto` to `false`, so the label disappears once someone touches the row.

If `useMemo` and `toast` are not already imported in this file, add them.

- [ ] **Step 5: Add the Excel button**

Add the handler beside `handlePrintInvoice`:

```tsx
  const handleExportExcel = async () => {
    const selectedOrders = orders.filter((o) => selectedIds.has(o.id));
    if (selectedOrders.length === 0) return;
    try {
      const names = [...new Set(selectedOrders.map((o) => o.warehouse_id).filter(Boolean))];
      await downloadOrderExcel(selectedOrders, warehouseNames, {
        warehouseName: names.length === 1 ? warehouseNames[names[0] as string] : null,
      });
      toast.success(`Exported ${selectedOrders.length} order${selectedOrders.length === 1 ? "" : "s"}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to export");
    }
  };
```

Add the button in the selection bar, directly after the Print button and before the
`<div className="w-px h-4 bg-black/[0.07] mx-1" />` divider:

```tsx
                {/* Excel */}
                <button
                  onClick={handleExportExcel}
                  className="flex items-center gap-1.5 h-8 px-3 text-[9px] font-medium tracking-[0.18em] uppercase text-black hover:text-black hover:bg-black/[0.03] transition-all"
                  data-testid="button-export-excel"
                >
                  <TableIcon className="h-3 w-3" />
                  Excel
                </button>
```

Lucide is used throughout this file already; the file's other icons come from `lucide-react`, so
`TableIcon` matches its neighbours. Rows with no `consignment_id` export with a blank Steadfast
ID cell — selecting undispatched orders is normal and needs no warning.

- [ ] **Step 6: Run the test and the type check**

Run: `npx vitest run src/test/ordersTableWarehouse.test.ts`
Expected: PASS

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/OrdersTable.tsx src/test/ordersTableWarehouse.test.ts
git commit -m "feat: show warehouse on orders and export selected orders to xlsx"
```

---

### Task 12: Warehouses list page, dialog, sidebar entry, route

**Files:**
- Create: `src/components/WarehouseDialog.tsx`
- Create: `src/pages/Warehouses.tsx`
- Modify: `src/App.tsx` — two routes inside `ProtectedRoute` / `DashboardLayout`
- Modify: `src/components/AppSidebar.tsx` — entry after `products` in the first group
- Test: `src/test/warehousePageRouting.test.ts`

**Interfaces:**
- Consumes: `useWarehouses`, `WAREHOUSES_QUERY_KEY`, `Warehouse` (Task 8); the CRUD routes (Task 3)
- Produces:
  ```tsx
  export function WarehouseDialog(props: {
    open: boolean;
    warehouse: Warehouse | null; // null = create
    onClose: () => void;
    onSaved: () => Promise<unknown> | void;
  }): JSX.Element | null;
  export default function Warehouses(): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("warehouses page wiring", () => {
  it("declares both protected routes", () => {
    const app = read("src/App.tsx");
    expect(app).toContain('path="/warehouses"');
    expect(app).toContain('path="/warehouses/:id"');
    expect(app).toContain("Warehouses");
    expect(app).toContain("WarehouseDetail");
  });

  it("adds a sidebar entry after Products using the inline two-tone icon style", () => {
    const sidebar = read("src/components/AppSidebar.tsx");
    expect(sidebar).toContain('id: "warehouses"');
    expect(sidebar).toContain('title: "Warehouses"');
    expect(sidebar).toContain('link: "/warehouses"');
    const products = sidebar.indexOf('id: "products"');
    const warehouses = sidebar.indexOf('id: "warehouses"');
    const customers = sidebar.indexOf('id: "customers"');
    expect(products).toBeLessThan(warehouses);
    expect(warehouses).toBeLessThan(customers);
    const entry = sidebar.slice(warehouses, customers);
    expect(entry).toContain("var(--fillg)");
    expect(entry).toContain("opacity: 0.4");
  });

  it("renders the list page with the shared design treatment", () => {
    const page = read("src/pages/Warehouses.tsx");
    expect(page).toContain("useWarehouses");
    expect(page).toContain("New Warehouse");
    expect(page).toContain("tracking-[0.3em]");
    expect(page).toContain("useReducedMotion");
    expect(page).toContain("Cannot delete the default warehouse");
  });

  it("shares one dialog for create and edit", () => {
    const dialog = read("src/components/WarehouseDialog.tsx");
    expect(dialog).toContain("export function WarehouseDialog");
    expect(dialog).toContain('method: "POST"');
    expect(dialog).toContain('method: "PATCH"');
    expect(dialog).toContain("is_default");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/warehousePageRouting.test.ts`
Expected: FAIL — `path="/warehouses"` not found in `src/App.tsx`.

- [ ] **Step 3: Create the shared create/edit dialog**

Create `src/components/WarehouseDialog.tsx`. It follows the modal shell used by the customer
profile popover in `src/pages/Customers.tsx:159-240` — a Framer Motion backdrop
(`fixed inset-0 z-40 grid place-items-center bg-black/12 px-4 backdrop-blur-[3px]`) with a
`#FAFAF8` panel, `useReducedMotion` respected, Escape and outside-pointer close.

```tsx
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { Input as BuiInput } from "@/components/base/input/input";
import { Checkbox as BuiCheckbox } from "@/components/base/checkbox/checkbox";
import { Button as BuiButton } from "@/components/base/buttons/button";
import { RichButton } from "@/components/ui/rich-button";
import { Spinner } from "@/components/ui/ios-spinner";
import type { Warehouse } from "@/hooks/useWarehouses";

export function WarehouseDialog({
  open,
  warehouse,
  onClose,
  onSaved,
}: {
  open: boolean;
  warehouse: Warehouse | null;
  onClose: () => void;
  onSaved: () => Promise<unknown> | void;
}) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(warehouse?.name || "");
    setAddress(warehouse?.address || "");
    setContactPerson(warehouse?.contact_person || "");
    setPhone(warehouse?.phone || "");
    setIsDefault(Boolean(warehouse?.is_default));
  }, [open, warehouse]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointer = (event: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open, onClose]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Warehouse name is required");
      return;
    }
    setSaving(true);
    try {
      const body = {
        name: trimmed,
        address: address.trim() || null,
        contact_person: contactPerson.trim() || null,
        phone: phone.trim() || null,
        is_default: isDefault,
      };
      const res = warehouse
        ? await apiFetch(`/api/warehouses/${warehouse.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          })
        : await apiFetch("/api/warehouses", {
            method: "POST",
            body: JSON.stringify(body),
          });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not save the warehouse");
      toast.success(warehouse ? "Warehouse updated" : "Warehouse created");
      await onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the warehouse");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="warehouse-dialog-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.24, ease: "easeOut" } }}
          exit={{ opacity: 0, transition: { duration: 0.18, ease: "easeIn" } }}
          className="fixed inset-0 z-40 grid place-items-center bg-black/12 px-4 backdrop-blur-[3px]"
        >
          <motion.div
            ref={panelRef}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: reduce ? 0.16 : 0.26, ease: "easeOut" } }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96, transition: { duration: 0.18, ease: "easeIn" } }}
            style={{ borderRadius: 18 }}
            className="w-[min(92vw,480px)] overflow-hidden border border-black/10 bg-[#FAFAF8] shadow-2xl shadow-black/15"
          >
            <div className="flex items-center justify-between border-b border-black/10 bg-white px-5 py-4">
              <div>
                <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/35">Warehouse</p>
                <h2 className="mt-1 text-[18px] font-bold tracking-tight text-black">
                  {warehouse ? "Edit warehouse" : "New warehouse"}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close warehouse dialog"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-black/35 transition-colors hover:bg-black/[0.04] hover:text-black"
              >
                <X weight="light" size={18} />
              </button>
            </div>

            <div className="grid gap-3 p-5">
              <BuiInput label="Name" value={name} onChange={setName} placeholder="Mango Lover" isRequired />
              <BuiInput label="Address" value={address} onChange={setAddress} placeholder="Street, city" />
              <BuiInput label="Contact person" value={contactPerson} onChange={setContactPerson} />
              <BuiInput label="Phone" value={phone} onChange={setPhone} placeholder="01XXXXXXXXX" />
              <BuiCheckbox
                label="Default warehouse"
                hint="Orders whose products have no warehouse route here."
                isSelected={isDefault}
                isDisabled={Boolean(warehouse?.is_default)}
                onChange={setIsDefault}
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-black/10 bg-white px-5 py-4">
              <BuiButton color="secondary" size="sm" onClick={onClose} isDisabled={saving}>
                Cancel
              </BuiButton>
              <RichButton
                type="button"
                onClick={submit}
                disabled={saving}
                className="h-9 rounded-[10px] bg-black px-4 text-xs text-white hover:bg-black"
              >
                {saving ? <Spinner className="text-white/70" /> : null}
                {warehouse ? "Save changes" : "Create warehouse"}
              </RichButton>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
```

Note on `BuiInput` / `BuiCheckbox`: these are React Aria wrappers, so `onChange` receives the
value (a `string` / `boolean`), not an event — see their use in `src/pages/ProductEdit.tsx`.
The default checkbox is disabled while editing the warehouse that is already the default,
because unsetting a default without naming a replacement would leave the org with none.

- [ ] **Step 4: Create the Warehouses list page**

Create `src/pages/Warehouses.tsx`. The shell mirrors `src/pages/Customers.tsx` — same heading
treatment, same `Stat` label/value pair, same hairline dividers.

```tsx
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Plus, PencilSimple, Trash } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/ios-spinner";
import { RichButton } from "@/components/ui/rich-button";
import { Button as BuiButton } from "@/components/base/buttons/button";
import { WarehouseDialog } from "@/components/WarehouseDialog";
import { useWarehouses, type Warehouse } from "@/hooks/useWarehouses";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white p-4">
      <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/45">{label}</p>
      <p className="mt-2 text-2xl font-light tabular-nums tracking-[-0.04em] text-black">{value}</p>
    </div>
  );
}

export default function Warehouses() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { warehouses, isLoading, refetch } = useWarehouses();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const totals = useMemo(
    () => ({
      count: warehouses.length,
      assigned: warehouses.reduce((sum, w) => sum + (w.product_count ?? 0), 0),
    }),
    [warehouses],
  );

  async function remove(warehouse: Warehouse) {
    if (warehouse.is_default) {
      toast.error("Cannot delete the default warehouse");
      return;
    }
    setDeletingId(warehouse.id);
    try {
      const res = await apiFetch(`/api/warehouses/${warehouse.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Could not delete the warehouse");
      toast.success("Warehouse deleted. Its products moved to the default warehouse.");
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the warehouse");
    } finally {
      setDeletingId(null);
    }
  }
```

Same file, continued (the render):

```tsx
  return (
    <div className="min-h-screen bg-[#FAFAF8] px-6 py-6">
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/45">Catalog</p>
            <h1 className="mt-1 font-sf-display text-[22px] font-bold tracking-tight text-black">Warehouses</h1>
            <p className="mt-1 text-[13px] text-black/45">
              Assign products to a warehouse so incoming orders route there automatically.
            </p>
          </div>
          <RichButton
            type="button"
            data-testid="button-new-warehouse"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            className="h-9 rounded-[10px] bg-black px-4 text-xs text-white hover:bg-black"
          >
            <Plus weight="light" size={15} /> New Warehouse
          </RichButton>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Stat label="Warehouses" value={totals.count} />
          <Stat label="Products assigned" value={totals.assigned} />
        </div>
      </motion.div>

      <div className="mt-6 overflow-hidden rounded-xl border border-black/[0.06] bg-white">
        {isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-black/45">
            <Spinner className="text-black/40" /> Loading warehouses
          </div>
        ) : warehouses.length === 0 ? (
          <div className="p-6 text-sm text-black/45">
            No warehouses yet. Create one to start routing orders.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/[0.06]">
                {["Warehouse", "Address", "Contact Person", "Phone", "Products", ""].map((head) => (
                  <th
                    key={head || "actions"}
                    className="px-4 py-3 text-[8px] font-medium uppercase tracking-[0.3em] text-black/40"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
```

Same file, continued (the rows and the dialog mount):

```tsx
            <tbody>
              {warehouses.map((warehouse) => (
                <tr
                  key={warehouse.id}
                  onClick={() => navigate(`/warehouses/${warehouse.id}`)}
                  className="cursor-pointer border-b border-black/[0.06] last:border-b-0 transition-colors hover:bg-black/[0.02]"
                >
                  <td className="px-4 py-3">
                    <span className="font-medium text-black">{warehouse.name}</span>
                    {warehouse.is_default ? (
                      <span className="ml-2 rounded-full bg-black px-2 py-0.5 text-[10px] font-medium text-white">
                        Default
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-black/55">{warehouse.address || "—"}</td>
                  <td className="px-4 py-3 text-black/55">{warehouse.contact_person || "—"}</td>
                  <td className="px-4 py-3 text-black/55">{warehouse.phone || "—"}</td>
                  <td className="px-4 py-3 tabular-nums text-black/70">{warehouse.product_count ?? 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                      <BuiButton
                        color="tertiary"
                        size="sm"
                        aria-label={`Edit ${warehouse.name}`}
                        onClick={() => {
                          setEditing(warehouse);
                          setDialogOpen(true);
                        }}
                      >
                        <PencilSimple weight="light" size={15} />
                      </BuiButton>
                      <BuiButton
                        color="tertiary"
                        size="sm"
                        aria-label={`Delete ${warehouse.name}`}
                        isDisabled={deletingId === warehouse.id}
                        onClick={() => remove(warehouse)}
                      >
                        <Trash weight="light" size={15} />
                      </BuiButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <WarehouseDialog
        open={dialogOpen}
        warehouse={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={refetch}
      />
    </div>
  );
}
```

- [ ] **Step 5: Declare both routes**

In `src/App.tsx`, add the imports beside the other page imports (`src/App.tsx:12` is `Products`):

```tsx
import Warehouses from "./pages/Warehouses";
import WarehouseDetail from "./pages/WarehouseDetail";
```

Then, directly after `<Route path="/products/:id/edit" element={<ProductEdit />} />`
(`src/App.tsx:102`), inside the same `ProtectedRoute` / `DashboardLayout` block:

```tsx
      <Route path="/warehouses" element={<Warehouses />} />
      <Route path="/warehouses/:id" element={<WarehouseDetail />} />
```

`src/pages/WarehouseDetail.tsx` is created in Task 13. To keep this task independently
verifiable, create it now as a placeholder that Task 13 replaces wholesale:

```tsx
export default function WarehouseDetail() {
  return null;
}
```

- [ ] **Step 6: Add the sidebar entry**

In `src/components/AppSidebar.tsx`, insert this object between the `products` entry
(`src/components/AppSidebar.tsx:70-74`) and the `customers` entry. The icon is an inline
two-tone SVG in exactly the same construction as its neighbours — `className={iconCls}`,
a primary path with `style={{fill: 'var(--fillg)'}}`, and a secondary path with
`style={{fill: 'var(--fillg)', opacity: 0.4}}`. Do **not** use a Phosphor icon here; the
sidebar is the one documented exception to the Phosphor rule.

```tsx
                {
                    id: "warehouses",
                    title: "Warehouses",
                    icon: <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" className={iconCls}><path fill="currentColor" style={{fill: 'var(--fillg)', opacity: 0.4}} d="M11.24 2.152a2 2 0 0 1 1.52 0l8 3.333A2 2 0 0 1 22 7.33V20a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7.33a2 2 0 0 1 1.24-1.845z"/><path fill="currentColor" style={{fill: 'var(--fillg)'}} d="M8 12a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v9H8zm2 1v2h4v-2z"/></svg>,
                    link: "/warehouses",
                },
```

- [ ] **Step 7: Run the test and the type-check**

Run: `npx vitest run src/test/warehousePageRouting.test.ts`
Expected: PASS (4 tests).

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/pages/Warehouses.tsx src/pages/WarehouseDetail.tsx \
  src/components/WarehouseDialog.tsx src/App.tsx src/components/AppSidebar.tsx \
  src/test/warehousePageRouting.test.ts
git commit -m "feat: add warehouses page, sidebar entry, and create/edit dialog"
```

---

### Task 13: Warehouse detail page with embedded orders table

**Files:**
- Replace: `src/pages/WarehouseDetail.tsx` (the placeholder from Task 12)
- Modify: `src/components/OrdersTable.tsx` — export the `Order` type
- Test: `src/test/warehouseDetailPage.test.ts`

**Interfaces:**
- Consumes: `GET /api/warehouses/:id` (Task 4), `POST /api/products/bulk-assign-warehouse`
  (Task 4), `GET /api/orders?warehouse_id=:id` (Task 6), `WarehouseDialog` (Task 12),
  `useWarehouses` (Task 8), `OrdersTable` with its existing props (Task 11)
- Produces: `export default function WarehouseDetail(): JSX.Element` and
  `export interface Order` from `src/components/OrdersTable.tsx`

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("warehouse detail page", () => {
  const page = read("src/pages/WarehouseDetail.tsx");

  it("loads the warehouse and its orders from the scoped endpoints", () => {
    expect(page).toContain("/api/warehouses/${id}");
    expect(page).toContain("/api/orders?warehouse_id=");
    expect(page).not.toContain("org_id");
  });

  it("embeds the real orders table rather than a reimplementation", () => {
    expect(page).toContain('import { OrdersTable');
    expect(page).toContain("<OrdersTable");
    expect(page).toContain("onStatusUpdate=");
    expect(page).toContain("onOrderUpdate=");
  });

  it("shows the three summary figures with the shared treatment", () => {
    expect(page).toContain("tracking-[0.3em]");
    expect(page).toContain("Products assigned");
    expect(page).toContain("Units in stock");
    expect(page).toContain("Published");
  });

  it("marks products with no weight and distinguishes default-warehouse fallbacks", () => {
    expect(page).toContain("assigned_explicitly");
    expect(page).toContain("No weight");
  });

  it("assigns and removes products through the bulk endpoint", () => {
    expect(page).toContain("/api/products/bulk-assign-warehouse");
    expect(page).toContain("assign([product.id], null)");
  });

  it("reuses the shared edit dialog", () => {
    expect(page).toContain("WarehouseDialog");
  });

  it("exports the Order type from OrdersTable", () => {
    expect(read("src/components/OrdersTable.tsx")).toContain("export interface Order");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/warehouseDetailPage.test.ts`
Expected: FAIL — the placeholder page contains none of these strings.

- [ ] **Step 3: Export the `Order` type**

In `src/components/OrdersTable.tsx`, change line 124 from `interface Order {` to
`export interface Order {`. Nothing else changes; `src/pages/Dashboard.tsx` keeps its own
structurally-compatible local copy.

- [ ] **Step 4: Write the page's data layer**

Replace `src/pages/WarehouseDetail.tsx` entirely. First the imports, types, and queries:

```tsx
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, PencilSimple, Plus, X } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import { Spinner } from "@/components/ui/ios-spinner";
import { RichButton } from "@/components/ui/rich-button";
import { Button as BuiButton } from "@/components/base/buttons/button";
import { OrdersTable, type Order } from "@/components/OrdersTable";
import { WarehouseDialog } from "@/components/WarehouseDialog";
import { WAREHOUSES_QUERY_KEY, type Warehouse } from "@/hooks/useWarehouses";

type WarehouseProduct = {
  id: string;
  name: string;
  selling_price: number | null;
  stock_quantity: number | null;
  weight_kg: number | null;
  published: boolean;
  assigned_explicitly: boolean;
};

type WarehouseDetailResponse = {
  warehouse: Warehouse;
  summary: { product_count: number; total_stock: number; published_count: number };
  products: WarehouseProduct[];
};

const money = (value: number | null) => (value == null ? "—" : `৳${Number(value).toLocaleString("en-BD")}`);
const weight = (value: number | null) => (value == null ? null : `${Number(value).toFixed(3)} kg`);

export default function WarehouseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busyProductId, setBusyProductId] = useState<string | null>(null);

  const detailKey = ["/api/warehouses", id] as const;

  const detail = useQuery<WarehouseDetailResponse>({
    queryKey: detailKey,
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await apiFetch(`/api/warehouses/${id}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load warehouse");
      return json;
    },
  });

  const ordersQuery = useQuery<{ orders: Order[] }>({
    queryKey: ["/api/orders", "warehouse", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await apiFetch(`/api/orders?warehouse_id=${encodeURIComponent(id!)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load orders");
      return json;
    },
  });

  const [orders, setOrders] = useState<Order[] | null>(null);
  const rows = orders ?? ordersQuery.data?.orders ?? [];
```

`orders` is local state seeded from the query so `OrdersTable`'s optimistic
`onStatusUpdate` / `onOrderUpdate` callbacks have somewhere to write — the same shape
`src/pages/Dashboard.tsx:503-520` uses. It stays `null` until the first callback fires, so a
refetch always wins over stale local state.

- [ ] **Step 5: Add the assign / remove mutations**

Same file, continued:

```tsx
  async function assign(productIds: string[], warehouseId: string | null) {
    const res = await apiFetch("/api/products/bulk-assign-warehouse", {
      method: "POST",
      body: JSON.stringify({ product_ids: productIds, warehouse_id: warehouseId }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || "Could not update the products");
    await Promise.all([
      qc.invalidateQueries({ queryKey: detailKey }),
      qc.invalidateQueries({ queryKey: ["/api/products"] }),
      qc.invalidateQueries({ queryKey: [WAREHOUSES_QUERY_KEY] }),
    ]);
  }

  async function removeProduct(product: WarehouseProduct) {
    setBusyProductId(product.id);
    try {
      await assign([product.id], null);
      toast.success(`${product.name} moved to the default warehouse`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the product");
    } finally {
      setBusyProductId(null);
    }
  }

  async function addProducts(productIds: string[]) {
    if (!id || productIds.length === 0) return;
    try {
      await assign(productIds, id);
      toast.success(`${productIds.length} product(s) assigned`);
      setPickerOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not assign the products");
    }
  }

  const warehouse = detail.data?.warehouse;
  const summary = detail.data?.summary;
  const products = detail.data?.products ?? [];
  const missingWeight = useMemo(
    () => products.filter((p) => p.weight_kg == null).length,
    [products],
  );
```

Note: `removeProduct` sends `warehouse_id: null`, which returns the product to the default
warehouse rather than leaving it unassigned in a way that breaks routing. On the default
warehouse's own page the row action is hidden, because there is nowhere to move to.

- [ ] **Step 6: Render the header and summary figures**

Same file, continued:

```tsx
  if (detail.isLoading) {
    return (
      <div className="flex min-h-screen items-center gap-2 bg-[#FAFAF8] p-6 text-sm text-black/45">
        <Spinner className="text-black/40" /> Loading warehouse
      </div>
    );
  }

  if (!warehouse) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] p-6 text-sm text-black/45">
        Warehouse not found.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] px-6 py-6">
      <BuiButton color="tertiary" size="sm" onClick={() => navigate("/warehouses")}>
        <ArrowLeft weight="light" size={15} /> Warehouses
      </BuiButton>

      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className="mt-4"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/45">Warehouse</p>
            <h1 className="mt-1 font-sf-display text-[22px] font-bold tracking-tight text-black">
              {warehouse.name}
              {warehouse.is_default ? (
                <span className="ml-2 align-middle rounded-full bg-black px-2 py-0.5 text-[10px] font-medium text-white">
                  Default
                </span>
              ) : null}
            </h1>
            <p className="mt-1 text-[13px] text-black/45">
              {[warehouse.address, warehouse.contact_person, warehouse.phone].filter(Boolean).join(" · ") ||
                "No address or contact set"}
            </p>
          </div>
          <BuiButton color="secondary" size="sm" onClick={() => setDialogOpen(true)}>
            <PencilSimple weight="light" size={15} /> Edit details
          </BuiButton>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Stat label="Products assigned" value={summary?.product_count ?? 0} />
          <Stat label="Units in stock" value={summary?.total_stock ?? 0} />
          <Stat label="Published" value={summary?.published_count ?? 0} />
        </div>
      </motion.div>
```

`Stat` is the same helper written in Task 12. Copy it into this file rather than importing it
across pages — it is four lines and the two pages are free to drift.

- [ ] **Step 7: Render the products section**

Same file, continued:

```tsx
      <div className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/45">Products</p>
            <p className="mt-1 text-[13px] text-black/45">
              {missingWeight > 0
                ? `${missingWeight} product(s) have no weight — their orders export with a blank weight.`
                : "Every product here has a weight set."}
            </p>
          </div>
          <RichButton
            type="button"
            data-testid="button-add-products"
            onClick={() => setPickerOpen(true)}
            className="h-9 rounded-[10px] bg-black px-4 text-xs text-white hover:bg-black"
          >
            <Plus weight="light" size={15} /> Add products
          </RichButton>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-black/[0.06] bg-white">
          {products.length === 0 ? (
            <div className="p-6 text-sm text-black/45">No products assigned to this warehouse yet.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/[0.06]">
                  {["Product", "Price", "Stock", "Weight", "Status", ""].map((head) => (
                    <th key={head || "actions"} className="px-4 py-3 text-[8px] font-medium uppercase tracking-[0.3em] text-black/40">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b border-black/[0.06] last:border-b-0">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => navigate(`/products/${product.id}/edit`)}
                        className="font-medium text-black hover:underline"
                      >
                        {product.name}
                      </button>
                      {product.assigned_explicitly ? null : (
                        <span className="ml-2 rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] font-medium text-black/45">
                          Unassigned · routes here
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-black/70">{money(product.selling_price)}</td>
                    <td className="px-4 py-3 tabular-nums text-black/70">{product.stock_quantity ?? 0}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {weight(product.weight_kg) ?? (
                        <span className="rounded-full bg-[#FDECEC] px-2 py-0.5 text-[10px] font-medium text-[#B42318]">
                          No weight
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-black/55">{product.published ? "Published" : "Draft"}</td>
                    <td className="px-4 py-3 text-right">
                      {warehouse.is_default || !product.assigned_explicitly ? null : (
                        <BuiButton
                          color="tertiary"
                          size="sm"
                          aria-label={`Remove ${product.name} from ${warehouse.name}`}
                          isDisabled={busyProductId === product.id}
                          onClick={() => removeProduct(product)}
                        >
                          <X weight="light" size={15} />
                        </BuiButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
```

- [ ] **Step 8: Render the orders section and close the component**

Same file, continued:

```tsx
      <div className="mt-10">
        <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/45">Orders</p>
        <h2 className="mt-1 font-sf-display text-[16px] font-bold tracking-tight text-black">
          Orders routed to {warehouse.name}
        </h2>
        <p className="mt-1 text-[13px] text-black/45">
          Selection actions — fraud check, Invoice, Print, Excel, status and courier dispatch —
          behave exactly as they do on the dashboard.
        </p>
        <div className="mt-4">
          <OrdersTable
            orders={rows}
            loading={ordersQuery.isLoading}
            onStatusUpdate={(orderId, newStatus) =>
              setOrders((prev) =>
                (prev ?? ordersQuery.data?.orders ?? []).map((o) =>
                  o.id === orderId ? { ...o, status: newStatus } : o,
                ),
              )
            }
            onOrderUpdate={(updated) =>
              setOrders((prev) =>
                (prev ?? ordersQuery.data?.orders ?? []).map((o) => (o.id === updated.id ? updated : o)),
              )
            }
          />
        </div>
      </div>

      <WarehouseDialog
        open={dialogOpen}
        warehouse={warehouse}
        onClose={() => setDialogOpen(false)}
        onSaved={async () => {
          await Promise.all([
            qc.invalidateQueries({ queryKey: detailKey }),
            qc.invalidateQueries({ queryKey: [WAREHOUSES_QUERY_KEY] }),
          ]);
        }}
      />

      <ProductPicker
        open={pickerOpen}
        excludeIds={products.filter((p) => p.assigned_explicitly).map((p) => p.id)}
        onClose={() => setPickerOpen(false)}
        onConfirm={addProducts}
      />
    </div>
  );
}
```

Known and accepted: if staff use the inline warehouse override in the embedded table to move
an order elsewhere, that row disappears on the next refetch, and the table's Warehouse column
is redundant here. Neither is worth a conditional prop.

- [ ] **Step 9: Add the product picker**

Still in `src/pages/WarehouseDetail.tsx`, above `export default function WarehouseDetail`.
It reuses the same modal shell as `WarehouseDialog` and the existing `/api/products` query
shape (`ProductsResponse` in `src/pages/products/shared.tsx:50`).

```tsx
import { AnimatePresence } from "framer-motion";
import { type ProductsResponse } from "./products/shared";

function ProductPicker({
  open,
  excludeIds,
  onClose,
  onConfirm,
}: {
  open: boolean;
  excludeIds: string[];
  onClose: () => void;
  onConfirm: (productIds: string[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { data, isLoading } = useQuery<ProductsResponse>({
    queryKey: ["/api/products"],
    enabled: open,
    queryFn: async () => {
      const res = await apiFetch("/api/products");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load products");
      return json;
    },
  });

  const options = (data?.products ?? []).filter((p) => !excludeIds.includes(p.id));

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 grid place-items-center bg-black/12 px-4 backdrop-blur-[3px]"
        >
          <div
            style={{ borderRadius: 18 }}
            className="max-h-[80vh] w-[min(92vw,520px)] overflow-hidden border border-black/10 bg-[#FAFAF8] shadow-2xl shadow-black/15"
          >
            <div className="flex items-center justify-between border-b border-black/10 bg-white px-5 py-4">
              <h2 className="text-[16px] font-bold tracking-tight text-black">Add products</h2>
              <button type="button" onClick={onClose} aria-label="Close product picker" className="text-black/35 hover:text-black">
                <X weight="light" size={18} />
              </button>
            </div>
            <div className="max-h-[54vh] overflow-y-auto p-3">
              {isLoading ? (
                <div className="flex items-center gap-2 p-3 text-sm text-black/45">
                  <Spinner className="text-black/40" /> Loading products
                </div>
              ) : options.length === 0 ? (
                <div className="p-3 text-sm text-black/45">Every product is already assigned here.</div>
              ) : (
                options.map((product) => (
                  <label key={product.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-black/[0.03]">
                    <input
                      type="checkbox"
                      checked={selected.includes(product.id)}
                      onChange={(event) =>
                        setSelected((prev) =>
                          event.target.checked ? [...prev, product.id] : prev.filter((x) => x !== product.id),
                        )
                      }
                    />
                    <span className="text-sm text-black">{product.name}</span>
                  </label>
                ))
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-black/10 bg-white px-5 py-4">
              <BuiButton color="secondary" size="sm" onClick={onClose} isDisabled={saving}>Cancel</BuiButton>
              <RichButton
                type="button"
                disabled={saving || selected.length === 0}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onConfirm(selected);
                    setSelected([]);
                  } finally {
                    setSaving(false);
                  }
                }}
                className="h-9 rounded-[10px] bg-black px-4 text-xs text-white hover:bg-black"
              >
                Assign {selected.length || ""}
              </RichButton>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
```

- [ ] **Step 10: Run the test and the type-check**

Run: `npx vitest run src/test/warehouseDetailPage.test.ts`
Expected: PASS (7 tests).

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 11: Commit**

```bash
git add src/pages/WarehouseDetail.tsx src/components/OrdersTable.tsx \
  src/test/warehouseDetailPage.test.ts
git commit -m "feat: add warehouse detail page with products and embedded orders table"
```

---

### Task 14: Dashboard warehouse filter

The spec calls for "a warehouse filter control alongside the existing filters". Those filters
live in `src/pages/Dashboard.tsx`, not in `OrdersTable` — the table owns no filtering. The
dashboard already holds every order in state and filters client-side (`filteredOrders`,
`src/pages/Dashboard.tsx:522-531`), so the warehouse filter joins that memo rather than
refetching.

**Files:**
- Modify: `src/pages/Dashboard.tsx` — local `Order` type, `warehouseFilter` state, the
  `filteredOrders` memo, and a `Select` in the orders header row
- Test: `src/test/dashboardWarehouseFilter.test.ts`

**Interfaces:**
- Consumes: `useWarehouses` (Task 8), `orders[].warehouse_id` (Task 5)
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dashboard warehouse filter", () => {
  const source = readFileSync(resolve(process.cwd(), "src/pages/Dashboard.tsx"), "utf8");

  it("adds a warehouse filter to the client-side order filter", () => {
    expect(source).toContain("useWarehouses");
    expect(source).toContain("warehouseFilter");
    expect(source).toContain("warehouse_id");
    expect(source).toContain('data-testid="select-warehouse-filter"');
  });

  it("keeps the filter in the same memo as search so the count stays correct", () => {
    const memo = source.slice(source.indexOf("const filteredOrders"), source.indexOf("const orderTotalPages"));
    expect(memo).toContain("warehouseFilter");
    expect(memo).toContain("debouncedSearch");
  });

  it("resets pagination when the filter changes", () => {
    expect(source).toContain("setOrderPage(0)");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/dashboardWarehouseFilter.test.ts`
Expected: FAIL — `useWarehouses` not found in `src/pages/Dashboard.tsx`.

- [ ] **Step 3: Extend the local `Order` type and add state**

In `src/pages/Dashboard.tsx`, add to the local `interface Order` (line 91) so the filter and
the table's new column type-check against the same shape:

```tsx
  warehouse_id?: string | null;
  warehouse_auto?: boolean | null;
  weight_kg?: number | null;
```

Add the imports beside the existing ones:

```tsx
import { useWarehouses } from "@/hooks/useWarehouses";
import { Select, SelectItem } from "@/components/base/select/select";
```

And the state, next to the other order-list state:

```tsx
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const { warehouses } = useWarehouses();
```

- [ ] **Step 4: Fold the filter into `filteredOrders`**

Replace the memo at `src/pages/Dashboard.tsx:522-531` with:

```tsx
  const filteredOrders = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return orders.filter((o) => {
      if (warehouseFilter !== "all" && o.warehouse_id !== warehouseFilter) return false;
      if (!q) return true;
      return (
        o.order_number.toLowerCase().includes(q) ||
        (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
        (o.phone && o.phone.toLowerCase().includes(q))
      );
    });
  }, [orders, debouncedSearch, warehouseFilter]);
```

`orderTotalPages` and `visibleOrders` already derive from `filteredOrders`, so the count in the
header (`src/pages/Dashboard.tsx:849`) and the pager follow automatically.

- [ ] **Step 5: Add the control to the orders header row**

In the actions cluster at `src/pages/Dashboard.tsx:854`, directly after the search input's
wrapping `<div className="relative">…</div>` and before the `w-px h-4 bg-black/10` divider:

```tsx
            <Select
              aria-label="Filter orders by warehouse"
              data-testid="select-warehouse-filter"
              selectedKey={warehouseFilter}
              onSelectionChange={(key) => {
                setWarehouseFilter(String(key));
                setOrderPage(0);
              }}
              triggerClassName="h-9"
            >
              <SelectItem id="all">All warehouses</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w.id} id={w.id}>{w.name}</SelectItem>
              ))}
            </Select>
```

`setOrderPage(0)` is required: without it, filtering down to a warehouse with fewer pages than
the current page would leave the table on an out-of-range page until the user clicked the pager.

- [ ] **Step 6: Run the test and the type-check**

Run: `npx vitest run src/test/dashboardWarehouseFilter.test.ts`
Expected: PASS (3 tests).

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Dashboard.tsx src/test/dashboardWarehouseFilter.test.ts
git commit -m "feat: filter dashboard orders by warehouse"
```

---

### Task 15: Inbox variant capture and the dispatch guard

**Files:**
- Create: `server/variantMatching.js`
- Modify: `server/index.js` — `getMetaReplyProductContext` (6613), `fieldsToExtract` (7575),
  `mergeFields` (7601), `extractNewFields` (7610), `saveMetaInboxOrder` (7115)
- Modify: `src/pages/InboxOrders.tsx` — `InboxOrder["items"]` type (38), a variant dropdown per
  line, and the dispatch guard in `handleSendToCourier` (565) and `handleSendToPathao` (597)
- Test: `src/test/inboxVariantCapture.test.ts`

**Interfaces:**
- Consumes: `product_variants.weight_kg` (Task 1), `items[].variant_id` (Task 5)
- Produces:
  ```js
  // server/variantMatching.js
  export function variantLabel(attributes);            // {size:"1kg"} -> "size: 1kg"
  export function matchVariantId({ label, variants }); // null when no confident match
  export function productNeedsVariant({ item, variantsByProductName });
  ```

**Reviewed scope correction (2026-09-04).** `POST /api/inbox-orders/send-to-courier` and
`POST /api/inbox-orders/send-to-pathao` are called from `src/pages/InboxOrders.tsx:568` and
`:600` and documented in `CLAUDE.md` §6, but neither route exists in `server/index.js` on this
branch. Restoring both routes is now part of this task. Each route must authenticate, resolve and
filter by the fixed workspace `org_id`, normalize the destination phone with `normalizeBdPhone()`,
validate the stored product/variant and weight data, call the existing Steadfast or Pathao helper,
and persist the courier response on the same inbox order. Missing variants are rejected on the
server. The client guard remains for immediate feedback, but it is not the security boundary.

- [ ] **Step 1: Write the failing test for the matcher**

```ts
import { describe, expect, it } from "vitest";
import { variantLabel, matchVariantId, productNeedsVariant } from "../../server/variantMatching.js";

describe("variantLabel", () => {
  it("renders attributes as a readable label", () => {
    expect(variantLabel({ size: "1kg" })).toBe("size: 1kg");
    expect(variantLabel({ size: "1kg", grade: "A" })).toBe("size: 1kg, grade: A");
  });

  it("returns an empty string for no attributes", () => {
    expect(variantLabel({})).toBe("");
    expect(variantLabel(null)).toBe("");
  });
});

describe("matchVariantId", () => {
  const variants = [
    { id: "v1", attributes: { size: "1kg" } },
    { id: "v2", attributes: { size: "5kg" } },
  ];

  it("matches an exact label", () => {
    expect(matchVariantId({ label: "size: 5kg", variants })).toBe("v2");
  });

  it("matches case- and space-insensitively", () => {
    expect(matchVariantId({ label: "SIZE:1KG", variants })).toBe("v1");
  });

  it("matches a bare attribute value", () => {
    expect(matchVariantId({ label: "5kg", variants })).toBe("v2");
  });

  it("never invents a variant", () => {
    expect(matchVariantId({ label: "10kg", variants })).toBeNull();
    expect(matchVariantId({ label: "", variants })).toBeNull();
    expect(matchVariantId({ label: "1kg", variants: [] })).toBeNull();
  });

  it("refuses an ambiguous partial match", () => {
    const ambiguous = [
      { id: "a", attributes: { size: "1kg", grade: "A" } },
      { id: "b", attributes: { size: "1kg", grade: "B" } },
    ];
    expect(matchVariantId({ label: "1kg", variants: ambiguous })).toBeNull();
  });
});

describe("productNeedsVariant", () => {
  const map = { "amrapali": [{ id: "v1", attributes: { size: "1kg" } }], "gift box": [] };

  it("flags a line whose product has variants but no variant chosen", () => {
    expect(productNeedsVariant({ item: { product: "Amrapali" }, variantsByProductName: map })).toBe(true);
  });

  it("passes a line that already has a variant", () => {
    expect(productNeedsVariant({ item: { product: "Amrapali", variant_id: "v1" }, variantsByProductName: map })).toBe(false);
  });

  it("passes a product with no variants at all", () => {
    expect(productNeedsVariant({ item: { product: "Gift Box" }, variantsByProductName: map })).toBe(false);
  });

  it("passes an unknown product rather than blocking dispatch on a typo", () => {
    expect(productNeedsVariant({ item: { product: "Mystery" }, variantsByProductName: map })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/test/inboxVariantCapture.test.ts`
Expected: FAIL — cannot resolve `../../server/variantMatching.js`.

- [ ] **Step 3: Write the matcher**

Create `server/variantMatching.js`. Pure functions, no Supabase, no I/O — same shape as
`server/warehouseRouting.js` from Task 2 so Vitest can import it directly.

```js
// Pure variant-label matching. No I/O, so src/test can import this directly.

const norm = (value) => String(value ?? "").toLowerCase().replace(/\s+/g, "");

export function variantLabel(attributes) {
  if (!attributes || typeof attributes !== "object") return "";
  return Object.entries(attributes)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");
}

export function matchVariantId({ label, variants }) {
  const needle = norm(label);
  if (!needle) return null;
  const list = Array.isArray(variants) ? variants : [];
  if (list.length === 0) return null;

  const exact = list.filter((v) => norm(variantLabel(v.attributes)) === needle);
  if (exact.length === 1) return exact[0].id;

  // A bare attribute value ("5kg") is accepted only when exactly one variant carries it.
  const byValue = list.filter((v) =>
    Object.values(v.attributes || {}).some((value) => norm(value) === needle),
  );
  if (byValue.length === 1) return byValue[0].id;

  return null;
}

export function productNeedsVariant({ item, variantsByProductName }) {
  if (!item) return false;
  if (item.variant_id) return false;
  const key = String(item.product ?? item.product_name ?? "").trim().toLowerCase();
  const variants = (variantsByProductName || {})[key];
  return Array.isArray(variants) && variants.length > 0;
}
```

`matchVariantId` returns `null` on ambiguity by design — a wrong pack size on a courier
handover is worse than a blocked dispatch that a human resolves in one click.

- [ ] **Step 4: Run the matcher test**

Run: `npx vitest run src/test/inboxVariantCapture.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit the matcher**

```bash
git add server/variantMatching.js src/test/inboxVariantCapture.test.ts
git commit -m "feat: add pure variant label matching helpers"
```

- [ ] **Step 6: Write the failing test for the server wiring**

Append to `src/test/inboxVariantCapture.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("server variant capture wiring", () => {
  const server = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

  it("imports the matcher", () => {
    expect(server).toContain('from "./variantMatching.js"');
  });

  it("carries variant ids and labels into the AI product context", () => {
    const fn = server.slice(
      server.indexOf("async function getMetaReplyProductContext"),
      server.indexOf("// ─── Image helpers"),
    );
    expect(fn).toContain('"id, product_id, attributes, stock_quantity, price_adjustment"');
    expect(fn).toContain("id: v.id");
    expect(fn).toContain("label: variantLabel(v.attributes)");
    expect(fn).toContain("id: p.id");
  });

  it("puts variant labels in the extractor catalog and asks for variant_label", () => {
    const fn = server.slice(
      server.indexOf("async function extractNewFields"),
      server.indexOf("async function updateConversationOrderFields"),
    );
    expect(fn).toContain("variants:");
    expect(fn).toContain("variant_label");
    expect(fn).toContain("Never invent a variant");
  });

  it("collects variant_label alongside the other fields", () => {
    expect(server).toContain('"unit_price", "confirmed_total", "variant_label"');
    expect(server).toContain('missing(["unit_price", "quantity", "product_name", "variant_label"])');
  });

  it("resolves the label to a real variant id on save and never invents one", () => {
    const fn = server.slice(
      server.indexOf("async function saveMetaInboxOrder"),
      server.indexOf("// ─── Platform send helpers"),
    );
    expect(fn).toContain("matchVariantId");
    expect(fn).toContain("variant_id:");
    expect(fn).toContain('.eq("org_id", orgId)');
  });

  it("does not make a variant a condition of saving the order", () => {
    const fn = server.slice(
      server.indexOf("function isOrderComplete"),
      server.indexOf("async function extractNewFields"),
    );
    expect(fn).not.toContain("variant");
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/test/inboxVariantCapture.test.ts`
Expected: FAIL — `from "./variantMatching.js"` not found in `server/index.js`.

- [ ] **Step 8: Carry variant ids into the AI product context**

In `server/index.js`, add beside the Task 5 import:

```js
import { variantLabel, matchVariantId } from "./variantMatching.js";
```

In `getMetaReplyProductContext` (`server/index.js:6613`), widen the variant select at line 6632
and add the id, product id, and label to the mapped shape at 6643. Also expose the product's own
id at 6650 so the extractor can resolve names back to rows:

```js
      const { data: variantRows } = await supabase
        .from("product_variants")
        .select("id, product_id, attributes, stock_quantity, price_adjustment")
        .in("product_id", rows.map((p) => p.id))
        .eq("org_id", orgId);
```

```js
      const variants = (variantsMap[p.id] || []).map((v) => ({
        id: v.id,
        label: variantLabel(v.attributes),
        attributes: v.attributes,                      // e.g. {color:"Black", size:"M"}
        available: v.stock_quantity > 0,
        price: v.price_adjustment
          ? (p.selling_price != null ? Number(p.selling_price) + Number(v.price_adjustment) : null)
          : (p.selling_price != null ? Number(p.selling_price) : null),
      }));
      return {
        id: p.id,
        name: p.name,
```

The rest of the returned object is unchanged. `runMetaAI`'s own catalog builder
(`server/index.js:6913-6930`) keeps sending only `option` / `available` / `price` to the reply
model — it does not need ids, and leaking them into the reply prompt would only invite the model
to echo one back.

- [ ] **Step 9: Teach the extractor to capture the variant**

In `extractNewFields` (`server/index.js:7610`), replace the catalog line at 7614:

```js
  const catalog = products.slice(0, 50).map((p) => ({
    name: p.name,
    price: p.price,
    variants: (p.variants || []).map((v) => v.label).filter(Boolean),
  }));
```

Add to the `RULES:` block in the system prompt, after the "Do NOT guess" line:

```
- variant_label must be copied verbatim from that product's variants list in the CATALOG.
  Never invent a variant. If the customer did not clearly pick one, return null.
```

Add a `variant_label` hint to `eventHints`, extending the two events where a size is normally
agreed:

```js
    price_stated:      "The agent just quoted a price. Extract unit_price. Also extract product_name, variant_label and quantity if mentioned.",
    order_confirmed:   "The order is being confirmed. Extract confirmed_total if agent stated a total. Extract any remaining missing fields, including variant_label.",
```

In `fieldsToExtract` (`server/index.js:7575`), add `variant_label` to the three product events:

```js
    case "price_stated":      return missing(["unit_price", "quantity", "product_name", "variant_label"]);
    case "order_confirmed":   return missing(["confirmed_total", "customer_name", "phone", "address", "product_name", "quantity", "unit_price", "variant_label"]);
    case "product_mentioned": return missing(["product_name", "quantity", "variant_label"]);
```

In `mergeFields` (`server/index.js:7603`), add the key so a captured label survives the merge:

```js
  for (const key of ["customer_name", "phone", "address", "product_name", "quantity", "unit_price", "confirmed_total", "variant_label"]) {
```

**Do not touch `isOrderComplete`.** A missing variant must not stop the order from being
captured — a captured order with a blank variant is a one-click fix for staff, whereas an order
that was never captured is lost. The dispatch guard is what protects the export.

- [ ] **Step 10: Resolve the label to a real variant id on save**

Task 5 already hoisted `saveMetaInboxOrder`'s items array into a named const carrying
`variant_id`. Replace that const with this block, placed after the `notes` assignment
(`server/index.js:7137`):

```js
  let variantId = null;
  if (order.variant_label) {
    const { data: productRow } = await supabase
      .from("products")
      .select("id")
      .eq("org_id", orgId)
      .ilike("name", order.product_name)
      .maybeSingle();
    if (productRow) {
      const { data: variantRows } = await supabase
        .from("product_variants")
        .select("id, attributes")
        .eq("org_id", orgId)
        .eq("product_id", productRow.id);
      variantId = matchVariantId({ label: order.variant_label, variants: variantRows || [] });
    }
  }

  const items = [{
    product: order.product_name,
    quantity: order.quantity,
    unit_price: order.unit_price,
    variant_id: variantId,
  }];
```

`variantId` stays `null` when the product name does not resolve, when the org has no such
variant, or when the label is ambiguous — the matcher never invents one, and both lookups carry
the `org_id` filter.

Pass the label through from both `processOrderFieldsFromMessage` call sites
(`server/index.js:7689-7694` and `7723-7728`) by adding one line to each `order:` object:

```js
        variant_label: fields.variant_label || null,
```

```js
        variant_label: merged.variant_label || null,
```

The `runMetaAI` path (`server/index.js:7099`) already forwards `orderRaw.items` when the reply
model returned a multi-item order; those items keep whatever the reply model produced and get no
`variant_id`, so the dispatch guard catches them. Do not extend the reply model's contract here —
one extraction path owning variant capture is the point.

- [ ] **Step 11: Run the server-wiring tests**

Run: `npx vitest run src/test/inboxVariantCapture.test.ts`
Expected: PASS (17 tests).

- [ ] **Step 12: Commit the server side**

```bash
git add server/index.js src/test/inboxVariantCapture.test.ts
git commit -m "feat: capture the agreed variant on AI-captured inbox orders"
```

- [ ] **Step 13: Write the failing test for the inbox UI**

Append to `src/test/inboxVariantCapture.test.ts`:

```ts
describe("inbox orders variant UI and dispatch guard", () => {
  const page = readFileSync(resolve(process.cwd(), "src/pages/InboxOrders.tsx"), "utf8");

  it("types variant_id on order items", () => {
    expect(page).toContain("variant_id?: string | null");
  });

  it("loads product variants and offers a per-line dropdown", () => {
    expect(page).toContain('apiFetch("/api/products")');
    expect(page).toContain("variantsByProductName");
    expect(page).toContain("data-testid={`select-variant-${order.id}-${idx}`}");
  });

  it("persists a staff correction through the inbox PATCH", () => {
    expect(page).toContain("/api/social/inbox-orders/${order.id}");
    expect(page).toContain("items: nextItems");
  });

  it("blocks both courier dispatches while a variant is missing", () => {
    expect(page).toContain("function needsVariant");
    const courier = page.slice(page.indexOf("const handleSendToCourier"), page.indexOf("const handleSendToPathao"));
    const pathao = page.slice(page.indexOf("const handleSendToPathao"), page.indexOf("const handleCheckFraud"));
    for (const fn of [courier, pathao]) {
      expect(fn).toContain("missingVariantItems");
      expect(fn).toContain("Pick a variant for");
      expect(fn).toContain("return;");
    }
  });
});
```

- [ ] **Step 14: Run it to verify it fails**

Run: `npx vitest run src/test/inboxVariantCapture.test.ts`
Expected: FAIL — `variant_id?: string | null` not found in `src/pages/InboxOrders.tsx`.

- [ ] **Step 15: Add the variant data layer to the inbox page**

In `src/pages/InboxOrders.tsx`, widen the items type at line 38:

```tsx
  items: Array<{ product: string; quantity: number; unit_price?: number; variant_id?: string | null }>;
```

Add the import:

```tsx
import { Select, SelectItem } from "@/components/base/select/select";
```

Do **not** import `server/variantMatching.js` here. Nothing under `src/` imports from `server/`
except tests (`src/test/shippingCalculation.test.ts` is the only such import in the repo), and
pulling a server `.js` file into the Vite graph would be a new precedent for a three-line
predicate. Define it locally instead, above the component:

```tsx
function needsVariant(
  item: { product: string; variant_id?: string | null },
  variantsByProductName: Record<string, Array<{ id: string }>>,
) {
  if (item.variant_id) return false;
  const variants = variantsByProductName[item.product.trim().toLowerCase()];
  return Array.isArray(variants) && variants.length > 0;
}
```

This mirrors `productNeedsVariant` in `server/variantMatching.js`, which is the version under
unit test. An unknown product name returns `false` in both — a catalog typo must not permanently
block dispatch.

Beside the existing orders query (`src/pages/InboxOrders.tsx:504`):

```tsx
  const { data: productsData } = useQuery<{
    products: Array<{ id: string; name: string; variants: Array<{ id: string; attributes: Record<string, string> }> }>;
  }>({
    queryKey: ["/api/products"],
    queryFn: () => apiFetch("/api/products").then((r) => r.json()),
  });

  const variantsByProductName = useMemo(() => {
    const map: Record<string, Array<{ id: string; attributes: Record<string, string> }>> = {};
    for (const product of productsData?.products ?? []) {
      map[product.name.trim().toLowerCase()] = product.variants ?? [];
    }
    return map;
  }, [productsData]);

  const variantLabelById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const variants of Object.values(variantsByProductName)) {
      for (const variant of variants) {
        map[variant.id] = Object.entries(variant.attributes || {})
          .map(([key, value]) => `${key}: ${value}`)
          .join(", ");
      }
    }
    return map;
  }, [variantsByProductName]);
```

- [ ] **Step 16: Add the per-line variant dropdown**

Add the mutation next to `handleStatusUpdate` (`src/pages/InboxOrders.tsx:548`):

```tsx
  const handleVariantChange = async (order: InboxOrder, idx: number, variantId: string | null) => {
    const nextItems = (order.items || []).map((item, i) => (i === idx ? { ...item, variant_id: variantId } : item));
    updateLocalOrder({ ...order, items: nextItems });
    try {
      const res = await apiFetch(`/api/social/inbox-orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: nextItems }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to set the variant");
      if (data.order) updateLocalOrder(data.order);
    } catch (err) {
      updateLocalOrder(order); // revert
      toast.error(err instanceof Error ? err.message : "Failed to set the variant");
    }
  };
```

In the item tooltip's row (`src/pages/InboxOrders.tsx:1004-1007`), replace the single `<p>` with
the product line plus the dropdown. Only products that actually have variants get a control:

```tsx
                                <div className="min-w-0">
                                  <p className="text-xs text-foreground leading-relaxed">{item.quantity}× {item.product}</p>
                                  {(variantsByProductName[item.product.trim().toLowerCase()]?.length ?? 0) > 0 && (
                                    <div className="mt-1.5">
                                      <Select
                                        aria-label={`Variant for ${item.product}`}
                                        data-testid={`select-variant-${order.id}-${idx}`}
                                        selectedKey={item.variant_id ?? "none"}
                                        onSelectionChange={(key) =>
                                          handleVariantChange(order, idx, key === "none" ? null : String(key))
                                        }
                                        triggerClassName="h-8"
                                      >
                                        <SelectItem id="none">Pick a variant</SelectItem>
                                        {(variantsByProductName[item.product.trim().toLowerCase()] ?? []).map((variant) => (
                                          <SelectItem key={variant.id} id={variant.id}>
                                            {variantLabelById[variant.id] || variant.id}
                                          </SelectItem>
                                        ))}
                                      </Select>
                                    </div>
                                  )}
                                </div>
```

Also surface it on the collapsed cell so staff do not have to hover to notice a gap. Directly
after the `+{moreCount}` badge (`src/pages/InboxOrders.tsx:978-980`):

```tsx
                              {items.some((item) => needsVariant(item, variantsByProductName)) && (
                                <span className="ml-1.5 rounded bg-[#FDECEC] px-1 py-0.5 text-[9px] font-bold text-[#B42318]">
                                  Variant needed
                                </span>
                              )}
```

- [ ] **Step 17: Add the dispatch guard to both courier handlers**

At the very top of `handleSendToCourier` (`src/pages/InboxOrders.tsx:565`), before
`setSendingIds`:

```tsx
    const missingVariantItems = (order.items || []).filter((item) => needsVariant(item, variantsByProductName));
    if (missingVariantItems.length > 0) {
      toast.error(`Pick a variant for ${missingVariantItems.map((item) => item.product).join(", ")} before dispatching.`);
      return;
    }
```

Add the identical block at the top of `handleSendToPathao` (`src/pages/InboxOrders.tsx:597`),
before `setSendingPathaoIds`. Duplicating four lines is correct here: extracting a helper that
both call would hide the guard from anyone reading either handler, and the guard is the one thing
that must be obvious in both.

The message names the order lines that need a variant, as the spec requires. Accepted cost: staff
will hit this blocker on vague conversations and must pick the pack size before dispatching.

- [ ] **Step 18: Run the full test file and the type-check**

Run: `npx vitest run src/test/inboxVariantCapture.test.ts`
Expected: PASS (21 tests).

Run: `npm run build`
Expected: succeeds with no type errors.

- [ ] **Step 19: Run the whole suite**

Run: `npm test`
Expected: PASS. `npm run lint` should also be clean for the touched files.

- [ ] **Step 20: Commit**

```bash
git add src/pages/InboxOrders.tsx src/test/inboxVariantCapture.test.ts
git commit -m "feat: let staff set inbox order variants and block dispatch without one"
```

---

## Post-Implementation Notes

One schema constraint remains intentionally application-level:

1. **`social_inbox_orders.items` has no schema-level shape.** Task 1 adds `variant_id` to the
   items each writer produces, but nothing prevents an older row from lacking it. Every reader
   added here treats a missing `variant_id` as "not chosen", which is why the guard is a filter
   over items rather than a schema constraint.

## Engineering Review Amendments (2026-09-04)

These amendments supersede conflicting implementation snippets above. They were approved during
the branch-diff engineering review and are required for completion.

### Architecture and data integrity

```text
Product/variant assignment
  -> authenticated Express route
  -> validate UUIDs and fixed workspace ownership
  -> service-role-only transactional RPC
  -> update all requested rows or roll back

Inbox courier dispatch
  -> client preflight for immediate feedback
  -> authenticated Express route
  -> load org-scoped inbox order
  -> validate every catalog product, variant, and weight
  -> normalize Bangladesh phone number
  -> call courier helper
  -> persist courier result
```

- Add service-role-only transactional functions for create-with-default, warehouse deletion plus
  product reassignment, and all-or-error bulk product assignment. Revoke execution from `PUBLIC`,
  `anon`, and `authenticated`; grant only `service_role`.
- Replace the existing multi-call Express mutations with those RPCs. Keep request validation,
  authentication, and fixed-workspace guards in Express.
- Make warehouse detail stock variant-aware: variant products sum
  `product_variants.stock_quantity`; variant-less products use `products.stock_quantity`.
- Treat blank weight as `null`, but reject malformed, non-finite, or negative weight with HTTP 400.
  Valid values are rounded to three decimals.
- Validate and deduplicate bulk product IDs. The transaction must update every requested product
  in the fixed workspace or update none.
- Restore both inbox courier routes and enforce the missing-variant/weight invariant server-side.

### Test strategy

- Keep source assertions only for route registration, auth/org guard placement, and other
  boundaries that cannot be imported from the Express monolith.
- Use React Testing Library for warehouse/product/order/inbox controls, submitted payloads,
  optimistic updates, rollback, loading, empty, and visible error states.
- Add SQL/migration tests for function privileges and transactional function bodies, plus baseline
  verification that executes the migration in the disposable database.
- Add behavior tests for invalid weights, variant-aware warehouse totals, all-or-error bulk
  assignment, and both restored courier routes.
- Extract a DOM-free workbook builder. Serialize and reload the workbook with ExcelJS, then assert
  Bangla text, column order, numeric cells, formats, blank unknown fields, and filename rules.
- Add deterministic Meta extraction prompt/parser fixtures. Add a small live-model eval suite that
  runs only when `OPENAI_API_KEY` is present and is not required by normal CI.
- Run browser QA for create/edit/delete warehouse, product assignment, order routing and override,
  dashboard filtering, regular/inbox Excel export, variant correction, and both courier guards.

### Branch integration order

The feature branch is behind `main`. Preserve and verify the existing Task 6/7 work first, commit
only completed logical units, merge `main`, resolve conflicts without discarding either side, then
continue Tasks 8-15 and the amendments above.

## NOT in scope

- Per-warehouse inventory pools or stock transfers: warehouses remain routing labels.
- Split shipments for orders spanning warehouses: first resolvable product still wins.
- Warehouse-specific courier pickup locations: the deployment keeps one global courier pickup.
- Per-warehouse team permissions, analytics, P&L, or active/inactive state: none block routing or
  export.
- Server-generated exports: browser-side Excel generation is sufficient for selected dashboard
  rows and avoids a new download API.

## What already exists

- `server/warehouseRouting.js` provides tested pure warehouse and weight decisions and is reused by
  both order-creation paths.
- Existing product and variant APIs, `OrdersTable`, product forms, TanStack Query, `apiFetch()`,
  courier helpers, and the customer export pattern are extended rather than duplicated.
- The warehouse migration, CRUD/detail APIs, bulk-assignment route shell, and both order-routing
  call sites are already committed on this branch.
- Uncommitted Task 6/7 route changes and red tests are preserved and completed in place.

## Failure modes

| Flow | Production failure | Required handling and evidence |
|---|---|---|
| Create/default warehouse | Default RPC fails after insert | One transaction; SQL test proves rollback |
| Delete warehouse | Product reassignment fails | One transaction; SQL test proves warehouse remains active |
| Bulk assignment | Stale or foreign product ID | Reject and roll back all IDs; behavior test |
| Weight edit | Negative or malformed value | HTTP 400 and visible form error; route/component tests |
| Warehouse detail | Variant stock omitted | Variant-aware aggregation test |
| Excel export | Unicode or format corruption | Serialize/reload workbook round-trip test |
| Inbox dispatch | Missing/foreign variant | Server rejection plus client feedback test |
| Courier request | Provider error or timeout | Preserve unsent state and show recoverable error |
| AI extraction | Ambiguous pack size | Matcher returns null; fixture and optional live eval |

## Worktree execution strategy

| Lane | Work | Depends on |
|---|---|---|
| A | Database RPC hardening -> backend validation -> courier routes | Existing Tasks 1-7 |
| B | Product forms -> Products page -> warehouse pages -> dashboard/inbox UI | Shared warehouse hook and backend APIs |
| C | Excel builder and workbook tests -> regular/inbox buttons | Warehouse names and order fields |

Lanes B and C are logically independent after the shared hook/API contracts, but this session uses
one existing worktree. Execute sequentially to preserve the unfinished changes and avoid conflicts
in `OrdersTable`, `InboxOrders`, and `server/index.js`.

## Implementation Tasks

- [ ] **T1 (P1)** — Finish and behavior-test Task 6 manual override and filtering.
- [ ] **T2 (P1)** — Finish and behavior-test Task 7 weight and product warehouse APIs.
- [ ] **T3 (P1)** — Add transactional warehouse mutation RPCs and all-or-error assignment.
- [ ] **T4 (P1)** — Correct variant-aware warehouse stock summaries.
- [ ] **T5 (P1)** — Merge current `main` without losing completed feature work.
- [ ] **T6 (P1)** — Implement Tasks 8-9 product form and assignment UI with RTL tests.
- [ ] **T7 (P1)** — Implement Task 10 Excel builder and real workbook round-trip tests.
- [ ] **T8 (P1)** — Implement Tasks 11-14 warehouse/order pages, controls, and filters with RTL tests.
- [ ] **T9 (P1)** — Implement Task 15 variant capture, restored courier routes, server/client guards,
  deterministic fixtures, and optional live-model evals.
- [ ] **T10 (P1)** — Run full tests, lint, build, migration verification, review, and browser QA.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | Not run |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | UNAVAILABLE | Timed out after 5 minutes with no output |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 8 issues found and folded into this plan; 0 critical gaps remain |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | Not run |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | Not run |

- **VERDICT:** ENG CLEARED — ready to implement the approved full scope.

NO UNRESOLVED DECISIONS
