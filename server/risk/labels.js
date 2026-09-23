import { labelRiskAttempt } from "./store.js";

export const FAKE_CANCELLATION_CODES = ["fraud_or_suspicious", "test_or_fake_order"];

export function labelForOrder(order) {
  const status = String(order?.courier_status || "").toLowerCase();
  if (["delivered", "delivered_approval_pending"].includes(status)) return "genuine";
  if (String(order?.status || "").toLowerCase() === "cancelled" && FAKE_CANCELLATION_CODES.includes(order?.cancellation_reason_code)) return "fake";
  return null;
}

export async function labelOrderRiskAttempt(supabase, orgId, order) {
  const label = labelForOrder(order);
  if (!orgId || !order?.risk_attempt_id || !label) return;
  try { await labelRiskAttempt(supabase, { orgId, attemptId: order.risk_attempt_id, label }); }
  catch { console.warn("[OrderRisk] outcome label unavailable"); }
}
