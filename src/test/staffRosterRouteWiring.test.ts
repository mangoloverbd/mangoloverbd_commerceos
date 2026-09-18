import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

function routeSection(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("GET /api/staff", () => {
  const staff = () =>
    routeSection('app.get("/api/staff"', 'app.get("/api/team-members"');

  it("is guarded by auth but not restricted to admins", () => {
    const section = staff();
    expect(section).toContain("getUser(getToken(req))");
    expect(section).toMatch(/status\(401\)/);
    expect(section).not.toContain("requireAdmin");
  });

  it("uses the resolved workspace to read staff", () => {
    const section = staff();
    expect(section).toContain("getUserOrg(supabase, user.id)");
    expect(section).toContain('.eq("org_id", orgId)');
    expect(section).toContain('.is("deleted_at", null)');
  });

  it("returns only dropdown-safe staff details", () => {
    const section = staff();
    expect(section).toContain('select("user_id, display_name")');
    expect(section).toContain("display_name");
    expect(section).not.toContain("getAuthUserEmail");
    expect(section).not.toMatch(/\brole\b/);
  });
});

describe("PATCH /api/team-members/:id", () => {
  const rename = () =>
    routeSection(
      'app.patch("/api/team-members/:id"',
      'app.delete("/api/team-members/:id"',
    );

  it("is admin-only and workspace-scoped", () => {
    const section = rename();
    expect(section).toContain("requireAdmin");
    expect(section).toContain('.eq("org_id", orgId)');
  });

  it("only writes a bounded display name", () => {
    const section = rename();
    expect(section).toContain("display_name");
    expect(section).toContain("slice(0, 80)");
    expect(section).not.toContain("role:");
    expect(section).not.toContain("org_id:");
  });
});

describe("DELETE /api/team-members/:id", () => {
  it("archives the role before soft-deleting Auth so named attribution survives", () => {
    const section = routeSection(
      'app.delete("/api/team-members/:id"',
      '// ─── App Settings Endpoints',
    );

    expect(section).toContain("supabase.auth.admin.deleteUser(member.user_id, true)");
    expect(section).toContain("deleted_at");
    expect(section).toMatch(/\.from\("user_roles"\)[\s\S]*?\.update\(\{ deleted_at:/);
    expect(section).toContain("update({ deleted_at: null })");
    expect(section).not.toMatch(/\.from\("user_roles"\)\s*\.delete\(\)/);
  });
});

describe("active staff authorization", () => {
  it("does not grant archived roles access or assignment eligibility", () => {
    const authHelpers = routeSection(
      "async function findFirstAdminOrg",
      "function customStoreApiKeyFromRequest",
    );
    const assigneeGuard = routeSection(
      "async function assertWorkspaceMember",
      "async function recordStatusEvent",
    );

    expect(authHelpers).toContain('select("org_id, role, deleted_at")');
    expect(authHelpers).toContain("if (existingRole?.deleted_at) return null;");
    expect(authHelpers).toContain('.is("deleted_at", null)');
    expect(assigneeGuard).toContain('.is("deleted_at", null)');
  });
});
