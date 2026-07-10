import { useState, useEffect, useMemo, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useOrgName } from "@/hooks/useOrgName";
import { OrdersTable } from "@/components/OrdersTable";
import { toast } from "@/components/ui/sonner";
import {
  RefreshCw, ShieldCheck, Search, AlertTriangle,
  Info, CalendarDays, ChevronDown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { format, subDays, startOfMonth, startOfYear } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/ios-spinner";
import { TextEffect } from "@/components/ui/text-effect";
import { PopButton } from "@/components/ui/pop-button";

// ── Date range helpers ────────────────────────────────────────────────────────
function toYMD(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function fmtRange(range: DateRange | null): string {
  if (!range?.from) return "All Time";
  const from = format(range.from, "MMM d");
  if (!range.to || toYMD(range.from) === toYMD(range.to))
    return `${from}, ${format(range.from, "yyyy")}`;
  const to = format(range.to, "MMM d, yyyy");
  return `${from} – ${to}`;
}

function dhakaToday(): Date {
  const dhakaMs = Date.now() + 6 * 60 * 60 * 1000;
  const d = new Date(dhakaMs);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

const TODAY = dhakaToday();

const PRESETS: { label: string; range: DateRange | null }[] = [
  { label: "All Time",     range: null },
  { label: "Today",        range: { from: TODAY, to: TODAY } },
  { label: "Yesterday",    range: { from: subDays(TODAY, 1), to: subDays(TODAY, 1) } },
  { label: "Last 7 Days",  range: { from: subDays(TODAY, 6), to: TODAY } },
  { label: "Last 30 Days", range: { from: subDays(TODAY, 29), to: TODAY } },
  { label: "Last 90 Days", range: { from: subDays(TODAY, 89), to: TODAY } },
  { label: "This Month",   range: { from: startOfMonth(TODAY), to: TODAY } },
  { label: "This Year",    range: { from: startOfYear(TODAY), to: TODAY } },
];

function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange | null;
  onChange: (r: DateRange | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<DateRange | undefined>(value ?? undefined);

  const activePreset = PRESETS.find((p) => {
    if (!p.range && !value) return true;
    if (!p.range || !value) return false;
    return (
      p.range.from && value.from && toYMD(p.range.from) === toYMD(value.from) &&
      p.range.to   && value.to   && toYMD(p.range.to)   === toYMD(value.to)
    );
  });

  const apply = (r: DateRange | null) => {
    onChange(r);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-2 h-8 px-3 text-[11px] font-medium text-foreground/70 hover:text-foreground border border-border hover:border-foreground/30 rounded-lg bg-background transition-all"
          data-testid="button-date-range-picker"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" className="shrink-0"><path fill="currentColor" d="M6.96 2c.418 0 .756.31.756.692V4.09c.67-.012 1.422-.012 2.268-.012h4.032c.846 0 1.597 0 2.268.012V2.692c0-.382.338-.692.756-.692s.756.31.756.692V4.15c1.45.106 2.403.368 3.103 1.008c.7.641.985 1.513 1.101 2.842v1H2V8c.116-1.329.401-2.2 1.101-2.842c.7-.64 1.652-.902 3.103-1.008V2.692c0-.382.339-.692.756-.692"/><path fill="currentColor" d="M22 14v-2c0-.839-.013-2.335-.026-3H2.006c-.013.665 0 2.161 0 3v2c0 3.771 0 5.657 1.17 6.828C4.349 22 6.234 22 10.004 22h4c3.77 0 5.654 0 6.826-1.172S22 17.771 22 14" opacity=".5"/><path fill="currentColor" d="M18 16.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0"/></svg>
          {fmtRange(value)}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0 rounded-xl border border-border shadow-xl">
        <div className="flex">
          <div className="border-r border-border py-2.5 w-32 flex flex-col">
            <p className="text-[8px] font-semibold tracking-widest text-muted-foreground uppercase px-3 pb-1.5">Preset</p>
            {PRESETS.map((p) => {
              const isActive = p.label === (activePreset?.label ?? "All Time");
              return (
                <button
                  key={p.label}
                  onClick={() => apply(p.range)}
                  className={cn(
                    "text-left px-3 py-1 text-[11px] transition-colors",
                    isActive
                      ? "text-foreground font-semibold bg-muted"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="p-2.5">
            <p className="text-[8px] font-semibold tracking-widest text-muted-foreground uppercase px-1 pb-1.5">Custom Range</p>
            <Calendar
              mode="range"
              selected={pending}
              onSelect={(r) => {
                setPending(r);
                if (r?.from && r?.to) apply(r);
              }}
              className="p-1.5"
              classNames={{
                months: "flex flex-col sm:flex-row space-y-3 sm:space-x-3 sm:space-y-0",
                month: "space-y-2.5",
                caption: "flex justify-center pt-0.5 relative items-center",
                caption_label: "text-xs font-semibold",
                nav_button: "h-6 w-6 bg-transparent p-0 opacity-50 hover:opacity-100",
                table: "w-full border-collapse space-y-0",
                head_cell: "text-muted-foreground rounded-md w-7 font-normal text-[10px]",
                row: "flex w-full mt-1",
                cell: "h-7 w-7 text-center text-xs p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                day: "h-7 w-7 p-0 text-xs font-normal aria-selected:opacity-100",
              }}
              numberOfMonths={2}
              toDate={TODAY}
            />
            {pending?.from && !pending?.to && (
              <p className="text-[10px] text-muted-foreground text-center pb-0.5">Select an end date</p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

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



function MiniBarChart({ values }: { values: number[]; color?: string; gradientId?: string }) {
  const bars = values.length === 0 ? [0, 0, 0, 0, 0, 0, 0] : values.slice(-7);
  const max = Math.max(...bars, 1);

  return (
    <div className="flex items-end shrink-0" style={{ gap: "4px", height: "24px" }}>
      {bars.map((v, i) => {
        const isActive = i === bars.length - 1;
        const height = Math.max(10, (v / max) * 100);
        return (
          <div
            key={i}
            className="rounded-full"
            style={{
              width: isActive ? "4px" : "3px",
              height: `${height}%`,
              backgroundColor: isActive ? "#232323" : "#BFBFBC",
              opacity: isActive ? 1 : 0.4,
            }}
          />
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

function FinanceMetric({
  label,
  loading,
  value,
  meta,
  metaClassName,
  values,
  positive = true,
}: {
  label: string;
  loading: boolean;
  value: string;
  meta?: string;
  metaClassName?: string;
  values: number[];
  tone?: "blue" | "green" | "red" | "amber" | "neutral";
  color?: string;
  gradientId?: string;
  positive?: boolean;
}) {
  return (
    <div
      className="flex-1 min-w-[140px] overflow-hidden"
      style={{
        background: "#E9E8E5",
        borderRadius: "14px",
        padding: "4px",
        border: "1.5px solid rgba(0,0,0,0.07)",
        boxShadow: "0 2px 6px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.7)",
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
              padding: "12px 14px",
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
              style={{
                background: "#F7F7F6",
                borderRadius: "10px",
                border: "1px solid rgba(0,0,0,0.05)",
                padding: "12px 14px",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.06)",
              }}
            >
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
                  className="m-0 text-[22px] font-bold leading-none text-[#222A38] tabular-nums"
                >
                  {value}
                </DashboardTextEffect>
                <MiniBarChart values={values} />
              </div>
            </div>

            {/* Bottom section */}
            {meta && (
              <div
                className="flex items-center justify-between"
                style={{
                  padding: "6px 12px",
                }}
              >
                {/* Trend icon */}
                <div
                  className="flex items-center justify-center"
                  style={{
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    background: "rgba(0,0,0,0.08)",
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="8"
                    height="8"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {positive ? (
                      <polyline points="18 15 12 9 6 15" />
                    ) : (
                      <polyline points="6 9 12 15 18 9" />
                    )}
                  </svg>
                </div>

                {/* Growth text */}
                <span
                  className={cn("", metaClassName)}
                  style={{
                    fontSize: "10px",
                    fontWeight: 500,
                    color: "#1BA475",
                  }}
                >
                  {meta}
                </span>
              </div>
            )}
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

  const fetchAnalytics = useCallback(async (range?: DateRange | null) => {
    setAnalyticsLoading(true);
    try {
      const params = new URLSearchParams({ t: String(Date.now()) });
      if (range?.from) params.set("since", toYMD(range.from));
      if (range?.to)   params.set("until", toYMD(range.to));
      const res = await apiFetch(`/api/analytics?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setAnalytics(data);
    } catch { /* non-critical */ }
    finally { setAnalyticsLoading(false); }
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
        <div className="bg-background border border-border shadow-lg rounded-xl p-4 flex items-center gap-3 min-w-[300px]">
          <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-destructive" />
          </div>
          <div>
            <p className="text-sm font-semibold">Failed to load orders</p>
            <p className="text-xs text-muted-foreground">Check your connection</p>
          </div>
        </div>
      ));
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
        <div className="bg-background border border-border shadow-lg rounded-xl p-4 flex items-center gap-3 min-w-[300px]">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <RefreshCw className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">{data.synced} orders synced</p>
            <p className="text-xs text-muted-foreground">from Shopify</p>
          </div>
        </div>
      ));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not sync Shopify";
      toast.custom(() => (
        <div className="bg-background border border-border shadow-lg rounded-xl p-4 flex items-center gap-3 min-w-[300px]">
          <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-destructive" />
          </div>
          <div>
            <p className="text-sm font-semibold">Sync failed</p>
            <p className="text-xs text-muted-foreground">{msg}</p>
          </div>
        </div>
      ));
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
        <div className="bg-background border border-border shadow-lg rounded-xl p-4 flex items-center gap-3 min-w-[300px]">
          <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <p className="text-sm font-semibold">{data?.successful ?? 0} verified</p>
            <p className="text-xs text-muted-foreground">of {data?.checked ?? 0} checked</p>
          </div>
        </div>
      ));
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

    // For flat series (like ad spend with no hourly breakdown), add slight
    // variation so the sparkline renders as a gentle wave instead of a dead line.
    const addVariation = (arr: number[]) => {
      if (!arr || arr.length < 2) return empty;
      const allSame = arr.every(v => v === arr[0]);
      if (!allSame || arr[0] === 0) return arr;
      const base = arr[0];
      return arr.map((_, i) => base * (0.97 + 0.06 * Math.sin(i * 0.8)));
    };

    return {
      revenue: series?.revenue?.length ? series.revenue : empty,
      adSpend: series?.adSpend?.length ? addVariation(series.adSpend) : empty,
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

  const profitMargin = analytics?.profit != null && analytics.revenue > 0
    ? (analytics.profit / analytics.revenue) * 100
    : null;

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
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <FinanceMetric
              label="Revenue"
              loading={analyticsLoading}
              value={fmtBDT(analytics?.revenue ?? 0)}
              meta="Live sales"
              values={metricSparklines.revenue}
            />
            <FinanceMetric
              label="Ad Spend"
              loading={analyticsLoading}
              value={analytics?.adSpend != null ? fmtBDT(analytics.adSpend) : "—"}
              meta={!analytics?.fbConfigured && !analyticsLoading ? "Ads not connected" : "Marketing spend"}
              metaClassName={!analytics?.fbConfigured ? "color-[#7D7D7B]" : undefined}
              values={metricSparklines.adSpend}
            />
            <FinanceMetric
              label="Shipping"
              loading={analyticsLoading}
              value={fmtBDT(analytics?.shipping ?? 0)}
              meta="Delivery cost"
              values={metricSparklines.shipping}
            />
            <FinanceMetric
              label="Cost of Goods"
              loading={analyticsLoading}
              value={fmtBDT(analytics?.totalCog ?? 0)}
              meta={analytics?.cogCoverage ? `${analytics.cogCoverage.set}/${analytics.cogCoverage.total} priced` : "Product cost"}
              values={metricSparklines.cog}
            />
            <FinanceMetric
              label="Net Profit"
              loading={analyticsLoading}
              value={analytics?.profit != null ? `${analytics.profit < 0 ? "−" : ""}${fmtBDT(Math.abs(analytics.profit))}` : "—"}
              meta={profitMargin != null ? `${analytics?.profit != null && analytics.profit >= 0 ? "+" : ""}${Math.abs(profitMargin).toFixed(1)}% margin` : "Profit health"}
              metaClassName={analytics?.profit != null && analytics.profit < 0 ? "!text-red-500" : undefined}
              values={metricSparklines.profit}
              positive={analytics?.profit == null || analytics.profit >= 0}
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
          <div className="flex items-center justify-center gap-3 border-t border-black/10 py-3">
            <button
              type="button"
              onClick={() => setOrderPage((p) => Math.max(0, p - 1))}
              disabled={orderSafePage === 0}
              className="rounded-full bg-[#E3E3E3]/80 px-4 py-1.5 text-[11px] font-medium text-zinc-900 shadow-[0_2px_4px_0_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.16),inset_0_1px_0_0_#FDFDFD] transition-all hover:bg-[#E3E3E3] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-[11px] font-medium text-black/55 tabular-nums">
              Page {orderSafePage + 1} of {orderTotalPages}
            </span>
            <button
              type="button"
              onClick={() => setOrderPage((p) => Math.min(orderTotalPages - 1, p + 1))}
              disabled={orderSafePage >= orderTotalPages - 1}
              className="rounded-full bg-[#E3E3E3]/80 px-4 py-1.5 text-[11px] font-medium text-zinc-900 shadow-[0_2px_4px_0_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.16),inset_0_1px_0_0_#FDFDFD] transition-all hover:bg-[#E3E3E3] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </motion.div>

    </div>
  );
}
