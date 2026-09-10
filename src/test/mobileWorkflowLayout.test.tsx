import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import OrderDetail from "@/pages/OrderDetail";
import SocialInbox from "@/pages/SocialInbox";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/components/order-editor/CustomerPanel", () => ({ CustomerPanel: () => null }));
vi.mock("@/components/order-editor/CatalogPanel", () => ({ CatalogPanel: () => null }));
vi.mock("@/components/order-editor/CartPanel", () => ({ CartPanel: (props: { onSave: () => void }) => createElement("button", { onClick: props.onSave }, "Save") }));

const order = {
  id: "order-1", order_number: "ML-1001", customer_name: "Ayesha Rahman", phone: "01711111111",
  address: "Dhanmondi, Dhaka", status: "confirmed", delivery_rate: 80, price: 580,
  discount: 0, sent_to_courier: false, created_at: "2026-09-03T09:00:00Z",
};

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function renderOrderDetail() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: ["/orders/order-1"] }, createElement(Routes, null, createElement(Route, { path: "/orders/:id", element: createElement(OrderDetail) })))),
  );
}

describe("mobile workflow layout", () => {
  it("keeps order editor controls in mobile reading order", async () => {
    apiFetch.mockImplementation((url: string) => {
      if (url === "/api/orders/order-1") return Promise.resolve(response({ order, items: [], canEditItems: true }));
      if (url === "/api/products") return Promise.resolve(response({ products: [] }));
      return Promise.resolve(response({ orders: [] }));
    });

    renderOrderDetail();
    const workspace = await screen.findByTestId("order-editor-workspace");
    expect(workspace).toHaveAttribute("data-mobile-layout", "single-column");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("returns from a mobile inbox chat to the conversation list", async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation((url: string) => {
      if (url === "/api/social/conversations/facebook") return Promise.resolve(response({ conversations: [{ id: "conversation-1", platform: "facebook", contact_id: "contact-1", contact_name: "Mango Buyer", last_message: "Hello", last_message_at: "2026-09-11T08:00:00Z", unread_count: 1 }] }));
      if (url === "/api/social/messages/conversation-1") return Promise.resolve(response({ messages: [], paused_ai: true }));
      return Promise.resolve(response({}));
    });

    render(createElement(SocialInbox, { platform: "facebook" }));
    await user.click(await screen.findByTestId("button-conversation-conversation-1"));
    await waitFor(() => expect(screen.getByRole("button", { name: /back to conversations/i })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /back to conversations/i }));
    expect(screen.getByTestId("input-search-conversations")).toBeVisible();
  });
});
