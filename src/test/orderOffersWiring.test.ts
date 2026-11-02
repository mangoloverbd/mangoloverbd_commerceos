import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

function sectionBetween(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("order offers wiring", () => {
  it("imports the shared offer rule", () => {
    expect(source).toMatch(/import \{[^}]*\bapplyOrderOffers\b[^}]*\} from "\.\/orderOffers\.js";/);
  });

  it("applies offers before shipping in the public order submit", () => {
    const submit = sectionBetween("async function handlePublicHandleOrderSubmit", "const total = subtotal + shipping;");
    const offerAt = submit.indexOf("applyOrderOffers(orderItems)");
    expect(offerAt).toBeGreaterThan(submit.indexOf("orderItems.push("));
    expect(offerAt).toBeLessThan(submit.indexOf("cartHasFreeDeliveryProduct(orderItems)"));
    expect(submit).toMatch(/applyOrderOffers\(orderItems\)\);\s*subtotal = orderItems\.reduce/);
  });

  it("applies offers before shipping when a held order is approved", () => {
    const approval = sectionBetween("Catalog or stock changed; review remains on hold", "Shipping configuration changed; review remains on hold");
    const offerAt = approval.indexOf("applyOrderOffers(orderItems)");
    expect(offerAt).toBeGreaterThan(0);
    expect(offerAt).toBeLessThan(approval.indexOf("cartHasFreeDeliveryProduct(orderItems)"));
    expect(approval).toMatch(/applyOrderOffers\(orderItems\)\);\s*subtotal = orderItems\.reduce/);
  });

  it("is used in exactly those two pricing paths", () => {
    expect(source.match(/applyOrderOffers\(orderItems\)/g)).toHaveLength(2);
  });
});

describe("public order offers route", () => {
  it("is registered as a rate-limited public read", () => {
    expect(source).toContain('app.get("/api/public/v1/:handle/order-offers", rateLimitPublicRead, handlePublicHandleOrderOffers);');
    expect(source).toContain('app.get("/api/public/v1/storefronts/:storefrontId/order-offers", rateLimitPublicRead, handlePublicHandleOrderOffers);');
  });

  it("resolves the workspace from the handle and org-scopes both lookups", () => {
    const handler = sectionBetween("async function handlePublicHandleOrderOffers", 'app.get("/api/public/v1/:handle/config"');
    expect(handler).toContain("req.params.storefrontId || (await resolveStorefrontHandle(req.params.handle))");
    expect(handler).toMatch(/\.from\("product_variants"\)[\s\S]*?\.eq\("org_id", orgId\)/);
    expect(handler).toMatch(/\.from\("products"\)[\s\S]*?\.eq\("org_id", orgId\)[\s\S]*?\.eq\("published", true\)/);
    expect(handler).toContain('res.set("Cache-Control", "no-store")');
    expect(handler).not.toContain("stock_quantity:");
  });
});
