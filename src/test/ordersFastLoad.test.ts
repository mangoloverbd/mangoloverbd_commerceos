import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  FIRST_PAGE_SIZE,
  getOrdersPreview,
  resetOrdersSyncCursor,
  setOrdersSyncUser,
  subscribeOrdersPreview,
  syncOrders,
  type OrdersPreview,
} from "@/lib/ordersSync";

type TestOrder = { id: string; created_at: string; status?: string };

const a: TestOrder = { id: "a", created_at: "2026-09-01T00:00:00Z", status: "pending" };
const b: TestOrder = { id: "b", created_at: "2026-09-02T00:00:00Z", status: "pending" };
const c: TestOrder = { id: "c", created_at: "2026-09-03T00:00:00Z", status: "pending" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function deferred<T>() {
  let resolveValue: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => { resolveValue = res; });
  return { promise, resolve: resolveValue };
}

const FIRST_PAGE_URL = `/api/orders?limit=${FIRST_PAGE_SIZE}`;

describe("orders first page", () => {
  let queryClient: QueryClient;
  let previews: OrdersPreview<TestOrder>[];
  let unsubscribe: () => void;

  beforeEach(() => {
    apiFetch.mockReset();
    Object.values(snapshotStore).forEach((fn) => fn.mockReset());
    setOrdersSyncUser(null);
    resetOrdersSyncCursor();
    queryClient = new QueryClient();
    previews = [];
    unsubscribe = subscribeOrdersPreview<TestOrder>((preview) => previews.push(preview));
  });
  afterEach(() => unsubscribe());

  it("shows the newest page while the full list is still loading, then replaces it", async () => {
    const full = deferred<Response>();
    apiFetch.mockImplementation(async (url: string) => (
      url === FIRST_PAGE_URL ? jsonResponse({ orders: [c], totalCount: 3, partial: true }) : full.promise
    ));
    const sync = syncOrders<TestOrder>(queryClient, { firstPage: true });

    await vi.waitFor(() => expect(previews).toHaveLength(1));
    expect(previews[0]).toEqual({ orders: [c], totalCount: 3, partial: true });
    expect(getOrdersPreview()).toEqual(previews[0]);
    // The partial page never enters the shared cache.
    expect(queryClient.getQueryData(["/api/orders"])).toBeUndefined();

    full.resolve(jsonResponse({ orders: [c, b, a], totalCount: 3, syncedAt: "2026-09-24T00:00:00.000Z" }));
    await expect(sync).resolves.toEqual([c, b, a]);
    expect(queryClient.getQueryData(["/api/orders"])).toEqual([c, b, a]);
    expect(getOrdersPreview()).toBeNull();
  });

  it("ignores a first page that arrives after the full list", async () => {
    const page = deferred<Response>();
    apiFetch.mockImplementation(async (url: string) => (
      url === FIRST_PAGE_URL ? page.promise : jsonResponse({ orders: [b, a], totalCount: 2, syncedAt: "2026-09-24T00:00:00.000Z" })
    ));
    await syncOrders<TestOrder>(queryClient, { firstPage: true });
    page.resolve(jsonResponse({ orders: [b], totalCount: 2, partial: true }));
    await new Promise((res) => setTimeout(res, 0));
    expect(previews).toHaveLength(0);
    expect(getOrdersPreview()).toBeNull();
  });

  it("asks for the first page only when opted in and nothing is cached", async () => {
    apiFetch.mockImplementation(async () => jsonResponse({ orders: [a], totalCount: 1, syncedAt: "2026-09-24T00:00:00.000Z" }));
    await syncOrders(queryClient);
    expect(apiFetch).not.toHaveBeenCalledWith(FIRST_PAGE_URL);

    await syncOrders(queryClient, { full: true, firstPage: true });
    expect(apiFetch).not.toHaveBeenCalledWith(FIRST_PAGE_URL);
  });

  it("still loads the full list when the first page fails", async () => {
    apiFetch.mockImplementation(async (url: string) => (
      url === FIRST_PAGE_URL ? jsonResponse({ error: "boom" }, 500) : jsonResponse({ orders: [a], totalCount: 1, syncedAt: "2026-09-24T00:00:00.000Z" })
    ));
    await expect(syncOrders<TestOrder>(queryClient, { firstPage: true })).resolves.toEqual([a]);
    expect(previews).toHaveLength(0);
  });
});

