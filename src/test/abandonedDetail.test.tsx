import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AbandonedDetail from "@/pages/AbandonedDetail";

const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiFetch }));

const draft = {
  id: "draft-1", status: "open", customer_name: "Abandoned Customer",
  phone: "01712345678", address: "House 1, Dhaka",
  cart: [{ productName: "Sundarbans Honey", variantName: "1 kg", quantity: 1, unitPrice: 750 }],
  subtotal: 750, delivery_rate: 100, total: 850, source: "storefront",
  source_path: "/checkout", campaign: {}, contacted_at: null,
  created_at: "2026-09-11T12:00:00.000Z", updated_at: "2026-09-11T12:00:00.000Z",
};

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return { ok: init?.ok ?? true, status: init?.status ?? 200, json: async () => body };
}

function renderDetail(initialEntries: string[] = ["/abandoned/draft-1"]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/abandoned/:id" element={<AbandonedDetail />} />
          <Route path="/" element={<div data-testid="dashboard-home">Dashboard</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

describe("AbandonedDetail", () => {
  beforeEach(() => {
    apiFetch.mockReset();
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/abandoned-checkouts") {
        return jsonResponse({ checkouts: [draft], activeCount: 1 });
      }
      if (url === "/api/products") return jsonResponse({ products: [] });
      return jsonResponse({});
    });
  });

  it("renders the draft name, phone, cart line, and total with no order-status select or discount UI", async () => {
    renderDetail();

    expect((await screen.findAllByText("Abandoned Customer")).length).toBeGreaterThan(0);
    expect(screen.getByText("01712345678")).toBeInTheDocument();
    expect(screen.getByText("Sundarbans Honey")).toBeInTheDocument();
    expect(screen.getByText(/৳850/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /order status/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /discount/i })).not.toBeInTheDocument();
  });

  it("saving with an invalid phone shows a validation error and never PATCHes", async () => {
    const user = userEvent.setup();
    renderDetail();
    expect((await screen.findAllByText("Abandoned Customer")).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /edit customer/i }));
    await user.clear(screen.getByLabelText("Phone"));
    await user.type(screen.getByLabelText("Phone"), "123");
    await user.click(screen.getByRole("button", { name: /apply customer changes/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/phone/i);
    expect(apiFetch.mock.calls.some(([url, init]) => url === "/api/abandoned-checkouts/draft-1" && init?.method === "PATCH")).toBe(false);
  });

  it("editing the name and saving PATCHes the staff-edit endpoint without an action key", async () => {
    const user = userEvent.setup();
    const updated = { ...draft, customer_name: "Edited Name" };
    apiFetch.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (url === "/api/abandoned-checkouts") {
        return jsonResponse({ checkouts: [draft], activeCount: 1 });
      }
      if (url === "/api/products") return jsonResponse({ products: [] });
      if (url === "/api/abandoned-checkouts/draft-1" && init?.method === "PATCH") {
        return jsonResponse({ checkout: updated });
      }
      return jsonResponse({});
    });
    renderDetail();
    expect((await screen.findAllByText("Abandoned Customer")).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /edit customer/i }));
    await user.clear(screen.getByLabelText("Customer name"));
    await user.type(screen.getByLabelText("Customer name"), "Edited Name");
    await user.click(screen.getByRole("button", { name: /apply customer changes/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      const patchCall = apiFetch.mock.calls.find(
        ([url, init]) => url === "/api/abandoned-checkouts/draft-1" && init?.method === "PATCH",
      );
      expect(patchCall).toBeDefined();
    });
    const patchCall = apiFetch.mock.calls.find(
      ([url, init]) => url === "/api/abandoned-checkouts/draft-1" && init?.method === "PATCH",
    ) as unknown as [string, { body: string }];
    const body = JSON.parse(patchCall[1].body);
    expect(body.customerName).toBe("Edited Name");
    expect(body).not.toHaveProperty("action");
  });

  it("shows a not-found block with a back link when the draft is absent", async () => {
    const user = userEvent.setup();
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/abandoned-checkouts") {
        return jsonResponse({ checkouts: [], activeCount: 0 });
      }
      if (url === "/api/products") return jsonResponse({ products: [] });
      return jsonResponse({});
    });
    renderDetail(["/abandoned/missing-id"]);

    expect(await screen.findByText("Checkout not found.")).toBeInTheDocument();
    expect(apiFetch.mock.calls.some(([url]) => url === "/api/products")).toBe(false);
    await user.click(screen.getByRole("button", { name: /back to abandoned/i }));
    expect(await screen.findByTestId("dashboard-home")).toBeInTheDocument();
  });

  it("exposes the cart region without the empty status-select grid cell breaking layout", async () => {
    renderDetail();
    expect((await screen.findAllByText("Abandoned Customer")).length).toBeGreaterThan(0);
    const cart = screen.getByRole("region", { name: /order cart/i });
    expect(within(cart).queryByRole("button", { name: /order status/i })).not.toBeInTheDocument();
  });
});
