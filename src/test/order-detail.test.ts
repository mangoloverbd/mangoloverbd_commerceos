import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import OrderDetail from "@/pages/OrderDetail";
import { OrdersTable, type Order } from "@/components/OrdersTable";
import { formatTooltipProductLine } from "@/lib/orderItemDisplay";
import { TooltipProvider } from "@/components/ui/tooltip";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/useMe", () => ({
  useMe: () => ({ data: { orgName: "Mango Lover BD" }, isLoading: false }),
}));

const order = {
  id: "order-1",
  order_number: "ML-1001",
  customer_name: "Ayesha Rahman",
  contact_name: "Ayesha Rahman",
  phone: "01711111111",
  address: "Dhanmondi, Dhaka",
  status: "confirmed",
  payment_method: "Cash on delivery",
  delivery_rate: 80,
  price: 580,
  discount: 0,
  quantity: 1,
  product: "Premium Mango",
  sent_to_courier: false,
  courier_status: null,
  consignment_id: null,
  created_at: "2026-09-03T09:00:00Z",
  updated_at: "2026-09-03T10:00:00Z",
};

const products = {
  products: [
    {
      id: "product-1",
      name: "Premium Mango",
      slug: "premium-mango",
      selling_price: 500,
      stock_quantity: 4,
      weight_kg: 1,
      image_url: "https://cdn.example/mango.jpg",
      images: [],
      variants: [],
    },
    {
      id: "product-2",
      name: "Honey Jar",
      slug: "honey-jar",
      selling_price: 250,
      stock_quantity: 0,
      weight_kg: 0.4,
      image_url: "https://cdn.example/honey.jpg",
      images: [],
      variants: [{ id: "variant-2", product_id: "product-2", attributes: { size: "500g" }, price_adjustment: 25, stock_quantity: 3, weight_kg: 0.5 }],
    },
  ],
};

const detail = {
  order,
  items: [{
    id: "item-1",
    product_id: "product-1",
    variant_id: null,
    product_name: "Premium Mango",
    variant_name: null,
    product_slug: "premium-mango",
    image_url: "https://cdn.example/mango.jpg",
    weight_kg: 1,
    available_stock: 5,
    unit_price: 500,
    discount_type: null,
    discount_value: 0,
    unit_discount: 0,
    quantity: 1,
  }],
  canEditItems: true,
};

function response(body: unknown, ok = true, status = ok ? 200 : 404) {
  return { ok, status, json: async () => body } as Response;
}

function renderPage(id = "order-1", cachedOrders?: unknown[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (cachedOrders) queryClient.setQueryData(["/api/orders"], cachedOrders);
  const result = render(createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(
      MemoryRouter,
      { initialEntries: [`/orders/${id}`] },
      createElement(Routes, null,
        createElement(Route, { path: "/orders/:id", element: createElement(OrderDetail) }),
        createElement(Route, { path: "/", element: createElement("div", null, "Orders dashboard") }),
      ),
    ),
  ));
  return { ...result, queryClient };
}

beforeEach(() => {
  apiFetch.mockClear();
  apiFetch.mockImplementation(async (url: string) => {
    if (url === "/api/orders/order-1") return response(detail);
    if (url === "/api/products") return response(products);
    throw new Error(`Unexpected API request: ${url}`);
  });
});

