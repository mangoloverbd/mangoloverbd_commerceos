import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";
import { AlertTriangle, BarChart3, Boxes, CheckCircle2, Package, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/ios-spinner";
import { AnimatedText } from "@/components/ui/animated-text";
import { GitHubCalendar, type SalesTrendDay } from "@/components/ui/git-hub-calendar";

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

function fmtBDT(value: number) {
  return "৳" + Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 0 });
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

function statusClass(status: ProductStatus) {
  switch (status) {
    case "stockout": return "bg-red-100 text-red-700";
    case "shutdown_candidate": return "bg-amber-100 text-amber-700";
    case "dead_stock": return "bg-zinc-200 text-zinc-700";
    case "winner": return "bg-emerald-100 text-emerald-700";
    default: return "bg-black/[0.06] text-muted-foreground";
  }
}

function priorityIcon(priority: ForecastAction["priority"]) {
  if (priority === "critical") return <AlertTriangle className="h-4 w-4 text-red-500" />;
  if (priority === "growth") return <TrendingUp className="h-4 w-4 text-emerald-600" />;
  return <TrendingDown className="h-4 w-4 text-amber-600" />;
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
  });

  const products = data?.productForecasts ?? [];
  const stockoutRisks = data?.stockoutRisks ?? [];
  const shutdownCandidates = data?.shutdownCandidates ?? [];
  const overview = data?.overview;
  const winner = products.find((product) => product.status === "winner") || products[0];
  const weakest = shutdownCandidates[0] || products.find((product) => product.status === "dead_stock");
  const fastestStockout = stockoutRisks[0];

  return (
    <div className="min-h-full">
      <main className="mx-auto max-w-[1800px] space-y-6 p-1 lg:p-2">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="overflow-hidden rounded-2xl border border-black/10 bg-white"
        >
          <div className="flex h-[50px] items-center justify-between border-b border-black/10 px-6">
            <div className="flex items-center gap-2.5">
              <img src="https://img.icons8.com/material-rounded/24/bard--v2.png" alt="" className="h-3.5 w-3.5 object-contain opacity-75" />
              <AnimatedText className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">AI Business Forecast</AnimatedText>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-black/10 bg-black/[0.035] px-3 text-sm font-medium text-foreground/70 transition-all hover:border-black/20 hover:bg-black/[0.06] hover:text-foreground disabled:opacity-30"
            >
              {isFetching ? <Spinner size="sm" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </button>
          </div>

          <div className="grid gap-3 p-4 lg:grid-cols-4">
            {[
              { label: "Projected 30D Revenue", value: overview ? fmtBDT(overview.projectedRevenue30d) : "—", icon: BarChart3 },
              { label: "Stock-out Risks", value: overview?.stockoutCount ?? "—", icon: AlertTriangle },
              { label: "Products to Review", value: overview?.shutdownCount ?? "—", icon: TrendingDown },
              { label: "Products Tracked", value: overview?.productsTracked ?? "—", icon: Boxes },
            ].map(({ label, value, icon: Icon }) => (
              <ForecastMetricCard key={label} label={label} value={value} loading={isLoading} icon={<Icon className="h-3.5 w-3.5 text-muted-foreground/70" />} />
            ))}
          </div>
        </motion.div>

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
          className="overflow-hidden rounded-2xl border border-black/10 bg-white"
        >
          <div className="flex h-[50px] items-center justify-between border-b border-black/10 px-6">
            <div className="flex items-center gap-2.5">
              <img src="https://img.icons8.com/material-rounded/24/bard--v2.png" alt="" className="h-3.5 w-3.5 object-contain opacity-75" />
              <AnimatedText className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Executive Summary</AnimatedText>
            </div>
            {overview && (
              <span className="text-[13px] text-muted-foreground">
                Last {data?.lookbackDays} days · {overview.revenueChange >= 0 ? "+" : ""}{overview.revenueChange}%
              </span>
            )}
          </div>
          <div className="p-6">
            {isLoading ? (
              <div className="space-y-3">
                <div className="h-4 w-3/4 animate-pulse rounded bg-black/[0.06]" />
                <div className="h-4 w-full animate-pulse rounded bg-black/[0.06]" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-black/[0.06]" />
              </div>
            ) : (
              <div className="prose prose-sm max-w-none text-foreground/80 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_strong]:text-foreground">
                <ReactMarkdown>{data?.aiSummary || "No forecast available yet."}</ReactMarkdown>
              </div>
            )}
          </div>
        </motion.section>

        {/* Small cards — 2x2 grid */}
        <div className="grid gap-6 xl:grid-cols-2">
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="overflow-hidden rounded-2xl border border-black/10 bg-white"
          >
            <div className="flex h-[50px] items-center gap-2.5 border-b border-black/10 px-6">
              <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
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
            className="overflow-hidden rounded-2xl border border-black/10 bg-white"
          >
            <div className="flex h-[50px] items-center gap-2.5 border-b border-black/10 px-6">
              <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
              <AnimatedText className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Business Signals</AnimatedText>
            </div>
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
            icon={<AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
            products={stockoutRisks}
            empty="No products are projected to stock out soon."
            variant="danger"
          />
          <RiskPanel
            title="Products to Stop or Fix"
            icon={<TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />}
            products={shutdownCandidates}
            empty="No shutdown candidates found in the current lookback."
          />
        </div>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="overflow-hidden rounded-2xl border border-black/10 bg-white"
        >
          <div className="flex h-[50px] items-center justify-between border-b border-black/10 px-6">
            <div className="flex items-center gap-2.5">
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
              <AnimatedText className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Product Intelligence</AnimatedText>
            </div>
            <span className="text-[13px] text-muted-foreground">{products.length} products</span>
          </div>

          <div className="overflow-x-auto">
            <div className="grid min-w-[980px] grid-cols-[minmax(220px,1fr)_110px_120px_110px_110px_130px_180px] border-b border-black/10 bg-black/[0.025]">
              {["Product", "Stock", "Sold", "Days Left", "Margin", "Score", "Recommendation"].map((header) => (
                <div key={header} className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
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
                    <span className={cn("mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium", statusClass(product.status))}>
                      {statusLabel(product.status)}
                    </span>
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
      </main>
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

function ForecastMetricCard({ label, value, loading, icon }: { label: string; value: string | number; loading: boolean; icon: ReactNode }) {
  return (
    <div
      className="min-w-0 overflow-hidden"
      style={{
        background: "#E9E8E5",
        borderRadius: "14px",
        padding: "4px",
        border: "1.5px solid rgba(0,0,0,0.07)",
        boxShadow: "0 2px 6px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.7)",
      }}
    >
      <div
        style={{
          background: "#F7F7F6",
          borderRadius: "10px",
          border: "1px solid rgba(0,0,0,0.05)",
          padding: "12px 14px",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.06)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[#7F7F7D]">{label}</p>
          {icon}
        </div>
        {loading ? (
          <div className="h-6 w-24 animate-pulse rounded bg-black/[0.06]" />
        ) : (
          <p className="font-sf-display text-[22px] font-bold leading-none tracking-tight text-[#222A38] tabular-nums">{value}</p>
        )}
      </div>
    </div>
  );
}

function RiskPanel({ title, icon, products, empty, variant = "default" }: { title: string; icon: ReactNode; products: ProductForecast[]; empty: string; variant?: "default" | "danger" }) {
  const isDanger = variant === "danger";
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "overflow-hidden rounded-2xl border",
        isDanger ? "border-red-200 bg-red-50/60" : "border-black/10 bg-white"
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
          <div className={cn("px-6 py-10 text-center text-sm", isDanger ? "text-red-400" : "text-muted-foreground")}>{empty}</div>
        )}
      </div>
    </motion.section>
  );
}
