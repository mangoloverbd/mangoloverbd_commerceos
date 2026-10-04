import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { KpiCard } from "../../src/components/overview/KpiCard";

// jsdom lacks PointerEvent, which drops clientX from fireEvent.pointerMove.
if (typeof window.PointerEvent === "undefined") {
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
}

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
    expect(trendEl.className).toContain("text-[#e5484d]");
  });

  it("renders the stepped sparkline chart", () => {
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
    const chart = container.querySelector("[data-sparkline]");
    expect(chart).not.toBeNull();
    // One eased riser per change of level (7 points, 6 changes).
    const line = chart!.querySelectorAll("path")[1].getAttribute("d") ?? "";
    expect(line.match(/C/g)?.length).toBe(6);
  });

  it("shows the hovered day's value and date in a tooltip", () => {
    const { container } = render(
      <KpiCard
        label="Revenue"
        value="৳184,320"
        trend={8.2}
        sparklineValues={[100, 200, 300]}
        sparklineLabels={["Sep 28", "Sep 29", "Sep 30"]}
        formatSparkline={(v) => `৳${v}`}
        icon="CurrencyCircleDollar"
      />
    );
    const hitArea = container.querySelector("[data-sparkline] rect")!;
    hitArea.getBoundingClientRect = () => ({ left: 0, top: 0, width: 112, height: 32, right: 112, bottom: 32, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerMove(hitArea, { clientX: 60 });
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("৳200");
    expect(tip).toHaveTextContent("Sep 29");
    fireEvent.pointerLeave(hitArea);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
