import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Area, AreaChart, Bar, BarChart, Cell, PolarAngleAxis, PolarGrid, Radar, RadarChart, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";
import { Warning, ChartBar, Cube, CheckCircle, Package, TrendDown, TrendUp } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/ios-spinner";
import { AnimatedText } from "@/components/ui/animated-text";
import { GitHubCalendar, type SalesTrendDay } from "@/components/ui/git-hub-calendar";
import { KpiCard } from "@/components/overview/KpiCard";
import { FunnelChart, type FunnelStage } from "@/components/ui/funnel-chart";

const FIVE_HOURS_IN_MS = 5 * 60 * 60 * 1000;
const WEBSITE_BEHAVIOR_REFETCH_MS = 30 * 1000;

type ProductStatus = "stockout" | "shutdown_candidate" | "dead_stock" | "winner" | "stable";

type ProductForecast = {
  id: string;
  name: string;
  stockQuantity: number;
  unitsSold: number;
  revenue: number;
  salesVelocity: number;
  daysUntilStockout: number | null;
  margin: number | null;
  cancellationRate: number;
  growthRate: number;
  status: ProductStatus;
  recommendation: string;
  score: number;
};

type ForecastAction = {
  priority: "critical" | "warning" | "growth";
  title: string;
  detail: string;
};

type ForecastResponse = {
  generatedAt: string;
  lookbackDays: number;
  overview: {
    currentOrders: number;
    previousOrders: number;
    currentRevenue: number;
    previousRevenue: number;
    revenueChange: number;
    projectedRevenue30d: number;
    productsTracked: number;
    stockoutCount: number;
    shutdownCount: number;
  };
  productForecasts: ProductForecast[];
  stockoutRisks: ProductForecast[];
  shutdownCandidates: ProductForecast[];
  topActions: ForecastAction[];
  salesTrend: {
    totalRevenue: number;
    days: SalesTrendDay[];
  };
  aiSummary: string;
};

type WebsiteBehaviorResponse = {
  configured: boolean;
  lookbackDays: number;
  funnel: {
    visitors: number;
    productViews: number;
    carts: number;
    checkouts: number;
    purchases: number;
    conversionRate: number;
  };
  dropOff: {
    step: string;
    rate: number;
    hint: string;
    summary?: string;
    bullets?: string[];
  } | null;
  productDemand: Array<{
    url: string;
    productName: string;
    views: number;
    carts: number;
    checkouts: number;
    purchases: number;
    conversionRate: number;
  }>;
  trafficSources: Array<{
    source: string;
    visitors: number;
    carts: number;
    purchases: number;
    conversionRate: number;
  }>;
};

function fmtBDT(value: number) {
  return "৳" + Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 0 });
}

function fmtPct(value: number) {
  return `${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 1 })}%`;
}

function statusLabel(status: ProductStatus) {
  switch (status) {
    case "stockout": return "Stock-out risk";
    case "shutdown_candidate": return "Review";
    case "dead_stock": return "Dead stock";
    case "winner": return "Winner";
    default: return "Stable";
  }
}

function statusChip(status: ProductStatus): { color: "lime" | "rose" | "yellow" | "gray" | "soft"; dot: string } {
  switch (status) {
    case "stockout": return { color: "rose", dot: "bg-status-rose-text" };
    case "shutdown_candidate": return { color: "yellow", dot: "bg-status-yellow-text" };
    case "dead_stock": return { color: "gray", dot: "bg-black/30" };
    case "winner": return { color: "lime", dot: "bg-status-lime-text" };
    default: return { color: "soft", dot: "bg-black/25" };
  }
}

function priorityIcon(priority: ForecastAction["priority"]) {
  if (priority === "critical") return <Warning weight="light" size={16} className="text-red-500" />;
  if (priority === "growth") return <TrendUp weight="light" size={16} className="text-emerald-600" />;
  return <TrendDown weight="light" size={16} className="text-amber-600" />;
}

