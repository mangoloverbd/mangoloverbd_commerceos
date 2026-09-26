import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

describe("orders exact-count response", () => {
  it("returns an exact count with the existing workspace-scoped order list", () => {
    const routeStart = source.indexOf('app.get("/api/orders"');
    const routeEnd = source.indexOf("const ABANDONED_CHECKOUT_DASHBOARD_FIELDS", routeStart);
    expect(routeStart).toBeGreaterThanOrEqual(0);
    expect(routeEnd).toBeGreaterThan(routeStart);
    const route = source.slice(routeStart, routeEnd);

    expect(route).toContain("getUserOrg(supabase, user.id)");
    expect(route).toContain('.eq("org_id", orgId)');
    // Exact count on the first page of the paged full list.
    expect(route).toMatch(/\.select\("\*",\s*withCount \? \{\s*count:\s*"exact"\s*\} : undefined\)/);
    expect(route).toContain("totalCount: count ?? allOrders.length");
  });
});
