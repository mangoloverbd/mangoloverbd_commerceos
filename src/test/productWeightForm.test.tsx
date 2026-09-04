import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProductEdit from "@/pages/ProductEdit";
import ProductNew from "@/pages/ProductNew";

const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiFetch }));
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
  description: "Fresh mango",
  url: null,
  image_url: null,
  selling_price: 800,
  compare_at_price: 900,
  cog: 500,
  stock_quantity: 10,
  weight_kg: 1.25,
  warehouse_id: "warehouse-2",
  source_url: null,
  published: true,
  published_at: null,
  created_at: "2026-09-03T00:00:00.000Z",
  images: [],
  variants: [
    {
      id: "variant-1",
      product_id: "product-1",
      attributes: { size: "5 kg" },
      cog: 500,
      stock_quantity: 4,
      price_adjustment: 100,
      weight_kg: 5,
      org_id: null,
      created_at: "2026-09-03T00:00:00.000Z",
    },
  ],
};

function renderWithQuery(ui: React.ReactNode, initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

async function selectOption(label: string, option: string) {
  const user = userEvent.setup();
  const trigger = await screen.findByRole("button", { name: new RegExp(`${label}$`, "i") });
  await waitFor(() => expect(trigger.textContent?.trim()).not.toBe(""));
  await user.click(trigger);
  await user.click(await screen.findByRole("option", { name: option }));
}

function requestBody(url: string, method: string) {
  const call = apiFetch.mock.calls.find(([calledUrl, init]) => calledUrl === url && init?.method === method);
  expect(call).toBeDefined();
  return JSON.parse(String(call?.[1]?.body));
}

describe("product weight and warehouse forms", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/warehouses") {
        return { ok: true, json: async () => ({ warehouses }) };
      }
      if (url === "/api/products" && !init?.method) {
        return { ok: true, json: async () => ({ products: [product] }) };
      }
      if (url === "/api/products/save") {
        return { ok: true, json: async () => ({ products: [{ id: "new-product" }] }) };
      }
      return { ok: true, json: async () => ({}) };
    });
  });

  it("submits product, warehouse, and generated variant weights when creating a product", async () => {
    renderWithQuery(<ProductNew />, "/products/new");

    fireEvent.change(screen.getByRole("textbox", { name: "Product name" }), { target: { value: "Langra mango" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Weight (kg)" }), { target: { value: "1.5" } });
    await selectOption("Warehouse", "Secondary warehouse");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Add option/i }));
    await user.type(screen.getByPlaceholderText("Color"), "Size");
    const optionValue = screen.getByPlaceholderText("Black");
    await user.type(optionValue, "5 kg{Enter}");
    fireEvent.change(await screen.findByRole("spinbutton", { name: "Variant weight (kg)" }), { target: { value: "5" } });

    fireEvent.click(screen.getByRole("button", { name: /Save product/i }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/products/save", expect.any(Object)));
    const body = requestBody("/api/products/save", "POST");
    expect(body.products[0]).toMatchObject({ weight_kg: 1.5, warehouse_id: "warehouse-2" });
    expect(body.products[0].variants).toEqual([
      expect.objectContaining({ attributes: { size: "5 kg" }, weight_kg: 5 }),
    ]);
  });

  it("edits product and existing variant weight from the product edit page", async () => {
    renderWithQuery(
      <Routes>
        <Route path="/products/:id/edit" element={<ProductEdit />} />
        <Route path="/products" element={<div>Products list</div>} />
      </Routes>,
      "/products/product-1/edit",
    );

    const productWeight = await screen.findByRole("spinbutton", { name: "Weight (kg)" });
    expect(productWeight).toHaveValue(1.25);
    expect(await screen.findByRole("button", { name: /Warehouse$/i })).toHaveTextContent("Secondary warehouse");
    fireEvent.change(productWeight, { target: { value: "2.25" } });
    await selectOption("Warehouse", "Main warehouse");

    const variantWeight = screen.getByRole("spinbutton", { name: "Weight for 5 kg" });
    expect(variantWeight).toHaveValue(5);
    fireEvent.change(variantWeight, { target: { value: "5.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save variant 5 kg" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/product-1/variants/variant-1",
      expect.objectContaining({ method: "PATCH" }),
    ));
    expect(requestBody("/api/products/product-1/variants/variant-1", "PATCH")).toMatchObject({ weight_kg: 5.5 });

    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/product-1",
      expect.objectContaining({ method: "PATCH" }),
    ));
    expect(requestBody("/api/products/product-1", "PATCH")).toMatchObject({
      weight_kg: 2.25,
      warehouse_id: "warehouse-1",
    });
  });

  it("includes weight when adding a variant from the product edit page", async () => {
    renderWithQuery(
      <Routes>
        <Route path="/products/:id/edit" element={<ProductEdit />} />
      </Routes>,
      "/products/product-1/edit",
    );

    await screen.findByText("Existing variants");
    fireEvent.change(screen.getByPlaceholderText("attribute"), { target: { value: "size" } });
    fireEvent.change(screen.getByPlaceholderText("value"), { target: { value: "10 kg" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "New variant weight (kg)" }), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add variant$/i }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/api/products/product-1/variants",
      expect.objectContaining({ method: "POST" }),
    ));
    expect(requestBody("/api/products/product-1/variants", "POST")).toMatchObject({
      attributes: { size: "10 kg" },
      weight_kg: 10,
    });
  });
});
