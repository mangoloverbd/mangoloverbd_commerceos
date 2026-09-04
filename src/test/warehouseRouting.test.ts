import { describe, expect, it } from "vitest";
import {
  computeOrderWeightKg,
  parseOptionalWeightKg,
  resolveWarehouseId,
} from "../../server/warehouseRouting.js";

const MANGO_WH = "11111111-1111-1111-1111-111111111111";
const MAIN_WH = "22222222-2222-2222-2222-222222222222";

const PRODUCTS = {
  "p-tshirt": { id: "p-tshirt", name: "Cotton T-Shirt", warehouse_id: MAIN_WH, weight_kg: 0.3 },
  "p-mango": { id: "p-mango", name: "Kacha Aam", warehouse_id: MANGO_WH, weight_kg: 2 },
  "p-none": { id: "p-none", name: "Gift Box", warehouse_id: null, weight_kg: 1 },
  "p-unknown-weight": { id: "p-unknown-weight", name: "Unknown Weight", warehouse_id: MAIN_WH, weight_kg: null },
};
const BY_NAME = {
  "cotton t-shirt": PRODUCTS["p-tshirt"],
  "kacha aam": PRODUCTS["p-mango"],
  "gift box": PRODUCTS["p-none"],
};
const VARIANTS = {
  "v-1kg": { id: "v-1kg", product_id: "p-mango", weight_kg: 1 },
  "v-5kg": { id: "v-5kg", product_id: "p-mango", weight_kg: 5 },
  "v-noweight": { id: "v-noweight", product_id: "p-mango", weight_kg: null },
};

const args = (items) => ({
  items,
  productsById: PRODUCTS,
  productsByName: BY_NAME,
  defaultWarehouseId: MAIN_WH,
});

describe("resolveWarehouseId", () => {
  it("prefers the product id over a conflicting normalized name", () => {
    expect(
      resolveWarehouseId(args([{ productId: "p-mango", product: "  COTTON T-SHIRT ", quantity: 1 }])),
    ).toBe(MANGO_WH);
  });

  it("falls back to a case-insensitive name match", () => {
    expect(resolveWarehouseId(args([{ product: "  KACHA AAM ", quantity: 2 }]))).toBe(MANGO_WH);
  });

  it("uses the default warehouse when nothing matches", () => {
    expect(resolveWarehouseId(args([{ product: "Unknown Thing" }]))).toBe(MAIN_WH);
  });

  it("uses the default warehouse when the product has no warehouse assigned", () => {
    expect(resolveWarehouseId(args([{ productId: "p-none" }]))).toBe(MAIN_WH);
  });

  it("takes the first resolvable product when an order spans two warehouses", () => {
    expect(
      resolveWarehouseId(args([{ productId: "p-mango" }, { productId: "p-tshirt" }])),
    ).toBe(MANGO_WH);
  });

  it("skips unresolvable items before falling back", () => {
    expect(
      resolveWarehouseId(args([{ product: "Mystery" }, { productId: "p-mango" }])),
    ).toBe(MANGO_WH);
  });

  it("returns null when there is no default warehouse", () => {
    expect(
      resolveWarehouseId({ ...args([{ product: "Mystery" }]), defaultWarehouseId: null }),
    ).toBeNull();
  });
});

const weightArgs = (items) => ({ items, variantsById: VARIANTS, productsById: PRODUCTS });

describe("computeOrderWeightKg", () => {
  it("prefers the variant weight over its known parent product weight", () => {
    expect(computeOrderWeightKg(weightArgs([{ variantId: "v-5kg", productId: "p-mango", quantity: 1 }]))).toBe(5);
  });

  it("multiplies by quantity", () => {
    expect(computeOrderWeightKg(weightArgs([{ variantId: "v-1kg", quantity: 3 }]))).toBe(3);
  });

  it("sums across items", () => {
    expect(
      computeOrderWeightKg(weightArgs([
        { variantId: "v-1kg", quantity: 2 },
        { productId: "p-tshirt", quantity: 1 },
      ])),
    ).toBe(2.3);
  });

  it("falls back to the known parent product weight when the variant has none", () => {
    expect(computeOrderWeightKg(weightArgs([{ variantId: "v-noweight", productId: "p-mango" }]))).toBe(2);
  });

  it("treats a missing quantity as one", () => {
    expect(computeOrderWeightKg(weightArgs([{ productId: "p-tshirt" }]))).toBe(0.3);
  });

  it("returns null when any single item has no known weight", () => {
    expect(
      computeOrderWeightKg(weightArgs([
        { productId: "p-tshirt", quantity: 1 },
        { productId: "p-unknown-weight", quantity: 1 },
      ])),
    ).toBeNull();
  });

  it("returns null for an empty item list", () => {
    expect(computeOrderWeightKg(weightArgs([]))).toBeNull();
  });

  it("rounds to three decimals", () => {
    const variants = { "v-third": { id: "v-third", product_id: "p-mango", weight_kg: 0.3333 } };
    expect(computeOrderWeightKg({ items: [{ variantId: "v-third", quantity: 3 }], variantsById: variants, productsById: PRODUCTS })).toBe(1);
  });
});

describe("parseOptionalWeightKg", () => {
  it.each([undefined, null, "", "   "])("returns null for blank optional input %#", (value) => {
    expect(parseOptionalWeightKg(value)).toBeNull();
  });

  it("rounds valid input to three decimals", () => {
    expect(parseOptionalWeightKg("1.2346")).toBe(1.235);
  });

  it.each(["abc", -0.001, Number.POSITIVE_INFINITY])("rejects invalid weight %#", (value) => {
    expect(() => parseOptionalWeightKg(value)).toThrow("Weight must be a non-negative number");
  });
});
