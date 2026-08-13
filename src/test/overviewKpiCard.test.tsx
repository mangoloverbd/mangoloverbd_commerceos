import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiCard } from "../../src/components/overview/KpiCard";

describe("KpiCard", () => {
  it("renders label, value, and trend", () => {
    render(
      <KpiCard
        label="Total Orders"
        value="245"
        trend={12.4}
        previousValue={218}
        sparklineValues={[10, 20, 15, 30, 25, 35, 28]}
        icon="Package"
      />
    );
    expect(screen.getByText("Total Orders")).toBeInTheDocument();
    expect(screen.getByText("245")).toBeInTheDocument();
    expect(screen.getByText("+12.4%")).toBeInTheDocument();
  });

  it("shows negative trend in red", () => {
    render(
      <KpiCard
        label="Profit Margin"
        value="23.5%"
        trend={-2.1}
        previousValue={25.6}
        sparklineValues={[30, 28, 25, 27, 24, 23, 23.5]}
        icon="TrendDown"
      />
    );
    const trendEl = screen.getByText("-2.1%");
    expect(trendEl).toBeInTheDocument();
    expect(trendEl.className).toContain("text-red-500");
  });

  it("renders sparkline bars", () => {
    const { container } = render(
      <KpiCard
        label="Revenue"
        value="৳184,320"
        trend={8.2}
        previousValue={170280}
        sparklineValues={[100, 200, 150, 300, 250, 350, 280]}
        icon="CurrencyCircleDollar"
      />
    );
    const bars = container.querySelectorAll("[data-sparkline-bar]");
    expect(bars.length).toBe(7);
  });
});
