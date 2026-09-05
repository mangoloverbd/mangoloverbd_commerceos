import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WarehouseDetail from "@/pages/WarehouseDetail";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/components/ui/sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useOrgName", () => ({
  useOrgName: () => ({ orgName: "Mango Lover BD", isLoading: false, refresh: vi.fn() }),
}));

const detail = {
  warehouse: { id: "main", name: "Main Warehouse", address: "Dhanmondi", contact_person: "Nadia", phone: "01700000001", is_default: true },
  summary: { product_count: 2, total_stock: 19, published_count: 1 },
  products: [
    { id: "explicit", name: "Explicit Mango", selling_price: 800, stock_quantity: 12, weight_kg: 1.5, published: true, assigned_explicitly: true },
    { id: "fallback", name: "Fallback Mango", selling_price: 650, stock_quantity: 7, weight_kg: null, published: false, assigned_explicitly: false },
  ],
};

function renderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/warehouses/main"]}>
          <Routes>
            <Route path="/warehouses/:id" element={<WarehouseDetail />} />
            <Route path="/warehouses" element={<div>Warehouse directory destination</div>} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const warehouseOrders = [
  {
    id: "o1", shopify_order_id: -1, order_number: "#101", customer_name: "Anis uz Zaman",
    phone: "01737022302", address: "Dhaka", product: "Honey", quantity: 1, price: 850,
    status: "pending", created_at: "2026-09-04T00:00:00.000Z", fraud_checked: false,
    fraud_data: null, delivery_rate: 0, warehouse_id: "main",
  },
  {
    id: "o2", shopify_order_id: -2, order_number: "#102", customer_name: "Murad",
    phone: "01601033011", address: "Dhaka", product: "Chia", quantity: 1, price: 560,
    status: "pending", created_at: "2026-09-03T00:00:00.000Z", fraud_checked: false,
    fraud_data: null, delivery_rate: 0, warehouse_id: "main",
  },
];

