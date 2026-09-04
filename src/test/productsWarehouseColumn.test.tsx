import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Products from "@/pages/Products";

const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ loading: false, isAdmin: true, role: "admin" }),
}));
vi.mock("@/components/ui/sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const warehouses = [
  {
    id: "warehouse-1",
    name: "Main warehouse",
    address: null,
    contact_person: null,
    phone: null,
    is_default: true,
    created_at: "2026-09-03T00:00:00.000Z",
  },
  {
    id: "warehouse-2",
    name: "Secondary warehouse",
    address: null,
    contact_person: null,
    phone: null,
    is_default: false,
    created_at: "2026-09-03T00:00:00.000Z",
  },
];

const product = {
  id: "product-1",
  name: "Himsagar mango",
  slug: "himsagar-mango",
  description: null,
  url: null,
  image_url: null,
  selling_price: 800,
  compare_at_price: null,
  cog: 500,
  stock_quantity: 10,
  weight_kg: 1,
  warehouse_id: null,
  source_url: null,
  published: true,
  published_at: null,
  created_at: "2026-09-03T00:00:00.000Z",
  variants: [],
  images: [],
};

function renderProducts() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><Products /></MemoryRouter>
    </QueryClientProvider>,
  );
}

async function choose(label: string, option: string) {
  const user = userEvent.setup();
  const trigger = await screen.findByRole("button", { name: new RegExp(`${label}$`, "i") });
  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name: option }));
}

function assignmentRequests() {
  return apiFetch.mock.calls.filter(([url, init]) => url === "/api/products/bulk-assign-warehouse" && init?.method === "POST");
}

describe("products warehouse assignment", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/products" && !init?.method) {
        return { ok: true, json: async () => ({ products: [product] }) };
      }
      if (url === "/api/warehouses" && !init?.method) {
        return { ok: true, json: async () => ({ warehouses }) };
      }
      if (url === "/api/products/bulk-assign-warehouse") {
        return { ok: true, json: async () => ({ updated: 1 }) };
      }
      return { ok: true, json: async () => ({}) };
    });
  });

  it("assigns one product from the warehouse column and refreshes both active queries", async () => {
    renderProducts();

    expect(await screen.findByRole("columnheader", { name: /Warehouse/i })).toBeInTheDocument();
    await choose("Warehouse for Himsagar mango", "Secondary warehouse");

    await waitFor(() => expect(assignmentRequests()).toHaveLength(1));
    expect(JSON.parse(String(assignmentRequests()[0][1].body))).toEqual({
      product_ids: ["product-1"],
      warehouse_id: "warehouse-2",
    });
    await waitFor(() => {
      expect(apiFetch.mock.calls.filter(([url, init]) => url === "/api/products" && !init?.method).length).toBeGreaterThan(1);
      expect(apiFetch.mock.calls.filter(([url, init]) => url === "/api/warehouses" && !init?.method).length).toBeGreaterThan(1);
    });
  });

});
