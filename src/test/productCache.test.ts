import { describe, expect, it } from "vitest";

import { buildProductCacheUrls, purgeProductCacheUrls } from "../../server/productCache.js";

describe("buildProductCacheUrls", () => {
  it("returns every catalog and detail URL family for an image mutation", () => {
    expect(
      buildProductCacheUrls({
        publicDomain: "merchant.example",
        orgId: "org-1",
        handle: "mango-lover",
        productSlug: "black-seed-honey",
        listChanged: true,
      }),
    ).toEqual([
      "https://merchant.example/api/public/v1/mango-lover/products",
      "https://merchant.example/api/public/v1/mango-lover/products/black-seed-honey",
      "https://merchant.example/api/public/v1/mango-lover/products/black-seed-honey/inventory",
      "https://merchant.example/api/public/v1/storefronts/org-1/products",
      "https://merchant.example/api/public/v1/storefronts/org-1/products/black-seed-honey",
      "https://merchant.example/api/public/v1/storefronts/org-1/products/black-seed-honey/inventory",
      "https://merchant.example/api/public/storefronts/org-1/products",
      "https://merchant.example/api/public/storefronts/org-1/products/black-seed-honey",
    ]);
  });

  it("omits unavailable handle and list URLs without omitting id-based detail routes", () => {
    expect(
      buildProductCacheUrls({
        publicDomain: "merchant.example",
        orgId: "org-1",
        handle: null,
        productSlug: "a product/with spaces",
        listChanged: false,
      }),
    ).toEqual([
      "https://merchant.example/api/public/v1/storefronts/org-1/products/a%20product%2Fwith%20spaces",
      "https://merchant.example/api/public/v1/storefronts/org-1/products/a%20product%2Fwith%20spaces/inventory",
      "https://merchant.example/api/public/storefronts/org-1/products/a%20product%2Fwith%20spaces",
    ]);
  });

  it("includes the bulk inventory URL for every canonical storefront path", () => {
    expect(
      buildProductCacheUrls({
        publicDomain: "merchant.example",
        orgId: "org-1",
        handle: "mango-lover",
        inventoryIds: ["old-product", "new/product"],
        listChanged: false,
      }),
    ).toContain("https://merchant.example/api/public/v1/storefronts/org-1/inventory?ids=old-product,new%2Fproduct");
  });

  it("purges then warms every supplied URL when cache credentials are configured", async () => {
    const requests: Array<[string, RequestInit | undefined]> = [];
    const urls = ["https://merchant.example/catalog", "https://merchant.example/product"];

    const result = await purgeProductCacheUrls({
      zoneId: "zone",
      apiToken: "token",
      urls,
      warmToken: "warm",
      fetchImpl: async (url, options) => {
        requests.push([String(url), options]);
        return new Response("ok", { status: 200 });
      },
    });

    expect(result).toEqual({ purged: true });
    expect(requests).toEqual([
      [
        "https://api.cloudflare.com/client/v4/zones/zone/purge_cache",
        {
          method: "POST",
          headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
          body: JSON.stringify({ files: urls }),
        },
      ],
      [urls[0], { headers: { "X-Warm-Token": "warm" } }],
      [urls[1], { headers: { "X-Warm-Token": "warm" } }],
    ]);
  });
});
