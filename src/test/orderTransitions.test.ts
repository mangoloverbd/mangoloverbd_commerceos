import { describe, expect, it } from "vitest";
import {
  canEnterPrint,
  canLeavePrint,
  courierSendBlockReason,
  isApprovedStatus,
  isPrintStatus,
  normalizeBusinessStatus,
  planBulkStatusChange,
} from "@/lib/orderTransitions";

describe("orderTransitions", () => {
  it("normalizes business statuses like the filter lib", () => {
    expect(normalizeBusinessStatus("Confirmed")).toBe("confirmed");
    expect(normalizeBusinessStatus("Ready to Ship")).toBe("ready_to_ship");
    expect(normalizeBusinessStatus(null)).toBe("");
  });

  it("detects approved and print statuses", () => {
    expect(isApprovedStatus("confirmed")).toBe(true);
    expect(isApprovedStatus("Approved")).toBe(true);
    expect(isApprovedStatus("pending")).toBe(false);
    expect(isPrintStatus("print")).toBe(true);
    expect(isPrintStatus("Print")).toBe(true);
    expect(isPrintStatus("confirmed")).toBe(false);
  });

  it("allows Print entry only from Approved", () => {
    expect(canEnterPrint("confirmed")).toBe(true);
    expect(canEnterPrint("approved")).toBe(true);
    expect(canEnterPrint("pending")).toBe(false);
    expect(canEnterPrint("print")).toBe(false);
  });

  it("allows Print exit only to Approved or Cancelled", () => {
    expect(canLeavePrint("confirmed")).toBe(true);
    expect(canLeavePrint("cancelled")).toBe(true);
    expect(canLeavePrint("pending")).toBe(false);
    expect(canLeavePrint("processing")).toBe(false);
    expect(canLeavePrint("print")).toBe(true);
  });

  it("blocks courier send from Approved with a clear reason", () => {
    expect(courierSendBlockReason("confirmed")).toBe("Move to Print first");
    expect(courierSendBlockReason("print")).toBeNull();
    expect(courierSendBlockReason("pending")).toBeNull();
  });

  it("plans bulk moves to print for approved orders only", () => {
    const orders = [
      { id: "a", status: "confirmed" },
      { id: "b", status: "pending" },
      { id: "c", status: "print" },
    ];
    expect(planBulkStatusChange(orders, ["a", "b", "c", "missing"], "print")).toEqual({
      validIds: ["a"],
      skipped: 3,
    });
  });

  it("plans bulk moves out of print to approved or cancelled only", () => {
    const orders = [
      { id: "a", status: "print" },
      { id: "b", status: "print" },
      { id: "c", status: "pending" },
    ];
    expect(planBulkStatusChange(orders, ["a", "b"], "confirmed")).toEqual({
      validIds: ["a", "b"],
      skipped: 0,
    });
    expect(planBulkStatusChange(orders, ["a"], "pending")).toEqual({
      validIds: [],
      skipped: 1,
    });
  });

  it("plans bulk moves for unrestricted targets and skips same-status orders", () => {
    const orders = [
      { id: "a", status: "pending" },
      { id: "b", status: "confirmed" },
      { id: "c", status: "cancelled" },
    ];
    expect(planBulkStatusChange(orders, ["a", "b", "c"], "cancelled")).toEqual({
      validIds: ["a", "b"],
      skipped: 1,
    });
  });
});
