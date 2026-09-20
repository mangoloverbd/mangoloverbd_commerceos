import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { detectCustomerOrderSource } from "../../server/customers.js";

const serverSource = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

describe("order source route wiring", () => {
  it("validates and defaults source on main order writes", () => {
    const createStart = serverSource.indexOf('app.post("/api/orders"');
    const patchStart = serverSource.indexOf('app.patch("/api/orders/:id"');
    const patchEnd = serverSource.indexOf('app.post("/api/orders/:id/send-sms"', patchStart);
    const createRoute = serverSource.slice(createStart, patchStart);
    const patchRoute = serverSource.slice(patchStart, patchEnd);
    expect(serverSource).toContain('new Set(["website", "facebook", "instagram", "whatsapp", "phone", "telesales", "manual_other"])');
    expect(createRoute).toContain('isCanonicalOrderSource(req.body.source)');
    expect(createRoute).toContain('return res.status(400).json({ error: "Invalid order source" });');
    expect(createRoute).toContain('row.source = "manual_other"');
    expect(patchRoute).toContain("isCanonicalOrderSource(update.source)");
    expect(patchRoute).toContain('return res.status(400).json({ error: "Invalid order source" });');
    expect(createRoute).toContain('"source"');
    expect(patchRoute).toContain('"source"');
  });

  it("sets Website at public storefront insertion boundaries", () => {
    expect(serverSource).toContain('source: "website"');
  });

  it("validates and persists optional landing page attribution", () => {
    expect(serverSource).toContain("function normalizeLandingPagePath");
    expect(serverSource).toContain('const landingPagePath = normalizeLandingPagePath(body.landingPagePath ?? body.landing_page_path)');
    expect(serverSource).toContain('return res.status(400).json({ error: "Invalid landing page path" });');
    expect(serverSource).toContain("landing_page_path: landingPagePath");
  });
});

describe("canonical order sources in customer analytics", () => {
  it("maps canonical values without changing customer source vocabulary", () => {
    expect(detectCustomerOrderSource({ source: "website" }, "order")).toBe("custom_website");
    expect(detectCustomerOrderSource({ source: "phone" }, "order")).toBe("manual");
    expect(detectCustomerOrderSource({ source: "manual_other" }, "order")).toBe("manual");
    expect(detectCustomerOrderSource({ source: "facebook" }, "social")).toBe("facebook");
  });
});
