import { describe, expect, it } from "vitest";
import type { BusinessReportSource, Metrics, ProductWeight, SeriesBucket } from "@/components/business-report/types";
import {
  GRID_ROWS,
  approvalBand,
  approvalGaugeOption,
  bestDayOption,
  intakeGridOption,
  outcomeSankeyOption,
  productRingsOption,
  sourceMixOption,
} from "@/lib/businessReportCharts";

type SeriesLike = { type: string; data: unknown[]; links?: Array<{ source: string; target: string; value: number }> };
const seriesOf = (option: unknown) => (option as { series: SeriesLike[] }).series;

function bucket(index: number, intake: number, value = intake * 100, website = 0): SeriesBucket {
  return { key: `k${index}`, label: `L${index}`, intake_count: intake, order_value: value, website_value: website, order_kg: 0, approved_count: 0, cancelled_count: 0 };
}

function source(key: string, label: string, overrides: Partial<Metrics>): BusinessReportSource {
  const zero: Metrics = {
    intake_count: 0, order_value: 0, approved_count: 0, approved_value: 0, cancelled_count: 0, cancelled_value: 0,
    returned_count: 0, returned_value: 0, pending_count: 0, pending_value: 0, delivery_charged: 0,
    courier_fees_recorded: 0, net_delivery_position: 0, courier_fee_order_count: 0, order_kg: 0, approved_kg: 0,
    cancelled_kg: 0, returned_kg: 0, pending_kg: 0, weight_order_count: 0,
  };
  return { source: key, label, products: [], landing_pages: [], ...zero, ...overrides };
}

describe("intakeGridOption", () => {
  it("scales cells so the peak hour fits the grid and reports the peak", () => {
    const profile = Array.from({ length: 24 }, (_, hour) => bucket(hour, hour === 21 ? 130 : 10));
    const { ordersPerCell, peakIndex, option } = intakeGridOption(profile);

    expect(peakIndex).toBe(21);
    expect(ordersPerCell).toBe(10); // ceil(130 / 14)
    expect(ordersPerCell * GRID_ROWS).toBeGreaterThanOrEqual(130);
    expect(seriesOf(option)).toHaveLength(2);
  });

  it("repeats exactly GRID_ROWS cells per column regardless of chart height", () => {
    const { option } = intakeGridOption(Array.from({ length: 24 }, (_, hour) => bucket(hour, hour)));
    const series = seriesOf(option) as Array<SeriesLike & { symbolRepeat?: unknown }>;
    expect(series.map((entry) => entry.symbolRepeat)).toEqual([GRID_ROWS, GRID_ROWS]);
  });

  it("uses one order per cell when there is no intake", () => {
    const { ordersPerCell, peakIndex } = intakeGridOption(Array.from({ length: 24 }, (_, hour) => bucket(hour, 0)));
    expect(ordersPerCell).toBe(1);
    expect(peakIndex).toBe(-1);
  });
});

describe("outcomeSankeyOption", () => {
  it("links each source to each non-zero outcome by value and omits zero links", () => {
    const option = outcomeSankeyOption([
      source("website", "Website", { order_value: 1000, approved_value: 800, cancelled_value: 200 }),
      source("facebook", "Facebook", { order_value: 500, approved_value: 300, pending_value: 100, returned_value: 100 }),
    ]);
    const [sankey] = seriesOf(option);
    const links = sankey.links ?? [];

    expect(links).toContainEqual(expect.objectContaining({ source: "Website", target: "Approved", value: 800 }));
    expect(links).toContainEqual(expect.objectContaining({ source: "Facebook", target: "RTO", value: 100 }));
    expect(links.some((link) => link.value === 0)).toBe(false);
    expect(links.reduce((sum, link) => sum + link.value, 0)).toBe(1500);
  });
});

describe("sourceMixOption", () => {
  it("renders one slice per mix entry", () => {
    const [pie] = seriesOf(sourceMixOption([{ label: "A", value: 60 }, { label: "Other", value: 40 }]));
    expect(pie.data).toHaveLength(2);
  });
});

describe("bestDayOption", () => {
  it("stacks website under social & manual and highlights only the best bucket", () => {
    const buckets = [bucket(0, 5, 1000, 400), bucket(1, 9, 3000, 1000), bucket(2, 4, 800, 800)];
    const series = seriesOf(bestDayOption(buckets, 1));
    const website = series.find((entry) => (entry as { name?: string }).name === "Website")!;
    const other = series.find((entry) => (entry as { name?: string }).name === "Social & manual")!;
    const values = (data: unknown[]) => data.map((item) => (item as { value: number }).value);

    expect(values(website.data)).toEqual([400, 1000, 800]);
    expect(values(other.data)).toEqual([600, 2000, 0]);
    const colors = (other.data as Array<{ itemStyle: { color: string } }>).map((item) => item.itemStyle.color);
    expect(new Set([colors[0], colors[2]]).size).toBe(1);
    expect(colors[1]).not.toBe(colors[0]);
  });
});

describe("approvalBand", () => {
  it("maps approval rate to a named band", () => {
    expect(approvalBand(55).label).toBe("Needs attention");
    expect(approvalBand(70).label).toBe("Watch");
    expect(approvalBand(79.5).label).toBe("Healthy");
    expect(approvalBand(93).label).toBe("Excellent");
  });
});

describe("approvalGaugeOption", () => {
  it("hides the gauge's own value readout so the panel text is the only one", () => {
    const [gauge] = (approvalGaugeOption(79.5) as { series: Array<{ detail: { show?: boolean } }> }).series;
    expect(gauge.detail.show).toBe(false);
  });
});

describe("productRingsOption", () => {
  it("escapes product names in the tooltip", () => {
    const option = productRingsOption([
      {
        product_id: null, product_name: "<img src=x onerror=alert(1)>", packs: 1, kg: 5, approved_packs: 1, approved_kg: 5,
        cancelled_packs: 0, cancelled_kg: 0, returned_packs: 0, returned_kg: 0, pending_packs: 0, pending_kg: 0, order_count: 1,
      } satisfies ProductWeight,
    ]);
    const { formatter } = (option as { tooltip: { formatter: (params: { name: string; value: number }) => string } }).tooltip;
    const html = formatter({ name: "<img src=x onerror=alert(1)>", value: 5 });
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img");
  });
});
