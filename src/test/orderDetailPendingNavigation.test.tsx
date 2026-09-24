import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import OrderDetail from "@/pages/OrderDetail";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/components/order-editor/CatalogPanel", () => ({ CatalogPanel: () => null }));
vi.mock("@/components/order-editor/CustomerPanel", () => ({
  CustomerPanel: (props: {
    order: { customer_name?: string };
    customer: { customerName: string; phone: string; address: string };
    onApply: (customer: { customerName: string; phone: string; address: string }) => void;
  }) =>
    createElement(
      "div",
      null,
      createElement("span", { "data-testid": "customer-name" }, props.order.customer_name || ""),
      createElement(
        "button",
        { onClick: () => props.onApply({ ...props.customer, phone: "01799999999" }) },
        "Change phone",
      ),
    ),
}));
vi.mock("@/components/order-editor/CartPanel", () => ({
  CartPanel: (props: { onSave: () => void }) => createElement("button", { onClick: props.onSave }, "Save"),
}));

const orderOne = {
  id: "order-1", order_number: "ML-1001", customer_name: "Ayesha Rahman", phone: "01711111111",
  address: "Dhanmondi, Dhaka", status: "confirmed", delivery_rate: 80, price: 580,
  discount: 0, sent_to_courier: false, created_at: "2026-09-03T09:00:00Z",
};
const orderTwo = {
  id: "order-2", order_number: "ML-1002", customer_name: "Karim Hossain", phone: "01722222222",
  address: "Gulshan, Dhaka", status: "confirmed", delivery_rate: 80, price: 400,
  discount: 0, sent_to_courier: false, created_at: "2026-09-02T09:00:00Z",
};

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function renderOrderDetail(pendingOrderIds: string[], startId = "order-1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        MemoryRouter,
        {
          initialEntries: [
            {
              pathname: `/orders/${startId}`,
              state: { fulfillmentTab: "pending", pendingOrderIds },
            },
          ],
        },
        createElement(
          Routes,
          null,
          createElement(Route, { path: "/orders/:id", element: createElement(OrderDetail) }),
          createElement(Route, { path: "/", element: createElement("div", { "data-testid": "dashboard-stub" }) }),
        ),
      ),
    ),
  );
}

function renderNewTabOrderDetail(entry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        MemoryRouter,
        { initialEntries: [entry] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: "/orders/:id", element: createElement(OrderDetail) }),
          createElement(Route, { path: "/", element: createElement("div", { "data-testid": "dashboard-stub" }) }),
        ),
      ),
    ),
  );
}

