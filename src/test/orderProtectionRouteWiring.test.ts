import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

function sectionBetween(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("order protection route wiring", () => {
  it("resolves settings and signed context before protection on both routes", () => {
    const custom = sectionBetween('app.post("/api/custom-orders/webhook"', "// ─── Live Visitor Tracking");
    const storefront = sectionBetween("async function handlePublicHandleOrderSubmit", "async function handlePublicHandleProducts");
    for (const route of [custom, storefront]) {
      expect(route).toContain("PROTECTION_MODE_SETTING_SUFFIX");
      expect(route).toContain("verifyClientContext(req.headers[CLIENT_CONTEXT_HEADER]");
      expect(route.indexOf("verifyClientContext(")).toBeLessThan(route.indexOf("await assessOrderRisk("));
      expect(route).toContain("mode, clientContext");
    }
    expect(source).not.toContain('from "./addressValidation.js"');
    expect(source).not.toContain('req.headers["cf-connecting-ip"]');
  });
  it("uses one protection pipeline on both storefront order ingress paths", () => {
    expect(source).toContain('from "./risk/pipeline.js"');
    expect(source.match(/await assessOrderRisk\(/g)).toHaveLength(2);
  });

  it("protects the custom webhook before order numbering and persistence side effects", () => {
    const webhook = sectionBetween(
      'app.post("/api/custom-orders/webhook"',
      "// ─── Live Visitor Tracking",
    );
    expect(webhook).toContain("await allowOrderSubmission(req, res, orgId");
    expect(webhook).toContain("await assessOrderRisk(");
    expect(webhook.indexOf("await assessOrderRisk(")).toBeLessThan(webhook.indexOf("getNextManualOrderNumber"));
    expect(webhook.indexOf("await assessOrderRisk(")).toBeLessThan(webhook.indexOf('.from("orders")'));
    expect(webhook).toContain("decision: \"review\"");
  });

  it("protects the public v1 route before the existing order insert and stock decrement", () => {
    const storefront = sectionBetween(
      "async function handlePublicHandleOrderSubmit",
      "async function handlePublicHandleProducts",
    );
    expect(storefront).toContain("await allowOrderSubmission(req, res, orgId, req.params.handle, mode, clientContext)");
    expect(storefront).toContain("await assessOrderRisk(");
    expect(storefront.indexOf("await assessOrderRisk(")).toBeLessThan(storefront.indexOf('.from("orders")'));
    expect(storefront.indexOf("await assessOrderRisk(")).toBeLessThan(storefront.indexOf("stock_quantity: Math.max"));
    expect(storefront).toContain("body.customerName ?? body.customer_name");
    expect(storefront).toContain("body.shippingZoneId ?? body.shipping_zone_id");
    expect(storefront).toContain('decision: "allow"');
  });

  it("keeps the public order route on the dedicated submission limiter", () => {
    expect(source).toContain('app.post("/api/public/v1/:handle/orders", handlePublicHandleOrderSubmit)');
    expect(source).not.toContain('app.post("/api/public/v1/:handle/orders", rateLimitPublicRead');
  });

  it("bypasses the order submission limiter when protection is disabled", () => {
    expect(source).toContain('if (mode === "off" || !rlOrderDevice || !rlOrderNetwork) return true;');
  });
});
