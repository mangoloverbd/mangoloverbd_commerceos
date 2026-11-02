import { describe, expect, it } from "vitest";
import {
  BORI_MUSTARD_OIL_OFFER_PRICE,
  BORI_PRODUCT_ID,
  MUSTARD_OIL_1L_VARIANT_ID,
  applyOrderOffers,
  buildBoriMustardOilOffer,
} from "../../server/orderOffers.js";

const MUSTARD_OIL_PRODUCT_ID = "363dae9a-5135-4f40-9379-3f1764b0377c";
const BORI_1KG_VARIANT_ID = "c5d6dba4-4a34-4980-9a55-e05b273ad673";

const bori = (quantity = 1) => ({
  productId: BORI_PRODUCT_ID,
  variantId: BORI_1KG_VARIANT_ID,
  productName: "হোমমেড কুমড়ো বড়ি | Homemade Pumpkin Bori",
  quantity,
  unitPrice: 650,
  lineTotal: 650 * quantity,
});

const oil = (quantity = 1, variantId = MUSTARD_OIL_1L_VARIANT_ID) => ({
  productId: MUSTARD_OIL_PRODUCT_ID,
  variantId,
  productName: "সরিষার তেল | Mustard Oil",
  quantity,
  unitPrice: 350,
  lineTotal: 350 * quantity,
});

describe("applyOrderOffers — bori + mustard oil", () => {
  it("prices one 1-litre mustard oil at the offer price when bori is in the order", () => {
    const [boriLine, oilLine] = applyOrderOffers([bori(), oil()]);
    expect(BORI_MUSTARD_OIL_OFFER_PRICE).toBe(280);
    expect(oilLine).toMatchObject({ unitPrice: 280, lineTotal: 280 });
    expect(boriLine).toMatchObject({ unitPrice: 650, lineTotal: 650 });
  });

  it("works regardless of item order and bori quantity", () => {
    const [oilLine] = applyOrderOffers([oil(), bori(3)]);
    expect(oilLine.unitPrice).toBe(280);
  });

  it("charges full price for mustard oil ordered without bori", () => {
    const [oilLine] = applyOrderOffers([oil()]);
    expect(oilLine).toMatchObject({ unitPrice: 350, lineTotal: 350 });
  });

  it("does not discount more than one bottle per order", () => {
    const [, oilLine] = applyOrderOffers([bori(), oil(2)]);
    expect(oilLine).toMatchObject({ unitPrice: 350, lineTotal: 700 });
  });

  it("discounts only one line when the oil appears twice", () => {
    const [, first, second] = applyOrderOffers([bori(), oil(), oil()]);
    expect(first.unitPrice).toBe(280);
    expect(second.unitPrice).toBe(350);
  });

  it("leaves other mustard oil sizes at full price", () => {
    const twoLitre = { ...oil(1, "41b47539-729a-492a-a23e-31a5669a60fa"), unitPrice: 700, lineTotal: 700 };
    const [, oilLine] = applyOrderOffers([bori(), twoLitre]);
    expect(oilLine.unitPrice).toBe(700);
  });

  it("never raises a price that is already below the offer", () => {
    const cheap = { ...oil(), unitPrice: 200, lineTotal: 200 };
    const [, oilLine] = applyOrderOffers([bori(), cheap]);
    expect(oilLine.unitPrice).toBe(200);
  });

  it("keeps items without lineTotal free of a new lineTotal field", () => {
    const { lineTotal: _b, ...boriNoTotal } = bori();
    const { lineTotal: _o, ...oilNoTotal } = oil();
    const [, oilLine] = applyOrderOffers([boriNoTotal, oilNoTotal]);
    expect(oilLine.unitPrice).toBe(280);
    expect("lineTotal" in oilLine).toBe(false);
  });

  it("does not mutate the input items", () => {
    const items = [bori(), oil()];
    applyOrderOffers(items);
    expect(items[1].unitPrice).toBe(350);
  });

  it("returns non-array input as an empty list", () => {
    expect(applyOrderOffers(null)).toEqual([]);
  });
});

describe("buildBoriMustardOilOffer — public offer for the storefront", () => {
  const variant = {
    id: MUSTARD_OIL_1L_VARIANT_ID,
    product_id: MUSTARD_OIL_PRODUCT_ID,
    attributes: { size: "১ লিটার" },
    price_adjustment: "0",
    stock_quantity: 295,
    storefront_visible: true,
  };
  const product = {
    id: MUSTARD_OIL_PRODUCT_ID,
    name: "সরিষার তেল | Mustard Oil",
    slug: "mustard-oil",
    selling_price: "350",
    published: true,
    image_url: "https://example.test/oil.webp",
  };

  it("describes the offer with the live catalog price", () => {
    expect(buildBoriMustardOilOffer(variant, product)).toEqual({
      id: "bori-mustard-oil",
      triggerProductId: BORI_PRODUCT_ID,
      productId: MUSTARD_OIL_PRODUCT_ID,
      productSlug: "mustard-oil",
      productName: "সরিষার তেল | Mustard Oil",
      imageUrl: "https://example.test/oil.webp",
      variantId: MUSTARD_OIL_1L_VARIANT_ID,
      variantLabel: "১ লিটার",
      regularPrice: 350,
      offerPrice: 280,
      maxQuantity: 1,
      available: true,
    });
  });

  it("marks the offer unavailable when the bottle is out of stock", () => {
    expect(buildBoriMustardOilOffer({ ...variant, stock_quantity: 0 }, product)?.available).toBe(false);
  });

  it("returns no offer when the variant or product cannot be sold", () => {
    expect(buildBoriMustardOilOffer(null, product)).toBeNull();
    expect(buildBoriMustardOilOffer(variant, null)).toBeNull();
    expect(buildBoriMustardOilOffer({ ...variant, storefront_visible: false }, product)).toBeNull();
    expect(buildBoriMustardOilOffer(variant, { ...product, published: false })).toBeNull();
    expect(buildBoriMustardOilOffer({ ...variant, product_id: "other" }, product)).toBeNull();
  });

  it("returns no offer when the catalog price is already at or below the offer", () => {
    expect(buildBoriMustardOilOffer(variant, { ...product, selling_price: "280" })).toBeNull();
  });
});
