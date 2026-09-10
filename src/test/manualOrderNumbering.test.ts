import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("manual order numbering", () => {
  const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

  it("uses the atomic canonical order-number allocator", () => {
    expect(source).toContain("async function getNextManualOrderNumber(orgId)");
    expect(source).toContain('.rpc("next_ml_order_number")');
    expect(source).toContain("/^ML-\\d+$/.test(data)");
  });

  it("creates manual orders with canonical ML-<seq> numbers", () => {
    const createRoute = source.slice(
      source.indexOf('app.post("/api/orders"'),
      source.indexOf('app.patch("/api/orders/:id"')
    );
    expect(createRoute).toContain("row.order_number = await getNextManualOrderNumber(orgId);");
    expect(createRoute).not.toContain('"order_number",');
  });

  it("stores Shopify order creation time as the business order date", () => {
    const syncRoute = source.slice(
      source.indexOf('app.post("/api/fetch-shopify-orders"'),
      source.indexOf('app.get("/api/orders"')
    );
    expect(syncRoute).toContain("created_at: order.created_at || new Date().toISOString()");
  });

  it("sorts orders by business order date recency instead of order_number", () => {
    const listRoute = source.slice(
      source.indexOf('app.get("/api/orders"'),
      source.indexOf('app.get("/api/orders/recent-notifications"')
    );
    expect(listRoute).toContain('.order("created_at", { ascending: false })');
  });
});
