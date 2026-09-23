import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { matchProductFromText } from "../../server/variantMatching.js";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

function sectionBetween(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("abandoned convert catalog linking (fix #2)", () => {
  it("fuzzy-matches variant-suffixed cart names to catalog products", () => {
    // Cart stores "Katimon Mango (6KG)", catalog stores "Katimon Mango".
    // This is the pure helper already used by resolveOrderRouting.
    const products = [
      { id: "p-katimon", name: "কাটিমন আম | Katimon Mango" },
      { id: "p-bori", name: "হোমমেড কুমড়ো বড়ি | Homemade Pumpkin Bori" },
    ];
    expect(
      matchProductFromText({ text: "কাটিমন আম | Katimon Mango (6KG)", products })?.id,
    ).toBe("p-katimon");
    expect(
      matchProductFromText({
        text: "হোমমেড কুমড়ো বড়ি | Homemade Pumpkin Bori (১ কেজি)",
        products,
      })?.id,
    ).toBe("p-bori");
  });

  it("resolveAbandonedCatalogIds falls back to fuzzy match when exact name misses", () => {
    const fn = sectionBetween(
      "async function resolveAbandonedCatalogIds",
      'app.post("/api/abandoned-checkouts/:id/convert"',
    );
    // RED: currently only exact byName.get(), so "(6KG)" suffix yields null productId.
    expect(fn).toContain("matchProductFromText");
  });

  it("abandoned convert persists resolved catalog IDs into order_items", () => {
    const convert = sectionBetween(
      'app.post("/api/abandoned-checkouts/:id/convert"',
      'app.get("/api/orders/recent-notifications"',
    );
    // RED: currently inserts raw orderItems with null product_id instead of
    // routing.resolvedItems (compare custom-store webhook which uses replace_order_items).
    expect(convert).toContain("routing.resolvedItems");
  });
});

describe("warehouse reassignment resync (fix #3)", () => {
  it("bulk-assign resyncs open auto-routed orders containing reassigned products", () => {
    const bulk = sectionBetween(
      'app.post("/api/products/bulk-assign-warehouse"',
      "// ─── Products Catalog",
    );
    // RED: currently only updates products table, old auto orders keep stale warehouse.
    expect(bulk).toContain("warehouse_auto");
  });

  it("single product warehouse edit resyncs open auto-routed orders", () => {
    const patch = sectionBetween(
      'app.patch("/api/products/:id"',
      'app.delete("/api/products/:id"',
    );
    expect(patch).toContain("warehouse_auto");
  });
});
