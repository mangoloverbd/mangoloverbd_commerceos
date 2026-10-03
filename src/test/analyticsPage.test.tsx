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
import { apiFetch } from "@/lib/api";
import Analytics from "@/pages/Analytics";
import { resolveAnalyticsTab } from "@/lib/analyticsTabs";

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const behavior = {
  configured: true, lookbackDays: 30,
  funnel: { visitors: 120, productViews: 80, carts: 20, checkouts: 10, purchases: 4, conversionRate: 3.3 },
  dropOff: null, productDemand: [], trafficSources: [],
};
const forecast = {
  lookbackDays: 30, aiSummary: "Steady sales.", productForecasts: [], stockoutRisks: [], shutdownCandidates: [], topActions: [],
  overview: { projectedRevenue30d: 610000, revenueChange: 19, stockoutCount: 2, shutdownCount: 3, productsTracked: 14, currentRevenue: 512300, currentOrders: 512 },
  salesTrend: { days: [] },
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
    vi.mocked(apiFetch).mockImplementation(async (path) => json(String(path).includes("business-forecast") ? forecast : behavior));
  });
  afterEach(cleanup);

  it("opens on Overview and only loads website behavior", async () => {
    setup();
    expect(screen.getByRole("heading", { name: "Analytics" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("23 on the site now")).toBeInTheDocument();
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith("/api/order-analysis/website-behavior"));
    expect(vi.mocked(apiFetch).mock.calls.some(([path]) => String(path).includes("business-forecast"))).toBe(false);
  });

  it("switches to the AI forecast tab, keeps it in the URL and loads the forecast", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole("tab", { name: "AI forecast" }));
    expect(screen.getByRole("tab", { name: "AI forecast" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("where")).toHaveTextContent("/analytics?tab=forecast");
    expect(await screen.findByText("Projected 30D Revenue")).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith("/api/business-forecast");
  });

  it("opens the tab named in the URL and moves between tabs with arrow keys", async () => {
    const user = userEvent.setup();
    setup("/analytics?tab=forecast");
    expect(screen.getByRole("tab", { name: "AI forecast" })).toHaveAttribute("aria-selected", "true");
    screen.getByRole("tab", { name: "AI forecast" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/analytics$/);
  });

  it("falls back to Overview for an unknown tab", () => {
    expect(resolveAnalyticsTab("customers")).toBe("overview");
    expect(resolveAnalyticsTab(null)).toBe("overview");
    expect(resolveAnalyticsTab("forecast")).toBe("forecast");
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

  it("keeps Analytics where AI Analysis was: Intelligence section, right after Ask Edith, admin only", () => {
    const section = sidebarSource.slice(sidebarSource.indexOf('label: "Intelligence"'), sidebarSource.indexOf('label: "Social Inbox"'));
    const askEdith = section.indexOf('title: "Ask Edith"');
    const analytics = section.indexOf('title: "Analytics"');
    expect(askEdith).toBeGreaterThan(-1);
    expect(analytics).toBeGreaterThan(askEdith);
    expect(section.slice(analytics)).toContain('link: "/analytics"');
    expect(section.slice(analytics)).toContain("disabled: !isAdmin");
    expect(sidebarSource).not.toContain('title: "AI Analysis"');
  });
});
