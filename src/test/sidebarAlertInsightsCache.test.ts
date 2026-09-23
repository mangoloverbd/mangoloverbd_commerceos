import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  SIDEBAR_INSIGHTS_TTL_SECONDS,
  createSidebarInsightsCache,
  sidebarInsightsCacheKey,
} from "../../server/sidebarAlertInsightsCache.js";

const orgId = "11111111-1111-1111-1111-111111111111";
const insights = { stalePending: { headline: "h", insight: "i" }, unsentConfirmed: null };

describe("sidebar AI insights cache", () => {
  it("builds an org-scoped key that ignores alert order", () => {
    const a = sidebarInsightsCacheKey(orgId, [{ id: "b", type: "stale_pending" }, { id: "a", type: "unsent_confirmed" }]);
    const b = sidebarInsightsCacheKey(orgId, [{ id: "a", type: "unsent_confirmed" }, { id: "b", type: "stale_pending" }]);
    const otherOrg = sidebarInsightsCacheKey("22222222-2222-2222-2222-222222222222", [{ id: "a", type: "unsent_confirmed" }, { id: "b", type: "stale_pending" }]);

    expect(a).toBe(b);
    expect(a).toContain(orgId);
    expect(otherOrg).not.toBe(a);
  });

  it("computes once for the same alert set and again when the set changes (memory fallback)", async () => {
    const cache = createSidebarInsightsCache({ redis: null });
    const compute = vi.fn(async () => ({ value: insights, cacheable: true }));
    const alerts = [{ id: "a", type: "stale_pending" }];

    expect(await cache(orgId, alerts, compute)).toEqual(insights);
    expect(await cache(orgId, [...alerts], compute)).toEqual(insights);
    expect(compute).toHaveBeenCalledTimes(1);

    await cache(orgId, [...alerts, { id: "b", type: "unsent_confirmed" }], compute);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("expires memory entries after 15 minutes", async () => {
    let now = 1_000_000;
    const cache = createSidebarInsightsCache({ redis: null, now: () => now });
    const compute = vi.fn(async () => ({ value: insights, cacheable: true }));
    const alerts = [{ id: "a", type: "stale_pending" }];

    await cache(orgId, alerts, compute);
    now += SIDEBAR_INSIGHTS_TTL_SECONDS * 1000 + 1;
    await cache(orgId, alerts, compute);
    expect(SIDEBAR_INSIGHTS_TTL_SECONDS).toBe(900);
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("does not cache non-cacheable results such as the OpenAI-failure fallback", async () => {
    const store = new Map<string, unknown>();
    const redis = {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => { store.set(key, value); return "OK"; }),
    };
    const cache = createSidebarInsightsCache({ redis });
    const compute = vi.fn(async () => ({ value: insights, cacheable: false }));
    const alerts = [{ id: "a", type: "stale_pending" }];

    expect(await cache(orgId, alerts, compute)).toEqual(insights);
    expect(await cache(orgId, alerts, compute)).toEqual(insights);
    expect(compute).toHaveBeenCalledTimes(2);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("uses Redis get/set with a 15 minute EX when a client exists", async () => {
    const store = new Map<string, unknown>();
    const redis = {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: unknown) => { store.set(key, value); return "OK"; }),
    };
    const cache = createSidebarInsightsCache({ redis });
    const compute = vi.fn(async () => ({ value: insights, cacheable: true }));
    const alerts = [{ id: "a", type: "stale_pending" }];

    await cache(orgId, alerts, compute);
    expect(await cache(orgId, alerts, compute)).toEqual(insights);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(expect.stringContaining(orgId), insights, { ex: 900 });
  });

  it("falls back to memory when Redis errors", async () => {
    const redis = {
      get: vi.fn(async () => { throw new Error("down"); }),
      set: vi.fn(async () => { throw new Error("down"); }),
    };
    const cache = createSidebarInsightsCache({ redis });
    const compute = vi.fn(async () => ({ value: insights, cacheable: true }));
    const alerts = [{ id: "a", type: "stale_pending" }];

    await cache(orgId, alerts, compute);
    await cache(orgId, alerts, compute);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("is wired into GET /api/sidebar-alerts with the resolved org id", () => {
    const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
    const start = source.indexOf('app.get("/api/sidebar-alerts"');
    const route = source.slice(start, source.indexOf("app.", start + 30));

    expect(route).toContain("await getUserOrg(supabase, user.id)");
    expect(route).toContain("getCachedSidebarInsights(orgId, alerts, async () => {");
    expect(route).toContain("return { value: insights, cacheable: fromAI };");
    expect(source).toContain("return { insights: fallback, fromAI: false };");
    expect(source).toContain("createSidebarInsightsCache({ redis: redisClient })");
  });
});
