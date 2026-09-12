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
  it("uses one protection pipeline on both storefront order ingress paths", () => {
    expect(source).toContain('from "./orderProtectionPipeline.js"');
    expect(source.match(/await protectOrderSubmission\(/g)).toHaveLength(2);
  });

  it("protects the custom webhook before order numbering and persistence side effects", () => {
    const webhook = sectionBetween(
      'app.post("/api/custom-orders/webhook"',
      "// ─── Live Visitor Tracking",
    );
    expect(webhook).toContain("await allowOrderSubmission(req, res, orgId");
    expect(webhook).toContain("await protectOrderSubmission(");
    expect(webhook.indexOf("await protectOrderSubmission(")).toBeLessThan(webhook.indexOf("getNextManualOrderNumber"));
    expect(webhook.indexOf("await protectOrderSubmission(")).toBeLessThan(webhook.indexOf('.from("orders")'));
    expect(webhook).toContain("decision: \"review\"");
  });

  it("protects the public v1 route before the existing order insert and stock decrement", () => {
    const storefront = sectionBetween(
      "async function handlePublicHandleOrderSubmit",
      "async function handlePublicHandleProducts",
    );
    expect(storefront).toContain("await allowOrderSubmission(req, res, orgId, req.params.handle)");
    expect(storefront).toContain("await protectOrderSubmission(");
    expect(storefront.indexOf("await protectOrderSubmission(")).toBeLessThan(storefront.indexOf('.from("orders")'));
    expect(storefront.indexOf("await protectOrderSubmission(")).toBeLessThan(storefront.indexOf("stock_quantity: Math.max"));
    expect(storefront).toContain('decision: "allow"');
  });

  it("keeps the public order route on the dedicated submission limiter", () => {
    expect(source).toContain('app.post("/api/public/v1/:handle/orders", handlePublicHandleOrderSubmit)');
    expect(source).not.toContain('app.post("/api/public/v1/:handle/orders", rateLimitPublicRead');
  });
});
