import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

function routeSection(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("fraud route wiring", () => {
  it("imports the client from the extracted module and keeps no duplicate copy", () => {
    expect(source).toContain('from "./fraudShield.js"');
    expect(source).toContain("fetchFraudShield");
    expect(source).toContain("resolveFraudCheck");
    expect(source).not.toContain("async function checkFraudStatus(");
    expect(source).not.toContain("function parseFraudShieldError(");
  });

  it("authenticates and workspace-scopes every fraud route", () => {
    const routes = [
      routeSection('app.get("/api/fraud/lookup"', 'app.post("/api/fraud/check"'),
      routeSection('app.post("/api/fraud/check"', 'app.get("/api/fraud/usage"'),
      routeSection('app.get("/api/fraud/usage"', 'app.post("/api/check-fraud"'),
    ];

    for (const route of routes) {
      expect(route).toContain("getToken(req)");
      expect(route).toContain("getUser(token)");
      expect(route).toContain('return res.status(401).json({ error: "Unauthorized" })');
      expect(route).toContain("getUserOrg(supabase, user.id)");
    }
  });

  it("never accepts a workspace identifier from the client", () => {
    const fraudRoutes = routeSection('app.get("/api/fraud/lookup"', 'app.post("/api/inbox-orders/check-fraud"');
    expect(fraudRoutes).not.toMatch(/req\.body(?:\?\.)?\.org(?:Id|_id)/);
    expect(fraudRoutes).not.toMatch(/req\.query(?:\?\.)?\.org(?:Id|_id)/);
  });

  it("normalizes the client phone before it reaches the cache or the API", () => {
    const lookup = routeSection('app.get("/api/fraud/lookup"', 'app.post("/api/fraud/check"');
    const check = routeSection('app.post("/api/fraud/check"', 'app.get("/api/fraud/usage"');

    for (const route of [lookup, check]) {
      expect(route).toContain("normalizeBdPhone(");
      expect(route).toContain('return res.status(400).json({ error: "Invalid phone number" })');
    }
  });

  it("keeps the lookup route read-only so opening an order never spends quota", () => {
    const lookup = routeSection('app.get("/api/fraud/lookup"', 'app.post("/api/fraud/check"');

    expect(lookup).toContain("readFraudCache(supabase, orgId, phone)");
    expect(lookup).not.toContain("resolveFraudCheck");
    expect(lookup).not.toContain("fetchFraudShield");
    expect(lookup).not.toContain("incrementUsage");
  });

  it("spends quota only on the explicit check route", () => {
    const check = routeSection('app.post("/api/fraud/check"', 'app.get("/api/fraud/usage"');

    expect(check).toContain("runFraudCheck(supabase, orgId, phone");
    expect(check).toContain('incrementUsage(orgId, "fraud_checks")');
    expect(check).toContain("req.body?.force");
  });

  it("scopes every cache read and write to the resolved workspace", () => {
    const helpers = routeSection("async function readFraudCache", "app.post(\"/api/check-fraud\"");

    expect(helpers).toContain('.from("fraud_checks")');
    expect(helpers).toContain('.eq("org_id", orgId)');
    expect(helpers).toContain("org_id: orgId, phone");
    expect(helpers).toContain('onConflict: "org_id,phone"');
  });

  it("routes the legacy order check through the cache while preserving its contract", () => {
    const legacy = routeSection('app.post("/api/check-fraud"', 'app.post("/api/inbox-orders/check-fraud"');

    expect(legacy).toContain("runFraudCheck(supabase, orgId,");
    expect(legacy).toContain("fraud_checked: true");
    expect(legacy).toContain("fraud_data");
    expect(legacy).toContain('.eq("org_id", orgId)');
    expect(legacy).toContain("fraudError");
  });

  it("routes the legacy inbox check through the cache too", () => {
    const legacy = routeSection('app.post("/api/inbox-orders/check-fraud"', "// ─── Unified Social Inbox");

    expect(legacy).toContain("runFraudCheck(supabase, orgId,");
    expect(legacy).toContain("parseInboxOrderNotes(order.notes)");
    expect(legacy).toContain('.eq("org_id", orgId)');
  });

  it("memoizes the usage proxy so the meter cannot become its own load source", () => {
    const usage = routeSection("async function readFraudUsage", 'app.post("/api/check-fraud"');

    expect(usage).toContain("fraudshield_usage_cache");
    expect(usage).toContain("getSettings(");
    expect(usage).toContain("saveSettings(");
  });
});
