import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Dashboard from "@/pages/Dashboard";
import { Toaster } from "@/components/ui/sonner";

const apiFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({ apiFetch }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true, loading: false }) }));
vi.mock("@/hooks/useLiveVisitors", () => ({
  useLiveVisitors: () => ({ count: 0, details: { activeCarts: 0, checkingOut: 0, purchased: 0 }, visitors: [] }),
}));
vi.mock("@/hooks/useWarehouses", () => ({ useWarehouses: () => ({ warehouses: [] }) }));
vi.mock("@/components/home/DottedGlobe", () => ({ DottedGlobe: () => null }));
vi.mock("@/components/ui/glyph-matrix", () => ({ default: () => null }));
vi.mock("recharts", () => ({
  BarChart: () => null, Bar: () => null, Cell: () => null, ResponsiveContainer: () => null, Tooltip: () => null,
}));
vi.mock("@/components/OrdersTable", () => ({ OrdersTable: () => <div data-testid="dashboard-orders" /> }));

type Checkout = Record<string, unknown> & { id: string; status: string; customer_name: string; phone: string };

function draft(id: string, customer_name: string, phone: string, extra: Record<string, unknown> = {}): Checkout {
  return {
    id,
    status: "open",
    customer_name,
    phone,
    address: "House 1, Road 2, Dhaka",
    cart: [{ productName: "Sundarbans Honey", variantName: "1 kg", quantity: 1, unitPrice: 750 }],
    subtotal: 750,
    delivery_rate: 100,
    total: 850,
    source: "storefront",
    source_path: "/checkout",
    campaign: {},
    contacted_at: null,
    created_at: "2026-11-01T06:00:00.000Z",
    updated_at: "2026-11-01T06:00:00.000Z",
    ...extra,
  };
}

const ACTIVE_ID = "11111111-1111-4111-8111-111111111111";
const DISMISSED_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_DISMISSED_ID = "33333333-3333-4333-8333-333333333333";

// A small fake of the server: PATCH moves checkouts between the two lists.
let active: Checkout[];
let dismissed: Checkout[];

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 409, json: async () => body };
}

function matches(checkout: Checkout, search: string) {
  const needle = search.toLowerCase();
  return [checkout.customer_name, checkout.phone, checkout.address].some((value) => String(value).toLowerCase().includes(needle));
}

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem("autosync_done_user-1", "1");
  localStorage.clear();
  active = [draft(ACTIVE_ID, "Active Ayesha", "01711111111")];
  dismissed = [
    draft(DISMISSED_ID, "Dismissed Rahima", "01722222222", {
      status: "dismissed", resolution: "dismissed", resolved_at: "2026-11-09T09:15:00.000Z", dismissed_by: "Rahim",
    }),
    draft(OTHER_DISMISSED_ID, "Auto Kamal", "01733333333", {
      status: "dismissed", resolution: "already_ordered", resolved_at: "2026-11-08T09:15:00.000Z", dismissed_by: null,
    }),
  ];
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
    if (url === "/api/orders") return jsonResponse({ orders: [] });
    if (url === "/api/abandoned-checkouts") return jsonResponse({ checkouts: active, activeCount: active.length });
    if (url.startsWith("/api/abandoned-checkouts/dismissed")) {
      const search = new URL(url, "http://local").searchParams.get("search") || "";
      return jsonResponse({ checkouts: dismissed.filter((checkout) => !search || matches(checkout, search)) });
    }
    const patch = /^\/api\/abandoned-checkouts\/([^/]+)$/.exec(url);
    if (patch && init?.method === "PATCH") {
      const { action } = JSON.parse(init.body || "{}");
      const id = patch[1];
      if (action === "open") {
        const found = dismissed.find((checkout) => checkout.id === id);
        if (!found) return jsonResponse({ error: "Checkout action is not allowed" }, false);
        dismissed = dismissed.filter((checkout) => checkout.id !== id);
        const restored = { ...found, status: "open", resolution: null, resolved_at: null, contacted_at: null };
        active = [restored, ...active];
        return jsonResponse({ checkout: restored });
      }
      if (action === "dismissed") {
        const found = active.find((checkout) => checkout.id === id)!;
        active = active.filter((checkout) => checkout.id !== id);
        const gone = { ...found, status: "dismissed", resolution: "dismissed", resolved_at: new Date().toISOString(), dismissed_by: "Me" };
        dismissed = [gone, ...dismissed];
        return jsonResponse({ checkout: gone });
      }
    }
    if (url === "/api/products") return jsonResponse({ products: [] });
    if (url.startsWith("/api/analytics")) {
      return jsonResponse({
        revenue: 0, shipping: 0, adSpend: 0, totalCog: 0, cogCoverage: { set: 0, total: 0 },
        profit: 0, fbConfigured: false, usdToBdt: 120, fbError: null,
      });
    }
    return jsonResponse({ updated: 0 });
  });
});

function CheckoutPage() {
  const { id } = useParams();
  return <p>Checkout page {id}</p>;
}

function renderDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/orders"]}>
        <Routes>
          <Route path="/orders" element={<Dashboard />} />
          <Route path="/abandoned/:id" element={<CheckoutPage />} />
        </Routes>
      </MemoryRouter>
      <Toaster />
    </QueryClientProvider>,
  );
}

async function openIncompleteTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("radio", { name: /^Abandoned:/ }));
  return screen.findByTestId("abandoned-view-toggle");
}

describe("Incomplete tab: Active | Dismissed", () => {
  it("switches between the Active and Dismissed lists, each with its count", async () => {
    const user = userEvent.setup();
    renderDashboard();
    const toggle = await openIncompleteTab(user);

    await waitFor(() => {
      expect(within(toggle).getByRole("radio", { name: /Active\s*1/ })).toHaveAttribute("aria-checked", "true");
      expect(within(toggle).getByRole("radio", { name: /Dismissed\s*2/ })).toBeInTheDocument();
    });
    expect(await screen.findByTestId("abandoned-checkout-queue")).toHaveTextContent("Active Ayesha");

    await user.click(within(toggle).getByRole("radio", { name: /Dismissed/ }));
    const list = await screen.findByTestId("dismissed-checkout-list");
    expect(list).toHaveTextContent("Dismissed Rahima");
    expect(list).toHaveTextContent(/Dismissed · 9 Nov, \d+:15 [AP]M · by Rahim/);
    expect(list).toHaveTextContent("auto: already ordered");
    expect(screen.queryByTestId("abandoned-checkout-queue")).not.toBeInTheDocument();
    // Update Status stays visible on the Incomplete tab; nothing is selectable in Dismissed.
    expect(screen.getByTestId("button-bulk-abandoned-status")).toBeDisabled();
  });

  it("restores a dismissed checkout with PATCH action open and drops it from Dismissed", async () => {
    const user = userEvent.setup();
    renderDashboard();
    const toggle = await openIncompleteTab(user);
    await user.click(within(toggle).getByRole("radio", { name: /Dismissed/ }));
    await screen.findByText("Dismissed Rahima");

    await user.click(screen.getByRole("button", { name: "Restore checkout for Dismissed Rahima" }));

    expect(apiFetch).toHaveBeenCalledWith(`/api/abandoned-checkouts/${DISMISSED_ID}`, expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ action: "open" }),
    }));
    await waitFor(() => expect(screen.queryByText("Dismissed Rahima")).not.toBeInTheDocument());
    await waitFor(() => expect(within(toggle).getByRole("radio", { name: /Active\s*2/ })).toBeInTheDocument());
  });

  it("Create order restores the checkout and then opens its detail page", async () => {
    const user = userEvent.setup();
    renderDashboard();
    const toggle = await openIncompleteTab(user);
    await user.click(within(toggle).getByRole("radio", { name: /Dismissed/ }));
    await screen.findByText("Dismissed Rahima");

    await user.click(screen.getByRole("button", { name: "Create order for Dismissed Rahima" }));

    expect(await screen.findByText(`Checkout page ${DISMISSED_ID}`)).toBeInTheDocument();
    const patchCalls = apiFetch.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patchCalls).toEqual([[`/api/abandoned-checkouts/${DISMISSED_ID}`, expect.objectContaining({ body: JSON.stringify({ action: "open" }) })]]);
  });

  it("shows matching dismissed checkouts below the active results while searching", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await openIncompleteTab(user);
    await screen.findByText("Active Ayesha");
    expect(screen.queryByTestId("dismissed-checkout-matches")).not.toBeInTheDocument();

    await user.type(screen.getByTestId("input-search-orders"), "01722");

    const matchesSection = await screen.findByTestId("dismissed-checkout-matches");
    expect(matchesSection).toHaveTextContent("Dismissed Rahima");
    expect(matchesSection).not.toHaveTextContent("Auto Kamal");
    expect(screen.getByRole("heading", { name: "Dismissed" })).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/abandoned-checkouts/dismissed?search=01722");
    expect(within(matchesSection).getByRole("button", { name: "Restore checkout for Dismissed Rahima" })).toBeInTheDocument();
  });

  it("Undo in the dismiss toast restores the checkout", async () => {
    const user = userEvent.setup();
    renderDashboard();
    await openIncompleteTab(user);
    await screen.findByText("Active Ayesha");

    await user.click(screen.getByRole("button", { name: "Dismiss checkout" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("You can restore it from Dismissed for up to 30 days.");
    await user.click(within(dialog).getByRole("button", { name: "Confirm dismiss" }));

    await screen.findByText("Checkout dismissed");
    await waitFor(() => expect(screen.queryByText("Active Ayesha")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(apiFetch).toHaveBeenCalledWith(`/api/abandoned-checkouts/${ACTIVE_ID}`, expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ action: "open" }),
    }));
    expect(await screen.findByText("Active Ayesha")).toBeInTheDocument();
  });
});
