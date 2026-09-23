import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
const route = (method: string, path: string) => {
  const start = source.indexOf(`app.${method}("${path}"`);
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf("\napp.", start + 5);
  return source.slice(start, next < 0 ? undefined : next);
};

it("guards attempt, order, list, and setting APIs with staff auth and admin mutations", () => {
  for (const [method, path] of [
    ["get", "/api/order-protection/attempts"], ["get", "/api/order-protection/attempts/:id"],
    ["get", "/api/orders/:id/risk"], ["get", "/api/order-protection/lists"],
    ["post", "/api/order-protection/lists"], ["delete", "/api/order-protection/lists/:id"],
    ["get", "/api/order-protection/settings"], ["put", "/api/order-protection/settings"],
  ]) {
    const body = route(method, path);
    expect(body).toContain("requireOrderProtectionStaff(req)");
    expect(body).toContain('if (!user) return res.status(401)');
    if (["post", "put", "delete"].includes(method)) expect(body).toContain('role !== "admin"');
  }
  expect(route("get", "/api/order-protection/attempts/:id")).toContain("getRiskAttempt(supabase, { orgId");
  expect(route("get", "/api/orders/:id/risk")).toContain('.eq("org_id", orgId)');
  expect(route("delete", "/api/order-protection/lists/:id")).toContain("deleteListEntry(supabase, { orgId");
});
