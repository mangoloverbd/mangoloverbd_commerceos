import { describe, expect, it } from "vitest";
import { matchVariantId, productNeedsVariant, variantLabel } from "../../server/variantMatching.js";
describe("inbox variants", () => {
  const variants=[{id:"v1",attributes:{size:"1kg"}},{id:"v2",attributes:{size:"5kg"}}];
  it("labels and matches variants",()=>{expect(variantLabel(variants[0].attributes)).toBe("size: 1kg");expect(matchVariantId({label:"5KG",variants})).toBe("v2");});
  it("requires a choice for variant products",()=>{expect(productNeedsVariant({item:{product:"Mango"},variantsByProductName:{mango:variants}})).toBe(true);});
});
