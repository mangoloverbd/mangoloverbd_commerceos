import { Fragment, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CaretRight } from "@phosphor-icons/react";
import { YIELD_COLORS, YIELD_KEYS, YIELD_LABELS } from "@/lib/staffPerformanceCharts";
import { buildStaffTableRows, extraRevenue, sortStaffTableRows, type RateFlag, type SortDir, type StaffSortKey, type StaffTableRow } from "@/lib/staffPerformanceMetrics";
import type { StaffRow } from "@/lib/staffPerformancePresentation";

const formatNumber = (value: number) => Number(value || 0).toLocaleString("en-BD");
const formatTaka = (value: number) => `৳${Math.round(value || 0).toLocaleString("en-BD")}`;
const formatKg = (value: number) => `${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 2 })} kg`;
const formatPct = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("en-BD", { maximumFractionDigits: 1 })}%`);

const COLUMNS: Array<{ key: StaffSortKey | null; label: string; align?: "right" }> = [
  { key: "name", label: "Staff" },
  { key: "assigned", label: "Assigned", align: "right" },
  { key: "confirmed", label: "Confirmed", align: "right" },
  { key: "value", label: "Confirmed value", align: "right" },
  { key: null, label: "Outcome mix" },
  { key: "confRate", label: "Conf. rate", align: "right" },
  { key: "cancelRate", label: "Cancel rate", align: "right" },
  { key: "delRate", label: "Delivered", align: "right" },
  { key: "aov", label: "AOV", align: "right" },
  { key: "kg", label: "Weight", align: "right" },
  { key: "extra", label: "Extra revenue", align: "right" },
];

function Rate({ value, flag }: { value: number | null; flag: RateFlag }) {
  if (flag === "worse") return <span data-flag="worse" className="font-medium text-[#B4473A]">{formatPct(value)}</span>;
  if (flag === "best") return <span data-flag="best" className="font-medium text-[#2F7A55]">{formatPct(value)}</span>;
  return <span>{formatPct(value)}</span>;
}

function YieldBar({ item }: { item: StaffTableRow }) {
  if (item.assigned === 0) return <span className="text-black/35">—</span>;
  return (
    <div className="flex h-2 w-[150px] gap-[2px] overflow-hidden rounded" role="img" aria-label={YIELD_KEYS.map((key) => `${YIELD_LABELS[key]} ${item.yield[key]}`).join(", ")}>
      {YIELD_KEYS.map((key) => item.yield[key] > 0 && (
        <i key={key} className="block h-full" style={{ width: `${(item.yield[key] / item.assigned) * 100}%`, background: YIELD_COLORS[key] }} />
      ))}
    </div>
  );
}

function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="grid gap-1">
      <p className="flex justify-between text-[11px]"><span className="text-black/60">{label}</span><span className="tabular-nums">{formatNumber(value)}</span></p>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/[0.08]" aria-hidden="true">
        <div className="h-full rounded-full" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, background: color }} />
      </div>
    </div>
  );
}

function Detail({ item }: { item: StaffTableRow }) {
  const m = item.row.orders;
  const carts = item.row.abandoned_checkouts;
  const extra = extraRevenue(item.row);
  const totalKg = m.products.reduce((sum, product) => sum + product.kg, 0);
  const totalPacks = m.products.reduce((sum, product) => sum + product.packs, 0);
  const maxKg = Math.max(0, ...m.products.map((product) => product.kg));
  return (
    <section aria-label={`${item.name} details`} className="flex flex-col gap-3 px-3.5 pb-4 pt-3.5">
      <div className="grid gap-2.5 md:grid-cols-3">
        <div className="flex flex-col gap-2 rounded-xl bg-white px-3.5 py-3">
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/60">Assigned orders</p>
          <MiniBar label="Assigned" value={item.assigned} max={item.assigned} color="#0B0B0A" />
          <MiniBar label="Confirmed" value={item.yield.delivered + item.yield.inTransit + item.yield.returned} max={item.assigned} color="#0B0B0A" />
          <MiniBar label="Delivered" value={item.yield.delivered} max={item.assigned} color={YIELD_COLORS.delivered} />
          <MiniBar label="In transit" value={item.yield.inTransit} max={item.assigned} color={YIELD_COLORS.inTransit} />
          <MiniBar label="RTO" value={item.yield.returned} max={item.assigned} color={YIELD_COLORS.returned} />
          <MiniBar label="Cancelled" value={item.yield.cancelled} max={item.assigned} color={YIELD_COLORS.cancelled} />
          <MiniBar label="Not confirmed" value={item.yield.notConfirmed} max={item.assigned} color={YIELD_COLORS.notConfirmed} />
        </div>
        <div className="flex flex-col gap-2 rounded-xl bg-white px-3.5 py-3 text-[12px] tabular-nums">
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/60">Extra revenue</p>
          <p className="flex justify-between"><span className="text-black/60">Telesales · {formatNumber(m.telesales_confirmed_count)} orders</span><span>{formatTaka(extra.telesales)}</span></p>
          <p className="flex justify-between"><span className="text-black/60">Upsell kept · {formatNumber(m.retained_upsell_count)} items</span><span>{formatTaka(extra.upsell)}</span></p>
          <p className="flex justify-between"><span className="text-black/60">Carts converted · {formatNumber(carts.converted_count)}</span><span>{formatTaka(extra.carts)}</span></p>
          <p className="mt-auto flex justify-between border-t border-black/[0.08] pt-2 font-medium"><span>Total</span><span>{formatTaka(extra.total)}</span></p>
        </div>
        <div className="flex flex-col gap-2 rounded-xl bg-white px-3.5 py-3 text-[12px] tabular-nums">
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/60">Abandoned carts</p>
          <p className="flex justify-between"><span className="text-black/60">Contacted</span><span>{formatNumber(carts.contacted_count)}</span></p>
          <p className="flex justify-between"><span className="text-black/60">Dismissed</span><span>{formatNumber(carts.dismissed_count)}</span></p>
          <p className="flex justify-between"><span className="text-black/60">Reopened</span><span>{formatNumber(carts.reopened_count)}</span></p>
          <p className="mt-auto flex justify-between border-t border-black/[0.08] pt-2 font-medium">
            <span>Converted</span>
            <span>{formatNumber(carts.converted_count)}{carts.contacted_count > 0 ? ` · ${formatPct((carts.converted_count / carts.contacted_count) * 100)}` : ""}</span>
          </p>
        </div>
      </div>
      <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Confirmed products · {item.name}</p>
      {m.products.length === 0 ? (
        <p className="px-1 text-[11px] text-black/55">No confirmed products in this range.</p>
      ) : (
        <div className="overflow-x-auto">
          <table aria-label={`${item.name} confirmed products`} className="w-full min-w-[560px] border-collapse rounded-xl bg-white text-[12px] tabular-nums">
            <thead>
              <tr className="border-b border-black/[0.08] text-[8px] uppercase tracking-[0.22em] text-black/55">
                <th scope="col" className="px-3 pb-2 pt-2.5 text-left font-medium">Product</th>
                <th scope="col" className="px-3 pb-2 pt-2.5 text-right font-medium">Packs</th>
                <th scope="col" className="px-3 pb-2 pt-2.5 text-right font-medium">Weight</th>
                <th scope="col" className="w-[40%] px-3 pb-2 pt-2.5 text-left font-medium">Share of kg</th>
              </tr>
            </thead>
            <tbody>
              {m.products.map((product) => (
                <tr key={product.product_id ?? product.product_name} className="border-b border-black/[0.06]">
                  <th scope="row" className="px-3 py-2 text-left font-normal">{product.product_name}</th>
                  <td className="px-3 py-2 text-right">{formatNumber(product.packs)}</td>
                  <td className="px-3 py-2 text-right">{product.kg > 0 ? formatKg(product.kg) : "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/[0.08]" aria-hidden="true"><div className="h-full rounded-full bg-black" style={{ width: `${maxKg > 0 ? (product.kg / maxKg) * 100 : 0}%` }} /></div>
                      <span className="w-9 text-right text-[10px] text-black/45">{totalKg > 0 ? `${Math.round((product.kg / totalKg) * 100)}%` : "—"}</span>
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="bg-black/[0.03] font-semibold">
                <th scope="row" className="px-3 py-2 text-left">All products</th>
                <td className="px-3 py-2 text-right">{formatNumber(totalPacks)}</td>
                <td className="px-3 py-2 text-right">{totalKg > 0 ? formatKg(totalKg) : "—"}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function StaffTable({ rows }: { rows: StaffRow[] }) {
  const tableRows = useMemo(() => buildStaffTableRows(rows), [rows]);
  const [sort, setSort] = useState<{ key: StaffSortKey; dir: SortDir }>({ key: "value", dir: -1 });
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const reduceMotion = useReducedMotion();
  const sorted = useMemo(() => sortStaffTableRows(tableRows, sort.key, sort.dir), [tableRows, sort]);
  const rank = useMemo(() => new Map(sortStaffTableRows(tableRows, "value", -1).map((item, index) => [item.key, index + 1])), [tableRows]);
  const allOpen = tableRows.length > 0 && tableRows.every((item) => open.has(item.key));
  const transition = { duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] as const };

  const toggle = (key: string) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const onSort = (key: StaffSortKey) => setSort((current) => (
    current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: key === "name" || key === "cancelRate" ? 1 : -1 }
  ));

  return (
    <section aria-labelledby="team-performance-heading" className="flex flex-col gap-3 rounded-2xl bg-black/[0.04] px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 id="team-performance-heading" className="font-sf-display text-[15px] font-semibold text-black">Team performance</h2>
        <div className="h-3.5 w-px bg-black/10" />
        <span className="text-[13px] tabular-nums text-black/60">{formatNumber(rows.length)} {rows.length === 1 ? "member" : "members"}</span>
        <span className="ml-auto hidden text-[11px] text-black/45 sm:inline">Click a column to sort · click a row for details</span>
        <button
          type="button"
          onClick={() => setOpen(allOpen ? new Set() : new Set(tableRows.map((item) => item.key)))}
          className="h-8 rounded-full bg-black/[0.05] px-3 text-[12px] text-black transition-colors hover:bg-black/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <div className="-mx-1 overflow-x-auto px-1">
        <table aria-labelledby="team-performance-heading" className="w-full min-w-[1000px] border-collapse text-[12px] tabular-nums">
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
                    <button type="button" onClick={() => onSort(column.key as StaffSortKey)} className={`uppercase tracking-[0.22em] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25 ${sort.key === column.key ? "text-black" : ""}`}>
                      {column.label}{sort.key === column.key && <span aria-hidden="true">{sort.dir === 1 ? " ▴" : " ▾"}</span>}
                    </button>
                  ) : column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((item) => {
              const isOpen = open.has(item.key);
              const detailId = `staff-performance-detail-${item.key}`;
              const position = rank.get(item.key) ?? 0;
              return (
                <Fragment key={item.key}>
                  <tr
                    data-testid={`staff-performance-row-${item.key}`}
                    onClick={() => toggle(item.key)}
                    className={`cursor-pointer border-b border-black/[0.09] transition-colors hover:bg-black/[0.03] ${isOpen ? "bg-black/[0.03]" : ""}`}
                  >
                    <td className="px-2.5 py-3">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={detailId}
                        aria-label={`${isOpen ? "Hide" : "Show"} details for ${item.name}`}
                        className="flex items-center gap-2 text-[13px] font-semibold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25"
                      >
                        <CaretRight weight="light" size={14} className={`transition-transform motion-reduce:transition-none ${isOpen ? "rotate-90" : ""}`} />
                        <span className={`grid h-5 w-5 place-items-center rounded-md text-[10px] ${position === 1 ? "bg-black text-[#FAFAF8]" : "bg-black/[0.06] text-black/60"}`}>{position}</span>
                        {item.name}
                        {!item.isActive && <span className="text-[10px] font-normal text-black/45">· Former staff</span>}
                      </button>
                    </td>
                    <td className="px-2.5 py-3 text-right">{formatNumber(item.assigned)}</td>
                    <td className="px-2.5 py-3 text-right">{formatNumber(item.confirmed)}</td>
                    <td className="px-2.5 py-3 text-right">{formatTaka(item.value)}</td>
                    <td className="px-2.5 py-3"><YieldBar item={item} /></td>
                    <td className="px-2.5 py-3 text-right"><Rate value={item.confRate} flag={item.flags.confRate} /></td>
                    <td className="px-2.5 py-3 text-right"><Rate value={item.cancelRate} flag={item.flags.cancelRate} /></td>
                    <td className="px-2.5 py-3 text-right"><Rate value={item.delRate} flag={item.flags.delRate} /></td>
                    <td className="px-2.5 py-3 text-right">{item.aov === null ? "—" : formatTaka(item.aov)}</td>
                    <td className="px-2.5 py-3 text-right">{formatKg(item.kg)}</td>
                    <td className="px-2.5 py-3 text-right">{formatTaka(item.extra)}</td>
                  </tr>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <tr key="detail" id={detailId} className="bg-black/[0.03]">
                        <td colSpan={COLUMNS.length} className="p-0">
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={transition} className="overflow-hidden">
                            <Detail item={item} />
                          </motion.div>
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-black/60">
        {YIELD_KEYS.map((key) => (
          <span key={key} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px]" style={{ background: YIELD_COLORS[key] }} />{YIELD_LABELS[key]}</span>
        ))}
        <span><span className="font-medium text-[#B4473A]">Red</span> = more than 5 pts worse than the team average</span>
        <span><span className="font-medium text-[#2F7A55]">Green</span> = best on the team</span>
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-[10px] text-black/45">
        <span>Conf. rate = confirmed ÷ assigned · Delivered = delivered ÷ confirmed · AOV = confirmed value ÷ confirmed orders</span>
        <span>Outcome mix covers each member's assigned orders</span>
      </div>
    </section>
  );
}
