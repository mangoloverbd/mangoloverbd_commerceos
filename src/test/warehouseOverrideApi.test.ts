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
  it("allows warehouse and weight updates on regular orders", () => {
    const handler = handlerFor('app.patch("/api/orders/:id"');
    expect(handler).toContain('"warehouse_id"');
    expect(handler).toContain('"weight_kg"');
    expect(handler).toContain("update.warehouse_auto = false");
    expect(handler).toContain("getActiveWarehouse(supabase, orgId, update.warehouse_id)");
  });

  it("allows warehouse and weight updates on inbox orders", () => {
    const handler = handlerFor('app.patch("/api/social/inbox-orders/:id"');
    expect(handler).toContain('"warehouse_id"');
    expect(handler).toContain('"weight_kg"');
    expect(handler).toContain("update.warehouse_auto = false");
    expect(handler).toContain("getActiveWarehouse(supabase, orgId, update.warehouse_id)");
  });

  it("never accepts warehouse_auto from clients", () => {
    expect(handlerFor('app.patch("/api/orders/:id"')).not.toContain('"warehouse_auto"');
    expect(handlerFor('app.patch("/api/social/inbox-orders/:id"')).not.toContain('"warehouse_auto"');
  });

  it("filters the org-scoped order query by warehouse", () => {
    const handler = handlerFor('app.get("/api/orders"');
    expect(handler).toContain("req.query.warehouse_id");
    expect(handler).toContain('.eq("org_id", orgId)');
    expect(handler).toContain('.eq("warehouse_id", warehouseFilter)');
  });
});
