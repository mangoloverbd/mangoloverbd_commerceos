import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dashboard P&L metric animation", () => {
  const source = readFileSync(resolve(process.cwd(), "src/pages/Dashboard.tsx"), "utf8");

  it("renders finance metric values through NumberFlow (animates only on value change)", () => {
    const financeMetricStart = source.indexOf("function FinanceMetric");
    const dashboardStart = source.indexOf("export default function Dashboard");
    const financeMetricSource = source.slice(financeMetricStart, dashboardStart);

    expect(financeMetricSource).toContain("<MetricNumberFlow");
    expect(financeMetricSource).toContain("amount");
    expect(financeMetricSource).not.toContain("<DashboardTextEffect");
  });

  it("caches the P&L snapshot so navigation back never replays the animation", () => {
    expect(source).toContain("analyticsSnapshot");
    expect(source).toContain("cachedSnapshotFor");
    expect(source).toContain("cachedSnapshotFor(todayRange)?.analytics");
  });

  it("keeps the ৳ prefix and en-BD grouping identical to fmtBDT at rest", () => {
    const wrapperSource = readFileSync(resolve(process.cwd(), "src/components/ui/number-flow.tsx"), "utf8");

    expect(wrapperSource).toContain("@number-flow/react");
    expect(wrapperSource).toContain('prefix = "৳"');
    expect(wrapperSource).toContain('locales="en-BD"');
    expect(wrapperSource).toContain("maximumFractionDigits: 0");
  });

  it("keeps finance metric cards compact", () => {
    const financeMetricStart = source.indexOf("function FinanceMetric");
    const dashboardStart = source.indexOf("export default function Dashboard");
    const financeMetricSource = source.slice(financeMetricStart, dashboardStart);

    expect(financeMetricSource).toContain('padding: "2px 2px 0"');
    expect(financeMetricSource).toContain('padding: "13px 14px 15px"');
    expect(financeMetricSource).toContain('className="m-0 text-[22px] font-bold leading-none text-[#1A1A1A] tabular-nums tracking-tight"');
    expect(source).toContain('className="relative z-10 grid grid-cols-2 lg:grid-cols-5 gap-3"');
  });
});
