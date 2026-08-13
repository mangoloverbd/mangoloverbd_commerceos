import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OrderVolumeChart } from "../../src/components/overview/OrderVolumeChart";
import { RevenueChart } from "../../src/components/overview/RevenueChart";

vi.mock("recharts", async () => {
  const MockAreaChart = ({ children, data }: { children: React.ReactNode; data?: Array<Record<string, unknown>> }) => (
    <div data-testid="area-chart">
      {data?.map((d, i) => <span key={i}>{String(d.date)}</span>)}
      {children}
    </div>
  );
  const MockComposedChart = ({ children, data }: { children: React.ReactNode; data?: Array<Record<string, unknown>> }) => (
    <div data-testid="composed-chart">
      {data?.map((d, i) => <span key={i}>{String(d.date)}</span>)}
      {children}
    </div>
  );
  const MockComponent = (props: Record<string, unknown>) => <span data-testid={String(props["dataKey"] || props["name"] || "mock")} />;
  const MockLegend = () => <div data-testid="legend" />;
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 800, height: 240 }}>{children}</div>
    ),
    AreaChart: MockAreaChart,
    ComposedChart: MockComposedChart,
    Area: ({ dataKey, name }: { dataKey?: string; name?: string }) => <span data-testid={`area-${dataKey}`}>{name || dataKey}</span>,
    Bar: ({ dataKey, name }: { dataKey?: string; name?: string }) => <span data-testid={`bar-${dataKey}`}>{name || dataKey}</span>,
    Line: ({ dataKey, name }: { dataKey?: string; name?: string }) => <span data-testid={`line-${dataKey}`}>{name || dataKey}</span>,
    XAxis: MockComponent,
    YAxis: MockComponent,
    Tooltip: MockComponent,
    CartesianGrid: MockComponent,
    Legend: MockLegend,
  };
});

describe("OrderVolumeChart", () => {
  const data = [
    { date: "Aug 7", current: 32, previous: 28 },
    { date: "Aug 8", current: 45, previous: 30 },
    { date: "Aug 9", current: 38, previous: 35 },
  ];

  it("renders the chart title", () => {
    render(<OrderVolumeChart data={data} />);
    expect(screen.getByText("Order Volume")).toBeInTheDocument();
  });

  it("renders all date labels on x-axis", () => {
    render(<OrderVolumeChart data={data} />);
    expect(screen.getByText("Aug 7")).toBeInTheDocument();
    expect(screen.getByText("Aug 9")).toBeInTheDocument();
  });
});

describe("RevenueChart", () => {
  const data = [
    { date: "Aug 7", revenue: 12400, cog: 7200, shipping: 1800, profit: 3400 },
    { date: "Aug 8", revenue: 15600, cog: 8100, shipping: 2200, profit: 5300 },
  ];

  it("renders the chart title", () => {
    render(<RevenueChart data={data} />);
    expect(screen.getByText("Revenue vs Costs")).toBeInTheDocument();
  });

  it("renders legend items", () => {
    render(<RevenueChart data={data} />);
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("Profit")).toBeInTheDocument();
  });
});
