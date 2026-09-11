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

describe("abandoned checkout route wiring", () => {
  it("keeps private capture API-key scoped and rejects browser-selected workspaces", () => {
    const capture = routeSection(
      'app.post("/api/custom-orders/abandoned-checkouts"',
      'app.post("/api/custom-orders/webhook"',
    );

    expect(source).toContain("async function resolveCustomStoreOrgId");
    const persistence = routeSection(
      "async function persistAbandonedCheckoutCapture",
      "async function recoverCapturedCheckoutForOrder",
    );
    expect(capture).toContain("resolveCustomStoreOrgId(supabase, apiKey)");
    expect(capture).toContain("parseAbandonedCheckoutCapture(req.body)");
    expect(persistence).toContain('.from("abandoned_checkouts")');
    expect(persistence).toContain('.eq("org_id", orgId)');
    expect(capture).not.toMatch(/req\.body(?:\?\.)?\.org(?:Id|_id)?/);
  });

  it("keys capture rate limits by the trusted client IP forwarded from the storefront proxy", () => {
    const limiter = routeSection(
      "async function allowAbandonedCheckoutCapture",
      "const rateLimitAI",
    );

    expect(limiter).toContain('req.headers["x-storefront-client-ip"]');
    expect(limiter.indexOf('req.headers["x-storefront-client-ip"]')).toBeLessThan(
      limiter.indexOf('req.headers["cf-connecting-ip"]'),
    );
    expect(limiter).toContain("isIP(forwardedClientIp)");
  });

  it("authenticates and workspace-scopes active queue reads and staff mutations", () => {
    const queueRead = routeSection(
      'app.get("/api/abandoned-checkouts"',
      'app.patch("/api/abandoned-checkouts/:id"',
    );
    const queuePatch = routeSection(
      'app.patch("/api/abandoned-checkouts/:id"',
      'app.get("/api/orders/recent-notifications"',
    );

    for (const route of [queueRead, queuePatch]) {
      expect(route).toContain("getToken(req)");
      expect(route).toContain("getUser(token)");
      expect(route).toContain("getUserOrg(supabase, user.id)");
      expect(route).toContain('.eq("org_id", orgId)');
      expect(route).toContain('.gt("expires_at", now.toISOString())');
    }
    expect(queueRead).toContain("ACTIVE_ABANDONED_CHECKOUT_STATUSES");
    expect(queuePatch).toContain("buildStaffActionPatch");
    expect(queuePatch).toContain("isAbandonedCheckoutDraftKey(req.params.id)");
  });

  it("persists a draft-key hash on normal orders and recovers only after the durable order path", () => {
    const webhook = routeSection(
      'app.post("/api/custom-orders/webhook"',
      "// ─── Live Visitor Tracking",
    );

    expect(webhook).toContain("abandoned_checkout_draft_key");
    expect(webhook).toContain("hashAbandonedCheckoutDraftKey");
    expect(webhook).toContain("abandoned_draft_key_hash");
    expect(webhook).toContain("abandoned_checkout_id");
    expect(webhook).toContain('.from("abandoned_checkouts")');
    const recovery = routeSection(
      "async function recoverCapturedCheckoutForOrder",
      'app.post("/api/custom-orders/abandoned-checkouts"',
    );
    expect(webhook).toContain("recoverCapturedCheckoutForOrder");
    expect(recovery).toContain("buildRecoveredPatch");
    expect(webhook.indexOf('rpc("replace_order_items"')).toBeLessThan(
      webhook.indexOf("recoverCapturedCheckoutForOrder"),
    );
  });
});
