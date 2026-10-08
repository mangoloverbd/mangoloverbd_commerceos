import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeSummary } from "@/components/home/types";

const { role, apiFetch } = vi.hoisted(() => ({
  role: { isAdmin: true },
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ apiFetch }));
// NumberFlow draws with a custom element; render the same formatted text instead.
vi.mock("@number-flow/react", () => ({
  default: ({ value, prefix = "", suffix = "", locales, format }: { value: number; prefix?: string; suffix?: string; locales?: string; format?: Intl.NumberFormatOptions }) =>
    <span>{`${prefix}${new Intl.NumberFormat(locales, format).format(value)}${suffix}`}</span>,
}));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: role.isAdmin, role: role.isAdmin ? "admin" : "team_member", loading: false }) }));
vi.mock("@/hooks/useOrgName", () => ({ useOrgName: () => ({ orgName: "Mango Lover BD" }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { user_metadata: { full_name: "Noor Karim" } } }) }));

import Home from "@/pages/Home";
import { projectPoint } from "@/components/home/DottedGlobe";
import { smoothPath } from "@/components/home/HomeMetricStrip";

const metric = (value: number, change: number | null) => ({ value, previous: 1, change, series: [1, 2, 3], previous_series: [1, 1, 2] });

const summary: HomeSummary = {
  generated_at: "2026-10-06T04:30:00.000Z",
  metrics: {
    sessions: metric(1284, 18),
    sales: metric(84620, 24),
    orders: metric(63, 12),
    conversion_rate: { value: 4.76, previous: 3.14, change: -2, series: null, previous_series: null },
  },
  live: { count: 17, visitors: [{ city: "Dhaka", country: "BD", path: "/", last_seen_at: "2026-10-06T04:29:00.000Z", latitude: 23.81, longitude: 90.41 }] },
  quick_actions: [
    { key: "send_to_courier", label: "Send to courier", count: 24, to: "/orders", state: { fulfillmentTab: "approved" } },
    { key: "review_fraud_flags", label: "Review fraud flags", count: 3, to: "/orders", state: { fulfillmentTab: "flagged" }, tone: "warn" },
  ],
  attention: [
    {
      kind: "ready_for_courier", count: 24, title: "24 orders are ready for dispatch", body: "Confirmed and waiting.",
      cta: { label: "Dispatch batch", to: "/orders", state: { fulfillmentTab: "approved" } },
      preview: { type: "orders", rows: [{ title: "#ML-2041 · Rafiq", detail: "Himsagar 10kg", tag: { label: "Confirmed", tone: "ok" } }] },
    },
    {
      kind: "top_varieties", count: null, title: "What's selling this week", body: "Units sold.",
      cta: { label: "Open analytics", to: "/analytics" },
      preview: { type: "bars", rows: [{ label: "Himsagar", value: 40 }, { label: "Langra", value: 20 }] },
    },
    { kind: "all_clear", count: null, title: "You're all caught up", body: "Nothing waiting.", cta: { label: "Open orders", to: "/orders" }, preview: null },
  ],
};

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname} ${JSON.stringify(location.state)}`}</output>;
}

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  role.isAdmin = true;
  apiFetch.mockReset();
  apiFetch.mockImplementation(async () => new Response(JSON.stringify(summary), { status: 200 }));
});

describe("Home page", () => {
  it("greets by first name and shows today's metrics", async () => {
    renderHome();
    expect(screen.getByRole("heading", { name: /Hey Noor!/ })).toHaveTextContent("Let's keep Mango Lover BD growing.");
    expect(await screen.findByText("৳84,620")).toBeInTheDocument();
    expect(screen.getByText("1,284")).toBeInTheDocument();
    expect(screen.getByText("4.76%")).toBeInTheDocument();
    expect(screen.getByText("+18%")).toBeInTheDocument();
    expect(screen.getByText("-2%")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(apiFetch.mock.calls[0][0]).toMatch(/^\/api\/home\/summary\?from=(\d{4}-\d{2}-\d{2})&to=\1$/);
    expect(screen.getByTestId("button-date-range-picker")).toHaveTextContent("Today");
    expect(screen.getByRole("button", { name: "Channel: All channels" })).toBeInTheDocument();
  });

  it("starts the numbers at 0 on first load so they roll up to today's values", async () => {
    let resolve: (response: Response) => void = () => {};
    apiFetch.mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
    renderHome();
    expect(screen.getByText("৳0")).toBeInTheDocument();
    expect(screen.getByText("0.00%")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Quick actions" })).not.toBeInTheDocument();

    resolve(new Response(JSON.stringify(summary), { status: 200 }));
    expect(await screen.findByText("৳84,620")).toBeInTheDocument();
    expect(screen.queryByText("৳0")).not.toBeInTheDocument();
    expect(await screen.findByRole("navigation", { name: "Quick actions" })).toBeInTheDocument();
  });

  it("hides money figures from team members", async () => {
    role.isAdmin = false;
    apiFetch.mockImplementation(async () => new Response(JSON.stringify({ ...summary, metrics: { ...summary.metrics, sales: null, orders: null, conversion_rate: null } }), { status: 200 }));
    renderHome();
    expect(await screen.findByText("1,284")).toBeInTheDocument();
    expect(screen.getByLabelText("Total sales: admins only")).toBeInTheDocument();
    expect(screen.getByLabelText("Conversion rate: admins only")).toBeInTheDocument();
    expect(screen.queryByText("৳84,620")).not.toBeInTheDocument();
  });

  it("renders the ranked cards with their previews", async () => {
    renderHome();
    const courier = await screen.findByTestId("home-card-ready_for_courier");
    expect(within(courier).getByText("#ML-2041 · Rafiq")).toBeInTheDocument();
    expect(within(courier).getByText("Confirmed")).toBeInTheDocument();
    expect(within(screen.getByTestId("home-card-top_varieties")).getByText("Himsagar")).toBeInTheDocument();
    expect(screen.getByTestId("home-card-all_clear")).toBeInTheDocument();
  });

  it("opens the matching Orders queue from a card", async () => {
    renderHome();
    fireEvent.click(await screen.findByRole("link", { name: "Dispatch batch" }));
    expect(screen.getByTestId("location")).toHaveTextContent('/orders {"fulfillmentTab":"approved"}');
  });

  it("opens the matching Orders queue from a quick action", async () => {
    renderHome();
    fireEvent.click(await screen.findByRole("link", { name: /Review fraud flags/ }));
    expect(screen.getByTestId("location")).toHaveTextContent('/orders {"fulfillmentTab":"flagged"}');
  });

  it("reloads the metrics for the chosen channel", async () => {
    const user = userEvent.setup();
    renderHome();
    await screen.findByText("৳84,620");
    await user.click(screen.getByRole("button", { name: "Channel: All channels" }));
    await user.click(await screen.findByRole("button", { name: "Facebook" }));
    await waitFor(() => expect(apiFetch.mock.calls.at(-1)?.[0]).toMatch(/&channel=facebook$/));
    expect(screen.getByRole("button", { name: "Channel: Facebook" })).toBeInTheDocument();
  });

  it("sends the question to Ask Edith", async () => {
    renderHome();
    const ask = screen.getByRole("button", { name: "Ask" });
    expect(ask).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Ask Edith"), { target: { value: "  Which orders are risky today? " } });
    fireEvent.click(ask);
    expect(screen.getByTestId("location")).toHaveTextContent('/order-chat {"prompt":"Which orders are risky today?"}');
  });
});

describe("globe projection", () => {
  it("puts the centre in the middle and hides the far side", () => {
    expect(projectPoint(68.4, 15.8, 68.4, 15.8)).toMatchObject({ x: 390, y: 390, depth: 1 });
    expect(projectPoint(68.4 + 180, -15.8, 68.4, 15.8)).toBeNull();
    const dhaka = projectPoint(90.4, 23.8, 68.4, 15.8)!;
    expect(dhaka.x).toBeGreaterThan(390);
    expect(dhaka.y).toBeLessThan(390);
  });
});

describe("sparkline curve", () => {
  it("passes through every point without overshooting a flat stretch", () => {
    const d = smoothPath([[0, 10], [10, 2], [20, 2], [30, 2]]);
    expect(d.startsWith("M0.00,10.00")).toBe(true);
    expect(d).toContain(" 10.00,2.00");
    expect(d).toContain(" 30.00,2.00");
    // Control points on the flat part stay on the line (y = 2), so it never bulges above it.
    const controls = [...d.matchAll(/C([\d.]+),([\d.]+) ([\d.]+),([\d.]+)/g)].slice(1);
    for (const [, , y1, , y2] of controls) {
      expect(Number(y1)).toBeGreaterThanOrEqual(2);
      expect(Number(y2)).toBeGreaterThanOrEqual(2);
    }
  });
});
