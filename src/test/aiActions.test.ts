import { describe, it, expect } from "vitest";
import { AI_ACTION_TOOLS, askUserTool } from "../../server/ai-actions.js";

describe("AI action tool schemas", () => {
  it("defines exactly 6 mutation tools with strict:true", () => {
    expect(AI_ACTION_TOOLS).toHaveLength(6);
    const names = AI_ACTION_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual([
      "check_fraud",
      "create_product",
      "dispatch_to_courier",
      "update_order",
      "update_product",
      "update_variant",
    ]);
    for (const t of AI_ACTION_TOOLS) expect(t.strict).toBe(true);
  });

  it("defines ask_user tool with radio/check types", () => {
    expect(askUserTool.name).toBe("ask_user");
    expect(askUserTool.strict).toBe(true);
    const qType = askUserTool.parameters.properties.questions.items.properties.type;
    expect(qType.enum).toEqual(["radio", "check"]);
  });

  it("update_variant fields include stock_quantity, cog, price_adjustment, attributes", () => {
    const v = AI_ACTION_TOOLS.find((t) => t.name === "update_variant");
    const f = v.parameters.properties.fields.properties;
    expect(Object.keys(f).sort()).toEqual(["attributes", "cog", "price_adjustment", "stock_quantity"]);
  });

  it("dispatch_to_courier caps order_ids at 25", () => {
    const d = AI_ACTION_TOOLS.find((t) => t.name === "dispatch_to_courier");
    expect(d.parameters.properties.order_ids.maxItems).toBe(25);
    expect(d.parameters.properties.courier.enum).toEqual(["steadfast", "pathao"]);
  });
});

import { buildRecommendation } from "../../server/ai-actions.js";

describe("buildRecommendation", () => {
  const ctx = {
    products: [{ id: "p1", name: "Cocoa Brown Trouser" }],
    variantsMap: { p1: [{ id: "vM", attributes: { size: "M" }, stock_quantity: 12 }] },
    orders: [{ id: "o1", order_number: "1001" }],
  };

  it("update_variant stock change yields add primary + set alternative", () => {
    const args = { product_id: "p1", variant_id: "vM", fields: { stock_quantity: 62 } };
    const r = buildRecommendation("update_variant", args, ctx);
    expect(r.recommendation.signal).toBe(3);
    expect(r.recommendation.tone).toBe("green");
    expect(r.recommendation.summary).toContain("was 12, +50");
    expect(r.alternatives).toHaveLength(1);
    expect(r.alternatives[0].summary).toContain("replace");
  });

  it("update_order yields no alternatives", () => {
    const args = { order_id: "o1", fields: { status: "cancelled" } };
    const r = buildRecommendation("update_order", args, ctx);
    expect(r.alternatives).toEqual([]);
    expect(r.recommendation.summary).toContain("#1001");
  });

  it("unknown tool yields empty", () => {
    const r = buildRecommendation("nope", {}, ctx);
    expect(r.recommendation).toBeNull();
  });
});
