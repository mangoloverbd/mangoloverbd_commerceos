import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import Overview from "../../src/pages/Overview";

vi.mock("../../src/lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("../../src/components/DateRangePicker", () => ({
  DateRangePicker: ({ value, onChange }: { value: unknown; onChange: unknown }) => (
    <div data-testid="date-range-picker">DateRangePicker</div>
  ),
}));

import { apiFetch } from "../../src/lib/api";

const mockOverviewData = {
  kpis: {
    totalOrders: { value: 245, trend: 12.4, previousValue: 218 },
    revenue: { value: 184320, trend: 8.2, previousValue: 170280 },
    profitMargin: { value: 23.5, trend: -2.1, previousValue: 25.6 },
    deliverySuccess: { value: 87.3, trend: 3.2, previousValue: 84.1 },
    unreadMessages: { value: 12, trend: -40, previousValue: 20 },
  },
  orderVolumeSeries: [
    { date: "2026-08-07", current: 32, previous: 28 },
    { date: "2026-08-08", current: 45, previous: 30 },
    { date: "2026-08-09", current: 38, previous: 35 },
    { date: "2026-08-10", current: 50, previous: 40 },
    { date: "2026-08-11", current: 42, previous: 38 },
    { date: "2026-08-12", current: 55, previous: 42 },
    { date: "2026-08-13", current: 48, previous: 45 },
  ],
  revenueSeries: [
    { date: "2026-08-07", revenue: 12400, cog: 7200, shipping: 1800, profit: 3400 },
    { date: "2026-08-08", revenue: 15600, cog: 8100, shipping: 2200, profit: 5300 },
    { date: "2026-08-09", revenue: 11200, cog: 6800, shipping: 1600, profit: 2800 },
    { date: "2026-08-10", revenue: 18900, cog: 9500, shipping: 2500, profit: 6900 },
    { date: "2026-08-11", revenue: 14300, cog: 7600, shipping: 2000, profit: 4700 },
    { date: "2026-08-12", revenue: 21000, cog: 10200, shipping: 2800, profit: 8000 },
    { date: "2026-08-13", revenue: 17500, cog: 8900, shipping: 2300, profit: 6300 },
  ],
  courierPerformance: {
    steadfast: { delivered: 180, in_transit: 20, failed: 12, pending: 8 },
    pathao: { delivered: 95, in_transit: 8, failed: 5, pending: 3 },
  },
  socialInbox: {
    unread: 12,
    avgResponseTimeMinutes: 45,
    conversationsToday: 28,
    byChannel: { facebook: 18, instagram: 7, whatsapp: 3 },
  },
  customerRetention: {
    repeatRate: 34.2,
    repeatCustomers: 84,
    totalCustomers: 245,
    topCustomers: [
      { name: "Ayesha", phone: "01711111111", orderCount: 12, totalSpent: 45200 },
      { name: "Bashir", phone: "01722222222", orderCount: 8, totalSpent: 32100 },
    ],
  },
};

describe("Overview Page", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockOverviewData),
    } as Response);
  });

  it("renders all KPI cards", async () => {
    render(<Overview />);
    await waitFor(() => {
      expect(screen.getByText("Total Orders")).toBeInTheDocument();
      expect(screen.getByText("Revenue")).toBeInTheDocument();
      expect(screen.getByText("Profit Margin")).toBeInTheDocument();
      expect(screen.getByText("Delivery Success")).toBeInTheDocument();
      expect(screen.getByText("Unread Messages")).toBeInTheDocument();
    });
  });

  it("renders chart titles", async () => {
    render(<Overview />);
    await waitFor(() => {
      expect(screen.getByText("Order Volume")).toBeInTheDocument();
      expect(screen.getByText("Revenue vs Costs")).toBeInTheDocument();
    });
  });

  it("renders panel titles", async () => {
    render(<Overview />);
    await waitFor(() => {
      expect(screen.getByText("Courier Performance")).toBeInTheDocument();
      expect(screen.getByText("Inbox Activity")).toBeInTheDocument();
      expect(screen.getByText("Retention")).toBeInTheDocument();
    });
  });

  it("displays correct KPI values", async () => {
    render(<Overview />);
    await waitFor(() => {
      expect(screen.getByText("245")).toBeInTheDocument();
      expect(screen.getAllByText("12").length).toBeGreaterThanOrEqual(1);
    });
  });
});
