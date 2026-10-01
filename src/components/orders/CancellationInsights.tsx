import type { DateRange } from "react-day-picker";
import { motion } from "framer-motion";
import { Copy, DownloadSimple, X } from "@phosphor-icons/react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  CANCELLATION_PRESETS,
  buildCancelledOrdersCsv,
  cancellationReasonDotClass as reasonDotClassName,
  cancellationReasonLabel,
  countCancellationReasons,
  summarizeCancellations,
  uniqueCancelledPhones,
  type CancellationDateBasis,
  type CancellationPreset,
  type CancellationReasonKey,
  type CancelledOrder,
} from "@/lib/cancellationInsights";

const segmentClassName = (active: boolean) => cn(
  "h-8 rounded-md px-3 text-[12px] transition-colors",
  active ? "bg-white font-medium text-black shadow-sm ring-1 ring-black/[0.08]" : "text-black/55 hover:text-black",
);

const money = (value: number) => `৳${Math.round(value).toLocaleString("en-BD")}`;

export type CancellationInsightsProps = {
  /** Cancelled orders inside the date range, before the reason filter. */
  rangeOrders: CancelledOrder[];
  /** Every cancelled order, to spot customers who cancelled more than once. */
  allCancelled: CancelledOrder[];
  /** The list as shown: date range and reason filter applied. */
  listOrders: CancelledOrder[];
  selectedOrders: CancelledOrder[];
  preset: CancellationPreset | null;
  onPresetChange: (preset: CancellationPreset) => void;
  customRange: DateRange | null;
  onCustomRangeChange: (range: DateRange | null) => void;
  basis: CancellationDateBasis;
  onBasisChange: (basis: CancellationDateBasis) => void;
  reasons: ReadonlySet<CancellationReasonKey>;
  onToggleReason: (reason: CancellationReasonKey) => void;
  onClearReasons: () => void;
};

