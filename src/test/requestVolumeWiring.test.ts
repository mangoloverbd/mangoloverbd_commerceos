import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("background request volume guards", () => {
  const serverSource = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

  it("lets browsers cache CORS preflights for 24 hours on the global cors middleware", () => {
    const line = serverSource.split("\n").find((l) => l.startsWith("app.use(cors("));
    expect(line).toBeDefined();
    expect(line).toContain("maxAge: 86400");
  });

  it("does not run discarded live visitor counts on every tracker ping", () => {
    const start = serverSource.indexOf('app.post("/api/live-visitor/ping"');
    const route = serverSource.slice(start, serverSource.indexOf('app.get("/api/live-visitors"', start));
    expect(route).not.toContain("countLiveVisitors");
    expect(route).toContain("touchLiveVisitor(org_id, session_id, behaviorBucket)");
    expect(route).toContain("capturePostHogEvent");
  });

  it("writes presence with one bounded database call per ping", () => {
    const start = serverSource.indexOf("async function touchLiveVisitor");
    const fn = serverSource.slice(start, serverSource.indexOf("async function countLiveVisitors", start));
    expect(fn).toContain('rpc("touch_live_visitor"');
    expect(fn).toContain("AbortSignal.timeout(LIVE_PRESENCE_TIMEOUT_MS)");
  });

  it("marks the courier refresh throttle only after both refresh POSTs succeed", () => {
    const dashboard = readFileSync(resolve(process.cwd(), "src/pages/Dashboard.tsx"), "utf8");
    const start = dashboard.indexOf("courierRefreshRanRecently(courierRefreshKey)");
    const block = dashboard.slice(start, dashboard.indexOf("// Sync Shopify", start));
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("res.ok");
    expect(block).toContain("results.every(Boolean)");
    expect(block).toContain("markCourierRefreshRan(courierRefreshKey)");
  });

  it("pings every 20 s so one lost ping does not drop a visitor from the 60 s window", () => {
    expect(serverSource).toContain("const VISITOR_TTL_MS = 60_000;");
    const start = serverSource.indexOf('app.get("/api/tracker.js", publicTrackerCors');
    const route = serverSource.slice(start, serverSource.indexOf('app.post("/api/live-visitor/ping"', start));
    expect(route).toContain("setInterval(heartbeat, 20000)");
  });
});