describe("orders list saved in the browser", () => {
  let queryClient: QueryClient;
  let previews: OrdersPreview<TestOrder>[];
  let unsubscribe: () => void;

  beforeEach(() => {
    apiFetch.mockReset();
    Object.values(snapshotStore).forEach((fn) => fn.mockReset());
    snapshotStore.loadOrdersSnapshot.mockResolvedValue(null);
    snapshotStore.saveOrdersSnapshot.mockResolvedValue(undefined);
    snapshotStore.clearOrdersSnapshot.mockResolvedValue(undefined);
    setOrdersSyncUser(null);
    snapshotStore.clearOrdersSnapshot.mockClear();
    queryClient = new QueryClient();
    previews = [];
    unsubscribe = subscribeOrdersPreview<TestOrder>((preview) => previews.push(preview));
  });
  afterEach(() => {
    unsubscribe();
    vi.useRealTimers();
  });

  it("shows the saved list at once and then fetches only what changed", async () => {
    setOrdersSyncUser("user-1");
    snapshotStore.loadOrdersSnapshot.mockResolvedValue({
      version: 1, userId: "user-1", orders: [b, a], totalCount: 2,
      syncedAt: "2026-09-24T00:00:00.000Z", fullAt: Date.now() - 60_000, savedAt: Date.now() - 60_000,
    });
    apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [c], totalCount: 3, syncedAt: "2026-09-24T00:05:00.000Z", delta: true }));

    const orders = await syncOrders<TestOrder>(queryClient, { firstPage: true });

    expect(snapshotStore.loadOrdersSnapshot).toHaveBeenCalledWith("user-1");
    expect(previews[0]).toEqual({ orders: [b, a], totalCount: 2, partial: false });
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith(`/api/orders?changed_since=${encodeURIComponent("2026-09-24T00:00:00.000Z")}`);
    expect(orders.map((o) => o.id)).toEqual(["c", "b", "a"]);
  });

  it("shows a saved list older than 30 minutes, then reloads the full list", async () => {
    setOrdersSyncUser("user-1");
    snapshotStore.loadOrdersSnapshot.mockResolvedValue({
      version: 1, userId: "user-1", orders: [a], totalCount: 1,
      syncedAt: "2026-09-24T00:00:00.000Z", fullAt: Date.now() - 31 * 60_000, savedAt: Date.now() - 31 * 60_000,
    });
    apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [b, a], totalCount: 2, syncedAt: "2026-09-24T01:00:00.000Z" }));

    await syncOrders<TestOrder>(queryClient, { firstPage: true });
    expect(previews[0].orders).toEqual([a]);
    // The saved list is already on screen, so no first page is requested.
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith("/api/orders");
  });

  it("reads the saved list only once per user and not at all when signed out", async () => {
    apiFetch.mockImplementation(async () => jsonResponse({ orders: [a], totalCount: 1, syncedAt: "2026-09-24T00:00:00.000Z" }));
    await syncOrders(queryClient);
    expect(snapshotStore.loadOrdersSnapshot).not.toHaveBeenCalled();

    setOrdersSyncUser("user-1");
    queryClient.clear();
    await syncOrders(queryClient);
    queryClient.clear();
    await syncOrders(queryClient);
    expect(snapshotStore.loadOrdersSnapshot).toHaveBeenCalledTimes(1);
  });

  it("saves a full load and skips saving a poll that changed nothing", async () => {
    const idle: (() => void)[] = [];
    vi.stubGlobal("requestIdleCallback", (cb: () => void) => { idle.push(cb); return idle.length; });
    try {
      setOrdersSyncUser("user-1");
      apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [b, a], totalCount: 2, syncedAt: "2026-09-24T00:00:00.000Z" }));
      await syncOrders(queryClient);
      idle.splice(0).forEach((cb) => cb());
      expect(snapshotStore.saveOrdersSnapshot).toHaveBeenCalledTimes(1);
      expect(snapshotStore.saveOrdersSnapshot).toHaveBeenCalledWith(expect.objectContaining({
        userId: "user-1", orders: [b, a], totalCount: 2, syncedAt: "2026-09-24T00:00:00.000Z",
      }));

      apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [], totalCount: 2, syncedAt: "2026-09-24T00:00:00.000Z", delta: true }));
      await syncOrders(queryClient);
      idle.splice(0).forEach((cb) => cb());
      expect(snapshotStore.saveOrdersSnapshot).toHaveBeenCalledTimes(1);

      apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [c], totalCount: 3, syncedAt: "2026-09-24T00:02:00.000Z", delta: true }));
      await syncOrders(queryClient);
      idle.splice(0).forEach((cb) => cb());
      expect(snapshotStore.saveOrdersSnapshot).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("wipes the saved list on sign-out and when another user signs in", () => {
    setOrdersSyncUser("user-1");
    expect(snapshotStore.clearOrdersSnapshot).not.toHaveBeenCalled();
    setOrdersSyncUser("user-1");
    expect(snapshotStore.clearOrdersSnapshot).not.toHaveBeenCalled();
    setOrdersSyncUser("user-2");
    expect(snapshotStore.clearOrdersSnapshot).toHaveBeenCalledTimes(1);
    setOrdersSyncUser(null);
    expect(snapshotStore.clearOrdersSnapshot).toHaveBeenCalledTimes(2);
  });
});

describe("GET /api/orders?limit first page route", () => {
  const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
  const start = source.indexOf('app.get("/api/orders"');
  const route = source.slice(start, source.indexOf("\n});", start));
  const firstPage = route.slice(route.indexOf("req.query.limit !== undefined"), route.indexOf("fullOrdersListInFlight.get"));

  it("validates the limit and keeps the workspace guard", () => {
    expect(firstPage).toContain("Number.isInteger(limit)");
    expect(firstPage).toMatch(/limit > 1000/);
    expect(firstPage).toMatch(/res\.status\(400\)/);
    expect(firstPage).toContain('.eq("org_id", orgId)');
    expect(firstPage).toContain('.eq("warehouse_id", warehouseFilter)');
    expect(firstPage).toContain(".range(0, limit - 1)");
    expect(firstPage).toContain("partial: true");
  });

  it("runs after the auth guard and the delta and date-range paths", () => {
    expect(route.indexOf("if (!user) return res.status(401)")).toBeLessThan(route.indexOf("req.query.limit !== undefined"));
    expect(route.indexOf("if (changedSinceParam)")).toBeLessThan(route.indexOf("req.query.limit !== undefined"));
    expect(route.indexOf("createdFromParam || createdToParam")).toBeLessThan(route.indexOf("req.query.limit !== undefined"));
  });
});