export default function OrderAnalysis() {
  const { data, isLoading, isFetching, refetch, error } = useQuery<ForecastResponse>({
    queryKey: ["/api/business-forecast"],
    queryFn: async () => {
      const res = await apiFetch("/api/business-forecast");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load forecast");
      return json;
    },
    staleTime: FIVE_HOURS_IN_MS,
  });

  const { data: websiteBehavior, isLoading: behaviorLoading, refetch: refetchWebsiteBehavior } = useQuery<WebsiteBehaviorResponse>({
    queryKey: ["/api/order-analysis/website-behavior"],
    queryFn: async () => {
      const res = await apiFetch("/api/order-analysis/website-behavior");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load website behavior");
      return json;
    },
    staleTime: 0,
    refetchInterval: WEBSITE_BEHAVIOR_REFETCH_MS,
  });

  const products = data?.productForecasts ?? [];
  const stockoutRisks = data?.stockoutRisks ?? [];
  const shutdownCandidates = data?.shutdownCandidates ?? [];
  const overview = data?.overview;
  const winner = products.find((product) => product.status === "winner") || products[0];
  const weakest = shutdownCandidates[0] || products.find((product) => product.status === "dead_stock");
  const fastestStockout = stockoutRisks[0];

  const revenueSparkline = useMemo(() => {
    const days = data?.salesTrend?.days ?? [];
    return days.slice(-12).map((d) => d.totalRevenue ?? 0);
  }, [data?.salesTrend?.days]);

  return (
    <div className="min-h-full space-y-6 bg-white p-1 lg:p-2">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start justify-between gap-4 px-2 pt-2"
        >
          <div>
            <h1 className="font-sf-display text-[22px] font-bold tracking-tight text-black">AI Business Forecast</h1>
            <p className="mt-1 text-[13px] text-black/45">Inventory forecasting, funnel health, and product intelligence.</p>
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              refetch();
              refetchWebsiteBehavior();
            }}
            disabled={isFetching}
            leadingIcon={
              isFetching
                ? (p) => <Spinner {...p} />
                : (p) => (
                    <svg {...p} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6.71275 10.6736C7.16723 8.15492 9.38539 6.25 12.0437 6.25C13.6212 6.25 15.0431 6.9209 16.0328 7.9907C16.3141 8.29476 16.2956 8.76927 15.9915 9.05055C15.6875 9.33183 15.213 9.31337 14.9317 9.0093C14.2154 8.23504 13.1879 7.75 12.0437 7.75C10.2056 7.75 8.66974 9.00212 8.24452 10.6853L8.48095 10.4586C8.77994 10.172 9.25471 10.182 9.54137 10.4809C9.82804 10.7799 9.81805 11.2547 9.51905 11.5414L7.89662 13.0969C7.74932 13.2381 7.55084 13.3133 7.34695 13.3049C7.14306 13.2966 6.95137 13.2056 6.81608 13.0528L5.43852 11.4972C5.16391 11.1871 5.19267 10.7131 5.50277 10.4385C5.81286 10.1639 6.28686 10.1927 6.56148 10.5028L6.71275 10.6736Z" fill="currentColor" />
                      <path d="M16.6485 10.6959C16.8523 10.704 17.044 10.7947 17.1795 10.9472L18.5607 12.5019C18.8358 12.8115 18.8078 13.2856 18.4981 13.5607C18.1885 13.8358 17.7144 13.8078 17.4393 13.4981L17.2841 13.3234C16.8295 15.8458 14.6011 17.7509 11.9348 17.7509C10.3635 17.7509 8.94543 17.0895 7.95312 16.0322C7.66966 15.7302 7.68472 15.2555 7.98675 14.9721C8.28879 14.6886 8.76342 14.7037 9.04688 15.0057C9.76546 15.7714 10.792 16.2509 11.9348 16.2509C13.7819 16.2509 15.322 14.9991 15.7503 13.3193L15.5195 13.5409C15.2208 13.8278 14.746 13.8183 14.4591 13.5195C14.1721 13.2208 14.1817 12.746 14.4805 12.4591L16.0993 10.9044C16.2464 10.7631 16.4447 10.6878 16.6485 10.6959Z" fill="currentColor" />
                      <path fillRule="evenodd" clipRule="evenodd" d="M12 1.25C6.06294 1.25 1.25 6.06294 1.25 12C1.25 17.9371 6.06294 22.75 12 22.75C17.9371 22.75 22.75 17.9371 22.75 12C22.75 6.06294 17.9371 1.25 12 1.25ZM2.75 12C2.75 6.89137 6.89137 2.75 12 2.75C17.1086 2.75 21.25 6.89137 21.25 12C21.25 17.1086 17.1086 21.25 12 21.25C6.89137 21.25 2.75 17.1086 2.75 12Z" fill="currentColor" />
                    </svg>
                  )
            }
          >
            Refresh
          </Button>
        </motion.div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Projected 30D Revenue"
            value={overview ? fmtBDT(overview.projectedRevenue30d) : "—"}
            trend={overview?.revenueChange ?? 0}
            sparklineValues={revenueSparkline.length ? revenueSparkline : undefined}
            icon="CurrencyCircleDollar"
          />
          <KpiCard
            label="Stock-out Risks"
            value={overview ? String(overview.stockoutCount) : "—"}
            icon="Warning"
          />
          <KpiCard
            label="Products to Review"
            value={overview ? String(overview.shutdownCount) : "—"}
            icon="Percent"
          />
          <KpiCard
            label="Products Tracked"
            value={overview ? String(overview.productsTracked) : "—"}
            icon="Cube"
          />
        </div>

        <WebsiteBehaviorPanel data={websiteBehavior} loading={behaviorLoading} />

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.03 }}
        >
          <GitHubCalendar data={data?.salesTrend?.days ?? []} loading={isLoading} monthlyRevenue={overview?.projectedRevenue30d} />
        </motion.div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-700">
            {error instanceof Error ? error.message : "Failed to load forecast"}
          </div>
        )}

        {/* Executive Summary — full width */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="overflow-visible rounded-2xl bg-white"
        >
          <div className="flex h-[50px] items-center justify-between border-b border-black/10 px-6">
            <div className="flex items-center gap-2.5">
              <ChartBar weight="light" size={16} className="text-muted-foreground" />
              <AnimatedText className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Executive Summary</AnimatedText>
            </div>
            {overview && (
              <span className="text-[13px] text-muted-foreground">
                Last {data?.lookbackDays} days · {overview.revenueChange >= 0 ? "+" : ""}{overview.revenueChange}%
              </span>
            )}
          </div>
          <div className="py-6">
            {isLoading ? (
              <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
                <div className="h-[260px] animate-pulse rounded-2xl bg-black/[0.05]" />
                <div className="h-[260px] animate-pulse rounded-2xl bg-black/[0.05]" />
              </div>
            ) : (
              <ExecutiveProductMix
                products={products}
                stockoutRisks={stockoutRisks}
                shutdownCandidates={shutdownCandidates}
                overview={overview}
                lookbackDays={data?.lookbackDays}
                aiSummary={data?.aiSummary || "No forecast available yet."}
              />
            )}
          </div>
        </motion.section>

        {/* Small cards — 2x2 grid */}
        <div className="columns-1 gap-6 xl:columns-2 [&>*]:mb-6 [&>*]:break-inside-avoid">
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="overflow-hidden rounded-2xl bg-white"
          >
            <div className="flex h-[50px] items-center gap-2.5 border-b border-black/10 px-6">
              <CheckCircle weight="light" size={16} className="text-muted-foreground" />
              <AnimatedText className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Recommended Actions</AnimatedText>
            </div>
            <div className="divide-y divide-black/[0.06]">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="px-6 py-4">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-black/[0.06]" />
                    <div className="mt-2 h-3 w-full animate-pulse rounded bg-black/[0.05]" />
                  </div>
                ))
              ) : data?.topActions.length ? (
                data.topActions.map((action) => (
                  <div key={`${action.title}-${action.detail}`} className="flex gap-3 px-6 py-4">
                    <div className="mt-0.5">{priorityIcon(action.priority)}</div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{action.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{action.detail}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-6 py-10 text-center text-sm text-muted-foreground">No urgent actions right now.</div>
              )}
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="overflow-hidden rounded-2xl bg-white"
          >
            <div className="flex h-[50px] items-center gap-2.5 border-b border-black/10 px-6">
              <ChartBar weight="light" size={16} className="text-muted-foreground" />
              <AnimatedText className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Business Signals</AnimatedText>
            </div>
            {!isLoading && overview && (
              <div className="pt-4 pb-4">
                <div className="rounded-2xl bg-black/[0.04] p-5">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-black/35">Revenue Trend</p>
                  <p className="mb-4 text-xs text-black/40">Daily revenue · last 30 days</p>
                  <RevenueTrendArea days={data?.salesTrend?.days ?? []} />
                </div>
              </div>
            )}
            <div className="divide-y divide-black/[0.06]">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="px-6 py-4">
                    <div className="h-4 w-1/2 animate-pulse rounded bg-black/[0.06]" />
                    <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-black/[0.05]" />
                  </div>
                ))
              ) : (
                [
                  {
                    label: "Current Revenue",
                    value: overview ? fmtBDT(overview.currentRevenue) : "—",
                    detail: overview ? `${overview.currentOrders} orders in ${data?.lookbackDays} days` : "No order data yet",
                  },
                  {
                    label: "Top Momentum",
                    value: winner?.name || "No signal yet",
                    detail: winner ? `${winner.unitsSold} sold · ${winner.score}/100 score` : "Add product sales to surface winners",
                  },
                  {
                    label: "Fastest Stock Risk",
                    value: fastestStockout?.name || "No stock risk",
                    detail: fastestStockout ? `${fastestStockout.daysUntilStockout} days left` : "Inventory looks stable for now",
                  },
                  {
                    label: "Needs Attention",
                    value: weakest?.name || "No weak product",
                    detail: weakest?.recommendation || "No shutdown candidates in this period",
                  },
                ].map((signal) => (
                  <div key={signal.label} className="px-6 py-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{signal.label}</p>
                    <p className="mt-1 truncate text-sm font-semibold text-foreground">{signal.value}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{signal.detail}</p>
                  </div>
                ))
              )}
            </div>
          </motion.section>

          <RiskPanel
            title="Stock-out Prediction"
            icon={<Warning weight="light" size={16} className="text-red-500" />}
            products={stockoutRisks}
            empty="No products are projected to stock out soon."
            variant="danger"
            chart={<StockoutChart products={stockoutRisks} />}
          />
          <RiskPanel
            title="Products to Stop or Fix"
            icon={<TrendDown weight="light" size={16} className="text-muted-foreground" />}
            products={shutdownCandidates}
            empty="No shutdown candidates found in the current lookback."
          />
        </div>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="overflow-hidden rounded-2xl bg-white"
        >
          <div className="flex h-[50px] items-center justify-between border-b border-black/10 px-6">
            <div className="flex items-center gap-2.5">
              <Package weight="light" size={16} className="text-muted-foreground" />
              <AnimatedText className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Product Intelligence</AnimatedText>
            </div>
            <span className="text-[13px] text-muted-foreground">{products.length} products</span>
          </div>

          {!isLoading && products.length > 0 && (
            <div className="border-b border-black/10 py-5">
              <PortfolioHealthBand products={products} />
            </div>
          )}

          <div className="overflow-x-auto">
             <div className="grid min-w-[980px] grid-cols-[minmax(220px,1fr)_110px_120px_110px_110px_130px_180px] border-b border-black/10 bg-[#F8F8F6]">
               {["Product", "Stock", "Sold", "Days Left", "Margin", "Score", "Recommendation"].map((header) => (
                 <div key={header} className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.15em] text-black">
                  {header}
                </div>
              ))}
            </div>

            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="grid min-w-[980px] grid-cols-[minmax(220px,1fr)_110px_120px_110px_110px_130px_180px] border-b border-black/[0.06] px-0">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <div key={j} className="px-4 py-4">
                      <div className="h-4 animate-pulse rounded bg-black/[0.05]" />
                    </div>
                  ))}
                </div>
              ))
            ) : products.length ? (
              products.map((product) => (
                <div key={product.id} className="grid min-w-[980px] grid-cols-[minmax(220px,1fr)_110px_120px_110px_110px_130px_180px] border-b border-black/[0.06] transition-colors last:border-0 hover:bg-black/[0.025]">
                  <div className="px-4 py-4">
                    <div className="font-medium text-foreground">{product.name}</div>
                    {(() => {
                      const chip = statusChip(product.status);
                      return (
                        <Chip variant="caption" color={chip.color} className="mt-1.5 gap-1.5">
                          <span className={cn("h-[5px] w-[5px] shrink-0 rounded-full", chip.dot)} />
                          {statusLabel(product.status)}
                        </Chip>
                      );
                    })()}
                  </div>
                  <Metric value={product.stockQuantity.toLocaleString("en-BD")} />
                  <Metric value={`${product.unitsSold} units`} muted={`৳${product.revenue.toLocaleString("en-BD")}`} />
                  <Metric value={product.daysUntilStockout == null ? "—" : `${product.daysUntilStockout}d`} />
                  <Metric value={product.margin == null ? "—" : `${product.margin}%`} />
                  <div className="px-4 py-4">
                    <div className="h-2 overflow-hidden rounded-full bg-black/10">
                      <div className="h-full rounded-full bg-black" style={{ width: `${product.score}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{product.score}/100</p>
                  </div>
                  <div className="px-4 py-4 text-xs leading-relaxed text-muted-foreground">{product.recommendation}</div>
                </div>
              ))
            ) : (
              <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                Add products and stock quantities to unlock product intelligence.
              </div>
            )}
          </div>
        </motion.section>
    </div>
  );
}

function Metric({ value, muted }: { value: string; muted?: string }) {
  return (
    <div className="px-4 py-4">
      <p className="text-sm font-medium text-foreground tabular-nums">{value}</p>
      {muted && <p className="mt-1 text-xs text-muted-foreground tabular-nums">{muted}</p>}
    </div>
  );
}

function WebsiteBehaviorPanel({ data, loading }: { data?: WebsiteBehaviorResponse; loading: boolean }) {
  const steps = [
    { label: "Visitors", value: data?.funnel.visitors ?? 0 },
    { label: "Product Views", value: data?.funnel.productViews ?? 0 },
    { label: "Added to Cart", value: data?.funnel.carts ?? 0 },
    { label: "Checkout", value: data?.funnel.checkouts ?? 0 },
    { label: "Purchased", value: data?.funnel.purchases ?? 0 },
  ];
  const funnelHasData = steps[0].value > 0;
  const funnelGradients = [
    ["var(--chart-1)", "var(--chart-2)"],
    ["var(--chart-2)", "var(--chart-3)"],
    ["var(--chart-3)", "var(--chart-4)"],
    ["var(--chart-4)", "var(--chart-5)"],
    ["var(--chart-5)", "var(--chart-1)"],
  ];
  const funnelStages: FunnelStage[] = steps.map((step, i) => ({
    label: step.label,
    value: step.value,
    displayValue: step.value.toLocaleString("en-BD"),
    gradient: [
      { offset: "0%", color: funnelGradients[i][0] },
      { offset: "100%", color: funnelGradients[i][1] },
    ],
  }));
  const defaultTrafficSources = ["Direct", "Facebook", "Instagram", "Google"];
  const trafficSources = defaultTrafficSources.map((source) => {
    const actual = data?.trafficSources.find((item) => item.source.toLowerCase() === source.toLowerCase());
    return actual || { source, visitors: 0, carts: 0, purchases: 0, conversionRate: 0 };
  });

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.02 }}
      className="overflow-hidden rounded-2xl bg-white"
    >
      <div className="flex h-[50px] items-center border-b border-black/10 px-6">
        <div className="flex items-center gap-2.5">
          <ChartBar weight="light" size={16} className="text-muted-foreground" />
          <AnimatedText className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Website Funnel</AnimatedText>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 py-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="h-[220px] animate-pulse rounded-2xl bg-black/[0.05]" />
          <div className="h-[220px] animate-pulse rounded-2xl bg-black/[0.05]" />
        </div>
      ) : data?.configured === false ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm font-semibold text-foreground">PostHog query credentials are not configured</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Add POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID to unlock Website Funnel, Conversion Drop-off, Product Demand Signals, and Traffic Source Performance.
          </p>
        </div>
      ) : (
        <div className="grid items-stretch gap-4 py-6 xl:h-[760px] xl:grid-cols-[1.15fr_0.85fr]">
          <div className="website-behavior-scroll-card h-full min-h-0 overflow-y-auto rounded-2xl bg-black/[0.04] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-black/35">Conversion Flow</p>
                <h3 className="mt-2 font-sf-display text-5xl font-light leading-none tracking-[-0.06em] text-foreground">
                  {fmtPct(data?.funnel.conversionRate ?? 0)}
                </h3>
                <p className="mt-3 text-sm font-medium text-muted-foreground">
                  {(data?.funnel.purchases ?? 0).toLocaleString("en-BD")} purchase{(data?.funnel.purchases ?? 0) === 1 ? "" : "s"} from {(data?.funnel.visitors ?? 0).toLocaleString("en-BD")} tracked visitors
                </p>
              </div>
              <div className="rounded-full bg-black px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                Live web
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-black/30">Conversion Funnel</p>
              {funnelHasData ? (
                <div className="rounded-2xl bg-black/[0.03] px-2 py-4">
                  <FunnelChart data={funnelStages} layers={3} gap={6} />
                </div>
              ) : (
                <div className="flex min-h-[180px] items-center justify-center rounded-2xl bg-black/[0.03] text-sm text-muted-foreground">
                  Funnel appears once tracked visitors arrive.
                </div>
              )}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-black/[0.04] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/35">Main Leak</p>
                <p className="mt-3 text-base font-semibold tracking-tight text-foreground">{data?.dropOff?.step || "No drop-off yet"}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{data?.dropOff?.summary || data?.dropOff?.hint || "More traffic is needed before a reliable leak appears."}</p>
              </div>
              <div className="rounded-2xl bg-black/[0.04] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/35">Best Signal</p>
                <p className="mt-3 text-base font-semibold leading-snug tracking-tight text-foreground">{data?.productDemand[0]?.productName || "No product signal"}</p>
                {data?.productDemand[0]?.url && (
                  <p className="mt-1 break-all text-[11px] leading-relaxed text-muted-foreground">{data.productDemand[0].url}</p>
                )}
                {data?.productDemand[0] ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="best-signal-stat rounded-[12px] bg-black/[0.04] px-3 py-2">
                      <p className="text-[10px] font-medium text-black/45">Views</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{data.productDemand[0].views.toLocaleString("en-BD")}</p>
                    </div>
                    <div className="best-signal-stat rounded-[12px] bg-black/[0.04] px-3 py-2">
                      <p className="text-[10px] font-medium text-black/45">Carts</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{data.productDemand[0].carts.toLocaleString("en-BD")}</p>
                    </div>
                    <div className="best-signal-stat rounded-[12px] bg-black/[0.04] px-3 py-2">
                      <p className="text-[10px] font-medium text-black/45">Purchases</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{data.productDemand[0].purchases.toLocaleString("en-BD")}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Product demand signals will appear after tracked product visits.</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
            <div className="website-behavior-scroll-card min-h-0 overflow-y-auto rounded-2xl bg-black/[0.04] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/35">Conversion Drop-off</p>
              {data?.dropOff ? (
                <>
                  <div className="mt-3 flex items-end justify-between gap-4">
                    <div>
                      <h3 className="font-sf-display text-xl font-light tracking-tight text-foreground">{data.dropOff.step}</h3>
                      {data.dropOff.bullets?.length ? (
                        <ul className="mt-3 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-muted-foreground">
                          {data.dropOff.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{data.dropOff.hint}</p>
                      )}
                    </div>
                    <p className="text-3xl font-light tabular-nums text-red-600">{fmtPct(data.dropOff.rate)}</p>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No meaningful drop-off detected yet.</p>
              )}
            </div>

            <div className="website-behavior-scroll-card min-h-0 overflow-y-auto rounded-2xl bg-black/[0.04] p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/35">Product Demand Signals</p>
                <span className="text-xs text-muted-foreground">{data?.productDemand.length ?? 0} pages</span>
              </div>
              <div className="mt-4 space-y-3">
                {data?.productDemand.length ? data.productDemand.slice(0, 4).map((item) => (
                  <div key={item.url} className="grid gap-2 rounded-xl bg-black/[0.04] p-3 md:grid-cols-[1fr_auto] md:items-center">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">{item.productName}</p>
                      <p className="mt-0.5 break-all text-[10px] text-muted-foreground">{item.url}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {item.views.toLocaleString("en-BD")} views · {item.carts.toLocaleString("en-BD")} carts · {item.purchases.toLocaleString("en-BD")} purchases
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums text-foreground">{fmtPct(item.conversionRate)}</p>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">No product demand signals yet. Install the custom website tracker and wait for visitor events.</p>
                )}
              </div>
            </div>

          </div>

          <div className="website-behavior-scroll-card col-span-full max-h-[360px] overflow-y-auto rounded-2xl bg-black/[0.04] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/35">Traffic Source Performance</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Campaign quality by visitor source, cart intent, and completed purchases.</p>
              </div>
              <span className="text-xs text-muted-foreground">{data?.trafficSources.length ?? 0} sources</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {trafficSources.map((item) => (
                <div key={item.source} className="rounded-2xl bg-black/[0.04] p-4">
                  <div className="grid min-h-[112px] content-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{item.source}</p>
                      {item.visitors || item.carts || item.purchases ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {item.visitors.toLocaleString("en-BD")} visitors · {item.carts.toLocaleString("en-BD")} carts · {item.purchases.toLocaleString("en-BD")} purchases
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] text-muted-foreground">No tracked purchases yet</p>
                      )}
                    </div>
                    <p className="text-2xl font-medium tracking-[-0.05em] text-foreground tabular-nums">{fmtPct(item.conversionRate)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </motion.section>
  );
}

function ExecutiveProductMix({
  products,
  stockoutRisks,
  shutdownCandidates,
  overview,
  lookbackDays,
  aiSummary,
}: {
  products: ProductForecast[];
  stockoutRisks: ProductForecast[];
  shutdownCandidates: ProductForecast[];
  overview?: ForecastResponse["overview"];
  lookbackDays?: number;
  aiSummary: string;
}) {
  const totalProducts = Math.max(products.length, 1);
  const statusCounts = useMemo(
    () => [
      { label: "Winners", count: products.filter((product) => product.status === "winner").length, color: "#171717" },
      { label: "Stable", count: products.filter((product) => product.status === "stable").length, color: "#8C8A86" },
      { label: "Review", count: products.filter((product) => product.status === "shutdown_candidate").length, color: "#C9A74F" },
      { label: "Risk", count: products.filter((product) => product.status === "stockout" || product.status === "dead_stock").length, color: "#B85C4A" },
    ],
    [products],
  );
  const winnerShare = Math.round((statusCounts[0].count / totalProducts) * 100);
  const barProducts = useMemo(
    () => [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 6),
    [products],
  );
  const topWinner = products.find((product) => product.status === "winner") || products[0];
  const topRisk = stockoutRisks[0] || shutdownCandidates[0];
  const deadStock = products.find((product) => product.status === "dead_stock") || shutdownCandidates[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-black/[0.04] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-black/35">Product Mix</p>
            <h3 className="mt-2 font-sf-display text-2xl font-light tracking-tight text-foreground">Revenue Mix</h3>
          </div>
          <div className="text-right">
            <p className="font-sf-display text-3xl font-light leading-none tracking-tight text-foreground">{winnerShare}%</p>
            <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-black/35">winner</p>
          </div>
        </div>

        <div className="mt-4" aria-label="Product status mix chart">
          <ProductMixRadial data={statusCounts} />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <SummaryChip label="Winner" value={topWinner?.name || "No signal"} />
          <SummaryChip label="Risk" value={topRisk?.name || "Stable"} />
          <SummaryChip label="Dead Stock" value={deadStock?.name || "None"} />
        </div>
      </div>

        <div className="rounded-2xl bg-black/[0.04] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-black/35">Product Profile</p>
              <h3 className="mt-2 font-sf-display text-2xl font-light tracking-tight text-foreground">Health radar</h3>
            </div>
          </div>
          <div className="mt-4">
            <ProductHealthRadar products={products} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-black/[0.04] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-black/35">Top Product Velocity</p>
            <h3 className="mt-2 font-sf-display text-2xl font-light tracking-tight text-foreground">Revenue leaders</h3>
          </div>
          {barProducts[0] && (
            <p className="text-xs font-medium tabular-nums text-black/40">
              Top: {barProducts[0].name} · {fmtBDT(barProducts[0].revenue)}
            </p>
          )}
        </div>

        <div className="mt-5">
          <TopProductVelocityChart data={barProducts.map((p) => ({ name: p.name, revenue: p.revenue }))} />
        </div>
      </div>

      <div className="rounded-2xl bg-black/[0.04] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/35">AI Readout</p>
          </div>
          {barProducts[0] && (
            <p className="text-xs font-medium tabular-nums text-black/40">
              Top revenue: {barProducts[0].name} · {fmtBDT(barProducts[0].revenue)}
            </p>
          )}
        </div>
        {overview && (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ReadoutStat label="Revenue" value={fmtBDT(overview.currentRevenue)} sub={`${overview.currentOrders} orders · ${lookbackDays ?? 30}d`} />
            <ReadoutStat label="Projected 30D" value={fmtBDT(overview.projectedRevenue30d)} sub={`${overview.revenueChange >= 0 ? "+" : ""}${overview.revenueChange}% vs prev`} />
            <ReadoutStat label="Tracked" value={String(overview.productsTracked)} sub="SKUs" />
            <ReadoutStat label="At Risk" value={String(overview.stockoutCount)} sub="stock-outs" />
          </div>
        )}
        <div className="prose prose-sm mt-4 max-h-[320px] max-w-none overflow-y-auto pr-1 text-black/60 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_strong]:text-foreground">
          <ReactMarkdown>{aiSummary}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-black/[0.04] px-3 py-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-black/35">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-foreground">{value}</p>
    </div>
  );
}

function ReadoutStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl bg-white/70 px-3 py-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-black/35">{label}</p>
      <p className="mt-1 truncate text-lg font-light tabular-nums tracking-tight text-foreground">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-black/40">{sub}</p>
    </div>
  );
}

function PortfolioHealthBand({ products }: { products: ProductForecast[] }) {
  const total = Math.max(products.length, 1);
  const segments = [
    { label: "Winners", count: products.filter((p) => p.status === "winner").length, color: "#171717" },
    { label: "Stable", count: products.filter((p) => p.status === "stable").length, color: "#8C8A86" },
    { label: "Review", count: products.filter((p) => p.status === "shutdown_candidate").length, color: "#C9A74F" },
    { label: "Risk", count: products.filter((p) => p.status === "stockout" || p.status === "dead_stock").length, color: "#B85C4A" },
  ];
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-black/35">Portfolio Health</p>
          <h3 className="mt-1 font-sf-display text-lg font-light tracking-tight text-foreground">Inventory status composition</h3>
        </div>
        <p className="text-xs tabular-nums text-black/40">{products.length} SKUs</p>
      </div>
      <div className="mt-4 flex h-3 w-full gap-1 overflow-hidden rounded-full bg-black/[0.04]">
        {segments.map((segment) =>
          segment.count > 0 ? (
            <div key={segment.label} className="rounded-full transition-all" style={{ flexGrow: segment.count, backgroundColor: segment.color }} />
          ) : null,
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {segments.map((segment) => (
          <div key={segment.label} className="rounded-xl bg-black/[0.03] px-3 py-2">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: segment.color }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-black/40">{segment.label}</span>
            </div>
            <p className="mt-1 text-lg font-light tabular-nums text-foreground">
              {segment.count}
              <span className="ml-1 text-xs text-black/35">{Math.round((segment.count / total) * 100)}%</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ChartTipPayload {
  value: number;
  dataKey?: string | number;
  name?: string;
  color?: string;
  payload?: { name?: string; fill?: string; metric?: string };
}

function OverviewChartTooltip({ active, payload, label }: { active?: boolean; payload?: ChartTipPayload[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 shadow-lg">
      {label != null && <p className="mb-1.5 text-[10px] font-medium text-black/50">{String(label)}</p>}
      {payload.map((entry) => (
        <div key={String(entry.dataKey)} className="flex items-center justify-between gap-4 text-[11px]">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color ?? "#232323" }} />
            <span className="capitalize text-black/60">{String(entry.dataKey)}</span>
          </div>
          <span className="font-medium tabular-nums text-black">{fmtBDT(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function StockoutTooltip({ active, payload, label }: { active?: boolean; payload?: ChartTipPayload[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  const days = payload[0].value;
  const color = days <= 7 ? "#DC2626" : days <= 30 ? "#D97706" : "#10B981";
  return (
    <div className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 shadow-lg">
      {label != null && <p className="mb-1.5 text-[10px] font-medium text-black/50">{String(label)}</p>}
      <div className="flex items-center justify-between gap-4 text-[11px]">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-black/60">Days left</span>
        </div>
        <span className="font-medium tabular-nums text-black">{days} days</span>
      </div>
    </div>
  );
}

function TopProductVelocityChart({ data }: { data: { name: string; revenue: number }[] }) {
  if (!data.length) {
    return (
      <div className="flex min-h-[200px] w-full items-center justify-center rounded-2xl bg-black/[0.035] text-sm text-muted-foreground">
        Add product revenue to show velocity bars.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: "rgba(0,0,0,0.35)" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `৳${(v / 1000).toFixed(0)}k`} />
        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: "rgba(0,0,0,0.55)" }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} content={<OverviewChartTooltip />} />
        <Bar dataKey="revenue" name="Revenue" fill="var(--chart-4)" radius={[0, 4, 4, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function StockoutChart({ products }: { products: ProductForecast[] }) {
  const rows = products
    .filter((p) => p.daysUntilStockout != null)
    .map((p) => ({ name: p.name, days: p.daysUntilStockout as number }));
  if (!rows.length) return null;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-[#DC2626]" />
          <span className="text-[10px] text-black/50">≤7 days</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-[#D97706]" />
          <span className="text-[10px] text-black/50">≤30 days</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-[#10B981]" />
          <span className="text-[10px] text-black/50">Healthy</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
      <BarChart data={rows} layout="vertical" margin={{ top: 5, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10, fill: "rgba(0,0,0,0.35)" }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: "rgba(0,0,0,0.55)" }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} content={<StockoutTooltip />} />
        <Bar dataKey="days" radius={[0, 4, 4, 0]} barSize={16}>
          {rows.map((row) => (
            <Cell key={row.name} fill={row.days <= 7 ? "#DC2626" : row.days <= 30 ? "#D97706" : "#10B981"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}

function RevenueTrendTooltip({ active, payload, label }: { active?: boolean; payload?: ChartTipPayload[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  const dateLabel = label != null ? new Date(String(label)).toLocaleDateString("en-BD", { month: "short", day: "numeric" }) : "";
  return (
    <div className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 shadow-lg">
      {dateLabel && <p className="mb-1.5 text-[10px] font-medium text-black/50">{dateLabel}</p>}
      <div className="flex items-center justify-between gap-4 text-[11px]">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--chart-1)" }} />
          <span className="text-black/60">Revenue</span>
        </div>
        <span className="font-medium tabular-nums text-black">{fmtBDT(payload[0].value)}</span>
      </div>
    </div>
  );
}

function RevenueTrendArea({ days }: { days: SalesTrendDay[] }) {
  const data = days.slice(-30).map((d) => ({ label: d.date, revenue: d.totalRevenue ?? 0 }));
  if (!data.some((d) => d.revenue > 0)) {
    return (
      <div className="flex min-h-[200px] w-full items-center justify-center rounded-2xl bg-black/[0.035] text-sm text-muted-foreground">
        Revenue trend appears once orders arrive.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="fillRevenueTrend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.25} />
            <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "rgba(0,0,0,0.35)" }} axisLine={false} tickLine={false} minTickGap={28}
          tickFormatter={(v: string) => new Date(v).toLocaleDateString("en-BD", { month: "short", day: "numeric" })} />
        <YAxis tick={{ fontSize: 10, fill: "rgba(0,0,0,0.35)" }} axisLine={false} tickLine={false} width={44}
          tickFormatter={(v: number) => `৳${(v / 1000).toFixed(0)}k`} />
        <Tooltip cursor={{ stroke: "rgba(0,0,0,0.08)" }} content={<RevenueTrendTooltip />} />
        <Area dataKey="revenue" name="revenue" type="natural" stroke="var(--chart-1)" strokeWidth={2} fill="url(#fillRevenueTrend)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function MixTooltip({ active, payload }: { active?: boolean; payload?: ChartTipPayload[] }) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload;
  return (
    <div className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[11px] shadow-lg">
      <div className="flex items-center gap-1.5">
        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: datum?.fill ?? "#171717" }} />
        <span className="text-black/60">{datum?.name}</span>
        <span className="ml-2 font-medium tabular-nums text-black">{payload[0].value}</span>
      </div>
    </div>
  );
}

function ProductMixRadial({ data }: { data: { label: string; count: number; color: string }[] }) {
  const chartData = data.map((d) => ({ name: d.label, value: d.count, fill: d.color }));
  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (!total) {
    return (
      <div className="flex min-h-[240px] w-full items-center justify-center rounded-2xl bg-black/[0.035] text-sm text-muted-foreground">
        Product mix appears once products are tracked.
      </div>
    );
  }
  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={260}>
          <RadialBarChart data={chartData} innerRadius={52} outerRadius={122} startAngle={90} endAngle={-270}>
            <Tooltip cursor={false} content={<MixTooltip />} />
            <RadialBar dataKey="value" background={{ fill: "rgba(0,0,0,0.04)" }} cornerRadius={8}>
              {chartData.map((d) => (
                <Cell key={d.name} fill={d.fill} />
              ))}
            </RadialBar>
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-light tabular-nums text-foreground">{total}</span>
          <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-black/40">products</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {chartData.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.fill }} />
            <span className="text-[10px] text-black/50">{d.name} · {d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RadarTooltip({ active, payload, label }: { active?: boolean; payload?: ChartTipPayload[]; label?: string | number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[11px] shadow-lg">
      <span className="text-black/60">{String(payload[0].payload?.metric ?? label ?? "")}</span>
      <span className="ml-2 font-medium tabular-nums text-black">{payload[0].value}/100</span>
    </div>
  );
}

function ProductHealthRadar({ products }: { products: ProductForecast[] }) {
  const top = products.find((product) => product.status === "winner") || products[0];
  if (!top) {
    return (
      <div className="flex min-h-[240px] w-full items-center justify-center rounded-2xl bg-black/[0.035] text-sm text-muted-foreground">
        Product profile appears once products are tracked.
      </div>
    );
  }
  const maxRevenue = Math.max(...products.map((p) => p.revenue), 1);
  const maxVelocity = Math.max(...products.map((p) => p.salesVelocity), 0.01);
  const maxStock = Math.max(...products.map((p) => p.stockQuantity), 1);
  const norm = (value: number, max: number) => Math.round(Math.min(100, Math.max(0, (value / max) * 100)));
  const data = [
    { metric: "Revenue", value: norm(top.revenue, maxRevenue) },
    { metric: "Velocity", value: norm(top.salesVelocity, maxVelocity) },
    { metric: "Margin", value: Math.round(Math.min(100, Math.max(0, top.margin ?? 0))) },
    { metric: "Score", value: Math.round(Math.min(100, Math.max(0, top.score))) },
    { metric: "Stock", value: norm(top.stockQuantity, maxStock) },
  ];
  return (
    <ResponsiveContainer width="100%" height={240}>
      <RadarChart data={data} outerRadius="72%">
        <PolarGrid stroke="rgba(0,0,0,0.08)" />
        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10, fill: "rgba(0,0,0,0.5)" }} />
        <Radar dataKey="value" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.18} strokeWidth={2}
          dot={{ r: 3, fillOpacity: 1, fill: "var(--chart-1)" }} />
        <Tooltip content={<RadarTooltip />} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

function RiskPanel({ title, icon, products, empty, variant = "default", chart }: { title: string; icon: ReactNode; products: ProductForecast[]; empty: string; variant?: "default" | "danger"; chart?: ReactNode }) {
  const isDanger = variant === "danger";
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "overflow-hidden rounded-2xl",
        isDanger ? "bg-red-50/60" : "bg-white"
      )}
    >
      <div className={cn(
        "flex h-[50px] items-center gap-2.5 border-b px-6",
        isDanger ? "border-red-200/70 bg-red-100/50" : "border-black/10"
      )}>
        {icon}
        <span className={cn(
          "font-sf-display text-[15px] font-semibold tracking-normal",
          isDanger ? "text-red-700" : "text-foreground"
        )}>{title}</span>
        {isDanger && products.length > 0 && (
          <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
            {products.length}
          </span>
        )}
      </div>
      {chart && (
        <div className="px-6 pb-1 pt-4">
          <div className="rounded-2xl bg-black/[0.04] p-5">{chart}</div>
        </div>
      )}
      <div className={cn("divide-y", isDanger ? "divide-red-200/50" : "divide-black/[0.06]")}>
        {products.length ? products.slice(0, 6).map((product) => (
          <div key={product.id} className={cn(
            "flex items-center justify-between gap-4 px-6 py-4",
            isDanger && "hover:bg-red-100/40 transition-colors"
          )}>
            <div className="min-w-0 flex items-start gap-3">
              {isDanger && (
                <span className="mt-0.5 flex h-2 w-2 shrink-0 rounded-full bg-red-500 ring-4 ring-red-200" />
              )}
              <div className="min-w-0">
                <p className={cn("truncate text-sm font-semibold", isDanger ? "text-red-800" : "text-foreground")}>{product.name}</p>
                <p className={cn("mt-1 text-xs", isDanger ? "text-red-500/80" : "text-muted-foreground")}>{product.recommendation}</p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className={cn("text-sm font-bold tabular-nums", isDanger ? "text-red-600" : "text-foreground")}>
                {product.daysUntilStockout == null ? `${product.stockQuantity} stock` : `${product.daysUntilStockout}d`}
              </p>
              <p className={cn("text-xs", isDanger ? "text-red-400" : "text-muted-foreground")}>{product.unitsSold} sold</p>
            </div>
          </div>
        )) : (
          <div className={cn("flex min-h-[140px] flex-col items-center justify-center gap-2 px-6 py-10 text-center", isDanger ? "text-red-400" : "text-muted-foreground")}>
            {!isDanger && <CheckCircle weight="light" size={28} className="text-emerald-500/70" />}
            <p className="text-sm">{empty}</p>
          </div>
        )}
      </div>
    </motion.section>
  );
}
