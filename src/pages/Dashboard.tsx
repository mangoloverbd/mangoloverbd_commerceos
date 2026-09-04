import { useState, useEffect, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useLiveVisitors } from "@/hooks/useLiveVisitors";
import { useWarehouses } from "@/hooks/useWarehouses";
import { Select, SelectItem } from "@/components/base/select/select";
import { getDhakaGreeting } from "@/lib/greeting";
import { GlobeAnalytics } from "@/components/ui/cobe-globe-analytics";
import { OrdersTable } from "@/components/OrdersTable";
import OrderCreatorModal from "@/components/OrderCreatorModal";
import { toast, DarkToast } from "@/components/ui/sonner";
import {
  ShieldCheck, Search, AlertTriangle,
  Info, Check, X, Plus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Spinner } from "@/components/ui/ios-spinner";
import { TextEffect } from "@/components/ui/text-effect";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { PopButton } from "@/components/ui/pop-button";
import { DateRangePicker } from "@/components/DateRangePicker";
import PixelRipple from "@/components/ui/pixel-ripple";
import { BarChart, Bar, Cell, ResponsiveContainer, Tooltip } from "recharts";

function toYMD(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

// The immediately-preceding range of equal length, used for period-over-period
// trend comparison on the finance metric cards.
function prevRangeOf(range?: DateRange | null): DateRange | null {
  if (!range?.from || !range?.to) return null;
  const dayMs = 86400000;
  const days = Math.round((range.to.getTime() - range.from.getTime()) / dayMs) + 1;
  const prevTo = new Date(range.from.getTime() - dayMs);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * dayMs);
  return { from: prevFrom, to: prevTo };
}

function dhakaToday(): Date {
  const dhakaMs = Date.now() + 6 * 60 * 60 * 1000;
  const d = new Date(dhakaMs);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

const TODAY = dhakaToday();

interface Analytics {
  revenue: number;
  shipping: number;
  adSpend: number | null;
  totalCog: number;
  cogCoverage: { set: number; total: number };
  profit: number | null;
  fbConfigured: boolean;
  usdToBdt: number;
  fbError: string | null;
  series?: {
    revenue: number[];
    shipping: number[];
    adSpend: number[];
    totalCog: number[];
    profit: number[];
    buckets: Array<{
      key: string;
      label: string;
      revenue: number;
      shipping: number;
      adSpend: number;
      totalCog: number;
      profit: number;
    }>;
  };
}

interface FraudData {
  mobile_number: string;
  total_parcels: number;
  total_delivered: number;
  total_cancel: number;
  apis?: Record<string, {
    total_parcels: number;
    total_delivered_parcels: number;
    total_cancelled_parcels: number;
  }>;
}

interface Order {
  id: string;
  shopify_order_id: number;
  order_number: string;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  product: string | null;
  quantity: number | null;
  price: number | null;
  status: string;
  created_at: string;
  fraud_checked: boolean | null;
  fraud_data: FraudData | null;
  delivery_rate: number | null;
  notes: string | null;
  fulfillment_status: string | null;
  warehouse_id?: string | null;
  warehouse_auto?: boolean | null;
  weight_kg?: number | null;
}

function fmtBDT(n: number) {
  return "৳" + n.toLocaleString("en-BD", { maximumFractionDigits: 0 });
}



function MiniBarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  // The tallest bar is inked black (reference look); the rest are light gray.
  const peakIdx = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  // Zero renders as a small baseline tick so the chart reads as "no data that
  // period" rather than a blank chart. Tooltip still shows the real value (0).
  const chartData = data.map((d) => ({
    label: d.label,
    value: d.value,
    display: d.value === 0 ? max * 0.18 : d.value,
  }));

  return (
    <div className="shrink-0" style={{ width: "72px", height: "28px" }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }} barCategoryGap={1} barSize={2}>
          <Tooltip
            cursor={false}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="whitespace-nowrap rounded-md bg-[#131316] px-2 py-1 text-[10px] leading-tight text-white shadow-lg">
                  <span className="text-white/50">{label} · </span>
                  <span className="font-medium tabular-nums">{fmtBDT((payload[0].payload as { value: number }).value)}</span>
                </div>
              );
            }}
          />
          <Bar dataKey="display" radius={[2, 2, 2, 2]} isAnimationActive animationDuration={600} animationEasing="ease-out">
            {chartData.map((d, i) => {
              const isPeak = i === peakIdx;
              const fill = isPeak ? "#111111" : "#D4D4D1";
              return <Cell key={i} fill={fill} fillOpacity={isPeak ? 1 : 0.9} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const dashboardTextEffectVariants = {
  container: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.045 },
    },
  },
  item: {
    hidden: { opacity: 0, y: 8, filter: "blur(6px)" },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: { duration: 0.35, ease: "easeOut" },
    },
  },
};

