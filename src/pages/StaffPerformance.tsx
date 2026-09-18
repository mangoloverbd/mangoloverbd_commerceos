import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Link } from "react-router-dom";
import {
  CaretDown,
  CaretRight,
  Funnel,
  WarningCircle,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/ios-spinner";
import { cn } from "@/lib/utils";

type ProductDetail = {
  product_id: string | null;
  product_name: string;
  packs: number;
  kg: number;
};

type StaffMetrics = {
  assigned_count: number;
  confirmed_count: number;
  confirmed_assigned_count: number;
  confirmed_value: number;
  confirmed_kg: number;
  confirmation_rate: number | null;
  average_order_value: number | null;
  cancelled_count: number;
  cancelled_assigned_count: number;
  cancelled_value: number;
  cancellation_rate: number | null;
  delivered_count: number;
  delivered_value: number;
  delivered_rate: number | null;
  returned_count: number;
  returned_value: number;
  telesales_confirmed_count: number;
  telesales_confirmed_value: number;
  telesales_confirmed_kg: number;
  products: ProductDetail[];
};

type StaffRow = {
  user_id: string;
  display_name: string;
  is_active: boolean;
  orders: StaffMetrics;
  social_inbox_orders: StaffMetrics;
};

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

type Column = {
  group: string;
  label: string;
  value: (metrics: StaffMetrics) => string;
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

const orderColumns: Column[] = [
  { group: "Assigned", label: "Work", value: (metrics) => formatNumber(metrics.assigned_count) },
  { group: "Assigned", label: "Confirm rate", value: (metrics) => formatRate(metrics.confirmation_rate) },
  { group: "Confirmed", label: "Orders", value: (metrics) => formatNumber(metrics.confirmed_count) },
  { group: "Confirmed", label: "Value", value: (metrics) => formatTaka(metrics.confirmed_value) },
  { group: "Confirmed", label: "Weight", value: (metrics) => formatKg(metrics.confirmed_kg) },
  { group: "Confirmed", label: "AOV", value: (metrics) => metrics.average_order_value === null ? "—" : formatTaka(metrics.average_order_value) },
  { group: "Cancelled", label: "Orders", value: (metrics) => formatNumber(metrics.cancelled_count) },
  { group: "Cancelled", label: "Value", value: (metrics) => formatTaka(metrics.cancelled_value) },
  { group: "Cancelled", label: "Cancel rate", value: (metrics) => formatRate(metrics.cancellation_rate) },
  { group: "Delivered", label: "Orders", value: (metrics) => formatNumber(metrics.delivered_count) },
  { group: "Delivered", label: "Value", value: (metrics) => formatTaka(metrics.delivered_value) },
  { group: "Delivered", label: "Rate", value: (metrics) => formatRate(metrics.delivered_rate) },
  { group: "Return/RTO", label: "Orders", value: (metrics) => formatNumber(metrics.returned_count) },
  { group: "Return/RTO", label: "Value", value: (metrics) => formatTaka(metrics.returned_value) },
  { group: "Telesales", label: "Confirmed", value: (metrics) => formatNumber(metrics.telesales_confirmed_count) },
  { group: "Telesales", label: "Value", value: (metrics) => formatTaka(metrics.telesales_confirmed_value) },
  { group: "Telesales", label: "Weight", value: (metrics) => formatKg(metrics.telesales_confirmed_kg) },
];

const socialColumns: Column[] = [
  { group: "Confirmed", label: "Orders", value: (metrics) => formatNumber(metrics.confirmed_count) },
  { group: "Confirmed", label: "Value", value: (metrics) => formatTaka(metrics.confirmed_value) },
  { group: "Confirmed", label: "Weight", value: (metrics) => formatKg(metrics.confirmed_kg) },
  { group: "Confirmed", label: "AOV", value: (metrics) => metrics.average_order_value === null ? "—" : formatTaka(metrics.average_order_value) },
  { group: "Cancelled", label: "Orders", value: (metrics) => formatNumber(metrics.cancelled_count) },
  { group: "Cancelled", label: "Value", value: (metrics) => formatTaka(metrics.cancelled_value) },
  { group: "Delivered", label: "Orders", value: (metrics) => formatNumber(metrics.delivered_count) },
  { group: "Delivered", label: "Value", value: (metrics) => formatTaka(metrics.delivered_value) },
  { group: "Delivered", label: "Rate", value: (metrics) => formatRate(metrics.delivered_rate) },
  { group: "Return/RTO", label: "Orders", value: (metrics) => formatNumber(metrics.returned_count) },
  { group: "Return/RTO", label: "Value", value: (metrics) => formatTaka(metrics.returned_value) },
];

function groupedColumns(columns: Column[]) {
  return columns.reduce<Array<{ label: string; count: number }>>((groups, column) => {
    const previous = groups[groups.length - 1];
    if (previous?.label === column.group) previous.count += 1;
    else groups.push({ label: column.group, count: 1 });
    return groups;
  }, []);
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

function ReportTable({
  title,
  description,
  rows,
  columns,
  metricsKey,
}: {
  title: string;
  description?: string;
  rows: StaffRow[];
  columns: Column[];
  metricsKey: "orders" | "social_inbox_orders";
}) {
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const groups = groupedColumns(columns);
  const isSocial = metricsKey === "social_inbox_orders";
  const toggle = (userId: string) => setExpandedIds((current) => (
    current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
  ));

  return (
    <section aria-labelledby={`${metricsKey}-heading`} className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Performance</p>
          <h2 id={`${metricsKey}-heading`} className="mt-1 text-xl font-light text-black">{title}</h2>
        </div>
        {description && <p className="text-[11px] text-black/45">{description}</p>}
      </div>
      <div className="overflow-x-auto border-y border-black/[0.08]">
        <table className="min-w-max w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-black/[0.08]">
              <th rowSpan={2} className="sticky left-0 z-10 min-w-48 bg-[#FAFAF8] px-3 py-2 text-[8px] font-medium uppercase tracking-[0.3em] text-black">Staff</th>
              {groups.map((group) => (
                <th key={group.label} colSpan={group.count} className="border-l border-black/[0.06] px-3 py-2 text-center text-[8px] font-medium uppercase tracking-[0.3em] text-black/60">
                  {group.label}
                </th>
              ))}
            </tr>
            <tr className="border-b border-black/[0.08]">
              {columns.map((column) => (
                <th key={`${column.group}-${column.label}`} className="border-l border-black/[0.06] px-3 py-2 text-right text-[8px] font-medium uppercase tracking-[0.2em] text-black/45">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const metrics = row[metricsKey];
              const expanded = expandedIds.includes(row.user_id);
              const action = expanded ? "Hide" : "Show";
              const detailLabel = `${action} ${isSocial ? "social" : "order"} products for ${row.display_name}`;
              return (
                <Fragment key={row.user_id}>
                  <tr className="border-b border-black/[0.06] hover:bg-black/[0.015]">
                    <td className="sticky left-0 z-10 bg-[#FAFAF8] px-3 py-2.5 align-top">
                      <button
                        type="button"
                        aria-label={detailLabel}
                        aria-expanded={expanded}
                        onClick={() => toggle(row.user_id)}
                        className="flex items-center gap-1.5 text-left text-[12px] font-medium text-black hover:text-black/60"
                      >
                        {expanded ? <CaretDown size={13} weight="light" /> : <CaretRight size={13} weight="light" />}
                        <span>{row.display_name}{!row.is_active ? " · Former staff" : ""}</span>
                      </button>
                    </td>
                    {columns.map((column) => (
                      <td key={`${row.user_id}-${column.group}-${column.label}`} className="border-l border-black/[0.04] px-3 py-2.5 text-right text-[11px] tabular-nums text-black/70">
                        {column.value(metrics)}
                      </td>
                    ))}
                  </tr>
                  {expanded && (
                    <tr className="border-b border-black/[0.06] bg-black/[0.015]">
                      <td colSpan={columns.length + 1} className="px-6 py-3">
                        {metrics.products.length === 0 ? (
                          <p className="text-[11px] text-black/45">No confirmed product items in this range.</p>
                        ) : (
                          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                            {metrics.products.map((product) => (
                              <div key={`${row.user_id}-${product.product_id || product.product_name}`} className="flex items-center justify-between gap-3 py-1 text-[11px]">
                                <span className="truncate text-black/70">{product.product_name}</span>
                                <span className="shrink-0 tabular-nums text-black/50">{formatNumber(product.packs)} packs · {formatKg(product.kg)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function StaffPerformance() {
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
  return (
    <div className="min-h-full space-y-8 bg-[#FAFAF8] p-1 lg:p-2">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Reports</p>
          <h1 className="mt-1 text-2xl font-light text-black">Staff Performance</h1>
          <p className="mt-1 text-[11px] text-black/45">Human-attributed confirmation and cancellation work, using Asia/Dhaka dates.</p>
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

      {data.missing_weight_products.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-y border-amber-500/20 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-950/70">
          <WarningCircle size={16} weight="light" className="text-amber-700" />
          <span>{data.missing_weight_products.length} product{data.missing_weight_products.length === 1 ? " is" : "s are"} missing a catalog weight: {data.missing_weight_products.map((product) => product.name).join(", ")}.</span>
          <Link to="/products" className="font-medium text-amber-950 underline underline-offset-2">Review products</Link>
        </div>
      )}

      {data.rows.length === 0 ? (
        <div className="border-y border-black/[0.08] py-12 text-center text-[12px] text-black/45">
          No staff attribution is available for this range yet.
        </div>
      ) : (
        <div className="space-y-10">
          <ReportTable title="Orders" rows={data.rows} columns={orderColumns} metricsKey="orders" />
          <ReportTable
            title="Social Inbox"
            description="Value may include delivery. Assignment and telesales rates do not apply to AI-captured social orders."
            rows={data.rows}
            columns={socialColumns}
            metricsKey="social_inbox_orders"
          />
        </div>
      )}
    </div>
  );
}
