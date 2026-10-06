import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { motion, useReducedMotion } from "framer-motion";
import type { DateRange } from "react-day-picker";
import { Link } from "react-router-dom";
import {
  CaretDown,
  Funnel,
  WarningCircle,
} from "@phosphor-icons/react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/ios-spinner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EChart } from "@/components/business-report/EChart";
import {
  ExtraRevenuePanel,
  LeaderboardPanel,
  OrderYieldPanel,
  TeamContributionPanel,
  TeamFunnelPanel,
} from "@/components/staff-performance/StaffCharts";
import { StaffTable } from "@/components/staff-performance/StaffTable";
import { apiFetch } from "@/lib/api";
import { pageKeys } from "@/lib/pageQueries";
import { useUserRole } from "@/hooks/useUserRole";
import { sparklineOption } from "@/lib/businessReportCharts";
import { extraRevenue } from "@/lib/staffPerformanceMetrics";
import {
  buildStaffPerformanceSnapshot,
  buildStaffSparks,
  sortStaffPerformanceRows,
  type StaffRow,
  type StaffSeries,
} from "@/lib/staffPerformancePresentation";
import { cn } from "@/lib/utils";

type StaffOption = {
  user_id: string;
  display_name: string;
  is_active: boolean;
};

type StaffReportResponse = {
  range: { from: string | null; to: string | null };
  available_staff: StaffOption[];
  selected_user_ids: string[];
  rows: StaffRow[];
  missing_weight_products: Array<{ id: string; name: string }>;
  series: StaffSeries;
};

