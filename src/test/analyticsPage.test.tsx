import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/hooks/useLiveVisitors", () => ({ useLiveVisitors: () => ({ count: 23, loaded: true, details: { activeCarts: 0, checkingOut: 0, purchased: 0 } }) }));
vi.mock("@/components/ui/funnel-chart", () => ({ FunnelChart: () => <div data-testid="funnel-chart" /> }));
vi.mock("@/components/ui/git-hub-calendar", () => ({ GitHubCalendar: () => <div data-testid="sales-calendar" /> }));
vi.mock("@/components/business-report/EChart", () => ({ EChart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} /> }));
vi.mock("@/components/DateRangePicker", () => ({
  DateRangePicker: ({ onChange }: { onChange: (range: { from: Date; to: Date } | null) => void }) => (
    <button type="button" onClick={() => onChange({ from: new Date(2026, 9, 1), to: new Date(2026, 9, 2) })}>Pick range</button>
  ),
}));
import { apiFetch } from "@/lib/api";
import Analytics from "@/pages/Analytics";
import { resolveAnalyticsTab } from "@/lib/analyticsTabs";

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const behavior = {
  configured: true, lookbackDays: 30,
  funnel: { visitors: 120, productViews: 80, carts: 20, checkouts: 10, purchases: 4, conversionRate: 3.3 },
  dropOff: null, productDemand: [], trafficSources: [],
};
const totals = { sessions: 200, visitors: 150, new_visitors: 120, pageviews: 600, product_views: 260, engaged_seconds: 18000, bounced_sessions: 60,
  product_sessions: 140, cart_sessions: 30, checkout_sessions: 20, ordered_sessions: 12, orders: 13, delivered_sessions: 8 };
const acquisition = { source: "facebook", medium: "paid", orders: 9, placed_value: 9000, delivered: 6, delivered_value: 7200, partial_delivered: 0, returned: 1, cancelled: 1, active: 1 };
const report = {
  totals,
  daily: [{ day: "2026-10-02", sessions: 120, visitors: 90, pageviews: 360, ordered_sessions: 7 }, { day: "2026-10-03", sessions: 80, visitors: 60, pageviews: 240, ordered_sessions: 5 }],
  hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, sessions: hour === 21 ? 30 : 5 })),
  sources: [{ source: "facebook", medium: "paid", sessions: 120, visitors: 90, bounced_sessions: 30, ordered_sessions: 9, orders: 9 }, { source: "direct", medium: "none", sessions: 80, visitors: 60, bounced_sessions: 30, ordered_sessions: 3, orders: 4 }],
  campaigns: [{ campaign: "himsagar-reel", sessions: 40, ordered_sessions: 4 }],
  devices: [{ device: "mobile", sessions: 170, cart_sessions: 25, ordered_sessions: 10 }, { device: "desktop", sessions: 30, cart_sessions: 5, ordered_sessions: 2 }],
  pages: [{ path: "/product/katimon-mango", views: 200, sessions: 120, entries: 60 }],
  entry_pages: [{ path: "/step/katimon-mango", sessions: 80, bounced_sessions: 20, ordered_sessions: 8, orders: 8 }],
  products: [{ product_slug: "katimon-mango", name: "Katimon Mango", views: 200, sessions: 120, ordered_sessions: 9, orders: 9, delivered: 6 }],
  acquisition: { last: [acquisition], first: [{ ...acquisition, source: "google", medium: "organic" }], campaigns: [{ campaign: "himsagar-reel", orders: 4, delivered: 3, delivered_value: 3600 }], website_orders: 16, matched_orders: 13 },
};
const website = {
  range: { from: "2026-09-04", to: "2026-10-03" }, previous_range: { from: "2026-08-05", to: "2026-09-03" }, generated_at: new Date().toISOString(),
  current: report, previous: { ...report, totals: { ...totals, visitors: 100, sessions: 160 } },
  health: { latest_event_at: new Date().toISOString(), collecting: true, rollup: { last_succeeded_at: new Date().toISOString(), last_failed_at: null, healthy: true },
    matched_orders: 13, website_orders: 16, order_coverage: 13 / 16, direct_sessions: 80, direct_share: 0.4 },
};
const stockForecast = {
  generated_at: "2026-10-03T06:00:00Z", today: "2026-10-03", settings: { lead_days: 2, safety_days: 3, history_days: 56 },
  summary: { next30_delivered_value: 505000, next30_delivered_low: 434000, next30_delivered_high: 581000, next7_orders: 135, next7_low: 116, next7_high: 155,
    busiest_weekday: 5, busiest_lift_pct: 27, restock_now: 1, first_runs_out: { name: "Katimon Mango", runs_out: "2026-10-09", order_by: "2026-10-07" },
    slow_products: 2, slow_stock_value: 80600, slow_with_cost: 1, delivered_rate: 74, missing_cost_products: 17 },
  forecast: { history: [{ day: "2026-10-02", orders: 20 }], future: [{ day: "2026-10-03", orders: 18, low: 15, high: 21 }], trend: 1.06, value_per_order: 875 },
  actions: [
    { kind: "restock", severity: "urgent", product_id: "p1", name: "Katimon Mango", rule: "runs_out_within_7_days", order_qty: 748, order_by: "2026-10-07", runs_out: "2026-10-09", stock: 240, sold_per_day: 38 },
    { kind: "cost_price", severity: "info", rule: "profit_needs_cost_price", count: 17 },
  ],
  restock: [
    { product_id: "p1", name: "Katimon Mango", stock: 240, sold_per_day: 38, sold_per_day_30: 33, change_pct: 15, days_left: 6.3, runs_out: "2026-10-09", order_by: "2026-10-07", status: "urgent", cost_price: null },
    { product_id: "p2", name: "Sundarbans Honey", stock: 310, sold_per_day: 4.2, sold_per_day_30: 4.4, change_pct: -5, days_left: 73.8, runs_out: "2026-12-15", order_by: "2026-12-13", status: "over", cost_price: 260 },
  ],
  health: [{ product_id: "p3", name: "Kalojira Mix", views: 2050, order_rate: 1.1, delivered_rate: 70, returned_rate: 8, orders: 22, verdict: "fix_page" }],
  health_averages: { order_rate: 2.4, delivered_rate: 74, returned_rate: 7 },
  profit: [{ product_id: "p2", name: "Sundarbans Honey", delivered_revenue: 62700, courier: 6100, cost: 31600, profit: 25000 }],
  rhythm: { slots: [{ id: "morning", label: "Morning" }, { id: "afternoon", label: "Afternoon" }, { id: "evening", label: "Evening" }, { id: "night", label: "Night" }], weeks: 8,
    values: [[2.9, 4.8, 6, 3.3], [2.7, 4.5, 5.6, 3.2], [2.4, 4.1, 5.3, 3.2], [2.8, 4.6, 6, 3.6], [3, 5.1, 6.9, 4], [3.6, 5.8, 8.6, 5], [3.1, 5.2, 7.4, 4.3]] },
};

