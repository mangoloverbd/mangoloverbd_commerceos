import { describe, expect, it } from "vitest";
import {
  matchProductFromText,
  matchVariantId,
  matchVariantIdFromText,
  productNeedsVariant,
  variantLabel,
} from "../../server/variantMatching.js";
describe("inbox variants", () => {
  const variants=[{id:"v1",attributes:{size:"1kg"}},{id:"v2",attributes:{size:"5kg"}}];
  it("labels and matches variants",()=>{expect(variantLabel(variants[0].attributes)).toBe("size: 1kg");expect(matchVariantId({label:"5KG",variants})).toBe("v2");});
  it("requires a choice for variant products",()=>{expect(productNeedsVariant({item:{product:"Mango"},variantsByProductName:{mango:variants}})).toBe(true);});
});

describe("custom-store catalog matching", () => {
  const honey = {
    id: "honey",
    name: "সুন্দরবনের চাকের মধু | Sundarbans Natural Honey",
  };

  it("selects the longest unique product contained in legacy order text", () => {
    expect(matchProductFromText({
      text: "সুন্দরবনের চাকের মধু | Sundarbans Natural Honey - 0.5KG",
      products: [
        { id: "generic", name: "Natural Honey" },
        honey,
      ],
    })).toEqual(honey);
  });

  it("does not select an arbitrary duplicate or match empty input", () => {
    expect(matchProductFromText({
      text: "Natural Honey - 0.5KG",
      products: [
        { id: "first", name: "Natural Honey" },
        { id: "second", name: "Natural Honey" },
      ],
    })).toBeNull();
    expect(matchProductFromText({ text: "", products: [honey] })).toBeNull();
    expect(matchProductFromText({
      text: "Mango",
      products: [{ id: "single-letter", name: "M" }],
    })).toBeNull();
  });

  it("matches the unique variant whose complete attribute values occur in the text", () => {
    expect(matchVariantIdFromText({
      text: "সুন্দরবনের চাকের মধু | Sundarbans Natural Honey - 0.5KG",
      variants: [
        { id: "half", attributes: { size: "0.5KG" } },
        { id: "full", attributes: { size: "1KG" } },
      ],
    })).toBe("half");
  });

  it("does not guess when variant attributes remain ambiguous", () => {
    expect(matchVariantIdFromText({
      text: "T-shirt - Red",
      variants: [
        { id: "small", attributes: { color: "Red", size: "S" } },
        { id: "large", attributes: { color: "Red", size: "L" } },
      ],
    })).toBeNull();
  });

  it("accepts the only available variant when there is no competing choice", () => {
    expect(matchVariantIdFromText({
      text: "Single-size product",
      variants: [{ id: "only", attributes: { size: "Standard" } }],
    })).toBe("only");
  });
});