export function CancellationInsights({
  rangeOrders, allCancelled, listOrders, selectedOrders,
  preset, onPresetChange, customRange, onCustomRangeChange,
  basis, onBasisChange, reasons, onToggleReason, onClearReasons,
}: CancellationInsightsProps) {
  const bars = countCancellationReasons(rangeOrders);
  const maxCount = Math.max(1, ...bars.map((bar) => bar.count));
  const summary = summarizeCancellations(listOrders, allCancelled);
  const exportOrders = selectedOrders.length ? selectedOrders : listOrders;
  const exportPhones = uniqueCancelledPhones(exportOrders);
  const hasReasonFilter = reasons.size > 0;

  const stats = [
    { label: "Cancelled", value: summary.orders.toLocaleString("en-BD"), sub: hasReasonFilter ? "in selected reasons" : "orders in range" },
    { label: "Customers", value: summary.customers.toLocaleString("en-BD"), sub: "unique phone numbers" },
    { label: "Value lost", value: money(summary.value), sub: "order totals" },
    { label: "Repeat cancellers", value: summary.repeatCustomers.toLocaleString("en-BD"), sub: "cancelled 2+ times" },
  ];

  const copyPhones = async () => {
    if (!exportPhones.length) return;
    try {
      await navigator.clipboard.writeText(exportPhones.join("\n"));
      toast.success(exportPhones.length === 1 ? "1 phone number copied" : `${exportPhones.length} phone numbers copied`);
    } catch {
      toast.error("Could not copy to the clipboard");
    }
  };

  const exportCsv = () => {
    if (!exportOrders.length) return;
    const blob = new Blob([buildCancelledOrdersCsv(exportOrders)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cancelled-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${exportOrders.length} cancelled ${exportOrders.length === 1 ? "order" : "orders"}`);
  };

  return (
    <section data-testid="cancellation-insights" aria-label="Cancellation insights" className="flex flex-col gap-4 px-1 py-4 sm:px-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Cancellation date range" className="flex flex-wrap gap-0.5 rounded-lg bg-black/[0.055] p-1">
            {CANCELLATION_PRESETS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={!customRange && preset === option.id}
                onClick={() => onPresetChange(option.id)}
                className={segmentClassName(!customRange && preset === option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <DateRangePicker value={customRange} onChange={onCustomRangeChange} placement="bottom start" variant="toolbar" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Filter by</span>
          <div role="group" aria-label="Date to filter by" className="flex gap-0.5 rounded-lg bg-black/[0.055] p-1">
            {([["cancelled", "Cancelled date"], ["ordered", "Order date"]] as const).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={basis === id} onClick={() => onBasisChange(id)} className={segmentClassName(basis === id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-black/[0.06] lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-2 bg-white p-4">
            <span className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">{stat.label}</span>
            <span data-testid={`cancellation-stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`} className="text-2xl font-light tabular-nums">{stat.value}</span>
            <span className="text-[11px] text-black/55">{stat.sub}</span>
          </div>
        ))}
      </div>

      <div className="rounded-lg bg-white p-3">
        <div className="flex items-baseline justify-between gap-3 px-2 pb-2">
          <span className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Why orders were cancelled</span>
          <span className="text-[11px] text-black/55">Click reasons to filter the list</span>
        </div>
        {bars.length === 0 ? (
          <p className="px-2 py-3 text-[12px] text-black/55">No cancellations in this range.</p>
        ) : (
          <div className="md:columns-2 md:gap-8">
            {bars.map((bar) => {
              const active = reasons.has(bar.key);
              const dimmed = hasReasonFilter && !active;
              return (
                <button
                  key={bar.key}
                  type="button"
                  aria-pressed={active}
                  data-testid={`cancellation-reason-${bar.key}`}
                  onClick={() => onToggleReason(bar.key)}
                  className={cn(
                    "mb-0.5 flex min-h-10 w-full break-inside-avoid items-center gap-3 rounded-md border px-2 py-1.5 text-left transition-colors",
                    active ? "border-[#0285F7]/45 bg-[#0285F7]/[0.06]" : "border-transparent hover:bg-black/[0.035]",
                    dimmed && "opacity-60",
                  )}
                >
                  <span className="flex w-48 shrink-0 items-center gap-2 min-w-0">
                    <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", reasonDotClassName(bar.key))} />
                    <span className="truncate text-[12.5px]">{bar.label}</span>
                  </span>
                  <span className="h-2 min-w-10 flex-1 overflow-hidden rounded-full bg-black/[0.05]">
                    <motion.span
                      className={cn("block h-full rounded-full", reasonDotClassName(bar.key), dimmed && "opacity-30")}
                      initial={false}
                      animate={{ width: `${(bar.count / maxCount) * 100}%` }}
                      transition={{ type: "spring", stiffness: 260, damping: 32 }}
                    />
                  </span>
                  <span className="w-16 shrink-0 text-right text-[12.5px] tabular-nums">
                    {bar.count} <span className="text-black/50">· {Math.round((bar.count / rangeOrders.length) * 100)}%</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px]">
            Showing {listOrders.length.toLocaleString("en-BD")} {listOrders.length === 1 ? "order" : "orders"}
            {selectedOrders.length > 0 && ` · ${selectedOrders.length} selected`}
          </span>
          {[...reasons].map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => onToggleReason(reason)}
              aria-label={`Remove filter ${cancellationReasonLabel(reason)}`}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-black/10 bg-white pl-2.5 pr-2 text-[11.5px]"
            >
              <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", reasonDotClassName(reason))} />
              {cancellationReasonLabel(reason)}
              <X weight="light" size={11} />
            </button>
          ))}
          {hasReasonFilter && (
            <button type="button" onClick={onClearReasons} className="h-7 px-1.5 text-[11.5px] text-[#0262B8] underline">
              Clear
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void copyPhones()}
            disabled={!exportPhones.length}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-black/[0.12] bg-white px-3 text-[12px] hover:border-black/30 disabled:opacity-40"
          >
            <Copy weight="light" size={15} />
            Copy {exportPhones.length} {exportPhones.length === 1 ? "phone" : "phones"}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!exportOrders.length}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-black px-3 text-[12px] text-white hover:bg-black/85 disabled:opacity-40"
          >
            <DownloadSimple weight="light" size={15} />
            Export CSV ({exportOrders.length})
          </button>
        </div>
      </div>
    </section>
  );
}
