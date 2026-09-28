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
vi.mock("@/components/business-report/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}));

import { apiFetch } from "@/lib/api";
import type { BusinessReportResponse, Metrics, ProductWeight, SeriesBucket } from "@/components/business-report/types";
import BusinessReport from "@/pages/BusinessReport";

const apiFetchMock = vi.mocked(apiFetch);

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
    order_kg: 0,
    approved_kg: 0,
    cancelled_kg: 0,
    returned_kg: 0,
    pending_kg: 0,
    weight_order_count: 0,
    ...overrides,
  };
}

function hourlyBuckets(): SeriesBucket[] {
  return Array.from({ length: 24 }, (_, hour) => {
    const label = `${hour % 12 || 12}${hour < 12 ? "a" : "p"}`;
    return {
      key: `2026-09-20-${hour}`,
      label,
      intake_count: hour === 9 ? 2 : 0,
      order_value: hour === 9 ? 1400 : 0,
      website_value: 0,
      order_kg: 0,
      approved_count: 0,
      cancelled_count: 0,
    };
  });
}

function dailyBuckets(): SeriesBucket[] {
  return Array.from({ length: 7 }, (_, index) => ({
    key: `2026-09-${14 + index}`,
    label: `Sep ${14 + index}`,
    intake_count: 80 + index * 5,
    order_value: (80 + index * 5) * 100,
    website_value: 0,
    order_kg: 0,
    approved_count: 0,
    cancelled_count: 0,
  }));
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
        products: [],
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
            order_kg: 0,
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
            order_kg: 0,
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
        products: [],
        landing_pages: [],
      },
    ],
    products: [],
    missing_weight_products: [],
    previous: null,
    hourly_profile: hourlyBuckets().map((bucket, hour) => ({ ...bucket, key: `hour-${hour}` })),
    ...overrides,
  };
}

