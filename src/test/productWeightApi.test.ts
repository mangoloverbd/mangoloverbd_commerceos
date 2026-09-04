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

describe("product and variant warehouse fields", () => {
  it("uses the shared strict optional-weight parser", () => {
    expect(source).toContain("parseOptionalWeightKg,");
    expect(source).not.toContain("parseWeightKg(");
  });

  it("persists weight and a workspace-owned warehouse while saving products", () => {
    const handler = handlerFor('app.post("/api/products/save"');
    expect(handler).toContain("weight_kg: parseOptionalWeightKg(p.weight_kg)");
    expect(handler).toContain("warehouse_id: warehouseId");
    expect(handler).toContain("getActiveWarehouse(supabase, orgId, warehouseId)");
    expect(handler).toContain("weight_kg: parseOptionalWeightKg(v.weight_kg)");
  });

  it("updates product weight and only accepts an active workspace warehouse", () => {
    const handler = handlerFor('app.patch("/api/products/:id"');
    expect(handler).toContain('"weight_kg"');
    expect(handler).toContain('"warehouse_id"');
    expect(handler).toContain("update.weight_kg = parseOptionalWeightKg(update.weight_kg)");
    expect(handler).toContain("getActiveWarehouse(supabase, orgId, update.warehouse_id)");
  });

  it("persists normalized weight on variant create and update", () => {
    expect(handlerFor('app.post("/api/products/:id/variants"')).toContain(
      "weight_kg: parseOptionalWeightKg(weight_kg)",
    );
    expect(handlerFor('app.patch("/api/products/:id/variants/:variantId"')).toContain(
      "patch.weight_kg = parseOptionalWeightKg(req.body.weight_kg)",
    );
  });
});
