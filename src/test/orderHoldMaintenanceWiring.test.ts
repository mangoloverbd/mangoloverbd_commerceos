import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serverSource = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
const routeStart = serverSource.indexOf('app.get("/api/internal/abandoned-checkouts-maintenance"');
const routeEnd = serverSource.indexOf("\n});", routeStart) + 4;
const maintenanceRoute = serverSource.slice(routeStart, routeEnd);

describe("scheduled order hold maintenance wiring", () => {
  it("runs within the existing CRON_SECRET-protected daily maintenance route", () => {
    expect(maintenanceRoute).toContain("isAuthorizedCronRequest");
    expect(maintenanceRoute).toContain("process.env.CRON_SECRET");
    expect(maintenanceRoute).toContain("releaseDueOrderHolds");
    expect(maintenanceRoute).toContain("releasedHolds");
  });

  it("resolves the fixed workspace from user roles rather than accepting an org id from the request", () => {
    expect(serverSource).toMatch(/from\("user_roles"\)[\s\S]{0,80}select\("org_id"\)/);
    expect(serverSource).toMatch(/releaseDueOrderHolds\(\{[\s\S]{0,100}orgId:\s*workspaceIds\[0\]/);
    expect(maintenanceRoute).not.toContain("req.query.org_id");
    expect(maintenanceRoute).not.toContain("req.body.org_id");
  });
});
