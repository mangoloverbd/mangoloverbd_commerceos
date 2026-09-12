import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "@/pages/Dashboard";
import { TooltipProvider } from "@/components/ui/tooltip";

const apiFetch = vi.hoisted(() => vi.fn());
const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true, loading: false }) }));
vi.mock("@/hooks/useLiveVisitors", () => ({
  useLiveVisitors: () => ({ count: 0, details: { activeCarts: 0, checkingOut: 0, purchased: 0 } }),
}));
vi.mock("@/hooks/useMe", () => ({
  useMe: () => ({ data: { orgName: "Mango Lover BD" }, isLoading: false }),
}));
vi.mock("@/hooks/useWarehouses", () => ({
  useWarehouses: () => ({ warehouses: [{ id: "main", name: "Main Warehouse" }] }),
}));
vi.mock("@/components/ui/cobe-globe-analytics", () => ({ GlobeAnalytics: () => null }));
vi.mock("@/components/ui/pixel-ripple", () => ({ default: () => null }));
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

function baseOrder(overrides: Record<string, unknown>) {
  return {
    shopify_order_id: 1,
    order_number: "#101",
    customer_name: "Test Customer",
    phone: "01700000001",
    address: "Dhaka",
    product: "Honey",
    quantity: 1,
    price: 800,
    created_at: "2026-09-05T00:00:00.000Z",
    fraud_checked: false,
    fraud_data: null,
    delivery_rate: 60,
    fulfillment_status: null,
    courier_status: null,
    sent_to_courier: false,
    warehouse_id: "main",
    ...overrides,
  };
}

const baseOrders = [
  baseOrder({ id: "pending-1", shopify_order_id: 1, order_number: "#101", status: "pending" }),
  baseOrder({ id: "approved-1", shopify_order_id: 2, order_number: "#102", status: "confirmed" }),
];
let orders = baseOrders;

