import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const source = readFileSync("server/index.js", "utf8");
it("labels staff outcomes after the saved order and links approved reviews", () => {
  const patch = source.slice(source.indexOf('app.patch("/api/orders/:id"'), source.indexOf('app.post("/api/orders/:id/send-sms"'));
  expect(patch).toContain("await labelOrderRiskAttempt(supabase, orgId, data)");
  const approve = source.slice(source.indexOf("async function approveHeldProtectionReview"), source.indexOf('app.get("/api/order-protection/reviews"'));
  expect(approve).toContain("await finalizeOrderRisk({ supabase, orgId, attemptId: review.attempt_id, orderId: order.id })");
});

it("labels actual courier deliveries but not partial deliveries", () => {
  const courier = source.slice(source.indexOf('.select("id, consignment_id, tracking_code, courier_status, status, courier_name, courier_message, risk_attempt_id")'), source.indexOf('app.get("/api/order-protection/reviews"'));
  expect(courier).toContain("await labelOrderRiskAttempt(supabase, orgId, { ...order, ...patch })");
  expect(courier).toContain("await labelOrderRiskAttempt(supabase, order.org_id, { ...order, ...patch })");
});
