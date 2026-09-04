import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

function routeSource(signature: string, nextSignature: string) {
  const start = source.indexOf(signature);
  const end = source.indexOf(nextSignature, start);
  return source.slice(start, end);
}

describe("warehouse detail API", () => {
  const detailRoute = routeSource(
    'app.get("/api/warehouses/:id"',
    'app.post("/api/products/bulk-assign-warehouse"',
  );
  const bulkRoute = routeSource(
    'app.post("/api/products/bulk-assign-warehouse"',
    "// ─── Products Catalog",
  );

  it("registers the scoped detail and bulk assignment routes", () => {
    expect(source).toContain('app.get("/api/warehouses/:id"');
    expect(source).toContain('app.post("/api/products/bulk-assign-warehouse"');
  });

  it("validates the detail warehouse UUID before database access", () => {
    expect(detailRoute).toContain("const warehouseId = req.params.id");
    expect(detailRoute).toContain("if (!isValidWarehouseId(warehouseId))");
    expect(detailRoute).toContain('res.status(400).json({ error: "Invalid warehouse ID" })');
    expect(detailRoute.indexOf("isValidWarehouseId(warehouseId)")).toBeLessThan(
      detailRoute.indexOf("getServiceSupabase"),
    );
  });

  it("uses the active lookup and includes unassigned products only for the default warehouse", () => {
    expect(detailRoute).toContain("await getActiveWarehouse(supabase, orgId, warehouseId)");
    expect(detailRoute).not.toContain('.from("warehouses")');
    expect(detailRoute).toContain("const includeUnassigned = warehouse.is_default === true");
    expect(detailRoute).toContain("warehouse_id.is.null");
    expect(detailRoute).toContain('query.eq("warehouse_id", warehouseId)');
  });

  it("marks explicit assignments against the canonical warehouse ID, not raw route input", () => {
    expect(detailRoute).toContain("assigned_explicitly: product.warehouse_id === warehouse.id");
    expect(detailRoute).not.toContain("assigned_explicitly: product.warehouse_id === warehouseId");
  });

  it("keeps the detail product query org-scoped and returns a variant-aware stock summary", () => {
    expect(detailRoute).toMatch(
      /\.from\("products"\)[\s\S]*?\.select\("id, name, selling_price, stock_quantity, weight_kg, published, warehouse_id"\)[\s\S]*?\.eq\("org_id", orgId\)/,
    );
    expect(detailRoute).toContain("product_count: products.length");
    expect(detailRoute).toContain("total_stock:");
    expect(detailRoute).toContain("published_count:");
    expect(detailRoute).toContain('.from("product_variants")');
    expect(detailRoute).toContain('.select("product_id, stock_quantity")');
    expect(detailRoute).toContain("resolvedStock");
  });

  it("requires UUID product IDs and only accepts a UUID or null warehouse ID", () => {
    expect(bulkRoute).toContain("const body = req.body");
    expect(bulkRoute).toContain("Array.isArray(body.product_ids)");
    expect(bulkRoute).toContain("productIds.length === 0");
    expect(bulkRoute).toContain("productIds.every(isValidWarehouseId)");
    expect(bulkRoute).toContain("product_ids must be a non-empty array of UUID strings");
    expect(bulkRoute).toContain("const warehouseId = body.warehouse_id");
    expect(bulkRoute).toContain("if (warehouseId !== null && !isValidWarehouseId(warehouseId))");
    expect(bulkRoute).toContain("warehouse_id must be a UUID string or null");
    expect(bulkRoute).not.toContain("req.body?.warehouse_id || null");
    expect(bulkRoute.indexOf("productIds.length === 0")).toBeLessThan(
      bulkRoute.indexOf("getServiceSupabase"),
    );
  });

  it("validates non-null assignments before an all-or-error transactional update", () => {
    expect(bulkRoute).toMatch(
      /if \(warehouseId !== null\) \{[\s\S]*?await getActiveWarehouse\(supabase, orgId, warehouseId\)[\s\S]*?if \(!warehouse\) return res\.status\(404\)\.json\(\{ error: "Warehouse not found" \}\);/,
    );
    expect(bulkRoute).not.toContain('.from("warehouses")');
    expect(bulkRoute).toContain("new Set(body.product_ids)");
    expect(bulkRoute).toContain('supabase.rpc("bulk_assign_products_to_warehouse"');
    expect(bulkRoute).toContain("p_org_id: orgId");
  });

  it("authenticates both routes, never takes a client org, and returns generic unexpected errors", () => {
    for (const route of [detailRoute, bulkRoute]) {
      expect(route).toContain("await getUser(getToken(req))");
      expect(route).toContain('res.status(401).json({ error: "Unauthorized" })');
      expect(route).toContain("await getUserOrg(supabase, user.id)");
      expect(route).toContain("return sendWarehouseError(res, err)");
    }

    expect(bulkRoute).not.toContain("req.body.org_id");
    expect(bulkRoute).not.toContain("req.body?.org_id");
  });
});
