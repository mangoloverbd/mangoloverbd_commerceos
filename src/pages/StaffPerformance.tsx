import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { DateRange } from "react-day-picker";
import { Link } from "react-router-dom";
import {
  ArrowsClockwise,
  CaretDown,
  CaretRight,
  Funnel,
  WarningCircle,
} from "@phosphor-icons/react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/ios-spinner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiFetch } from "@/lib/api";
import {
  buildStaffPerformanceSnapshot,
  sortStaffPerformanceRows,
  type StaffMetrics,
  type StaffRow,
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
};

function dhakaToday(): Date {
  const dhakaMs = Date.now() + 6 * 60 * 60 * 1000;
  const date = new Date(dhakaMs);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function formatTaka(value: number) {
  return `৳${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}

function formatKg(value: number) {
  return `${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 2 })} kg`;
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
}: {
  label: string;
  value: string;
  description: string;
  testId: string;
  delay: number;
  reduceMotion: boolean | null;
}) {
  return (
    <motion.div
      data-testid={testId}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : delay, duration: 0.35 }}
      className="min-h-[92px] rounded-2xl bg-black/[0.04] px-5 py-3"
    >
      <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">{label}</p>
      <p className="mt-1 text-2xl font-light tabular-nums tracking-[-0.04em] text-black">{value}</p>
      <p className="mt-0.5 text-[11px] text-black">{description}</p>
    </motion.div>
  );
}

function DetailGroup({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="text-[8px] font-medium uppercase tracking-[0.25em] text-black/60">{title}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-[10px] text-black/55">{item.label}</dt>
            <dd className="mt-0.5 text-[12px] font-medium tabular-nums text-black">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function StaffPerformanceCard({
  row,
  index,
  reduceMotion,
}: {
  row: StaffRow;
  index: number;
  reduceMotion: boolean | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const metrics = row.orders;
  const detailsId = `staff-performance-details-${row.user_id}`;
  const action = expanded ? "Hide" : "Show";
  const detailGroups: Array<{ title: string; items: Array<{ label: string; value: string }> }> = [
    {
      title: "Assigned",
      items: [
        { label: "Work", value: formatNumber(metrics.assigned_count) },
        { label: "Confirmation rate", value: formatRate(metrics.confirmation_rate) },
      ],
    },
    {
      title: "Confirmed",
      items: [
        { label: "Orders", value: formatNumber(metrics.confirmed_count) },
        { label: "Value", value: formatTaka(metrics.confirmed_value) },
        { label: "Weight", value: formatKg(metrics.confirmed_kg) },
        { label: "AOV", value: metrics.average_order_value === null ? "—" : formatTaka(metrics.average_order_value) },
      ],
    },
    {
      title: "Cancelled",
      items: [
        { label: "Orders", value: formatNumber(metrics.cancelled_count) },
        { label: "Value", value: formatTaka(metrics.cancelled_value) },
        { label: "Cancellation rate", value: formatRate(metrics.cancellation_rate) },
      ],
    },
    {
      title: "Delivered",
      items: [
        { label: "Orders", value: formatNumber(metrics.delivered_count) },
        { label: "Value", value: formatTaka(metrics.delivered_value) },
        { label: "Delivered rate", value: formatRate(metrics.delivered_rate) },
      ],
    },
    {
      title: "Return / RTO",
      items: [
        { label: "Orders", value: formatNumber(metrics.returned_count) },
        { label: "Value", value: formatTaka(metrics.returned_value) },
      ],
    },
    {
      title: "Telesales",
      items: [
        { label: "Confirmed", value: formatNumber(metrics.telesales_confirmed_count) },
        { label: "Value", value: formatTaka(metrics.telesales_confirmed_value) },
        { label: "Weight", value: formatKg(metrics.telesales_confirmed_kg) },
      ],
    },
  ];

  return (
    <motion.article
      data-testid={`staff-performance-card-${row.user_id}`}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.04, 0.2), duration: 0.3 }}
      className="overflow-hidden rounded-2xl bg-black/[0.04] transition-colors hover:bg-black/[0.055]"
    >
      <button
        type="button"
        aria-label={`${action} details for ${row.display_name}`}
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((current) => !current)}
        className="group flex w-full items-start justify-between gap-4 px-5 pb-3 pt-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black/25"
      >
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-semibold tracking-tight text-black">
              {row.display_name}{!row.is_active ? " · Former staff" : ""}
            </span>
          </span>
          <span className="mt-1 block text-[11px] text-black/60">Ranked by confirmed value</span>
        </span>
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-black/60 transition-colors group-hover:text-black">
          {expanded ? <CaretDown size={15} weight="light" /> : <CaretRight size={15} weight="light" />}
        </span>
      </button>

      <div className="grid grid-cols-3 gap-2 px-5 pb-4">
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.2em] text-black/55">Confirmed</p>
          <p className="mt-1 text-[16px] font-light tabular-nums tracking-[-0.04em] text-black">{formatNumber(metrics.confirmed_count)}</p>
        </div>
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.2em] text-black/55">Rate</p>
          <p className="mt-1 text-[16px] font-light tabular-nums tracking-[-0.04em] text-black">{formatRate(metrics.confirmation_rate)}</p>
        </div>
        <div className="text-right">
          <p className="text-[8px] font-medium uppercase tracking-[0.2em] text-black/55">Value</p>
          <p className="mt-1 truncate text-[16px] font-light tabular-nums tracking-[-0.04em] text-black">{formatTaka(metrics.confirmed_value)}</p>
        </div>
      </div>

      <div className="mx-5 border-t border-black/[0.08]" />
      <p className="px-5 py-3 text-[10px] leading-relaxed text-black/60">
        Assigned {formatNumber(metrics.assigned_count)} · Delivered {formatNumber(metrics.delivered_count)} · Cancelled {formatNumber(metrics.cancelled_count)} · RTO {formatNumber(metrics.returned_count)}
      </p>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={detailsId}
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-black/[0.08] px-5 py-4">
              <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Operational detail</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {detailGroups.map((group) => <DetailGroup key={group.title} {...group} />)}
              </div>

              <div className="mt-4">
                <div className="flex items-center gap-2">
                  <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Confirmed products</p>
                  <div className="h-px flex-1 bg-black/[0.08]" />
                </div>
                {metrics.products.length === 0 ? (
                  <p className="mt-3 text-[11px] text-black/60">No confirmed product items in this range.</p>
                ) : (
                  <div className="mt-3 grid gap-2">
                    {metrics.products.map((product) => (
                      <div
                        key={`${row.user_id}-${product.product_id || product.product_name}`}
                        className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5"
                      >
                        <span className="truncate text-[11px] font-medium text-black">{product.product_name}</span>
                        <span className="shrink-0 text-[10px] tabular-nums text-black/60">{formatNumber(product.packs)} packs · {formatKg(product.kg)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

export default function StaffPerformance() {
  const reduceMotion = useReducedMotion();
  const defaultRange = useMemo<DateRange>(() => {
    const today = dhakaToday();
    return { from: startOfMonth(today), to: today };
  }, []);
  const [dateRange, setDateRange] = useState<DateRange | null>(defaultRange);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const from = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null;
  const to = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null;
  const selectedStaffKey = selectedUserIds.join(",");

  const reportQuery = useQuery({
    queryKey: ["staff-performance", from, to, selectedStaffKey],
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
            <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Reports</p>
            <h1 className="mt-1 font-sf-display text-[22px] font-bold tracking-tight text-black">Staff Performance</h1>
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
              <ArrowsClockwise size={17} weight="light" className={reportQuery.isFetching ? "animate-spin" : ""} />
            </button>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SnapshotCard
            label="Confirmed value"
            value={formatTaka(snapshot.confirmedValue)}
            description="Regular-order value"
            testId="staff-performance-summary-confirmed-value"
            delay={0.02}
            reduceMotion={reduceMotion}
          />
          <SnapshotCard
            label="Confirmed orders"
            value={formatNumber(snapshot.confirmedCount)}
            description="Attributed confirmations"
            testId="staff-performance-summary-confirmed-orders"
            delay={0.06}
            reduceMotion={reduceMotion}
          />
          <SnapshotCard
            label="Confirmation rate"
            value={formatRate(snapshot.confirmationRate)}
            description="Of assigned work"
            testId="staff-performance-summary-confirmation-rate"
            delay={0.1}
            reduceMotion={reduceMotion}
          />
          <SnapshotCard
            label="Delivered rate"
            value={formatRate(snapshot.deliveredRate)}
            description="Of confirmed orders"
            testId="staff-performance-summary-delivered-rate"
            delay={0.14}
            reduceMotion={reduceMotion}
          />
        </div>
      </motion.div>

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
        <motion.section
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion ? 0 : 0.1, duration: 0.4 }}
          aria-labelledby="team-performance-heading"
        >
          <div className="flex items-center gap-2.5 py-3">
            <h2 id="team-performance-heading" className="font-sf-display text-[15px] font-semibold tracking-normal text-black">Team performance</h2>
            <div className="h-3.5 w-px bg-black/10" />
            <span className="text-[13px] tabular-nums text-black/60">{rankedRows.length} staff</span>
            <span className="hidden text-[11px] text-black/45 sm:inline">Ranked by confirmed value</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rankedRows.map((row, index) => (
              <StaffPerformanceCard key={row.user_id} row={row} index={index} reduceMotion={reduceMotion} />
            ))}
          </div>
        </motion.section>
      )}
    </div>
  );
}
