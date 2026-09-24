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

  it("records a 5s-overlap syncedAt cursor before querying and returns it on both paths", () => {
    const route = ordersListHandler();
    const syncedAtIndex = route.indexOf("new Date(Date.now() - 5000).toISOString()");
    const firstOrdersQuery = route.indexOf('.from("orders")');
    expect(syncedAtIndex).toBeGreaterThan(-1);
    expect(syncedAtIndex).toBeLessThan(firstOrdersQuery);
    expect(route).toContain("totalCount: count ?? allOrders.length, syncedAt");
    expect(route).toContain("delta: true");
  });

  it("finds changed orders and changed items by updated_at within the workspace", () => {
    const route = ordersListHandler();
    expect(route).toContain('.gt("updated_at", changedSince)');
    const itemsChange = route.slice(route.indexOf('.select("order_id")'));
    expect(itemsChange).toContain('.eq("org_id", orgId)');
    expect(itemsChange).toContain('.gt("updated_at", changedSince)');
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

  it("shares one item-attachment helper between the full and delta paths", () => {
    const route = ordersListHandler();
    const helperCalls = route.match(/await attachOrderItems\(/g) || [];
    expect(helperCalls.length).toBe(2);
    expect((route.match(/enrichOrderItems\(/g) || []).length).toBe(1);
  });
});
