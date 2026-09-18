import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/components/DateRangePicker", () => ({
  DateRangePicker: ({ onChange }: { onChange: (range: { from: Date; to: Date } | null) => void }) => (
    <button type="button" onClick={() => onChange(null)}>All time</button>
  ),
}));

import { apiFetch } from "@/lib/api";
import type { StaffMetrics, StaffRow } from "@/lib/staffPerformancePresentation";
import StaffPerformance from "@/pages/StaffPerformance";

const RafiId = "11111111-1111-1111-1111-111111111111";
const NadiaId = "22222222-2222-2222-2222-222222222222";

type StaffReportResponse = {
  range: { from: string | null; to: string | null };
  available_staff: Array<{ user_id: string; display_name: string; is_active: boolean }>;
  selected_user_ids: string[];
  rows: StaffRow[];
  missing_weight_products: Array<{ id: string; name: string }>;
};

function metrics(overrides: Partial<StaffMetrics> = {}): StaffMetrics {
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

function reportRow({
  user_id = RafiId,
  display_name = "Rafi",
  is_active = true,
  orders = metrics({ products: [{ product_id: "p1", product_name: "Mango", packs: 2, kg: 2 }] }),
  social_inbox_orders = metrics({
    assigned_count: 0,
    confirmation_rate: null,
    cancellation_rate: null,
    telesales_confirmed_count: 0,
    telesales_confirmed_value: 0,
    telesales_confirmed_kg: 0,
  }),
}: Partial<StaffRow> = {}): StaffRow {
  return { user_id, display_name, is_active, orders, social_inbox_orders };
}

function reportResponse(overrides: Partial<StaffReportResponse> = {}): StaffReportResponse {
  return {
    range: { from: "2026-09-01", to: "2026-09-18" },
    available_staff: [
      { user_id: RafiId, display_name: "Rafi", is_active: true },
      { user_id: NadiaId, display_name: "Nadia", is_active: false },
    ],
    selected_user_ids: [RafiId, NadiaId],
    rows: [
      reportRow(),
      reportRow({
        user_id: NadiaId,
        display_name: "Nadia",
        is_active: false,
        orders: metrics({ assigned_count: 0, confirmed_count: 0, products: [] }),
        social_inbox_orders: metrics({ assigned_count: 0, confirmation_rate: null, cancellation_rate: null }),
      }),
    ],
    missing_weight_products: [{ id: "p2", name: "Green Mango" }],
    ...overrides,
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

  it("ranks regular-order staff cards by confirmed value without rendering Social Inbox", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [
        reportRow({
          user_id: NadiaId,
          display_name: "Nadia",
          is_active: false,
          orders: metrics({ confirmed_value: 900, confirmed_count: 1, products: [] }),
        }),
        reportRow({
          orders: metrics({ confirmed_value: 1800, confirmed_count: 2 }),
          social_inbox_orders: metrics({ confirmed_value: 999999 }),
        }),
      ],
    })));

    renderPage();

    expect(await screen.findByRole("heading", { name: "Staff Performance" })).toBeInTheDocument();
    expect(screen.getByText("Confirmed value")).toBeInTheDocument();
    expect(screen.getByText("Confirmed orders")).toBeInTheDocument();
    expect(screen.queryByText("Social Inbox")).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/staff-performance-card-/).map((card) => card.dataset.testid)).toEqual([
      `staff-performance-card-${RafiId}`,
      `staff-performance-card-${NadiaId}`,
    ]);
    expect(screen.getByText("Nadia · Former staff")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review products" })).toHaveAttribute("href", "/products");
  });

  it("expands regular-order staff details inline", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse()));
    const user = userEvent.setup();

    renderPage();

    await screen.findByRole("heading", { name: "Staff Performance" });
    await user.click(screen.getByRole("button", { name: "Show details for Rafi" }));

    expect(screen.getByRole("button", { name: "Hide details for Rafi" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Mango")).toBeInTheDocument();
    expect(screen.getByText("2 packs · 2 kg")).toBeInTheDocument();
  });

  it("shows weighted regular-order rates in the team snapshot", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [
        reportRow({
          orders: metrics({
            assigned_count: 2,
            confirmed_assigned_count: 2,
            confirmed_count: 2,
            delivered_count: 2,
          }),
        }),
        reportRow({
          user_id: NadiaId,
          display_name: "Nadia",
          orders: metrics({
            assigned_count: 8,
            confirmed_assigned_count: 4,
            confirmed_count: 4,
            delivered_count: 1,
          }),
        }),
      ],
    })));

    renderPage();

    expect(await screen.findByTestId("staff-performance-summary-confirmation-rate")).toHaveTextContent("60%");
    expect(screen.getByTestId("staff-performance-summary-delivered-rate")).toHaveTextContent("50%");
  });

  it("keeps the missing-weight warning compact and readable for a large catalog", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      missing_weight_products: [
        { id: "p1", name: "Alpha Mango" },
        { id: "p2", name: "Beta Mango" },
        { id: "p3", name: "Gamma Mango" },
        { id: "p4", name: "Delta Mango" },
      ],
    })));

    renderPage();

    expect(await screen.findByText(/4 products are missing a catalog weight: Alpha Mango, Beta Mango, Gamma Mango, and 1 more/)).toBeInTheDocument();
    expect(screen.queryByText(/Delta Mango/)).not.toBeInTheDocument();
    expect(screen.getByText(/Human-attributed regular-order performance/)).toHaveClass("text-black/60");
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

  it("removes date parameters when the date picker switches to all time", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse()));
    const user = userEvent.setup();

    renderPage();

    await screen.findByRole("heading", { name: "Staff Performance" });
    await user.click(screen.getByRole("button", { name: "All time" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenLastCalledWith("/api/reports/staff");
    });
  });

  it("restores the all-staff query after clearing a narrowed staff filter", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse()));
    const user = userEvent.setup();

    renderPage();

    await screen.findByRole("heading", { name: "Staff Performance" });
    await user.click(screen.getByRole("button", { name: "Filter staff" }));
    await user.click(screen.getByRole("checkbox", { name: "Rafi" }));
    await waitFor(() => {
      expect(apiFetch).toHaveBeenLastCalledWith(expect.stringContaining(`users=${RafiId}`));
    });

    await user.click(screen.getByRole("button", { name: "Filter staff" }));
    await user.click(screen.getByRole("button", { name: "All staff" }));
    await waitFor(() => {
      expect(apiFetch).toHaveBeenLastCalledWith(expect.not.stringContaining("users="));
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
