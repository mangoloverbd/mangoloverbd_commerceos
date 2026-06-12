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
});
