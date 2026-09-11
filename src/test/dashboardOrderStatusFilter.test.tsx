import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
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
  OrdersTable: ({ orders, showRiskColumn = true }: { orders: Array<{ id: string; customer_name: string }>; showRiskColumn?: boolean }) => (
    <div data-testid="dashboard-orders">
      <span data-testid="dashboard-risk-column">{showRiskColumn ? "visible" : "hidden"}</span>
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
    fulfillment_status: "delivered", courier_status: "delivered", sent_to_courier: true,
    consignment_id: 987654, tracking_code: "stead-abc", warehouse_id: "main",
  },
  {
    id: "cancelled", shopify_order_id: 3, order_number: "#103", customer_name: "Cancelled Customer",
    phone: "01700000003", address: "Dhaka", product: "Honey", quantity: 1, price: 700,
    status: "cancelled", created_at: "2026-09-03T00:00:00.000Z", fraud_checked: false,
    fraud_data: null, delivery_rate: 60, fulfillment_status: null, warehouse_id: "main",
  },
];

const abandonedCheckouts = [{
  id: "7cb13b8e-b576-4faa-b238-cc8b73059772",
  status: "open",
  customer_name: "Abandoned Customer",
  phone: "01712345678",
  address: "House 1, Road 2, Dhaka",
  cart: [{ productName: "Sundarbans Honey", variantName: "1 kg", quantity: 1, unitPrice: 750 }],
  subtotal: 750,
  delivery_rate: 100,
  total: 850,
  source: "sundarbans_honey",
  source_path: "/step/sundarbans-natural-honey",
  campaign: {},
  contacted_at: null,
  created_at: "2026-09-11T12:00:00.000Z",
  updated_at: "2026-09-11T12:00:00.000Z",
}];

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
      if (url === "/api/abandoned-checkouts") return jsonResponse({ checkouts: abandonedCheckouts, activeCount: 1 });
      if (url === `/api/abandoned-checkouts/${abandonedCheckouts[0].id}`) {
        return jsonResponse({ checkout: { ...abandonedCheckouts[0], status: "contacted" } });
      }
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

  it("hides the Risk column in the Dashboard orders table", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter><Dashboard /></MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("dashboard-risk-column")).toHaveTextContent("hidden");
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

  it("switches to an independent abandoned checkout queue without changing order counts or bulk controls", async () => {
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
    const abandonedTab = await screen.findByRole("radio", { name: /^Abandoned:.*1/ });
    await user.click(abandonedTab);

    expect(await screen.findByTestId("abandoned-checkout-queue")).toHaveTextContent("Abandoned Customer");
    expect(screen.getByRole("radio", { name: /All Orders.*3/ })).toBeInTheDocument();
    expect(screen.queryByTestId("button-bulk-status")).not.toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/abandoned-checkouts");
  });

  it("updates the independent checkout cache through the scoped staff action route", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole("radio", { name: /^Abandoned:.*1/ }));
    await user.click(await screen.findByRole("button", { name: "Mark as contacted" }));

    await waitFor(() => {
      expect(screen.getByText("Contacted")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Mark as contacted" })).not.toBeInTheDocument();
    });
    expect(apiFetch).toHaveBeenCalledWith(`/api/abandoned-checkouts/${abandonedCheckouts[0].id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "contacted" }),
    });
  });

  it("searches orders by Steadfast consignment ID and tracking code", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Dashboard />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const search = await screen.findByTestId("input-search-orders");
    await user.type(search, "987654");
    await waitFor(() => {
      expect(screen.getByTestId("dashboard-orders")).toHaveTextContent("Delivered Customer");
      expect(screen.getByTestId("dashboard-orders")).not.toHaveTextContent("Pending Customer");
    });

    await user.clear(search);
    await user.type(search, "STEAD-ABC");
    await waitFor(() => {
      expect(screen.getByTestId("dashboard-orders")).toHaveTextContent("Delivered Customer");
      expect(screen.getByTestId("dashboard-orders")).not.toHaveTextContent("Cancelled Customer");
    });
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
    expect(screen.getByTestId("dashboard-order-toolbar")).toContainElement(pageSize);
    expect(screen.getByTestId("dashboard-order-actions")).toContainElement(pageSize);
    expect(
      screen.getByTestId("input-search-orders").compareDocumentPosition(pageSize)
        & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByTestId("order-pagination-footer")).not.toContainElement(pageSize);
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

  it("saves abandoned checkout edits through the PATCH route", async () => {
    const user = userEvent.setup();
    const updatedDraft = { ...abandonedCheckouts[0], customer_name: "Rahim Uddin" };
    apiFetch.mockImplementation(async (url: string, options?: RequestInit) => {
      if (url === "/api/orders") return jsonResponse({ orders });
      if (url === "/api/abandoned-checkouts") {
        return jsonResponse({ checkouts: abandonedCheckouts, activeCount: 1 });
      }
      if (url === `/api/abandoned-checkouts/${abandonedCheckouts[0].id}` && options?.method === "PATCH") {
        return jsonResponse({ checkout: updatedDraft });
      }
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

    await user.click(await screen.findByRole("radio", { name: /^Abandoned:.*1/ }));
    await user.click(await screen.findByRole("button", { name: "Edit checkout" }));

    const nameField = await screen.findByLabelText(/customer name/i);
    await user.clear(nameField);
    await user.type(nameField, "Rahim Uddin");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        `/api/abandoned-checkouts/${abandonedCheckouts[0].id}`,
        expect.objectContaining({ method: "PATCH" }),
      );
    });
    const patchCall = apiFetch.mock.calls.find(
      (call) =>
        call[0] === `/api/abandoned-checkouts/${abandonedCheckouts[0].id}` &&
        (call[1] as RequestInit | undefined)?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse(String((patchCall?.[1] as RequestInit).body));
    expect(patchBody).not.toHaveProperty("action");
    expect(patchBody).toMatchObject({ customerName: "Rahim Uddin" });
    expect(await screen.findByText("Rahim Uddin")).toBeInTheDocument();
  });

  it("converts an abandoned checkout into a pending order", async () => {
    const user = userEvent.setup();
    const { toast } = await import("@/components/ui/sonner");
    const successSpy = vi.spyOn(toast, "success");
    try {
      apiFetch.mockImplementation(async (url: string, options?: RequestInit) => {
        if (url === "/api/orders") return jsonResponse({ orders });
        if (url === "/api/abandoned-checkouts") {
          return jsonResponse({ checkouts: abandonedCheckouts, activeCount: 1 });
        }
        if (
          url === `/api/abandoned-checkouts/${abandonedCheckouts[0].id}/convert` &&
          options?.method === "POST"
        ) {
          return {
            ok: true,
            status: 201,
            json: async () => ({ order: { id: "order-1", order_number: "#104" } }),
          };
        }
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

      await user.click(await screen.findByRole("radio", { name: /^Abandoned:.*1/ }));
      expect(await screen.findByText("Abandoned Customer")).toBeInTheDocument();
      await user.click(await screen.findByRole("button", { name: "Move to pending" }));
      await user.click(await screen.findByRole("button", { name: /convert to pending/i }));

      await waitFor(() => {
        expect(apiFetch).toHaveBeenCalledWith(
          `/api/abandoned-checkouts/${abandonedCheckouts[0].id}/convert`,
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({
              status: "pending",
              customer_name: "Abandoned Customer",
              address: "House 1, Road 2, Dhaka",
            }),
          }),
        );
      });
      await waitFor(() => {
        expect(screen.queryByText("Abandoned Customer")).not.toBeInTheDocument();
      });
      expect(successSpy).toHaveBeenCalledWith(expect.stringContaining("#104"));
    } finally {
      successSpy.mockRestore();
    }
  });

  it("closes the convert dialog and refreshes the queue when the draft is gone", async () => {
    const user = userEvent.setup();
    const { toast } = await import("@/components/ui/sonner");
    const errorSpy = vi.spyOn(toast, "error");
    try {
      apiFetch.mockImplementation(async (url: string, options?: RequestInit) => {
        if (url === "/api/orders") return jsonResponse({ orders });
        if (url === "/api/abandoned-checkouts") {
          return jsonResponse({ checkouts: abandonedCheckouts, activeCount: 1 });
        }
        if (
          url === `/api/abandoned-checkouts/${abandonedCheckouts[0].id}/convert` &&
          options?.method === "POST"
        ) {
          return {
            ok: false,
            status: 404,
            json: async () => ({ error: "Checkout is no longer active" }),
          };
        }
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

      await user.click(await screen.findByRole("radio", { name: /^Abandoned:.*1/ }));
      expect(await screen.findByText("Abandoned Customer")).toBeInTheDocument();
      await user.click(await screen.findByRole("button", { name: "Move to pending" }));
      await user.click(await screen.findByRole("button", { name: /convert to pending/i }));

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith("Checkout is no longer active");
      });
      expect(
        apiFetch.mock.calls.filter((call) => call[0] === "/api/abandoned-checkouts").length,
      ).toBeGreaterThan(1);
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("bulk-marks abandoned checkouts as contacted with the toolbar button", async () => {
    const user = userEvent.setup();
    const { toast } = await import("@/components/ui/sonner");
    const successSpy = vi.spyOn(toast, "success");
    const drafts = [
      { ...abandonedCheckouts[0], id: "bulk-draft-1", customer_name: "Bulk Customer One" },
      {
        ...abandonedCheckouts[0],
        id: "bulk-draft-2",
        customer_name: "Bulk Customer Two",
        phone: "01798765432",
      },
    ];
    try {
      apiFetch.mockImplementation(async (url: string, options?: RequestInit) => {
        if (url === "/api/orders") return jsonResponse({ orders });
        if (url === "/api/abandoned-checkouts") {
          return jsonResponse({ checkouts: drafts, activeCount: drafts.length });
        }
        const patchTarget = drafts.find((draft) => url === `/api/abandoned-checkouts/${draft.id}`);
        if (patchTarget && options?.method === "PATCH") {
          return jsonResponse({ checkout: { ...patchTarget, status: "contacted" } });
        }
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

      await user.click(await screen.findByRole("radio", { name: /^Abandoned:/ }));
      expect(await screen.findByText("Bulk Customer One")).toBeInTheDocument();
      await user.click(screen.getByTestId("checkbox-abandoned-bulk-draft-1"));
      await user.click(screen.getByTestId("checkbox-abandoned-bulk-draft-2"));
      await user.click(screen.getByTestId("button-bulk-abandoned-status"));
      const menu = await screen.findByTestId("bulk-abandoned-status-menu");
      await user.click(within(menu).getByRole("button", { name: "Mark contacted" }));

      await waitFor(() => {
        for (const draft of drafts) {
          expect(apiFetch).toHaveBeenCalledWith(`/api/abandoned-checkouts/${draft.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "contacted" }),
          });
        }
      });
      await waitFor(() => {
        expect(successSpy).toHaveBeenCalledWith("2 checkouts marked as contacted");
      });
    } finally {
      successSpy.mockRestore();
    }
  });

  it("bulk-converts abandoned checkouts and keeps failures selected", async () => {
    const user = userEvent.setup();
    const { toast } = await import("@/components/ui/sonner");
    const successSpy = vi.spyOn(toast, "success");
    const errorSpy = vi.spyOn(toast, "error");
    const drafts = [
      { ...abandonedCheckouts[0], id: "bulk-draft-1", customer_name: "Bulk Customer One" },
      {
        ...abandonedCheckouts[0],
        id: "bulk-draft-2",
        customer_name: "Bulk Customer Two",
        phone: "01798765432",
      },
    ];
    const converted = new Set<string>();
    try {
      apiFetch.mockImplementation(async (url: string, options?: RequestInit) => {
        if (url === "/api/orders") return jsonResponse({ orders });
        if (url === "/api/abandoned-checkouts") {
          const remaining = drafts.filter((draft) => !converted.has(draft.id));
          return jsonResponse({ checkouts: remaining, activeCount: remaining.length });
        }
        for (const draft of drafts) {
          if (url === `/api/abandoned-checkouts/${draft.id}/convert` && options?.method === "POST") {
            if (draft.id === "bulk-draft-1") {
              converted.add(draft.id);
              return {
                ok: true,
                status: 201,
                json: async () => ({ order: { id: "order-9", order_number: "#109" } }),
              };
            }
            return {
              ok: false,
              status: 500,
              json: async () => ({ error: "Could not convert checkout" }),
            };
          }
        }
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

      await user.click(await screen.findByRole("radio", { name: /^Abandoned:/ }));
      expect(await screen.findByText("Bulk Customer One")).toBeInTheDocument();
      await user.click(screen.getByTestId("checkbox-abandoned-bulk-draft-1"));
      await user.click(screen.getByTestId("checkbox-abandoned-bulk-draft-2"));
      await user.click(screen.getByTestId("button-bulk-abandoned-status"));
      const menu = await screen.findByTestId("bulk-abandoned-status-menu");
      await user.click(within(menu).getByRole("button", { name: "Pending" }));

      await waitFor(() => {
        expect(successSpy).toHaveBeenCalledWith("1 order moved to Pending");
        expect(errorSpy).toHaveBeenCalledWith("1 failed — kept selected");
      });
      await waitFor(() => {
        expect(screen.queryByText("Bulk Customer One")).not.toBeInTheDocument();
      });
      expect(screen.getByText("Bulk Customer Two")).toBeInTheDocument();
      expect(screen.getByTestId("checkbox-abandoned-bulk-draft-2")).toHaveAttribute("aria-checked", "true");
    } finally {
      successSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("bulk Mark contacted skips already-contacted drafts and reports the skip", async () => {
    const user = userEvent.setup();
    const { toast } = await import("@/components/ui/sonner");
    const successSpy = vi.spyOn(toast, "success");
    const drafts = [
      { ...abandonedCheckouts[0], id: "bulk-open-1", customer_name: "Open Customer", status: "open" },
      {
        ...abandonedCheckouts[0],
        id: "bulk-contacted-1",
        customer_name: "Contacted Customer",
        phone: "01798765432",
        status: "contacted",
      },
    ];
    try {
      apiFetch.mockImplementation(async (url: string, options?: RequestInit) => {
        if (url === "/api/orders") return jsonResponse({ orders });
        if (url === "/api/abandoned-checkouts") {
          return jsonResponse({ checkouts: drafts, activeCount: drafts.length });
        }
        if (url === "/api/abandoned-checkouts/bulk-open-1" && options?.method === "PATCH") {
          return jsonResponse({ checkout: { ...drafts[0], status: "contacted" } });
        }
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

      await user.click(await screen.findByRole("radio", { name: /^Abandoned:/ }));
      expect(await screen.findByText("Open Customer")).toBeInTheDocument();
      await user.click(screen.getByTestId("checkbox-abandoned-bulk-open-1"));
      await user.click(screen.getByTestId("checkbox-abandoned-bulk-contacted-1"));
      await user.click(screen.getByTestId("button-bulk-abandoned-status"));
      const menu = await screen.findByTestId("bulk-abandoned-status-menu");
      await user.click(within(menu).getByRole("button", { name: "Mark contacted" }));

      await waitFor(() => {
        expect(successSpy).toHaveBeenCalledWith("1 checkout marked as contacted, 1 already contacted — skipped");
      });
      const patchCalls = apiFetch.mock.calls.filter(
        ([url, init]) =>
          typeof url === "string" &&
          url.startsWith("/api/abandoned-checkouts/bulk-") &&
          (init as RequestInit | undefined)?.method === "PATCH",
      );
      expect(patchCalls).toHaveLength(1);
      expect(patchCalls[0][0]).toBe("/api/abandoned-checkouts/bulk-open-1");
    } finally {
      successSpy.mockRestore();
    }
  });

  it("bulk convert shows only the error summary when every conversion fails", async () => {
    const user = userEvent.setup();
    const { toast } = await import("@/components/ui/sonner");
    const successSpy = vi.spyOn(toast, "success");
    const errorSpy = vi.spyOn(toast, "error");
    const drafts = [
      { ...abandonedCheckouts[0], id: "bulk-fail-1", customer_name: "Fail Customer One" },
      {
        ...abandonedCheckouts[0],
        id: "bulk-fail-2",
        customer_name: "Fail Customer Two",
        phone: "01798765432",
      },
    ];
    try {
      apiFetch.mockImplementation(async (url: string, options?: RequestInit) => {
        if (url === "/api/orders") return jsonResponse({ orders });
        if (url === "/api/abandoned-checkouts") {
          return jsonResponse({ checkouts: drafts, activeCount: drafts.length });
        }
        for (const draft of drafts) {
          if (url === `/api/abandoned-checkouts/${draft.id}/convert` && options?.method === "POST") {
            return {
              ok: false,
              status: 500,
              json: async () => ({ error: "Could not convert checkout" }),
            };
          }
        }
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

      await user.click(await screen.findByRole("radio", { name: /^Abandoned:/ }));
      expect(await screen.findByText("Fail Customer One")).toBeInTheDocument();
      await user.click(screen.getByTestId("checkbox-abandoned-bulk-fail-1"));
      await user.click(screen.getByTestId("checkbox-abandoned-bulk-fail-2"));
      await user.click(screen.getByTestId("button-bulk-abandoned-status"));
      const menu = await screen.findByTestId("bulk-abandoned-status-menu");
      await user.click(within(menu).getByRole("button", { name: "Pending" }));

      await waitFor(() => {
        expect(errorSpy).toHaveBeenCalledWith("2 failed — kept selected");
      });
      expect(successSpy).not.toHaveBeenCalled();
    } finally {
      successSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("bulk convert drops gone (404) drafts from the kept-selected set", async () => {
    const user = userEvent.setup();
    const { toast } = await import("@/components/ui/sonner");
    const successSpy = vi.spyOn(toast, "success");
    const errorSpy = vi.spyOn(toast, "error");
    const drafts = [
      { ...abandonedCheckouts[0], id: "bulk-gone-1", customer_name: "Gone Customer One" },
      {
        ...abandonedCheckouts[0],
        id: "bulk-gone-2",
        customer_name: "Gone Customer Two",
        phone: "01798765432",
      },
    ];
    const converted = new Set<string>();
    let listCalls = 0;
    try {
      apiFetch.mockImplementation(async (url: string, options?: RequestInit) => {
        if (url === "/api/orders") return jsonResponse({ orders });
        if (url === "/api/abandoned-checkouts") {
          listCalls += 1;
          // Initial load shows both drafts; the post-bulk refetch drops the
          // converted row and the 404-gone ghost (mirrors the real API).
          if (listCalls === 1) {
            return jsonResponse({ checkouts: drafts, activeCount: drafts.length });
          }
          const remaining = drafts.filter((draft) => !converted.has(draft.id) && draft.id !== "bulk-gone-2");
          return jsonResponse({ checkouts: remaining, activeCount: remaining.length });
        }
        if (url === "/api/abandoned-checkouts/bulk-gone-1/convert" && options?.method === "POST") {
          converted.add("bulk-gone-1");
          return {
            ok: true,
            status: 201,
            json: async () => ({ order: { id: "order-10", order_number: "#110" } }),
          };
        }
        if (url === "/api/abandoned-checkouts/bulk-gone-2/convert" && options?.method === "POST") {
          return {
            ok: false,
            status: 404,
            json: async () => ({ error: "Checkout is no longer active" }),
          };
        }
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

      await user.click(await screen.findByRole("radio", { name: /^Abandoned:/ }));
      expect(await screen.findByText("Gone Customer One")).toBeInTheDocument();
      await user.click(screen.getByTestId("checkbox-abandoned-bulk-gone-1"));
      await user.click(screen.getByTestId("checkbox-abandoned-bulk-gone-2"));
      await user.click(screen.getByTestId("button-bulk-abandoned-status"));
      const menu = await screen.findByTestId("bulk-abandoned-status-menu");
      await user.click(within(menu).getByRole("button", { name: "Pending" }));

      await waitFor(() => {
        expect(successSpy).toHaveBeenCalledWith("1 order moved to Pending");
      });
      expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining("failed"));
      await waitFor(() => {
        expect(screen.queryByText("Gone Customer Two")).not.toBeInTheDocument();
      });
    } finally {
      successSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it("bulk dismiss dialog keeps the count in the title with a short description", async () => {
    const user = userEvent.setup();
    const drafts = [
      { ...abandonedCheckouts[0], id: "bulk-dismiss-1", customer_name: "Dismiss Customer One" },
      {
        ...abandonedCheckouts[0],
        id: "bulk-dismiss-2",
        customer_name: "Dismiss Customer Two",
        phone: "01798765432",
      },
    ];
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/orders") return jsonResponse({ orders });
      if (url === "/api/abandoned-checkouts") {
        return jsonResponse({ checkouts: drafts, activeCount: drafts.length });
      }
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

    await user.click(await screen.findByRole("radio", { name: /^Abandoned:/ }));
    expect(await screen.findByText("Dismiss Customer One")).toBeInTheDocument();
    await user.click(screen.getByTestId("checkbox-abandoned-bulk-dismiss-1"));
    await user.click(screen.getByTestId("checkbox-abandoned-bulk-dismiss-2"));
    await user.click(screen.getByTestId("button-bulk-abandoned-status"));
    const menu = await screen.findByTestId("bulk-abandoned-status-menu");
    await user.click(within(menu).getByRole("button", { name: "Dismiss" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("heading")).toHaveTextContent("Dismiss 2 checkouts?");
    expect(within(dialog).getByText("This cannot be undone.")).toBeInTheDocument();
  });
});
