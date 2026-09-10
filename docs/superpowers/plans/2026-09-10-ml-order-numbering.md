# Mango Lover Order Numbering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every newly created internal Mango Lover BD order one unique canonical number in the `ML-150000`, `ML-150001`, ... sequence across Merchant Suite, storefront checkout, and landing-page checkout.

**Architecture:** Merchant Suite owns one Postgres sequence and a service-role-only RPC that returns the formatted order number. All three order creation paths call one server helper, ignore caller-supplied order numbers, and persist the RPC result. Existing rows and Shopify-import behavior remain unchanged; the storefront continues to display the canonical response from Merchant Suite.

**Tech Stack:** Express 5, Node.js ESM, `@supabase/supabase-js`, Supabase Postgres migrations/RPC, React/Vite storefront, Vitest, Node `node:test`.

## Global Constraints

- All newly created Mango Lover BD orders use one canonical human-readable number sequence: `ML-150000`, `ML-150001`, and onward.
- Existing order numbers remain unchanged.
- The sequence applies to Merchant Suite manual orders, public storefront orders, and landing-page webhook orders.
- Shopify import behavior remains unchanged.
- Public clients never receive database access or the ability to choose an order number.
- Every user-data query and insert keeps the resolved Mango Lover BD `org_id` guard.
- Sequence gaps are acceptable when allocation succeeds but a later insert fails; uniqueness and increasing allocation matter more than gapless numbering.
- Frontend code must use the existing storefront request helpers; no new direct database access or secret exposure.

---

## Task 1: Add the atomic Supabase allocator

**Files:**
- Create: `supabase/migrations/20260910170052_ml_order_numbering.sql`
- Create: `src/test/mlOrderNumberingMigration.test.ts`

**Interfaces:**
- Produces database function `public.next_ml_order_number() returns text` for Merchant Suite's service-role Supabase client.
- Produces sequence `public.orders_order_number_seq` whose first post-migration allocation is `150000`.
- Produces unique index `public.orders_org_order_number_unique_idx` on `(org_id, order_number)`.

- [ ] **Step 1: Create the migration file through the repository workflow**

Run:

```bash
npm run verify:supabase-project
npm run verify:supabase-baseline
supabase migration new ml_order_numbering
```

The CLI generated `supabase/migrations/20260910170052_ml_order_numbering.sql`. Do not apply the migration yet.

- [ ] **Step 2: Write the failing migration contract test**

Create a Vitest source-contract test that reads the generated migration and asserts:

```ts
expect(sql).toMatch(/create sequence if not exists public\.orders_order_number_seq/i);
expect(sql).toMatch(/start with 150000/i);
expect(sql).toMatch(/create or replace function public\.next_ml_order_number\(\)/i);
expect(sql).toContain("'ML-' || nextval('public.orders_order_number_seq')::text");
expect(sql).toMatch(/revoke all on function public\.next_ml_order_number/i);
expect(sql).toMatch(/grant execute on function public\.next_ml_order_number.*service_role/i);
expect(sql).toMatch(/create unique index.*orders_org_order_number_unique_idx/i);
```

- [ ] **Step 3: Run the contract test and verify it fails**

Run `npm test -- src/test/mlOrderNumberingMigration.test.ts`.

Expected result: FAIL because the migration does not yet contain the allocator SQL.

- [ ] **Step 4: Write the migration SQL**

Create the sequence, initialize it without changing any existing order rows, create the restricted RPC, grant sequence usage to `service_role`, and add the unique index. The essential SQL is:

```sql
create sequence if not exists public.orders_order_number_seq
  as bigint start with 150000 increment by 1 minvalue 1 no maxvalue cache 1;

select setval(
  'public.orders_order_number_seq',
  greatest(150000, coalesce((select max((substring(order_number from '^ML-([0-9]+)$'))::bigint) from public.orders where order_number ~ '^ML-[0-9]+$'), 150000)),
  case when coalesce((select max((substring(order_number from '^ML-([0-9]+)$'))::bigint) from public.orders where order_number ~ '^ML-[0-9]+$'), 0) >= 150000 then true else false end
);

create or replace function public.next_ml_order_number()
returns text language sql volatile
as $$ select 'ML-' || nextval('public.orders_order_number_seq')::text; $$;

revoke all on function public.next_ml_order_number() from public;
grant execute on function public.next_ml_order_number() to service_role;
grant usage, select on sequence public.orders_order_number_seq to service_role;

create unique index if not exists orders_org_order_number_unique_idx
  on public.orders (org_id, order_number);
```

