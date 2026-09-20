import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));
vi.mock("@/components/DateRangePicker", () => ({
  DateRangePicker: ({ onChange }: { onChange: (range: { from: Date; to: Date } | null) => void }) => (
    <button type="button" onClick={() => onChange(null)}>All time</button>
  ),
}));

import { apiFetch } from "@/lib/api";
import BusinessReport from "@/pages/BusinessReport";

type Metrics = {
  intake_count: number;
  order_value: number;
  approved_count: number;
  approved_value: number;
  cancelled_count: number;
  cancelled_value: number;
  returned_count: number;
  returned_value: number;
  pending_count: number;
  pending_value: number;
  delivery_charged: number;
  courier_fees_recorded: number;
  net_delivery_position: number;
  courier_fee_order_count: number;
};

type BusinessReportResponse = {
  range: { from: string | null; to: string | null };
  summary: Metrics;
  series: {
    granularity: "hour" | "day";
    label: string;
    buckets: Array<{ key: string; label: string; intake_count: number; order_value: number }>;
  };
  sources: Array<Metrics & {
    source: string;
    label: string;
    landing_pages: Array<{
      path: string | null;
      label: string;
      intake_count: number;
      order_value: number;
      approved_count: number;
      cancelled_count: number;
      returned_count: number;
      pending_count: number;
    }>;
  }>;
};

function metrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    intake_count: 0,
    order_value: 0,
    approved_count: 0,
    approved_value: 0,
    cancelled_count: 0,
    cancelled_value: 0,
    returned_count: 0,
    returned_value: 0,
    pending_count: 0,
    pending_value: 0,
    delivery_charged: 0,
    courier_fees_recorded: 0,
    net_delivery_position: 0,
    courier_fee_order_count: 0,
    ...overrides,
  };
}

function hourlyBuckets() {
  return Array.from({ length: 24 }, (_, hour) => {
    const label = `${hour % 12 || 12}${hour < 12 ? "a" : "p"}`;
    return {
      key: `2026-09-20-${hour}`,
      label,
      intake_count: hour === 9 ? 2 : 0,
      order_value: hour === 9 ? 1400 : 0,
    };
  });
}

function reportResponse(overrides: Partial<BusinessReportResponse> = {}): BusinessReportResponse {
  return {
    range: { from: "2026-09-20", to: "2026-09-20" },
    summary: metrics({
      intake_count: 4,
      order_value: 2400,
      approved_count: 1,
      approved_value: 1000,
      cancelled_count: 1,
      cancelled_value: 400,
      returned_count: 1,
      returned_value: 700,
      pending_count: 1,
      pending_value: 300,
      delivery_charged: 120,
      courier_fees_recorded: 130,
      net_delivery_position: -10,
      courier_fee_order_count: 3,
    }),
    series: {
      granularity: "hour",
      label: "Intake by hour",
      buckets: hourlyBuckets(),
    },
    sources: [
      {
        source: "website",
        label: "Website",
        ...metrics({
          intake_count: 2,
          order_value: 1400,
          approved_count: 1,
          approved_value: 1000,
          cancelled_count: 1,
          cancelled_value: 400,
          delivery_charged: 120,
          courier_fees_recorded: 80,
          net_delivery_position: 40,
          courier_fee_order_count: 1,
        }),
        landing_pages: [
          {
            path: "/step/katimon-mango",
            label: "/step/katimon-mango",
            intake_count: 1,
            order_value: 1000,
            approved_count: 1,
            cancelled_count: 0,
            returned_count: 0,
            pending_count: 0,
          },
          {
            path: null,
            label: "Other website",
            intake_count: 1,
            order_value: 400,
            approved_count: 0,
            cancelled_count: 1,
            returned_count: 0,
            pending_count: 0,
          },
        ],
      },
      {
        source: "manual_other",
        label: "Manual / Other",
        ...metrics({
          intake_count: 2,
          order_value: 1000,
          returned_count: 1,
          returned_value: 700,
          pending_count: 1,
          pending_value: 300,
          courier_fees_recorded: 50,
          net_delivery_position: -50,
          courier_fee_order_count: 2,
        }),
        landing_pages: [],
      },
    ],
    ...overrides,
  };
}

function jsonResponse(body: BusinessReportResponse) {
  return { ok: true, json: async () => body };
}

