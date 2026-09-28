import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

function sectionBetween(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("GET /api/reports/business", () => {
  const route = () => sectionBetween('app.get("/api/reports/business"', "// ─── Analytics");

  it("authenticates, resolves the fixed workspace, and rejects non-admin callers", () => {
    const section = route();

    expect(section).toContain("const token = getToken(req)");
    expect(section).toContain("getUser(token)");
    expect(section).toMatch(/status\(401\)/);
    expect(section).toContain("getUserOrg(supabase, user.id)");
    expect(section).toContain('role !== "admin"');
    expect(section).toMatch(/status\(403\)/);
  });

  it("reads only required workspace-scoped regular-order fields through keyset pages", () => {
    const section = route();

    expect(section).toContain("fetchReportPages");
    expect(section).toMatch(/\.from\("orders"\)[\s\S]*?\.eq\("org_id", orgId\)/);
    expect(section).toContain("landing_page_path");
    expect(section).toContain("delivery_rate");
    expect(section).toContain("courier_fee");
    expect(section).toContain("return_status");
    expect(section).toContain("fulfillment_status");
    expect(section).toContain("weight_kg");
    expect(section).toContain("order_items(");
    expect(section).toMatch(/from\("products"\)[\s\S]*?\.eq\("org_id", orgId\)/);
    expect(section).toMatch(/from\("product_variants"\)[\s\S]*?\.eq\("org_id", orgId\)/);
    expect(section).toContain('.gte("created_at", request.since)');
    expect(section).toContain('.lt("created_at", request.until)');
    expect(section).not.toContain('from("social_inbox_orders")');
  });

  it("reads the previous period with a separate lean workspace-scoped query", () => {
    const section = route();
    const previousQuery = section.match(/\.from\("orders"\)\s*\.select\(([^)]*)\)\s*\.eq\("org_id", orgId\)\s*\.gte\("created_at", previousRequest\.since\)\s*\.lt\("created_at", previousRequest\.until\)/);

    expect(previousQuery).not.toBeNull();
    const selectArg = previousQuery?.[1] ?? "";
    const leanFields = selectArg.startsWith('"') ? selectArg : (section.match(new RegExp(`const ${selectArg} = ("[^"]*")`))?.[1] ?? "");
    expect(leanFields).toContain("created_at");
    expect(leanFields).not.toContain("order_items(");
    expect(section).not.toContain("windowStart");
  });

  it("delegates input validation and output aggregation to the pure module", () => {
    const section = route();

    expect(source).toContain('from "./businessReport.js"');
    expect(section).toContain("resolveBusinessReportRequest");
    expect(section).toContain("from: req.query.from");
    expect(section).toContain("to: req.query.to");
    expect(section).toContain("resolvePreviousBusinessReportRequest(request)");
    expect(section).toContain("buildBusinessReport([...orders, ...previousOrders], request, { products, variants, previousRequest })");
  });
});

describe("report pagination helper", () => {
  it("uses stable id keyset pagination instead of offset ranges", () => {
    const helper = sectionBetween("async function fetchReportPages", 'app.get("/api/reports/staff"');

    expect(helper).toContain('.order("id", { ascending: true })');
    expect(helper).toContain("let lastId = null");
    expect(helper).toContain('.gt("id", lastId)');
    expect(helper).toContain(".limit(pageSize)");
    expect(helper).not.toContain(".range(");
  });
});
