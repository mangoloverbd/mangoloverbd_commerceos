import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

function route() {
  const start = source.indexOf('app.get("/api/nav/counts"');
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf("\napp.", start + 10);
  return source.slice(start, end);
}

describe("GET /api/nav/counts", () => {
  it("authenticates and resolves the fixed workspace", () => {
    const section = route();
    expect(section).toContain("getToken(req)");
    expect(section).toContain("getUser(");
    expect(section).toMatch(/status\(401\)/);
    expect(section).toContain("getUserOrg(supabase, user.id)");
  });

  it("returns head-only counts for held reviews and pending returns, scoped to the workspace", () => {
    const section = route();
    expect(section).toMatch(/from\("order_protection_reviews"\)[\s\S]*?\.eq\("org_id", orgId\)[\s\S]*?\.eq\("status", "on_hold"\)/);
    for (const table of ["orders", "social_inbox_orders"]) {
      expect(section).toMatch(new RegExp(`from\\("${table}"\\)[\\s\\S]*?\\.eq\\("org_id", orgId\\)[\\s\\S]*?\\.eq\\("sent_to_courier", true\\)[\\s\\S]*?\\.eq\\("return_status", "pending"\\)`));
    }
    expect(section.match(/head: true/g)?.length).toBe(3);
    expect(section).toContain("order_protection_held");
    expect(section).toContain("returns_pending");
  });
});