function dhakaToday(): Date {
  const dhakaMs = Date.now() + 6 * 60 * 60 * 1000;
  const date = new Date(dhakaMs);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function formatTaka(value: number) {
  return `৳${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}

function formatRate(value: number | null) {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toLocaleString("en-BD", { maximumFractionDigits: 1 })}%`;
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("en-BD");
}

function StaffFilter({
  staff,
  selectedUserIds,
  onChange,
}: {
  staff: StaffOption[];
  selectedUserIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (userId: string) => {
    onChange(selectedUserIds.includes(userId)
      ? selectedUserIds.filter((id) => id !== userId)
      : [...selectedUserIds, userId]);
  };
  const label = selectedUserIds.length === 0
    ? "All staff"
    : selectedUserIds.length === 1
      ? staff.find((member) => member.user_id === selectedUserIds[0])?.display_name || "1 staff member"
      : `${selectedUserIds.length} staff members`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Filter staff"
          className="flex h-8 items-center gap-2 rounded-lg border border-black/10 bg-white px-3 text-[11px] font-medium text-black transition-colors hover:border-black/25"
        >
          <Funnel size={14} weight="light" />
          <span>{label}</span>
          <CaretDown size={12} weight="light" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 border-black/10 bg-white p-2">
        <button
          type="button"
          onClick={() => onChange([])}
          className={cn(
            "w-full rounded-md px-2 py-1.5 text-left text-[11px] font-medium transition-colors",
            selectedUserIds.length === 0 ? "bg-black/[0.06] text-black" : "text-black/60 hover:bg-black/[0.04] hover:text-black",
          )}
        >
          All staff
        </button>
        <div className="my-1 border-t border-black/[0.06]" />
        <div className="max-h-60 space-y-0.5 overflow-y-auto">
          {staff.map((member) => (
            <label
              key={member.user_id}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[11px] text-black/75 hover:bg-black/[0.04]"
            >
              <Checkbox
                aria-label={member.display_name}
                checked={selectedUserIds.includes(member.user_id)}
                onCheckedChange={() => toggle(member.user_id)}
              />
              <span className="min-w-0 truncate">
                {member.display_name}{!member.is_active ? " · Former staff" : ""}
              </span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SnapshotCard({
  label,
  value,
  description,
  testId,
  delay,
  reduceMotion,
  spark,
}: {
  label: string;
  value: string;
  description: string;
  testId: string;
  delay: number;
  reduceMotion: boolean | null;
  spark?: number[];
}) {
  const sparkOption = useMemo(() => sparklineOption(spark ?? []), [spark]);
  return (
    <motion.div
      data-testid={testId}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : delay, duration: 0.35 }}
      className="flex min-h-[92px] flex-col rounded-2xl bg-black/[0.04] px-5 py-3"
    >
      <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">{label}</p>
      <p className="mt-1 text-2xl font-light tabular-nums tracking-[-0.04em] text-black">{value}</p>
      <p className="mt-0.5 text-[11px] text-black">{description}</p>
      {spark && spark.length > 1 && (
        <EChart option={sparkOption} ariaLabel={`${label} trend`} className="mt-auto h-[30px] w-full" animate={!reduceMotion} />
      )}
    </motion.div>
  );
}

export default function StaffPerformance() {
  const reduceMotion = useReducedMotion();
  const { isAdmin } = useUserRole();
  const defaultRange = useMemo<DateRange>(() => {
    const today = dhakaToday();
    return { from: today, to: today };
  }, []);
  const [dateRange, setDateRange] = useState<DateRange | null>(defaultRange);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const from = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null;
  const to = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null;
  const selectedStaffKey = selectedUserIds.join(",");

  const reportQuery = useQuery({
    queryKey: pageKeys.staffReport(from, to, selectedStaffKey),
    retry: false,
    queryFn: async (): Promise<StaffReportResponse> => {
      const params = new URLSearchParams();
      if (from && to) {
        params.set("from", from);
        params.set("to", to);
      }
      if (selectedUserIds.length > 0) params.set("users", selectedUserIds.join(","));
      const queryString = params.toString();
      const suffix = queryString ? `?${queryString}` : "";
      const response = await apiFetch(`/api/reports/staff${suffix}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Could not load staff performance");
      return body as StaffReportResponse;
    },
  });

  const rankedRows = useMemo(
    () => reportQuery.data ? sortStaffPerformanceRows(reportQuery.data.rows) : [],
    [reportQuery.data],
  );
  const snapshot = useMemo(
    () => buildStaffPerformanceSnapshot(rankedRows),
    [rankedRows],
  );
  const sparks = useMemo(
    () => buildStaffSparks(reportQuery.data?.series.buckets ?? []),
    [reportQuery.data],
  );

  if (reportQuery.isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-96px)] items-center justify-center bg-[#FAFAF8]">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" className="text-black" />
          <span className="text-sm font-medium text-black/60">Loading staff performance</span>
        </div>
      </div>
    );
  }

  if (reportQuery.isError || !reportQuery.data) {
    return (
      <div className="flex min-h-[calc(100vh-96px)] items-center justify-center bg-[#FAFAF8]">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-medium text-black/60">Could not load staff performance</p>
          <Button type="button" variant="outline" size="sm" onClick={() => reportQuery.refetch()}>Try again</Button>
        </div>
      </div>
    );
  }

  const data = reportQuery.data;
  const missingWeightPreview = data.missing_weight_products.slice(0, 3);
  const remainingMissingWeightCount = data.missing_weight_products.length - missingWeightPreview.length;

  return (
    <div className="min-h-full space-y-6 bg-[#FAFAF8] p-1 lg:p-2">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="space-y-4"
      >
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-sf-display text-[22px] font-bold tracking-tight text-black">Staff Performance</h1>
            <p className="mt-1 max-w-2xl text-[13px] text-black/60">Human-attributed regular-order performance, using Asia/Dhaka dates.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data.available_staff.length > 1 && (
              <StaffFilter
                staff={data.available_staff}
                selectedUserIds={selectedUserIds}
                onChange={setSelectedUserIds}
              />
            )}
            <DateRangePicker value={dateRange} onChange={setDateRange} />
            <button
              type="button"
              aria-label="Refresh report"
              onClick={() => reportQuery.refetch()}
              disabled={reportQuery.isFetching}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-black/50 transition-colors hover:bg-black/[0.05] hover:text-black disabled:opacity-40"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={reportQuery.isFetching ? "animate-spin" : ""}><path opacity="0.5" d="M3.46447 3.46447C2 4.92893 2 7.28595 2 12C2 16.714 2 19.0711 3.46447 20.5355C4.92893 22 7.28595 22 12 22C16.714 22 19.0711 22 20.5355 20.5355C22 19.0711 22 16.714 22 12C22 7.28595 22 4.92893 20.5355 3.46447C19.0711 2 16.714 2 12 2C7.28595 2 4.92893 2 3.46447 3.46447Z" fill="currentColor" /><path d="M12.0096 5.25C8.62406 5.25 5.83333 7.79988 5.46058 11.0833H5.00002C4.69658 11.0833 4.42304 11.2662 4.30701 11.5466C4.19099 11.8269 4.25534 12.1496 4.47005 12.364L5.63832 13.5307C5.93113 13.8231 6.40544 13.8231 6.69825 13.5307L7.86651 12.364C8.08122 12.1496 8.14558 11.8269 8.02955 11.5466C7.91353 11.2662 7.63998 11.0833 7.33654 11.0833H6.97332C7.33642 8.63219 9.45215 6.75 12.0096 6.75C13.541 6.75 14.9136 7.42409 15.8479 8.49347C16.1204 8.80539 16.5942 8.83733 16.9061 8.56479C17.2181 8.29226 17.25 7.81846 16.9775 7.50653C15.7702 6.12471 13.9916 5.25 12.0096 5.25Z" fill="currentColor" /><path d="M18.3618 10.4693C18.069 10.1769 17.5947 10.1769 17.3018 10.4693L16.1336 11.636C15.9189 11.8504 15.8545 12.1731 15.9705 12.4534C16.0866 12.7338 16.3601 12.9167 16.6636 12.9167H17.0268C16.6637 15.3678 14.548 17.25 11.9905 17.25C10.4591 17.25 9.08654 16.5759 8.15222 15.5065C7.87968 15.1946 7.40589 15.1627 7.09396 15.4352C6.78203 15.7077 6.7501 16.1815 7.02263 16.4935C8.22995 17.8753 10.0085 18.75 11.9905 18.75C15.376 18.75 18.1668 16.2001 18.5395 12.9167H19.0001C19.3035 12.9167 19.5771 12.7338 19.6931 12.4534C19.8091 12.1731 19.7448 11.8504 19.53 11.636L18.3618 10.4693Z" fill="currentColor" /></svg>
            </button>
          </div>
        </header>

        {/* Team totals are admin-only, blurred for staff like the dashboard P&L. */}
        <div className="relative">
        {!isAdmin && (
          <div data-testid="staff-performance-summary-locked" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" className="text-black/20">
              <path d="M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM96,56a32,32,0,0,1,64,0V80H96ZM208,208H48V96H208V208Z"/>
            </svg>
          </div>
        )}
        <div aria-hidden={!isAdmin || undefined} className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-5", !isAdmin && "blur-[8px] pointer-events-none select-none")}>
          <SnapshotCard
            label="Confirmed value"
            value={formatTaka(snapshot.confirmedValue)}
            description="Approved in this period, each order once"
            testId="staff-performance-summary-confirmed-value"
            delay={0.02}
            reduceMotion={reduceMotion}
            spark={sparks.value}
          />
          <SnapshotCard
            label="Confirmed orders"
            value={formatNumber(snapshot.confirmedCount)}
            description="Attributed confirmations"
            testId="staff-performance-summary-confirmed-orders"
            delay={0.06}
            reduceMotion={reduceMotion}
            spark={sparks.count}
          />
          <SnapshotCard
            label="Confirmation rate"
            value={formatRate(snapshot.confirmationRate)}
            description="Of handled orders"
            testId="staff-performance-summary-confirmation-rate"
            delay={0.1}
            reduceMotion={reduceMotion}
            spark={sparks.confirmationRate}
          />
          <SnapshotCard
            label="Delivered rate"
            value={formatRate(snapshot.deliveredRate)}
            description="Of confirmed orders"
            testId="staff-performance-summary-delivered-rate"
            delay={0.14}
            reduceMotion={reduceMotion}
            spark={sparks.deliveredRate}
          />
          <SnapshotCard
            label="Extra revenue"
            value={formatTaka(rankedRows.reduce((sum, row) => sum + extraRevenue(row).total, 0))}
            description="Telesales, upsells and saved carts"
            testId="staff-performance-summary-extra-revenue"
            delay={0.18}
            reduceMotion={reduceMotion}
            spark={sparks.extra}
          />
        </div>
        </div>
      </motion.div>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <LeaderboardPanel rows={rankedRows} reduceMotion={reduceMotion} />
        <OrderYieldPanel rows={rankedRows} reduceMotion={reduceMotion} />
      </section>
      <section className="grid gap-3 lg:h-[520px] lg:grid-cols-3">
        <TeamFunnelPanel rows={rankedRows} reduceMotion={reduceMotion} />
        <TeamContributionPanel rows={rankedRows} reduceMotion={reduceMotion} />
        <ExtraRevenuePanel rows={rankedRows} reduceMotion={reduceMotion} />
      </section>

      {data.missing_weight_products.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-y border-amber-500/20 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-950/70">
          <WarningCircle size={16} weight="light" className="text-amber-700" />
          <span>
            {data.missing_weight_products.length} product{data.missing_weight_products.length === 1 ? " is" : "s are"} missing a catalog weight: {missingWeightPreview.map((product) => product.name).join(", ")}{remainingMissingWeightCount > 0 ? `, and ${remainingMissingWeightCount} more` : ""}.
          </span>
          <Link to="/products" className="font-medium text-amber-950 underline underline-offset-2">Review products</Link>
        </div>
      )}

      {rankedRows.length === 0 ? (
        <div className="border-y border-black/[0.08] py-12 text-center text-[12px] text-black/60">
          No staff attribution is available for this range yet.
        </div>
      ) : (
        <StaffTable rows={rankedRows} />
      )}
    </div>
  );
}
