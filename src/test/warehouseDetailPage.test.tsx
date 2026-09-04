import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
      <MemoryRouter initialEntries={["/warehouses/main"]}>
        <Routes>
          <Route path="/warehouses/:id" element={<WarehouseDetail />} />
          <Route path="/warehouses" element={<div>Warehouse directory destination</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("warehouse detail", () => {
  beforeEach(() => {
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
    expect(screen.getByText("Products assigned").closest("div.flex.min-w-0")).toHaveTextContent("2");
    expect(screen.getByText("Units in stock").closest("div.flex.min-w-0")).toHaveTextContent("19");
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
