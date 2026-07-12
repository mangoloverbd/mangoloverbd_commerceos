import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("live visitor tracking", () => {
  const serverSource = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
  const dashboardSource = readFileSync(resolve(process.cwd(), "src/pages/Dashboard.tsx"), "utf8");
  const settingsSource = readFileSync(resolve(process.cwd(), "src/components/IntegrationSettings.tsx"), "utf8");

  it("serves a tenant-scoped public tracker script and records pings in Redis", () => {
    expect(serverSource).toContain('app.get("/api/tracker.js"');
    expect(serverSource).toContain('app.post("/api/live-visitor/ping"');
    expect(serverSource).toContain('`visitors:${org_id}`');
    expect(serverSource).toContain("zremrangebyscore");
    expect(serverSource).toContain("zadd");
    expect(serverSource).toContain("VISITOR_TTL_MS");
  });

  it("keeps live visitor counts isolated to the authenticated user's org", () => {
    const start = serverSource.indexOf('app.get("/api/live-visitors"');
    const end = serverSource.indexOf("//", start + 1);
    const route = serverSource.slice(start, end > start ? end : start + 1200);

    expect(start).toBeGreaterThan(-1);
    expect(route).toContain("await getUser(getToken(req))");
    expect(route).toContain("if (!user) return res.status(401)");
    expect(route).toContain("await getUserOrg(supabase, user.id)");
    expect(route).toContain('`visitors:${orgId}`');
    expect(route).toContain("zcount");
  });

  it("shows the embed script in Custom Website settings", () => {
    expect(settingsSource).toContain("Live Visitor Tracking");
    expect(settingsSource).toContain("/api/tracker.js?org=");
    expect(settingsSource).toContain("useMe");
  });

  it("renders a live visitors counter left of the date picker", () => {
    const headerStart = dashboardSource.indexOf("<LiveVisitorsCounter />");
    const pickerStart = dashboardSource.indexOf("<DateRangePicker", headerStart);

    expect(dashboardSource).toContain("function LiveVisitorsCounter");
    expect(dashboardSource).toContain('/api/live-visitors');
    expect(headerStart).toBeGreaterThan(-1);
    expect(pickerStart).toBeGreaterThan(headerStart);
  });
});
