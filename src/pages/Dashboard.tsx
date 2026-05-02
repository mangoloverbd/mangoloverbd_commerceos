import { useState, useEffect, useMemo, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { OrdersTable } from "@/components/OrdersTable";
import { toast } from "sonner";
import {
  RefreshCw, ShieldCheck, Search, AlertTriangle, Loader2,
  Info, CalendarDays, ChevronDown, TrendingUp, TrendingDown,
  DollarSign, Truck, ShoppingCart, BarChart3,
} from "lucide-react";
import { BarsSpinner } from "@/registry/spell-ui/bars-spinner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-2 text-xs font-medium"
          data-testid="button-date-range-picker"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          {fmtRange(value)}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <div className="flex">
          <div className="border-r py-3 w-36 flex flex-col">
            <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase px-4 pb-2">
              Preset
            </p>
            {PRESETS.map((p) => {
              const isActive = p.label === (activePreset?.label ?? "All Time");
              return (
                <button
                  key={p.label}
                  onClick={() => apply(p.range)}
                  className={cn(
                    "text-left px-4 py-1.5 text-xs transition-colors hover:bg-muted/50",
                    isActive ? "text-foreground font-medium bg-muted/30" : "text-muted-foreground"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="p-3">
            <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase px-1 pb-2">
              Custom Range
            </p>
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
              <p className="text-[10px] text-muted-foreground text-center pb-1">
                Select an end date
              </p>
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

function fmt(n: number) {
  return "৳" + n.toLocaleString("en-BD", { maximumFractionDigits: 0 });
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
  title,
  value,
  icon: Icon,
  loading,
  accent,
  sub,
}: {
  title: string;
  value: React.ReactNode;
  icon: React.ElementType;
  loading: boolean;
  accent?: "green" | "red" | "default";
  sub?: React.ReactNode;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={cn(
          "h-8 w-8 rounded-lg flex items-center justify-center",
          accent === "green" ? "bg-emerald-100 text-emerald-600"
          : accent === "red" ? "bg-red-100 text-red-500"
          : "bg-muted text-muted-foreground"
        )}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-28 mb-1" />
        ) : (
          <div className={cn(
            "text-2xl font-bold tracking-tight",
            accent === "green" ? "text-emerald-600"
            : accent === "red" ? "text-red-500"
            : "text-foreground"
          )}>
            {value}
          </div>
        )}
        {sub && !loading && (
          <p className="text-xs text-muted-foreground mt-1">{sub}</p>
        )}
        {loading && <Skeleton className="h-3 w-20 mt-1" />}
      </CardContent>
    </Card>
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
        // silently ignore
      } finally {
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
        <div className="bg-background border shadow-lg rounded-xl p-4 flex items-center gap-3 min-w-[300px]">
          <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-destructive" />
          </div>
          <div>
            <p className="text-sm font-semibold">Failed to load orders</p>
            <p className="text-xs text-muted-foreground">Check your connection</p>
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
        <div className="bg-background border shadow-lg rounded-xl p-4 flex items-center gap-3 min-w-[300px]">
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
        <div className="bg-background border shadow-lg rounded-xl p-4 flex items-center gap-3 min-w-[300px]">
          <div className="h-9 w-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-destructive" />
          </div>
          <div>
            <p className="text-sm font-semibold">Sync failed</p>
            <p className="text-xs text-muted-foreground">{msg}</p>
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
        <div className="bg-background border shadow-lg rounded-xl p-4 flex items-center gap-3 min-w-[300px]">
          <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-semibold">{data?.successful ?? 0} verified</p>
            <p className="text-xs text-muted-foreground">of {data?.checked ?? 0} checked</p>
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

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (autoSyncing) {
    return (
      <div className="flex flex-col gap-6 p-6">
        {isAdmin && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-20" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-24 mb-1" />
                  <Skeleton className="h-3 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-24" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-3.5 border-b last:border-0" style={{ opacity: 1 - i * 0.1 }}>
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3.5 flex-1" />
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            ))}
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <BarsSpinner size={24} color="hsl(var(--muted-foreground))" />
              <span className="text-xs text-muted-foreground font-medium">Syncing from Shopify…</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  const profitMargin = analytics?.profit != null && analytics.revenue > 0
    ? (analytics.profit / analytics.revenue) * 100
    : null;

  return (
    <div className="flex flex-col gap-6 p-6">

      {/* ── P&L Stats (admin only) ─────────────────────────────────────── */}
      {isAdmin && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {/* Header row */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">P&L Overview</h2>
              {!analyticsLoading && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                  {fmtRange(dateRange)}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!analytics?.fbConfigured && !analyticsLoading && (
                <a
                  href="/settings"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="link-connect-facebook"
                >
                  <Info className="h-3 w-3" />
                  Connect Facebook Ads
                </a>
              )}
              {analytics?.fbError && (
                <span className="text-xs text-destructive max-w-[200px] truncate">{analytics.fbError}</span>
              )}
              <DateRangePicker value={dateRange} onChange={handleDateRangeChange} />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => fetchAnalytics(dateRange)}
                disabled={analyticsLoading}
                data-testid="button-refresh-analytics"
                title="Refresh P&L"
              >
                {analyticsLoading
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {/* Stat cards grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <StatCard
              title="Revenue"
              icon={ShoppingCart}
              loading={analyticsLoading}
              value={fmt(analytics?.revenue ?? 0)}
            />
            <StatCard
              title="Ad Spend"
              icon={DollarSign}
              loading={analyticsLoading}
              value={analytics?.adSpend != null ? fmt(analytics.adSpend) : "—"}
            />
            <StatCard
              title="Shipping"
              icon={Truck}
              loading={analyticsLoading}
              value={fmt(analytics?.shipping ?? 0)}
            />
            <StatCard
              title="Cost of Goods"
              icon={BarChart3}
              loading={analyticsLoading}
              value={fmt(analytics?.totalCog ?? 0)}
              sub={analytics?.cogCoverage
                ? `${analytics.cogCoverage.set}/${analytics.cogCoverage.total} products priced`
                : undefined}
            />
            <StatCard
              title="Net Profit"
              icon={analytics?.profit != null && analytics.profit >= 0 ? TrendingUp : TrendingDown}
              loading={analyticsLoading}
              accent={analytics?.profit != null ? (analytics.profit >= 0 ? "green" : "red") : "default"}
              value={analytics?.profit != null
                ? `${analytics.profit < 0 ? "-" : ""}${fmt(Math.abs(analytics.profit))}`
                : "—"}
              sub={profitMargin != null
                ? `${profitMargin >= 0 ? "+" : ""}${profitMargin.toFixed(1)}% margin`
                : undefined}
            />
          </div>
        </motion.div>
      )}

      {/* ── Orders Table Card ──────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        <Card className="overflow-hidden">
          <CardHeader className="pb-0 px-6 pt-4">
            <div className="flex items-center justify-between">
              {/* Left: title + count */}
              <div className="flex items-center gap-3">
                <CardTitle className="text-sm font-semibold">Order Registry</CardTitle>
                <Separator orientation="vertical" className="h-4" />
                <span className="text-xs text-muted-foreground tabular-nums">
                  {loading ? (
                    <Skeleton className="h-3.5 w-16 inline-block" />
                  ) : (
                    `${filteredOrders.length} orders`
                  )}
                </span>
              </div>

              {/* Right: search + actions */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search orders…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 pl-8 w-48 text-xs"
                    data-testid="input-search-orders"
                  />
                </div>

                <Separator orientation="vertical" className="h-5" />

                <Button
                  variant="outline"
                  size="sm"
                  onClick={syncOrders}
                  disabled={syncing || checkingFraud || autoSyncing}
                  className="h-8 gap-1.5 text-xs"
                  data-testid="button-sync-orders"
                >
                  {syncing
                    ? <BarsSpinner size={12} />
                    : <RefreshCw className="h-3.5 w-3.5" />}
                  Sync
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={checkFraud}
                  disabled={checkingFraud || syncing}
                  className="h-8 gap-1.5 text-xs"
                  data-testid="button-check-fraud"
                >
                  {checkingFraud
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <ShieldCheck className="h-3.5 w-3.5" />}
                  Verify All
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0 mt-3">
            <OrdersTable
              orders={filteredOrders}
              loading={loading}
              onStatusUpdate={handleStatusUpdate}
              onOrderUpdate={handleOrderUpdate}
            />
          </CardContent>
        </Card>
      </motion.div>

    </div>
  );
}
