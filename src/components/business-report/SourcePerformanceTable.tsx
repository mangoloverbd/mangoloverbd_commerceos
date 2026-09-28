import { Fragment, useMemo, useState } from "react";
import { CaretRight } from "@phosphor-icons/react";
import { OUTCOME_COLORS, OUTCOME_KEYS, OUTCOME_LABELS, type OutcomeKey } from "@/components/business-report/chartTheme";
import type { BusinessReportResponse, BusinessReportSource } from "@/components/business-report/types";
import {
  buildProductOutcomeRows,
  buildSourceRows,
  rate,
  sortSourceRows,
  type ProductOutcomeRow,
  type SortDir,
  type SourceRow,
  type SourceSortKey,
} from "@/lib/businessReportMetrics";

const formatNumber = (value: number) => Number(value || 0).toLocaleString("en-BD");
const formatTaka = (value: number) => `৳${Math.round(value || 0).toLocaleString("en-BD")}`;
const formatKg = (value: number) => `${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 2 })} kg`;
const formatPct = (value: number) => `${value.toLocaleString("en-BD", { maximumFractionDigits: 1 })}%`;
const signedTaka = (value: number) => `${value < 0 ? "−" : "+"}৳${Math.abs(Math.round(value)).toLocaleString("en-BD")}`;

const COLUMNS: Array<{ key: SourceSortKey | null; label: string; align?: "right" }> = [
  { key: "label", label: "Source" },
  { key: "orders", label: "Orders", align: "right" },
  { key: "value", label: "Order value", align: "right" },
  { key: null, label: "Share" },
  { key: null, label: "Outcome mix" },
  { key: "approvalRate", label: "Approval", align: "right" },
  { key: "lossRate", label: "Loss", align: "right" },
  { key: "aov", label: "AOV", align: "right" },
  { key: "kg", label: "Weight", align: "right" },
  { key: "netPerOrder", label: "Net delivery / order", align: "right" },
];

function OutcomeBar({ values, width = "w-[170px]" }: { values: Record<OutcomeKey, number>; width?: string }) {
  const total = OUTCOME_KEYS.reduce((sum, key) => sum + values[key], 0);
  return (
    <div className={`flex h-2 gap-[2px] overflow-hidden rounded ${width}`} role="img" aria-label={OUTCOME_KEYS.map((key) => `${OUTCOME_LABELS[key]} ${Math.round(rate(values[key], total))}%`).join(", ")}>
      {OUTCOME_KEYS.map((key) => values[key] > 0 && (
        <i key={key} className="block h-full" style={{ width: `${rate(values[key], total)}%`, background: OUTCOME_COLORS[key] }} />
      ))}
    </div>
  );
}

function Flagged({ value, flagged }: { value: string; flagged: boolean }) {
  return flagged
    ? <span data-flag="worse" className="font-medium text-[#B4473A]">{value}</span>
    : <span>{value}</span>;
}

function ProductOutcomeTable({ label, source }: { label: string; source: BusinessReportSource }) {
  const table = useMemo(() => buildProductOutcomeRows(source.products), [source.products]);
  if (source.products.length === 0) {
    return <p className="px-1 text-[11px] text-black/55">No products recorded for this source.</p>;
  }
  const cell = (kg: number, total: number) => (
    <>
      <span>{kg ? formatNumber(kg) : "—"}</span>
      {kg > 0 && <span className="ml-1.5 inline-block min-w-[26px] text-right text-[10px] text-black/40">{Math.round(rate(kg, total))}%</span>}
    </>
  );
  const row = (item: ProductOutcomeRow, isTotal: boolean) => (
    <tr key={item.name} className={isTotal ? "bg-black/[0.03] font-semibold" : "border-b border-black/[0.06]"}>
      <th scope="row" className="px-3 py-2 text-left font-[inherit]">{item.name}</th>
      <td className="px-3 py-2 text-right">{item.kg > 0 ? formatKg(item.kg) : `${formatNumber(item.packs)} packs`}</td>
      <td className="px-3 py-2">
        {item.kg > 0 && <OutcomeBar width="w-full" values={{ approved: item.approvedKg, pending: item.pendingKg, cancelled: item.cancelledKg, returned: item.returnedKg }} />}
      </td>
      <td className="px-3 py-2 text-right">{cell(item.approvedKg, item.kg)}</td>
      <td className="px-3 py-2 text-right">{cell(item.pendingKg, item.kg)}</td>
      <td className="px-3 py-2 text-right">{cell(item.cancelledKg, item.kg)}</td>
      <td className="px-3 py-2 text-right">{cell(item.returnedKg, item.kg)}</td>
      <td className="px-3 py-2 text-right"><Flagged value={formatPct(item.lossRate)} flagged={item.flagged} /></td>
    </tr>
  );
  return (
    <div className="overflow-x-auto">
      <table aria-label={`${label} products by outcome`} className="w-full min-w-[720px] border-collapse rounded-xl bg-white text-[12px] tabular-nums">
        <thead>
          <tr className="border-b border-black/[0.08] text-[8px] uppercase tracking-[0.22em] text-black/55">
            <th scope="col" className="px-3 pb-2 pt-2.5 text-left font-medium">Product</th>
            <th scope="col" className="px-3 pb-2 pt-2.5 text-right font-medium">Ordered</th>
            <th scope="col" className="w-[26%] px-3 pb-2 pt-2.5 text-left font-medium">Outcome split</th>
            <th scope="col" className="px-3 pb-2 pt-2.5 text-right font-medium">Approved</th>
            <th scope="col" className="px-3 pb-2 pt-2.5 text-right font-medium">Pending</th>
            <th scope="col" className="px-3 pb-2 pt-2.5 text-right font-medium">Cancelled</th>
            <th scope="col" className="px-3 pb-2 pt-2.5 text-right font-medium">RTO</th>
            <th scope="col" className="px-3 pb-2 pt-2.5 text-right font-medium">Loss</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((item) => row(item, false))}
          {row(table.total, true)}
        </tbody>
      </table>
    </div>
  );
}