function renderPage(): ReturnType<typeof render> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BusinessReport />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("BusinessReport", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-09-20T06:00:00.000Z"));
    apiFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a centered loading state while the report is pending", () => {
    apiFetch.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText("Loading business report")).toBeInTheDocument();
  });

  it("loads today by default and renders operational totals with an accessible intake chart", async () => {
    apiFetch.mockResolvedValue(jsonResponse(reportResponse()));

    renderPage();

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith("/api/reports/business?from=2026-09-20&to=2026-09-20");
    });

    expect(await screen.findByRole("heading", { name: "Business Report" })).toBeInTheDocument();
    expect(screen.getByTestId("business-report-summary-intake")).toHaveTextContent("4");
    expect(screen.getByTestId("business-report-summary-order-value")).toHaveTextContent("৳2,400");
    expect(screen.getByTestId("business-report-summary-approved")).toHaveTextContent("1");
    expect(screen.getByTestId("business-report-summary-cancelled")).toHaveTextContent("1");
    expect(screen.getByText("Delivery charged")).toBeInTheDocument();
    expect(screen.getByText("Courier fees recorded")).toBeInTheDocument();
    expect(screen.getByText("Net delivery position")).toBeInTheDocument();
    expect(screen.getByText("Courier fee coverage: 3 of 4 orders")).toBeInTheDocument();

    const chart = screen.getByRole("region", { name: "Intake by hour" });
    expect(within(chart).getByLabelText("9a: 2 orders")).toBeInTheDocument();
  });

  it("keeps source outcomes and fee coverage visible, then expands Website landing pages", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue(jsonResponse(reportResponse()));

    renderPage();

    const website = await screen.findByTestId("business-report-source-website");
    expect(within(website).getByText("Intake 2")).toBeInTheDocument();
    expect(within(website).getByText("Approved 1")).toBeInTheDocument();
    expect(within(website).getByText("Cancelled 1")).toBeInTheDocument();
    expect(within(website).getByText("RTO 0")).toBeInTheDocument();
    expect(within(website).getByText("Pending 0")).toBeInTheDocument();
    expect(within(website).getByText("Courier fee coverage: 1 of 2 orders")).toBeInTheDocument();
    expect(within(website).getByText("Approved 1")).toHaveClass("bg-status-lime-background");
    expect(within(website).getByText("Cancelled 1")).toHaveClass("bg-status-rose-background");
    expect(within(website).getByText("RTO 0")).toHaveClass("bg-status-yellow-background");
    expect(within(website).getByText("Intake 2")).toHaveClass("bg-status-blue-background");

    await user.click(within(website).getByRole("button", { name: "Show details for Website" }));

    expect(within(website).getByRole("button", { name: "Hide details for Website" })).toBeInTheDocument();
    expect(within(website).getByText("Landing pages")).toBeInTheDocument();
    expect(within(website).getByText("/step/katimon-mango")).toBeInTheDocument();
    expect(within(website).getByText("Other website")).toBeInTheDocument();
    expect(within(website).getByText("Fee coverage")).toBeInTheDocument();
  });

  it("removes date parameters when the user chooses All Time", async () => {
    const user = userEvent.setup();
    apiFetch.mockResolvedValue(jsonResponse(reportResponse()));

    renderPage();

    await screen.findByRole("heading", { name: "Business Report" });
    await user.click(screen.getByRole("button", { name: "All time" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenLastCalledWith("/api/reports/business");
    });
  });

  it("keeps controls available and explains when no regular orders exist in the selected range", async () => {
    apiFetch.mockResolvedValue(jsonResponse(reportResponse({
      summary: metrics(),
      sources: [],
      series: { granularity: "hour", label: "Intake by hour", buckets: hourlyBuckets().map((bucket) => ({ ...bucket, intake_count: 0, order_value: 0 })) },
    })));

    renderPage();

    expect(await screen.findByRole("heading", { name: "Business Report" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All time" })).toBeInTheDocument();
    expect(screen.getByText("No regular orders were created in this range.")).toBeInTheDocument();
    expect(screen.queryByText("Delivery charged")).not.toBeInTheDocument();
    expect(screen.queryByTestId("business-report-source-website")).not.toBeInTheDocument();
  });

  it("offers a retry after a report request fails", async () => {
    const user = userEvent.setup();
    apiFetch
      .mockRejectedValueOnce(new Error("Network down"))
      .mockResolvedValueOnce(jsonResponse(reportResponse()));

    renderPage();

    expect(await screen.findByText("Could not load business report")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Business Report" })).toBeInTheDocument();
  });
});
