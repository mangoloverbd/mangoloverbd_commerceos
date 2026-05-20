import { useState, useEffect, useMemo, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { OrdersTable } from "@/components/OrdersTable";
import { toast } from "sonner";
import {
  RefreshCw, ShieldCheck, Search, AlertTriangle, Loader2,
  Info, CalendarDays, ChevronDown,
} from "lucide-react";
import { ShoppingBag, Package, Cube, TrendUp, ChartBar, TrendDown } from "@phosphor-icons/react";
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
          <CalendarDays className="h-3.5 w-3.5" />
          {fmtRange(value)}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0 rounded-xl border border-border shadow-xl">
        <div className="flex">
          <div className="border-r border-border py-3 w-36 flex flex-col">
            <p className="text-[9px] font-semibold tracking-widest text-muted-foreground uppercase px-4 pb-2">Preset</p>
            {PRESETS.map((p) => {
              const isActive = p.label === (activePreset?.label ?? "All Time");
              return (
                <button
                  key={p.label}
                  onClick={() => apply(p.range)}
                  className={cn(
                    "text-left px-4 py-1.5 text-xs transition-colors",
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
          <div className="p-3">
            <p className="text-[9px] font-semibold tracking-widest text-muted-foreground uppercase px-1 pb-2">Custom Range</p>
            <Calendar
              mode="range"
              selected={pending}
              onSelect={(r) => {
                setPending(r);
                if (r?.from && r?.to) apply(r);
              }}
              numberOfMonths={2}
              toDate={TODAY}
            />
            {pending?.from && !pending?.to && (
              <p className="text-[10px] text-muted-foreground text-center pb-1">Select an end date</p>
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

function fmtBDT(n: number) {
  return "৳" + n.toLocaleString("en-BD", { maximumFractionDigits: 0 });
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  label,
  icon,
  loading,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 px-6 py-5 border-r border-border last:border-r-0 space-y-3 min-w-0">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">{label}</p>
        <span className="text-muted-foreground/60">{icon}</span>
      </div>
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-8 w-28 rounded-md bg-muted animate-pulse"
          />
        ) : (
          <motion.div
            key="value"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
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
  const todayRange = useMemo<DateRange>(() => ({ from: TODAY, to: TODAY }), []);
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
    } catch { /* non-critical */ }
    finally { setAnalyticsLoading(false); }
  }, []);

  const handleDateRangeChange = useCallback((range: DateRange | null) => {
    setDateRange(range);
    fetchAnalytics(range);
  }, [fetchAnalytics]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => { fetchAnalytics(todayRange); }, [fetchAnalytics]);

  useEffect(() => {
    const runAutoSync = async () => {
      setAutoSyncing(true);
      try {
        await apiFetch("/api/fetch-shopify-orders", { method: "POST", headers: { "Content-Type": "application/json" } });
      } catch { /* ignore */ }
      finally {
        await fetchOrders();
        fetchAnalytics(todayRange);
        setAutoSyncing(false);
      }
    };
    runAutoSync();
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

  const handleOrderUpdate = (updatedOrder: Order) =>
    setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));

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

  // ── Loading state ─────────────────────────────────────────────────────────
  if (autoSyncing) {
    return (
      <div className="space-y-6 p-6 lg:p-8">
        {isAdmin && (
          <div className="overflow-hidden rounded-2xl border border-black/10 bg-[#f8f8f8]">
            <div className="flex h-[48px] items-center justify-between border-b border-black/10 px-6">
              <div className="h-3 w-24 rounded bg-muted animate-pulse" />
              <div className="h-7 w-36 rounded-lg bg-muted animate-pulse" />
            </div>
            <div className="flex">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex-1 px-6 py-5 border-r border-border last:border-r-0 space-y-3">
                  <div className="h-2.5 w-16 rounded bg-muted animate-pulse" />
                  <div className="h-8 w-24 rounded bg-muted animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="overflow-hidden rounded-2xl border border-black/10 bg-[#f8f8f8]">
          <div className="flex items-center justify-between border-b border-black/10 px-6 py-3">
            <div className="h-3 w-28 rounded bg-muted animate-pulse" />
            <div className="flex gap-2">
              <div className="h-8 w-44 rounded-lg bg-muted animate-pulse" />
              <div className="h-8 w-20 rounded-lg bg-muted animate-pulse" />
              <div className="h-8 w-24 rounded-lg bg-muted animate-pulse" />
            </div>
          </div>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-3.5 border-b border-border last:border-0" style={{ opacity: 1 - i * 0.09 }}>
              <div className="h-3 w-14 rounded bg-muted animate-pulse" />
              <div className="h-3 w-28 rounded bg-muted animate-pulse" />
              <div className="h-3 w-24 rounded bg-muted animate-pulse" />
              <div className="h-3 flex-1 rounded bg-muted animate-pulse" />
              <div className="h-3 w-16 rounded bg-muted animate-pulse" />
              <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
            </div>
          ))}
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <BarsSpinner size={24} color="hsl(var(--muted-foreground))" />
            <span className="text-xs text-muted-foreground font-medium tracking-wide">Syncing from Shopify…</span>
          </div>
        </div>
      </div>
    );
  }

  const profitMargin = analytics?.profit != null && analytics.revenue > 0
    ? (analytics.profit / analytics.revenue) * 100
    : null;

  return (
    <div className="space-y-6 p-6 lg:p-8">

      {/* ── P&L Panel ───────────────────────────────────────────────────── */}
      {isAdmin && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="overflow-hidden rounded-2xl border border-black/10 bg-[#f8f8f8]"
        >
          {/* Header */}
          <div className="flex h-[50px] items-center justify-between border-b border-black/10 px-6">
            <div className="flex items-center gap-2.5">
              <ChartBar size={13} weight="duotone" className="text-muted-foreground" />
              <span className="text-[15px] font-semibold tracking-normal text-foreground">P&L Overview</span>
            </div>
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
              <div className="w-px h-4 bg-black/10" />
              <DateRangePicker value={dateRange} onChange={handleDateRangeChange} />
              <button
                onClick={() => fetchAnalytics(dateRange)}
                disabled={analyticsLoading}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-30"
                data-testid="button-refresh-analytics"
                title="Refresh"
              >
                {analyticsLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* Stat cells */}
          <div className="flex divide-x divide-black/10">
            <StatCard
              label="Revenue"
              icon={<ShoppingBag size={14} weight="duotone" />}
              loading={analyticsLoading}
            >
              <p className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
                {fmtBDT(analytics?.revenue ?? 0)}
              </p>
            </StatCard>

            <StatCard
              label="Ad Spend"
              icon={<span className="text-sm font-light leading-none">৳</span>}
              loading={analyticsLoading}
            >
              {analytics?.adSpend != null ? (
                <p className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
                  {fmtBDT(analytics.adSpend)}
                </p>
              ) : (
                <p className="text-2xl font-light text-muted-foreground">—</p>
              )}
            </StatCard>

            <StatCard
              label="Shipping"
              icon={<Package size={14} weight="duotone" />}
              loading={analyticsLoading}
            >
              <p className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
                {fmtBDT(analytics?.shipping ?? 0)}
              </p>
            </StatCard>

            <StatCard
              label="Cost of Goods"
              icon={<Cube size={14} weight="duotone" />}
              loading={analyticsLoading}
            >
              <p className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
                {fmtBDT(analytics?.totalCog ?? 0)}
              </p>
              {analytics?.cogCoverage && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  {analytics.cogCoverage.set}/{analytics.cogCoverage.total} products priced
                </p>
              )}
            </StatCard>

            <StatCard
              label="Net Profit"
              icon={analytics?.profit != null && analytics.profit >= 0
                ? <TrendUp size={14} weight="duotone" className="text-emerald-500" />
                : <TrendDown size={14} weight="duotone" className="text-red-500" />
              }
              loading={analyticsLoading}
            >
              {analytics?.profit != null ? (
                <>
                  <p className={cn(
                    "text-2xl font-bold tracking-tight tabular-nums",
                    analytics.profit >= 0 ? "text-emerald-600" : "text-red-500"
                  )}>
                    {analytics.profit < 0 ? "−" : ""}{fmtBDT(Math.abs(analytics.profit))}
                  </p>
                  {profitMargin != null && (
                    <span className={cn(
                      "inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold",
                      analytics.profit >= 0
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-600"
                    )}>
                      {analytics.profit >= 0 ? "+" : "−"}
                      {Math.abs(profitMargin).toFixed(1)}% margin
                    </span>
                  )}
                </>
              ) : (
                <p className="text-2xl font-light text-muted-foreground">—</p>
              )}
            </StatCard>
          </div>
        </motion.div>
      )}

      {/* ── Orders table card ────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className="overflow-hidden rounded-2xl border border-black/10 bg-[#f8f8f8]"
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-black/10 px-6 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-[15px] font-semibold tracking-normal text-foreground">Order Registry</span>
            <div className="w-px h-3.5 bg-black/10" />
            <span className="text-[13px] text-muted-foreground tabular-nums">
              {loading ? "—" : `${filteredOrders.length} orders`}
            </span>
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

            <button
              onClick={syncOrders}
              disabled={syncing || checkingFraud || autoSyncing}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-black/10 bg-black/[0.035] px-3 text-sm font-medium text-foreground/70 transition-all hover:border-black/20 hover:bg-black/[0.06] hover:text-foreground disabled:opacity-30"
              data-testid="button-sync-orders"
            >
              {syncing ? <BarsSpinner size={12} /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sync
            </button>

            <button
              onClick={checkFraud}
              disabled={checkingFraud || syncing}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-black/10 bg-black/[0.035] px-3 text-sm font-medium text-foreground/70 transition-all hover:border-black/20 hover:bg-black/[0.06] hover:text-foreground disabled:opacity-30"
              data-testid="button-check-fraud"
            >
              {checkingFraud ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              Verify All
            </button>
          </div>
        </div>

        {/* Table */}
        <OrdersTable
          orders={filteredOrders}
          loading={loading}
          onStatusUpdate={handleStatusUpdate}
          onOrderUpdate={handleOrderUpdate}
        />
      </motion.div>

    </div>
  );
}