describe("OrderDetail", () => {
  it("does not append the legacy quantity to structured order item lines", () => {
    expect(formatTooltipProductLine("Pure Ghee · 1 kg · ×2", true, 1)).toBe("Pure Ghee · 1 kg · ×2");
  });

  it("shows a loading state while order detail is pending", () => {
    apiFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByTestId("order-detail-loading")).toBeInTheDocument();
  });

  it("renders named customer, catalog, and cart regions", async () => {
    renderPage();
    expect(await screen.findByRole("region", { name: "Customer and order" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Product catalog" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Order cart" })).toBeInTheDocument();
  });

  it("keeps the editor toolbar visible and limits inner scrolling to the catalog list", async () => {
    renderPage();

    expect(await screen.findByTestId("order-editor-toolbar")).toHaveClass("sticky");
    expect(await screen.findByTestId("order-editor-workspace")).toHaveClass("items-start", "xl:h-[100vh]");

    const catalog = screen.getByRole("region", { name: "Product catalog" });
    expect(catalog).not.toHaveClass("overflow-y-auto");
    expect(within(catalog).getByTestId("catalog-scroll-region")).toHaveClass("overflow-y-auto");
  });

  it("stages the order status in the cart and saves before returning to the order table", async () => {
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/orders/order-1" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        return response({ success: true, order: { ...order, status: body.status } });
      }
      if (url === "/api/orders/order-1") return response(detail);
      if (url === "/api/products") return response(products);
      throw new Error(`Unexpected API request: ${url}`);
    });
    renderPage();
    const user = userEvent.setup();

    const cart = await screen.findByRole("region", { name: "Order cart" });
    expect(within(cart).getByRole("button", { name: /order status/i })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Customer and order" })).queryByRole("button", { name: /order status/i })).not.toBeInTheDocument();
    await user.click(within(cart).getByRole("button", { name: /order status/i }));
    await user.click(await screen.findByRole("option", { name: "print" }));

    expect(apiFetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      const patch = apiFetch.mock.calls.find(([url, init]) => url === "/api/orders/order-1" && init?.method === "PATCH");
      expect(patch).toBeDefined();
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ status: "print" });
    });
    expect(await screen.findByText("Orders dashboard")).toBeInTheDocument();
  });

  it("saves an on-hold status and its compact note together", async () => {
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/orders/order-1" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        return response({ success: true, order: { ...order, ...body } });
      }
      if (url === "/api/orders/order-1") return response(detail);
      if (url === "/api/products") return response(products);
      throw new Error(`Unexpected API request: ${url}`);
    });
    const { queryClient } = renderPage("order-1", [order]);
    const user = userEvent.setup();

    const cart = await screen.findByRole("region", { name: "Order cart" });
    await user.click(within(cart).getByRole("button", { name: /order status/i }));
    await user.click(await screen.findByRole("option", { name: "On Hold" }));
    await user.type(within(cart).getByRole("textbox", { name: "Hold note" }), "Waiting for stock");
    await user.click(within(cart).getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      const patch = apiFetch.mock.calls.find(([url, init]) => url === "/api/orders/order-1" && init?.method === "PATCH");
      expect(patch).toBeDefined();
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ status: "on_hold", notes: "Waiting for stock" });
    });
    expect(queryClient.getQueryData<Order[]>(["/api/orders"])?.[0]).toMatchObject({ status: "on_hold", notes: "Waiting for stock" });
  });

  it("saves an edited hold note with the main changes button", async () => {
    const holdDetail = { ...detail, order: { ...order, status: "on_hold", notes: "Waiting for stock" } };
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/orders/order-1" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        return response({ success: true, order: { ...holdDetail.order, notes: body.notes } });
      }
      if (url === "/api/orders/order-1") return response(holdDetail);
      if (url === "/api/products") return response(products);
      throw new Error(`Unexpected API request: ${url}`);
    });
    renderPage();
    const user = userEvent.setup();

    const box = await screen.findByRole("textbox", { name: /hold note/i });
    expect(box).toHaveValue("Waiting for stock");
    await user.clear(box);
    await user.type(box, "Waiting for stock, call Friday");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      const patch = apiFetch.mock.calls.find(([url, init]) => url === "/api/orders/order-1" && init?.method === "PATCH");
      expect(patch).toBeDefined();
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ notes: "Waiting for stock, call Friday" });
    });
    expect(await screen.findByText("Orders dashboard")).toBeInTheDocument();
  });

  it("keeps customer details read-only until Edit and supports Apply and Cancel", async () => {
    renderPage();
    expect(await screen.findAllByText("Ayesha Rahman")).toHaveLength(2);
    expect(screen.queryByLabelText("Customer name")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit customer" }));
    fireEvent.change(screen.getByLabelText("Customer name"), { target: { value: "Nusrat Jahan" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel customer edit" }));
    expect(await screen.findAllByText("Ayesha Rahman")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Edit customer" }));
    fireEvent.change(screen.getByLabelText("Customer name"), { target: { value: "Nusrat Jahan" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply customer changes" }));
    expect(await screen.findAllByText("Nusrat Jahan")).toHaveLength(2);
  });

  it("filters the catalog by slug and variant and increments duplicate cart items", async () => {
    renderPage();
    const search = await screen.findByRole("searchbox", { name: "Search products" });
    fireEvent.change(search, { target: { value: "honey-jar" } });
    expect(screen.getByText("Honey Jar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Premium Mango to cart" })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "500g" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Honey Jar, 500g to cart" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Honey Jar, 500g to cart" }));
    const honeyLine = await screen.findByTestId("order-item-draft-product-2-variant-2");
    expect(within(honeyLine).getByRole("spinbutton")).toHaveValue(2);
  });

  it("applies and removes an item discount with a live preview", async () => {
    renderPage();
    const line = await screen.findByTestId("order-item-item-1");
    fireEvent.click(within(line).getByRole("button", { name: "Add discount to Premium Mango" }));
    fireEvent.click(screen.getByRole("button", { name: "Percentage" }));
    fireEvent.change(screen.getByLabelText("Discount value"), { target: { value: "10" } });
    expect(screen.getByText("৳450 per unit")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply discount" }));
    expect(within(line).getByText("10% off")).toBeInTheDocument();
    expect(screen.getByText("−৳50")).toBeInTheDocument();

    fireEvent.click(within(line).getByRole("button", { name: "Edit discount for Premium Mango" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove discount" }));
    expect(within(line).queryByText("10% off")).not.toBeInTheDocument();
  });

  it("validates fixed discounts against the unit price", async () => {
    renderPage();
    const line = await screen.findByTestId("order-item-item-1");
    fireEvent.click(within(line).getByRole("button", { name: "Add discount to Premium Mango" }));
    fireEvent.change(screen.getByLabelText("Discount value"), { target: { value: "501" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Enter an amount from 0 to ৳500");
    expect(screen.getByRole("button", { name: "Apply discount" })).toBeDisabled();
  });

  it("sends discount intent without calculated monetary fields", async () => {
    const savedDetail = { ...detail, items: [{ ...detail.items[0], discount_type: "percentage", discount_value: 10, unit_discount: 50 }] };
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/orders/order-1/items" && init?.method === "PATCH") return response(savedDetail);
      if (url === "/api/orders/order-1") return response(detail);
      if (url === "/api/products") return response(products);
      throw new Error(`Unexpected API request: ${url}`);
    });
    renderPage();
    const line = await screen.findByTestId("order-item-item-1");
    fireEvent.click(within(line).getByRole("button", { name: "Add discount to Premium Mango" }));
    fireEvent.click(screen.getByRole("button", { name: "Percentage" }));
    fireEvent.change(screen.getByLabelText("Discount value"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply discount" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(apiFetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
    const saveCall = apiFetch.mock.calls.find(([url, init]) => url === "/api/orders/order-1/items" && init?.method === "PATCH");
    expect(JSON.parse(saveCall[1].body)).toEqual({ items: [{ productId: "product-1", variantId: null, quantity: 1, discountType: "percentage", discountValue: 10 }] });
    expect(String(saveCall[1].body)).not.toContain("unitDiscount");
    expect(String(saveCall[1].body)).not.toContain("unit_price");
  });

  it("shows catalog error, empty cart, and retry controls", async () => {
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/orders/order-1") return response(detail);
      if (url === "/api/products") return response({ error: "Catalog unavailable" }, false, 500);
      throw new Error(`Unexpected API request: ${url}`);
    });
    renderPage();
    expect(await screen.findByText("Could not load the product catalog.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("order-item-item-1")).getByRole("button", { name: "Remove Premium Mango" }));
    expect(screen.getByText("Your cart is empty.")).toBeInTheDocument();
  });

  it("blocks changed carts that still contain detached legacy items", async () => {
    const detached = { ...detail.items[0], id: "legacy-item", product_id: null, product_slug: null };
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/orders/order-1") return response({ ...detail, items: [detached] });
      if (url === "/api/products") return response(products);
      throw new Error(`Unexpected API request: ${url}`);
    });
    renderPage();
    const line = await screen.findByTestId("order-item-legacy-item");
    fireEvent.change(within(line).getByRole("spinbutton"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Remove or replace detached legacy items before saving cart changes");
    expect(apiFetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("renders the cached dashboard order while detail data is pending", () => {
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/orders/order-1") return new Promise(() => {});
      throw new Error(`Unexpected API request: ${url}`);
    });
    renderPage("order-1", [{ ...order, items: [{ product_id: "product-1", product_name: "Premium Mango", variant_name: '{"size":"1 kg"}', unit_price: 500, quantity: 1 }] }]);
    expect(screen.queryByTestId("order-detail-loading")).not.toBeInTheDocument();
    expect(screen.getAllByText("Ayesha Rahman")).toHaveLength(2);
    expect(screen.getByRole("region", { name: "Customer and order" })).toBeInTheDocument();
    expect(screen.queryByText(/Editing is locked after courier dispatch/i)).not.toBeInTheDocument();
  });

  it("shows not found when the detail endpoint returns 404", async () => {
    apiFetch.mockResolvedValue(response({ error: "Order not found" }, false));
    renderPage("missing");
    expect(await screen.findByText(/Order not found/)).toBeInTheDocument();
  });

  it("shows exactly one hash before an order number that already has a hash", async () => {
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/orders/order-1") return response({ ...detail, order: { ...order, order_number: "#1007" } });
      if (url === "/api/products") return response(products);
      throw new Error(`Unexpected API request: ${url}`);
    });
    renderPage();
    expect(await screen.findByText("#1007")).toBeInTheDocument();
    expect(screen.queryByText("##1007")).not.toBeInTheDocument();
  });

  it("renders the order summary and current line items", async () => {
    renderPage();
    expect(await screen.findAllByText("Ayesha Rahman")).toHaveLength(2);
    expect(screen.getByText("#ML-1001")).toBeInTheDocument();
    expect(screen.getByText("Dhanmondi, Dhaka")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Order cart" })).getByText("Premium Mango")).toBeInTheDocument();
    expect(screen.getByText("1 kg")).toBeInTheDocument();
    expect(screen.getAllByText("৳580")).toHaveLength(2);
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(screen.getAllByText("৳80")).toHaveLength(2);
    await waitFor(() => expect(screen.getByTestId("order-detail-animated-content")).toHaveStyle({ opacity: "1" }));
  });

  it("adds a product and variant, edits quantity, and removes a line", async () => {
    renderPage();
    fireEvent.change(await screen.findByRole("searchbox", { name: "Search products" }), { target: { value: "500g" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Honey Jar, 500g to cart" }));
    expect(within(screen.getByTestId("order-item-draft-product-2-variant-2")).getByText("Honey Jar")).toBeInTheDocument();

    const mangoRow = screen.getByTestId("order-item-item-1");
    fireEvent.change(within(mangoRow).getByRole("spinbutton"), { target: { value: "3" } });
    fireEvent.click(within(mangoRow).getByRole("button", { name: "Remove Premium Mango" }));
    expect(screen.queryByTestId("order-item-item-1")).not.toBeInTheDocument();
  });

  it("saves only item identity and quantities and shows saving state", async () => {
    let resolveSave: (value: Response) => void = () => undefined;
    const savedDetail = { ...detail, order: { ...order, updated_at: "2026-09-03T11:00:00Z" }, items: [{ ...detail.items[0], product_name: "Updated Mango" }] };
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/orders/order-1/items" && init?.method === "PATCH") {
        return new Promise<Response>((resolve) => { resolveSave = resolve; });
      }
      if (url === "/api/orders/order-1") return response(detail);
      if (url === "/api/products") return response(products);
      throw new Error(`Unexpected API request: ${url}`);
    });
    const { queryClient } = renderPage();
    const line = await screen.findByTestId("order-item-item-1");
    fireEvent.change(within(line).getByRole("spinbutton"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    expect(screen.getByRole("button", { name: /Saving/i })).toBeDisabled();
    const saveCall = apiFetch.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(saveCall[1].body)).toEqual({ items: [{ productId: "product-1", variantId: null, quantity: 2, discountType: null, discountValue: 0 }] });
    resolveSave(response(savedDetail));
    await waitFor(() => expect(screen.getByText("Orders dashboard")).toBeInTheDocument());
    expect(queryClient.getQueryData(["/api/orders/order-1"])).toEqual(savedDetail);
  });

  it("saves an overall cart discount without touching items", async () => {
    const discountedOrder = { ...order, discount: 50, price: 450 };
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/orders/order-1" && init?.method === "PATCH") return response({ success: true, order: discountedOrder });
      if (url === "/api/orders/order-1") return response(detail);
      if (url === "/api/products") return response(products);
      throw new Error(`Unexpected API request: ${url}`);
    });
    renderPage();
    await screen.findByTestId("order-item-item-1");
    fireEvent.click(screen.getByRole("button", { name: "Add cart discount" }));
    fireEvent.change(screen.getByLabelText("Cart discount value"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply cart discount" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(apiFetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true));
    expect(apiFetch.mock.calls.some(([url, init]) => url === "/api/orders/order-1/items" && init?.method === "PATCH")).toBe(false);
    const discountCall = apiFetch.mock.calls.find(([url, init]) => url === "/api/orders/order-1" && init?.method === "PATCH");
    expect(JSON.parse(discountCall[1].body)).toEqual({ discount: 50 });
    expect(await screen.findByText("Orders dashboard")).toBeInTheDocument();
  });

  it("shows the customer's last orders with date and status, excluding the current order", async () => {
    const historyOrders = [
      { ...order, id: "order-0", order_number: "ML-1000", status: "print", price: 450, created_at: "2026-08-20T10:00:00Z" },
      { ...order, id: "order-2", order_number: "ML-1002", status: "confirmed", price: 300, created_at: "2026-09-01T10:00:00Z" },
      { ...order, id: "other", order_number: "ML-999", phone: "01999999999", customer_name: "Someone Else", contact_name: "Someone Else" },
    ];
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/orders/order-1") return response(detail);
      if (url === "/api/orders") return response({ orders: historyOrders });
      if (url === "/api/products") return response(products);
      throw new Error(`Unexpected API request: ${url}`);
    });
    renderPage();
    expect(await screen.findByText("Last orders")).toBeInTheDocument();
    expect(screen.getByText("ML-1002")).toBeInTheDocument();
    expect(screen.getByText("ML-1000")).toBeInTheDocument();
    expect(screen.queryByText("ML-999")).not.toBeInTheDocument();
    expect(screen.getAllByText("#ML-1001")).toHaveLength(1);
    const latestRow = screen.getByText("ML-1002").closest("li");
    expect(within(latestRow).getByText("Approved")).toBeInTheDocument();
    expect(within(latestRow).getByText(/Sep 1, 2026/)).toBeInTheDocument();
  });

  it("keeps the delivery toggle synchronized while switching on and off", async () => {
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/orders/order-1" && init?.method === "PATCH") return response({ success: true, order });
      if (url === "/api/orders/order-1") return response(detail);
      if (url === "/api/products") return response(products);
      throw new Error(`Unexpected API request: ${url}`);
    });
    renderPage();
    await screen.findByTestId("order-item-item-1");
    const deliverySwitch = screen.getByRole("switch", { name: "Toggle delivery charge" });
    expect(deliverySwitch).toBeChecked();
    fireEvent.click(deliverySwitch);
    expect(deliverySwitch).not.toBeChecked();
    fireEvent.click(deliverySwitch);
    expect(deliverySwitch).toBeChecked();
    fireEvent.click(deliverySwitch);
    expect(deliverySwitch).not.toBeChecked();
  });

  it("initializes the delivery toggle from a saved free-delivery order", async () => {
    const freeDeliveryDetail = { ...detail, order: { ...order, delivery_rate: 0 } };
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/orders/order-1") return response(freeDeliveryDetail);
      if (url === "/api/products") return response(products);
      throw new Error(`Unexpected API request: ${url}`);
    });
    renderPage();

    expect(await screen.findByRole("switch", { name: "Toggle delivery charge" })).not.toBeChecked();
  });

  it("restores the flat delivery fee when free delivery is switched back on", async () => {
    const freeDeliveryDetail = { ...detail, order: { ...order, delivery_rate: 0 } };
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/orders/order-1" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        return response({ success: true, order: { ...freeDeliveryDetail.order, ...body } });
      }
      if (url === "/api/orders/order-1") return response(freeDeliveryDetail);
      if (url === "/api/products") return response(products);
      throw new Error(`Unexpected API request: ${url}`);
    });
    renderPage();
    const deliverySwitch = await screen.findByRole("switch", { name: "Toggle delivery charge" });
    fireEvent.click(deliverySwitch);
    expect(await screen.findByText("৳100")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      const patch = apiFetch.mock.calls.find(([url, init]) => url === "/api/orders/order-1" && init?.method === "PATCH");
      expect(patch).toBeDefined();
      expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ delivery_rate: 100 });
    });
  });

  it("does not overwrite an edited draft when detail data refetches", async () => {
    const { queryClient } = renderPage();
    await screen.findByTestId("order-item-item-1");
    fireEvent.change(within(screen.getByTestId("order-item-item-1")).getByRole("spinbutton"), { target: { value: "4" } });
    queryClient.setQueryData(["/api/orders/order-1"], { ...detail, items: [{ ...detail.items[0], quantity: 9 }] });
    await waitFor(() => expect(within(screen.getByTestId("order-item-item-1")).getByRole("spinbutton")).toHaveValue(4));
  });

  it("preserves the draft and displays a save error", async () => {
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/orders/order-1/items" && init?.method === "PATCH") return response({ error: "Insufficient stock" }, false);
      if (url === "/api/orders/order-1") return response(detail);
      if (url === "/api/products") return response(products);
      throw new Error(`Unexpected API request: ${url}`);
    });
    renderPage();
    await screen.findByTestId("order-item-item-1");
    fireEvent.change(within(screen.getByTestId("order-item-item-1")).getByRole("spinbutton"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    expect(await screen.findByText("Insufficient stock")).toBeInTheDocument();
    expect(within(screen.getByTestId("order-item-item-1")).getByRole("spinbutton")).toHaveValue(2);
  });

  it("retains a successful customer save when the following cart save fails", async () => {
    const updatedOrder = { ...order, customer_name: "Nusrat Jahan" };
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/orders/order-1" && init?.method === "PATCH") {
        return response({ success: true, order: updatedOrder });
      }
      if (url === "/api/orders/order-1/items" && init?.method === "PATCH") {
        return response({ error: "Insufficient stock" }, false, 409);
      }
      if (url === "/api/orders/order-1") return response(detail);
      if (url === "/api/products") return response(products);
      throw new Error(`Unexpected API request: ${url}`);
    });
    renderPage();
    const line = await screen.findByTestId("order-item-item-1");
    fireEvent.click(screen.getByRole("button", { name: "Edit customer" }));
    fireEvent.change(screen.getByLabelText("Customer name"), { target: { value: "Nusrat Jahan" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply customer changes" }));
    fireEvent.change(within(line).getByRole("spinbutton"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Insufficient stock");
    expect(await screen.findAllByText("Nusrat Jahan")).toHaveLength(2);
    expect(within(line).getByRole("spinbutton")).toHaveValue(2);
  });

  it("shows non-404 detail request errors", async () => {
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/orders/order-1") return response({ error: "Service unavailable" }, false, 500);
      if (url === "/api/products") return response(products);
      throw new Error(`Unexpected API request: ${url}`);
    });
    renderPage();
    expect(await screen.findByText("Service unavailable")).toBeInTheDocument();
  });

  it("navigates back without saving when cancel is clicked", async () => {
    renderPage();
    await screen.findByRole("region", { name: "Order cart" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Orders dashboard")).toBeInTheDocument();
    expect(apiFetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("locks item editing when the order has been dispatched", async () => {
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/orders/order-1") return response({ ...detail, canEditItems: false, order: { ...order, sent_to_courier: true, courier_status: "in_transit" } });
      if (url === "/api/products") return response(products);
      throw new Error(`Unexpected API request: ${url}`);
    });
    renderPage();
    expect(await screen.findAllByText(/Editing is locked after courier dispatch/i)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Add Premium Mango to cart" })).toBeDisabled();
    expect(within(screen.getByTestId("order-item-item-1")).getByRole("spinbutton")).toBeDisabled();
    expect(within(screen.getByTestId("order-item-item-1")).getByRole("button", { name: "Remove Premium Mango" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /order status/i })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: /Save changes/i })).not.toBeDisabled();
  });

  it("edits customer name, phone, and address through the order update API", async () => {
    const updatedOrder = { ...order, customer_name: "Nusrat Jahan", phone: "01822222222", address: "Gulshan, Dhaka" };
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === "/api/orders/order-1" && init?.method === "PATCH") return response({ success: true, order: updatedOrder });
      if (url === "/api/orders/order-1") return response({ ...detail, order });
      if (url === "/api/products") return response(products);
      throw new Error(`Unexpected API request: ${url}`);
    });
    renderPage();
    await screen.findAllByText("Ayesha Rahman");
    fireEvent.click(screen.getByRole("button", { name: "Edit customer" }));
    fireEvent.change(screen.getByLabelText("Customer name"), { target: { value: "Nusrat Jahan" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "01822222222" } });
    fireEvent.change(screen.getByLabelText("Delivery address"), { target: { value: "Gulshan, Dhaka" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply customer changes" }));
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));
    await waitFor(() => expect(screen.getAllByText("Nusrat Jahan")).toHaveLength(2));
    const updateCall = apiFetch.mock.calls.find(([, init]) => init?.method === "PATCH" && String(init?.body).includes("customer_name"));
    expect(JSON.parse(updateCall[1].body)).toEqual({ customer_name: "Nusrat Jahan", phone: "01822222222", address: "Gulshan, Dhaka" });
  });

  it("eagerly loads the catalog and shows the product default image", async () => {
    renderPage();
    expect(await screen.findByAltText("Honey Jar")).toHaveAttribute("src", "https://cdn.example/honey.jpg");
    expect(apiFetch.mock.calls.some(([url]) => url === "/api/products")).toBe(true);
  });

  it("navigates from an order row but not from its interactive controls", async () => {
    const tableOrder = {
      id: "order-1",
      shopify_order_id: 1,
      order_number: "ML-1001",
      customer_name: "Ayesha Rahman",
      phone: "01711111111",
      address: "Dhanmondi, Dhaka",
      product: "Premium Mango",
      quantity: 1,
      items: [{ product_name: "Pure Ghee", variant_name: '{"weight":"1 kg"}', quantity: 2 }],
      price: 580,
      status: "confirmed",
      created_at: "2026-09-03T09:00:00Z",
      fraud_checked: false,
      fraud_data: null,
      delivery_rate: 80,
    };
    render(createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      createElement(TooltipProvider, null,
        createElement(MemoryRouter, { initialEntries: ["/"] },
          createElement(Routes, null,
            createElement(Route, { path: "/", element: createElement(OrdersTable, { orders: [tableOrder], loading: false, onStatusUpdate: vi.fn() }) }),
            createElement(Route, { path: "/orders/:id", element: createElement("div", null, "Order destination") }),
          ),
        ),
      ),
    ));

    const row = screen.getByText("Ayesha Rahman").closest("tr");
    expect(row).not.toBeNull();
    expect(screen.getByText("Pure Ghee")).toBeInTheDocument();
    expect(screen.queryByText("Pure Ghee · 1 kg · ×2")).not.toBeInTheDocument();
    expect(screen.getByTestId("order-items-preview")).toBeInTheDocument();
    expect(screen.queryByText("2 items")).not.toBeInTheDocument();
    fireEvent.click(row!.querySelector("[data-row-interactive='true']")!);
    expect(screen.queryByText("Order destination")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Ayesha Rahman"));
    expect(await screen.findByText("Order destination")).toBeInTheDocument();
  });
});
