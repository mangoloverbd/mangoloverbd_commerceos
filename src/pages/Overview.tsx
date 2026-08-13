import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import { DateRangePicker } from "@/components/DateRangePicker";
import { KpiCard } from "@/components/overview/KpiCard";
import { OrderVolumeChart } from "@/components/overview/OrderVolumeChart";
import { RevenueChart } from "@/components/overview/RevenueChart";
import { CourierPanel } from "@/components/overview/CourierPanel";
import { SocialInboxPanel } from "@/components/overview/SocialInboxPanel";
import { RetentionPanel } from "@/components/overview/RetentionPanel";
import { Spinner } from "@/components/ui/ios-spinner";
import { format, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";

function dhakaToday(): Date {
  const dhakaMs = Date.now() + 6 * 60 * 60 * 1000;
  const d = new Date(dhakaMs);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

const TODAY = dhakaToday();

interface OverviewData {
  kpis: {
    totalOrders: { value: number; trend: number; previousValue: number };
    revenue: { value: number; trend: number; previousValue: number };
    profitMargin: { value: number; trend: number; previousValue: number };
    deliverySuccess: { value: number; trend: number; previousValue: number };
    unreadMessages: { value: number; trend: number; previousValue: number };
  };
  orderVolumeSeries: Array<{ date: string; current: number; previous: number }>;
  revenueSeries: Array<{ date: string; revenue: number; cog: number; shipping: number; profit: number }>;
  courierPerformance: Record<string, { delivered: number; in_transit: number; failed: number; pending: number }>;
  socialInbox: {
    unread: number;
    avgResponseTimeMinutes: number;
    conversationsToday: number;
    byChannel: Record<string, number>;
  };
  customerRetention: {
    repeatRate: number;
    repeatCustomers: number;
    totalCustomers: number;
    topCustomers: Array<{ name: string; phone: string; orderCount: number; totalSpent: number }>;
  };
}

function fmtBDT(n: number) {
  return "৳" + n.toLocaleString("en-BD", { maximumFractionDigits: 0 });
}

export default function Overview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const todayRange = useMemo<DateRange>(() => ({ from: subDays(TODAY, 6), to: TODAY }), []);
  const [dateRange, setDateRange] = useState<DateRange | null>(todayRange);

  const fetchData = useCallback(async (range?: DateRange | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ t: String(Date.now()) });
      if (range?.from) params.set("since", format(range.from, "yyyy-MM-dd"));
      if (range?.to) params.set("until", format(range.to, "yyyy-MM-dd"));
      const res = await apiFetch(`/api/overview?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setData(json);
    } catch { /* non-critical */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData(dateRange);
  }, [dateRange, fetchData]);

  const handleDateRangeChange = useCallback((range: DateRange | null) => {
    setDateRange(range);
  }, []);

  if (loading || !data) {
    return (
      <div className="min-h-[calc(100vh-96px)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" className="text-foreground" />
          <span className="text-sm font-medium text-foreground/60">Loading Overview</span>
        </div>
      </div>
    );
  }

  const sparklineFromSeries = (series: Array<{ current?: number; revenue?: number }>, key: "current" | "revenue") =>
    series.slice(-7).map((d) => d[key] || 0);

  return (
    <div className="space-y-6 p-1 lg:p-2">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-black tracking-tight">Overview</h1>
        <div className="flex items-center gap-2">
          <DateRangePicker value={dateRange} onChange={handleDateRangeChange} />
          <button
            onClick={() => fetchData(dateRange)}
            disabled={loading}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-30"
            title="Refresh"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".5"/><path fill="currentColor" d="M7.378 11.63h-.75zm0 .926l-.562.497a.75.75 0 0 0 1.08.044zm2.141-1.015a.75.75 0 0 0-1.038-1.082zm-2.958-1.038a.75.75 0 1 0-1.122.994zm8.37-1.494a.75.75 0 1 0 1.102-1.018zM12.045 6.25c-2.986 0-5.416 2.403-5.416 5.38h1.5c0-2.137 1.747-3.88 3.916-3.88zm-5.416 5.38v.926h1.5v-.926zm1.269 1.467l1.622-1.556l-1.038-1.082l-1.622 1.555zm.042-1.039l-1.378-1.555l-1.122.994l1.377 1.556zm8.094-4.067a5.42 5.42 0 0 0-3.99-1.741v1.5a3.92 3.92 0 0 1 2.889 1.26zm.585 3.453l.56-.498a.75.75 0 0 0-1.08-.043zm-2.139 1.014a.75.75 0 1 0 1.04 1.082zm2.96 1.04a.75.75 0 0 0 1.12-.997zm-8.393 1.507a.75.75 0 0 0-1.094 1.026zm2.888 2.745c2.993 0 5.434-2.4 5.434-5.38h-1.5c0 2.135-1.753 3.88-3.934 3.88zm5.434-5.38v-.926h-1.5v.926zm-1.27-1.467l-1.619 1.555l1.04 1.082l1.618-1.555zm-.04 1.04l1.38 1.554l1.122-.996l-1.381-1.555zM7.952 16.03a5.45 5.45 0 0 0 3.982 1.719v-1.5c-1.143 0-2.17-.48-2.888-1.245z"/></svg>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Total Orders"
          value={data.kpis.totalOrders.value.toLocaleString()}
          trend={data.kpis.totalOrders.trend}
          previousValue={data.kpis.totalOrders.previousValue}
          sparklineValues={sparklineFromSeries(data.orderVolumeSeries, "current")}
          icon="Package"
        />
        <KpiCard
          label="Revenue"
          value={fmtBDT(data.kpis.revenue.value)}
          trend={data.kpis.revenue.trend}
          previousValue={data.kpis.revenue.previousValue}
          sparklineValues={sparklineFromSeries(data.revenueSeries, "revenue")}
          icon="CurrencyCircleDollar"
        />
        <KpiCard
          label="Profit Margin"
          value={`${data.kpis.profitMargin.value}%`}
          trend={data.kpis.profitMargin.trend}
          previousValue={data.kpis.profitMargin.previousValue}
          sparklineValues={data.revenueSeries.slice(-7).map((d) => d.profit)}
          icon="Percent"
        />
        <KpiCard
          label="Delivery Success"
          value={`${data.kpis.deliverySuccess.value}%`}
          trend={data.kpis.deliverySuccess.trend}
          previousValue={data.kpis.deliverySuccess.previousValue}
          sparklineValues={[data.kpis.deliverySuccess.value]}
          icon="Truck"
        />
        <KpiCard
          label="Unread Messages"
          value={data.kpis.unreadMessages.value.toString()}
          trend={data.kpis.unreadMessages.trend}
          previousValue={data.kpis.unreadMessages.previousValue}
          sparklineValues={[data.kpis.unreadMessages.value]}
          icon="Chats"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <OrderVolumeChart data={data.orderVolumeSeries.map((d) => ({ ...d, date: d.date.slice(5) }))} />
        <RevenueChart data={data.revenueSeries.map((d) => ({ ...d, date: d.date.slice(5) }))} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <CourierPanel data={data.courierPerformance} />
        <SocialInboxPanel data={data.socialInbox} />
        <RetentionPanel data={data.customerRetention} />
      </div>
    </div>
  );
}
