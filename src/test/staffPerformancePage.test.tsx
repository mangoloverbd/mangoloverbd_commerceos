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
import { StaffTable } from "@/components/staff-performance/StaffTable";

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
    sources: [],
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
    expect(screen.getByTestId("staff-performance-summary-confirmed-value")).toHaveTextContent("Approved in this period, each order once");
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

  it("draws order yield as tick-mark bars, best delivered share first, flagging members well below the team", async () => {
    const KarimId = "33333333-3333-3333-3333-333333333333";
    const SumiId = "44444444-4444-4444-4444-444444444444";
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [
        // 71 delivered, 9 open, 8 RTO, 12 cancelled of 100
        reportRow({ orders: metrics({ handled_count: 100, handled_confirmed_count: 88, handled_delivered_count: 71, handled_returned_count: 8, handled_cancelled_count: 12 }) }),
        // 9 delivered, 1 open of 10 -> 90%
        reportRow({ user_id: NadiaId, display_name: "Nadia", orders: metrics({ handled_count: 10, handled_confirmed_count: 10, handled_delivered_count: 9, handled_returned_count: 0, handled_cancelled_count: 0 }) }),
        // 10 delivered, 3 open, 2 RTO, 5 cancelled of 20 -> 50%, team is 90 / 130 = 69.2%
        reportRow({ user_id: KarimId, display_name: "Karim", orders: metrics({ handled_count: 20, handled_confirmed_count: 15, handled_delivered_count: 10, handled_returned_count: 2, handled_cancelled_count: 5 }) }),
        reportRow({ user_id: SumiId, display_name: "Sumi", orders: metrics({ handled_count: 0, handled_confirmed_count: 0, handled_delivered_count: 0, handled_returned_count: 0, handled_cancelled_count: 0 }) }),
      ],
    })));

    renderPage();

    const panel = await screen.findByRole("region", { name: "Where every handled order ended up" });
    const rows = within(panel).getAllByTestId(/^staff-yield-row-/);
    expect(rows.map((item) => item.getAttribute("data-testid"))).toEqual([
      `staff-yield-row-${NadiaId}`,
      `staff-yield-row-${RafiId}`,
      `staff-yield-row-${KarimId}`,
    ]);
    expect(within(panel).queryByTestId(`staff-yield-row-${SumiId}`)).not.toBeInTheDocument();
    expect(within(rows[0]).getByText("90%")).toBeInTheDocument();
    expect(within(rows[1]).getByText("71%")).not.toHaveClass("text-[#B4473A]");
    expect(within(rows[2]).getByText("50%")).toHaveClass("text-[#B4473A]");

    const rafiBar = within(rows[1]).getByRole("img");
    expect(rafiBar).toHaveAttribute("aria-label", "Rafi: Delivered 71%, Open / in transit 9%, RTO 8%, Cancelled 12% of 100 handled");
    expect(rafiBar).toHaveAttribute("title", "Rafi: Delivered 71%, Open / in transit 9%, RTO 8%, Cancelled 12% of 100 handled");
    expect(within(rows[2]).getByRole("img")).toHaveAttribute("aria-label", "Karim: Delivered 50%, Open / in transit 15%, RTO 10%, Cancelled 25% of 20 handled");
    expect(within(panel).getByText("Team 69.2%")).toBeInTheDocument();
    expect(within(panel).getByText("Sorted by delivered ÷ handled · dashed line = team average")).toBeInTheDocument();
    expect(within(panel).getByText("Handled = orders a member confirmed or cancelled")).toBeInTheDocument();
  });

  it("draws yield bars and the team tick on one exact % scale and flags only members more than 5 points below", async () => {
    const KarimId = "33333333-3333-3333-3333-333333333333";
    const SumiId = "44444444-4444-4444-4444-444444444444";
    const allConfirmed = (delivered: number) => metrics({ handled_count: 100, handled_confirmed_count: 100, handled_delivered_count: delivered, handled_returned_count: 0, handled_cancelled_count: 0 });
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [
        // 76 delivered, 10 open, 4 RTO, 10 cancelled of 100
        reportRow({ orders: metrics({ handled_count: 100, handled_confirmed_count: 90, handled_delivered_count: 76, handled_returned_count: 4, handled_cancelled_count: 10 }) }),
        reportRow({ user_id: NadiaId, display_name: "Nadia", orders: allConfirmed(65) }),
        reportRow({ user_id: KarimId, display_name: "Karim", orders: allConfirmed(64) }),
        reportRow({ user_id: SumiId, display_name: "Sumi", orders: allConfirmed(75) }),
      ],
    })));

    renderPage();

    // Team = (76 + 65 + 64 + 75) / 400 = exactly 70%.
    const panel = await screen.findByRole("region", { name: "Where every handled order ended up" });
    const row = (id: string) => within(panel).getByTestId(`staff-yield-row-${id}`);
    const segmentsOf = (id: string) => Array.from(within(row(id)).getByRole("img").querySelectorAll<HTMLElement>("[data-segment]"));

    const rafi = segmentsOf(RafiId);
    expect(rafi.map((item) => item.dataset.segment)).toEqual(["delivered", "inTransit", "returned", "cancelled"]);
    expect(rafi.map((item) => item.style.width)).toEqual(["76%", "10%", "4%", "10%"]);
    expect(rafi[0]).toHaveClass("shrink-0");
    expect(within(row(RafiId)).getByRole("img")).not.toHaveClass("gap-1");
    expect(within(panel).getAllByTestId("staff-yield-team-tick").map((item) => item.style.left)).toEqual(["70%", "70%", "70%", "70%"]);

    // Nadia has no RTO or cancelled orders, so those segments are not drawn.
    expect(segmentsOf(NadiaId).map((item) => item.dataset.segment)).toEqual(["delivered", "inTransit"]);
    expect(segmentsOf(NadiaId)[0].style.width).toBe("65%");

    expect(within(row(NadiaId)).getByText("65%")).not.toHaveClass("text-[#B4473A]"); // exactly 5 below
    expect(within(row(KarimId)).getByText("64%")).toHaveClass("text-[#B4473A]"); // 6 below
  });

  it("keeps tiny yield outcomes at their exact width with the gap painted inside the segment, not as a border", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [
        // 1 RTO of 50 handled = 2%
        reportRow({ orders: metrics({ handled_count: 50, handled_confirmed_count: 49, handled_delivered_count: 40, handled_returned_count: 1, handled_cancelled_count: 1 }) }),
        // 1 RTO of 200 handled = 0.5%
        reportRow({ user_id: NadiaId, display_name: "Nadia", orders: metrics({ handled_count: 200, handled_confirmed_count: 190, handled_delivered_count: 150, handled_returned_count: 1, handled_cancelled_count: 10 }) }),
      ],
    })));

    renderPage();

    const panel = await screen.findByRole("region", { name: "Where every handled order ended up" });
    const segmentsOf = (id: string) => Array.from(within(within(panel).getByTestId(`staff-yield-row-${id}`)).getByRole("img").querySelectorAll<HTMLElement>("[data-segment]"));
    const widths = (id: string) => Object.fromEntries(segmentsOf(id).map((item) => [item.dataset.segment, item.style.width]));

    expect(widths(RafiId)).toEqual({ delivered: "80%", inTransit: "16%", returned: "2%", cancelled: "2%" });
    expect(widths(NadiaId)).toEqual({ delivered: "75%", inTransit: "19.5%", returned: "0.5%", cancelled: "5%" });
    for (const segment of [...segmentsOf(RafiId), ...segmentsOf(NadiaId)]) {
      expect(segment.className).not.toMatch(/\bborder/);
      expect(segment).toHaveClass("shrink-0");
    }
    for (const id of [RafiId, NadiaId]) {
      const [first, ...later] = segmentsOf(id);
      expect(first.style.backgroundPosition).toBe("");
      for (const segment of later) {
        expect(segment.style.backgroundPosition).toBe("right");
        expect(segment.style.backgroundSize).toBe("max(2px, calc(100% - 4px)) 100%");
      }
    }
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

  const KarimId = "33333333-3333-3333-3333-333333333333";
  const SumiId = "44444444-4444-4444-4444-444444444444";
  const rosterKeys = () => screen.getAllByTestId(/^staff-performance-row-/).map((item) => item.getAttribute("data-testid")?.replace("staff-performance-row-", ""));
  const details = (name: string) => screen.getByRole("region", { name: `${name} details` });
  const tile = (region: HTMLElement, label: string) => within(region).getByText(label).parentElement as HTMLElement;
  const noOrders = (user_id: string, display_name: string, overrides: Partial<StaffRow> = {}) => reportRow({
    user_id,
    display_name,
    orders: metrics({ handled_count: 0, handled_confirmed_count: 0, handled_confirmed_value: 0, handled_confirmed_kg: 0, handled_delivered_count: 0, handled_delivered_value: 0, telesales_confirmed_count: 0, telesales_confirmed_value: 0, products: [] }),
    ...overrides,
  });

  it("lists the team as a roster, most confirmed value first, and selects the leader's profile", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [
        reportRow({ user_id: NadiaId, display_name: "Nadia", is_active: false, orders: metrics({ confirmed_value: 900, handled_confirmed_value: 900, products: [] }) }),
        reportRow({ orders: metrics({ confirmed_value: 1800, handled_confirmed_value: 1800, confirmed_count: 2 }), social_inbox_orders: metrics({ confirmed_value: 999999 }) }),
        reportRow({ user_id: KarimId, display_name: "Karim", orders: metrics({ handled_confirmed_value: 1200, products: [] }) }),
      ],
    })));

    renderPage();

    const section = await screen.findByRole("region", { name: "Team performance" });
    expect(rosterKeys()).toEqual([RafiId, KarimId, NadiaId]);
    const rafi = screen.getByTestId(`staff-performance-row-${RafiId}`);
    expect(rafi.tagName).toBe("BUTTON");
    expect(rafi).toHaveAttribute("aria-current", "true");
    expect(screen.getByTestId(`staff-performance-row-${KarimId}`)).not.toHaveAttribute("aria-current");
    expect(within(rafi).getByText("1")).toHaveClass("bg-black");
    expect(within(screen.getByTestId(`staff-performance-row-${KarimId}`)).getByText("2")).toHaveClass("bg-black/[0.07]");
    expect(within(screen.getByTestId(`staff-performance-row-${NadiaId}`)).getByText("3")).toBeInTheDocument();
    expect(within(rafi).getByText("৳1,800")).toBeInTheDocument();
    const profile = details("Rafi");
    expect(within(screen.getByTestId("staff-performance-profile")).getByRole("heading", { name: "Rafi" })).toBeInTheDocument();
    expect(within(profile).getByTestId("staff-performance-hero-value")).toHaveTextContent("৳1,800");
    expect(within(section).queryByRole("table", { name: "Team performance" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Expand all" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Social Inbox/i)).not.toBeInTheDocument();
  });

  it("switches the profile when another roster member is clicked, and tags former staff", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [
        reportRow({ orders: metrics({ handled_confirmed_value: 1800 }) }),
        reportRow({ user_id: NadiaId, display_name: "Nadia", is_active: false, orders: metrics({ handled_confirmed_value: 900, products: [] }) }),
      ],
    })));

    renderPage();

    const nadia = await screen.findByTestId(`staff-performance-row-${NadiaId}`);
    expect(within(nadia).getByText("· Former staff")).toBeInTheDocument();
    expect(within(screen.getByTestId(`staff-performance-row-${RafiId}`)).queryByText(/Former staff/)).not.toBeInTheDocument();
    expect(within(details("Rafi")).queryByText("Former staff")).not.toBeInTheDocument();

    await user.click(nadia);
    expect(nadia).toHaveAttribute("aria-current", "true");
    expect(screen.getByTestId(`staff-performance-row-${RafiId}`)).not.toHaveAttribute("aria-current");
    const profile = details("Nadia");
    expect(within(profile).getByTestId("staff-performance-hero-value")).toHaveTextContent("৳900");
    expect(within(profile).getByText("Former staff")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Rafi details" })).not.toBeInTheDocument();
  });

  it("reorders the roster from the Sort by menu and direction button without changing the selection", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [
        reportRow({ orders: metrics({ handled_confirmed_value: 1800 }) }),
        reportRow({ user_id: NadiaId, display_name: "Nadia", orders: metrics({ handled_confirmed_value: 900, products: [] }) }),
        reportRow({ user_id: KarimId, display_name: "Karim", orders: metrics({ handled_confirmed_value: 1200, products: [] }) }),
      ],
    })));

    renderPage();

    await screen.findByTestId(`staff-performance-row-${RafiId}`);
    const sortBy = screen.getByRole("combobox", { name: "Sort by" });
    expect(within(sortBy).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Confirmed value", "Staff", "Handled", "Confirmed", "Confirmation rate", "Cancel rate", "Delivered", "AOV", "Weight", "Extra revenue",
    ]);
    expect(sortBy).toHaveDisplayValue("Confirmed value");
    expect(screen.getByRole("button", { name: "Sort direction: highest first" })).toBeInTheDocument();
    expect(rosterKeys()).toEqual([RafiId, KarimId, NadiaId]);

    await user.selectOptions(sortBy, "Staff");
    expect(rosterKeys()).toEqual([KarimId, NadiaId, RafiId]);
    expect(screen.getByTestId(`staff-performance-row-${RafiId}`)).toHaveAttribute("aria-current", "true");
    expect(details("Rafi")).toBeInTheDocument();
    // Rank badges stay by value, whatever the sort.
    expect(within(screen.getByTestId(`staff-performance-row-${RafiId}`)).getByText("1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sort direction: A to Z" }));
    expect(rosterKeys()).toEqual([RafiId, NadiaId, KarimId]);
    expect(screen.getByRole("button", { name: "Sort direction: Z to A" })).toBeInTheDocument();
    expect(details("Rafi")).toBeInTheDocument();

    await user.selectOptions(sortBy, "Cancel rate");
    expect(screen.getByRole("button", { name: "Sort direction: lowest first" })).toBeInTheDocument();
    await user.selectOptions(sortBy, "Handled");
    expect(screen.getByRole("button", { name: "Sort direction: highest first" })).toBeInTheDocument();
  });

  it("marks only a worse cancel rate with High cancels and rounds the gap away from zero", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [
        // Rafi 40% cancelled, Nadia 29.92%; team = 1748 / 5000 = 34.96%, so Rafi is 5.04 pts above.
        reportRow({ orders: metrics({ handled_count: 2500, handled_confirmed_count: 1500, handled_confirmed_value: 1800, handled_cancelled_count: 1000, handled_delivered_count: 750 }) }),
        reportRow({ user_id: NadiaId, display_name: "Nadia", orders: metrics({ handled_count: 2500, handled_confirmed_count: 1752, handled_cancelled_count: 748, handled_delivered_count: 900 }) }),
      ],
    })));

    renderPage();

    const rafi = await screen.findByTestId(`staff-performance-row-${RafiId}`);
    expect(within(rafi).getByText("High cancels")).toHaveClass("text-[#B4473A]");
    expect(within(screen.getByTestId(`staff-performance-row-${NadiaId}`)).queryByText("High cancels")).not.toBeInTheDocument();
    const profile = details("Rafi");
    expect(within(profile).getByText("High cancels")).toBeInTheDocument();
    expect(tile(profile, "Cancel rate")).toHaveTextContent(/^Cancel rate40%5\.1 pts above team$/);
    expect(within(tile(profile, "Cancel rate")).getByText("40%")).toHaveAttribute("data-flag", "worse");
    expect(tile(profile, "Confirmation rate")).toHaveTextContent(/^Confirmation rate60%5\.1 pts below team$/);
    expect(within(tile(profile, "Confirmation rate")).getByText("60%")).toHaveAttribute("data-flag", "worse");
  });

  it("breaks the selected member's handled orders down by source with an all-sources total", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [
        reportRow({
          orders: metrics({
            handled_count: 5, handled_confirmed_count: 3, handled_cancelled_count: 2, handled_confirmed_value: 1500, handled_delivered_count: 1,
            sources: [
              { source: "website", handled_count: 3, confirmed_count: 2, confirmed_value: 1200, cancelled_count: 1, delivered_count: 1, returned_count: 0 },
              { source: "telesales", handled_count: 2, confirmed_count: 1, confirmed_value: 300, cancelled_count: 1, delivered_count: 0, returned_count: 0 },
            ],
          }),
        }),
      ],
    })));

    renderPage();

    const card = await screen.findByTestId("staff-performance-sources");
    expect(card).toHaveTextContent("By source · Rafi");
    const table = within(card).getByRole("table", { name: "Rafi orders by source" });
    const website = within(table).getByRole("row", { name: /Website/ });
    expect(website).toHaveTextContent(/Website\s*3\s*2\s*1\s*66\.7%\s*1\s*৳1,200/);
    expect(within(table).getByRole("row", { name: /Telesales/ })).toHaveTextContent(/Telesales\s*2\s*1\s*1\s*50%\s*0\s*৳300/);
    expect(within(table).getByRole("row", { name: /All sources/ })).toHaveTextContent(/All sources\s*5\s*3\s*2\s*60%\s*1\s*৳1,500/);
  });

  it("shows a plain team comparison for a member who is not flagged", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [
        reportRow({ orders: metrics({ handled_count: 100, handled_confirmed_count: 60, handled_cancelled_count: 40, handled_delivered_count: 30 }) }),
        reportRow({ user_id: NadiaId, display_name: "Nadia", orders: metrics({ handled_count: 100, handled_confirmed_count: 90, handled_cancelled_count: 10, handled_delivered_count: 45 }) }),
      ],
    })));

    renderPage();

    await user.click(await screen.findByTestId(`staff-performance-row-${NadiaId}`));
    const profile = details("Nadia");
    expect(tile(profile, "Cancel rate")).toHaveTextContent(/^Cancel rate10%Team 25%$/);
    expect(within(tile(profile, "Cancel rate")).getByText("10%")).toHaveAttribute("data-flag", "best");
    expect(tile(profile, "Confirmation rate")).toHaveTextContent(/^Confirmation rate90%Team 75%$/);
    expect(within(profile).queryByText("High cancels")).not.toBeInTheDocument();
  });

  it("collapses members with no orders into a disclosure, keeping a cart-only member in the roster", async () => {
    const user = userEvent.setup();
    const idle = ["Hena", "Gazi", "Faruk", "Esha", "Dipu", "Chan", "Bina", "Amin"].map((name, index) => noOrders(`idle-${index}`, name, name === "Gazi" ? { is_active: false } : {}));
    const cart = noOrders(SumiId, "Sumi", { abandoned_checkouts: abandonedMetrics({ contacted_count: 3 }) });
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({ rows: [reportRow(), cart, ...idle] })));

    renderPage();

    await screen.findByTestId(`staff-performance-row-${RafiId}`);
    expect(rosterKeys()).toEqual([RafiId, SumiId]);
    expect(within(screen.getByTestId(`staff-performance-row-${SumiId}`)).getByText("0 of 0 confirmed")).toBeInTheDocument();
    expect(screen.getByText("2 of 10 members active")).toBeInTheDocument();
    const group = screen.getByTestId("staff-performance-no-orders");
    const toggle = within(group).getByRole("button", { name: /8 members had no orders/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("Amin, Bina, Chan and 5 more");
    expect(within(group).queryByRole("listitem")).not.toBeInTheDocument(); // list stays in the DOM but hidden
    expect(within(group).getByText("Gazi")).not.toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const list = within(group).getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(8);
    expect(within(list).getByText("Gazi").closest("li")).toHaveTextContent("Gazi· Former staff");
    expect(within(group).queryByRole("button", { name: /Gazi/ })).not.toBeInTheDocument();
    for (let index = 0; index < idle.length; index += 1) expect(screen.queryByTestId(`staff-performance-row-idle-${index}`)).not.toBeInTheDocument();
  });

  it("shows every member as a roster row when nobody had orders", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({ rows: [noOrders(RafiId, "Rafi"), noOrders(NadiaId, "Nadia")] })));

    renderPage();

    await screen.findByTestId(`staff-performance-row-${RafiId}`);
    expect(screen.getAllByTestId(/^staff-performance-row-/)).toHaveLength(2);
    expect(screen.queryByTestId("staff-performance-no-orders")).not.toBeInTheDocument();
    expect(screen.getByText("0 of 2 members active")).toBeInTheDocument();
  });

  it("fills the profile header with six tiles, the rank and the share of team value", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [
        reportRow({ orders: metrics({ handled_confirmed_value: 1800, products: [] }) }),
        reportRow({ user_id: NadiaId, display_name: "Nadia", orders: metrics({ handled_confirmed_value: 900, products: [] }) }),
      ],
    })));

    renderPage();

    await screen.findByTestId(`staff-performance-row-${RafiId}`);
    const profile = details("Rafi");
    expect(within(profile).getByText("66.7% of team value")).toBeInTheDocument(); // 1800 / 2700
    expect(within(profile).getByText("Ranked 1 of 2 by value")).toBeInTheDocument();
    const tiles = tile(profile, "Confirmation rate").parentElement as HTMLElement;
    expect(tiles.children).toHaveLength(6);
    expect(tile(profile, "Delivered of confirmed")).toHaveTextContent(/^Delivered of confirmed100%0 still in transit$/);
    expect(tile(profile, "Average order value")).toHaveTextContent(/^Average order value৳1,800Team ৳1,350$/); // 2700 / 2
    expect(tile(profile, "Weight confirmed")).toHaveTextContent(/^Weight confirmed2 kg1 confirmed order$/);
    expect(tile(tiles, "Extra revenue")).toHaveTextContent(/^Extra revenue৳1,200Telesales, upsell, carts$/); // the Extra revenue card also uses this label
  });

  it("measures a website-order handler by orders handled, not by assignment", async () => {
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
    expect(within(row).getByText("328 of 340 confirmed · 12 cancelled")).toBeInTheDocument();
    const profile = details("Rafi");
    expect(within(tile(profile, "Confirmation rate")).getByText("96.5%")).toBeInTheDocument();
    expect(within(tile(profile, "Cancel rate")).getByText("3.5%")).toBeInTheDocument();
  });

  it("draws the roster outcome bar from handled orders and omits a zero cancelled count", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [
        reportRow({ orders: metrics({ handled_count: 51, handled_confirmed_count: 42, handled_cancelled_count: 9, handled_delivered_count: 0, handled_returned_count: 0 }) }),
        reportRow({ user_id: NadiaId, display_name: "Nadia", orders: metrics({ handled_count: 200, handled_confirmed_count: 200, handled_cancelled_count: 0, handled_delivered_count: 199, handled_returned_count: 0 }) }),
      ],
    })));

    renderPage();

    const rafi = await screen.findByTestId(`staff-performance-row-${RafiId}`);
    expect(within(rafi).getByText("42 of 51 confirmed · 9 cancelled")).toBeInTheDocument();
    const bar = within(rafi).getByRole("img");
    expect(bar).toHaveAttribute("aria-label", "Delivered 0, Open / in transit 42, RTO 0, Cancelled 9");
    expect(Array.from(bar.querySelectorAll<HTMLElement>("[data-segment]")).map((item) => item.dataset.segment)).toEqual(["inTransit", "cancelled"]);
    const nadia = screen.getByTestId(`staff-performance-row-${NadiaId}`);
    expect(within(nadia).getByText("200 of 200 confirmed")).toBeInTheDocument();
    const tiny = within(nadia).getByRole("img").querySelector<HTMLElement>('[data-segment="inTransit"]');
    expect(tiny?.style.width).toBe("0.5%");
    expect(tiny).toHaveClass("min-w-[2px]");
  });

  it("breaks the selected member's handled orders into four outcomes with exact bar widths", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [reportRow({
        orders: metrics({
          handled_count: 200,
          handled_confirmed_count: 190,
          handled_confirmed_value: 6000,
          handled_cancelled_count: 10,
          handled_cancelled_value: 1500,
          handled_delivered_count: 150,
          handled_delivered_value: 3000,
          handled_returned_count: 1,
          handled_returned_value: 900,
          // Per-activity counters must not drive the card.
          confirmed_count: 7,
          cancelled_count: 9,
          confirmed_value: 99999,
          delivered_value: 88888,
          returned_value: 77777,
          cancelled_value: 66666,
          products: [],
        }),
      })],
    })));

    renderPage();

    await screen.findByTestId(`staff-performance-row-${RafiId}`);
    const profile = details("Rafi");
    expect(within(profile).getByText("Where Rafi's 200 orders ended up")).toBeInTheDocument();
    expect(within(profile).getByText("Confirmed 190 · ৳6,000")).toBeInTheDocument();
    const bar = within(profile).getByRole("img", { name: "Rafi outcomes: Delivered 150, Open / in transit 39, RTO 1, Cancelled 10" });
    expect(Object.fromEntries(Array.from(bar.querySelectorAll<HTMLElement>("[data-segment]")).map((item) => [item.dataset.segment, item.style.width]))).toEqual({
      delivered: "75%", inTransit: "19.5%", returned: "0.5%", cancelled: "5%",
    });
    const outcome = (key: string) => profile.querySelector(`[data-outcome="${key}"]`) as HTMLElement;
    expect(outcome("delivered")).toHaveTextContent(/^Delivered150৳3,000$/);
    expect(outcome("inTransit")).toHaveTextContent(/^Open \/ in transit3919\.5% of handled$/);
    expect(outcome("returned")).toHaveTextContent(/^RTO1৳900$/);
    expect(outcome("cancelled")).toHaveTextContent(/^Cancelled10৳1,500 lost$/);
    expect(within(outcome("cancelled")).getByText("10")).toHaveClass("text-[#B4473A]");
  });

  it("shows the extra revenue, abandoned carts and products by outcome cards, flagging high loss", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [reportRow({
        orders: metrics({
          retained_upsell_count: 2,
          retained_upsell_value: 600,
          products: [
            { product_id: "p1", product_name: "Mango", packs: 5, kg: 10, delivered_packs: 4, delivered_kg: 8, returned_packs: 1, returned_kg: 1, cancelled_packs: 0, cancelled_kg: 0 },
            { product_id: "p2", product_name: "Honey", packs: 0, kg: 0, delivered_packs: 0, delivered_kg: 0, returned_packs: 0, returned_kg: 0, cancelled_packs: 1, cancelled_kg: 0.5 },
          ],
        }),
        abandoned_checkouts: abandonedMetrics({ contacted_count: 4, converted_count: 1, converted_value: 900 }),
      })],
    })));

    renderPage();

    await screen.findByTestId(`staff-performance-row-${RafiId}`);
    const profile = details("Rafi");
    expect(within(profile).getByText("Upsell kept · 2 items")).toBeInTheDocument();
    expect(within(profile).getByText("Carts converted · 1")).toBeInTheDocument();
    expect(within(profile).getByText("Contacted").closest("p")).toHaveTextContent("4");
    expect(within(profile).getByText("Converted").closest("p")).toHaveTextContent("1 · 25%");
    expect(within(profile).getByText("Products by outcome · Rafi")).toBeInTheDocument();
    const table = within(profile).getByRole("table", { name: "Rafi products by outcome" });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Product", "Confirmed", "Delivered", "RTO", "Cancelled", "Loss"]);

    const honey = within(table).getByText("Honey").closest("tr") as HTMLElement;
    const [confirmed, , , cancelled, honeyLoss] = within(honey).getAllByRole("cell");
    expect(confirmed).toHaveTextContent(/^—$/);
    expect(cancelled).toHaveTextContent(/^1 · 0\.5 kg$/);
    expect(within(honeyLoss).getByText("100%")).toHaveAttribute("data-flag", "worse");
    const mango = within(table).getByText("Mango").closest("tr") as HTMLElement;
    expect(within(within(mango).getAllByRole("cell")[4]).getByText("10%")).not.toHaveAttribute("data-flag");
    const total = within(table).getByText("All products").closest("tr") as HTMLElement;
    expect(within(total).getAllByRole("cell")[4]).toHaveTextContent(/^14\.3%$/); // 1.5 / 10.5
  });

  it("shows an empty products state", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({ rows: [reportRow({ orders: metrics({ products: [] }) })] })));

    renderPage();

    await screen.findByTestId(`staff-performance-row-${RafiId}`);
    expect(within(details("Rafi")).getByText("No products in this range.")).toBeInTheDocument();
  });

  it("totals the team at the bottom of the roster, counting members who need attention", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [
        // 60 confirmed, 40 cancelled of 100; team = 150 / 200 = 75% confirmed, 25% cancelled
        reportRow({ orders: metrics({ handled_count: 100, handled_confirmed_count: 60, handled_cancelled_count: 40, handled_delivered_count: 30 }) }),
        reportRow({ user_id: NadiaId, display_name: "Nadia", orders: metrics({ handled_count: 100, handled_confirmed_count: 90, handled_cancelled_count: 10, handled_delivered_count: 45 }) }),
      ],
    })));

    renderPage();

    const total = await screen.findByTestId("staff-performance-team-total");
    expect(within(total).getByText("Team total")).toHaveClass("text-black"); // eyebrows use full ink
    expect(within(total).getByText("2 of 2 members")).toBeInTheDocument();
    expect(within(total).getByText("৳2,400")).toBeInTheDocument();
    expect(within(total).getByText("150 of 200 handled orders confirmed")).toBeInTheDocument();
    expect(within(total).getByText("Confirmation").parentElement).toHaveTextContent(/^Confirmation75%$/);
    expect(within(total).getByText("Cancel rate").parentElement).toHaveTextContent(/^Cancel rate25%$/);
    expect(within(total).getByText("1 person")).toHaveClass("text-[#B4473A]");
  });

  it("says None or counts people when the team needs no or several people's attention", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(response(reportResponse({
      rows: [
        reportRow({ orders: metrics({ handled_count: 100, handled_confirmed_count: 60, handled_cancelled_count: 40 }) }),
        reportRow({ user_id: KarimId, display_name: "Karim", orders: metrics({ handled_count: 100, handled_confirmed_count: 60, handled_cancelled_count: 40 }) }),
        reportRow({ user_id: NadiaId, display_name: "Nadia", orders: metrics({ handled_count: 100, handled_confirmed_count: 100, handled_cancelled_count: 0 }) }),
        reportRow({ user_id: SumiId, display_name: "Sumi", orders: metrics({ handled_count: 100, handled_confirmed_count: 100, handled_cancelled_count: 0 }) }),
      ],
    })));

    const { unmount } = renderPage();

    expect(within(await screen.findByTestId("staff-performance-team-total")).getByText("2 people")).toHaveClass("text-[#B4473A]");
    unmount();

    vi.mocked(apiFetch).mockResolvedValueOnce(response(reportResponse()));
    renderPage();

    const none = within(await screen.findByTestId("staff-performance-team-total")).getByText("None");
    expect(none).not.toHaveClass("text-[#B4473A]");
  });

  it("keeps the two panes shrinkable below lg and the profile sticky on desktop", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse()));

    renderPage();

    const profile = await screen.findByTestId("staff-performance-profile");
    const body = profile.parentElement as HTMLElement;
    expect(body).toHaveClass("grid-cols-[minmax(0,1fr)]", "lg:grid-cols-[400px_minmax(0,1fr)]");
    expect(profile).toHaveClass("min-w-0", "lg:sticky", "lg:top-4", "lg:self-start");
    expect(screen.getByRole("list", { name: "Team members" }).parentElement).toHaveClass("min-w-0");
  });

  it("lists roster buttons in a Team members list and labels the sort control with a real label", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse()));

    renderPage();

    const list = await screen.findByRole("list", { name: "Team members" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getAllByTestId(/^staff-performance-row-/)).toHaveLength(2);
    const select = screen.getByLabelText("Sort by");
    expect(select.tagName).toBe("SELECT");
    expect(document.querySelector(`label[for="${select.id}"]`)).toHaveTextContent("Sort by");
    expect(select).not.toHaveAttribute("aria-label");
  });

  it("counts cancelled orders the same way in the roster caption and the outcome card", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      // Inconsistent counters on purpose: handled - confirmed (4) differs from handled_cancelled (3).
      rows: [reportRow({ orders: metrics({ handled_count: 10, handled_confirmed_count: 6, handled_cancelled_count: 3, handled_delivered_count: 6, products: [] }) })],
    })));

    renderPage();

    const rafi = await screen.findByTestId(`staff-performance-row-${RafiId}`);
    expect(within(rafi).getByText("6 of 10 confirmed · 3 cancelled")).toBeInTheDocument();
    expect(details("Rafi").querySelector('[data-outcome="cancelled"]')).toHaveTextContent(/^Cancelled3/);
  });

  it("ranks among shown members only and says 1 member had no orders", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse({
      rows: [
        reportRow({ orders: metrics({ handled_confirmed_value: 1800 }) }),
        reportRow({ user_id: NadiaId, display_name: "Nadia", orders: metrics({ handled_confirmed_value: 900, products: [] }) }),
        noOrders(SumiId, "Sumi"),
      ],
    })));

    renderPage();

    await screen.findByTestId(`staff-performance-row-${RafiId}`);
    expect(within(details("Rafi")).getByText("Ranked 1 of 2 by value")).toBeInTheDocument();
    const group = screen.getByTestId("staff-performance-no-orders");
    const toggle = within(group).getByRole("button", { name: /1 member had no orders/ });
    const controlled = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(controlled).not.toBeNull();
    expect(controlled).not.toBeVisible();
    expect(toggle.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    await user.click(toggle);
    expect(controlled).toBeVisible();
  });

  it("falls back to the first member when the selected one disappears, and does not re-select them on return", async () => {
    const user = userEvent.setup();
    const rafi = reportRow({ orders: metrics({ handled_confirmed_value: 1800 }) });
    const nadia = reportRow({ user_id: NadiaId, display_name: "Nadia", orders: metrics({ handled_confirmed_value: 900, products: [] }) });
    const { rerender } = render(<StaffTable rows={[rafi, nadia]} />);

    await user.click(screen.getByTestId(`staff-performance-row-${NadiaId}`));
    expect(details("Nadia")).toBeInTheDocument();

    rerender(<StaffTable rows={[rafi]} />);
    expect(details("Rafi")).toBeInTheDocument();
    expect(screen.getByTestId(`staff-performance-row-${RafiId}`)).toHaveAttribute("aria-current", "true");

    rerender(<StaffTable rows={[rafi, nadia]} />);
    expect(details("Rafi")).toBeInTheDocument();
    expect(screen.getByTestId(`staff-performance-row-${NadiaId}`)).not.toHaveAttribute("aria-current");
  });

  // Runs a test body with matchMedia answering `wide` for every query and a spy for scrollIntoView, restoring both afterwards.
  async function withViewport(wide: boolean, body: (scrollIntoView: ReturnType<typeof vi.fn>) => Promise<void>) {
    const scrollIntoView = vi.fn();
    const originalMatchMedia = window.matchMedia;
    // setup.ts defines a read-only stub on Element.prototype; shadow it on HTMLElement.prototype for this test.
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, writable: true, value: scrollIntoView });
    window.matchMedia = vi.fn((query: string) => ({
      matches: wide, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    try {
      await body(scrollIntoView);
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      window.matchMedia = originalMatchMedia;
    }
  }
  const twoMembers = () => [
    reportRow({ orders: metrics({ handled_confirmed_value: 1800 }) }),
    reportRow({ user_id: NadiaId, display_name: "Nadia", orders: metrics({ handled_confirmed_value: 900, products: [] }) }),
  ];
  const profileTop = (top: number) => {
    Object.defineProperty(screen.getByTestId("staff-performance-profile"), "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top, bottom: top + 500, left: 0, right: 0, width: 0, height: 500, x: 0, y: top, toJSON: () => ({}) }),
    });
  };

  it("scrolls to and focuses the profile after picking a member on a narrow screen", async () => {
    await withViewport(false, async (scrollIntoView) => {
      const user = userEvent.setup();
      render(<StaffTable rows={twoMembers()} />);

      await user.click(screen.getByTestId(`staff-performance-row-${NadiaId}`));
      expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
      await waitFor(() => expect(details("Nadia")).toHaveFocus());
      expect(details("Nadia")).toHaveAttribute("tabindex", "-1");
    });
  });

  it("on desktop, scrolls the profile back into view only when it is above the viewport, without moving focus", async () => {
    await withViewport(true, async (scrollIntoView) => {
      const user = userEvent.setup();
      render(<StaffTable rows={twoMembers()} />);
      profileTop(-240);

      const nadia = screen.getByTestId(`staff-performance-row-${NadiaId}`);
      await user.click(nadia);
      expect(details("Nadia")).toBeInTheDocument();
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "start" }));
      expect(details("Nadia")).not.toHaveFocus();
      expect(nadia).toHaveFocus();

      // Re-clicking the selected member does nothing.
      await user.click(nadia);
      expect(scrollIntoView).toHaveBeenCalledTimes(1);

      // Profile already in view: no scroll.
      profileTop(80);
      await user.click(screen.getByTestId(`staff-performance-row-${RafiId}`));
      expect(details("Rafi")).toBeInTheDocument();
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(details("Rafi")).not.toHaveFocus();
    });
  });

  it("never scrolls or moves focus when the sort changes", async () => {
    for (const wide of [true, false]) {
      await withViewport(wide, async (scrollIntoView) => {
        const user = userEvent.setup();
        const { unmount } = render(<StaffTable rows={twoMembers()} />);
        profileTop(-240);

        const sortBy = screen.getByLabelText("Sort by");
        await user.selectOptions(sortBy, "Staff");
        expect(sortBy).toHaveFocus();
        const direction = screen.getByRole("button", { name: "Sort direction: A to Z" });
        await user.click(direction);
        expect(direction).toHaveFocus();
        expect(scrollIntoView).not.toHaveBeenCalled();
        expect(details("Rafi")).not.toHaveFocus();
        unmount();
      });
    }
  });

  it("lets the roster name and tags wrap beside a fixed-width value so narrow rows cannot spill", async () => {
    render(<StaffTable rows={[reportRow({ is_active: false, orders: metrics({ handled_confirmed_value: 123456789 }) })]} />);

    const row = screen.getByTestId(`staff-performance-row-${RafiId}`);
    const name = within(row).getByText("Rafi");
    expect(name).toHaveClass("min-w-0", "max-w-full", "truncate");
    expect(name.parentElement).toHaveClass("flex-wrap", "min-w-0", "flex-1");
    expect(within(row).getByText(/^৳[\d,]+$/)).toHaveClass("shrink-0");
    expect(within(details("Rafi")).getByTestId("staff-performance-hero-value")).toHaveClass("text-[32px]", "sm:text-[44px]");
  });

  it("keeps the rate footnotes and the red-rule legend under the team performance section", async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(reportResponse()));

    renderPage();

    await screen.findByTestId("staff-performance-profile");
    expect(screen.getByText("Conf. rate = confirmed ÷ handled · Delivered = delivered ÷ confirmed · Handled = orders confirmed or cancelled (each order counted once, by the member's last action)")).toBeInTheDocument();
    expect(screen.getByText("Outcome mix covers each member's handled orders")).toBeInTheDocument();
    expect(screen.getByText(/= more than 5 pts worse than the team average/)).toBeInTheDocument();
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
