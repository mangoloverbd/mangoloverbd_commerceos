import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

function sectionBetween(start: string, end: string) {
  const sectionStart = source.indexOf(start);
  const sectionEnd = source.indexOf(end, sectionStart + start.length);
  expect(sectionStart).toBeGreaterThanOrEqual(0);
  expect(sectionEnd).toBeGreaterThan(sectionStart);
  return source.slice(sectionStart, sectionEnd);
}

describe("canonical ML order-number routes", () => {
  it("allocates and validates numbers through the restricted database RPC", () => {
    const helper = sectionBetween("async function getNextManualOrderNumber", "async function getProductStockMap");

    expect(helper).toContain('async function getNextManualOrderNumber(orgId)');
    expect(helper).toContain('.rpc("next_ml_order_number")');
    expect(helper).toContain("/^ML-\\d+$/.test(data)");
  });

  it("forces the canonical number in every order creation path", () => {
    const manual = sectionBetween('app.post("/api/orders"', 'app.patch("/api/orders/:id"');
    const webhook = sectionBetween('app.post("/api/custom-orders/webhook"', "// ─── Live Visitor Tracking");
    const storefront = sectionBetween("async function handlePublicHandleOrderSubmit", "async function handlePublicHandleProducts");

    for (const route of [manual, webhook, storefront]) {
      expect(route).toContain("await getNextManualOrderNumber(orgId)");
    }
    expect(manual).not.toMatch(/"order_number"/);
    expect(source).not.toContain("#M${await getNextManualOrderSeq(orgId)}");
    expect(source).not.toContain("#S${orderSeq}");
    expect(source).not.toContain("#${await getNextManualOrderSeq(orgId)}");
  });
});
