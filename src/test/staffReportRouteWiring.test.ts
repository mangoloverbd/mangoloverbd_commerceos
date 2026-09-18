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

describe("GET /api/reports/staff", () => {
  const route = () => sectionBetween(
    'app.get("/api/reports/staff"',
    "// ─── Analytics",
  );

  it("authenticates first and resolves the fixed workspace before every report read", () => {
    const section = route();

    expect(section).toContain("const token = getToken(req)");
    expect(section).toContain("getUser(token)");
    expect(section).toMatch(/status\(401\)/);
    expect(section).toContain("getUserOrg(supabase, user.id)");
    expect(section).toMatch(/\.from\("user_roles"\)[\s\S]*?\.eq\("org_id", orgId\)/);
    expect(section).toMatch(/\.from\("orders"\)[\s\S]*?\.eq\("org_id", orgId\)/);
    expect(section).toMatch(/\.from\("social_inbox_orders"\)[\s\S]*?\.eq\("org_id", orgId\)/);
    expect(section).toMatch(/\.from\("order_items"\)[\s\S]*?\.eq\("org_id", orgId\)/);
    expect(section).toMatch(/\.from\("products"\)[\s\S]*?\.eq\("org_id", orgId\)/);
  });

  it("delegates date and role validation to the pure request resolver", () => {
    const section = route();

    expect(section).toContain("resolveStaffReportRequest");
    expect(section).toContain("role");
    expect(section).toContain("userId: user.id");
    expect(section).toContain("users: req.query.users");
  });

  it("retains former names for admins but does not disclose a full roster to team members", () => {
    const section = route();

    expect(section).toContain("deleted_at");
    expect(section).toContain("is_active");
    expect(section).toContain('role === "team_member"');
    expect(section).toContain("available_staff");
  });

  it("pages every report source and batches unbounded id filters", () => {
    const section = route();

    expect(section).toContain("fetchStaffReportPages");
    expect(section).toMatch(/fetchStaffReportPages\(\(\) => supabase[\s\S]*?\.from\("user_roles"\)[\s\S]*?\.eq\("org_id", orgId\)/);
    expect(section).toContain("chunkIds(request.selectedUserIds)");
    expect(section).toContain("chunkIds(confirmedOrderIds)");
    expect(section).toContain("mergeStaffReportRows");
  });
});

describe("staff report pagination helper", () => {
  it("uses a stable id order and fixed Supabase ranges", () => {
    const helper = sectionBetween(
      "async function fetchStaffReportPages",
      'app.get("/api/reports/staff"',
    );

    expect(helper).toContain('.order("id", { ascending: true })');
    expect(helper).toContain(".range(from, to)");
    expect(helper).toContain("if (rows.length < pageSize) break;");
  });
});
