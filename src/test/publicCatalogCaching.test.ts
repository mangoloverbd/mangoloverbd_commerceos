import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");

function handlerFor(anchor: string, nextAnchor: string): string {
  const start = source.indexOf(anchor);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf(nextAnchor, start + anchor.length);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("public catalog CDN caching", () => {
  it("declares a shared catalog tier the edge can cache", () => {
    expect(source).toContain(
      'const CATALOG_CACHE_CONTROL = "public, max-age=0, s-maxage=30, stale-while-revalidate=86400"',
    );
  });

  it("serves every catalog read from the shared tier, not no-store", () => {
    const handlers = [
      handlerFor("async function handlePublicStorefrontProducts", "async function handlePublicStorefrontProductDetail"),
      handlerFor("async function handlePublicStorefrontProductDetail", "// ─── Public Storefront Config"),
      handlerFor("async function handlePublicHandleProducts", "async function handlePublicHandleProductDetail"),
      handlerFor("async function handlePublicHandleProductDetail", "async function handlePublicHandleInventory"),
    ];

    for (const handler of handlers) {
      expect(handler).toContain("cacheControl: CATALOG_CACHE_CONTROL");
      expect(handler).not.toContain('cacheControl: "no-store"');
    }
  });

  it("varies on Origin so a shared cache cannot leak one site's CORS grant to another", () => {
    const respond = handlerFor("function respondCached(", "// Catalog is stock-free");
    expect(respond).toContain('res.set("Vary", "Accept-Encoding, Origin")');
  });

  it("keeps stock on the short inventory tier so a cached catalog stays safe", () => {
    const inventory = handlerFor("async function handlePublicHandleInventory", "async function handlePublicHandleProductInventory");
    expect(inventory).toContain("s-maxage=5");
    expect(inventory).not.toContain("CATALOG_CACHE_CONTROL");
  });

  it("never caches a catalog miss", () => {
    const detail = handlerFor(
      "async function handlePublicHandleProductInventory",
      'app.get("/api/public/v1/:handle/config"',
    );
    expect(detail).toContain('res.set("Cache-Control", "no-store")');
  });
});
