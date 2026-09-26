import { describe, expect, it } from "vitest";
import {
  getBangladeshDateKey,
  isScheduledOrderHoldDue,
  ORDER_HOLD_REASONS,
  validateOrderHoldDetails,
} from "../../shared/orderHold.js";

describe("order hold reasons and dates", () => {
  it("exposes all approved reasons with the agreed Bengali labels", () => {
    expect(ORDER_HOLD_REASONS).toEqual([
      { code: "customer_requested_after_date", label: "গ্রাহক নির্দিষ্ট তারিখের পরে পার্সেল নিতে চান", requiresReturnDate: true },
      { code: "contact_later", label: "গ্রাহক পরে যোগাযোগ করতে বলেছেন", requiresReturnDate: false },
      { code: "awaiting_customer_confirmation", label: "গ্রাহকের নিশ্চিতকরণের অপেক্ষায়", requiresReturnDate: false },
      { code: "contact_details_change", label: "ঠিকানা বা ফোন নম্বর সংশোধনের অপেক্ষায়", requiresReturnDate: false },
      { code: "order_change_requested", label: "অর্ডার পরিবর্তনের অনুরোধ", requiresReturnDate: false },
      { code: "payment_confirmation_pending", label: "পেমেন্ট নিশ্চিতকরণের অপেক্ষায়", requiresReturnDate: false },
      { code: "advance_payment_pending", label: "অগ্রিম পেমেন্টের জন্য অর্ডার হোল্ডে রাখা হয়েছে", requiresReturnDate: false },
      { code: "temporarily_out_of_stock", label: "পণ্য সাময়িকভাবে স্টকে নেই", requiresReturnDate: false },
      { code: "courier_delivery_issue", label: "কুরিয়ার/ডেলিভারি সমস্যা", requiresReturnDate: false },
      { code: "other", label: "অন্যান্য", requiresReturnDate: false },
    ]);
  });

  it("requires a reason and a valid return date only for the date-based reason", () => {
    expect(validateOrderHoldDetails({ reasonCode: "", holdUntilDate: null, currentDate: "2026-09-26" })?.code)
      .toBe("hold_reason_required");
    expect(validateOrderHoldDetails({ reasonCode: "unknown", holdUntilDate: null, currentDate: "2026-09-26" })?.code)
      .toBe("invalid_hold_reason");
    expect(validateOrderHoldDetails({ reasonCode: "customer_requested_after_date", holdUntilDate: null, currentDate: "2026-09-26" })?.code)
      .toBe("hold_return_date_required");
    expect(validateOrderHoldDetails({ reasonCode: "contact_later", holdUntilDate: "2026-09-27", currentDate: "2026-09-26" })?.code)
      .toBe("hold_return_date_not_allowed");
    expect(validateOrderHoldDetails({ reasonCode: "customer_requested_after_date", holdUntilDate: "2026-09-26", currentDate: "2026-09-26" }))
      .toBeNull();
  });

  it("rejects invalid or past dates and accepts an optional Other detail", () => {
    expect(validateOrderHoldDetails({ reasonCode: "customer_requested_after_date", holdUntilDate: "2026-02-30", currentDate: "2026-09-26" })?.code)
      .toBe("invalid_hold_return_date");
    expect(validateOrderHoldDetails({ reasonCode: "customer_requested_after_date", holdUntilDate: "2026-09-25", currentDate: "2026-09-26" })?.code)
      .toBe("hold_return_date_in_past");
    expect(validateOrderHoldDetails({ reasonCode: "other", holdUntilDate: null, currentDate: "2026-09-26" })).toBeNull();
    expect(validateOrderHoldDetails({ reasonCode: "other", reasonDetail: "  অপেক্ষা করুন  ", holdUntilDate: null, currentDate: "2026-09-26" })).toBeNull();
  });

  it("rejects non-text return-date values even when the selected reason does not need a date", () => {
    expect(validateOrderHoldDetails({ reasonCode: "contact_later", holdUntilDate: 123, currentDate: "2026-09-26" })?.code)
      .toBe("invalid_hold_return_date");
    expect(validateOrderHoldDetails({ reasonCode: "contact_later", holdUntilDate: "   ", currentDate: "2026-09-26" }))
      .toBeNull();
  });

  it("uses the Bangladesh calendar day for validation and release", () => {
    expect(getBangladeshDateKey(new Date("2026-09-26T18:30:00.000Z"))).toBe("2026-09-27");
    expect(isScheduledOrderHoldDue("2026-09-27", "2026-09-27")).toBe(false);
    expect(isScheduledOrderHoldDue("2026-09-27", "2026-09-28")).toBe(true);
    expect(isScheduledOrderHoldDue(null, "2026-09-28")).toBe(false);
  });
});
