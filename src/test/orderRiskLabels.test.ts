import { expect, it, vi } from "vitest";
import { FAKE_CANCELLATION_CODES, labelForOrder, labelOrderRiskAttempt } from "../../server/risk/labels.js";

it("labels only confirmed fake cancellations or delivered orders", () => {
  expect(FAKE_CANCELLATION_CODES).toEqual(["fraud_or_suspicious", "test_or_fake_order"]);
  expect(labelForOrder({ status: "cancelled", cancellation_reason_code: "fraud_or_suspicious" })).toBe("fake");
  expect(labelForOrder({ status: "cancelled", cancellation_reason_code: "customer_unreachable" })).toBeNull();
  expect(labelForOrder({ courier_status: "Delivered_Approval_Pending" })).toBe("genuine");
  expect(labelForOrder({ courier_status: "partial_delivered" })).toBeNull();
});

it("does not affect order processing if a label cannot be written", async () => {
  const from = vi.fn(() => ({ update: () => { throw new Error("down"); } }));
  await expect(labelOrderRiskAttempt({ from }, "20000000-0000-0000-0000-000000000001", { risk_attempt_id: "30000000-0000-0000-0000-000000000001", courier_status: "delivered" })).resolves.toBeUndefined();
  await labelOrderRiskAttempt({ from }, "20000000-0000-0000-0000-000000000001", { risk_attempt_id: null, courier_status: "delivered" });
  expect(from).toHaveBeenCalledTimes(1);
});
