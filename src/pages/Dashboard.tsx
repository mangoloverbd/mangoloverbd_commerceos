import { useState, useEffect, useMemo, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useLiveVisitors } from "@/hooks/useLiveVisitors";
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
import { PopButton } from "@/components/ui/pop-button";
import { DateRangePicker } from "@/components/DateRangePicker";
import PixelBackground from "@/components/ui/pixel-background";
import PixelBlast from "@/components/PixelBlast";
import { BarChart, Bar, Cell, ResponsiveContainer, Tooltip } from "recharts";

function toYMD(d: Date): string {
  return format(d, "yyyy-MM-dd");
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
}

function fmtBDT(n: number) {
  return "৳" + n.toLocaleString("en-BD", { maximumFractionDigits: 0 });
}



function MiniBarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
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
        <BarChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }} barCategoryGap={1}>
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
          <Bar dataKey="display" radius={[3, 3, 0, 0]} isAnimationActive animationDuration={600} animationEasing="ease-out">
            {chartData.map((d, i) => {
              const isLast = i === chartData.length - 1;
              const fill = isLast ? "#232323" : "#8E8E88";
              const opacity = isLast ? 1 : d.value === 0 ? 0.45 : 0.75;
              return <Cell key={i} fill={fill} fillOpacity={opacity} />;
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
  seed = 42,
}: {
  label: string;
  loading: boolean;
  value: string;
  data: { label: string; value: number }[];
  seed?: number;
  tone?: "blue" | "green" | "red" | "amber" | "neutral";
  color?: string;
  gradientId?: string;
}) {
  return (
    <div
      className="flex-1 min-w-[140px] overflow-hidden"
      style={{
        background: "#F5F5F5",
        borderRadius: "8px",
        padding: "3px",
        border: "1.5px solid rgba(0,0,0,0.07)",
      }}
    >
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              background: "#F7F7F6",
              borderRadius: "10px",
              padding: "9px 12px",
            }}
            className="space-y-2"
          >
            <div className="h-2.5 w-16 animate-pulse rounded" style={{ background: "rgba(0,0,0,0.06)" }} />
            <div className="h-5 w-20 animate-pulse rounded" style={{ background: "rgba(0,0,0,0.06)" }} />
          </motion.div>
        ) : (
          <motion.div
            key="value"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {/* Inner white panel */}
            <div
              className="relative"
              style={{
                background: "#F7F7F6",
                borderRadius: "8px",
                border: "1px solid rgba(0,0,0,0.05)",
                padding: "9px 12px",
              }}
            >
              {/* PixelBlast background — static ink-texture, faded in from the left */}
              <div
                className="absolute inset-0 overflow-hidden"
                style={{
                  borderRadius: "10px",
                  opacity: 0.16,
                  maskImage: "linear-gradient(to right, transparent 0%, transparent 22%, black 72%)",
                  WebkitMaskImage: "linear-gradient(to right, transparent 0%, transparent 22%, black 72%)",
                }}
              >
                <PixelBlast
                  variant="square"
                  pixelSize={3}
                  color="#222A38"
                  patternScale={4}
                  patternDensity={1.2}
                  pixelSizeJitter={0.5}
                  enableRipples={false}
                  speed={0}
                  transparent
                  edgeFade={0}
                  seed={seed}
                />
              </div>
              {/* Content */}
              <div className="relative" style={{ zIndex: 1 }}>
                {/* Label */}
                <p
                  style={{
                    fontSize: "10px",
                    fontWeight: 500,
                    letterSpacing: "0.08em",
                    color: "#7F7F7D",
                    textTransform: "uppercase",
                    margin: 0,
                  }}
                >
                  {label}
                </p>

                {/* Value + Bar chart row */}
                <div className="mt-1.5 flex items-end justify-between">
                  <DashboardTextEffect
                    as="p"
                    per="char"
                    delay={0.12}
                    className="m-0 text-[20px] font-bold leading-none text-[#222A38] tabular-nums"
                  >
                    {value}
                  </DashboardTextEffect>
                  <MiniBarChart data={data} />
                </div>
              </div>
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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const todayRange = useMemo<DateRange>(() => ({ from: TODAY, to: TODAY }), []);
  const [dateRange, setDateRange] = useState<DateRange | null>(todayRange);
  const ORDER_PAGE_SIZE = 100;
  const [orderPage, setOrderPage] = useState(0);
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const liveVisitors = useLiveVisitors();

  const fetchAnalytics = useCallback(async (range?: DateRange | null, silent = false) => {
    if (!silent) setAnalyticsLoading(true);
    try {
      const params = new URLSearchParams({ t: String(Date.now()) });
      if (range?.from) params.set("since", toYMD(range.from));
      if (range?.to)   params.set("until", toYMD(range.to));
      const res = await apiFetch(`/api/analytics?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setAnalytics(data);
    } catch { /* non-critical */ }
    finally { if (!silent) setAnalyticsLoading(false); }
  }, []);

  // Hoisted to useCallback so effects can reference it without stale closures
  const fetchOrders = useCallback(async () => {
    try {
      const res = await apiFetch("/api/orders");
      if (!res.ok) throw new Error("Failed to load orders");
      const data = await res.json();
      setOrders((data.orders as Order[]) || []);
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
  }, []);

  // Reset state when the logged-in user changes
  useEffect(() => {
    setOrders([]);
    setAnalytics(null);
    setLoading(true);
    setAnalyticsLoading(true);
  }, [user?.id]);

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

  const handleStatusUpdate = (orderId: string, newStatus: string) =>
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));

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
      return prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o));
    });
  };

  const filteredOrders = useMemo(() => {
    if (!debouncedSearch.trim()) return orders;
    const q = debouncedSearch.toLowerCase();
    return orders.filter(
      (o) =>
        o.order_number.toLowerCase().includes(q) ||
        (o.customer_name && o.customer_name.toLowerCase().includes(q)) ||
        (o.phone && o.phone.toLowerCase().includes(q))
    );
  }, [orders, debouncedSearch]);

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

  // ── Loading state ─────────────────────────────────────────────────────────
  if (autoSyncing || loading) {
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
            <span className="text-sm font-medium tracking-wide text-foreground">{autoSyncing ? "Syncing Orders" : "Loading"}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1 lg:p-2 overflow-x-clip">

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
          {/* Header row */}
          <div className="relative z-10 flex items-center justify-end mb-3">
            {analytics?.fbError && (
              <span className="text-[10px] text-destructive max-w-[200px] truncate">{analytics.fbError}</span>
            )}
          </div>

          {/* Metric cards grid */}
          <div className="relative z-10 grid grid-cols-2 lg:grid-cols-5 gap-3">
            <FinanceMetric
              label="Revenue"
              loading={analyticsLoading}
              value={fmtBDT(analytics?.revenue ?? 0)}
              data={metricSparklines.revenue}
              seed={11}
            />
            <FinanceMetric
              label="Ad Spend"
              loading={analyticsLoading}
              value={analytics?.adSpend != null ? fmtBDT(analytics.adSpend) : "—"}
              data={metricSparklines.adSpend}
              seed={27}
            />
            <FinanceMetric
              label="Shipping"
              loading={analyticsLoading}
              value={fmtBDT(analytics?.shipping ?? 0)}
              data={metricSparklines.shipping}
              seed={43}
            />
            <FinanceMetric
              label="Cost of Goods"
              loading={analyticsLoading}
              value={fmtBDT(analytics?.totalCog ?? 0)}
              data={metricSparklines.cog}
              seed={59}
            />
            <FinanceMetric
              label="Net Profit"
              loading={analyticsLoading}
              value={analytics?.profit != null ? `${analytics.profit < 0 ? "−" : ""}${fmtBDT(Math.abs(analytics.profit))}` : "—"}
              data={metricSparklines.profit}
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
            <PixelBackground
              direction="left"
              gap={7}
              speed={70}
              colors="#1a1a1a,#ef4444"
              opacity={0.09}
              className="absolute inset-0 h-full w-full"
            />
          </div>

          <div className="hidden md:block" />
        <div className="text-center relative z-10">
          <h2 className="text-5xl font-bold text-black">
            {getDhakaGreeting()}!
          </h2>
          <p className="mt-2 text-base font-light text-black/45">
            Manage all your operations under one roof.
          </p>

          {/* Moved cluster — centered below the greeting */}
          <DateRangePicker value={dateRange} onChange={handleDateRangeChange} triggerClassName="uv-beam rounded-full">
            <span className="uv-beam group relative rounded-full">
              <div className="flex h-8 items-center gap-1.5 rounded-full bg-background px-3 text-[11px] font-medium text-foreground/70 tabular-nums">
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