For an empty/new sequence, the next allocator call must return `ML-150000`. If an existing `ML-N` row is present, the next value must be `ML-(N+1)`.

- [ ] **Step 5: Run the contract test and verify it passes**

Run `npm test -- src/test/mlOrderNumberingMigration.test.ts`. Expected result: PASS.

- [ ] **Step 6: Commit the migration and test**

```bash
git add supabase/migrations src/test/mlOrderNumberingMigration.test.ts
git commit -m "feat: add atomic Mango Lover order allocator"
```

---

## Task 2: Route Merchant Suite order creators through the allocator

**Files:**
- Modify: `server/index.js:1294-1345, 6038-6152, 6480-6567, 10343-10535`
- Modify: `src/test/manualOrderNumbering.test.ts`
- Modify: `src/test/orderRoutingWiring.test.ts`
- Create: `src/test/mlOrderNumberingRoutes.test.ts`

**Interfaces:**
- Consumes `getServiceSupabase().rpc("next_ml_order_number")`.
- Produces `getNextManualOrderNumber(orgId): Promise<string>` returning `ML-<number>`.
- Produces canonical numbers from manual Suite, webhook, and direct public storefront creation routes.

- [ ] **Step 1: Write failing route contract tests**

Assert that `server/index.js` defines `getNextManualOrderNumber(orgId)`, calls `.rpc("next_ml_order_number")`, validates `/^ML-\d+$/`, and no longer contains the old `#M`, `#S`, or `#${await getNextManualOrderSeq(orgId)}` formats. Assert each creation route calls the helper and ignores a supplied `order_number`.

- [ ] **Step 2: Run the route tests and verify they fail**

Run `npm test -- src/test/mlOrderNumberingRoutes.test.ts`. Expected result: FAIL because the current server still uses the app-settings counter and old formats.

- [ ] **Step 3: Replace the counter helper**

Replace `getNextManualOrderSeq` and its Shopify-style scan with:

```js
async function getNextManualOrderNumber(orgId) {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc("next_ml_order_number");
  if (error) throw error;
  if (typeof data !== "string" || !/^ML-\d+$/.test(data)) {
    throw new Error("Invalid order number returned by allocator");
  }
  return data;
}
```

Keep the explicit `orgId` argument and service-role client; do not accept an organization id from a client.

- [ ] **Step 4: Update manual order creation**

Remove `order_number` from the `/api/orders` input allowlist and unconditionally assign `row.order_number = await getNextManualOrderNumber(orgId)`. Preserve authentication, org-scoped routing/inserts, item cleanup, and the negative `shopify_order_id` compatibility marker.

- [ ] **Step 5: Update landing-page webhook creation**

Keep the API-key workspace lookup and payload allowlist, but assign `row.order_number = await getNextManualOrderNumber(orgId)`. Preserve routing, linked items, cleanup, SMS, and `order_id: persistedOrder.order_number`.

- [ ] **Step 6: Update direct public storefront creation**

Replace `getNextManualOrderSeq` plus `#S` formatting with `const orderNumber = await getNextManualOrderNumber(orgId)`. Preserve handle-based workspace resolution, all `org_id` filters, stock validation/decrement, order items, cache purge, and `orderId: orderNumber`.

- [ ] **Step 7: Update stale source-contract expectations and run tests**

Run:

```bash
npm test -- src/test/manualOrderNumbering.test.ts src/test/orderRoutingWiring.test.ts src/test/mlOrderNumberingRoutes.test.ts
```

Update only expectations describing the old counter or old formats. Keep Shopify assertions unchanged. Expected result: PASS.

- [ ] **Step 8: Commit the server changes**

```bash
git add server/index.js src/test/manualOrderNumbering.test.ts src/test/orderRoutingWiring.test.ts src/test/mlOrderNumberingRoutes.test.ts
git commit -m "feat: use canonical order numbers across creation paths"
```

---

## Task 3: Require storefront confirmation from Merchant Suite