describe("warehouse detail", () => {
  beforeEach(() => {
    localStorage.clear();
    apiFetch.mockReset();
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/warehouses/main") return { ok: true, json: async () => detail };
      if (url === "/api/orders?warehouse_id=main") return { ok: true, json: async () => ({ orders: [] }) };
      if (url === "/api/products/bulk-assign-warehouse" && init?.method === "POST") return { ok: true, json: async () => ({ updated: 1 }) };
      return { ok: true, json: async () => ({}) };
    });
  });

  it("renders warehouse identity, Products-style metrics, inventory, and the shared order empty state", async () => {
    renderDetail();

    expect(await screen.findByRole("heading", { name: "Main Warehouse" })).toBeInTheDocument();
    expect(screen.getByText("Products assigned").closest("div.rounded-2xl")).toHaveTextContent("2");
    expect(screen.getByText("Units in stock").closest("div.rounded-2xl")).toHaveTextContent("19");
    expect(screen.getByTestId("warehouse-products-table")).toBeInTheDocument();
    expect(await screen.findByText("No records found")).toBeInTheDocument();
    expect(screen.getByText("No weight")).toBeInTheDocument();
  });

  it("allows removal only for an explicitly assigned product", async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "Remove Explicit Mango from warehouse" }));
    expect(screen.queryByRole("button", { name: "Remove Fallback Mango from warehouse" })).not.toBeInTheDocument();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/products/bulk-assign-warehouse", expect.objectContaining({ method: "POST" })));
    const call = apiFetch.mock.calls.find(([url]) => url === "/api/products/bulk-assign-warehouse");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ product_ids: ["explicit"], warehouse_id: null });
  });

  it("returns to the warehouse directory", async () => {
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole("button", { name: "Back to warehouses" }));
    expect(screen.getByText("Warehouse directory destination")).toBeInTheDocument();
  });

  it("filters routed orders through the dashboard-style search", async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/warehouses/main") return { ok: true, json: async () => detail };
      if (url === "/api/orders?warehouse_id=main") return { ok: true, json: async () => ({ orders: warehouseOrders }) };
      return { ok: true, json: async () => ({}) };
    });
    renderDetail();

    expect(await screen.findByText("Anis uz Zaman")).toBeInTheDocument();
    expect(screen.getByText("2 orders")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Search warehouse orders" }), "murad");
    expect(screen.queryByText("Anis uz Zaman")).not.toBeInTheDocument();
    expect(screen.getByText("Murad")).toBeInTheDocument();
    expect(screen.getByText("1 orders")).toBeInTheDocument();
  });

  it("shows warehouse-scoped status counts and filters the routed orders", async () => {
    const user = userEvent.setup();
    const deliveredOrder = {
      ...warehouseOrders[1],
      status: "confirmed",
      courier_status: "delivered",
      fulfillment_status: "delivered",
      sent_to_courier: true,
    };
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/warehouses/main") return { ok: true, json: async () => detail };
      if (url === "/api/orders?warehouse_id=main") {
        return { ok: true, json: async () => ({ orders: [warehouseOrders[0], deliveredOrder] }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    renderDetail();

    expect(await screen.findByRole("radio", { name: /All Orders.*2/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Pending.*1/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Delivered.*1/ })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Delivered.*1/ }));

    expect(screen.queryByText("Anis uz Zaman")).not.toBeInTheDocument();
    expect(screen.getByText("Murad")).toBeInTheDocument();
    expect(screen.getByText("1 orders")).toBeInTheDocument();
  });

  it("paginates only the current warehouse orders with its own saved row limit", async () => {
    const user = userEvent.setup();
    const pagedWarehouseOrders = Array.from({ length: 21 }, (_, index) => ({
      ...warehouseOrders[0],
      id: `warehouse-order-${index + 1}`,
      shopify_order_id: -(index + 1),
      order_number: `#${index + 1}`,
      customer_name: `Warehouse Customer ${index + 1}`,
    }));
    localStorage.setItem("dashboard-order-page-size", "50");
    localStorage.setItem("warehouse-order-page-size", "20");
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/warehouses/main") return { ok: true, json: async () => detail };
      if (url === "/api/orders?warehouse_id=main") {
        return { ok: true, json: async () => ({ orders: pagedWarehouseOrders }) };
      }
      return { ok: true, json: async () => ({}) };
    });

    renderDetail();

    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
    const pageSize = screen.getByRole("combobox", { name: "Rows per page for warehouse orders" });
    expect(pageSize).toHaveTextContent("20");
    expect(screen.getByTestId("warehouse-order-toolbar")).toContainElement(pageSize);
    expect(screen.getByTestId("order-pagination-footer")).not.toContainElement(pageSize);
    expect(screen.getByText("Warehouse Customer 20")).toBeInTheDocument();
    expect(screen.queryByText("Warehouse Customer 21")).not.toBeInTheDocument();
    expect(localStorage.getItem("dashboard-order-page-size")).toBe("50");

    await user.click(screen.getByRole("button", { name: "Next page" }));

    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.queryByText("Warehouse Customer 1")).not.toBeInTheDocument();
    expect(screen.getByText("Warehouse Customer 21")).toBeInTheDocument();
  });

  it("opens the create order modal from the routed orders header", async () => {
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "Create Order" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("verifies all routed orders from the header", async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/warehouses/main") return { ok: true, json: async () => detail };
      if (url === "/api/orders?warehouse_id=main") return { ok: true, json: async () => ({ orders: warehouseOrders }) };
      if (url === "/api/check-fraud" && init?.method === "POST") {
        return { ok: true, json: async () => ({ successful: 2, checked: 2 }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    renderDetail();

    await user.click(await screen.findByRole("button", { name: "Verify All" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/api/check-fraud",
      expect.objectContaining({ method: "POST" }),
    ));
  });

  it("opens the add-products picker and assigns the selection", async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/warehouses/main") return { ok: true, json: async () => detail };
      if (url === "/api/orders?warehouse_id=main") return { ok: true, json: async () => ({ orders: [] }) };
      if (url === "/api/products") {
        return {
          ok: true,
          json: async () => ({ products: [{ id: "new-one", name: "New Mango", selling_price: 900, stock_quantity: 5, warehouse_id: null }] }),
        };
      }
      if (url === "/api/products/bulk-assign-warehouse" && init?.method === "POST") {
        return { ok: true, json: async () => ({ updated: 1 }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    renderDetail();
    await screen.findByRole("heading", { name: "Main Warehouse" });
    await user.click(screen.getByRole("button", { name: "Add products" }));
    await user.click(await screen.findByRole("checkbox", { name: /New Mango/ }));
    await user.click(screen.getByRole("button", { name: "Assign 1 product" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/bulk-assign-warehouse",
      expect.objectContaining({ method: "POST" }),
    ));
    const call = apiFetch.mock.calls.find(([url]) => url === "/api/products/bulk-assign-warehouse");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ product_ids: ["new-one"], warehouse_id: "main" });
  });
});
