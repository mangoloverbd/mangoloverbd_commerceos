import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/components/DateRangePicker", () => ({
  DateRangePicker: () => <button type="button">Date range</button>,
}));

import { apiFetch } from "@/lib/api";
import StaffPerformance from "@/pages/StaffPerformance";

const RafiId = "11111111-1111-1111-1111-111111111111";
const NadiaId = "22222222-2222-2222-2222-222222222222";

function metrics(overrides: Record<string, unknown> = {}) {
  return {
    assigned_count: 2,
    confirmed_count: 1,
    confirmed_assigned_count: 1,
    confirmed_value: 1200,
    confirmed_kg: 2,
    confirmation_rate: 0.5,
    average_order_value: 1200,
    cancelled_count: 0,
    cancelled_assigned_count: 0,
    cancelled_value: 0,
    cancellation_rate: 0,
    delivered_count: 1,
    delivered_value: 1200,
    delivered_rate: 1,
    returned_count: 0,
    returned_value: 0,
    telesales_confirmed_count: 1,
    telesales_confirmed_value: 1200,
    telesales_confirmed_kg: 2,
    products: [],
    ...overrides,
  };
}

function reportResponse() {
  return {
    range: { from: "2026-09-01", to: "2026-09-18" },
    available_staff: [
      { user_id: RafiId, display_name: "Rafi", is_active: true },
      { user_id: NadiaId, display_name: "Nadia", is_active: false },
    ],
    selected_user_ids: [RafiId, NadiaId],
    rows: [
      {
        user_id: RafiId,
        display_name: "Rafi",
        is_active: true,
        orders: metrics({ products: [{ product_id: "p1", product_name: "Mango", packs: 2, kg: 2 }] }),
        social_inbox_orders: metrics({
          assigned_count: 0,
          confirmation_rate: null,
          cancellation_rate: null,
          telesales_confirmed_count: 0,
          telesales_confirmed_value: 0,
          telesales_confirmed_kg: 0,
        }),
      },
      {
        user_id: NadiaId,
        display_name: "Nadia",
        is_active: false,
        orders: metrics({ assigned_count: 0, confirmed_count: 0, products: [] }),
        social_inbox_orders: metrics({ assigned_count: 0, confirmation_rate: null, cancellation_rate: null }),
      },
    ],
    missing_weight_products: [{ id: "p2", name: "Green Mango" }],
  };
}

function response(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

function renderPage(ui: ReactElement = <StaffPerformance />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("StaffPerformance", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("shows a loading state before the report arrives", () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}) as Promise<Response>);

    renderPage();

    expect(screen.getByText("Loading staff performance")).toBeInTheDocument();
  });

  it("renders separate regular and social tables, warns about missing weights, and expands products", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse()));
    const user = userEvent.setup();

    renderPage();

    expect(await screen.findByRole("heading", { name: "Staff Performance" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Orders" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Social Inbox" })).toBeInTheDocument();
    expect(screen.getAllByText("Nadia · Former staff").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Review products" })).toHaveAttribute("href", "/products");

    await user.click(screen.getByRole("button", { name: "Show order products for Rafi" }));

    expect(screen.getByText("Mango")).toBeInTheDocument();
    expect(screen.getByText("2 packs · 2 kg")).toBeInTheDocument();
  });

  it("requests a narrowed report after an admin selects one staff member", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse()));
    const user = userEvent.setup();

    renderPage();

    await screen.findByRole("heading", { name: "Staff Performance" });
    await user.click(screen.getByRole("button", { name: "Filter staff" }));
    await user.click(screen.getByRole("checkbox", { name: "Rafi" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenLastCalledWith(
        expect.stringContaining(`users=${RafiId}`),
      );
    });
  });

  it("offers retry after a failed request and recovers with the next response", async () => {
    vi.mocked(apiFetch)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(response(reportResponse()));
    const user = userEvent.setup();

    renderPage();

    expect(await screen.findByText("Could not load staff performance")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Staff Performance" })).toBeInTheDocument();
  });
});
