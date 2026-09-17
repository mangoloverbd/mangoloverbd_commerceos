import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function loadChunkIds(): (ids: string[], size?: number) => string[][] {
  const server = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
  const start = server.indexOf("function chunkIds(");
  if (start === -1) throw new Error("chunkIds helper not found in server/index.js");
  const end = server.indexOf("\n}", start) + 2;
  const factory = new Function(`${server.slice(start, end)}; return chunkIds;`);
  return factory() as (ids: string[], size?: number) => string[][];
}

describe("order id batching", () => {
  it("chunks large id lists into 100-id batches preserving order", () => {
    const chunkIds = loadChunkIds();
    const ids = Array.from({ length: 250 }, (_, i) => `order-${i}`);
    const batches = chunkIds(ids);

    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(100);
    expect(batches[1]).toHaveLength(100);
    expect(batches[2]).toHaveLength(50);
    expect(batches.flat()).toEqual(ids);
  });

  it("handles empty and small lists", () => {
    const chunkIds = loadChunkIds();

    expect(chunkIds([])).toEqual([]);
    expect(chunkIds(["a", "b"])).toEqual([["a", "b"]]);
  });

  it("batches the unbounded order-items fetch in GET /api/orders", () => {
    const server = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
    const routeStart = server.indexOf('app.get("/api/orders"');
    const routeEnd = server.indexOf("const ABANDONED_CHECKOUT_DASHBOARD_FIELDS", routeStart);
    const route = server.slice(routeStart, routeEnd);

    expect(route).toContain("chunkIds(orderIds)");
    expect(route).toContain('from("order_items")');
    expect(route).not.toMatch(/\.in\("order_id", orderIds\)/);
  });

  it("batches the bulk courier order load", () => {
    const server = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
    const routeStart = server.indexOf('app.post("/api/send-to-courier/bulk"');
    const rest = server.slice(routeStart + 50);
    const next = rest.search(/\napp\.(get|post|patch|put|delete)\("/);
    const route = next === -1 ? rest : rest.slice(0, next);

    expect(route).toContain("chunkIds(orderIds)");
    expect(route).not.toMatch(/\.in\("id", orderIds\)/);
  });
});
