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

describe("batch inventory on the legacy storefront base", () => {
  it("exposes the batch feed on both public bases", () => {
    expect(source).toContain(
      'app.get("/api/public/v1/:handle/inventory", rateLimitPublicRead, handlePublicHandleInventory)',
    );
    expect(source).toContain(
      'app.get("/api/public/v1/storefronts/:storefrontId/inventory", rateLimitPublicRead, handlePublicHandleInventory)',
    );
  });

  it("resolves the org from either route shape", () => {
    const handler = handlerFor("async function handlePublicHandleInventory", "\n}\n");
    expect(handler).toContain("req.params.storefrontId || (await resolveStorefrontHandle(req.params.handle))");
  });

  it("keeps the batch feed on the short inventory tier", () => {
    const handler = handlerFor("async function handlePublicHandleInventory", "\n}\n");
    expect(handler).toContain('cacheControl: "public, max-age=5, stale-while-revalidate=30, s-maxage=5"');
  });

  it("never tags a cached response with the org id", () => {
    const handler = handlerFor("async function handlePublicHandleInventory", "\n}\n");
    expect(handler).toContain("req.params.handle ? cacheTagHeader(req.params.handle, ids) : undefined");
    expect(handler).not.toContain("cacheTagHeader(req.params.storefrontId");
  });

  it("still bounds and requires the id list", () => {
    const handler = handlerFor("async function handlePublicHandleInventory", "\n}\n");
    expect(handler).toContain('if (ids.length > 100) return res.status(413)');
    expect(handler).toContain('if (!ids.length) return res.status(400).json({ error: "ids_required" })');
  });
});