function DashboardTextEffect({
  children,
  className,
  as = "span",
  per = "word",
  delay = 0.08,
}: {
  children: string;
  className?: string;
  as?: "span" | "p";
  per?: "word" | "char";
  delay?: number;
}) {
  return (
    <TextEffect
      key={children}
      as={as}
      per={per}
      delay={delay}
      variants={dashboardTextEffectVariants}
      className={className}
    >
      {children}
    </TextEffect>
  );
}

function FinanceMetric({
  label,
  loading,
  value,
  data,
  trend,
}: {
  label: string;
  loading: boolean;
  value: string;
  data: { label: string; value: number }[];
  trend?: number | null;
  seed?: number;
  tone?: "blue" | "green" | "red" | "amber" | "neutral";
  color?: string;
  gradientId?: string;
}) {
  const hasTrend = typeof trend === "number" && Number.isFinite(trend);
  const isPositive = (trend ?? 0) >= 0;

  return (
    // Outer light-gray tray — the white card floats inside it and the trend
    // footer sits on this gray base below the card (two-layer reference look).
    <div
      className="flex-1 min-w-[140px]"
      style={{
        background: "#EBEBE8",
        borderRadius: "8px",
        padding: "2px 2px 0",
        border: "1px solid #f2f2f2",
      }}
    >
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="space-y-2.5"
              style={{
                background: "#FFFFFF",
                borderRadius: "12px",
                border: "1px solid rgba(0,0,0,0.05)",
                padding: "13px 14px 15px",
              }}
            >
              <div className="h-2.5 w-16 animate-pulse rounded" style={{ background: "rgba(0,0,0,0.06)" }} />
              <div className="h-6 w-24 animate-pulse rounded" style={{ background: "rgba(0,0,0,0.06)" }} />
            </div>
            <div className="flex h-[34px] items-center px-1.5">
              <div className="h-3 w-20 animate-pulse rounded" style={{ background: "rgba(0,0,0,0.06)" }} />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="value"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {/* Inner white card */}
            <div
              style={{
                background: "#FFFFFF",
                borderRadius: "8px",
                border: "1px solid #dedede",
                boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                padding: "13px 14px 6px",
              }}
            >
              {/* Label */}
              <p
                style={{
                  fontSize: "10px",
                  fontWeight: 500,
                  letterSpacing: "0.16em",
                  color: "#8A8A86",
                  textTransform: "uppercase",
                  margin: 0,
                }}
              >
                {label}
              </p>

              {/* Value + Bar chart row */}
              <div className="mt-2 flex items-end justify-between">
                <DashboardTextEffect
                  as="p"
                  per="char"
                  delay={0.12}
                  className="m-0 text-[22px] font-bold leading-none text-[#1A1A1A] tabular-nums tracking-tight"
                >
                  {value}
                </DashboardTextEffect>
                <MiniBarChart data={data} />
              </div>
            </div>

            {/* Trend footer — sits on the gray tray below the white card */}
            <div className="flex h-[28px] items-center justify-between px-1.5">
              <span className="flex items-center justify-center text-black/35">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  style={{ transform: isPositive ? undefined : "rotate(180deg)" }}
                >
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2.75C6.89137 2.75 2.75 6.89137 2.75 12C2.75 17.1086 6.89137 21.25 12 21.25C17.1086 21.25 21.25 17.1086 21.25 12C21.25 6.89137 17.1086 2.75 12 2.75ZM1.25 12C1.25 6.06294 6.06294 1.25 12 1.25C17.9371 1.25 22.75 6.06294 22.75 12C22.75 17.9371 17.9371 22.75 12 22.75C6.06294 22.75 1.25 17.9371 1.25 12ZM8.46967 12.9697L11.4697 9.96967C11.7626 9.67678 12.2374 9.67678 12.5303 9.96967L15.5303 12.9697C15.8232 13.2626 15.8232 13.7374 15.5303 14.0303C15.2374 14.3232 14.7626 14.3232 14.4697 14.0303L12 11.5607L9.53033 14.0303C9.23744 14.3232 8.76256 14.3232 8.46967 14.0303C8.17678 13.7374 8.17678 13.2626 8.46967 12.9697Z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              {hasTrend ? (
                <p className="m-0 text-[12px]">
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      isPositive ? "text-emerald-600" : "text-red-500"
                    )}
                  >
                    {isPositive ? "+" : ""}
                    {(trend ?? 0).toFixed(2)}%
                  </span>{" "}
                  <span className="text-black/40">vs prev</span>
                </p>
              ) : (
                <span className="text-[12px] text-black/30">—</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [checkingFraud, setCheckingFraud] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const { warehouses } = useWarehouses();
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [prevAnalytics, setPrevAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const todayRange = useMemo<DateRange>(() => ({ from: TODAY, to: TODAY }), []);
  const [dateRange, setDateRange] = useState<DateRange | null>(todayRange);
  const ORDER_PAGE_SIZE = 100;
  const [orderPage, setOrderPage] = useState(0);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const liveVisitors = useLiveVisitors();

  const fetchAnalytics = useCallback(async (range?: DateRange | null, silent = false) => {
    if (!silent) setAnalyticsLoading(true);
    try {
      const buildParams = (r?: DateRange | null) => {
        const p = new URLSearchParams({ t: String(Date.now()) });
        if (r?.from) p.set("since", toYMD(r.from));
        if (r?.to)   p.set("until", toYMD(r.to));
        return p;
      };
      const prev = prevRangeOf(range);
      const [res, prevRes] = await Promise.all([
        apiFetch(`/api/analytics?${buildParams(range)}`, { cache: "no-store" }),
        prev ? apiFetch(`/api/analytics?${buildParams(prev)}`, { cache: "no-store" }) : Promise.resolve(null),
      ]);
      const data = await res.json();
      if (res.ok) setAnalytics(data);
      if (prevRes && prevRes.ok) setPrevAnalytics(await prevRes.json());
      else if (!prev) setPrevAnalytics(null);
    } catch { /* non-critical */ }
    finally { if (!silent) setAnalyticsLoading(false); }
  }, []);

  // Hoisted to useCallback so effects can reference it without stale closures
  const fetchOrders = useCallback(async () => {
    try {
      const res = await apiFetch("/api/orders");
      if (!res.ok) throw new Error("Failed to load orders");
      const data = await res.json();
      const nextOrders = (data.orders as Order[]) || [];
      queryClient.setQueryData(["/api/orders"], nextOrders);
      setOrders(nextOrders);
    } catch {
      toast.custom(() => (
        <DarkToast className="flex items-center gap-3">
          <div className="flex h-9 w-9 rounded-lg bg-red-500/15 items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-white">Failed to load orders</p>
            <p className="text-[11px] text-white/50">Check your connection</p>
          </div>
        </DarkToast>
      ), { fit: true });
    } finally { setLoading(false); }
  }, [queryClient]);

  // Reset state when the logged-in user changes
  useEffect(() => {
    const cachedOrders = queryClient.getQueryData<Order[]>(["/api/orders"]);
    setOrders(cachedOrders || []);
    setAnalytics(null);
    setPrevAnalytics(null);
    setLoading(!cachedOrders);
    setAnalyticsLoading(true);
  }, [queryClient, user?.id]);

  const handleDateRangeChange = useCallback((range: DateRange | null) => {
    setDateRange(range);
    fetchAnalytics(range);
  }, [fetchAnalytics]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setOrderPage(0);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Auto-sync on mount, then poll orders every 30 s.
  // The Shopify sync is throttled to once per session per user via sessionStorage
  // so HMR hot-reloads and navigation back to the dashboard don't re-trigger it.
  useEffect(() => {
    if (!user?.id || roleLoading) return;

    const syncKey = `autosync_done_${user.id}`;
    const alreadySynced = sessionStorage.getItem(syncKey);

    const runAutoSync = async () => {
      // Load orders from DB immediately — don't wait for Shopify sync
      fetchOrders();
      fetchAnalytics(todayRange);

      // Refresh Pathao and Steadfast courier statuses in background
      apiFetch("/api/pathao/refresh-status", { method: "POST" })
        .then(() => fetchOrders())
        .catch(() => {});
      apiFetch("/api/steadfast/refresh-status", { method: "POST" })
        .then(() => fetchOrders())
        .catch(() => {});

      // Sync Shopify in the background without blocking the UI
      if (!alreadySynced) {
        setAutoSyncing(true);
        try {
          await apiFetch("/api/fetch-shopify-orders", { method: "POST", headers: { "Content-Type": "application/json" } });
          sessionStorage.setItem(syncKey, "1");
          // Refresh orders after sync completes
          fetchOrders();
          fetchAnalytics(todayRange);
        } catch { /* ignore */ }
        finally {
          setAutoSyncing(false);
        }
      }
    };
    runAutoSync();
    const intervalId = setInterval(() => fetchOrders(), 30000);
    return () => clearInterval(intervalId);
  }, [user?.id, roleLoading, fetchOrders, fetchAnalytics, todayRange]);

  // Silent analytics tick — keeps today's metric values and sparkline bars
  // growing live without flashing the skeleton loader.
  useEffect(() => {
    const id = setInterval(() => fetchAnalytics(dateRange, true), 30000);
    return () => clearInterval(id);
  }, [dateRange, fetchAnalytics]);

  const checkFraud = async () => {
    setCheckingFraud(true);
    try {
      const res = await apiFetch("/api/check-fraud", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fraud check failed");
      await fetchOrders();
      toast.custom(() => (
        <DarkToast className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-white">{data?.successful ?? 0} verified</p>
            <p className="text-[11px] text-white/50">of {data?.checked ?? 0} checked</p>
          </div>
        </DarkToast>
      ), { fit: true });
    } catch { toast.error("Fraud check failed"); }
    finally { setCheckingFraud(false); }
  };

  const handleStatusUpdate = (orderId: string, newStatus: string) => {
    setOrders((prev) => {
      const next = prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o));
      queryClient.setQueryData(["/api/orders"], next);
      return next;
    });
  };

  const handleOrderUpdate = (updatedOrder: Order) => {
    setOrders((prev) => {
      const oldOrder = prev.find((o) => o.id === updatedOrder.id);
      // Only refresh analytics if fields that affect revenue/costs changed
      const needsAnalyticsRefresh = oldOrder && (
        oldOrder.price !== updatedOrder.price ||
        oldOrder.delivery_rate !== updatedOrder.delivery_rate ||
        oldOrder.quantity !== updatedOrder.quantity
      );
      if (needsAnalyticsRefresh) {
        fetchAnalytics(dateRange);
      }
      const next = prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o));
      queryClient.setQueryData(["/api/orders"], next);
      return next;
    });
  };

  const filteredOrders = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return orders.filter((o) => {
      if (warehouseFilter !== "all" && o.warehouse_id !== warehouseFilter) return false;
      if (!q) return true;
      return (
        o.order_number.toLowerCase().includes(q) ||
        (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
        (o.phone && o.phone.toLowerCase().includes(q))
      );
    });
  }, [orders, debouncedSearch, warehouseFilter]);

  // Cap rendered rows so the (unvirtualized) table doesn't balloon the DOM,
  // which keeps interactions like the avatar menu responsive on the dashboard.
  const orderTotalPages = Math.max(1, Math.ceil(filteredOrders.length / ORDER_PAGE_SIZE));
  const orderSafePage = Math.min(orderPage, orderTotalPages - 1);
  const visibleOrders = useMemo(
    () => filteredOrders.slice(orderSafePage * ORDER_PAGE_SIZE, (orderSafePage + 1) * ORDER_PAGE_SIZE),
    [filteredOrders, orderSafePage],
  );

  const metricSparklines = useMemo(() => {
    const buckets = analytics?.series?.buckets;
    const empty: { label: string; value: number }[] = [{ label: "—", value: 0 }];
    if (!buckets?.length) {
      return { revenue: empty, adSpend: empty, shipping: empty, cog: empty, profit: empty };
    }
    // Hourly buckets have a 4-segment key ("2026-08-15-14"); daily have 3 ("2026-08-15").
    const isHourly = buckets[0].key.split("-").length === 4;
    const pts = (key: "revenue" | "adSpend" | "shipping" | "totalCog" | "profit") =>
      buckets.map((b) => ({
        label: isHourly ? b.label : format(parseISO(b.key), "MMM d"),
        value: b[key] ?? 0,
      }));
    return {
      revenue: pts("revenue"),
      adSpend: pts("adSpend"),
      shipping: pts("shipping"),
      cog: pts("totalCog"),
      profit: pts("profit"),
    };
  }, [analytics]);

  // Period-over-period % change per metric (current vs the previous equal-length
  // range). null when there's no comparable previous value, which hides the footer %.
  const trends = useMemo(() => {
    const pct = (cur?: number | null, prev?: number | null): number | null => {
      if (cur == null || prev == null) return null;
      if (prev === 0) return cur === 0 ? 0 : null;
      return ((cur - prev) / Math.abs(prev)) * 100;
    };
    return {
      revenue: pct(analytics?.revenue, prevAnalytics?.revenue),
      adSpend: pct(analytics?.adSpend, prevAnalytics?.adSpend),
      shipping: pct(analytics?.shipping, prevAnalytics?.shipping),
      cog: pct(analytics?.totalCog, prevAnalytics?.totalCog),
      profit: pct(analytics?.profit, prevAnalytics?.profit),
    };
  }, [analytics, prevAnalytics]);
  if (loading) {
    return (
      <div className="relative min-h-[calc(100vh-96px)] p-1 lg:p-2">
        <div className="pointer-events-none space-y-6 opacity-45 blur-[0.5px]">
          <div className="overflow-hidden rounded-xl border border-black/10 bg-white">
            <div className="flex h-[48px] items-center justify-between border-b border-black/10 px-6">
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="h-7 w-36 animate-pulse rounded-lg bg-muted" />
            </div>
            <div className="flex">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex-1 space-y-3 border-r border-border px-6 py-5 last:border-r-0">
                  <div className="h-2.5 w-16 animate-pulse rounded bg-muted" />
                  <div className="h-8 w-24 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-black/10 bg-white">
            <div className="flex items-center justify-between border-b border-black/10 px-6 py-3">
              <div className="h-3 w-28 animate-pulse rounded bg-muted" />
              <div className="flex gap-2">
                <div className="h-8 w-44 animate-pulse rounded-lg bg-muted" />
                <div className="h-8 w-20 animate-pulse rounded-lg bg-muted" />
                <div className="h-8 w-24 animate-pulse rounded-lg bg-muted" />
              </div>
            </div>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-border px-6 py-3.5 last:border-0" style={{ opacity: 1 - i * 0.09 }}>
                <div className="h-3 w-14 animate-pulse rounded bg-muted" />
                <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                <div className="h-3 flex-1 animate-pulse rounded bg-muted" />
                <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
              </div>
            ))}
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center justify-center gap-3">
            <Spinner size="lg" className="text-foreground" />
            <span className="text-sm font-medium tracking-wide text-foreground">Loading</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-6 p-1 lg:p-2 overflow-x-clip">
      {autoSyncing && (
        <div className="pointer-events-none absolute right-3 top-3 z-30 flex items-center gap-2 rounded-full border border-black/10 bg-white/90 px-3 py-1.5 shadow-sm backdrop-blur">
          <Spinner size="sm" className="text-foreground" />
          <span className="text-[11px] font-medium tracking-wide text-foreground">Loading…</span>
        </div>
      )}

      {/* ── P&L Panel ───────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative rounded-2xl bg-[#F3F3F3]"
        // Clip top/sides (rounded) but leave the bottom open so the globe
        // can flow down behind the Fulfillment Queue card instead of cutting off.
        style={{ clipPath: "inset(0 0 -100% 0 round 16px)" }}
      >
        {/* Blur overlay for non-admins */}
        {!isAdmin && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256" fill="currentColor" className="text-black/20">
              <path d="M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM96,56a32,32,0,0,1,64,0V80H96ZM208,208H48V96H208V208Z"/>
            </svg>
          </div>
        )}
        <div className={!isAdmin ? "blur-[8px] pointer-events-none select-none" : ""}>
          {/* Header row — hidden when empty to eliminate the top gap */}
          {analytics?.fbError && (
            <div className="relative z-10 flex items-center justify-end mb-3">
              <span className="text-[10px] text-destructive max-w-[200px] truncate">{analytics.fbError}</span>
            </div>
          )}

          {/* Metric cards grid */}
          <div className="relative z-10 grid grid-cols-2 lg:grid-cols-5 gap-3">
            <FinanceMetric
              label="Revenue"
              loading={analyticsLoading}
              value={fmtBDT(analytics?.revenue ?? 0)}
              data={metricSparklines.revenue}
              trend={trends.revenue}
              seed={11}
            />
            <FinanceMetric
              label="Ad Spend"
              loading={analyticsLoading}
              value={analytics?.adSpend != null ? fmtBDT(analytics.adSpend) : "—"}
              data={metricSparklines.adSpend}
              trend={trends.adSpend}
              seed={27}
            />
            <FinanceMetric
              label="Shipping"
              loading={analyticsLoading}
              value={fmtBDT(analytics?.shipping ?? 0)}
              data={metricSparklines.shipping}
              trend={trends.shipping}
              seed={43}
            />
            <FinanceMetric
              label="Cost of Goods"
              loading={analyticsLoading}
              value={fmtBDT(analytics?.totalCog ?? 0)}
              data={metricSparklines.cog}
              trend={trends.cog}
              seed={59}
            />
            <FinanceMetric
              label="Net Profit"
              loading={analyticsLoading}
              value={analytics?.profit != null ? `${analytics.profit < 0 ? "−" : ""}${fmtBDT(Math.abs(analytics.profit))}` : "—"}
              data={metricSparklines.profit}
              trend={trends.profit}
              seed={75}
            />
          </div>
        </div>

        {/* Globe — large, anchored to the right edge and bleeding off the
            corner behind the content, like the Shopify hero */}
        <div className="pointer-events-none absolute right-[-170px] top-1/2 z-0 -translate-y-1/2">
          <GlobeAnalytics className="w-[620px]" />
        </div>

        {/* ── Greeting band — inside the hero, above the globe ───────── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.4 }}
          className="relative z-10 grid items-center md:grid-cols-[1fr_auto_1fr] pb-10 pt-8"
        >
          {/* Pixel background — left side only (globe stays on the right) */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 z-0 hidden h-full w-1/2 md:block"
          >
            <PixelRipple
              gap={5}
              dotSize={2.5}
              maxOpacity={0.85}
              className="absolute inset-0 h-full w-full"
            />
          </div>

          <div className="hidden md:block" />
        <div className="text-center relative z-10">
          <TextShimmer
            as="h2"
            duration={3}
            className="text-5xl font-bold"
          >
            {`${getDhakaGreeting()}!`}
          </TextShimmer>
          <p className="mt-2 text-base font-light text-black/45">
            Manage your operations and every profit under one roof.
          </p>

          {/* Moved cluster — centered below the greeting */}
          <DateRangePicker value={dateRange} onChange={handleDateRangeChange} triggerClassName="uv-beam rounded-lg">
            <span className="uv-beam group relative rounded-lg">
              <div className="flex h-8 items-center gap-1.5 rounded-lg bg-background px-3 text-[11px] font-medium text-foreground/70 tabular-nums">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" style={{ animationDelay: "0.75s" }} />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
                {liveVisitors.count} Online visitors
              </div>
              <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-44 -translate-x-1/2 rounded-lg border border-black/10 bg-white p-3 text-[11px] font-medium text-foreground/70 shadow-lg group-hover:block">
                <div className="flex items-center justify-between py-0.5">
                  <span>Online visitors</span>
                  <span className="tabular-nums text-foreground">{liveVisitors.count}</span>
                </div>
                <div className="flex items-center justify-between py-0.5">
                  <span>Add to cart</span>
                  <span className="tabular-nums text-foreground">{liveVisitors.details.activeCarts}</span>
                </div>
                <div className="flex items-center justify-between py-0.5">
                  <span>Purchasing</span>
                  <span className="tabular-nums text-foreground">{liveVisitors.details.checkingOut}</span>
                </div>
                <div className="flex items-center justify-between py-0.5">
                  <span>Purchased</span>
                  <span className="tabular-nums text-foreground">{liveVisitors.details.purchased}</span>
                </div>
              </div>
            </span>
          </DateRangePicker>
        </div>
          <div className="hidden md:block" />
        </motion.div>
      </motion.div>

      {/* ── Orders table card ────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="relative z-10 overflow-hidden rounded-xl border border-black/10 bg-white"
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-black/10 px-6 py-3">
          <div className="flex items-center gap-2.5">
            <TextEffect
              as="span"
              per="word"
              delay={0.12}
              variants={{
                container: {
                  hidden: { opacity: 0 },
                  visible: {
                    opacity: 1,
                    transition: { staggerChildren: 0.16 },
                  },
                },
                item: {
                  hidden: { opacity: 0, y: 12, filter: "blur(8px)" },
                  visible: {
                    opacity: 1,
                    y: 0,
                    filter: "blur(0px)",
                    transition: { duration: 0.55, ease: "easeOut" },
                  },
                },
              }}
              className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground"
            >
              Fulfillment Queue
            </TextEffect>
            <div className="w-px h-3.5 bg-black/10" />
            {loading ? (
              <span className="text-[13px] text-muted-foreground tabular-nums">—</span>
            ) : (
              <TextEffect
                key={filteredOrders.length}
                as="span"
                per="char"
                delay={0.45}
                variants={{
                  container: {
                    hidden: { opacity: 0 },
                    visible: {
                      opacity: 1,
                      transition: { staggerChildren: 0.045 },
                    },
                  },
                  item: {
                    hidden: { opacity: 0, y: 8, filter: "blur(6px)" },
                    visible: {
                      opacity: 1,
                      y: 0,
                      filter: "blur(0px)",
                      transition: { duration: 0.35, ease: "easeOut" },
                    },
                  },
                }}
                className="text-[13px] text-muted-foreground tabular-nums"
              >
                {`${filteredOrders.length} orders`}
              </TextEffect>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search orders…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9 w-56 rounded-xl border-0 bg-black/[0.06] pl-8 text-sm shadow-none placeholder:text-black/35 focus-visible:ring-1 focus-visible:ring-black/20"
                data-testid="input-search-orders"
              />
            </div>

            <Select
              aria-label="Filter orders by warehouse"
              data-testid="select-warehouse-filter"
              selectedKey={warehouseFilter}
              onSelectionChange={(key) => { setWarehouseFilter(String(key)); setOrderPage(0); }}
              triggerClassName="h-9"
            >
              <SelectItem id="all">All warehouses</SelectItem>
              {warehouses.map((warehouse) => <SelectItem key={warehouse.id} id={warehouse.id}>{warehouse.name}</SelectItem>)}
            </Select>

            <div className="w-px h-4 bg-black/10" />

            <PopButton
              color="yellow"
              size="sm"
              onClick={() => setCreateOrderOpen(true)}
              disabled={checkingFraud || autoSyncing}
              className="gap-1.5 px-3 text-[11px] font-bold tracking-normal text-black"
              data-testid="button-create-order"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Order
            </PopButton>

            <PopButton
              color="sky"
              size="sm"
              onClick={checkFraud}
              disabled={checkingFraud}
              className="gap-1.5 px-3 text-[11px] font-bold tracking-normal"
              data-testid="button-check-fraud"
            >
              {checkingFraud ? <Spinner size="sm" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              Verify All
            </PopButton>
          </div>
        </div>

        {/* Table */}
        <OrdersTable
          orders={visibleOrders}
          loading={loading}
          onStatusUpdate={handleStatusUpdate}
          onOrderUpdate={handleOrderUpdate}
        />

        {orderTotalPages > 1 && (
          <div className="relative flex items-center justify-between border-t border-black/10 px-4 py-3">
            <button
              type="button"
              onClick={() => setOrderPage((p) => Math.max(0, p - 1))}
              disabled={orderSafePage === 0}
              className="rounded-[8px] bg-[#E3E3E3]/80 px-5 py-2 text-[12px] font-medium text-zinc-900 shadow-[0_2px_4px_0_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.16),inset_0_1px_0_0_#FDFDFD] transition-all hover:bg-[#E3E3E3] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span className="absolute left-1/2 -translate-x-1/2 text-[11px] font-medium text-black/55 tabular-nums">
              Page {orderSafePage + 1} of {orderTotalPages}
            </span>
            <button
              type="button"
              onClick={() => setOrderPage((p) => Math.min(orderTotalPages - 1, p + 1))}
              disabled={orderSafePage >= orderTotalPages - 1}
              className="rounded-[8px] bg-[#E3E3E3]/80 px-5 py-2 text-[12px] font-medium text-zinc-900 shadow-[0_2px_4px_0_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.16),inset_0_1px_0_0_#FDFDFD] transition-all hover:bg-[#E3E3E3] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </motion.div>

      <OrderCreatorModal
        open={createOrderOpen}
        onOpenChange={setCreateOrderOpen}
        onCreated={() => {
          fetchOrders();
          fetchAnalytics(dateRange);
        }}
      />
      </div>
  );
}
