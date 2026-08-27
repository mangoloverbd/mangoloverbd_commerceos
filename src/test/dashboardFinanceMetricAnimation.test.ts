import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dashboard P&L metric animation", () => {
  const source = readFileSync(resolve(process.cwd(), "src/pages/Dashboard.tsx"), "utf8");

  it("renders finance metric values through the dashboard text effect", () => {
    const financeMetricStart = source.indexOf("function FinanceMetric");
    const dashboardStart = source.indexOf("export default function Dashboard");
    const financeMetricSource = source.slice(financeMetricStart, dashboardStart);

    expect(financeMetricSource).toContain("<DashboardTextEffect");
    expect(financeMetricSource).toContain('per="char"');
    expect(financeMetricSource).toContain("{value}");
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
