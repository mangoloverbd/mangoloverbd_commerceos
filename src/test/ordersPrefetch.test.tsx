import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard, { prefetchOrdersPage } from "@/pages/Dashboard";
import { TooltipProvider } from "@/components/ui/tooltip";
import { resetOrdersSyncCursor } from "@/lib/ordersSync";

const apiFetch = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true, loading: false }) }));
vi.mock("@/hooks/useLiveVisitors", () => ({
  useLiveVisitors: () => ({ count: 0, details: { activeCarts: 0, checkingOut: 0, purchased: 0 }, visitors: [] }),
}));
vi.mock("@/hooks/useMe", () => ({
  useMe: () => ({ data: { orgName: "Mango Lover BD" }, isLoading: false }),
}));
vi.mock("@/hooks/useWarehouses", () => ({
  useWarehouses: () => ({ warehouses: [{ id: "main", name: "Main Warehouse" }] }),
}));
vi.mock("@/components/home/DottedGlobe", () => ({ DottedGlobe: () => null }));
vi.mock("@/components/ui/glyph-matrix", () => ({ default: () => null }));
vi.mock("@/components/ui/sonner", () => ({
  toast: { success: toastSuccess, error: toastError, custom: vi.fn() },
  DarkToast: () => null,
}));
vi.mock("recharts", () => ({
  BarChart: () => null,
  Bar: () => null,
  Cell: () => null,
  ResponsiveContainer: () => null,
  Tooltip: () => null,
}));

const order = {
  id: "order-1", shopify_order_id: 1, order_number: "#101", customer_name: "Test Customer", phone: "01700000001",
  address: "Dhaka", product: "Honey", quantity: 1, price: 800, created_at: "2026-09-05T00:00:00.000Z",
  updated_at: "2026-09-05T00:00:00.000Z", fraud_checked: false, fraud_data: null, delivery_rate: 60,
  fulfillment_status: null, courier_status: null, sent_to_courier: false, warehouse_id: "main", status: "pending",
};

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

describe("orders page prefetch", () => {
  beforeEach(() => {
    // Courier refresh and Shopify sync both run on this visit.
    sessionStorage.clear();
    localStorage.clear();
    resetOrdersSyncCursor();
    apiFetch.mockReset();
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/orders" && !init?.method) return jsonResponse({ orders: [order], totalCount: 1, syncedAt: "2026-09-27T00:00:00.000Z" });
      if (url.startsWith("/api/orders?changed_since=")) return jsonResponse({ orders: [], totalCount: 1, syncedAt: "2026-09-27T00:00:00.000Z", delta: true });
      if (url === "/api/products") return jsonResponse({ products: [] });
      if (url.startsWith("/api/analytics")) {
        return jsonResponse({
          revenue: 0, shipping: 0, adSpend: 0, totalCog: 0, cogCoverage: { set: 0, total: 0 },
          profit: 0, fbConfigured: false, usdToBdt: 120, fbError: null,
        });
      }
      return jsonResponse({ updated: 0 });
    });
  });

  const calls = (match: (url: string) => boolean) => apiFetch.mock.calls.filter(([url]) => match(String(url)));

  it("warms the order list and today's P&L in the background", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await prefetchOrdersPage(client, "user-1");

    expect(calls((url) => url === "/api/orders")).toHaveLength(1);
    expect(client.getQueryData(["/api/orders"])).toEqual([order]);
    // This period and the one before it, as the P&L cards compare them.
    expect(calls((url) => url.startsWith("/api/analytics"))).toHaveLength(2);

    // Already warm: a second prefetch sends nothing.
    apiFetch.mockClear();
    await prefetchOrdersPage(client, "user-1");
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("opens Orders straight from the warm cache, with no loading state", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await prefetchOrdersPage(client, "user-1");
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <MemoryRouter>
            <Dashboard />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    );
    // On the first render, before any request for this visit has answered.
    expect(screen.getAllByText("Test Customer").length).toBeGreaterThan(0);
  });
});
