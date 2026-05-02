import { useState, useEffect, useMemo, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { OrdersTable } from "@/components/OrdersTable";
import { toast } from "sonner";
import { RefreshCw, ShieldCheck, Search, AlertTriangle, Loader2, Info, CalendarDays, ChevronDown } from "lucide-react";
import { ShoppingBag, Package, Cube, TrendUp, ChartBar } from "@phosphor-icons/react";
import { BarsSpinner } from "@/registry/spell-ui/bars-spinner";
import { Input } from "@/components/ui/input";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { format, subDays, startOfMonth, startOfYear } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

// Always derive "today" from pure UTC + 6 h offset, then read with .getUTC*()
// so the result is independent of whatever timezone the browser is in.
function dhakaToday(): Date {
  const dhakaMs = Date.now() + 6 * 60 * 60 * 1000; // UTC + 6 h
  const d = new Date(dhakaMs);
  // getUTC* reads the shifted value as if it were UTC → gives the Dhaka calendar date
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
          className="flex items-center gap-2 h-7 px-3 text-[9px] font-medium tracking-[0.15em] uppercase text-black hover:text-black border border-black/[0.08] hover:border-black/20 transition-all"
          data-testid="button-date-range-picker"
        >
          <CalendarDays className="h-3 w-3" />
          {fmtRange(value)}
          <ChevronDown className="h-2.5 w-2.5 text-black" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-auto p-0 border border-black/[0.08] shadow-[0_8px_40px_-8px_rgba(0,0,0,0.14)] rounded-none bg-white"
      >
        <div className="flex">
          {/* Presets */}
          <div className="border-r border-black/[0.06] py-3 w-36 flex flex-col">
            <p className="text-[7px] font-medium tracking-[0.3em] text-black uppercase px-4 pb-2">Preset</p>
            {PRESETS.map((p) => {
              const isActive = p.label === (activePreset?.label ?? "All Time");
              return (
                <button
                  key={p.label}
                  onClick={() => apply(p.range)}
                  className={cn(
                    "text-left px-4 py-1.5 text-[10px] tracking-wide transition-colors",
                    isActive
                      ? "text-black font-medium border-l-[1.5px] border-black"
                      : "text-black hover:text-black border-l-[1.5px] border-transparent"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Calendar */}
          <div className="p-3">
            <p className="text-[7px] font-medium tracking-[0.3em] text-black uppercase px-1 pb-2">Custom Range</p>
            <Calendar
              mode="range"
              selected={pending}
              onSelect={(r) => {
                setPending(r);
                if (r?.from && r?.to) apply(r);
              }}
              numberOfMonths={2}
              toDate={TODAY}
              classNames={{
                day_selected: "bg-black text-white hover:bg-black hover:text-white focus:bg-black focus:text-white",
                day_range_middle: "bg-black/10 text-black rounded-none",
                day_range_start: "bg-black text-white rounded-none",
                day_range_end: "bg-black text-white rounded-none",
                day_today: "border border-black/20",
              }}
            />
            {pending?.from && !pending?.to && (
              <p className="text-[9px] text-black text-center pb-1 tracking-wide">Select an end date</p>
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

export default function Dashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoSyncing, setAutoSyncing] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [checkingFraud, setCheckingFraud] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const todayRange: DateRange = { from: new Date(), to: new Date() };
  const [dateRange, setDateRange] = useState<DateRange | null>(todayRange);
  const { user } = useAuth();
  const { isAdmin } = useUserRole();

  const fetchAnalytics = useCallback(async (range?: DateRange | null) => {
    setAnalyticsLoading(true);
    try {
      const params = new URLSearchParams({ t: String(Date.now()) });
      if (range?.from) params.set("since", toYMD(range.from));
      if (range?.to)   params.set("until", toYMD(range.to));
      const res = await apiFetch(`/api/analytics?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setAnalytics(data);
    } catch {
      // silently fail — analytics is non-critical
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  const handleDateRangeChange = useCallback((range: DateRange | null) => {
    setDateRange(range);
    fetchAnalytics(range);
  }, [fetchAnalytics]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    fetchAnalytics(todayRange);
  }, [fetchAnalytics]);

  useEffect(() => {
    const runAutoSync = async () => {
      setAutoSyncing(true);
      try {
        await apiFetch("/api/fetch-shopify-orders", { method: "POST", headers: { "Content-Type": "application/json" } });
      } catch {
        // silently ignore — we still load local orders below
      } finally {
        await fetchOrders();
        fetchAnalytics(todayRange);
        setAutoSyncing(false);
      }
    };
    runAutoSync();
    // Poll for order updates every 30s (real-time replaced with org-filtered API)
    const intervalId = setInterval(() => fetchOrders(), 30000);
    return () => clearInterval(intervalId);
  }, []);

  const fetchOrders = async () => {
    try {
      const res = await apiFetch("/api/orders");
      if (!res.ok) throw new Error("Failed to load orders");
      const data = await res.json();
      setOrders((data.orders as Order[]) || []);
    } catch {
      toast.custom(() => (
        <div className="bg-white border border-black/5 shadow-2xl rounded-2xl p-4 flex items-center gap-4 min-w-[300px]">
          <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-black">System Error</span>
            <span className="text-sm font-bold text-black">Failed to load orders</span>
          </div>
        </div>
      ));
    } finally {
      setLoading(false);
    }
  };

  const syncOrders = async () => {
    setSyncing(true);
    try {
      const res = await apiFetch("/api/fetch-shopify-orders", { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details ? `${data.error}: ${data.details}` : (data.error || "Sync failed"));
      await fetchOrders();
      fetchAnalytics(dateRange);
      toast.custom(() => (
        <div className="bg-white border border-black/5 shadow-2xl rounded-2xl p-4 flex items-center gap-4 min-w-[300px]">
          <div className="h-10 w-10 rounded-xl bg-black flex items-center justify-center shrink-0">
            <RefreshCw className="w-4 h-4 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-black">Synchronization</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold text-black">{data.synced} Orders</span>
              <span className="text-xs text-black font-medium">from Shopify</span>
            </div>
          </div>
        </div>
      ));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not sync Shopify";
      toast.custom(() => (
        <div className="bg-white border border-black/5 shadow-2xl rounded-2xl p-4 flex items-center gap-4 min-w-[300px]">
          <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-black">Sync Failed</span>
            <span className="text-sm font-bold text-black">{msg}</span>
          </div>
        </div>
      ));
    } finally {
      setSyncing(false);
    }
  };

  const checkFraud = async () => {
    setCheckingFraud(true);
    try {
      const res = await apiFetch("/api/check-fraud", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fraud check failed");
      await fetchOrders();
      toast.custom(() => (
        <div className="bg-white border border-black/5 shadow-2xl rounded-2xl p-4 flex items-center gap-4 min-w-[300px]">
          <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-blue-500" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-black">Fraud Analysis</span>
            <div className="flex items-baseline gap-1">
              <span className="text-sm font-bold text-black">{data?.successful ?? 0} Verified</span>
              <span className="text-xs text-black font-medium">of {data?.checked ?? 0}</span>
            </div>
          </div>
        </div>
      ));
    } catch {
      toast.error("Fraud check failed");
    } finally {
      setCheckingFraud(false);
    }
  };

  const handleStatusUpdate = (orderId: string, newStatus: string) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
  };

  const handleOrderUpdate = (updatedOrder: Order) => {
    setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));
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

  if (autoSyncing) {
    return (
      <div className="min-h-screen bg-[#FAFAF8]">
        <div className="max-w-[1800px] mx-auto px-6 py-8 space-y-4">

          {/* P&L skeleton — admins only */}
          {isAdmin && (
            <div className="border border-black/[0.07] bg-white">
              <div className="flex items-center justify-between px-8 py-3 border-b border-black/[0.05]">
                <div className="h-2 w-24 bg-black/[0.05] animate-pulse" />
                <div className="h-2 w-32 bg-black/[0.04] animate-pulse" />
              </div>
              <div className="flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex-1 px-8 py-5 border-r border-black/[0.05] last:border-r-0 space-y-3">
                    <div className="h-2 w-12 bg-black/[0.05] animate-pulse" />
                    <div className="h-7 w-24 bg-black/[0.05] animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Toolbar skeleton */}
          <div className="border border-black/[0.07] border-b-0 bg-white flex items-center justify-between px-6 py-3">
            <div className="h-2 w-28 bg-black/[0.04] animate-pulse" />
            <div className="flex items-center gap-3">
              <div className="h-7 w-40 bg-black/[0.04] animate-pulse" />
              <div className="h-7 w-16 bg-black/[0.04] animate-pulse" />
            </div>
          </div>

          {/* Table skeleton */}
          <div className="border border-black/[0.07] bg-white -mt-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-black/[0.04]"
                style={{ opacity: 1 - i * 0.07 }}>
                <div className="h-2.5 w-16 bg-black/[0.05] animate-pulse" />
                <div className="h-2.5 w-28 bg-black/[0.05] animate-pulse" />
                <div className="h-2.5 w-24 bg-black/[0.04] animate-pulse" />
                <div className="flex-1 h-2.5 bg-black/[0.03] animate-pulse" />
                <div className="h-2.5 w-14 bg-black/[0.04] animate-pulse" />
                <div className="h-5 w-16 bg-black/[0.04] animate-pulse" />
              </div>
            ))}
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <BarsSpinner size={28} color="rgba(0,0,0,0.2)" />
              <span className="text-[8px] font-medium tracking-[0.35em] text-black uppercase">Syncing from Shopify</span>
            </div>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8]">
      <div className="max-w-[1800px] mx-auto px-6 py-8 space-y-0">

        {/* ── P&L Panel — admins only ── */}
        {isAdmin && <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="border border-black/[0.07] bg-white"
        >
          {/* P&L Header */}
          <div className="flex items-center justify-between px-8 py-3 border-b border-black/[0.05]">
            <div className="flex items-center gap-2.5">
              <ChartBar size={12} weight="light" className="text-black" />
              <span className="text-[8px] font-medium tracking-[0.3em] text-black uppercase">P&L Overview</span>
            </div>
            <div className="flex items-center gap-3">
              {!analytics?.fbConfigured && !analyticsLoading && (
                <a
                  href="/settings"
                  className="flex items-center gap-1.5 text-[8px] tracking-[0.15em] font-medium uppercase text-black hover:text-black transition-colors"
                  data-testid="link-connect-facebook"
                >
                  <Info className="h-2.5 w-2.5" />
                  Connect Facebook Ads in Settings
                </a>
              )}
              {analytics?.fbError && (
                <span className="text-[8px] tracking-[0.1em] text-red-400/80 max-w-xs truncate">{analytics.fbError}</span>
              )}

              <div className="w-px h-4 bg-black/[0.06]" />

              <DateRangePicker value={dateRange} onChange={handleDateRangeChange} />

              <button
                onClick={() => fetchAnalytics(dateRange)}
                disabled={analyticsLoading}
                className="flex items-center gap-1.5 h-7 px-2 text-[9px] font-medium tracking-[0.18em] uppercase text-black hover:text-black transition-colors disabled:opacity-30"
                data-testid="button-refresh-analytics"
                title="Refresh P&L data"
              >
                {analyticsLoading
                  ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  : <RefreshCw className="h-2.5 w-2.5" />}
              </button>
            </div>
          </div>

          {/* P&L Cells */}
          <div className="flex">
            {[
              {
                label: "Revenue",
                icon: <ShoppingBag size={13} weight="light" className="text-black mt-0.5" />,
                border: true,
                content: analyticsLoading ? null : (
                  <p className="text-2xl font-light tracking-tight text-black tabular-nums">
                    ৳{(analytics?.revenue ?? 0).toLocaleString("en-BD", { maximumFractionDigits: 0 })}
                  </p>
                ),
              },
              {
                label: "Ad Spend",
                icon: <span className="text-[11px] font-light text-black mt-0.5 leading-none">৳</span>,
                border: true,
                content: analyticsLoading ? null : analytics?.adSpend !== null && analytics?.adSpend !== undefined ? (
                  <p className="text-2xl font-light tracking-tight text-black tabular-nums">
                    ৳{(analytics.adSpend).toLocaleString("en-BD", { maximumFractionDigits: 0 })}
                  </p>
                ) : (
                  <p className="text-2xl font-light tracking-tight text-black">—</p>
                ),
              },
              {
                label: "Shipping",
                icon: <Package size={13} weight="light" className="text-black mt-0.5" />,
                border: true,
                content: analyticsLoading ? null : (
                  <p className="text-2xl font-light tracking-tight text-black tabular-nums">
                    ৳{(analytics?.shipping ?? 0).toLocaleString("en-BD", { maximumFractionDigits: 0 })}
                  </p>
                ),
              },
              {
                label: "COG",
                icon: <Cube size={13} weight="light" className="text-black mt-0.5" />,
                border: true,
                content: analyticsLoading ? null : (
                  <p className="text-2xl font-light tracking-tight text-black tabular-nums">
                    ৳{(analytics?.totalCog ?? 0).toLocaleString("en-BD", { maximumFractionDigits: 0 })}
                  </p>
                ),
              },
              {
                label: "Net Profit",
                icon: <TrendUp size={13} weight="light" className="text-black mt-0.5" />,
                border: false,
                content: analyticsLoading ? null : analytics?.profit !== null && analytics?.profit !== undefined ? (
                  <>
                    <p className={cn(
                      "text-2xl font-light tracking-tight tabular-nums",
                      analytics.profit >= 0 ? "text-emerald-600" : "text-red-500"
                    )}>
                      ৳{Math.abs(analytics.profit).toLocaleString("en-BD", { maximumFractionDigits: 0 })}
                      {analytics.profit < 0 && <span className="text-base ml-1">loss</span>}
                    </p>
                    {analytics.revenue > 0 && (
                      <span className={cn(
                        "inline-block mt-1.5 px-2 py-0.5 text-[9px] font-medium tracking-widest",
                        analytics.profit >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
                      )}>
                        {analytics.profit >= 0 ? "+" : "−"}
                        {Math.abs((analytics.profit / analytics.revenue) * 100).toFixed(1)}% margin
                      </span>
                    )}
                  </>
                ) : (
                  <p className="text-2xl font-light tracking-tight text-black">—</p>
                ),
              },
            ].map((cell, i) => (
              <motion.div
                key={cell.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: i * 0.07, ease: "easeOut" }}
                className={cn("flex-1 px-8 py-5", cell.border && "border-r border-black/[0.05]")}
              >
                <div className="flex items-start justify-between">
                  <p className="text-[8px] font-medium tracking-[0.25em] text-black uppercase mb-2">{cell.label}</p>
                  {cell.icon}
                </div>
                <AnimatePresence mode="wait">
                  {analyticsLoading ? (
                    <motion.div
                      key="skeleton"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="h-7 w-20 bg-black/[0.04] animate-pulse"
                    />
                  ) : (
                    <motion.div
                      key="value"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                    >
                      {cell.content}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </motion.div>}

        {/* ── Toolbar ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="flex items-center justify-between border-x border-b border-black/[0.07] bg-white px-6 h-12"
        >
          {/* Left: section label */}
          <div className="flex items-center gap-3">
            <span className="text-[8px] font-medium tracking-[0.3em] text-black uppercase">Order Registry</span>
            <div className="w-px h-3 bg-black/10" />
            <span className="text-[8px] tracking-[0.15em] text-black uppercase tabular-nums">
              {loading ? "—" : `${filteredOrders.length} records`}
            </span>
          </div>

          {/* Right: search + actions */}
          <div className="flex items-center gap-2">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-black transition-colors group-focus-within:text-black" />
              <Input
                placeholder="Search orders…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-7 pl-8 pr-3 bg-transparent border border-black/[0.08] rounded-none text-[11px] w-52 focus-visible:ring-0 focus-visible:border-black/20 placeholder:text-black"
                data-testid="input-search-orders"
              />
            </div>

            <div className="w-px h-4 bg-black/10" />

            <button
              onClick={syncOrders}
              disabled={syncing || checkingFraud || autoSyncing}
              className="flex items-center gap-1.5 h-7 px-3 text-[9px] font-medium tracking-[0.15em] uppercase text-black hover:text-black border border-transparent hover:border-black/10 transition-all disabled:opacity-30"
              data-testid="button-sync-orders"
            >
              {syncing
                ? <BarsSpinner size={12} />
                : <RefreshCw className="h-3 w-3" />}
              Sync
            </button>

            <button
              onClick={checkFraud}
              disabled={checkingFraud || syncing}
              className="flex items-center gap-1.5 h-7 px-3 text-[9px] font-medium tracking-[0.15em] uppercase text-black hover:text-black border border-transparent hover:border-black/10 transition-all disabled:opacity-30"
              data-testid="button-check-fraud"
            >
              {checkingFraud
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <ShieldCheck className="h-3 w-3" />}
              Verify All
            </button>
          </div>
        </motion.div>

        {/* ── Table ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          className="border-x border-b border-black/[0.07] bg-white overflow-hidden"
        >
          <OrdersTable
            orders={filteredOrders}
            loading={loading}
            onStatusUpdate={handleStatusUpdate}
            onOrderUpdate={handleOrderUpdate}
          />
        </motion.div>

      </div>
    </div>
  );
}