**Files:**
- Modify: `/Users/noorkarimmehedi/conductor/repos/mangoloverbd_storefront/api/orders.ts:172-225`
- Modify: `/Users/noorkarimmehedi/conductor/repos/mangoloverbd_storefront/server/order-service.ts:38-112`
- Modify: `/Users/noorkarimmehedi/conductor/repos/mangoloverbd_storefront/api/orders.test.ts`
- Modify: `/Users/noorkarimmehedi/conductor/repos/mangoloverbd_storefront/server/order-service.test.ts`

**Interfaces:**
- Consumes Merchant Suite response `{ order_id: "ML-150000" }`.
- Produces `{ orderRef: "ML-150000" }` only after Merchant Suite confirms persistence.
- Produces `OrderUpstreamError` on webhook failure for every tracking mode; no random local reference is shown as success.

- [ ] **Step 1: Write failing fallback tests**

Change default-order failure cases to:

```ts
await assert.rejects(
  () => processOrder(order, { ...dependencies, fetchImpl }),
  OrderUpstreamError,
);
```

Add a successful response case asserting `{ order_id: "ML-150000" }` becomes `{ orderRef: "ML-150000" }`.

- [ ] **Step 2: Run storefront tests and verify they fail**

Run `node --test api/orders.test.ts server/order-service.test.ts` in the storefront repo. Expected result: FAIL because default failures currently return `#fallback`.

- [ ] **Step 3: Remove Vercel random fallback**

In `api/orders.ts`, remove `randomInt`, `createOrderRef`, and the dependency property, then change the catch block to `throw new OrderUpstreamError()`. Do not alter validation, timeout, API key, Meta, or successful response behavior.

- [ ] **Step 4: Remove local Express random fallback**

Make the same removal in `server/order-service.ts`, keeping its outbound body behaviorally identical to the Vercel service.

- [ ] **Step 5: Run storefront tests and verify they pass**

Run `node --test api/orders.test.ts server/order-service.test.ts`. Expected result: PASS.

- [ ] **Step 6: Commit storefront changes without the pre-existing log**

```bash
cd /Users/noorkarimmehedi/conductor/repos/mangoloverbd_storefront
git add api/orders.ts api/orders.test.ts server/order-service.ts server/order-service.test.ts
git commit -m "fix: require canonical order confirmation"
```

Do not stage `storefront-server.log`.

---

## Task 4: Apply and verify the live change

**Files:**
- The plan already records the CLI-generated migration filename: `supabase/migrations/20260910170052_ml_order_numbering.sql`.

**Interfaces:**
- Consumes committed migration and server changes.
- Produces a live allocator returning unique `ML-...` values and verified public/manual order paths.

- [ ] **Step 1: Verify the target project and baseline**

Run in Merchant Suite:

```bash
npm run verify:supabase-project
npm run verify:supabase-baseline
```

Review the migration and confirm it does not update existing `orders.order_number` values.

- [ ] **Step 2: Apply the committed migration**

Use the Supabase migration tool with the exact committed SQL. Do not execute ad-hoc DDL outside migration history.

- [ ] **Step 3: Verify the allocator and unique index**

Run read-only SQL:

```sql
select public.next_ml_order_number();
select indexname from pg_indexes where indexname = 'orders_org_order_number_unique_idx';
select order_number, source from public.orders order by created_at desc limit 5;
```

Record the allocator result because this check consumes one sequence value. Confirm existing order numbers remain unchanged.

- [ ] **Step 4: Run Merchant Suite checks**

```bash
npm test -- src/test/mlOrderNumberingMigration.test.ts src/test/mlOrderNumberingRoutes.test.ts src/test/manualOrderNumbering.test.ts src/test/orderRoutingWiring.test.ts
npm run lint
npm run build
```

- [ ] **Step 5: Run storefront checks**

```bash
cd /Users/noorkarimmehedi/conductor/repos/mangoloverbd_storefront
npm run check
node --test api/orders.test.ts server/order-service.test.ts
npm run build
```

- [ ] **Step 6: Verify two checkout paths**

Place one test order through a landing page and one through the main storefront. Confirm both confirmations and dashboard rows show different `ML-...` values, and neither path displays `#`, `#M`, `#S`, or a random fallback reference.

- [ ] **Step 7: Review the final diff**

Check both repositories with `git status --short`. Confirm only intentional files changed, `storefront-server.log` remains unstaged, and no `.env` or secret is committed.
