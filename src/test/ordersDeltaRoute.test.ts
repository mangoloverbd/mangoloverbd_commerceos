import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

function ordersListHandler(): string {
  const start = source.indexOf('app.get("/api/orders"');
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = source.slice(start);
  return rest.slice(0, rest.indexOf("\n});"));
}

describe("GET /api/orders delta sync", () => {
  it("validates the changed_since cursor and rejects invalid timestamps with 400", () => {
    const route = ordersListHandler();
    expect(route).toContain("req.query.changed_since");
    expect(route).toContain("Date.parse(");
    expect(route).toMatch(/res\.status\(400\)/);
  });

  it("derives syncedAt from database updated_at values, not the server clock", () => {
    const route = ordersListHandler();
    expect(route).not.toContain("Date.now()");
    expect(route).toContain("totalCount: count ?? allOrders.length, syncedAt");
    expect(route).toContain("delta: true");
    // Full path: max over the returned orders and their items (null when empty).
    expect(route).toMatch(/const syncedAt = maxUpdatedAt\(\[\s*\.\.\.allOrders\.map\(\(order\) => order\.updated_at\),\s*itemsMaxUpdatedAt,?\s*\]\);/);
    // Delta path: max over the rows looked at, never older than the incoming cursor.
    expect(route).toMatch(/const deltaSyncedAt = maxUpdatedAt\(\[\s*changedSince,/);
    expect(route).toContain("syncedAt: deltaSyncedAt, delta: true");
  });

  it("selects updated_at on the rows the cursor is derived from", () => {
    const route = ordersListHandler();
    expect(route).toContain('.select("id, updated_at")');
    expect(route).toContain('.select("order_id, updated_at")');
    expect(route).toMatch(/from\("order_items"\)\.select\("order_id, [^"]*updated_at[^"]*"\)\.in\("order_id", idBatch\)/);
  });

  it("re-reads a 120s overlap window before the cursor for orders and items", () => {
    const route = ordersListHandler();
    expect(route).toContain("Date.parse(changedSince) - 120 * 1000");
    expect((route.match(/\.gt\("updated_at", overlapSince\)/g) || []).length).toBe(2);
    expect(route).not.toContain('.gt("updated_at", changedSince)');
  });

  it("finds changed orders and changed items by updated_at within the workspace", () => {
    const route = ordersListHandler();
    const itemsChange = route.slice(route.indexOf('.select("order_id, updated_at")'));
    expect(itemsChange).toContain('.eq("org_id", orgId)');
    expect(itemsChange).toContain('.gt("updated_at", overlapSince)');
  });

  it("counts the workspace orders with a head count on the delta path", () => {
    const route = ordersListHandler();
    expect(route).toMatch(/\.select\("id",\s*\{\s*count:\s*"exact",\s*head:\s*true\s*\}\)/);
    const orgGuards = route.match(/\.eq\("org_id", orgId\)/g) || [];
    // full list, changed orders, changed items, changed-order fetch, head count, items batch
    expect(orgGuards.length).toBeGreaterThanOrEqual(6);
    const warehouseGuards = route.match(/\.eq\("warehouse_id", warehouseFilter\)/g) || [];
    // full list, changed orders, changed-order fetch, head count
    expect(warehouseGuards.length).toBeGreaterThanOrEqual(4);
  });

  it("shares one item-attachment helper between the full, delta and date-range paths", () => {
    const route = ordersListHandler();
    const helperCalls = route.match(/await attachOrderItems\(/g) || [];
    expect(helperCalls.length).toBe(3);
    expect((route.match(/enrichOrderItems\(/g) || []).length).toBe(1);
  });

  it("pages the full list past PostgREST's 1000-row cap, fetching known pages together", () => {
    const route = ordersListHandler();
    const full = route.slice(route.indexOf("// Full list:"));
    // One page builder with a stable order so rows don't shift between pages.
    expect(full).toContain(".range(offset, offset + pageSize - 1)");
    expect(full).toMatch(/\.order\("created_at", \{ ascending: false \}\)\s*\.order\("id", \{ ascending: true \}\)/);
    expect(full).toContain('.eq("org_id", orgId)');
    // Exact count on the first page decides which pages to fetch in parallel.
    expect(full).toContain('.select("*", withCount ? { count: "exact" } : undefined)');
    expect(full).toContain("const first = await orderPage(0, true);");
    expect(full).toContain("await Promise.all(offsets.map((pageOffset) => orderPage(pageOffset, false)))");
    // Rows pushed past the counted pages by new orders are still read.
    expect(full).toContain("while (lastLength === pageSize)");
  });

  it("fetches order item batches a few at a time instead of one after another", () => {
    const route = ordersListHandler();
    const attach = route.slice(route.indexOf("const attachOrderItems"), route.indexOf("const enrichedItems"));
    expect(attach).toContain("ITEM_BATCH_CONCURRENCY");
    expect(attach).toMatch(/await Promise\.all\(\s*batches\.slice\(i, i \+ ITEM_BATCH_CONCURRENCY\)/);
    expect(attach).not.toMatch(/for \(const idBatch of chunkIds\(orderIds\)\) \{\s*const \{ data: batchItems/);
  });
});