let bulkResponse: unknown = null;

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("dashboard bulk status button", () => {
  beforeEach(() => {
    sessionStorage.setItem("autosync_done_user-1", "1");
    localStorage.clear();
    toastSuccess.mockClear();
    toastError.mockClear();
    apiFetch.mockReset();
    orders = baseOrders;
    bulkResponse = null;
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/orders" && !init?.method) return jsonResponse({ orders });
      if (url === "/api/products") return jsonResponse({ products: [] });
      if (url === "/api/send-to-courier/bulk") return jsonResponse(bulkResponse || { success: true, processed: 0, failed: 0, succeeded: [], failures: [] });
      if (url.startsWith("/api/analytics")) {
        return jsonResponse({
          revenue: 0, shipping: 0, adSpend: 0, totalCog: 0, cogCoverage: { set: 0, total: 0 },
          profit: 0, fbConfigured: false, usdToBdt: 120, fbError: null,
        });
      }
      if (url.startsWith("/api/orders/") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        const order = orders.find((o) => `/api/orders/${o.id}` === url);
        return jsonResponse({ success: true, order: { ...order, status: body.status } });
      }
      return jsonResponse({ updated: 0 });
    });
  });

  it("stays disabled without selection and moves approved orders to print in bulk", async () => {
    const user = userEvent.setup();
    renderDashboard();

    const trigger = await screen.findByRole("button", { name: "Update Status" });
    expect(trigger).toBeDisabled();

    await user.click(screen.getByTestId("checkbox-order-approved-1"));
    expect(trigger).not.toBeDisabled();

    await user.click(trigger);
    await user.click(within(screen.getByTestId("bulk-status-menu")).getByRole("button", { name: "Print" }));

    await waitFor(() => {
      const patches = apiFetch.mock.calls.filter(([url, init]) => url === "/api/orders/approved-1" && init?.method === "PATCH");
      expect(patches).toHaveLength(1);
      expect(JSON.parse(String(patches[0][1]?.body))).toEqual({ status: "print" });
    });
    expect(toastSuccess).toHaveBeenCalledWith("1 order moved to Print");
    expect(screen.getByRole("button", { name: "Update Status" })).toBeDisabled();
    expect(await screen.findByRole("radio", { name: /Print.*1/ })).toBeInTheDocument();
  });

  it("skips selected orders that cannot take the target status", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByRole("button", { name: "Update Status" });
    await user.click(screen.getByTestId("checkbox-order-pending-1"));

    await user.click(screen.getByRole("button", { name: "Update Status" }));
    await user.click(within(screen.getByTestId("bulk-status-menu")).getByRole("button", { name: "Print" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Selected orders can't move to Print"));
    const patches = apiFetch.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patches).toHaveLength(0);
  });

  it("moves a Print order to Processing when selected manually", async () => {
    const user = userEvent.setup();
    orders = [...baseOrders, baseOrder({ id: "print-1", shopify_order_id: 3, order_number: "#103", status: "print" })];
    renderDashboard();

    await user.click(await screen.findByRole("radio", { name: /Print.*1/ }));
    await user.click(screen.getByTestId("checkbox-order-print-1"));
    await user.click(screen.getByRole("button", { name: "Update Status" }));
    await user.click(within(screen.getByTestId("bulk-status-menu")).getByRole("button", { name: "Processing" }));

    await waitFor(() => {
      const patches = apiFetch.mock.calls.filter(([url, init]) => url === "/api/orders/print-1" && init?.method === "PATCH");
      expect(patches).toHaveLength(1);
      expect(JSON.parse(String(patches[0][1]?.body))).toEqual({ status: "processing" });
    });
    expect(toastSuccess).toHaveBeenCalledWith("1 order moved to Processing");
  });

  it("shows a dropdown chevron that rotates open", async () => {
    const user = userEvent.setup();
    renderDashboard();

    await screen.findByRole("button", { name: "Update Status" });
    await user.click(screen.getByTestId("checkbox-order-approved-1"));
    expect(screen.getByRole("button", { name: "Update Status" }).innerHTML).not.toContain("rotate-180");

    await user.click(screen.getByRole("button", { name: "Update Status" }));
    expect(await screen.findByTestId("bulk-status-menu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update Status" }).innerHTML).toContain("rotate-180");
  });

  it("shows only the requested actions in the Print selection bar", async () => {
    const user = userEvent.setup();
    orders = [...baseOrders, baseOrder({ id: "print-1", shopify_order_id: 3, order_number: "#103", status: "print" })];
    renderDashboard();

    await user.click(await screen.findByRole("radio", { name: /Print.*1/ }));
    await user.click(screen.getByTestId("checkbox-order-print-1"));

    expect(screen.getByTestId("button-bulk-send-steadfast")).toBeInTheDocument();
    expect(screen.queryByTestId("button-bulk-fraud-check")).not.toBeInTheDocument();
    expect(screen.getByTestId("button-generate-invoice")).toBeInTheDocument();
    expect(screen.getByTestId("button-print-invoice")).toBeInTheDocument();
    expect(screen.getByTestId("button-delete-orders")).toBeInTheDocument();
    expect(screen.getByTestId("button-clear-selection")).toBeInTheDocument();
  });

  it("sends selected Print orders through Steadfast bulk dispatch", async () => {
    const user = userEvent.setup();
    orders = [...baseOrders, baseOrder({ id: "print-1", shopify_order_id: 3, order_number: "#103", status: "print" })];
    const printOrder = orders[2];
    bulkResponse = {
      success: true,
      processed: 1,
      failed: 0,
      succeeded: [{ orderId: printOrder.id, orderNumber: printOrder.order_number, order: { ...printOrder, status: "print", sent_to_courier: true } }],
      failures: [],
    };
    renderDashboard();

    await user.click(await screen.findByRole("radio", { name: /Print.*1/ }));
    await user.click(screen.getByTestId("checkbox-order-print-1"));
    await user.click(screen.getByTestId("button-bulk-send-steadfast"));

    await waitFor(() => {
      const calls = apiFetch.mock.calls.filter(([url, init]) => url === "/api/send-to-courier/bulk" && init?.method === "POST");
      expect(calls).toHaveLength(1);
      expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ orderIds: ["print-1"] });
    });
    expect(await screen.findByRole("radio", { name: /Print.*1/ })).toBeInTheDocument();
    expect(await screen.findByRole("radio", { name: /Processing.*0/ })).toBeInTheDocument();
    expect(screen.getByText(printOrder.order_number)).toBeInTheDocument();
    expect(screen.getByTestId("button-bulk-send-steadfast")).toBeInTheDocument();
  });

  it("keeps failed Print orders selected and reports their failures", async () => {
    const user = userEvent.setup();
    orders = [...baseOrders, baseOrder({ id: "print-1", shopify_order_id: 3, order_number: "#103", status: "print" })];
    bulkResponse = {
      success: false,
      processed: 0,
      failed: 1,
      succeeded: [],
      failures: [{ orderId: "print-1", orderNumber: "#103", reason: "Invalid phone number" }],
    };
    renderDashboard();

    await user.click(await screen.findByRole("radio", { name: /Print.*1/ }));
    await user.click(screen.getByTestId("checkbox-order-print-1"));
    await user.click(screen.getByTestId("button-bulk-send-steadfast"));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringContaining("#103")));
    expect(screen.getByTestId("checkbox-order-print-1")).toHaveClass("bg-[#0285F7]");
  });
});
