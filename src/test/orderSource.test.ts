import { describe, expect, it } from "vitest";
import {
  ORDER_SOURCE_OPTIONS,
  canChangeOrderSource,
  normalizeOrderSource,
  orderSourceLabel,
} from "@/lib/orderSource";

describe("order source", () => {
  it("exposes the eight selectable values in display order", () => {
    expect(ORDER_SOURCE_OPTIONS).toEqual([
      { value: "website", label: "Website" },
      { value: "facebook", label: "Facebook" },
      { value: "instagram", label: "Instagram" },
      { value: "whatsapp", label: "WhatsApp" },
      { value: "phone", label: "Phone" },
      { value: "telesales", label: "Telesales" },
      { value: "upsell", label: "Upsell" },
      { value: "manual_other", label: "Manual / Other" },
    ]);
  });

  it("normalizes legacy and missing values", () => {
    expect(normalizeOrderSource("custom_store")).toBe("website");
    expect(normalizeOrderSource("custom_website_tracker")).toBe("website");
    expect(normalizeOrderSource("storefront_review")).toBe("website");
    expect(normalizeOrderSource("  TELESALES  ")).toBe("telesales");
    expect(normalizeOrderSource("upsell")).toBe("upsell");
    expect(normalizeOrderSource(null)).toBe("manual_other");
    expect(normalizeOrderSource("unknown")).toBe("manual_other");
  });

  it("returns labels for canonical and fallback values", () => {
    expect(orderSourceLabel("website")).toBe("Website");
    expect(orderSourceLabel("telesales")).toBe("Telesales");
    expect(orderSourceLabel("manual_other")).toBe("Manual / Other");
    expect(orderSourceLabel("legacy-value")).toBe("Manual / Other");
  });

  it("is accepted by the server when orders are saved", async () => {
    const { readFileSync } = await import("node:fs");
    const server = readFileSync(`${process.cwd()}/server/index.js`, "utf8");
    const line = server.split("\n").find((row) => row.startsWith("const ORDER_SOURCE_VALUES"));
    for (const { value } of ORDER_SOURCE_OPTIONS) expect(line).toContain(`"${value}"`);
  });
});

describe("canChangeOrderSource", () => {
  it("allows only orders a staff member made with Create order", () => {
    expect(canChangeOrderSource({ origin_actor_kind: "user", origin_source: "facebook" })).toBe(true);
    expect(canChangeOrderSource({ origin_actor_kind: "user", origin_source: "manual_other" })).toBe(true);
    // Abandoned-checkout conversions, storefront, inbox and pre-history orders stay locked.
    expect(canChangeOrderSource({ origin_actor_kind: "user", origin_source: "abandoned_checkout" })).toBe(false);
    expect(canChangeOrderSource({ origin_actor_kind: "customer", origin_source: "website" })).toBe(false);
    expect(canChangeOrderSource({ origin_actor_kind: "system", origin_source: "social_facebook" })).toBe(false);
    expect(canChangeOrderSource({ origin_actor_kind: null, origin_source: null })).toBe(false);
    expect(canChangeOrderSource(null)).toBe(false);
  });
});