function Where() { const location = useLocation(); return <output data-testid="where">{location.pathname + location.search}</output>; }
function setup(entry = "/analytics") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]}>
    <Routes><Route path="/analytics" element={<><Analytics /><Where /></>} /></Routes>
  </MemoryRouter></QueryClientProvider>);
}

describe("Analytics page", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
    vi.mocked(apiFetch).mockImplementation(async (path) => json(String(path).includes("stock-forecast") ? stockForecast : String(path).includes("/api/analytics/website") ? website : behavior));
  });
  afterEach(cleanup);

  it("opens on Overview with first-party numbers for the last 30 days, without PostHog or the forecast", async () => {
    setup();
    expect(screen.getByRole("heading", { name: "Analytics" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("23 on the site now")).toBeInTheDocument();
    expect(await screen.findByText("Visitors by day")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
    expect(screen.getByText("+50%")).toBeInTheDocument();
    expect(screen.getByText("৳7,200")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Data healthy/ })).toBeInTheDocument();
    const paths = vi.mocked(apiFetch).mock.calls.map(([path]) => String(path));
    expect(paths.some((path) => /^\/api\/analytics\/website\?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/.test(path))).toBe(true);
    expect(paths.some((path) => path.includes("stock-forecast") || path.includes("website-behavior"))).toBe(false);
  });

  it("reloads the report for a picked date range", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("button", { name: "Pick range" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/analytics/website?from=2026-10-01&to=2026-10-02"));
  });

  it("fills Acquisition, Products & pages, Funnel and Data health from the same report", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("tab", { name: "Acquisition" }));
    expect(await screen.findByText("Performance by source")).toBeInTheDocument();
    expect(screen.getAllByText("Facebook ads").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "First visit" }));
    expect(screen.getByRole("button", { name: "First visit" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("tab", { name: "Products & pages" }));
    expect(screen.getByText("Most viewed products")).toBeInTheDocument();
    expect(screen.getByText("/step/katimon-mango")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Funnel & checkout" }));
    expect(screen.getByTestId("funnel-chart")).toBeInTheDocument();
    expect(screen.getByText(/Biggest drop: product → cart/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Data health" }));
    expect(screen.getByText("Can you trust these numbers?")).toBeInTheDocument();
    expect(screen.getByText("13 of 16")).toBeInTheDocument();
    // PostHog stays visible here for the side-by-side check until the switch-over.
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/order-analysis/website-behavior"));
  });

  it("explains when the analytics database is not set up", async () => {
    vi.mocked(apiFetch).mockImplementation(async () => new Response(JSON.stringify({ error: "x", code: "analytics_not_ready" }), { status: 503 }));
    setup();
    expect(await screen.findByText("Website analytics is not set up yet")).toBeInTheDocument();
  });

  it("says when a range has no visits", async () => {
    vi.mocked(apiFetch).mockImplementation(async () => json({ ...website, current: { ...report, totals: { ...totals, sessions: 0 } } }));
    setup();
    expect(await screen.findByText("No website visits in this range yet")).toBeInTheDocument();
  });

  it("shows Stock & forecast from the rule-based endpoint, with no AI", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("tab", { name: "Stock & forecast" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/analytics?tab=stock");
    expect(await screen.findByText(/Order 748 units of Katimon Mango by Wed,? 7 Oct/)).toBeInTheDocument();
    expect(screen.getByText("rule: runs out within 7 days")).toBeInTheDocument();
    expect(screen.getByText(/^৳5,?05,000$/)).toBeInTheDocument(); // lakh grouping depends on the ICU build
    expect(screen.getByText("Fix the page")).toBeInTheDocument();
    expect(screen.getByText("Best: Friday evening")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/analytics/stock-forecast");
    // Katimon: 38 a day × (21 + 3 safety + 2 lead) − 240 in stock = 748; covering 30 days → 1,090.
    expect(screen.getByRole("cell", { name: "748" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cover 30 days" }));
    expect(screen.getByRole("cell", { name: "1,090" })).toBeInTheDocument();
  });

  it("opens the tab named in the URL and moves between tabs with arrow keys", async () => {
    const user = userEvent.setup();
    setup("/analytics?tab=forecast"); // old AI forecast links land on Stock & forecast
    expect(screen.getByRole("tab", { name: "Stock & forecast" })).toHaveAttribute("aria-selected", "true");
    screen.getByRole("tab", { name: "Stock & forecast" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Data health" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("where")).toHaveTextContent("/analytics?tab=health");
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/analytics$/);
  });

  it("falls back to Overview for an unknown tab", () => {
    expect(resolveAnalyticsTab("customers")).toBe("overview");
    expect(resolveAnalyticsTab(null)).toBe("overview");
    expect(resolveAnalyticsTab("forecast")).toBe("stock");
    expect(resolveAnalyticsTab("stock")).toBe("stock");
  });
});

describe("Analytics route and navigation", () => {
  const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  const sidebarSource = readFileSync(resolve(process.cwd(), "src/components/AppSidebar.tsx"), "utf8");

  it("serves /analytics to admins and redirects the old Order Analysis address", () => {
    expect(appSource).toContain('<Route path="/analytics" element={<AdminRoute><Analytics /></AdminRoute>} />');
    expect(appSource).toContain('<Route path="/order-analysis" element={<LegacyAnalyticsRedirect />} />');
    expect(appSource).toContain("<Navigate to={`/analytics${search}`} replace />");
  });

  it("lists Business Analytics in the Main Menu right after Ask Edith, admin only", () => {
    const section = sidebarSource.slice(sidebarSource.indexOf('label: "Main Menu"'), sidebarSource.indexOf('label: "Orders"'));
    const askEdith = section.indexOf('title: "Ask Edith"');
    const analytics = section.indexOf('title: "Business Analytics"');
    expect(askEdith).toBeGreaterThan(-1);
    expect(analytics).toBeGreaterThan(askEdith);
    expect(section.slice(analytics)).toContain('link: "/analytics"');
    expect(section.slice(analytics)).toContain("disabled: !isAdmin");
    expect(sidebarSource).not.toContain('title: "AI Analysis"');
  });
});