describe("pending order prev/next navigation", () => {
  it("shows the queue position and disables Previous on the first pending order", async () => {
    apiFetch.mockImplementation((url: string) => {
      if (url === "/api/orders/order-1") return Promise.resolve(response({ order: orderOne, items: [], canEditItems: true }));
      if (url === "/api/products") return Promise.resolve(response({ products: [] }));
      if (url === "/api/orders") return Promise.resolve(response({ orders: [orderOne, orderTwo] }));
      return Promise.resolve(response({}));
    });

    renderOrderDetail(["order-1", "order-2"]);

    const nav = await screen.findByTestId("order-editor-pending-nav");
    expect(nav).toHaveTextContent("1 of 2 pending");
    expect(screen.getByRole("button", { name: "Previous pending order" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next pending order" })).toBeEnabled();
    // No chip for Previous (disabled/boundary); the Next chip previews order-2's number.
    await waitFor(() => expect(nav).toHaveTextContent("#ML-1002"));
  });

  it("navigates to the next pending order and disables Next at the end of the queue", async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation((url: string) => {
      if (url === "/api/orders/order-1") return Promise.resolve(response({ order: orderOne, items: [], canEditItems: true }));
      if (url === "/api/orders/order-2") return Promise.resolve(response({ order: orderTwo, items: [], canEditItems: true }));
      if (url === "/api/products") return Promise.resolve(response({ products: [] }));
      if (url === "/api/orders") return Promise.resolve(response({ orders: [orderOne, orderTwo] }));
      return Promise.resolve(response({}));
    });

    renderOrderDetail(["order-1", "order-2"]);

    await screen.findByTestId("order-editor-pending-nav");
    expect(await screen.findByTestId("customer-name")).toHaveTextContent("Ayesha Rahman");

    await user.click(screen.getByRole("button", { name: "Next pending order" }));

    await waitFor(() => expect(screen.getByTestId("customer-name")).toHaveTextContent("Karim Hossain"));
    expect(screen.getByTestId("order-editor-pending-nav")).toHaveTextContent("2 of 2 pending");
    expect(screen.getByRole("button", { name: "Next pending order" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous pending order" })).toBeEnabled();
  });

  it("stays on the page and does not bounce back to the dashboard after saving", async () => {
    const user = userEvent.setup();
    const { toast } = await import("@/components/ui/sonner");
    const successSpy = vi.spyOn(toast, "success");
    try {
      apiFetch.mockImplementation((url: string, init?: RequestInit) => {
        if (url === "/api/orders/order-1" && (!init || init.method === undefined)) {
          return Promise.resolve(response({ order: orderOne, items: [], canEditItems: true }));
        }
        if (url === "/api/orders/order-1" && init?.method === "PATCH") {
          return Promise.resolve(response({ order: { ...orderOne, phone: "01799999999" } }));
        }
        if (url === "/api/products") return Promise.resolve(response({ products: [] }));
        if (url === "/api/orders") return Promise.resolve(response({ orders: [orderOne, orderTwo] }));
        return Promise.resolve(response({}));
      });

      renderOrderDetail(["order-1", "order-2"]);

      await screen.findByTestId("order-editor-pending-nav");
      await screen.findByTestId("customer-name");
      await user.click(screen.getByRole("button", { name: "Change phone" }));
      await user.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(successSpy).toHaveBeenCalledWith("Order saved"));
      expect(screen.queryByTestId("dashboard-stub")).not.toBeInTheDocument();
      expect(screen.getByTestId("order-editor-pending-nav")).toHaveTextContent("1 of 2 pending");
      expect(apiFetch).toHaveBeenCalledWith("/api/orders/order-1", expect.objectContaining({ method: "PATCH" }));
    } finally {
      successSpy.mockRestore();
    }
  });

  it("shows pending nav in a new tab from the stored snapshot", async () => {
    localStorage.clear();
    localStorage.setItem(
      "ml:pending-order-queue",
      JSON.stringify({ ids: ["order-1", "order-2"], savedAt: Date.now() }),
    );
    apiFetch.mockImplementation((url: string) => {
      if (url === "/api/orders/order-1") return Promise.resolve(response({ order: orderOne, items: [], canEditItems: true }));
      if (url === "/api/products") return Promise.resolve(response({ products: [] }));
      if (url === "/api/orders") return Promise.resolve(response({ orders: [orderOne, orderTwo] }));
      return Promise.resolve(response({}));
    });

    renderNewTabOrderDetail("/orders/order-1?fulfillmentTab=pending");

    const nav = await screen.findByTestId("order-editor-pending-nav");
    expect(nav).toHaveTextContent("1 of 2 pending");
    expect(screen.getByRole("button", { name: "Next pending order" })).toBeEnabled();
    localStorage.clear();
  });

  it("keeps pending nav after Next in a new tab", async () => {
    localStorage.clear();
    localStorage.setItem(
      "ml:pending-order-queue",
      JSON.stringify({ ids: ["order-1", "order-2"], savedAt: Date.now() }),
    );
    apiFetch.mockImplementation((url: string) => {
      if (url === "/api/orders/order-1") return Promise.resolve(response({ order: orderOne, items: [], canEditItems: true }));
      if (url === "/api/orders/order-2") return Promise.resolve(response({ order: orderTwo, items: [], canEditItems: true }));
      if (url === "/api/products") return Promise.resolve(response({ products: [] }));
      if (url === "/api/orders") return Promise.resolve(response({ orders: [orderOne, orderTwo] }));
      return Promise.resolve(response({}));
    });

    renderNewTabOrderDetail("/orders/order-1?fulfillmentTab=pending");

    await screen.findByTestId("order-editor-pending-nav");
    await userEvent.click(screen.getByRole("button", { name: "Next pending order" }));

    await waitFor(() => expect(screen.getByTestId("customer-name")).toHaveTextContent("Karim Hossain"));
    expect(screen.getByTestId("order-editor-pending-nav")).toHaveTextContent("2 of 2 pending");
    localStorage.clear();
  });

  it("hides pending nav in a new tab without pending context", async () => {
    localStorage.clear();
    localStorage.setItem(
      "ml:pending-order-queue",
      JSON.stringify({ ids: ["order-1", "order-2"], savedAt: Date.now() }),
    );
    apiFetch.mockImplementation((url: string) => {
      if (url === "/api/orders/order-1") return Promise.resolve(response({ order: orderOne, items: [], canEditItems: true }));
      if (url === "/api/products") return Promise.resolve(response({ products: [] }));
      if (url === "/api/orders") return Promise.resolve(response({ orders: [orderOne, orderTwo] }));
      return Promise.resolve(response({}));
    });

    renderNewTabOrderDetail("/orders/order-1");

    await screen.findByTestId("customer-name");
    expect(screen.queryByTestId("order-editor-pending-nav")).not.toBeInTheDocument();
    localStorage.clear();
  });
});