function SourceDetail({ row }: { row: SourceRow }) {
  const { source } = row;
  return (
    <div className="flex flex-col gap-3 px-3.5 pb-4 pt-3.5">
      <div className="grid gap-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-2 rounded-xl bg-white px-3.5 py-3 text-[12px] tabular-nums">
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/60">Delivery economics</p>
          <p className="flex justify-between"><span className="text-black/60">Delivery charged</span><span>{formatTaka(source.delivery_charged)}</span></p>
          <p className="flex justify-between"><span className="text-black/60">Courier fees</span><span>{formatTaka(source.courier_fees_recorded)}</span></p>
          <p className="flex justify-between border-t border-black/[0.08] pt-2 font-medium">
            <span>Net</span>
            <span className={source.net_delivery_position < 0 ? "text-[#B4473A]" : ""}>{signedTaka(source.net_delivery_position)}</span>
          </p>
        </div>
        {source.landing_pages.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-xl bg-white px-3.5 py-3 text-[12px] tabular-nums">
            <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/60">Landing pages</p>
            {source.landing_pages.map((page) => (
              <p key={page.path || "other"} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2.5">
                <span className="truncate font-mono text-[11px]">{page.label}</span>
                <span>{formatNumber(page.intake_count)} orders · {formatTaka(page.order_value)}</span>
                <span className="text-black/45">{formatPct(rate(page.approved_count, page.intake_count))} approved</span>
              </p>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl bg-white px-3.5 py-3 text-[12px] tabular-nums">
            <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/60">Order outcomes</p>
            <p className="flex justify-between"><span className="text-black/60">Approved</span><span>{formatNumber(source.approved_count)}</span></p>
            <p className="flex justify-between"><span className="text-black/60">Pending</span><span>{formatNumber(source.pending_count)}</span></p>
            <p className="flex justify-between"><span className="text-black/60">Cancelled</span><span>{formatNumber(source.cancelled_count)}</span></p>
            <p className="flex justify-between"><span className="text-black/60">RTO</span><span>{formatNumber(source.returned_count)}</span></p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Products by outcome · {row.label}</p>
        <p className="text-[10px] text-black/45">kg · Loss = cancelled + RTO kg ÷ ordered kg · red = 5+ pts above this source</p>
      </div>
      <ProductOutcomeTable label={row.label} source={source} />
    </div>
  );
}

export function SourcePerformanceTable({ report }: { report: BusinessReportResponse }) {
  const rows = useMemo(() => buildSourceRows(report.sources, report.summary), [report.sources, report.summary]);
  const [sort, setSort] = useState<{ key: SourceSortKey; dir: SortDir }>({ key: "value", dir: -1 });
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const sorted = useMemo(() => sortSourceRows(rows, sort.key, sort.dir), [rows, sort]);
  const allOpen = rows.length > 0 && rows.every((row) => open.has(row.key));
  const { summary } = report;

  const toggle = (key: string) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const onSort = (key: SourceSortKey) => setSort((current) => (
    current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: key === "label" ? 1 : -1 }
  ));

  return (
    <section aria-labelledby="source-performance-heading" className="flex flex-col gap-3 rounded-2xl bg-black/[0.04] px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 id="source-performance-heading" className="font-sf-display text-[15px] font-semibold text-black">Source performance</h2>
        <div className="h-3.5 w-px bg-black/10" />
        <span className="text-[13px] tabular-nums text-black/60">{formatNumber(rows.length)} sources</span>
        <span className="ml-auto hidden text-[11px] text-black/45 sm:inline">Click a column to sort · open a row for its product breakdown</span>
        <button
          type="button"
          onClick={() => setOpen(allOpen ? new Set() : new Set(rows.map((row) => row.key)))}
          className="h-8 rounded-full bg-black/[0.05] px-3 text-[12px] text-black transition-colors hover:bg-black/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <div className="-mx-1 overflow-x-auto px-1">
        <table aria-labelledby="source-performance-heading" className="w-full min-w-[900px] border-collapse text-[12px] tabular-nums">
          <thead>
            <tr className="border-b border-black/[0.09]">
              {COLUMNS.map((column) => (
                <th
                  key={column.label}
                  scope="col"
                  aria-sort={column.key && sort.key === column.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                  className={`whitespace-nowrap px-2.5 pb-2.5 text-[8px] font-medium uppercase tracking-[0.22em] text-black/60 ${column.align === "right" ? "text-right" : "text-left"}`}
                >
                  {column.key ? (
                    <button type="button" onClick={() => onSort(column.key as SourceSortKey)} className={`uppercase tracking-[0.22em] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 ${sort.key === column.key ? "text-black" : ""}`}>
                      {column.label}{sort.key === column.key ? (sort.dir === 1 ? " ▴" : " ▾") : ""}
                    </button>
                  ) : column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isOpen = open.has(row.key);
              const detailId = `business-report-source-detail-${row.key}`;
              return (
                <Fragment key={row.key}>
                  <tr data-testid={`business-report-source-${row.key}`} className="border-b border-black/[0.09] transition-colors hover:bg-black/[0.03]">
                    <td className="px-2.5 py-3">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={detailId}
                        aria-label={`${isOpen ? "Hide" : "Show"} products for ${row.label}`}
                        onClick={() => toggle(row.key)}
                        className="flex items-center gap-2 text-[13px] font-semibold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
                      >
                        <CaretRight weight="light" size={14} className={`transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        {row.label}
                      </button>
                    </td>
                    <td className="px-2.5 py-3 text-right">{formatNumber(row.orders)}</td>
                    <td className="px-2.5 py-3 text-right">{formatTaka(row.value)}</td>
                    <td className="px-2.5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1 w-[70px] overflow-hidden rounded-full bg-black/[0.08]"><div className="h-full rounded-full bg-black" style={{ width: `${row.share}%` }} /></div>
                        <span className="w-7 text-black/60">{Math.round(row.share)}%</span>
                      </div>
                    </td>
                    <td className="px-2.5 py-3"><OutcomeBar values={row.mix} /></td>
                    <td className="px-2.5 py-3 text-right"><Flagged value={formatPct(row.approvalRate)} flagged={row.flags.approval} /></td>
                    <td className="px-2.5 py-3 text-right"><Flagged value={formatPct(row.lossRate)} flagged={row.flags.loss} /></td>
                    <td className="px-2.5 py-3 text-right">{formatTaka(row.aov)}</td>
                    <td className="px-2.5 py-3 text-right">{formatKg(row.kg)}</td>
                    <td className={`px-2.5 py-3 text-right ${row.netPerOrder < 0 ? "text-[#B4473A]" : ""}`}>{signedTaka(row.netPerOrder)}</td>
                  </tr>
                  {isOpen && (
                    <tr id={detailId} className="bg-black/[0.03]">
                      <td colSpan={COLUMNS.length} className="p-0"><SourceDetail row={row} /></td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-black/60">
        {OUTCOME_KEYS.map((key) => (
          <span key={key} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px]" style={{ background: OUTCOME_COLORS[key] }} />{OUTCOME_LABELS[key]}</span>
        ))}
        <span><span className="font-medium text-[#B4473A]">Red</span> = more than 3 pts worse than the all-source average</span>
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-[10px] text-black/45">
        <span>Loss = cancelled + RTO, by value · AOV = order value ÷ orders</span>
        <span>
          Courier fees recorded on {formatNumber(summary.courier_fee_order_count)} of {formatNumber(summary.intake_count)} orders · weight on {formatNumber(summary.weight_order_count)} of {formatNumber(summary.intake_count)}
        </span>
      </div>
    </section>
  );
}
