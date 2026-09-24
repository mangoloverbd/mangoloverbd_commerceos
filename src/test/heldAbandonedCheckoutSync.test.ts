import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProtectionRejectedPatch } from "../../server/abandonedCheckouts.js";

const server = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
const store = readFileSync(resolve(process.cwd(), "server/orderProtectionStore.js"), "utf8");

function between(start: string, end: string) {
  const from = server.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = server.indexOf(end, from + start.length);
  expect(to).toBeGreaterThan(from);
  return server.slice(from, to);
}

describe("held orders keep the abandoned checkout in sync", () => {
  it("adds a nullable review → abandoned checkout link", () => {
    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260925000000_order_protection_reviews_abandoned_checkout.sql"), "utf8");
    expect(sql).toMatch(/^begin;$/m);
    expect(sql).toMatch(/^commit;$/m);
    expect(sql).toContain("add column if not exists abandoned_checkout_id uuid null");
    expect(sql).toMatch(/references public\.abandoned_checkouts\(id\) on delete set null/);
    expect(sql).toContain("where abandoned_checkout_id is not null");
  });

  it("dismisses a rejected hold's checkout with a clear resolution", () => {
    const now = new Date("2026-09-25T06:00:00.000Z");
    expect(buildProtectionRejectedPatch(now)).toEqual({ status: "dismissed", resolved_at: now.toISOString(), resolution: "rejected_in_order_protection" });
  });

  it("links the held review to the shopper's active abandoned checkout", () => {
    // Storefront checkout (the custom webhook never holds; see risk pipeline).
    const hold = between('orgId, route: "public_v1"', "return res.status(202)");
    expect(hold).toContain("linkHeldReviewToAbandonedCheckout(");
    const helper = between("async function linkHeldReviewToAbandonedCheckout", "\n}\n");
    expect(helper).toMatch(/from\("abandoned_checkouts"\)[\s\S]*?\.eq\("org_id", orgId\)[\s\S]*?\.eq\("draft_key", draftKey\)[\s\S]*?\.in\("status", ACTIVE_ABANDONED_CHECKOUT_STATUSES\)/);
    expect(helper).toMatch(/from\("order_protection_reviews"\)[\s\S]*?update\(\{ abandoned_checkout_id: checkout\.id \}\)[\s\S]*?\.eq\("org_id", orgId\)/);
  });

  it("recovers the checkout on approve and dismisses it on reject", () => {
    const approve = between("async function approveHeldProtectionReview", 'app.get("/api/order-protection');
    expect(approve).toContain("recoverCapturedCheckoutForOrder(supabase, orgId, review.abandoned_checkout_id");
    const reject = between('app.patch("/api/order-protection/reviews/:id"', "\napp.");
    expect(reject).toContain("dismissHeldAbandonedCheckout(supabase, orgId, data.abandoned_checkout_id");
    const dismiss = between("async function dismissHeldAbandonedCheckout", "\n}\n");
    expect(dismiss).toMatch(/update\(buildProtectionRejectedPatch\(now\)\)[\s\S]*?\.eq\("org_id", orgId\)[\s\S]*?\.in\("status", ACTIVE_ABANDONED_CHECKOUT_STATUSES\)/);
  });

  it("flags abandoned checkouts that are held in Order Protection", () => {
    const list = between('app.get("/api/abandoned-checkouts"', 'app.patch("/api/abandoned-checkouts/:id"');
    expect(list).toMatch(/from\("order_protection_reviews"\)[\s\S]*?\.eq\("org_id", orgId\)[\s\S]*?\.eq\("status", "on_hold"\)[\s\S]*?\.in\("abandoned_checkout_id"/);
    expect(list).toContain("protection_review_id");
  });

  it("does not store the raw draft key on the review", () => {
    expect(store).not.toContain("draft_key");
  });
});

describe("converting an abandoned checkout that was held", () => {
  it("links the new order to the hold's risk check and closes the pending review", () => {
    const convert = between('app.post("/api/abandoned-checkouts/:id/convert"', 'app.get("/api/orders/recent-notifications"');
    expect(convert).toContain("closeHeldReviewForConvertedCheckout(supabase, orgId, draft.id, order.id)");
    const helper = between("async function closeHeldReviewForConvertedCheckout", "\n}\n");
    expect(helper).toMatch(/from\("order_protection_reviews"\)[\s\S]*?\.eq\("org_id", orgId\)[\s\S]*?\.eq\("abandoned_checkout_id", checkoutId\)/);
    expect(helper).toContain("finalizeOrderRisk({ supabase, orgId, attemptId: review.attempt_id, orderId })");
    expect(helper).toMatch(/update\(\{ status: "approved"[\s\S]*?\.eq\("status", "on_hold"\)[\s\S]*?\.is\("approval_claimed_at", null\)/);
  });

  it("tells the risk tab when an order came from an abandoned checkout", () => {
    const risk = between('app.get("/api/orders/:id/risk"', "\napp.");
    expect(risk).toContain("origin_source");
    expect(risk).toContain('no_check_reason: !attempt && order.origin_source === "abandoned_checkout" ? "abandoned_checkout" : null');
  });
});
