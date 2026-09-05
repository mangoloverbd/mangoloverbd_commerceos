import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "@/pages/Dashboard";

const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true, loading: false }) }));
vi.mock("@/hooks/useLiveVisitors", () => ({
  useLiveVisitors: () => ({ count: 0, details: { activeCarts: 0, checkingOut: 0, purchased: 0 } }),
}));
vi.mock("@/hooks/useWarehouses", () => ({
  useWarehouses: () => ({ warehouses: [{ id: "main", name: "Main Warehouse" }] }),
}));
vi.mock("@/components/ui/cobe-globe-analytics", () => ({ GlobeAnalytics: () => null }));
vi.mock("@/components/ui/pixel-ripple", () => ({ default: () => null }));
vi.mock("recharts", () => ({
  BarChart: () => null,
  Bar: () => null,
  Cell: () => null,
  ResponsiveContainer: () => null,
  Tooltip: () => null,
}));
vi.mock("@/components/OrderCreatorModal", () => ({ default: () => null }));
vi.mock("@/components/OrdersTable", () => ({
  OrdersTable: ({ orders }: { orders: Array<{ id: string; customer_name: string }> }) => (
    <div data-testid="dashboard-orders">
      {orders.map((order) => <span key={order.id}>{order.customer_name}</span>)}
    </div>
  ),
}));

const orders = [
  {
    id: "pending", shopify_order_id: 1, order_number: "#101", customer_name: "Pending Customer",
    phone: "01700000001", address: "Dhaka", product: "Honey", quantity: 1, price: 800,
    status: "pending", created_at: "2026-09-05T00:00:00.000Z", fraud_checked: false,
    fraud_data: null, delivery_rate: 60, fulfillment_status: null, warehouse_id: "main",
  },
  {
    id: "delivered", shopify_order_id: 2, order_number: "#102", customer_name: "Delivered Customer",
    phone: "01700000002", address: "Dhaka", product: "Honey", quantity: 1, price: 900,
    status: "confirmed", created_at: "2026-09-04T00:00:00.000Z", fraud_checked: true,
    fraud_data: { total_parcels: 2, total_delivered: 2, total_cancel: 0 }, delivery_rate: 60,
    fulfillment_status: "delivered", courier_status: "delivered", sent_to_courier: true, warehouse_id: "main",
  },
  {
    id: "cancelled", shopify_order_id: 3, order_number: "#103", customer_name: "Cancelled Customer",
    phone: "01700000003", address: "Dhaka", product: "Honey", quantity: 1, price: 700,
    status: "cancelled", created_at: "2026-09-03T00:00:00.000Z", fraud_checked: false,
    fraud_data: null, delivery_rate: 60, fulfillment_status: null, warehouse_id: "main",
  },
];

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body };
}

describe("dashboard order status filter", () => {
  beforeEach(() => {
    sessionStorage.setItem("autosync_done_user-1", "1");
    localStorage.clear();
    apiFetch.mockReset();
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/orders") return jsonResponse({ orders });
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

  it("filters the fulfillment queue when a status summary is selected", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("radio", { name: /All Orders.*3/ })).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-orders")).toHaveTextContent("Pending Customer");
    expect(screen.getByTestId("dashboard-orders")).toHaveTextContent("Delivered Customer");

    await user.click(screen.getByRole("radio", { name: /Delivered.*1/ }));

    expect(screen.getByTestId("dashboard-orders")).toHaveTextContent("Delivered Customer");
    expect(screen.getByTestId("dashboard-orders")).not.toHaveTextContent("Pending Customer");
    expect(screen.getByTestId("dashboard-orders")).not.toHaveTextContent("Cancelled Customer");
  });

  it("paginates the filtered dashboard orders with its saved row limit", async () => {
    const user = userEvent.setup();
    const pagedOrders = Array.from({ length: 25 }, (_, index) => ({
      ...orders[0],
      id: `pending-${index + 1}`,
      shopify_order_id: index + 1,
      order_number: `#${index + 1}`,
      customer_name: `Dashboard Customer ${index + 1}`,
    }));
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/orders") return jsonResponse({ orders: pagedOrders });
      if (url === "/api/products") return jsonResponse({ products: [] });
      if (url.startsWith("/api/analytics")) {
        return jsonResponse({
          revenue: 0, shipping: 0, adSpend: 0, totalCog: 0, cogCoverage: { set: 0, total: 0 },
          profit: 0, fbConfigured: false, usdToBdt: 120, fbError: null,
        });
      }
      return jsonResponse({ updated: 0 });
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("radio", { name: /All Orders.*25/ })).toBeInTheDocument();
    const pageSize = screen.getByRole("combobox", { name: "Rows per page for dashboard orders" });
    pageSize.focus();
    await user.keyboard("{Enter}{Home}{Enter}");

    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-orders")).toHaveTextContent("Dashboard Customer 20");
    expect(screen.getByTestId("dashboard-orders")).not.toHaveTextContent("Dashboard Customer 21");
    expect(localStorage.getItem("dashboard-order-page-size")).toBe("20");

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-orders")).not.toHaveTextContent("Dashboard Customer 1");
    expect(screen.getByTestId("dashboard-orders")).toHaveTextContent("Dashboard Customer 21");
  });
});
