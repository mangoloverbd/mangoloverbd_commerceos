import { describe, expect, it } from "vitest";
import { ADVANCE_PAYMENT_METHODS, normalizeAdvancePaymentProof } from "../../server/advancePaymentProof.js";

describe("normalizeAdvancePaymentProof", () => {
  it("accepts a method with a TrxID and normalises the reference", () => {
    expect(normalizeAdvancePaymentProof({ advance: 500, method: "bkash", reference: "  9kx7q2lmna " })).toEqual({
      ok: true,
      value: { advance_payment_method: "bkash", advance_payment_reference: "9KX7Q2LMNA" },
    });
  });

  it("accepts last 4 digits", () => {
    const result = normalizeAdvancePaymentProof({ advance: 200, method: "nagad", reference: "4821" });
    expect(result).toEqual({ ok: true, value: { advance_payment_method: "nagad", advance_payment_reference: "4821" } });
  });

  it("keeps proof optional when an advance is entered", () => {
    expect(normalizeAdvancePaymentProof({ advance: 300, method: "", reference: "" })).toEqual({
      ok: true,
      value: { advance_payment_method: null, advance_payment_reference: null },
    });
  });

  it("clears proof when there is no advance", () => {
    expect(normalizeAdvancePaymentProof({ advance: 0, method: "bkash", reference: "4821" })).toEqual({
      ok: true,
      value: { advance_payment_method: null, advance_payment_reference: null },
    });
  });

  it("rejects an unknown method", () => {
    expect(normalizeAdvancePaymentProof({ advance: 100, method: "paypal", reference: "4821" })).toEqual({
      ok: false,
      error: "Invalid advance payment method",
    });
  });

  it("rejects references that are too short, too long or contain odd characters", () => {
    for (const reference of ["12", "X".repeat(41), "<script>"]) {
      const result = normalizeAdvancePaymentProof({ advance: 100, method: "bkash", reference });
      expect(result.ok, reference).toBe(false);
    }
  });

  it("lists the supported wallets and bank", () => {
    expect(ADVANCE_PAYMENT_METHODS).toEqual(["bkash", "nagad", "rocket", "bank"]);
  });
});
