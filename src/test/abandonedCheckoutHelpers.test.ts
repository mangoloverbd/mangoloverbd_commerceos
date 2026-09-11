import { describe, expect, it } from "vitest";
import {
  abandonedCheckoutCartSummary,
  abandonedCheckoutCopySummary,
  abandonedCheckoutSourceLabel,
  abandonedCheckoutTelHref,
  abandonedCheckoutWhatsAppHref,
  computeAbandonedCheckoutTotals,
  matchesAbandonedCheckoutSearch,
  type AbandonedCheckout,
} from "@/lib/abandonedCheckouts";

const checkout: AbandonedCheckout = {
  id: "7cb13b8e-b576-4faa-b238-cc8b73059772",
  status: "open",
  customer_name: "Farzana Akter",
  phone: "01712345678",
  address: "House 1, Road 2, Dhaka",
  cart: [{
    productName: "Sundarbans Honey",
    variantName: "1 kg",
    quantity: 2,
    unitPrice: 750,
  }],
  subtotal: 1500,
  delivery_rate: 100,
  total: 1600,
  source: "sundarbans_honey",
  source_path: "/step/sundarbans-natural-honey",
  campaign: { utmSource: "facebook" },
  contacted_at: null,
  created_at: "2026-09-11T12:00:00.000Z",
  updated_at: "2026-09-11T12:00:00.000Z",
};

describe("abandoned checkout dashboard helpers", () => {
  it("searches only staff-visible checkout fields case-insensitively", () => {
    expect(matchesAbandonedCheckoutSearch(checkout, "farzana")).toBe(true);
    expect(matchesAbandonedCheckoutSearch(checkout, "171234")).toBe(true);
    expect(matchesAbandonedCheckoutSearch(checkout, "SUNDARBANS HONEY")).toBe(true);
    expect(matchesAbandonedCheckoutSearch(checkout, "facebook")).toBe(false);
  });

  it("formats summary and manual contact targets without precomposed outreach", () => {
    expect(abandonedCheckoutCartSummary(checkout.cart)).toBe("2 × Sundarbans Honey — 1 kg");
    expect(abandonedCheckoutSourceLabel(checkout.source)).toBe("Sundarbans Honey");
    expect(abandonedCheckoutTelHref(checkout.phone)).toBe("tel:01712345678");
    expect(abandonedCheckoutWhatsAppHref(checkout.phone)).toBe("https://wa.me/8801712345678");
    expect(abandonedCheckoutCopySummary(checkout)).toContain("Estimated total: ৳1,600");
    expect(abandonedCheckoutCopySummary(checkout)).not.toContain("utmSource");
    expect(abandonedCheckoutCopySummary(checkout)).not.toContain("facebook");
  });

  it("does not generate a contact target for an invalid or scrubbed number", () => {
    expect(abandonedCheckoutTelHref(null)).toBeNull();
    expect(abandonedCheckoutWhatsAppHref("0181234567")).toBeNull();
  });
});

describe("computeAbandonedCheckoutTotals", () => {
  it("sums lines and adds delivery", () => {
    expect(computeAbandonedCheckoutTotals(
      [
        { productName: "Sundarbans Honey", variantName: "1 kg", quantity: 2, unitPrice: 750 },
        { productName: "Kalojira", variantName: null, quantity: 1, unitPrice: 450 },
      ],
      100,
    )).toEqual({ subtotal: 1950, total: 2050 });
  });

  it("returns zeros for an empty cart", () => {
    expect(computeAbandonedCheckoutTotals([], 60)).toEqual({ subtotal: 0, total: 60 });
  });

  it("treats a non-finite delivery rate as zero", () => {
    expect(computeAbandonedCheckoutTotals(
      [{ productName: "Sundarbans Honey", variantName: "1 kg", quantity: 2, unitPrice: 750 }],
      NaN,
    )).toEqual({ subtotal: 1500, total: 1500 });
    expect(computeAbandonedCheckoutTotals(
      [{ productName: "Sundarbans Honey", variantName: "1 kg", quantity: 2, unitPrice: 750 }],
      Infinity,
    )).toEqual({ subtotal: 1500, total: 1500 });
  });
});
