import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import { mergeOrderDelta, resetOrdersSyncCursor, syncOrders, OrdersSyncError } from "@/lib/ordersSync";

type TestOrder = { id: string; created_at: string; status?: string };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const a: TestOrder = { id: "a", created_at: "2026-09-01T00:00:00Z", status: "pending" };
const b: TestOrder = { id: "b", created_at: "2026-09-02T00:00:00Z", status: "pending" };
const c: TestOrder = { id: "c", created_at: "2026-09-03T00:00:00Z", status: "pending" };

describe("mergeOrderDelta", () => {
  it("replaces changed orders by id, inserts new ones, and sorts by created_at desc", () => {
    const merged = mergeOrderDelta([b, a], [{ ...a, status: "confirmed" }, c]);
    expect(merged.map((o) => o.id)).toEqual(["c", "b", "a"]);
    expect(merged.find((o) => o.id === "a")?.status).toBe("confirmed");
  });

  it("keeps the existing relative order for equal created_at values", () => {
    const x = { id: "x", created_at: "2026-09-01T00:00:00Z" };
    const y = { id: "y", created_at: "2026-09-01T00:00:00Z" };
    expect(mergeOrderDelta([x, y], []).map((o) => o.id)).toEqual(["x", "y"]);
    expect(mergeOrderDelta([y, x], [{ ...x }]).map((o) => o.id)).toEqual(["y", "x"]);
  });

  it("does not mutate the current list", () => {
    const current = [b, a];
    mergeOrderDelta(current, [c]);
    expect(current.map((o) => o.id)).toEqual(["b", "a"]);
  });
});

