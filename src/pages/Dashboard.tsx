import { useState, useEffect, useMemo, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useOrgName } from "@/hooks/useOrgName";
import { OrdersTable } from "@/components/OrdersTable";
import { toast, DarkToast } from "@/components/ui/sonner";
import {
  RefreshCw, ShieldCheck, Search, AlertTriangle,
  Info, Check, X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Spinner } from "@/components/ui/ios-spinner";
import { TextEffect } from "@/components/ui/text-effect";
import { PopButton } from "@/components/ui/pop-button";
import { DateRangePicker } from "@/components/DateRangePicker";
import PixelBlast from "@/components/ui/pixel-blast";

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



function MiniBarChart({ values, endDate }: { values: number[]; endDate?: Date }) {
  const bars = values.length === 0 ? [0, 0, 0, 0, 0, 0, 0] : values.slice(-7);
  const max = Math.max(...bars, 1);
  const end = endDate ?? TODAY;

  return (
    <div className="flex items-end shrink-0" style={{ gap: "3px", height: "26px" }}>
      {bars.map((v, i) => {
        const isActive = i === bars.length - 1;
        // Zero renders as a small baseline tick — visible but clearly "no data"
        const height = v === 0 ? 18 : Math.max(20, (v / max) * 100);
        const day = subDays(end, bars.length - 1 - i);
        return (
          <div key={i} className="group/bar relative flex h-full items-end">
            <div
              className="rounded-full transition-[height,background-color,opacity] duration-700 ease-out"
              style={{
                width: isActive ? "4px" : "3px",
                height: `${height}%`,
                backgroundColor: isActive ? "#232323" : "#8E8E88",
                opacity: isActive ? 1 : v === 0 ? 0.45 : 0.75,
              }}
            />
            <div className="pointer-events-none absolute bottom-full right-1/2 z-20 mb-1.5 translate-x-1/2 whitespace-nowrap rounded-md bg-[#131316] px-2 py-1 text-[10px] leading-tight text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/bar:opacity-100">
              <span className="text-white/50">{format(day, "MMM d")} · </span>
              <span className="font-medium tabular-nums">{fmtBDT(v)}</span>
            </div>
          </div>
        );
      })}
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

function LiveVisitorsCounter() {
  const [count, setCount] = useState(0);
  const [details, setDetails] = useState({ activeCarts: 0, checkingOut: 0, purchased: 0 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchCount = async () => {
      try {
        const res = await apiFetch("/api/live-visitors", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setCount(Number(data.count) || 0);
          setDetails({
            activeCarts: Number(data.details?.activeCarts) || 0,
            checkingOut: Number(data.details?.checkingOut) || 0,
            purchased: Number(data.details?.purchased) || 0,
          });
        }
      } catch {
        // Non-critical dashboard signal.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    fetchCount();
    const interval = window.setInterval(fetchCount, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (!loaded) return null;

  const behaviorRows = [
    { label: "Active carts", value: details.activeCarts },
    { label: "Checking out", value: details.checkingOut },
    { label: "Purchased", value: details.purchased },
  ];

  return (
    <div className="group relative">
      <div className="flex h-8 cursor-default items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[11px] font-medium text-foreground/70 tabular-nums">
        <span className="relative flex h-2 w-2">
          {count > 0 && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />}
          <span className={cn("relative inline-flex h-2 w-2 rounded-full", count > 0 ? "bg-emerald-500" : "bg-black/20")} />
        </span>
        {count} online
      </div>

      <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-56 translate-y-1 rounded-xl border border-black/[0.08] bg-white p-4 opacity-0 shadow-[0_10px_30px_rgba(0,0,0,0.08)] transition-all duration-150 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-black/35">Visitors right now</p>
            <p className="mt-1 text-2xl font-light leading-none text-black tabular-nums">{count}</p>
          </div>
          <span className={cn("mt-1 h-2 w-2 rounded-full", count > 0 ? "bg-emerald-500" : "bg-black/15")} />
        </div>

        <div className="mt-4 border-t border-black/[0.06] pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/30">Customer behavior</p>
          <div className="space-y-2">
            {behaviorRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="text-black/50">{row.label}</span>
                <span className="font-medium text-black tabular-nums">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FinanceMetric({
  label,
  loading,
  value,
  values,
  endDate,
}: {
  label: string;
  loading: boolean;
  value: string;
  values: number[];
  tone?: "blue" | "green" | "red" | "amber" | "neutral";
  color?: string;
  gradientId?: string;
  endDate?: Date;
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
              {/* PixelBlast background */}
              <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: "10px", opacity: 0.35, maskImage: "linear-gradient(to right, transparent 0%, transparent 55%, black 100%)", WebkitMaskImage: "linear-gradient(to right, transparent 0%, transparent 55%, black 100%)" }}>
                <PixelBlast
                  variant="square"
                  pixelSize={2}
                  color="#B9B5AE"
                  patternScale={4}
                  patternDensity={0.4}
                  enableRipples={false}
                  speed={0}
                  transparent
                  edgeFade={0.4}
                  seed={42}
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
                  <MiniBarChart values={values} endDate={endDate} />
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
  const [syncing, setSyncing] = useState(false);
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
  const { orgName } = useOrgName();

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

  const syncOrders = async () => {
    setSyncing(true);
    try {
      const res = await apiFetch("/api/fetch-shopify-orders", { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details ? `${data.error}: ${data.details}` : (data.error || "Sync failed"));
      // Refresh orders and analytics in parallel — don't await sequentially
      fetchOrders();
      fetchAnalytics(dateRange);
      toast.custom(() => (
        <div className="bg-[#131316] rounded-[14px] shadow-[0px_32px_64px_-16px_rgba(0,0,0,0.30)] shadow-[0px_16px_32px_-8px_rgba(0,0,0,0.30)] shadow-[0px_8px_16px_-4px_rgba(0,0,0,0.24)] shadow-[0px_4px_8px_-2px_rgba(0,0,0,0.24)] shadow-[0px_-8px_16px_-1px_rgba(0,0,0,0.16)] shadow-[0px_2px_4px_-1px_rgba(0,0,0,0.24)] shadow-[0px_0px_0px_1px_rgba(0,0,0,1.00)] shadow-[inset_0px_0px_0px_1px_rgba(255,255,255,0.08)] shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.20)] px-4 py-3 flex items-center gap-3 min-w-[300px]">
          <div className="p-0.5 bg-white/25 rounded-[99px] shadow-[0px_2px_4px_-1px_rgba(0,0,0,0.06)] shadow-[0px_1px_2px_-0.5px_rgba(0,0,0,0.06)] shadow-[0px_0px_0px_1px_rgba(0,0,0,0.16)] border border-white/25 flex items-center justify-center overflow-hidden shrink-0">
            <Check className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="text-white text-[13px] font-medium leading-tight">{data.synced} orders synced</p>
            <p className="text-white/50 text-[11px] leading-tight">from Shopify</p>
          </div>
        </div>
      ), { fit: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not sync Shopify";
      toast.custom(() => (
        <div className="bg-[#131316] rounded-[14px] shadow-[0px_32px_64px_-16px_rgba(0,0,0,0.30)] shadow-[0px_16px_32px_-8px_rgba(0,0,0,0.30)] shadow-[0px_8px_16px_-4px_rgba(0,0,0,0.24)] shadow-[0px_4px_8px_-2px_rgba(0,0,0,0.24)] shadow-[0px_-8px_16px_-1px_rgba(0,0,0,0.16)] shadow-[0px_2px_4px_-1px_rgba(0,0,0,0.24)] shadow-[0px_0px_0px_1px_rgba(0,0,0,1.00)] shadow-[inset_0px_0px_0px_1px_rgba(255,255,255,0.08)] shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.20)] px-4 py-3 flex items-center gap-3 min-w-[300px]">
          <div className="p-0.5 bg-red-500/30 rounded-[99px] shadow-[0px_2px_4px_-1px_rgba(0,0,0,0.06)] shadow-[0px_1px_2px_-0.5px_rgba(0,0,0,0.06)] shadow-[0px_0px_0px_1px_rgba(0,0,0,0.16)] border border-red-400/30 flex items-center justify-center overflow-hidden shrink-0">
            <X className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="text-white text-[13px] font-medium leading-tight">Sync failed</p>
            <p className="text-white/50 text-[11px] leading-tight">{msg}</p>
          </div>
        </div>
      ), { fit: true });
    } finally { setSyncing(false); }
  };

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
    const series = analytics?.series;
    const empty = [0, 0];

    return {
      revenue: series?.revenue?.length ? series.revenue : empty,
      adSpend: series?.adSpend?.length ? series.adSpend : empty,
      shipping: series?.shipping?.length ? series.shipping : empty,
      cog: series?.totalCog?.length ? series.totalCog : empty,
      profit: series?.profit?.length ? series.profit : empty,
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
    <div className="space-y-6 p-1 lg:p-2">

      {/* ── P&L Panel ───────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative rounded-2xl bg-[#F3F3F3]"
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[22px] font-bold text-black tracking-tight">
              Welcome back, {orgName || "there"}
            </h2>
            <div className="flex items-center gap-2">
            {!analytics?.fbConfigured && !analyticsLoading && (
              <a
                href="/settings"
                className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                data-testid="link-connect-facebook"
              >
                <Info className="h-3 w-3" />
                Connect Facebook Ads
              </a>
            )}
            {analytics?.fbError && (
              <span className="text-[10px] text-destructive max-w-[200px] truncate">{analytics.fbError}</span>
            )}
            <LiveVisitorsCounter />
            <DateRangePicker value={dateRange} onChange={handleDateRangeChange} />
            <button
              onClick={() => fetchAnalytics(dateRange)}
              disabled={analyticsLoading}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-30"
              data-testid="button-refresh-analytics"
              title="Refresh"
            >
              {analyticsLoading
                ? <Spinner size="sm" />
                : <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".5"/><path fill="currentColor" d="M7.378 11.63h-.75zm0 .926l-.562.497a.75.75 0 0 0 1.08.044zm2.141-1.015a.75.75 0 0 0-1.038-1.082zm-2.958-1.038a.75.75 0 1 0-1.122.994zm8.37-1.494a.75.75 0 1 0 1.102-1.018zM12.045 6.25c-2.986 0-5.416 2.403-5.416 5.38h1.5c0-2.137 1.747-3.88 3.916-3.88zm-5.416 5.38v.926h1.5v-.926zm1.269 1.467l1.622-1.556l-1.038-1.082l-1.622 1.555zm.042-1.039l-1.378-1.555l-1.122.994l1.377 1.556zm8.094-4.067a5.42 5.42 0 0 0-3.99-1.741v1.5a3.92 3.92 0 0 1 2.889 1.26zm.585 3.453l.56-.498a.75.75 0 0 0-1.08-.043zm-2.139 1.014a.75.75 0 1 0 1.04 1.082zm2.96 1.04a.75.75 0 0 0 1.12-.997zm-8.393 1.507a.75.75 0 0 0-1.094 1.026zm2.888 2.745c2.993 0 5.434-2.4 5.434-5.38h-1.5c0 2.135-1.753 3.88-3.934 3.88zm5.434-5.38v-.926h-1.5v.926zm-1.27-1.467l-1.619 1.555l1.04 1.082l1.618-1.555zm-.04 1.04l1.38 1.554l1.122-.996l-1.381-1.555zM7.952 16.03a5.45 5.45 0 0 0 3.982 1.719v-1.5c-1.143 0-2.17-.48-2.888-1.245z"/></svg>}
            </button>
            </div>
          </div>

          {/* Metric cards grid */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <FinanceMetric
              label="Revenue"
              loading={analyticsLoading}
              value={fmtBDT(analytics?.revenue ?? 0)}
              values={metricSparklines.revenue}
              endDate={dateRange?.to}
            />
            <FinanceMetric
              label="Ad Spend"
              loading={analyticsLoading}
              value={analytics?.adSpend != null ? fmtBDT(analytics.adSpend) : "—"}
              values={metricSparklines.adSpend}
              endDate={dateRange?.to}
            />
            <FinanceMetric
              label="Shipping"
              loading={analyticsLoading}
              value={fmtBDT(analytics?.shipping ?? 0)}
              values={metricSparklines.shipping}
              endDate={dateRange?.to}
            />
            <FinanceMetric
              label="Cost of Goods"
              loading={analyticsLoading}
              value={fmtBDT(analytics?.totalCog ?? 0)}
              values={metricSparklines.cog}
              endDate={dateRange?.to}
            />
            <FinanceMetric
              label="Net Profit"
              loading={analyticsLoading}
              value={analytics?.profit != null ? `${analytics.profit < 0 ? "−" : ""}${fmtBDT(Math.abs(analytics.profit))}` : "—"}
              values={metricSparklines.profit}
              endDate={dateRange?.to}
            />
          </div>
        </div>
        </motion.div>

      {/* ── Orders table card ────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="overflow-hidden rounded-xl border border-black/10 bg-white"
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
              color="amber"
              size="sm"
              onClick={syncOrders}
              disabled={syncing || checkingFraud || autoSyncing}
              className="gap-1.5 px-3 text-[11px] font-bold tracking-normal"
              data-testid="button-sync-orders"
            >
              {syncing ? <Spinner size="sm" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sync
            </PopButton>

            <PopButton
              color="sky"
              size="sm"
              onClick={checkFraud}
              disabled={checkingFraud || syncing}
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

    </div>
  );
}
