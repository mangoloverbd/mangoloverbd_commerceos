import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
const vercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"));

function routeSection(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("fraud warm cron", () => {
  it("is not scheduled — automated warming is disabled to protect the daily quota", () => {
    const cron = vercelConfig.crons.find((c: { path: string }) => c.path === "/api/internal/fraud-warm");
    expect(cron).toBeUndefined();
  });

  it("rejects unauthenticated callers with the shared cron secret check", () => {
    const route = routeSection('app.get("/api/internal/fraud-warm"', "// Apex (<=2 labels");

    expect(route).toContain("isAuthorizedCronRequest(req.headers.authorization, process.env.CRON_SECRET)");
    expect(route).toContain('return res.status(401).json({ error: "Unauthorized" })');
  });

  it("fails closed without spending a FraudShield request", () => {
    const route = routeSection('app.get("/api/internal/fraud-warm"', "// Apex (<=2 labels");

    expect(route).toContain("disabled");
    expect(route).not.toContain("warmFraudChecksForOrg");
    expect(route).not.toContain("runFraudCheck");
  });

  it("checks remaining quota before draining and holds back the reserve", () => {
    const warm = routeSection("async function warmFraudChecksForOrg", 'app.get("/api/internal/fraud-warm"');

    expect(warm).toContain("readFraudUsage(orgId)");
    expect(warm).toContain("shouldWarm(");
    expect(warm).toContain("FRAUD_QUOTA_RESERVE");
  });

  it("selects a bounded, workspace-scoped, recent batch", () => {
    const warm = routeSection("async function warmFraudChecksForOrg", 'app.get("/api/internal/fraud-warm"');

    expect(warm).toContain("selectPhonesToWarm(");
    expect(warm).toContain("FRAUD_WARM_BATCH");
    expect(warm).toContain("FRAUD_WARM_LOOKBACK_DAYS");
    expect(warm).toContain('.from("orders")');
    expect(warm).toContain('.from("fraud_checks")');
    expect(warm.match(/\.eq\("org_id", orgId\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("spaces calls out instead of firing the batch in parallel", () => {
    const warm = routeSection("async function warmFraudChecksForOrg", 'app.get("/api/internal/fraud-warm"');

    expect(warm).toContain("FRAUD_WARM_SPACING_MS");
    expect(warm).toContain("runFraudCheck(supabase, orgId, phone)");
    expect(warm).not.toContain("Promise.all");
  });
});
