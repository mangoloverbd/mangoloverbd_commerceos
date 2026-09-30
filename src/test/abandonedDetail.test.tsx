import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AbandonedDetail from "@/pages/AbandonedDetail";

const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/components/order-editor/FraudPanel", () => ({ FraudPanel: () => null }));

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

  it("opens on Order details without the embedded activity timeline", async () => {
    renderDetail();

    expect((await screen.findAllByText("Abandoned Customer")).length).toBeGreaterThan(0);
    expect(screen.getByRole("radio", { name: "Order details" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Logs" })).not.toBeChecked();
    expect(screen.queryByRole("region", { name: "Order activity" })).not.toBeInTheDocument();
  });

  it("slides to live logs and keeps unapplied customer edits when returning", async () => {
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/abandoned-checkouts") return jsonResponse({ checkouts: [draft], activeCount: 1 });
      if (url === "/api/products") return jsonResponse({ products: [] });
      if (url === "/api/abandoned-checkouts/draft-1/activity") {
        return jsonResponse({ events: [{ id: "event-1", occurred_at: "2026-09-11T12:05:00.000Z", event_type: "contacted", actor_display_name: "Sadia", summary: "Checkout contacted" }] });
      }
      return jsonResponse({});
    });
    const user = userEvent.setup();
    renderDetail();
    expect((await screen.findAllByText("Abandoned Customer")).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /edit customer/i }));
    await user.clear(screen.getByLabelText("Phone"));
    await user.type(screen.getByLabelText("Phone"), "01799999999");

    await user.click(screen.getByRole("radio", { name: "Logs" }));
    expect(await screen.findByRole("region", { name: "Order activity" })).toBeInTheDocument();
    expect((await screen.findAllByText("Checkout contacted")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("region", { name: "Order cart" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Order details" }));
    expect(screen.getByRole("region", { name: "Order cart" })).toBeInTheDocument();
    expect(screen.getByLabelText("Phone")).toHaveValue("01799999999");
  });

  it("prefetches activity so Logs opens without a loading state", async () => {
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/abandoned-checkouts") return jsonResponse({ checkouts: [draft], activeCount: 1 });
      if (url === "/api/products") return jsonResponse({ products: [] });
      if (url === "/api/abandoned-checkouts/draft-1/activity") {
        return jsonResponse({ events: [{ id: "event-1", occurred_at: "2026-09-11T12:05:00.000Z", event_type: "contacted", actor_display_name: "Sadia", summary: "Checkout contacted" }] });
      }
      return jsonResponse({});
    });
    const user = userEvent.setup();
    const client = renderDetail();
    expect((await screen.findAllByText("Abandoned Customer")).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.getQueryData(["/api/abandoned-checkouts/draft-1/activity"])).toBeDefined());

    await user.click(screen.getByRole("radio", { name: "Logs" }));

    expect(screen.queryByText("Loading activity")).not.toBeInTheDocument();
    expect(screen.getAllByText("Checkout contacted").length).toBeGreaterThan(0);
  });

  it("refreshes activity after saving even while Logs is closed", async () => {
    const activityCalls = () => apiFetch.mock.calls.filter(([url, init]) => url === "/api/abandoned-checkouts/draft-1/activity" && !init?.method).length;
    apiFetch.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (url === "/api/abandoned-checkouts") return jsonResponse({ checkouts: [draft], activeCount: 1 });
      if (url === "/api/products") return jsonResponse({ products: [] });
      if (url === "/api/abandoned-checkouts/draft-1" && init?.method === "PATCH") {
        return jsonResponse({ checkout: { ...draft, customer_name: "Edited Name" } });
      }
      if (url === "/api/abandoned-checkouts/draft-1/activity") return jsonResponse({ events: [] });
      return jsonResponse({});
    });
    const user = userEvent.setup();
    renderDetail();
    expect((await screen.findAllByText("Abandoned Customer")).length).toBeGreaterThan(0);
    await waitFor(() => expect(activityCalls()).toBeGreaterThanOrEqual(1));
    await waitFor(() => expect(apiFetch.mock.calls.some(([url]) => url === "/api/abandoned-checkouts/draft-1/activity/view")).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const callsBeforeSave = activityCalls();

    await user.click(screen.getByRole("button", { name: /edit customer/i }));
    await user.clear(screen.getByLabelText("Customer name"));
    await user.type(screen.getByLabelText("Customer name"), "Edited Name");
    await user.click(screen.getByRole("button", { name: /apply customer changes/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(activityCalls()).toBeGreaterThan(callsBeforeSave));
  });

  it("opens directly on Logs from a ?tab=logs link", async () => {
    renderDetail(["/abandoned/draft-1?tab=logs"]);

    expect(await screen.findByRole("region", { name: "Order activity" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Logs" })).toBeChecked();
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

  describe("move-to action bar", () => {
    type Call = [string, { method?: string; body?: string } | undefined];
    const mutationCalls = () => (apiFetch.mock.calls as Call[]).filter(([url, init]) =>
      (url === "/api/abandoned-checkouts/draft-1" && init?.method === "PATCH")
      || url === "/api/abandoned-checkouts/draft-1/convert");

    function mockMutations(convert: () => ReturnType<typeof jsonResponse> = () => jsonResponse({ order: { order_number: "1042" } })) {
      apiFetch.mockImplementation(async (url: string, init?: { method?: string }) => {
        if (url === "/api/abandoned-checkouts") return jsonResponse({ checkouts: [draft], activeCount: 1 });
        if (url === "/api/products") return jsonResponse({ products: [] });
        if (url === "/api/abandoned-checkouts/draft-1" && init?.method === "PATCH") {
          return jsonResponse({ checkout: { ...draft, customer_name: "Edited Name", updated_at: "2026-09-11T13:00:00.000Z" } });
        }
        if (url === "/api/abandoned-checkouts/draft-1/convert") return convert();
        return jsonResponse({});
      });
    }

    async function editName(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole("button", { name: /edit customer/i }));
      await user.clear(screen.getByLabelText("Customer name"));
      await user.type(screen.getByLabelText("Customer name"), "Edited Name");
      await user.click(screen.getByRole("button", { name: /apply customer changes/i }));
    }

    it("defaults to Abandoned and saves in place", async () => {
      mockMutations();
      const user = userEvent.setup();
      renderDetail();
      expect((await screen.findAllByText("Abandoned Customer")).length).toBeGreaterThan(0);

      const bar = screen.getByTestId("abandoned-action-bar");
      expect(within(bar).getByRole("button", { name: "Abandoned" })).toHaveAttribute("aria-pressed", "true");
      expect(within(bar).getByRole("button", { name: "Save changes" })).toBeInTheDocument();

      await editName(user);
      await user.click(within(bar).getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(mutationCalls().length).toBe(1));
      expect(mutationCalls()[0][0]).toBe("/api/abandoned-checkouts/draft-1");
      expect(screen.queryByTestId("dashboard-home")).not.toBeInTheDocument();
    });

    it("moves to Approved without a PATCH when nothing was edited", async () => {
      mockMutations();
      const user = userEvent.setup();
      renderDetail();
      expect((await screen.findAllByText("Abandoned Customer")).length).toBeGreaterThan(0);

      await user.click(screen.getByRole("button", { name: "Approved" }));
      expect(screen.getByRole("button", { name: "Approved" })).toHaveAttribute("aria-pressed", "true");
      await user.click(screen.getByRole("button", { name: "Save & move to Approved" }));

      expect(await screen.findByTestId("dashboard-home")).toBeInTheDocument();
      const calls = mutationCalls();
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toBe("/api/abandoned-checkouts/draft-1/convert");
      expect(calls[0][1]?.method).toBe("POST");
      expect(JSON.parse(calls[0][1]?.body ?? "{}").status).toBe("approved");
    });

    it("saves edits then converts to Pending, in that order", async () => {
      mockMutations();
      const user = userEvent.setup();
      renderDetail();
      expect((await screen.findAllByText("Abandoned Customer")).length).toBeGreaterThan(0);

      await editName(user);
      await user.click(screen.getByRole("button", { name: "Pending" }));
      await user.click(screen.getByRole("button", { name: "Save & move to Pending" }));

      expect(await screen.findByTestId("dashboard-home")).toBeInTheDocument();
      const calls = mutationCalls();
      expect(calls.map(([url]) => url)).toEqual([
        "/api/abandoned-checkouts/draft-1",
        "/api/abandoned-checkouts/draft-1/convert",
      ]);
      const body = JSON.parse(calls[1][1]?.body ?? "{}");
      expect(body.status).toBe("pending");
      expect(body.customer_name).toBe("Edited Name");
    });

    it("blocks On hold without a reason and sends nothing", async () => {
      mockMutations();
      const user = userEvent.setup();
      renderDetail();
      expect((await screen.findAllByText("Abandoned Customer")).length).toBeGreaterThan(0);

      await user.click(screen.getByRole("button", { name: "On hold" }));
      await user.click(screen.getByRole("button", { name: "Save & move to On hold" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Choose a hold reason");
      expect(mutationCalls().length).toBe(0);
    });

    it("stays on the page and says edits were saved when the move fails", async () => {
      mockMutations(() => jsonResponse({ error: "Boom" }, { ok: false, status: 400 }));
      const user = userEvent.setup();
      renderDetail();
      expect((await screen.findAllByText("Abandoned Customer")).length).toBeGreaterThan(0);

      await editName(user);
      await user.click(screen.getByRole("button", { name: "Pending" }));
      await user.click(screen.getByRole("button", { name: "Save & move to Pending" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Your edits were saved");
      expect(screen.queryByTestId("dashboard-home")).not.toBeInTheDocument();
    });

    it("does not submit on Ctrl+Enter while typing in the customer form", async () => {
      mockMutations();
      const user = userEvent.setup();
      renderDetail();
      expect((await screen.findAllByText("Abandoned Customer")).length).toBeGreaterThan(0);

      await user.click(screen.getByRole("button", { name: "Pending" }));
      await user.click(screen.getByRole("button", { name: /edit customer/i }));
      await user.type(screen.getByLabelText("Customer name"), " Jr");
      await user.keyboard("{Control>}{Enter}{/Control}");

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(mutationCalls().length).toBe(0);
      expect(screen.queryByTestId("dashboard-home")).not.toBeInTheDocument();
    });

    it("keeps the page open and shows the server error when convert returns 409", async () => {
      mockMutations(() => jsonResponse({ error: "Checkout phone is no longer valid" }, { ok: false, status: 409 }));
      const user = userEvent.setup();
      renderDetail();
      expect((await screen.findAllByText("Abandoned Customer")).length).toBeGreaterThan(0);

      await user.click(screen.getByRole("button", { name: "Pending" }));
      await user.click(screen.getByRole("button", { name: "Save & move to Pending" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Checkout phone is no longer valid");
      expect(screen.queryByTestId("dashboard-home")).not.toBeInTheDocument();
    });

    it("sends the chosen hold reason for On hold", async () => {
      mockMutations();
      const user = userEvent.setup();
      renderDetail();
      expect((await screen.findAllByText("Abandoned Customer")).length).toBeGreaterThan(0);

      await user.click(screen.getByRole("button", { name: "On hold" }));
      await user.click(screen.getByRole("button", { name: /Hold reason/ }));
      await user.click(await screen.findByRole("option", { name: "Customer asked to be contacted later" }));
      await user.click(screen.getByRole("button", { name: "Save & move to On hold" }));

      expect(await screen.findByTestId("dashboard-home")).toBeInTheDocument();
      const body = JSON.parse(mutationCalls()[0][1]?.body ?? "{}");
      expect(body.status).toBe("on_hold");
      expect(body.hold_reason_code).toBe("contact_later");
    });

    it("sends null hold fields for Pending", async () => {
      mockMutations();
      const user = userEvent.setup();
      renderDetail();
      expect((await screen.findAllByText("Abandoned Customer")).length).toBeGreaterThan(0);

      await user.click(screen.getByRole("button", { name: "Pending" }));
      await user.click(screen.getByRole("button", { name: "Save & move to Pending" }));

      expect(await screen.findByTestId("dashboard-home")).toBeInTheDocument();
      const body = JSON.parse(mutationCalls()[0][1]?.body ?? "{}");
      expect(body.hold_reason_code).toBeNull();
      expect(body.hold_reason_detail).toBeNull();
      expect(body.hold_until_date).toBeNull();
    });

    it("dismisses after confirmation and warns about unsaved changes", async () => {
      mockMutations();
      const user = userEvent.setup();
      renderDetail();
      expect((await screen.findAllByText("Abandoned Customer")).length).toBeGreaterThan(0);

      await editName(user);
      await user.click(screen.getByRole("button", { name: "Dismiss" }));
      expect(await screen.findByText(/unsaved changes will be lost/i)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Dismiss checkout" }));

      expect(await screen.findByTestId("dashboard-home")).toBeInTheDocument();
      const calls = mutationCalls();
      expect(calls.length).toBe(1);
      const body = JSON.parse(calls[0][1]?.body ?? "{}");
      expect(body.action).toBe("dismissed");
      expect(Object.keys(body).every((key) => key === "action" || key === "activity_group_id")).toBe(true);
    });
  });

  it("exposes the cart region without the empty status-select grid cell breaking layout", async () => {
    renderDetail();
    expect((await screen.findAllByText("Abandoned Customer")).length).toBeGreaterThan(0);
    const cart = screen.getByRole("region", { name: /order cart/i });
    expect(within(cart).queryByRole("button", { name: /order status/i })).not.toBeInTheDocument();
  });
});

describe("AbandonedDetail pending-order banner", () => {
  const order = (status: string) => ({
    id: "order-9", order_number: "1009", phone: "+8801712345678", status,
    fulfillment_status: null, created_at: "2026-09-10T12:00:00.000Z",
  });
  const mockOrders = (orders: unknown[]) => {
    apiFetch.mockReset();
    apiFetch.mockImplementation(async (url: string) => {
      if (url === "/api/abandoned-checkouts") return jsonResponse({ checkouts: [draft], activeCount: 1 });
      if (url === "/api/products") return jsonResponse({ products: [] });
      if (url.startsWith("/api/orders")) return jsonResponse({ orders, totalCount: orders.length, syncedAt: null });
      return jsonResponse({});
    });
  };

  it("links to the customer's order that is already in Pending", async () => {
    mockOrders([order("pending")]);
    renderDetail();

    const link = await screen.findByRole("link", { name: "#1009" });
    expect(link).toHaveAttribute("href", "/orders/order-9");
    const banner = link.closest("[role='status']");
    expect(banner).toHaveTextContent("Already ordered — #1009 is waiting in Pending. Check it before contacting or moving this checkout.");
  });

  it("lists every pending order when there are several", async () => {
    mockOrders([order("pending"), { ...order("pending"), id: "order-10", order_number: "#1010" }]);
    renderDetail();

    const second = await screen.findByRole("link", { name: "#1010" });
    expect(second).toHaveAttribute("href", "/orders/order-10");
    expect(screen.getByRole("link", { name: "#1009" })).toHaveAttribute("href", "/orders/order-9");
    expect(second.closest("[role='status']")).toHaveTextContent("Already ordered — 2 orders are waiting in Pending: #1009, #1010.");
  });

  it("shows no banner when the matching order is in another tab", async () => {
    mockOrders([order("approved")]);
    const client = renderDetail();

    expect((await screen.findAllByText("Abandoned Customer")).length).toBeGreaterThan(0);
    await waitFor(() => expect(client.getQueryState(["/api/orders"])?.status).toBe("success"));
    expect(client.getQueryData(["/api/orders"])).toHaveLength(1);
    expect(screen.queryByText("Already ordered")).not.toBeInTheDocument();
  });

  it("follows the live phone draft and hides the banner when the phone is cleared", async () => {
    mockOrders([order("pending")]);
    const user = userEvent.setup();
    renderDetail();

    expect(await screen.findByRole("link", { name: "#1009" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /edit customer/i }));
    await user.clear(screen.getByLabelText("Phone"));
    await user.click(screen.getByRole("button", { name: "Apply customer changes" }));

    await waitFor(() => expect(screen.queryByText("Already ordered")).not.toBeInTheDocument());
  });
});
