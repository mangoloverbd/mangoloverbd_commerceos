import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("OrderAnalysis PostHog behavior intelligence", () => {
  const serverSource = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
  const pageSource = readFileSync(resolve(process.cwd(), "src/pages/OrderAnalysis.tsx"), "utf8");

  it("adds an authenticated org-scoped PostHog website behavior endpoint", () => {
    const routeStart = serverSource.indexOf('app.get("/api/order-analysis/website-behavior"');
    const routeEnd = serverSource.indexOf('app.get("/api/business-forecast"', routeStart);
    const route = serverSource.slice(routeStart, routeEnd > routeStart ? routeEnd : routeStart + 1800);

    expect(routeStart).toBeGreaterThan(-1);
    expect(route).toContain("await getUser(getToken(req))");
    expect(route).toContain("if (!user) return res.status(401)");
    expect(route).toContain("await getUserOrg(supabase, user.id)");
    expect(route).toContain("POSTHOG_PERSONAL_API_KEY");
    expect(route).toContain("POSTHOG_PROJECT_ID");
    expect(route).toContain("queryPostHogHogql");
    expect(serverSource).toContain("properties.org_id = {orgId}");
    expect(serverSource).toContain("emptyWebsiteBehaviorPayload(false");
    expect(serverSource).toContain("[PostHog] website behavior query failed:");
    expect(serverSource).toContain("trafficSources");
    expect(serverSource).toContain("extractPostHogTrafficSource");
    expect(serverSource).toContain("utm_source");
    expect(serverSource).toContain("properties.referrer");
    expect(serverSource).toContain("productNameFromUrl");
    expect(serverSource).toContain("productName");
    expect(serverSource).toContain("buildWebsiteBehaviorDropOffBullets");
    expect(serverSource).toContain("summary");
    expect(serverSource).toContain("OPENAI_API_KEY");
    expect(serverSource).toContain("gpt-4o-mini");
    expect(serverSource).toContain("bullets");
    expect(serverSource).toContain("uniqIf(distinct_id, coalesce(properties.bucket, '') = '') AS productViews");
    expect(serverSource).toContain("const purchaseFilter");
    expect(serverSource).toContain("uniqIf(distinct_id, ${purchaseFilter}) AS purchases");
    expect(serverSource).toContain("properties.explicit = true");
    expect(serverSource).toContain("match(coalesce(properties.url, ''),");
    expect(serverSource).not.toContain("countIf(properties.bucket = 'purchased') AS purchases");
  });

  it("renders the approved Option A website behavior panel on Order Analysis", () => {
    const metricCards = pageSource.indexOf("Projected 30D Revenue");
    const behaviorPanel = pageSource.indexOf("<WebsiteBehaviorPanel");
    const salesCalendar = pageSource.indexOf("<GitHubCalendar", behaviorPanel);

    expect(pageSource).toContain("type WebsiteBehaviorResponse");
    expect(pageSource).toContain('/api/order-analysis/website-behavior');
    expect(pageSource).toContain("apiFetch(\"/api/order-analysis/website-behavior\")");
    expect(pageSource).toContain("function WebsiteBehaviorPanel");
    expect(pageSource).toContain("Website Funnel");
    expect(pageSource).toContain("Conversion Drop-off");
    expect(pageSource).toContain("Product Demand Signals");
    expect(pageSource).toContain("Traffic Source Performance");
    expect(pageSource).toContain("trafficSources");
    expect(pageSource).toContain("Funnel Counters");
    expect(pageSource).toContain("metric-card");
    expect(pageSource).toContain('padding: "8px 10px"');
    expect(pageSource).toContain("col-span-full");
    expect(pageSource).toContain("defaultTrafficSources");
    expect(pageSource).toContain('"Facebook"');
    expect(pageSource).toContain('"Instagram"');
    expect(pageSource).toContain('"Google"');
    expect(pageSource).toContain("xl:h-[760px]");
    expect(pageSource).toContain("grid-rows-[minmax(0,1fr)_minmax(0,1fr)]");
    expect(pageSource).toContain("website-behavior-scroll-card");
    expect(pageSource).toContain("min-h-0 overflow-y-auto");
    expect(pageSource).toContain("productName");
    expect(pageSource).toContain("break-all");
    expect(pageSource).toContain("dropOff.bullets");
    expect(pageSource).toContain("dropOff?.summary");
    expect(pageSource).toContain("list-disc");
    expect(pageSource).toContain("best-signal-stat");
    expect(pageSource).not.toContain("PostHog · Last");
    expect(pageSource).not.toContain("maxStepValue");
    expect(pageSource).toContain("WEBSITE_BEHAVIOR_REFETCH_MS");
    expect(pageSource).toContain("refetchInterval: WEBSITE_BEHAVIOR_REFETCH_MS");
    expect(pageSource).toContain("PostHog query credentials are not configured");
    expect(behaviorPanel).toBeGreaterThan(metricCards);
    expect(salesCalendar).toBeGreaterThan(behaviorPanel);
  });
});
