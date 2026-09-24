import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

function sliceFrom(marker: string, endMarker: string) {
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf(endMarker, start + marker.length));
}

describe("GET /api/analytics caching wiring", () => {
  const route = sliceFrom('app.get("/api/analytics"', "// ─── AI Business Forecast");

  it("selects only the order columns the computation reads, org-scoped", () => {
    expect(route).toContain('.from("orders").select("id, created_at, price, delivery_rate, product").eq("org_id", orgId)');
    expect(route).not.toContain('select("*")');
  });

  it("caches the computed payload per org and date range after auth", () => {
    expect(source).toContain('createTtlCache({ redis: redisClient, prefix: "analytics:" })');
    expect(route).toContain("await getUserOrg(supabase, user.id)");
    expect(route).toContain("const cacheKey = `${orgId}:${since || \"\"}:${until || \"\"}`;");
    expect(route).toContain("until && until < todayDhaka() ? 10 * 60 * 1000 : 60 * 1000");
    expect(route).toContain("analyticsCache.get(cacheKey, ttlMs, async () => {");
    expect(route).toContain("return { value: response, cacheable: !fbError };");
    expect(route).toContain("return res.json(payload);");
    expect(route.indexOf("await getUserOrg(")).toBeLessThan(route.indexOf("analyticsCache.get("));
  });
});

describe("auth lookup caching wiring", () => {
  it("serves getUser and getUserOrg from the per-instance auth cache", () => {
    const getUserFn = sliceFrom("async function getUser(token)", "async function getUserOrg");
    expect(getUserFn).toContain("authCache.getUser(token)");
    expect(getUserFn).toContain("authCache.setUser(token, user.id, { user })");
    expect(getUserFn).toContain("authCache.setOrg(user.id, { orgId: existingRole.org_id, role: existingRole.role })");
    // Failures and missing roles are returned before anything is cached.
    expect(getUserFn.indexOf("missingRole: true")).toBeLessThan(getUserFn.indexOf("authCache.setUser("));

    const getUserOrgFn = sliceFrom("async function getUserOrg", "function customStoreApiKeyFromRequest");
    expect(getUserOrgFn).toContain("authCache.getOrg(userId)");
    expect(getUserOrgFn.indexOf("err.statusCode = 403")).toBeLessThan(getUserOrgFn.indexOf("authCache.setOrg("));
  });

  it("skips the admin upsert when the stored row already matches", () => {
    const fn = sliceFrom("async function ensureUserRole", "async function getUser(token)");
    expect(fn).toContain('if (existingRole?.role === "admin" && existingRole?.org_id === user.id) return existingRole;');
  });

  it("invalidates cached auth after every user_roles write", () => {
    const writes = [...source.matchAll(/\.from\("user_roles"\)\s*\.(upsert|update|insert|delete)\(/g)];
    expect(writes.length).toBeGreaterThanOrEqual(10);
    for (const match of writes) {
      const after = source.slice(match.index, match.index + 900);
      expect(after, `write at offset ${match.index}`).toContain("invalidateAuthCacheForUser(");
    }
  });
});