function jsonResponse(body: BusinessReportResponse) {
  return { ok: true, json: async () => body } as unknown as Response;
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
    apiFetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows a centered loading state while the report is pending", () => {
    apiFetchMock.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText("Loading business report")).toBeInTheDocument();
  });

  it("loads today by default and renders operational totals", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse()));

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
  });

  it("renders the intake rhythm with its peak hour and the outcome panels", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse()));

    renderPage();

    const rhythm = await screen.findByRole("region", { name: "When orders arrive" });
    expect(within(rhythm).getByText("9a")).toBeInTheDocument(); // peak label
    expect(within(rhythm).getByRole("img", { name: /Orders by hour of day, peak 9a with 2 orders/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Where each channel's orders end up" })).toBeInTheDocument();
    const mix = screen.getByRole("region", { name: "Order value by channel" });
    expect(within(mix).getByText("Website")).toBeInTheDocument();
    expect(within(mix).getByText("৳1,400")).toBeInTheDocument();
    const gauge = screen.getByRole("region", { name: "Approval rate" });
    expect(within(gauge).getByText("25%", { selector: "p" })).toBeInTheDocument();
    expect(within(gauge).getByText("Needs attention")).toBeInTheDocument();
  });

  it("breaks approval down by outcome and shows per-order delivery figures with coverage", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse({
      summary: { ...reportResponse().summary, approved_count: 2, pending_count: 0, weight_order_count: 3 },
    })));

    renderPage();

    const gauge = await screen.findByRole("region", { name: "Approval rate" });
    const outcomes = within(gauge).getByRole("list", { name: "Order outcomes" });
    expect(within(outcomes).getAllByRole("listitem")).toHaveLength(4);
    expect(within(outcomes).getByText("Approved").closest("li")).toHaveTextContent("250%");
    expect(within(outcomes).getByText("Pending").closest("li")).toHaveTextContent("00%");
    expect(within(outcomes).getByText("RTO").closest("li")).toHaveTextContent("125%");

    const delivery = screen.getByRole("region", { name: "Charges vs courier fees" });
    expect(within(delivery).getByText("Net delivery position")).toBeInTheDocument();
    expect(within(delivery).getByText("−৳10")).toBeInTheDocument();
    const perOrder = within(delivery).getByRole("list", { name: "Per-order figures" });
    expect(within(perOrder).getByText("Avg charge per approved order").closest("li")).toHaveTextContent("৳60");
    expect(within(perOrder).getByText("Avg courier fee per recorded order").closest("li")).toHaveTextContent("৳43");
    expect(within(perOrder).getByText("Net per order").closest("li")).toHaveTextContent("−৳3");
    expect(within(delivery).getByText("Courier fee coverage: 3 of 4 orders")).toBeInTheDocument();
    expect(within(delivery).getByText("Weight recorded on 3 of 4 orders")).toBeInTheDocument();
  });

  it("hides Best day for a single-day range and shows it with the best day for a multi-day range", async () => {
    apiFetchMock.mockResolvedValueOnce(jsonResponse(reportResponse()));
    const first = renderPage();
    await screen.findByRole("region", { name: "When orders arrive" });
    expect(screen.queryByRole("region", { name: "Best day" })).not.toBeInTheDocument();
    first.unmount();

    const days = dailyBuckets().map((bucket, index) => ({ ...bucket, website_value: index === 6 ? 5000 : 0 }));
    apiFetchMock.mockResolvedValueOnce(jsonResponse(reportResponse({
      range: { from: "2026-09-14", to: "2026-09-20" },
      series: { granularity: "day", label: "Intake by day", buckets: days },
    })));
    renderPage();

    const best = await screen.findByRole("region", { name: "Best day" });
    expect(within(best).getByText("৳11,000")).toBeInTheDocument(); // Sep 20: (80 + 6*5) * 100
    expect(within(best).getByText(/Sep 20/)).toBeInTheDocument();
    expect(within(best).getByText(/45% website/)).toBeInTheDocument();
  });

  it("hides Best day for All time because the series only covers recent active days", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse({
      range: { from: null, to: null },
      series: { granularity: "day", label: "Recent intake activity", buckets: dailyBuckets() },
    })));

    renderPage();

    expect(await screen.findByRole("region", { name: "When orders arrive" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Best day" })).not.toBeInTheDocument();
  });

  it("lists overall product weight with approved kg and packs", async () => {
    const outcomeDefaults = { cancelled_packs: 0, cancelled_kg: 0, returned_packs: 0, returned_kg: 0, pending_packs: 0, pending_kg: 0 };
    const himsagar = { ...outcomeDefaults, product_id: "p-1", product_name: "Himsagar", packs: 4, kg: 25, approved_packs: 3, approved_kg: 20, cancelled_packs: 1, cancelled_kg: 5, order_count: 2 };
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse({ products: [himsagar], missing_weight_products: [{ id: "p-2", name: "Langra" }] })));

    renderPage();

    const overall = await screen.findByRole("region", { name: "Product weight" });
    expect(within(overall).getAllByText("Himsagar")).toHaveLength(2); // ring label + list row
    expect(within(within(overall).getByRole("list")).getByText("Himsagar")).toBeInTheDocument();
    expect(within(overall).getByText("25 kg")).toBeInTheDocument();
    expect(within(overall).getByText("20 kg approved · 4 packs")).toBeInTheDocument();
    expect(within(overall).getByText("25 kg · 1 product")).toBeInTheDocument();
    expect(screen.getByText(/1 product is missing a catalog weight: Langra/)).toBeInTheDocument();
  });

  it("shows previous-period changes on the summary tiles for a bounded range", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse({
      previous: {
        range: { from: "2026-09-19", to: "2026-09-19" },
        summary: metrics({ intake_count: 2, order_value: 2000, approved_count: 1, cancelled_count: 0 }),
      },
    })));

    renderPage();

    expect(await screen.findByTestId("business-report-summary-intake")).toHaveTextContent("+100% vs previous period");
    expect(screen.getByTestId("business-report-summary-order-value")).toHaveTextContent("+20% vs previous period");
    // approved 1 of 4 = 25% now vs 1 of 2 = 50% before
    expect(screen.getByTestId("business-report-summary-approved")).toHaveTextContent("−25 pts");
    // cancelled 1 of 4 = 25% now vs 0% before
    expect(screen.getByTestId("business-report-summary-cancelled")).toHaveTextContent("+25 pts");
  });

  it("omits previous-period changes when the previous period had no orders", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse({
      previous: {
        range: { from: "2026-09-19", to: "2026-09-19" },
        summary: metrics({ intake_count: 0 }),
      },
    })));

    renderPage();

    expect(await screen.findByTestId("business-report-summary-intake")).not.toHaveTextContent("vs previous period");
    expect(screen.getByTestId("business-report-summary-approved")).not.toHaveTextContent("pts");
    expect(screen.getByTestId("business-report-summary-cancelled")).not.toHaveTextContent("pts");
  });

  it("omits previous-period changes when there is no previous period", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse()));

    renderPage();

    expect(await screen.findByTestId("business-report-summary-intake")).not.toHaveTextContent("vs previous period");
  });

  it("shows kg totals in the summary", async () => {
    const base = reportResponse();
    apiFetchMock.mockResolvedValue(jsonResponse({
      ...base,
      summary: { ...base.summary, order_kg: 12.5, approved_kg: 5, cancelled_kg: 2.5, weight_order_count: 3 },
    }));

    renderPage();

    const weight = await screen.findByTestId("business-report-summary-weight");
    expect(weight).toHaveTextContent("12.5 kg");
    expect(weight).toHaveTextContent("Recorded on 3 of 4 orders");
    expect(screen.getByTestId("business-report-summary-approved")).toHaveTextContent("5 kg");
  });

  it("compares sources in a table with rates and flags the weaker source", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse()));

    renderPage();

    const table = await screen.findByRole("table", { name: "Source performance" });
    const website = within(table).getByTestId("business-report-source-website");
    const manual = within(table).getByTestId("business-report-source-manual_other");
    expect(within(website).getByText("50%")).toBeInTheDocument(); // approval 1 of 2
    expect(within(website).getByText("28.6%")).toBeInTheDocument(); // loss 400 of 1,400
    expect(within(manual).getByText("0%")).toBeInTheDocument(); // approval 0 of 2 → flagged
    expect(within(manual).getByText("0%")).toHaveAttribute("data-flag", "worse");
    expect(within(manual).getByText("−৳25")).toBeInTheDocument(); // net −50 over 2 orders
    expect(screen.getByText("Courier fees recorded on 3 of 4 orders · weight on 0 of 4")).toBeInTheDocument();
  });

  it("prints a rounded-to-zero net delivery position as ৳0 without a sign or red", async () => {
    const user = userEvent.setup();
    const base = reportResponse();
    apiFetchMock.mockResolvedValue(jsonResponse({
      ...base,
      sources: [{ ...base.sources[0], net_delivery_position: -0.4 }, base.sources[1]],
    }));

    renderPage();

    const table = await screen.findByRole("table", { name: "Source performance" });
    const website = within(table).getByTestId("business-report-source-website");
    const netCell = within(website).getAllByRole("cell").at(-1);
    expect(netCell).toHaveTextContent(/^৳0$/);
    expect(netCell).not.toHaveClass("text-[#B4473A]");

    await user.click(within(table).getByRole("button", { name: "Show products for Website" }));
    const net = within(table).getByText("Net").nextElementSibling;
    expect(net).toHaveTextContent(/^৳0$/);
    expect(net).not.toHaveClass("text-[#B4473A]");
  });

  it("counts only sources and outcomes that carry order value in the outcome badge", async () => {
    const base = reportResponse();
    apiFetchMock.mockResolvedValueOnce(jsonResponse(base));
    const first = renderPage();
    const flow = await screen.findByRole("region", { name: "Where each channel's orders end up" });
    expect(within(flow).getByText("2 sources · 4 outcomes")).toBeInTheDocument();
    first.unmount();

    const empty = { ...base.sources[1], source: "facebook", label: "Facebook", ...metrics({}) };
    const approvedOnly = { ...base.sources[0], ...metrics({ intake_count: 1, order_value: 500, approved_count: 1, approved_value: 500 }) };
    apiFetchMock.mockResolvedValueOnce(jsonResponse({ ...base, sources: [approvedOnly, empty] }));
    renderPage();
    const single = await screen.findByRole("region", { name: "Where each channel's orders end up" });
    expect(within(single).getByText("1 source · 1 outcome")).toBeInTheDocument();
  });

  it("sorts sources when a column header is clicked", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse()));

    renderPage();

    const table = await screen.findByRole("table", { name: "Source performance" });
    const firstSource = () => within(table).getAllByTestId(/^business-report-source-/)[0];
    expect(firstSource()).toHaveAttribute("data-testid", "business-report-source-website"); // default: order value desc

    await user.click(within(table).getByRole("button", { name: /^Loss/ }));
    expect(firstSource()).toHaveAttribute("data-testid", "business-report-source-manual_other"); // 70% loss first
  });

  it("expands a source to show landing pages and products by outcome with kg", async () => {
    const user = userEvent.setup();
    const outcomeDefaults = { pending_packs: 0, pending_kg: 0 };
    const himsagar = { ...outcomeDefaults, product_id: "p-1", product_name: "Himsagar", packs: 4, kg: 20, approved_packs: 3, approved_kg: 18, cancelled_packs: 1, cancelled_kg: 2, returned_packs: 0, returned_kg: 0, order_count: 2 };
    const fazli = { ...outcomeDefaults, product_id: "p-2", product_name: "Fazli", packs: 2, kg: 10, approved_packs: 1, approved_kg: 6, cancelled_packs: 0, cancelled_kg: 1, returned_packs: 1, returned_kg: 3, order_count: 2 };
    const base = reportResponse();
    apiFetchMock.mockResolvedValue(jsonResponse({ ...base, sources: [{ ...base.sources[0], products: [himsagar, fazli] }, base.sources[1]] }));

    renderPage();

    const table = await screen.findByRole("table", { name: "Source performance" });
    expect(within(table).queryByRole("table", { name: "Website products by outcome" })).not.toBeInTheDocument();

    await user.click(within(table).getByRole("button", { name: "Show products for Website" }));

    expect(within(table).getByRole("button", { name: "Hide products for Website" })).toHaveAttribute("aria-expanded", "true");
    expect(within(table).getByText("/step/katimon-mango")).toBeInTheDocument();
    expect(within(table).getByText("1 order · ৳1,000")).toBeInTheDocument();
    const products = within(table).getByRole("table", { name: "Website products by outcome" });
    const fazliRow = within(products).getByRole("row", { name: /Fazli/ });
    expect(within(fazliRow).getByText("10 kg")).toBeInTheDocument();
    expect(within(fazliRow).getByText("6")).toBeInTheDocument(); // approved kg
    expect(within(fazliRow).getByText("3")).toBeInTheDocument(); // RTO kg
    expect(within(fazliRow).getByText("40%")).toHaveAttribute("data-flag", "worse"); // loss 4/10 = 40% vs all products 6/30 = 20%
    const himsagarRow = within(products).getByRole("row", { name: /Himsagar/ });
    expect(himsagarRow.querySelector("[data-flag]")).toBeNull(); // loss 2/20 = 10%, not flagged
    expect(within(products).getByRole("row", { name: /All products/ })).toHaveTextContent("30 kg");
  });

  it("shows a dash instead of 0% loss for a product with no recorded weight", async () => {
    const user = userEvent.setup();
    const langra = { product_id: "p-3", product_name: "Langra", packs: 3, kg: 0, approved_packs: 3, approved_kg: 0, cancelled_packs: 0, cancelled_kg: 0, returned_packs: 0, returned_kg: 0, pending_packs: 0, pending_kg: 0, order_count: 1 };
    const base = reportResponse();
    apiFetchMock.mockResolvedValue(jsonResponse({ ...base, sources: [{ ...base.sources[0], products: [langra] }, base.sources[1]] }));

    renderPage();

    const table = await screen.findByRole("table", { name: "Source performance" });
    await user.click(within(table).getByRole("button", { name: "Show products for Website" }));

    const products = within(table).getByRole("table", { name: "Website products by outcome" });
    const langraRow = within(products).getByRole("row", { name: /Langra/ });
    expect(within(langraRow).getByText("3 packs")).toBeInTheDocument();
    const langraCells = within(langraRow).getAllByRole("cell");
    expect(langraCells[langraCells.length - 1]).toHaveTextContent(/^—$/);
    expect(within(langraRow).queryByText("0%")).not.toBeInTheDocument();
    const totalCells = within(within(products).getByRole("row", { name: /All products/ })).getAllByRole("cell");
    expect(totalCells[totalCells.length - 1]).toHaveTextContent(/^—$/);
    expect(products.querySelector("[data-flag]")).toBeNull();
  });

  it("expands and collapses every source at once", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse()));

    renderPage();

    const table = await screen.findByRole("table", { name: "Source performance" });
    await user.click(screen.getByRole("button", { name: "Expand all" }));
    expect(within(table).getByRole("button", { name: "Hide products for Website" })).toBeInTheDocument();
    expect(within(table).getByRole("button", { name: "Hide products for Manual / Other" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(within(table).getByRole("button", { name: "Show products for Website" })).toBeInTheDocument();
  });

  it("removes date parameters when the user chooses All Time", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse()));

    renderPage();

    await screen.findByRole("heading", { name: "Business Report" });
    await user.click(screen.getByRole("button", { name: "All time" }));

    await waitFor(() => {
      expect(apiFetch).toHaveBeenLastCalledWith("/api/reports/business");
    });
  });

  it("keeps controls available and explains when no regular orders exist in the selected range", async () => {
    apiFetchMock.mockResolvedValue(jsonResponse(reportResponse({
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
    apiFetchMock
      .mockRejectedValueOnce(new Error("Network down"))
      .mockResolvedValueOnce(jsonResponse(reportResponse()));

    renderPage();

    expect(await screen.findByText("Could not load business report")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Business Report" })).toBeInTheDocument();
  });
});
