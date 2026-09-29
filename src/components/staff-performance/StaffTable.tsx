import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowUp, CaretDown } from "@phosphor-icons/react";
import { YIELD_COLORS, YIELD_KEYS, YIELD_LABELS } from "@/lib/staffPerformanceCharts";
import { buildStaffTableRows, extraRevenue, sortStaffTableRows, STAFF_FLAG_POINTS, staffTeamAverages, type RateFlag, type SortDir, type StaffSortKey, type StaffTableRow } from "@/lib/staffPerformanceMetrics";
import type { ProductDetail, StaffRow } from "@/lib/staffPerformancePresentation";

const formatNumber = (value: number) => Number(value || 0).toLocaleString("en-BD");
const formatTaka = (value: number) => `৳${Math.round(value || 0).toLocaleString("en-BD")}`;
const formatKg = (value: number) => `${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 2 })} kg`;
const formatPct = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("en-BD", { maximumFractionDigits: 1 })}%`);
const formatPacks = (packs: number, kg: number) => (packs > 0 ? `${formatNumber(packs)}${kg > 0 ? ` · ${formatKg(kg)}` : ""}` : "—");
const plural = (count: number, one: string, many: string) => `${formatNumber(count)} ${count === 1 ? one : many}`;
// Loss = kg that was cancelled or returned, out of every kg the member confirmed or cancelled.
const productLoss = (product: Pick<ProductDetail, "kg" | "returned_kg" | "cancelled_kg">) => {
  const denominator = product.kg + product.cancelled_kg;
  return denominator > 0 ? ((product.cancelled_kg + product.returned_kg) / denominator) * 100 : null;
};
// Gap to the team, rounded away from zero to 1 decimal so a flagged gap (strictly > 5) never reads "5.0".
const formatPts = (diff: number) => (Math.ceil(Math.abs(diff) * 10 - 1e-9) / 10).toFixed(1);

const SORT_OPTIONS: Array<{ key: StaffSortKey; label: string }> = [
  { key: "value", label: "Confirmed value" },
  { key: "name", label: "Staff" },
  { key: "handled", label: "Handled" },
  { key: "confirmed", label: "Confirmed" },
  { key: "confRate", label: "Confirmation rate" },
  { key: "cancelRate", label: "Cancel rate" },
  { key: "delRate", label: "Delivered" },
  { key: "aov", label: "AOV" },
  { key: "kg", label: "Weight" },
  { key: "extra", label: "Extra revenue" },
];

const NAMES_SHOWN = 3;
const RED = "text-[#B4473A]";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/25";
const EYEBROW = "text-[8px] font-medium uppercase tracking-[0.3em] text-black";
const CARD = "rounded-2xl bg-white p-5";

// Share of handled orders for one outcome segment.
const outcomeShare = (item: StaffTableRow, key: (typeof YIELD_KEYS)[number]) => {
  if (item.handled === 0) return 0;
  if (key === "delivered") return item.deliveredShare ?? 0;
  return (item.yield[key] / item.handled) * 100;
};
const outcomeSummary = (item: StaffTableRow) => YIELD_KEYS.map((key) => `${YIELD_LABELS[key]} ${item.yield[key]}`).join(", ");
const hasActivity = (item: StaffTableRow) => {
  const carts = item.row.abandoned_checkouts;
  return item.handled > 0 || item.extra > 0 || carts.contacted_count + carts.dismissed_count + carts.reopened_count + carts.converted_count > 0;
};

function Rate({ value, flag }: { value: number | null; flag: RateFlag }) {
  if (flag === "worse") return <span data-flag="worse" className={`font-medium ${RED}`}>{formatPct(value)}</span>;
  if (flag === "best") return <span data-flag="best" className="font-medium text-[#2F7A55]">{formatPct(value)}</span>;
  return <span>{formatPct(value)}</span>;
}

function RankBadge({ rank, size }: { rank: number; size: "sm" | "lg" }) {
  return (
    <span className={`grid shrink-0 place-items-center rounded-lg tabular-nums ${size === "sm" ? "h-6 w-6 text-[11px]" : "h-7 w-7 text-[12px]"} ${rank === 1 ? "bg-black text-[#FAFAF8]" : "bg-black/[0.07] text-black/60"}`}>
      {rank}
    </span>
  );
}

function OutcomeBar({ item, height, label }: { item: StaffTableRow; height: string; label: string }) {
  return (
    <span role="img" aria-label={label} className={`flex w-full gap-[2px] overflow-hidden rounded-full bg-black/[0.06] ${height}`}>
      {YIELD_KEYS.map((key) => item.yield[key] > 0 && (
        <span key={key} data-segment={key} className="block h-full min-w-[2px]" style={{ width: `${outcomeShare(item, key)}%`, background: YIELD_COLORS[key] }} />
      ))}
    </span>
  );
}

function Tile({ label, value, sub, subRed }: { label: string; value: ReactNode; sub: string; subRed?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-[#F7F7F5] px-4 py-3.5 tabular-nums">
      <p className="text-[12px] text-black/60">{label}</p>
      <p className="min-w-0 break-words text-[20px] font-light text-black [overflow-wrap:anywhere] sm:text-[24px]">{value}</p>
      <p className={`text-[11px] ${subRed ? RED : "text-black/50"}`}>{sub}</p>
    </div>
  );
}

type ProfileProps = {
  item: StaffTableRow;
  rank: number;
  shownCount: number;
  teamValue: number;
  teamAov: number | null;
  averages: ReturnType<typeof staffTeamAverages>;
};

function Profile({ item, rank, shownCount, teamValue, teamAov, averages }: ProfileProps) {
  const m = item.row.orders;
  const carts = item.row.abandoned_checkouts;
  const extra = extraRevenue(item.row);
  const total = m.products.reduce((sum, product) => ({
    packs: sum.packs + product.packs,
    kg: sum.kg + product.kg,
    delivered_packs: sum.delivered_packs + product.delivered_packs,
    delivered_kg: sum.delivered_kg + product.delivered_kg,
    returned_packs: sum.returned_packs + product.returned_packs,
    returned_kg: sum.returned_kg + product.returned_kg,
    cancelled_packs: sum.cancelled_packs + product.cancelled_packs,
    cancelled_kg: sum.cancelled_kg + product.cancelled_kg,
  }), { packs: 0, kg: 0, delivered_packs: 0, delivered_kg: 0, returned_packs: 0, returned_kg: 0, cancelled_packs: 0, cancelled_kg: 0 });
  const totalLoss = productLoss(total);
  const confWorse = item.flags.confRate === "worse" && item.confRate !== null && averages.confRate !== null;
  const cancelWorse = item.flags.cancelRate === "worse" && item.cancelRate !== null && averages.cancelRate !== null;
  const outcomeSubs: Record<(typeof YIELD_KEYS)[number], string> = {
    delivered: formatTaka(m.handled_delivered_value),
    inTransit: `${formatPct(outcomeShare(item, "inTransit"))} of handled`,
    returned: formatTaka(m.handled_returned_value),
    cancelled: `${formatTaka(m.handled_cancelled_value)} lost`,
  };

  return (
    <>
      <div className={`${CARD} flex flex-col gap-4`}>
        <div className="flex flex-wrap items-center gap-2.5">
          <RankBadge rank={rank} size="lg" />
          <h3 className="min-w-0 break-words text-[22px] font-semibold text-black [overflow-wrap:anywhere]">{item.name}</h3>
          {!item.isActive && <span className="rounded-full bg-black/[0.06] px-2 py-0.5 text-[10px] text-black/55">Former staff</span>}
          {item.flags.cancelRate === "worse" && <span className={`rounded-full bg-[#B4473A]/10 px-2 py-0.5 text-[10px] font-medium ${RED}`}>High cancels</span>}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <p className={EYEBROW}>Confirmed value</p>
            <p data-testid="staff-performance-hero-value" className="text-[32px] font-light leading-none tracking-[-0.04em] text-black tabular-nums [overflow-wrap:anywhere] sm:text-[44px]">{formatTaka(item.value)}</p>
          </div>
          <div className="flex flex-col items-end gap-0.5 text-[12px] text-black/55 tabular-nums">
            {teamValue > 0 && <span>{`${formatPct((item.value / teamValue) * 100)} of team value`}</span>}
            <span>{`Ranked ${rank} of ${shownCount} by value`}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
          <Tile
            label="Confirmation rate"
            value={<Rate value={item.confRate} flag={item.flags.confRate} />}
            sub={confWorse ? `${formatPts((averages.confRate ?? 0) - (item.confRate ?? 0))} pts below team` : `Team ${formatPct(averages.confRate)}`}
            subRed={confWorse}
          />
          <Tile
            label="Cancel rate"
            value={<Rate value={item.cancelRate} flag={item.flags.cancelRate} />}
            sub={cancelWorse ? `${formatPts((item.cancelRate ?? 0) - (averages.cancelRate ?? 0))} pts above team` : `Team ${formatPct(averages.cancelRate)}`}
            subRed={cancelWorse}
          />
          <Tile label="Delivered of confirmed" value={formatPct(item.delRate)} sub={`${formatNumber(item.yield.inTransit)} still in transit`} />
          <Tile label="Average order value" value={item.aov === null ? "—" : formatTaka(item.aov)} sub={`Team ${teamAov === null ? "—" : formatTaka(teamAov)}`} />
          <Tile label="Weight confirmed" value={formatKg(item.kg)} sub={plural(item.confirmed, "confirmed order", "confirmed orders")} />
          <Tile label="Extra revenue" value={formatTaka(item.extra)} sub="Telesales, upsell, carts" />
        </div>
      </div>

      <div className={`${CARD} flex flex-col gap-4`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className={EYEBROW}>{`Where ${item.name}'s ${formatNumber(item.handled)} orders ended up`}</p>
          <p className="text-[12px] text-black/55 tabular-nums">{`Confirmed ${formatNumber(item.confirmed)} · ${formatTaka(m.handled_confirmed_value)}`}</p>
        </div>
        <OutcomeBar item={item} height="h-3" label={`${item.name} outcomes: ${outcomeSummary(item)}`} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {YIELD_KEYS.map((key) => (
            <div key={key} data-outcome={key} className="flex flex-col gap-1 tabular-nums">
              <p className="flex items-center gap-1.5 text-[12px] text-black/60">
                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: YIELD_COLORS[key] }} />
                {YIELD_LABELS[key]}
              </p>
              <p className={`text-[22px] font-light ${key === "cancelled" && item.yield.cancelled > 0 ? RED : "text-black"}`}>{formatNumber(item.yield[key])}</p>
              <p className="text-[11px] text-black/50">{outcomeSubs[key]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3.5 md:grid-cols-2">
        <div className={`${CARD} flex flex-col gap-2 text-[12px] tabular-nums`}>
          <p className={EYEBROW}>Extra revenue</p>
          <p className="flex justify-between"><span className="text-black/60">Telesales · {formatNumber(m.telesales_confirmed_count)} orders</span><span>{formatTaka(extra.telesales)}</span></p>
          <p className="flex justify-between"><span className="text-black/60">Upsell kept · {formatNumber(m.retained_upsell_count)} items</span><span>{formatTaka(extra.upsell)}</span></p>
          <p className="flex justify-between"><span className="text-black/60">Carts converted · {formatNumber(carts.converted_count)}</span><span>{formatTaka(extra.carts)}</span></p>
          <p className="mt-auto flex justify-between border-t border-black/[0.08] pt-2 font-medium"><span>Total</span><span>{formatTaka(extra.total)}</span></p>
        </div>
        <div className={`${CARD} flex flex-col gap-2 text-[12px] tabular-nums`}>
          <p className={EYEBROW}>Abandoned carts</p>
          <p className="flex justify-between"><span className="text-black/60">Contacted</span><span>{formatNumber(carts.contacted_count)}</span></p>
          <p className="flex justify-between"><span className="text-black/60">Dismissed</span><span>{formatNumber(carts.dismissed_count)}</span></p>
          <p className="flex justify-between"><span className="text-black/60">Reopened</span><span>{formatNumber(carts.reopened_count)}</span></p>
          <p className="mt-auto flex justify-between border-t border-black/[0.08] pt-2 font-medium">
            <span>Converted</span>
            <span>{formatNumber(carts.converted_count)}{carts.contacted_count > 0 ? ` · ${formatPct((carts.converted_count / carts.contacted_count) * 100)}` : ""}</span>
          </p>
        </div>
      </div>

      <div className={`${CARD} flex flex-col gap-3`}>
        <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Products by outcome · {item.name}</p>
        {m.products.length === 0 ? (
          <p className="text-[11px] text-black/55">No products in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table aria-label={`${item.name} products by outcome`} className="w-full min-w-[640px] border-collapse text-[12px] tabular-nums">
              <thead>
                <tr className="border-b border-black/[0.08] text-[8px] uppercase tracking-[0.22em] text-black/55">
                  <th scope="col" className="px-3 pb-2 pt-2.5 text-left font-medium">Product</th>
                  <th scope="col" className="px-3 pb-2 pt-2.5 text-right font-medium">Confirmed</th>
                  <th scope="col" className="px-3 pb-2 pt-2.5 text-right font-medium">Delivered</th>
                  <th scope="col" className="px-3 pb-2 pt-2.5 text-right font-medium">RTO</th>
                  <th scope="col" className="px-3 pb-2 pt-2.5 text-right font-medium">Cancelled</th>
                  <th scope="col" className="px-3 pb-2 pt-2.5 text-right font-medium">Loss</th>
                </tr>
              </thead>
              <tbody>
                {m.products.map((product) => {
                  const loss = productLoss(product);
                  // Mirrors flagFor's strict rule, without its 1e-9 float tolerance.
                  const worse = loss !== null && totalLoss !== null && loss > totalLoss + STAFF_FLAG_POINTS;
                  return (
                    <tr key={product.product_id ?? product.product_name} className="border-b border-black/[0.06]">
                      <th scope="row" className="px-3 py-2 text-left font-normal">{product.product_name}</th>
                      <td className="px-3 py-2 text-right">{formatPacks(product.packs, product.kg)}</td>
                      <td className="px-3 py-2 text-right">{formatPacks(product.delivered_packs, product.delivered_kg)}</td>
                      <td className="px-3 py-2 text-right">{formatPacks(product.returned_packs, product.returned_kg)}</td>
                      <td className="px-3 py-2 text-right">{formatPacks(product.cancelled_packs, product.cancelled_kg)}</td>
                      <td className="px-3 py-2 text-right">
                        {worse ? <span data-flag="worse" className={`font-medium ${RED}`}>{formatPct(loss)}</span> : <span>{formatPct(loss)}</span>}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-black/[0.03] font-semibold">
                  <th scope="row" className="px-3 py-2 text-left">All products</th>
                  <td className="px-3 py-2 text-right">{formatPacks(total.packs, total.kg)}</td>
                  <td className="px-3 py-2 text-right">{formatPacks(total.delivered_packs, total.delivered_kg)}</td>
                  <td className="px-3 py-2 text-right">{formatPacks(total.returned_packs, total.returned_kg)}</td>
                  <td className="px-3 py-2 text-right">{formatPacks(total.cancelled_packs, total.cancelled_kg)}</td>
                  <td className="px-3 py-2 text-right">{formatPct(totalLoss)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

export function StaffTable({ rows }: { rows: StaffRow[] }) {
  const tableRows = useMemo(() => buildStaffTableRows(rows), [rows]);
  const averages = useMemo(() => staffTeamAverages(rows), [rows]);
  const [sort, setSort] = useState<{ key: StaffSortKey; dir: SortDir }>({ key: "value", dir: -1 });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [noOrdersOpen, setNoOrdersOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const focusProfile = useRef(false);
  const sortId = useId();
  const reduceMotion = useReducedMotion();

  // Members with no orders, carts or extra revenue collapse into one group, unless nobody qualifies.
  const active = useMemo(() => tableRows.filter(hasActivity), [tableRows]);
  const shownRows = active.length > 0 ? active : tableRows;
  const noOrders = useMemo(
    () => (active.length > 0 ? tableRows.filter((item) => !hasActivity(item)).sort((a, b) => a.name.localeCompare(b.name)) : []),
    [tableRows, active],
  );
  const sorted = useMemo(() => sortStaffTableRows(shownRows, sort.key, sort.dir), [shownRows, sort]);
  const rank = useMemo(() => new Map(sortStaffTableRows(shownRows, "value", -1).map((item, index) => [item.key, index + 1])), [shownRows]);
  // A selected member who drops out of the rows is forgotten, so they are not silently re-selected if they return.
  if (selectedKey !== null && !sorted.some((item) => item.key === selectedKey)) setSelectedKey(null);
  const selected = sorted.find((item) => item.key === selectedKey) ?? sorted[0];
  const selectedShownKey = selected?.key;

  // On stacked (< lg) screens, move keyboard focus to the freshly rendered profile after a pick.
  useEffect(() => {
    if (!focusProfile.current) return;
    focusProfile.current = false;
    const section = sectionRef.current;
    if (section && typeof section.focus === "function") section.focus({ preventScroll: true });
  }, [selectedShownKey]);

  const team = tableRows.reduce((sum, item) => ({
    value: sum.value + item.value,
    handled: sum.handled + item.handled,
    confirmed: sum.confirmed + item.confirmed,
  }), { value: 0, handled: 0, confirmed: 0 });
  const teamAov = team.confirmed > 0 ? team.value / team.confirmed : null;
  const needsAttention = tableRows.filter((item) => item.flags.cancelRate === "worse").length;

  // Pin the current selection so re-sorting never moves the profile to someone else.
  const changeSort = (next: { key: StaffSortKey; dir: SortDir }) => {
    if (selected) setSelectedKey(selected.key);
    setSort(next);
  };
  const onSortKey = (key: StaffSortKey) => changeSort({ key, dir: key === "name" || key === "cancelRate" ? 1 : -1 });
  const directionLabel = sort.key === "name" ? (sort.dir === 1 ? "A to Z" : "Z to A") : (sort.dir === 1 ? "lowest first" : "highest first");
  const select = (key: string) => {
    setSelectedKey(key);
    const wide = typeof window.matchMedia === "function" ? window.matchMedia("(min-width: 1024px)").matches : null;
    const target = profileRef.current;
    if (!target || typeof target.scrollIntoView !== "function") return;
    const scroll = () => target.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
    if (wide === false) {
      // Stacked (< lg): bring the profile below the roster into view and move focus to it.
      scroll();
      focusProfile.current = key !== selectedShownKey;
    } else if (wide && key !== selectedShownKey && typeof target.getBoundingClientRect === "function" && target.getBoundingClientRect().top < 0) {
      // Desktop: lg:sticky does not engage because the document, not <main>, scrolls, so bring an off-screen profile back. Focus stays on the roster.
      scroll();
    }
  };
  const preview = `${noOrders.slice(0, NAMES_SHOWN).map((item) => item.name).join(", ")}${noOrders.length > NAMES_SHOWN ? ` and ${noOrders.length - NAMES_SHOWN} more` : ""}`;

  return (
    <section aria-labelledby="team-performance-heading" className="flex flex-col gap-4 rounded-2xl bg-black/[0.04] px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 id="team-performance-heading" className="font-sf-display text-[15px] font-semibold text-black">Team performance</h2>
        <div className="h-3.5 w-px bg-black/10" />
        <span className="text-[13px] tabular-nums text-black/60">{`${formatNumber(active.length)} of ${formatNumber(tableRows.length)} members active`}</span>
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor={sortId} className="text-[11px] text-black/45">Sort by</label>
          <div className="relative inline-flex">
            <select
              id={sortId}
              value={sort.key}
              onChange={(event) => onSortKey(event.target.value as StaffSortKey)}
              className={`h-9 cursor-pointer appearance-none rounded-full bg-black/[0.05] pl-4 pr-10 text-[13px] font-medium text-black transition-colors [-webkit-appearance:none] hover:bg-black/[0.08] ${FOCUS}`}
            >
              {SORT_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
            <CaretDown aria-hidden="true" weight="light" size={14} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-black/60" />
          </div>
          <button
            type="button"
            aria-label={`Sort direction: ${directionLabel}`}
            onClick={() => changeSort({ key: sort.key, dir: sort.dir === 1 ? -1 : 1 })}
            className={`grid h-9 w-9 place-items-center rounded-full bg-black/[0.05] text-black transition-colors hover:bg-black/[0.08] ${FOCUS}`}
          >
            {sort.dir === 1 ? <ArrowUp weight="light" size={14} /> : <ArrowDown weight="light" size={14} />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-stretch gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-1">
          <ul aria-label="Team members" className="flex flex-col gap-1">
            {sorted.map((item) => {
              const isSelected = item.key === selected?.key;
              const cancelled = item.yield.cancelled;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    data-testid={`staff-performance-row-${item.key}`}
                    aria-current={isSelected ? "true" : undefined}
                    onClick={() => select(item.key)}
                    className={`flex w-full flex-col gap-2 rounded-[14px] border px-3.5 py-3 text-left transition-colors ${FOCUS} ${isSelected ? "border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]" : "border-transparent hover:bg-black/[0.03]"}`}
                  >
                    <span className="flex w-full min-w-0 items-start gap-2">
                      <RankBadge rank={rank.get(item.key) ?? 0} size="sm" />
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="min-w-0 max-w-full truncate text-[15px] font-semibold text-black" title={item.name}>{item.name}</span>
                        {!item.isActive && <span className="whitespace-nowrap text-[11px] text-black/45">· Former staff</span>}
                        {item.flags.cancelRate === "worse" && <span className={`whitespace-nowrap rounded-full bg-[#B4473A]/10 px-1.5 py-0.5 text-[10px] font-medium ${RED}`}>High cancels</span>}
                      </span>
                      <span className="shrink-0 text-[15px] font-medium tabular-nums text-black">{formatTaka(item.value)}</span>
                    </span>
                    <OutcomeBar item={item} height="h-1.5" label={outcomeSummary(item)} />
                    <span className="text-[12px] tabular-nums text-black/55">
                      {`${formatNumber(item.confirmed)} of ${formatNumber(item.handled)} confirmed${cancelled > 0 ? ` · ${formatNumber(cancelled)} cancelled` : ""}`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {noOrders.length > 0 && (
            <div data-testid="staff-performance-no-orders" className="flex flex-col gap-1 px-3.5 pt-2">
              <button
                type="button"
                aria-expanded={noOrdersOpen}
                aria-controls="staff-performance-no-orders-list"
                onClick={() => setNoOrdersOpen((open) => !open)}
                className={`flex w-full items-start gap-2 rounded-lg py-1 text-left text-[12px] ${FOCUS}`}
              >
                <CaretDown aria-hidden="true" weight="light" size={14} className={`mt-0.5 shrink-0 transition-transform motion-reduce:transition-none ${noOrdersOpen ? "rotate-180" : ""}`} />
                <span className="flex flex-col">
                  <span className="text-black/60">{`${plural(noOrders.length, "member", "members")} had no orders`}</span>
                  <span className="text-black/45">{preview}</span>
                </span>
              </button>
              <ul id="staff-performance-no-orders-list" hidden={!noOrdersOpen} className={`${noOrdersOpen ? "flex" : "hidden"} flex-col gap-1 pb-1 pl-[22px] text-[12px] text-black/70`}>
                {noOrders.map((item) => (
                  <li key={item.key}>
                    {item.name}
                    {!item.isActive && <span className="ml-1 text-black/45">· Former staff</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex-1" />
          <div data-testid="staff-performance-team-total" className={`${CARD} mt-3 flex flex-col gap-2 tabular-nums`}>
            <div className="flex items-baseline justify-between gap-2">
              <p className={EYEBROW}>Team total</p>
              <p className="text-[12px] text-black/55">{`${formatNumber(shownRows.length)} of ${formatNumber(tableRows.length)} members`}</p>
            </div>
            <p className="text-[34px] font-light leading-none tracking-[-0.03em] text-black">{formatTaka(team.value)}</p>
            <p className="text-[12px] text-black/55">{`${formatNumber(team.confirmed)} of ${formatNumber(team.handled)} handled orders confirmed`}</p>
            <div className="mt-1 grid grid-cols-3 gap-2 border-t border-black/[0.08] pt-3">
              <div className="flex flex-col gap-0.5">
                <p className="text-[11px] text-black/55">Confirmation</p>
                <p className="text-[15px] text-black">{formatPct(averages.confRate)}</p>
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-[11px] text-black/55">Cancel rate</p>
                <p className="text-[15px] text-black">{formatPct(averages.cancelRate)}</p>
              </div>
              <div className="flex flex-col gap-0.5">
                <p className="text-[11px] text-black/55">Needs attention</p>
                <p className={`text-[15px] ${needsAttention > 0 ? RED : "text-black"}`}>{needsAttention > 0 ? plural(needsAttention, "person", "people") : "None"}</p>
              </div>
            </div>
          </div>
        </div>

        <div ref={profileRef} data-testid="staff-performance-profile" className="min-w-0 scroll-mt-4 lg:sticky lg:top-4 lg:self-start">
          {selected && (
            <motion.section
              key={selected.key}
              ref={sectionRef}
              tabIndex={-1}
              aria-label={`${selected.name} details`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col gap-3.5 focus-visible:outline-none"
            >
              <Profile item={selected} rank={rank.get(selected.key) ?? 0} shownCount={shownRows.length} teamValue={team.value} teamAov={teamAov} averages={averages} />
            </motion.section>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[11px] text-black/60">
        <span><span className={`font-medium ${RED}`}>Red</span> = more than 5 pts worse than the team average</span>
        <span><span className="font-medium text-[#2F7A55]">Green</span> = best on the team</span>
      </div>
      <div className="flex flex-wrap justify-between gap-2 text-[10px] text-black/45">
        <span>Conf. rate = confirmed ÷ handled · Delivered = delivered ÷ confirmed · Handled = orders confirmed or cancelled (each order counted once, by the member's last action)</span>
        <span>Outcome mix covers each member's handled orders</span>
      </div>
    </section>
  );
}
