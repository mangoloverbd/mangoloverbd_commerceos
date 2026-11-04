import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const apiFetch = vi.hoisted(() => vi.fn());
const snapshotStore = vi.hoisted(() => ({
  loadOrdersSnapshot: vi.fn(),
  saveOrdersSnapshot: vi.fn(),
  clearOrdersSnapshot: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/lib/ordersSnapshot", () => snapshotStore);

import {
  removeOrdersFromCache,
  resetOrdersSyncCursor,
  setOrdersSyncUser,
  subscribeOrdersPreview,
  syncOrders,
  type OrdersPreview,
} from "@/lib/ordersSync";

type TestOrder = { id: string; created_at: string };

const a: TestOrder = { id: "a", created_at: "2026-09-01T00:00:00Z" };
const b: TestOrder = { id: "b", created_at: "2026-09-02T00:00:00Z" };
const c: TestOrder = { id: "c", created_at: "2026-09-03T00:00:00Z" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("deleted orders", () => {
  let queryClient: QueryClient;

  beforeEach(async () => {
    apiFetch.mockReset();
    Object.values(snapshotStore).forEach((fn) => fn.mockReset());
    setOrdersSyncUser(null);
    resetOrdersSyncCursor();
    setOrdersSyncUser("user-1");
    queryClient = new QueryClient();
    apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [c, b, a], totalCount: 3, syncedAt: "2026-09-24T00:00:00.000Z" }));
    await syncOrders<TestOrder>(queryClient);
    apiFetch.mockReset();
    snapshotStore.saveOrdersSnapshot.mockReset();
  });

  it("removes your own deleted orders from the list and the saved list at once", async () => {
    const previews: OrdersPreview<TestOrder>[] = [];
    const unsubscribe = subscribeOrdersPreview<TestOrder>((preview) => previews.push(preview));
    try {
      await removeOrdersFromCache(queryClient, ["b"]);
    } finally {
      unsubscribe();
    }

    expect(queryClient.getQueryData(["/api/orders"])).toEqual([c, a]);
    expect(queryClient.getQueryData(["/api/orders/count"])).toBe(2);
    expect(previews).toEqual([{ orders: [c, a], totalCount: 2, partial: false }]);
    // Saved before resolving, so a reload right after shows the list without them.
    expect(snapshotStore.saveOrdersSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1", orders: [c, a], totalCount: 2, syncedAt: "2026-09-24T00:00:00.000Z",
    }));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("drops orders deleted elsewhere using the id list instead of reloading every order", async () => {
    apiFetch
      .mockResolvedValueOnce(jsonResponse({ orders: [], totalCount: 2, syncedAt: "2026-09-24T00:01:00.000Z", delta: true }))
      .mockResolvedValueOnce(jsonResponse({ ids: ["c", "a"], totalCount: 2 }));

    const orders = await syncOrders<TestOrder>(queryClient);

    expect(orders).toEqual([c, a]);
    expect(queryClient.getQueryData(["/api/orders/count"])).toBe(2);
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(apiFetch).toHaveBeenLastCalledWith("/api/orders?ids_only=1");
  });

  it("falls back to the full list when the id list still does not add up", async () => {
    apiFetch
      .mockResolvedValueOnce(jsonResponse({ orders: [], totalCount: 4, syncedAt: "2026-09-24T00:01:00.000Z", delta: true }))
      .mockResolvedValueOnce(jsonResponse({ ids: ["d", "c", "b", "a"], totalCount: 4 }))
      .mockResolvedValueOnce(jsonResponse({ orders: [c, b, a], totalCount: 3, syncedAt: "2026-09-24T00:02:00.000Z" }));

    await syncOrders<TestOrder>(queryClient);

    expect(apiFetch).toHaveBeenLastCalledWith("/api/orders");
  });
});

describe("GET /api/orders?ids_only=1", () => {
  const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
  const start = source.indexOf('app.get("/api/orders"');
  const route = source.slice(start, source.indexOf("\n});", start));
  const idsOnly = route.slice(route.indexOf('req.query.ids_only === "1"'), route.indexOf("if (changedSinceParam)"));

  it("returns only ids, inside the workspace, after the auth guard", () => {
    expect(route.indexOf("if (!user) return res.status(401)")).toBeLessThan(route.indexOf('req.query.ids_only === "1"'));
    expect(idsOnly).toContain('.select("id")');
    expect(idsOnly).toContain('.eq("org_id", orgId)');
    expect(idsOnly).toContain("ids");
  });
});

describe("Orders page delete", () => {
  const table = readFileSync(resolve(process.cwd(), "src/components/OrdersTable.tsx"), "utf8");
  const handler = table.slice(table.indexOf("const handleDeleteOrders"), table.indexOf("window.location.reload()", table.indexOf("const handleDeleteOrders")));

  it("updates the saved list before the page reloads", () => {
    expect(handler).toContain("await removeOrdersFromCache(queryClient, idsToDelete)");
  });
});
