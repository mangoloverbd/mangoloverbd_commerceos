import { describe, it, expect } from "vitest";
import { AI_ACTION_TOOLS, askUserTool } from "../../server/ai-actions.js";

describe("AI action tool schemas", () => {
  it("defines exactly 7 mutation tools with strict:true", () => {
    expect(AI_ACTION_TOOLS).toHaveLength(7);
    const names = AI_ACTION_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual([
      "add_variant",
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

  it("add_variant yields green high-confidence recommendation with option label", () => {
    const args = { product_id: "p1", attributes: "{\"size\":\"S\"}", stock_quantity: 20, cog: null, price_adjustment: null };
    const r = buildRecommendation("add_variant", args, ctx);
    expect(r.recommendation.tone).toBe("green");
    expect(r.recommendation.cta).toBe("Add variant");
    expect(r.recommendation.summary).toContain("Cocoa Brown Trouser");
    expect(r.recommendation.summary).toContain("S");
    expect(r.recommendation.summary).toContain("20 units");
    expect(r.alternatives).toEqual([]);
  });
});

import { executeAiAction } from "../../server/ai-actions.js";

describe("executeAiAction dispatcher", () => {
  // Minimal fake supabase builder: each table returns an object with
  // select/update/insert/delete that return { data, error } via maybeSingle/single.
  function fakeSupabase(tables) {
    return new Proxy({}, {
      get(_t, prop) {
        if (prop === "from") return (table) => tables[table] ?? { _missing: true };
        return tables[prop] ?? { _missing: true };
      },
    });
  }
  const noHelpers = {};

  it("throws on unknown tool", async () => {
    await expect(
      executeAiAction({ supabase: fakeSupabase({}), orgId: "o", userId: "u", tool: "nope", args: {}, helpers: noHelpers }),
    ).rejects.toThrow(/Unknown AI action tool/);
  });

  it("throws 404-style when target variant missing in org (cross-tenant guard)", async () => {
    const supabase = fakeSupabase({
      product_variants: {
        select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
      },
    });
    await expect(
      executeAiAction({ supabase, orgId: "o", userId: "u", tool: "update_variant",
        args: { product_id: "p1", variant_id: "vX", fields: { stock_quantity: 5 } }, helpers: noHelpers }),
    ).rejects.toThrow(/not found/i);
  });

  it("add_variant inserts a new variant scoped to the org and 404s on missing product", async () => {
    let inserted = null;
    const supabase = fakeSupabase({
      products: {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "p1", name: "Trouser" }, error: null }) }) }) }),
        update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: {}, error: null }) }) }) }) }),
      },
      product_variants: {
        insert: (row) => { inserted = row; return { select: () => ({ single: async () => ({ data: { id: "vS", ...row }, error: null }) }) }; },
      },
    });
    const args = { product_id: "p1", attributes: "{\"size\":\"S\"}", stock_quantity: 20, cog: null, price_adjustment: null };
    const res = await executeAiAction({ supabase, orgId: "org1", userId: "u", tool: "add_variant", args, helpers: noHelpers });
    expect(inserted.org_id).toBe("org1");
    expect(inserted.product_id).toBe("p1");
    expect(inserted.attributes).toEqual({ size: "S" });
    expect(inserted.stock_quantity).toBe(20);
    expect(res.after.variant.id).toBe("vS");

    const missingSupabase = fakeSupabase({
      products: {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
      },
    });
    await expect(
      executeAiAction({ supabase: missingSupabase, orgId: "o", userId: "u", tool: "add_variant",
        args: { product_id: "pX", attributes: "{\"size\":\"S\"}", stock_quantity: 5, cog: null, price_adjustment: null }, helpers: noHelpers }),
    ).rejects.toThrow(/not found/i);
  });

  it("passes the updated product slug to cache invalidation", async () => {
    const purges: Array<unknown[]> = [];
    const supabase = fakeSupabase({
      products: {
        select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: { id: "p1", name: "Original", slug: "mango", published: true },
          error: null,
        }) }) }) }),
        update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ single: async () => ({
          data: { id: "p1", name: "Updated", slug: "mango", published: true },
          error: null,
        }) }) }) }) }),
      },
    });

    await executeAiAction({
      supabase,
      orgId: "org1",
      userId: "u",
      tool: "update_product",
      args: { product_id: "p1", fields: { name: "Updated" } },
      helpers: {
        purgeProductCache: (...args: unknown[]) => {
          purges.push(args);
          return Promise.resolve();
        },
      },
    });

    expect(purges).toEqual([["org1", { id: "p1", slug: "mango" }, { listChanged: false, warm: true }]]);
  });

  it("passes a newly published product slug to cache invalidation", async () => {
    const purges: Array<unknown[]> = [];
    const supabase = fakeSupabase({
      products: {
        insert: () => ({ select: () => ({ single: async () => ({
          data: { id: "p2", slug: "new-mango", name: "New Mango" },
          error: null,
        }) }) }),
      },
    });

    await executeAiAction({
      supabase,
      orgId: "org1",
      userId: "u",
      tool: "create_product",
      args: { name: "New Mango", published: true, variants: [] },
      helpers: {
        getUniqueProductSlug: async () => "new-mango",
        purgeProductCache: (...args: unknown[]) => {
          purges.push(args);
          return Promise.resolve();
        },
      },
    });

    expect(purges).toEqual([["org1", { id: "p2", slug: "new-mango" }, { listChanged: true, warm: true }]]);
  });
});
