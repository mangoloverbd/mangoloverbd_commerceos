import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
const roleState = vi.hoisted(() => ({ isAdmin: true }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: roleState.isAdmin, role: roleState.isAdmin ? "admin" : "team_member" }) }));
vi.mock("@/components/DateRangePicker", () => ({
  DateRangePicker: ({ onChange }: { onChange: (range: { from: Date; to: Date } | null) => void }) => (
    <button type="button" onClick={() => onChange(null)}>All time</button>
  ),
}));
vi.mock("@/components/business-report/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}));

import { apiFetch } from "@/lib/api";
import type { AbandonedCartMetrics, StaffMetrics, StaffRow, StaffSeries } from "@/lib/staffPerformancePresentation";
import StaffPerformance from "@/pages/StaffPerformance";

const RafiId = "11111111-1111-1111-1111-111111111111";
const NadiaId = "22222222-2222-2222-2222-222222222222";

type StaffReportResponse = {
  range: { from: string | null; to: string | null };
  available_staff: Array<{ user_id: string; display_name: string; is_active: boolean }>;
  selected_user_ids: string[];
  rows: StaffRow[];
  missing_weight_products: Array<{ id: string; name: string }>;
  series: StaffSeries;
};

function metrics(overrides: Partial<StaffMetrics> = {}): StaffMetrics {
  return {
    assigned_count: 2,
    confirmed_count: 1,
    confirmed_assigned_count: 1,
    confirmed_assigned_delivered_count: 0,
    confirmed_assigned_returned_count: 0,
    confirmed_assigned_cancelled_count: 0,
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
    retained_upsell_count: 0,
    retained_upsell_value: 0,
    products: [],
    ...overrides,
  };
}

function abandonedMetrics(overrides: Partial<AbandonedCartMetrics> = {}): AbandonedCartMetrics {
  return {
    contacted_count: 0,
    dismissed_count: 0,
    reopened_count: 0,
    converted_count: 0,
    converted_value: 0,
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
  abandoned_checkouts = abandonedMetrics(),
}: Partial<StaffRow> = {}): StaffRow {
  return { user_id, display_name, is_active, orders, social_inbox_orders, abandoned_checkouts };
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
    series: { granularity: "day", buckets: [] },
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
    roleState.isAdmin = true;
  });

  it("blurs the team totals for staff but still shows every staff card", async () => {
    roleState.isAdmin = false;
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [reportRow(), reportRow({ user_id: NadiaId, display_name: "Nadia" })],
    })));

    renderPage();

    expect(await screen.findByTestId("staff-performance-summary-locked")).toBeInTheDocument();
    expect(screen.getByTestId("staff-performance-summary-confirmed-value").parentElement).toHaveClass("blur-[8px]");
    expect(within(screen.getByTestId(`staff-performance-row-${NadiaId}`)).getByText("Nadia")).toBeInTheDocument();
  });

  it("shows the team totals unblurred to admins", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse()));

    renderPage();

    expect(await screen.findByTestId("staff-performance-summary-confirmed-value")).toBeInTheDocument();
    expect(screen.queryByTestId("staff-performance-summary-locked")).not.toBeInTheDocument();
    expect(screen.getByTestId("staff-performance-summary-confirmed-value").parentElement).not.toHaveClass("blur-[8px]");
  });

  it("shows the extra revenue tile and sparklines on the value and count tiles", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      series: { granularity: "day", buckets: [
        { key: "2026-09-17", label: "Sep 17", confirmed_count: 1, confirmed_value: 500 },
        { key: "2026-09-18", label: "Sep 18", confirmed_count: 2, confirmed_value: 900 },
      ] },
    })));

    renderPage();

    const extra = await screen.findByTestId("staff-performance-summary-extra-revenue");
    expect(extra).toHaveTextContent("৳2,400"); // Rafi and Nadia each have telesales ৳1,200 in the default fixture; no upsell or carts
    expect(within(screen.getByTestId("staff-performance-summary-confirmed-value")).getByRole("img", { name: "Confirmed value trend" })).toBeInTheDocument();
    expect(within(screen.getByTestId("staff-performance-summary-confirmation-rate")).queryByRole("img")).not.toBeInTheDocument();
  });

  it("renders the leaderboard, order yield, funnel, contribution and extra revenue panels", async () => {
    // Default rows tie at ৳1,200 (name tiebreak ranks Nadia first), so give Rafi the clear lead.
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [
        reportRow({ orders: metrics({ confirmed_value: 1800 }) }),
        reportRow({ user_id: NadiaId, display_name: "Nadia", is_active: false, orders: metrics({ confirmed_value: 900, products: [] }) }),
      ],
    })));

    renderPage();

    expect(await screen.findByRole("region", { name: "Confirmed value by staff" })).toBeInTheDocument();
    expect(screen.getByText("Top this period").closest("section")).toHaveTextContent("Rafi");
    expect(screen.getByRole("region", { name: "Where every assigned order ended up" })).toBeInTheDocument();
    const funnel = screen.getByRole("region", { name: "From assigned to delivered" });
    expect(within(funnel).getByText("Assigned")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Team contribution" })).toHaveTextContent("Rafi");
    expect(screen.getByRole("region", { name: "Telesales, upsells and saved carts" })).toBeInTheDocument();
  });

  it("keeps the charts visible to team members while the tiles stay blurred", async () => {
    roleState.isAdmin = false;
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse()));

    renderPage();

    expect(await screen.findByTestId("staff-performance-summary-locked")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Confirmed value by staff" })).toBeInTheDocument();
  });

  it("shows a loading state before the report arrives", () => {
    vi.mocked(apiFetch).mockReturnValue(new Promise(() => {}) as Promise<Response>);

    renderPage();

    expect(screen.getByText("Loading staff performance")).toBeInTheDocument();
  });

  it("lists the team in a ranked table, most confirmed value first, without Social Inbox", async () => {
    // The default fixture ties both members at ৳1,200 (name tiebreak ranks Nadia first), so give Rafi the clear lead.
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [
        reportRow({ user_id: NadiaId, display_name: "Nadia", is_active: false, orders: metrics({ confirmed_value: 900, products: [] }) }),
        reportRow({ orders: metrics({ confirmed_value: 1800, confirmed_count: 2 }), social_inbox_orders: metrics({ confirmed_value: 999999 }) }),
      ],
    })));

    renderPage();

    const table = await screen.findByRole("table", { name: "Team performance" });
    const rows = within(table).getAllByTestId(/^staff-performance-row-/);
    expect(rows[0]).toHaveAttribute("data-testid", `staff-performance-row-${RafiId}`);
    expect(within(rows[1]).getByText(/Former staff/)).toBeInTheDocument();
    expect(screen.queryByText(/Social Inbox/i)).not.toBeInTheDocument();
  });

  it("opens a member's details when any part of the row is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [reportRow({
        orders: metrics({ retained_upsell_count: 2, retained_upsell_value: 600, products: [{ product_id: "p1", product_name: "Mango", packs: 2, kg: 2 }] }),
        abandoned_checkouts: abandonedMetrics({ contacted_count: 4, converted_count: 1, converted_value: 900 }),
      })],
    })));

    renderPage();

    const row = await screen.findByTestId(`staff-performance-row-${RafiId}`);
    await user.click(within(row).getAllByRole("cell")[2]);
    expect(within(row).getByRole("button", { name: "Hide details for Rafi" })).toHaveAttribute("aria-expanded", "true");
    const detail = screen.getByRole("region", { name: "Rafi details" });
    expect(within(detail).getByText("Upsell kept · 2 items")).toBeInTheDocument();
    expect(within(detail).getByText("Contacted").closest("p")).toHaveTextContent("4");
    expect(within(detail).getByRole("table", { name: "Rafi confirmed products" })).toHaveTextContent("Mango");

    await user.click(within(row).getByRole("button", { name: "Hide details for Rafi" }));
    expect(within(row).getByRole("button", { name: "Show details for Rafi" })).toHaveAttribute("aria-expanded", "false");
  });

  it("sorts the table when a column header is clicked and expands everyone at once", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse()));

    renderPage();

    const table = await screen.findByRole("table", { name: "Team performance" });
    await user.click(within(table).getByRole("button", { name: /^Staff/ }));
    expect(within(table).getAllByTestId(/^staff-performance-row-/)[0]).toHaveAttribute("data-testid", `staff-performance-row-${NadiaId}`);

    await user.click(screen.getByRole("button", { name: "Expand all" }));
    expect(within(table).getByRole("button", { name: "Hide details for Rafi" })).toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "Hide details for Nadia" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse all" })).toBeInTheDocument();
  });

  it("starts the page header directly with Staff Performance", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse()));

    renderPage();

    expect(await screen.findByRole("heading", { name: "Staff Performance" })).toBeInTheDocument();
    expect(screen.queryByText("Reports")).not.toBeInTheDocument();
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
