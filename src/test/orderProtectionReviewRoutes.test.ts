import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

describe("order protection review routes", () => {
  it("adds authenticated review and scrubbed event endpoints", () => {
    expect(source).toContain('app.get("/api/order-protection/reviews"');
    expect(source).toContain('app.get("/api/order-protection/events"');
    expect(source).toContain('app.patch("/api/order-protection/reviews/:id"');
    expect(source).toContain('getUser(getToken(req))');
    expect(source).toContain('listProtectionReviews({ supabase, orgId');
    expect(source).toContain('from("order_protection_events")');
  });

  it("keeps review mutations workspace-scoped and status-guarded", () => {
    const routeStart = source.indexOf('app.patch("/api/order-protection/reviews/:id"');
    const route = source.slice(routeStart, routeStart + 12_000);
    expect(route).toContain('.eq("org_id", orgId)');
    expect(route).toContain('.eq("status", "on_hold")');
    expect(route).toContain("approveHeldProtectionReview");
    expect(route).toContain('action === "approve"');
  });

  it("claims a held review before creating an order", () => {
    const approval = source.slice(source.indexOf("async function approveHeldProtectionReview"), source.indexOf('app.get("/api/order-protection/reviews"'));
    expect(approval).toContain("approval_claimed_at");
    expect(approval).toContain('.is("approval_claimed_at", null)');
    expect(approval).toContain('update({ approval_claimed_at:');
  });
});
