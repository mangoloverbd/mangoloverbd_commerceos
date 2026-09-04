import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

function sectionBetween(startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("order routing wiring", () => {
  it("imports one shared resolver and invokes it for every order creation path", () => {
    expect(source).toContain('from "./warehouseRouting.js"');
    expect(source).toContain("resolveWarehouseId");
    expect(source).toContain("computeOrderWeightKg");
    expect(source.match(/async function resolveOrderRouting\(/g)).toHaveLength(1);
    expect(source.match(/await resolveOrderRouting\(/g)).toHaveLength(3);
  });

  it("org-scopes every routing lookup and throws lookup errors", () => {
    const defaultWarehouseLookup = sectionBetween(
      "async function getDefaultWarehouseId",
      "async function resolveOrderRouting",
    );
    const resolver = sectionBetween(
      "async function resolveOrderRouting",
      'app.get("/api/warehouses"',
    );

    expect(defaultWarehouseLookup).toMatch(
      /\.from\("warehouses"\)[\s\S]*?\.eq\("org_id", orgId\)/,
    );
    expect(defaultWarehouseLookup).toContain("if (error) throw error;");
    expect(resolver).toMatch(
      /\.from\("product_variants"\)[\s\S]*?\.in\("id", variantIds\)[\s\S]*?\.eq\("org_id", orgId\)/,
    );
    expect(resolver).toMatch(
      /\.from\("products"\)[\s\S]*?\.in\("id", productIds\)[\s\S]*?\.eq\("org_id", orgId\)/,
    );

    const candidateLookup = resolver.slice(resolver.indexOf("const normalizedNames"));
    expect(candidateLookup).toMatch(
      /\.from\("products"\)[\s\S]*?\.eq\("org_id", orgId\)/,
    );
    expect(resolver.match(/if \(error\) throw error;/g)).toHaveLength(3);
  });

  it("only scans unresolved named items and paginates every org-scoped fallback candidate", () => {
    const resolver = sectionBetween(
      "async function resolveOrderRouting",
      'app.get("/api/warehouses"',
    );
    const candidateLookup = resolver.slice(resolver.indexOf("const resolvedProductForItem"));

    expect(candidateLookup).toContain("const resolvedProductForItem = (item) => {");
    expect(candidateLookup).toContain(
      "const directProduct = item.productId ? productsById[item.productId] : null;",
    );
    expect(candidateLookup).toContain("if (directProduct) return directProduct;");
    expect(candidateLookup).toContain(
      "const variantProductId = item.variantId ? variantsById[item.variantId]?.product_id : null;",
    );
    expect(candidateLookup).toContain(
      "return variantProductId ? productsById[variantProductId] || null : null;",
    );
    expect(candidateLookup).toContain(
      "const unresolvedNamedItems = list.filter((item) => !resolvedProductForItem(item));",
    );
    expect(candidateLookup).toContain("const pageSize = 500;");
    expect(candidateLookup).toContain("for (let from = 0; ; from += pageSize) {");
    expect(candidateLookup).toContain("const to = from + pageSize - 1;");
    expect(candidateLookup).toContain('.order("id", { ascending: true })');
    expect(candidateLookup).toContain(".range(from, to)");
    expect(candidateLookup).toContain("const rows = data || [];");
    expect(candidateLookup).toContain("if (rows.length < pageSize) break;");
  });

  it("matches social product names in JavaScript without selecting an arbitrary duplicate", () => {
    const resolver = sectionBetween(
      "async function resolveOrderRouting",
      'app.get("/api/warehouses"',
    );
    const candidateLookup = resolver.slice(resolver.indexOf("const normalizedNames"));

    expect(source).toContain("function normalizeOrderProductName(value)");
    expect(source).toContain("value.trim().toLowerCase()");
    expect(candidateLookup).not.toContain('.in("name",');
    expect(candidateLookup).toContain("normalizeOrderProductName(product.name)");
    expect(candidateLookup).toContain("normalizedNames.has(normalizedName)");
    expect(candidateLookup).toContain("if (matches.length !== 1) continue;");
    expect(candidateLookup).toContain("productsByName[normalizedName] = matches[0]");
  });

  it("enriches an unambiguous social name with its canonical product ID before calculating weight", () => {
    const resolver = sectionBetween(
      "async function resolveOrderRouting",
      'app.get("/api/warehouses"',
    );

    expect(resolver).toMatch(
      /const routingItems = list\.map\(\(item\) => \{[\s\S]*?const matchedProduct =[\s\S]*?productId: matchedProduct\.id/,
    );
    expect(resolver).toContain("const matchedProduct = resolvedProductForItem(item) ||");
    expect(resolver).toContain(
      "computeOrderWeightKg({ items: routingItems, variantsById, productsById })",
    );
  });

  it("stores one routing and weight snapshot during storefront checkout without changing validation or inventory handling", () => {
    const checkout = sectionBetween(
      "async function handlePublicHandleOrderSubmit",
      "async function handlePublicHandleProducts",
    );
    const orderRow = checkout.slice(checkout.indexOf("const orderRow = {"));

    expect(checkout).toContain(
      'select("id, product_id, org_id, attributes, price_adjustment, stock_quantity, weight_kg")',
    );
    expect(checkout).toContain(
      'select("id, name, selling_price, published, weight_kg, warehouse_id")',
    );
    expect(checkout).toContain("const routing = await resolveOrderRouting(supabase, orgId, orderItems);");
    expect(checkout.indexOf("const routing = await resolveOrderRouting")).toBeGreaterThan(
      checkout.indexOf("const productSummary"),
    );
    expect(checkout.indexOf("const routing = await resolveOrderRouting")).toBeLessThan(
      checkout.indexOf("const orderRow = {"),
    );
    expect(orderRow).toContain("warehouse_id: routing.warehouseId");
    expect(orderRow).toContain("warehouse_auto: true");
    expect(orderRow).toContain("weight_kg: routing.weightKg");
    expect(orderRow).not.toContain("req.body.warehouse");
    expect(checkout).toContain('"Each item must have a variantId"');
    expect(checkout).toContain("variant.stock_quantity < qty");
    expect(checkout).toContain(".update({ stock_quantity: Math.max(0, variantMap[item.variantId].stock_quantity - item.quantity) })");
  });

  it("stores the same immutable snapshot during manual dashboard order creation", () => {
    const manualCreate = sectionBetween(
      'app.post("/api/orders"',
      'app.patch("/api/orders/:id"',
    );

    expect(manualCreate).toContain("const routing = await resolveOrderRouting(supabase, orgId, routingItems);");
    expect(manualCreate).toContain("productId: item.product_id || undefined");
    expect(manualCreate).toContain("variantId: item.variant_id || undefined");
    expect(manualCreate).toContain("productName: item.product_name");
    expect(manualCreate).toContain("row.warehouse_id = routing.warehouseId;");
    expect(manualCreate).toContain("row.warehouse_auto = true;");
    expect(manualCreate).toContain("row.weight_kg = routing.weightKg;");
    expect(manualCreate).not.toContain("req.body.warehouse");
  });

  it("stores the same immutable snapshot during social inbox capture", () => {
    const socialCapture = sectionBetween(
      "async function saveMetaInboxOrder",
      "// ─── Platform send helpers",
    );

    expect(socialCapture).toContain("const items = [");
    expect(socialCapture).toContain("let resolvedVariantId = order.variant_id || null");
    expect(socialCapture).toContain("variant_id: resolvedVariantId");
    expect(socialCapture).toContain("await resolveOrderRouting(");
    expect(socialCapture).toContain("productName: item.product");
    expect(socialCapture).toContain("variantId: item.variant_id || undefined");
    expect(socialCapture).not.toContain("variantId: order.variant_id");
    expect(socialCapture).toContain("warehouse_id: routing.warehouseId");
    expect(socialCapture).toContain("warehouse_auto: true");
    expect(socialCapture).toContain("weight_kg: routing.weightKg");
  });
});
