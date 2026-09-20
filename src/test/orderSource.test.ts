import { describe, expect, it } from "vitest";
import {
  ORDER_SOURCE_OPTIONS,
  normalizeOrderSource,
  orderSourceLabel,
} from "@/lib/orderSource";

describe("order source", () => {
  it("exposes the seven selectable values in display order", () => {
    expect(ORDER_SOURCE_OPTIONS).toEqual([
      { value: "website", label: "Website" },
      { value: "facebook", label: "Facebook" },
      { value: "instagram", label: "Instagram" },
      { value: "whatsapp", label: "WhatsApp" },
      { value: "phone", label: "Phone" },
      { value: "telesales", label: "Telesales" },
      { value: "manual_other", label: "Manual / Other" },
    ]);
  });

  it("normalizes legacy and missing values", () => {
    expect(normalizeOrderSource("custom_store")).toBe("website");
    expect(normalizeOrderSource("custom_website_tracker")).toBe("website");
    expect(normalizeOrderSource("storefront_review")).toBe("website");
    expect(normalizeOrderSource("  TELESALES  ")).toBe("telesales");
    expect(normalizeOrderSource(null)).toBe("manual_other");
    expect(normalizeOrderSource("unknown")).toBe("manual_other");
  });

  it("returns labels for canonical and fallback values", () => {
    expect(orderSourceLabel("website")).toBe("Website");
    expect(orderSourceLabel("telesales")).toBe("Telesales");
    expect(orderSourceLabel("manual_other")).toBe("Manual / Other");
    expect(orderSourceLabel("legacy-value")).toBe("Manual / Other");
  });
});
