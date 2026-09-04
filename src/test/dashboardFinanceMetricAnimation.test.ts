import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("dashboard P&L metric animation", () => {
  const source = readFileSync(resolve(process.cwd(), "src/pages/Dashboard.tsx"), "utf8");

  it("renders finance metric values through NumberFlow (animates only on value change)", () => {
    const financeMetricStart = source.indexOf("const FinanceMetric");
    const dashboardStart = source.indexOf("export default function Dashboard");
    const financeMetricSource = source.slice(financeMetricStart, dashboardStart);

    expect(financeMetricSource).toContain("<MetricNumberFlow");
    expect(financeMetricSource).toContain("const FinanceMetric = memo(function FinanceMetric");
    expect(financeMetricSource).toContain("amount");
    expect(financeMetricSource).not.toContain("<DashboardTextEffect");
    expect(financeMetricSource).toContain('<div key="value">');
    expect(financeMetricSource).not.toContain('key="value"\n            initial=');
  });

  it("caches the P&L snapshot so navigation back never replays the animation", () => {
    expect(source).toContain("analyticsSnapshot");
    expect(source).toContain("cachedSnapshotFor");
    expect(source).toContain("initialAnalyticsSnapshot?.range ?? todayRange");
    expect(source).toContain("initialAnalyticsSnapshot?.analytics ?? null");
    expect(source).toContain("range: range ? { ...range } : null");
  });

  it("does not clear the cached P&L snapshot when Dashboard remounts", () => {
    const resetStart = source.indexOf("// Rehydrate user-scoped cached data");
    const resetEnd = source.indexOf("const handleDateRangeChange", resetStart);
    const resetSource = source.slice(resetStart, resetEnd);

    expect(resetSource).not.toContain("analyticsSnapshot = null");
    expect(resetSource).toContain("cachedSnapshotFor(dateRange, user?.id)");
    expect(resetSource).toContain("setAnalytics(cached?.analytics ?? null)");
    expect(resetSource).toContain("setAnalyticsLoading(!cached?.analytics)");
  });

  it("initializes page loading from the order cache instead of flashing the full loader", () => {
    const dashboardStart = source.indexOf("export default function Dashboard");
    const fetchStart = source.indexOf("const fetchAnalytics", dashboardStart);
    const initialStateSource = source.slice(dashboardStart, fetchStart);

    expect(initialStateSource).toContain(
      'useState<Order[]>(() => queryClient.getQueryData<Order[]>(["/api/orders"]) || [])',
    );
    expect(initialStateSource).toContain(
      'useState(() => !queryClient.getQueryData<Order[]>(["/api/orders"]))',
    );
    expect(initialStateSource).not.toContain("const [loading, setLoading] = useState(true)");
  });

  it("silently revalidates cached analytics and retains equal response objects", () => {
    expect(source).toContain("fetchAnalytics(dateRange, Boolean(cached))");
    expect(source).toContain("// Revalidate the selected P&L range independently");
    expect(source).toContain(
      "JSON.stringify(current) === JSON.stringify(data) ? current : data",
    );
    expect(source).toContain(
      "JSON.stringify(current) === JSON.stringify(prevData) ? current : prevData",
    );
  });

  it("does not replay mini bar animations on remount", () => {
    const chartStart = source.indexOf("function MiniBarChart");
    const chartEnd = source.indexOf("function DashboardTextEffect", chartStart);
    const chartSource = source.slice(chartStart, chartEnd);

    expect(chartSource).toContain("chartAnimationEnabled");
    expect(chartSource).toContain("isAnimationActive={chartAnimationEnabled}");
  });

  it("does not replay container fade animations when the P&L section remounts", () => {
    const panelStart = source.indexOf("{/* ── P&L Panel");
    const panelEnd = source.indexOf("{/* ── Orders table card", panelStart);
    const panelSource = source.slice(panelStart, panelEnd);

    expect(panelSource).not.toContain("<motion.div");
  });

  it("keeps the ৳ prefix and en-BD grouping identical to fmtBDT at rest", () => {
    const wrapperSource = readFileSync(resolve(process.cwd(), "src/components/ui/number-flow.tsx"), "utf8");

    expect(wrapperSource).toContain("@number-flow/react");
    expect(wrapperSource).toContain('prefix = "৳"');
    expect(wrapperSource).toContain('locales="en-BD"');
    expect(wrapperSource).toContain("maximumFractionDigits: 0");
  });

  it("keeps finance metric cards compact", () => {
    const financeMetricStart = source.indexOf("const FinanceMetric");
    const dashboardStart = source.indexOf("export default function Dashboard");
    const financeMetricSource = source.slice(financeMetricStart, dashboardStart);

    expect(financeMetricSource).toContain('padding: "2px 2px 0"');
    expect(financeMetricSource).toContain('padding: "13px 14px 15px"');
    expect(financeMetricSource).toContain('className="m-0 text-[22px] font-bold leading-none text-[#1A1A1A] tabular-nums tracking-tight"');
    expect(source).toContain('className="relative z-10 grid grid-cols-2 lg:grid-cols-5 gap-3"');
  });
});
