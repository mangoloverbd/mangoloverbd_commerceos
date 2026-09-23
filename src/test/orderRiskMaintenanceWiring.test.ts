import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const server = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

describe("daily risk retention", () => {
  it("runs only after cron auth and catches cleanup failures without logging personal data", () => {
    expect(server).toMatch(/import\s*\{\s*scrubExpiredRiskAttempts\s*\}\s*from\s*"\.\/risk\/store\.js"/);
    const start = server.indexOf('app.get("/api/internal/abandoned-checkouts-maintenance"');
    const end = server.indexOf("// Pre-fetches risk data", start);
    expect(start).toBeGreaterThan(-1);
    const route = server.slice(start, end);
    expect(route.indexOf("isAuthorizedCronRequest(req.headers.authorization, process.env.CRON_SECRET)"))
      .toBeLessThan(route.indexOf("scrubExpiredRiskAttempts"));
    expect(route).toMatch(/try\s*\{[\s\S]*?await scrubExpiredRiskAttempts\(getServiceSupabase\(\)\)[\s\S]*?\}\s*catch\s*\{\s*console\.warn\("\[OrderRisk\] maintenance failed"\);\s*\}/);
    expect(route.indexOf("runAbandonedCheckoutMaintenance()"))
      .toBeLessThan(route.indexOf("scrubExpiredRiskAttempts"));
  });
});
