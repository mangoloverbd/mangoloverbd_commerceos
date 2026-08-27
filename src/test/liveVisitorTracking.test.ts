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
    expect(serverSource).toContain('`visitors:${org_id}:all`');
    expect(serverSource).toContain('`visitors:${org_id}:${behaviorBucket}`');
    expect(serverSource).toContain("zremrangebyscore");
    expect(serverSource).toContain("zadd");
    expect(serverSource).toContain("VISITOR_TTL_MS");
    expect(serverSource).toContain("liveVisitorBucketFromUrl");
  });

  it("supports explicit behavior events from custom websites", () => {
    const trackerStart = serverSource.indexOf('app.get("/api/tracker.js", publicTrackerCors');
    const trackerEnd = serverSource.indexOf('app.post("/api/live-visitor/ping"', trackerStart);
    const trackerRoute = serverSource.slice(trackerStart, trackerEnd);

    expect(serverSource).toContain("validLiveVisitorBucket");
    expect(serverSource).toContain("validLiveVisitorBucket(bucket) || liveVisitorBucketFromUrl(url)");
    expect(trackerRoute).toContain("window.MerchantSuiteTracker");
    expect(trackerRoute).toContain("track = function(bucket)");
    expect(trackerRoute).toContain("ping(bucket, true)");
  });

  it("records behavior via explicit track calls, not DOM text sniffing", () => {
    const trackerStart = serverSource.indexOf('app.get("/api/tracker.js", publicTrackerCors');
    const trackerEnd = serverSource.indexOf('app.post("/api/live-visitor/ping"', trackerStart);
    const trackerRoute = serverSource.slice(trackerStart, trackerEnd);

    // exposes the explicit tracking API custom websites call on real actions
    expect(trackerRoute).toContain("window.MerchantSuiteTracker");
    expect(trackerRoute).toContain("track = function(bucket)");
    expect(trackerRoute).toContain("function pingCurrentLocation()");
    // must NOT guess behavior from arbitrary clicks/DOM text (false "Active carts")
    expect(trackerRoute).not.toContain("detectBucketFromText");
    expect(trackerRoute).not.toContain("bucketFromElement");
    expect(trackerRoute).not.toContain('addEventListener("click"');
    expect(trackerRoute).not.toContain('addEventListener("submit"');
    // server still classifies cart/checkout/purchased from real page URLs
    expect(serverSource).toContain("liveVisitorBucketFromUrl");
  });

  it("treats purchases only via explicit track or a real confirmation URL", () => {
    const trackerStart = serverSource.indexOf('app.get("/api/tracker.js", publicTrackerCors');
    const trackerEnd = serverSource.indexOf('app.post("/api/live-visitor/ping"', trackerStart);
    const trackerRoute = serverSource.slice(trackerStart, trackerEnd);

    expect(trackerRoute).toContain('window.MerchantSuiteTracker.track = function(bucket){ ping(bucket, true); }');
    // no client-side text sniffing that could mislabel an order attempt as purchased
    expect(trackerRoute).not.toContain("detectBucketFromText");
    expect(trackerRoute).not.toContain('addEventListener("click"');
    expect(trackerRoute).not.toContain('text.indexOf("place order") !== -1) return "purchased"');
    expect(trackerRoute).not.toContain('text.indexOf("complete order") !== -1) return "purchased"');
    // purchases are driven by explicit track("purchased") or server-side URL match
    expect(serverSource).toContain("liveVisitorBucketFromUrl");
    expect(serverSource).toContain('return "purchased"');
  });

  it("keeps live visitor counts isolated to the authenticated user's org", () => {
    const start = serverSource.indexOf('app.get("/api/live-visitors"');
    const end = serverSource.indexOf("//", start + 1);
    const route = serverSource.slice(start, end > start ? end : start + 1200);

    expect(start).toBeGreaterThan(-1);
    expect(route).toContain("await getUser(getToken(req))");
    expect(route).toContain("if (!user) return res.status(401)");
    expect(route).toContain("await getUserOrg(supabase, user.id)");
    expect(route).toContain('`visitors:${orgId}:all`');
    expect(route).toContain('`visitors:${orgId}:cart`');
    expect(route).toContain('`visitors:${orgId}:checkout`');
    expect(route).toContain('`visitors:${orgId}:purchased`');
    expect(route).toContain("details");
    expect(serverSource).toContain("zcount");
  });

  it("falls back to process memory when Redis is not configured", () => {
    expect(serverSource).toContain("memoryLiveVisitors");
    expect(serverSource).toContain("addLiveVisitorPresence");
    expect(serverSource).toContain("countLiveVisitorsForKey");
    expect(serverSource).toContain("falling back to memory");
    expect(serverSource).not.toContain("if (!redisClient) return res.json({ count: 0, tracked: false })");
    expect(serverSource).not.toContain("if (!redisClient) return res.json({ ok: true, tracked: false })");
  });

  it("allows public cross-origin tracker pings from merchant websites", () => {
    expect(serverSource).toContain("publicTrackerCors");
    expect(serverSource).toContain('app.options("/api/live-visitor/ping"');
    expect(serverSource).toContain('app.get("/api/tracker.js", publicTrackerCors');
    expect(serverSource).toContain('app.post("/api/live-visitor/ping", publicTrackerCors');
    expect(serverSource).toContain("allowedHeaders: [\"Content-Type\"]");
  });

  it("uses CORS fetch rather than cross-origin sendBeacon for live pings", () => {
    const trackerStart = serverSource.indexOf('app.get("/api/tracker.js", publicTrackerCors');
    const trackerEnd = serverSource.indexOf('app.post("/api/live-visitor/ping"', trackerStart);
    const trackerRoute = serverSource.slice(trackerStart, trackerEnd);

    expect(trackerRoute).toContain('fetch(endpoint');
    expect(trackerRoute).toContain('mode: "cors"');
    expect(trackerRoute).not.toContain("navigator.sendBeacon");
  });

  it("shows the embed script in Custom Website settings", () => {
    expect(settingsSource).toContain("Live Visitor Tracking");
    expect(settingsSource).toContain("/api/tracker.js?org=");
    expect(settingsSource).toContain("Optional behavior events");
    expect(settingsSource).toContain("MerchantSuiteTracker?.track");
    expect(settingsSource).toContain("PostHog-powered analytics");
    expect(settingsSource).toContain("merchants do not need a PostHog account");
    expect(settingsSource).toContain("useMe");
  });

  it("renders a live visitors counter left of the date picker", () => {
    const hookSource = readFileSync(resolve(process.cwd(), "src/hooks/useLiveVisitors.ts"), "utf8");

    expect(hookSource).toContain("/api/live-visitors");
    expect(hookSource).toContain("setInterval");
    // Dashboard now inlines the counter using liveVisitors hook directly
    expect(dashboardSource).toContain("liveVisitors");
    expect(dashboardSource).toContain("useLiveVisitors");
    expect(dashboardSource).toContain("Online visitors");
    // Detail counts are still surfaced in the hover card / tooltip
    expect(dashboardSource).toContain("liveVisitors.details");
  });

  it("captures live visitor tracker events to PostHog server-side", () => {
    const pingStart = serverSource.indexOf('app.post("/api/live-visitor/ping"');
    const pingEnd = serverSource.indexOf('app.get("/api/live-visitors"', pingStart);
    const pingRoute = serverSource.slice(pingStart, pingEnd);

    expect(serverSource).toContain("async function capturePostHogEvent");
    expect(serverSource).toContain("POSTHOG_PROJECT_API_KEY");
    expect(serverSource).toContain("POSTHOG_HOST");
    expect(serverSource).toContain('event: "merchant_suite_live_visitor"');
    expect(serverSource).toContain('distinct_id: `${orgId}:${sessionId}`');
    expect(serverSource).toContain('source: "custom_website_tracker"');
    expect(serverSource).toContain("explicit: explicit === true");
    expect(serverSource).toContain('[PostHog] capture failed:');
    expect(pingRoute).toContain("referrer");
    expect(pingRoute).toContain("explicit");
    expect(pingRoute).toContain("capturePostHogEvent");
    expect(serverSource).toContain("POSTHOG_CAPTURE_TIMEOUT_MS");
    expect(serverSource).toContain("AbortController");
    expect(pingRoute).toContain("await capturePostHogEvent");
    expect(pingRoute).not.toContain("void capturePostHogEvent");
  });
});
