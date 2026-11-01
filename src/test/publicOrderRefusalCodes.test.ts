import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
const start = source.indexOf("async function handlePublicHandleOrderSubmit(req, res) {");
const handler = source.slice(start, source.indexOf("\n}\n", start));

describe("public storefront order refusals", () => {
  // The storefront maps these codes to a message the customer can act on.
  it("tags product, stock and delivery refusals with a refusal code", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(handler).toMatch(/Variant not found or doesn't belong to this store`, code: "product_unavailable"/);
    expect(handler).toMatch(/Product is no longer available`, code: "product_unavailable"/);
    expect(handler).toMatch(/Available: \$\{variant\.stock_quantity\}`,\s*code: "out_of_stock"/);
    expect(handler).toContain('res.status(400).json({ error: shippingResult.error, code: "shipping_unavailable" })');
  });
});
