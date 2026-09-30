import { describe, expect, it } from "vitest";
import { orderSourceDisplayLabel } from "@/lib/orderSource";

describe("orderSourceDisplayLabel", () => {
  it("labels website orders converted from an abandoned checkout as Abandoned", () => {
    expect(orderSourceDisplayLabel("website", "abandoned_checkout")).toBe("Abandoned");
    expect(orderSourceDisplayLabel("storefront", "abandoned_checkout")).toBe("Abandoned");
  });

  it("respects a source staff changed away from website", () => {
    expect(orderSourceDisplayLabel("facebook", "abandoned_checkout")).toBe("Facebook");
  });

  it("falls back to the normal source label without an abandoned origin", () => {
    expect(orderSourceDisplayLabel("website", null)).toBe("Website");
    expect(orderSourceDisplayLabel("website", undefined)).toBe("Website");
    expect(orderSourceDisplayLabel("website", "storefront")).toBe("Website");
  });
});
