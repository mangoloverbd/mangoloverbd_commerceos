import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

function section(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

const home = () => section("// ─── Home ───", "\nfunction buildCustomerAiInsight(");
const route = () => section('app.get("/api/home/summary"', "\n});\n");

describe("GET /api/home/summary", () => {
  it("authenticates and resolves the fixed workspace", () => {
    const handler = route();
    expect(handler).toContain("getUser(getToken(req))");
    expect(handler).toMatch(/status\(401\)/);
    expect(handler).toContain("getUserOrg(supabase, user.id)");
    expect(handler).not.toMatch(/req\.(query|body)\.org/);
  });

  it("scopes every table read to the workspace", () => {
    const code = home();
    const reads = code.split(/\.from\(/).slice(1);
    expect(reads.length).toBeGreaterThanOrEqual(8);
    for (const read of reads) {
      expect(read.slice(0, 400)).toContain('.eq("org_id", orgId)');
    }
    for (const rpc of code.matchAll(/\.rpc\("([a-z_]+)", \{([^}]*)\}/g)) {
      expect(rpc[2]).toContain("p_org_id: orgId");
    }
  });

  it("keeps money and conversion away from team members", () => {
    const code = home();
    expect(code).toContain("sales: isAdmin && orders ? metrics.sales : null");
    expect(code).toContain("orders: isAdmin && orders ? metrics.orders : null");
    expect(code).toContain("conversion_rate: isAdmin ? metrics.conversion_rate : null");
    expect(code).toMatch(/`\$\{orgId\}:\$\{isAdmin \? "admin" : "team"\}`/);
  });

  it("lets each source fail without failing the page", () => {
    const code = home();
    for (const label of ["orders", "website report", "live visitors", "live locations", "order queues", "inbox", "abandoned checkouts", "top products"]) {
      expect(code).toContain(`settle("${label}"`);
    }
  });

  it("returns live visitors at city level only", () => {
    const code = home();
    const live = code.slice(code.indexOf("visitors: (liveLocations"), code.indexOf("quick_actions:"));
    expect(live).not.toMatch(/session_id|visitor_id|\bip\b/);
    expect(live).toContain("visitorLocation(visit)");
  });
});
