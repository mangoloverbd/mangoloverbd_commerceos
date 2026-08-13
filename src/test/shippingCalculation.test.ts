import { describe, expect, it } from "vitest";
import { calculateShippingCost } from "../../server/shippingCalculation.js";

const ZONES = [
  { id: "zone_dhaka", name: "Inside Dhaka", price: 60, min_order_amount: 0, free_above: 1000, conditions: [] },
  { id: "zone_outside", name: "Outside Dhaka", price: 120, min_order_amount: 0, free_above: 2000, conditions: [] },
  { id: "zone_min", name: "Minimum 500", price: 80, min_order_amount: 500, free_above: 0, conditions: [] },
  { id: "zone_free_delivery", name: "Free Delivery", price: 0, min_order_amount: 0, free_above: 0, conditions: [] },
];

describe("calculateShippingCost", () => {
  // ── Basic pricing ────────────────────────────────────────────────────────
  describe("basic pricing", () => {
    it("returns flat rate for a matching zone", () => {
      const result = calculateShippingCost(500, "zone_dhaka", ZONES);
      expect(result).toEqual({ cost: 60, error: null });
    });

    it("returns correct price for outside dhaka zone", () => {
      const result = calculateShippingCost(500, "zone_outside", ZONES);
      expect(result).toEqual({ cost: 120, error: null });
    });
  });

  // ── Free shipping ────────────────────────────────────────────────────────
  describe("free shipping threshold", () => {
    it("applies free shipping when subtotal equals free_above", () => {
      const result = calculateShippingCost(1000, "zone_dhaka", ZONES);
      expect(result).toEqual({ cost: 0, error: null });
    });

    it("applies free shipping when subtotal exceeds free_above", () => {
      const result = calculateShippingCost(1500, "zone_dhaka", ZONES);
      expect(result).toEqual({ cost: 0, error: null });
    });

    it("charges shipping when subtotal is below free_above", () => {
      const result = calculateShippingCost(999, "zone_dhaka", ZONES);
      expect(result).toEqual({ cost: 60, error: null });
    });

    it("free_above = 0 means no free shipping", () => {
      const result = calculateShippingCost(9999, "zone_min", ZONES);
      expect(result).toEqual({ cost: 80, error: null });
    });
  });

  // ── No zone / unknown zone ───────────────────────────────────────────────
  describe("no zone or unknown zone", () => {
    it("returns cost 0 with no error when zone ID is null", () => {
      const result = calculateShippingCost(500, null, ZONES);
      expect(result).toEqual({ cost: 0, error: null });
    });

    it("returns cost 0 with no error when zone ID is undefined", () => {
      const result = calculateShippingCost(500, undefined, ZONES);
      expect(result).toEqual({ cost: 0, error: null });
    });

    it("returns cost 0 with no error when zone ID is empty string", () => {
      const result = calculateShippingCost(500, "", ZONES);
      expect(result).toEqual({ cost: 0, error: null });
    });

    it("returns error when zone ID is not found", () => {
      const result = calculateShippingCost(500, "zone_nonexistent", ZONES);
      expect(result.error).toBe("Shipping zone not found");
      expect(result.cost).toBe(0);
    });

    it("returns error when zones array is empty but zone ID provided", () => {
      const result = calculateShippingCost(500, "zone_dhaka", []);
      expect(result.error).toBe("Shipping zone not found");
    });
  });

  // ── Min order validation ─────────────────────────────────────────────────
  describe("minimum order amount", () => {
    it("returns error when subtotal is below minimum", () => {
      const result = calculateShippingCost(499, "zone_min", ZONES);
      expect(result.error).toBe("Minimum order amount not met");
      expect(result.cost).toBe(0);
    });

    it("allows order when subtotal equals minimum", () => {
      const result = calculateShippingCost(500, "zone_min", ZONES);
      expect(result).toEqual({ cost: 80, error: null });
    });

    it("allows order when subtotal exceeds minimum", () => {
      const result = calculateShippingCost(600, "zone_min", ZONES);
      expect(result).toEqual({ cost: 80, error: null });
    });

    it("zone with min_order_amount = 0 always allows", () => {
      const result = calculateShippingCost(1, "zone_dhaka", ZONES);
      expect(result).toEqual({ cost: 60, error: null });
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────
  describe("edge cases", () => {
    it("handles string-valued numeric fields (JSONB round-trip)", () => {
      const stringyZones = [
        { id: "z1", name: "Test", price: "60", min_order_amount: "0", free_above: "1000", conditions: [] },
      ];
      const result = calculateShippingCost(500, "z1", stringyZones);
      expect(result).toEqual({ cost: 60, error: null });
    });

    it("handles price = 0 zone (free delivery zone)", () => {
      const result = calculateShippingCost(500, "zone_free_delivery", ZONES);
      expect(result).toEqual({ cost: 0, error: null });
    });

    it("handles zones being null/undefined gracefully", () => {
      const result = calculateShippingCost(500, "zone_dhaka", null);
      expect(result.error).toBe("Shipping zone not found");
    });

    it("handles subtotal of 0", () => {
      const result = calculateShippingCost(0, "zone_dhaka", ZONES);
      expect(result).toEqual({ cost: 60, error: null });
    });

    it("handles missing optional fields on zone", () => {
      const minimalZones = [{ id: "z1", name: "Minimal", price: 50 }];
      const result = calculateShippingCost(500, "z1", minimalZones);
      expect(result).toEqual({ cost: 50, error: null });
    });
  });
});
