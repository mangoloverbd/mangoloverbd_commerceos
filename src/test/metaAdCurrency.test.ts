import { describe, expect, it } from "vitest";
import { convertMetaSpendToBdt } from "../../server/metaAdCurrency.js";

describe("convertMetaSpendToBdt", () => {
  it("converts USD spend using the configured rate", () => {
    expect(convertMetaSpendToBdt(12.5, "USD", 110)).toBe(1375);
  });

  it("passes through BDT spend without applying the USD rate", () => {
    expect(convertMetaSpendToBdt(1250, "BDT", 110)).toBe(1250);
  });

  it("does not silently convert unsupported currencies", () => {
    expect(convertMetaSpendToBdt(100, "EUR", 110)).toBeNull();
    expect(convertMetaSpendToBdt(100, null, 110)).toBeNull();
  });
});