describe("syncOrders", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    apiFetch.mockReset();
    resetOrdersSyncCursor();
    queryClient = new QueryClient();
  });

  it("does a full fetch when nothing is cached and writes both query keys", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [b, a], totalCount: 2, syncedAt: "2026-09-24T00:00:00.000Z" }));
    const orders = await syncOrders(queryClient);
    expect(apiFetch).toHaveBeenCalledWith("/api/orders");
    expect(orders.map((o) => o.id)).toEqual(["b", "a"]);
    expect(queryClient.getQueryData(["/api/orders"])).toEqual([b, a]);
    expect(queryClient.getQueryData(["/api/orders/count"])).toBe(2);
  });

  it("fetches only the delta once a cursor and cached list exist", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [b, a], totalCount: 2, syncedAt: "2026-09-24T00:00:00.000Z" }));
    await syncOrders(queryClient);
    apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [{ ...a, status: "confirmed" }, c], totalCount: 3, syncedAt: "2026-09-24T00:01:00.000Z", delta: true }));
    const orders = await syncOrders(queryClient);

    expect(apiFetch).toHaveBeenLastCalledWith(`/api/orders?changed_since=${encodeURIComponent("2026-09-24T00:00:00.000Z")}`);
    expect(orders.map((o) => o.id)).toEqual(["c", "b", "a"]);
    expect(queryClient.getQueryData(["/api/orders/count"])).toBe(3);

    apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [], totalCount: 3, syncedAt: "2026-09-24T00:02:00.000Z", delta: true }));
    await syncOrders(queryClient);
    expect(apiFetch).toHaveBeenLastCalledWith(`/api/orders?changed_since=${encodeURIComponent("2026-09-24T00:01:00.000Z")}`);
  });

  it("falls back to a full fetch when the merged length disagrees with totalCount (deletes)", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [b, a], totalCount: 2, syncedAt: "2026-09-24T00:00:00.000Z" }));
    await syncOrders(queryClient);
    apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [], totalCount: 1, syncedAt: "2026-09-24T00:01:00.000Z", delta: true }));
    apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [b], totalCount: 1, syncedAt: "2026-09-24T00:01:01.000Z" }));
    const orders = await syncOrders(queryClient);

    expect(apiFetch).toHaveBeenLastCalledWith("/api/orders");
    expect(orders.map((o) => o.id)).toEqual(["b"]);
    expect(queryClient.getQueryData(["/api/orders/count"])).toBe(1);
  });

  it("forces a full fetch with { full: true }", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [a], totalCount: 1, syncedAt: "2026-09-24T00:00:00.000Z" }));
    await syncOrders(queryClient);
    apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [b, a], totalCount: 2, syncedAt: "2026-09-24T00:01:00.000Z" }));
    await syncOrders(queryClient, { full: true });
    expect(apiFetch).toHaveBeenLastCalledWith("/api/orders");
  });

  it("does a full fetch when the last full load is older than 10 minutes", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [a], totalCount: 1, syncedAt: "2026-09-24T00:00:00.000Z" }));
    await syncOrders(queryClient);
    now.mockReturnValue(1_000_000 + 10 * 60_000 + 1);
    apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [a], totalCount: 1, syncedAt: "2026-09-24T00:11:00.000Z" }));
    await syncOrders(queryClient);
    expect(apiFetch).toHaveBeenLastCalledWith("/api/orders");
    now.mockRestore();
  });

  it("does a full fetch when the cached list was cleared even if a cursor exists", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [a], totalCount: 1, syncedAt: "2026-09-24T00:00:00.000Z" }));
    await syncOrders(queryClient);
    queryClient.removeQueries({ queryKey: ["/api/orders"] });
    apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [a], totalCount: 1, syncedAt: "2026-09-24T00:01:00.000Z" }));
    await syncOrders(queryClient);
    expect(apiFetch).toHaveBeenLastCalledWith("/api/orders");
  });

  it("treats syncedAt: null (empty workspace) as no cursor, so the next sync is full", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [], totalCount: 0, syncedAt: null }));
    await syncOrders(queryClient);
    apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [a], totalCount: 1, syncedAt: "2026-09-24T00:01:00.000Z" }));
    await syncOrders(queryClient);
    expect(apiFetch).toHaveBeenLastCalledWith("/api/orders");
    expect(queryClient.getQueryData(["/api/orders"])).toEqual([a]);
  });

  it("merges a delta into the cache value at write time, keeping concurrent optimistic updates", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [b, a], totalCount: 2, syncedAt: "2026-09-24T00:00:00.000Z" }));
    await syncOrders(queryClient);

    let resolveDelta: (value: Response) => void = () => {};
    apiFetch.mockReturnValueOnce(new Promise<Response>((resolve) => { resolveDelta = resolve; }));
    const pending = syncOrders<TestOrder>(queryClient);

    // Optimistic update lands while the delta request is in flight.
    queryClient.setQueryData<TestOrder[]>(["/api/orders"], (prev) =>
      (prev || []).map((o) => (o.id === "b" ? { ...o, status: "shipped" } : o)));

    resolveDelta(jsonResponse({ orders: [{ ...a, status: "confirmed" }], totalCount: 2, syncedAt: "2026-09-24T00:01:00.000Z", delta: true }));
    const orders = await pending;

    expect(orders.find((o) => o.id === "b")?.status).toBe("shipped");
    expect(orders.find((o) => o.id === "a")?.status).toBe("confirmed");
    expect(queryClient.getQueryData(["/api/orders"])).toEqual(orders);
  });

  it("shares one in-flight request between overlapping non-full syncs", async () => {
    let resolveFirst: (value: Response) => void = () => {};
    apiFetch.mockReturnValueOnce(new Promise<Response>((resolve) => { resolveFirst = resolve; }));
    const first = syncOrders<TestOrder>(queryClient);
    const second = syncOrders<TestOrder>(queryClient);
    expect(second).toBe(first);

    resolveFirst(jsonResponse({ orders: [a], totalCount: 1, syncedAt: "2026-09-24T00:00:00.000Z" }));
    await expect(second).resolves.toEqual([a]);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("runs a full sync after the in-flight sync when { full: true } overlaps it", async () => {
    let resolveFirst: (value: Response) => void = () => {};
    apiFetch.mockReturnValueOnce(new Promise<Response>((resolve) => { resolveFirst = resolve; }));
    const first = syncOrders<TestOrder>(queryClient);
    apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [b, a], totalCount: 2, syncedAt: "2026-09-24T00:01:00.000Z" }));
    const full = syncOrders<TestOrder>(queryClient, { full: true });
    expect(full).not.toBe(first);
    expect(apiFetch).toHaveBeenCalledTimes(1);

    resolveFirst(jsonResponse({ orders: [a], totalCount: 1, syncedAt: "2026-09-24T00:00:00.000Z" }));
    await expect(first).resolves.toEqual([a]);
    await expect(full).resolves.toEqual([b, a]);
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(apiFetch).toHaveBeenLastCalledWith("/api/orders");
  });

  it("clears the in-flight slot after a failure so the next sync makes a new request", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500));
    await expect(syncOrders(queryClient)).rejects.toBeInstanceOf(OrdersSyncError);
    apiFetch.mockResolvedValueOnce(jsonResponse({ orders: [a], totalCount: 1, syncedAt: "2026-09-24T00:00:00.000Z" }));
    await expect(syncOrders(queryClient)).resolves.toEqual([a]);
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });

  it("throws an OrdersSyncError carrying the HTTP status on failure", async () => {
    apiFetch.mockResolvedValueOnce(jsonResponse({ error: "Unauthorized" }, 401));
    await expect(syncOrders(queryClient)).rejects.toMatchObject({ status: 401 });
    apiFetch.mockResolvedValueOnce(jsonResponse({ error: "boom" }, 500));
    await expect(syncOrders(queryClient)).rejects.toBeInstanceOf(OrdersSyncError);
    expect(queryClient.getQueryData(["/api/orders"])).toBeUndefined();
  });
});
