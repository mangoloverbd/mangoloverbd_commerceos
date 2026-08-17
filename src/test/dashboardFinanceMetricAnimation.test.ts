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

    expect(financeMetricSource).toContain('padding: "3px"');
    expect(financeMetricSource).toContain('padding: "9px 12px"');
    expect(financeMetricSource).toContain('className="m-0 text-[20px] font-bold leading-none text-[#222A38] tabular-nums"');
    expect(source).toContain('className="relative z-10 grid grid-cols-2 lg:grid-cols-5 gap-3"');
  });
});
