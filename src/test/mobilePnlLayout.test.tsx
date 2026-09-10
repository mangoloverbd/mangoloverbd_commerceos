import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MobilePnlLayout } from "@/components/MobilePnlLayout";

const metrics = [
  { key: "revenue", label: "Revenue" },
  { key: "net-profit", label: "Net Profit" },
  { key: "ad-spend", label: "Ad Spend" },
  { key: "shipping", label: "Shipping" },
  { key: "cog", label: "Cost of Goods" },
] as const;

describe("MobilePnlLayout", () => {
  it("makes revenue the only hero and keeps the other metrics in the supporting grid", () => {
    render(
      <MobilePnlLayout
        metrics={metrics}
        renderMetric={(metric) => <div data-testid={`metric-${metric.key}`}>{metric.label}</div>}
      />,
    );

    const layout = screen.getByTestId("mobile-pnl");
    expect(layout).toHaveAttribute("data-order", "revenue,net-profit,ad-spend,shipping,cog");
    expect(layout).toHaveClass("relative", "z-10");
    expect(within(layout).getByTestId("metric-revenue").parentElement).toHaveClass("mobile-pnl-revenue");
    expect(within(layout).getByTestId("metric-net-profit").parentElement).toHaveClass("mobile-pnl-supporting");
    expect(within(layout).getByTestId("metric-ad-spend").parentElement).toHaveClass("mobile-pnl-supporting");
    expect(within(layout).getByTestId("metric-shipping").parentElement).toHaveClass("mobile-pnl-supporting");
    expect(within(layout).getByTestId("metric-cog").parentElement).toHaveClass("mobile-pnl-supporting");
  });
});
