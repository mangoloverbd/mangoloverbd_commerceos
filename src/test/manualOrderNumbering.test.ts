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

  it("creates manual orders with compact Shopify-adjacent #M<seq> numbers", () => {
    const createRoute = source.slice(
      source.indexOf('app.post("/api/orders"'),
      source.indexOf('app.patch("/api/orders/:id"')
    );
    expect(createRoute).toContain("await getNextManualOrderSeq(orgId)");
    expect(createRoute).toContain("#M${await getNextManualOrderSeq(orgId)}");
  });

  it("seeds manual order numbers from the highest Shopify-style order number", () => {
    expect(source).toContain("async function getHighestShopifyStyleOrderNumber(orgId)");
    expect(source).toContain('Number(order.order_number.replace("#", ""))');
    expect(source).toContain("Math.max(current, highestShopifyStyleOrderNumber, 1000)");
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
