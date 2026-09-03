import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import OrderDetail from "@/pages/OrderDetail";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));

const order = {
  id: "order-1",
  order_number: "ML-1001",
  contact_name: "Ayesha Rahman",
  phone: "01711111111",
  address: "Dhanmondi, Dhaka",
  status: "confirmed",
  payment_method: "Cash on delivery",
  delivery_rate: 80,
  price: 580,
  quantity: 1,
  product: "Premium Mango",
  sent_to_courier: false,
  courier_status: null,
  consignment_id: null,
  created_at: "2026-09-03T09:00:00Z",
};

const products = {
  products: [
    {
      id: "product-2",
      name: "Honey Jar",
      selling_price: 250,
      variants: [{ id: "variant-2", attributes: { size: "500g" }, price_adjustment: 25 }],
    },
  ],
};

const detail = {
  order,
  items: [{ id: "item-1", product_id: "product-1", variant_id: null, product_name: "Premium Mango", variant_name: null, unit_price: 500, quantity: 1 }],
  canEditItems: true,
};

function response(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 404, json: async () => body } as Response;
}

function renderPage(id = "order-1") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(
      MemoryRouter,
      { initialEntries: [`/orders/${id}`] },
      createElement(Routes, null, createElement(Route, { path: "/orders/:id", element: createElement(OrderDetail) })),
    ),
  ));
}

beforeEach(() => {
  apiFetch.mockImplementation(async (url: string) => {
    if (url === "/api/orders/order-1") return response(detail);
    if (url === "/api/products") return response(products);
    throw new Error(`Unexpected API request: ${url}`);
  });
});

describe("OrderDetail", () => {
  it("shows a loading state while order detail is pending", () => {
    apiFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId("order-detail-loading")).toBeInTheDocument();
  });

  it("shows not found when the detail endpoint returns 404", async () => {
    apiFetch.mockResolvedValue(response({ error: "Order not found" }, false));
    renderPage("missing");
    expect(await screen.findByText(/Order not found/)).toBeInTheDocument();
  });

  it("renders the order summary and current line items", async () => {
    renderPage();
    expect(await screen.findByText("Ayesha Rahman")).toBeInTheDocument();
    expect(screen.getByText("#ML-1001")).toBeInTheDocument();
    expect(screen.getByText("Dhanmondi, Dhaka")).toBeInTheDocument();
    expect(screen.getByText("Premium Mango")).toBeInTheDocument();
    expect(screen.getByText("৳580")).toBeInTheDocument();
  });

  it("adds a product and variant, edits quantity, and removes a line", async () => {
    renderPage();
    const addProduct = await screen.findByLabelText("Add product");
    fireEvent.change(addProduct, { target: { value: "product-2" } });
    expect(await screen.findByLabelText("Add variant")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Add variant"), { target: { value: "variant-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect(screen.getAllByText("Honey Jar").length).toBeGreaterThan(1);

    const mangoRow = screen.getByTestId("order-item-item-1");
    fireEvent.change(within(mangoRow).getByRole("spinbutton"), { target: { value: "3" } });
    fireEvent.click(within(mangoRow).getByRole("button", { name: "Remove Premium Mango" }));
    expect(screen.queryByTestId("order-item-item-1")).not.toBeInTheDocument();
  });

  it("saves only item identity and quantities and shows saving state", async () => {
    let resolveSave: (value: Response) => void = () => undefined;
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/orders/order-1" && init?.method === "PATCH") {
        return new Promise<Response>((resolve) => { resolveSave = resolve; });
      }
      if (url === "/api/orders/order-1") return response(detail);
      if (url === "/api/products") return response(products);
      throw new Error(`Unexpected API request: ${url}`);
    });
    renderPage();
    await screen.findByText("Ayesha Rahman");
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    expect(screen.getByRole("button", { name: /Saving/i })).toBeDisabled();
    const saveCall = apiFetch.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(saveCall[1].body)).toEqual({ items: [{ productId: "product-1", variantId: null, quantity: 1 }] });
    resolveSave(response(detail));
    await waitFor(() => expect(screen.getByRole("button", { name: /Save changes/i })).not.toBeDisabled());
  });

  it("preserves the draft and displays a save error", async () => {
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/orders/order-1/items" && init?.method === "PATCH") return response({ error: "Insufficient stock" }, false);
      if (url === "/api/orders/order-1") return response(detail);
      if (url === "/api/products") return response(products);
      throw new Error(`Unexpected API request: ${url}`);
    });
    renderPage();
    await screen.findByText("Ayesha Rahman");
    fireEvent.change(within(screen.getByTestId("order-item-item-1")).getByRole("spinbutton"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    expect(await screen.findByText("Insufficient stock")).toBeInTheDocument();
    expect(within(screen.getByTestId("order-item-item-1")).getByRole("spinbutton")).toHaveValue(2);
  });

  it("locks item editing when the order has been dispatched", async () => {
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/orders/order-1") return response({ ...detail, canEditItems: false, order: { ...order, sent_to_courier: true, courier_status: "in_transit" } });
      if (url === "/api/products") return response(products);
      throw new Error(`Unexpected API request: ${url}`);
    });
    renderPage();
    expect(await screen.findByText(/Editing is locked after courier dispatch/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Add product")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Save changes/i })).toBeDisabled();
  });
});
