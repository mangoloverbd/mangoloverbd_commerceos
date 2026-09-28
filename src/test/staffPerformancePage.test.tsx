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
    handled_count: 1,
    handled_confirmed_count: 1,
    handled_confirmed_value: 1200,
    handled_confirmed_kg: 2,
    handled_cancelled_count: 0,
    handled_cancelled_value: 0,
    handled_delivered_count: 1,
    handled_delivered_value: 1200,
    handled_returned_count: 0,
    handled_returned_value: 0,
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

const NO_OUTCOMES = {
  delivered_packs: 0, delivered_kg: 0, returned_packs: 0, returned_kg: 0, cancelled_packs: 0, cancelled_kg: 0,
};

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
  orders = metrics({ products: [{ product_id: "p1", product_name: "Mango", packs: 2, kg: 2, ...NO_OUTCOMES }] }),
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

  it("shows the extra revenue tile and a sparkline on every summary tile", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      series: { granularity: "day", buckets: [
        { key: "2026-09-17", label: "Sep 17", confirmed_count: 1, confirmed_value: 500, handled_count: 2, handled_confirmed_count: 1, handled_delivered_count: 1, extra_value: 200 },
        { key: "2026-09-18", label: "Sep 18", confirmed_count: 2, confirmed_value: 900, handled_count: 2, handled_confirmed_count: 2, handled_delivered_count: 1, extra_value: 0 },
      ] },
    })));

    renderPage();

    const extra = await screen.findByTestId("staff-performance-summary-extra-revenue");
    expect(extra).toHaveTextContent("৳2,400"); // Rafi and Nadia each have telesales ৳1,200 in the default fixture; no upsell or carts
    expect(within(screen.getByTestId("staff-performance-summary-confirmed-value")).getByRole("img", { name: "Confirmed value trend" })).toBeInTheDocument();
    expect(within(screen.getByTestId("staff-performance-summary-confirmation-rate")).getByRole("img", { name: "Confirmation rate trend" })).toBeInTheDocument();
    expect(within(screen.getByTestId("staff-performance-summary-delivered-rate")).getByRole("img", { name: "Delivered rate trend" })).toBeInTheDocument();
    expect(within(screen.getByTestId("staff-performance-summary-extra-revenue")).getByRole("img", { name: "Extra revenue trend" })).toBeInTheDocument();
  });

  it("renders the leaderboard, order yield, funnel, contribution and extra revenue panels", async () => {
    // Default rows tie at ৳1,200 (name tiebreak ranks Nadia first), so give Rafi the clear lead.
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [
        reportRow({ orders: metrics({ confirmed_value: 1800, handled_confirmed_value: 1800 }) }),
        reportRow({ user_id: NadiaId, display_name: "Nadia", is_active: false, orders: metrics({ confirmed_value: 900, handled_confirmed_value: 900, products: [] }) }),
      ],
    })));

    renderPage();

    expect(await screen.findByRole("region", { name: "Confirmed value by staff" })).toBeInTheDocument();
    expect(screen.getByText("Top this period").closest("section")).toHaveTextContent("Rafi");
    expect(screen.getByRole("region", { name: "Where every handled order ended up" })).toBeInTheDocument();
    expect(screen.getByText("Handled = orders a member confirmed or cancelled")).toBeInTheDocument();
    const funnel = screen.getByRole("region", { name: "From handled to delivered" });
    expect(within(funnel).getByText("Handled")).toBeInTheDocument();
    expect(within(funnel).queryByText(/cancelled\)$/)).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Team contribution" })).toHaveTextContent("Rafi");
    expect(screen.getByRole("region", { name: "Telesales, upsells and saved carts" })).toBeInTheDocument();
  });

  it("keeps the three middle cards the same height and scrolls the long confirmation list inside its card", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse()));

    renderPage();

    const funnel = await screen.findByRole("region", { name: "From handled to delivered" });
    const row = funnel.parentElement as HTMLElement;
    expect(row).toHaveClass("lg:h-[520px]");
    expect(within(row).getByRole("region", { name: "Team contribution" })).toHaveClass("lg:h-full");
    expect(within(row).getByRole("region", { name: "Telesales, upsells and saved carts" })).toHaveClass("lg:h-full");
    expect(funnel).toHaveClass("lg:h-full");
    expect(within(funnel).getByRole("list", { name: "Confirmation rate by staff" })).toHaveClass("overflow-y-auto");
  });

  it("lists extra revenue per member, largest first, under a per-source summary", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [
        reportRow({ orders: metrics({ telesales_confirmed_value: 3000, retained_upsell_value: 500 }) }),
        reportRow({ user_id: NadiaId, display_name: "Nadia", orders: metrics({ telesales_confirmed_value: 0 }), abandoned_checkouts: { contacted_count: 0, dismissed_count: 0, reopened_count: 0, converted_count: 1, converted_value: 800 } }),
      ],
    })));

    renderPage();

    const panel = await screen.findByRole("region", { name: "Telesales, upsells and saved carts" });
    const summary = within(panel).getByRole("list", { name: "Extra revenue by source" });
    expect(within(summary).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Telesales৳3,000",
      "Upsell kept৳500",
      "Carts converted৳800",
    ]);
    const members = within(panel).getByRole("list", { name: "Extra revenue by staff" });
    expect(within(members).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Rafi৳3,500", "Nadia৳800"]);
    expect(members).toHaveClass("overflow-y-auto");
  });

  it("keeps funnel labels on one line and shows a zero count beside its empty bar", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [reportRow({ orders: metrics({ handled_count: 10, handled_confirmed_count: 9, handled_delivered_count: 0, handled_returned_count: 0 }) })],
    })));

    renderPage();

    const funnel = await screen.findByRole("region", { name: "From handled to delivered" });
    expect(within(funnel).getByText("Confirmed, not cancelled")).toHaveClass("whitespace-nowrap");
    const delivered = within(funnel).getByTestId("staff-funnel-step-delivered");
    expect(within(delivered).getByText("0")).toHaveClass("text-black");
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
        reportRow({ user_id: NadiaId, display_name: "Nadia", is_active: false, orders: metrics({ confirmed_value: 900, handled_confirmed_value: 900, products: [] }) }),
        reportRow({ orders: metrics({ confirmed_value: 1800, handled_confirmed_value: 1800, confirmed_count: 2 }), social_inbox_orders: metrics({ confirmed_value: 999999 }) }),
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
        orders: metrics({ retained_upsell_count: 2, retained_upsell_value: 600, products: [{ product_id: "p1", product_name: "Mango", packs: 2, kg: 2, ...NO_OUTCOMES }] }),
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
    expect(within(detail).getByRole("table", { name: "Rafi products by outcome" })).toHaveTextContent("Mango");

    await user.click(within(row).getByRole("button", { name: "Hide details for Rafi" }));
    expect(within(row).getByRole("button", { name: "Show details for Rafi" })).toHaveAttribute("aria-expanded", "false");
  });

  it("sorts the table when a column header is clicked and expands everyone at once", async () => {
    const user = userEvent.setup();
    // Distinct values so the default order (Rafi first by confirmed value) differs from the name sort (Nadia first).
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [
        reportRow({ orders: metrics({ confirmed_value: 1800, handled_confirmed_value: 1800 }) }),
        reportRow({ user_id: NadiaId, display_name: "Nadia", is_active: false, orders: metrics({ confirmed_value: 900, handled_confirmed_value: 900, products: [] }) }),
      ],
    })));

    renderPage();

    const table = await screen.findByRole("table", { name: "Team performance" });
    expect(within(table).getAllByTestId(/^staff-performance-row-/)[0]).toHaveAttribute("data-testid", `staff-performance-row-${RafiId}`);
    const staffHeader = within(table).getByRole("button", { name: /^Staff/ });
    await user.click(staffHeader);
    expect(within(table).getAllByTestId(/^staff-performance-row-/)[0]).toHaveAttribute("data-testid", `staff-performance-row-${NadiaId}`);
    expect(staffHeader.closest("th")).toHaveAttribute("aria-sort", "ascending");

    await user.click(screen.getByRole("button", { name: "Expand all" }));
    expect(within(table).getByRole("button", { name: "Hide details for Rafi" })).toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "Hide details for Nadia" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse all" })).toBeInTheDocument();
  });

  it("builds the detail's orders-handled card from confirmed and cancelled work, matching the outcome mix", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [reportRow({
        orders: metrics({
          handled_count: 10,
          handled_confirmed_count: 5,
          handled_confirmed_value: 6000,
          handled_cancelled_count: 5,
          handled_cancelled_value: 1500,
          handled_delivered_count: 3,
          handled_delivered_value: 3000,
          handled_returned_count: 1,
          handled_returned_value: 900,
          // Per-activity and assigned counters must not drive the card.
          confirmed_count: 7,
          cancelled_count: 9,
          confirmed_value: 99999,
          delivered_value: 88888,
          returned_value: 77777,
          cancelled_value: 66666,
          assigned_count: 2,
          confirmed_assigned_count: 1,
          cancelled_assigned_count: 0,
        }),
      })],
    })));

    renderPage();

    const row = await screen.findByTestId(`staff-performance-row-${RafiId}`);
    await user.click(within(row).getByRole("button", { name: "Show details for Rafi" }));
    const card = within(screen.getByRole("region", { name: "Rafi details" })).getByText("Orders handled").parentElement;
    if (!card) throw new Error("Orders handled card is missing");
    expect(within(card).getByText("Handled").closest("p")).toHaveTextContent(/^Handled10$/);
    // Confirmed, not cancelled = 5; open = 5 - 3 delivered - 1 RTO = 1
    expect(within(card).getByText("Confirmed, not cancelled").closest("p")).toHaveTextContent(/^Confirmed, not cancelled5 · ৳6,000$/);
    expect(within(card).getByText("Delivered").closest("p")).toHaveTextContent(/^Delivered3 · ৳3,000$/);
    expect(within(card).getByText("Open / in transit").closest("p")).toHaveTextContent(/^Open \/ in transit1$/);
    expect(within(card).getByText("RTO").closest("p")).toHaveTextContent(/^RTO1 · ৳900$/);
    expect(within(card).getByText("Cancelled").closest("p")).toHaveTextContent(/^Cancelled5 · ৳1,500$/);
    expect(within(card).queryByText("Not confirmed")).not.toBeInTheDocument();
  });

  it("measures a website-order handler by orders handled, not by assignment", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [reportRow({
        orders: metrics({
          assigned_count: 39,
          confirmed_assigned_count: 39,
          cancelled_assigned_count: 0,
          handled_count: 340,
          handled_confirmed_count: 328,
          handled_cancelled_count: 12,
          handled_delivered_count: 300,
          handled_returned_count: 10,
          confirmed_count: 331,
          cancelled_count: 15,
          delivered_count: 300,
          returned_count: 10,
        }),
      })],
    })));

    renderPage();

    const row = await screen.findByTestId(`staff-performance-row-${RafiId}`);
    const cells = within(row).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent(/^340$/); // Handled column
    expect(cells[2]).toHaveTextContent(/^328$/); // Confirmed column = handled_confirmed
    expect(cells[6]).toHaveTextContent(/^3\.5%$/); // Cancel rate = 12 / 340
    expect(cells[5]).toHaveTextContent(/^96\.5%$/); // Conf. rate = 328 / 340
    expect(screen.getByText("Conf. rate = confirmed ÷ handled · Delivered = delivered ÷ confirmed · Handled = orders confirmed or cancelled (each order counted once, by the member's last action)")).toBeInTheDocument();
    await user.click(within(row).getByRole("button", { name: "Show details for Rafi" }));
    const card = within(screen.getByRole("region", { name: "Rafi details" })).getByText("Orders handled").parentElement;
    if (!card) throw new Error("Orders handled card is missing");
    expect(within(card).getByText("Cancelled").closest("p")).toHaveTextContent(/^Cancelled12/);
  });

  it("lists products by outcome, including a product that was only cancelled, and flags high loss", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [reportRow({
        orders: metrics({
          products: [
            { product_id: "p1", product_name: "Mango", packs: 5, kg: 10, delivered_packs: 4, delivered_kg: 8, returned_packs: 1, returned_kg: 1, cancelled_packs: 0, cancelled_kg: 0 },
            { product_id: "p2", product_name: "Honey", packs: 0, kg: 0, delivered_packs: 0, delivered_kg: 0, returned_packs: 0, returned_kg: 0, cancelled_packs: 1, cancelled_kg: 0.5 },
          ],
        }),
      })],
    })));

    renderPage();

    const row = await screen.findByTestId(`staff-performance-row-${RafiId}`);
    await user.click(within(row).getByRole("button", { name: "Show details for Rafi" }));
    const detail = screen.getByRole("region", { name: "Rafi details" });
    expect(within(detail).getByText("Products by outcome · Rafi")).toBeInTheDocument();
    const table = within(detail).getByRole("table", { name: "Rafi products by outcome" });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Product", "Confirmed", "Delivered", "RTO", "Cancelled", "Loss"]);

    const honey = within(table).getByText("Honey").closest("tr") as HTMLElement;
    const [confirmed, , , cancelled, honeyLoss] = within(honey).getAllByRole("cell");
    expect(confirmed).toHaveTextContent(/^—$/);
    expect(cancelled).toHaveTextContent(/^1 · 0\.5 kg$/);
    expect(honeyLoss).toHaveTextContent(/^100%$/); // 0.5 / (0 + 0.5)
    expect(within(honeyLoss).getByText("100%")).toHaveAttribute("data-flag", "worse");

    const mango = within(table).getByText("Mango").closest("tr") as HTMLElement;
    const mangoCells = within(mango).getAllByRole("cell");
    expect(mangoCells[0]).toHaveTextContent(/^5 · 10 kg$/);
    expect(mangoCells[2]).toHaveTextContent(/^1 · 1 kg$/);
    expect(mangoCells[4]).toHaveTextContent(/^10%$/); // 1 / 10, below all-products 14.3% + 5
    expect(within(mangoCells[4]).queryByText("10%")).not.toHaveAttribute("data-flag");

    const total = within(table).getByText("All products").closest("tr") as HTMLElement;
    expect(within(total).getAllByRole("cell")[4]).toHaveTextContent(/^14\.3%$/); // 1.5 / 10.5
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
            handled_count: 2,
            handled_confirmed_count: 1,
            handled_delivered_count: 1,
            confirmed_count: 3,
            delivered_count: 9,
          }),
        }),
        reportRow({
          user_id: NadiaId,
          display_name: "Nadia",
          orders: metrics({
            handled_count: 8,
            handled_confirmed_count: 5,
            handled_delivered_count: 2,
            confirmed_count: 5,
            delivered_count: 9,
          }),
        }),
      ],
    })));

    renderPage();

    expect(await screen.findByTestId("staff-performance-summary-confirmation-rate")).toHaveTextContent("60%");
    expect(screen.getByTestId("staff-performance-summary-confirmation-rate")).toHaveTextContent("Of handled orders");
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

  it("defaults the report to today", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse()));

    renderPage();

    await screen.findByRole("heading", { name: "Staff Performance" });
    const firstUrl = String(vi.mocked(apiFetch).mock.calls[0][0]);
    const params = new URL(firstUrl, "http://local").searchParams;
    expect(params.get("from")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(params.get("to")).toBe(params.get("from"));
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
