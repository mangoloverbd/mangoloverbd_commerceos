import { useId, useMemo, useState, type ReactNode } from "react";
import { EChart } from "@/components/business-report/EChart";
import { cn } from "@/lib/utils";
import {
  COVER_OPTIONS, RESTOCK_STATUS, VERDICTS, WEEKDAYS, describeAction, formatDay, suggestedOrder,
  type CoverDays, type StockForecastResponse,
} from "@/lib/stockForecast";
import { forecastOption, profitOption, type ForecastMetric } from "@/lib/stockForecastCharts";

const EYEBROW = "text-[8px] font-medium uppercase tracking-[0.3em] text-black";
const TH = "px-3 py-1 text-[8px] font-medium uppercase tracking-[0.3em] text-black whitespace-nowrap";
const TONE_CHIP = {
  bad: "bg-[#D9483B]/10 text-[#B4473A]",
  warn: "bg-[#E0A21B]/15 text-[#8A5F05]",
  good: "bg-[#1F9D63]/10 text-[#2F7A55]",
  mango: "bg-[#F28C28]/15 text-[#9A4A06]",
  muted: "bg-black/[0.05] text-black/60",
} as const;
const STATUS_BAR = { urgent: "#D9483B", soon: "#E0A21B", ok: "#1F9D63", over: "#F28C28", no_sales: "#F28C28", empty: "rgba(11,11,10,0.2)" } as const;

const units = (value: number) => Math.round(value).toLocaleString("en-BD");
const taka = (value: number) => `৳${Math.round(value).toLocaleString("en-BD")}`;
const pct = (value: number | null) => (value === null ? "—" : `${value.toLocaleString("en-BD")}%`);

function Panel({ eyebrow, title, aside, children, className = "" }: { eyebrow: string; title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={cn("flex min-w-0 flex-col gap-3 rounded-2xl bg-black/[0.04] px-4 py-4 sm:px-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={EYEBROW}>{eyebrow}</p>
          <h2 id={headingId} className="mt-1 font-sf-display text-[15px] font-semibold text-black">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Chip({ tone, children }: { tone: keyof typeof TONE_CHIP; children: ReactNode }) {
  return <span className={cn("inline-flex h-5 items-center whitespace-nowrap rounded-md px-1.5 text-[11px] font-medium", TONE_CHIP[tone])}>{children}</span>;
}

function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ id: T; label: string }>; onChange: (next: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex gap-0.5 rounded-[10px] bg-black/[0.07] p-[3px]">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn("rounded-lg px-2.5 py-1 text-[12px] transition-colors duration-150", value === option.id ? "bg-white text-black shadow-[0_1px_2px_rgba(11,11,10,0.08)]" : "text-black/60 hover:text-black")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Tile({ label, value, range, note, alert = false }: { label: string; value: string; range: string; note: string; alert?: boolean }) {
  return (
    <div className={cn("flex min-h-[112px] min-w-0 flex-col gap-0.5 rounded-2xl px-4 py-3 sm:px-5", alert ? "bg-[#D9483B]/10" : "bg-black/[0.04]")}>
      <p className={EYEBROW}>{label}</p>
      <p className={cn("mt-1 truncate text-2xl font-light tabular-nums tracking-[-0.04em]", alert ? "text-[#B4473A]" : "text-black")}>{value}</p>
      <p className="text-[13px] tabular-nums text-black/45">{range}</p>
      <p className="mt-auto pt-1 text-[11px] text-black/60">{note}</p>
    </div>
  );
}

function Meter({ value, average, max, low }: { value: number | null; average: number | null; max: number; low: boolean }) {
  if (value === null) return <span className="text-black/35">—</span>;
  return (
    <div className="grid min-w-[170px] grid-cols-[minmax(110px,1fr)_52px] items-center gap-2.5">
      <span className="relative h-2 rounded bg-black/[0.07]">
        <i className={cn("absolute inset-y-0 left-0 rounded", low ? "bg-[#D9483B]" : "bg-black")} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
        {average !== null && <b aria-hidden="true" className="absolute -bottom-1 -top-1 w-0.5 rounded-sm bg-[#F28C28]" style={{ left: `calc(${Math.min(100, (average / max) * 100)}% - 1px)` }} />}
      </span>
      <span className="tabular-nums">{pct(value)}</span>
    </div>
  );
}

const RHYTHM_ORDER = [6, 0, 1, 2, 3, 4, 5]; // Saturday first, as the Bangladeshi week starts
const RHYTHM_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function rhythmColor(value: number, max: number): [string, string] {
  const share = max > 0 ? value / max : 0;
  if (share > 0.85) return ["#C4560A", "#FFFFFF"];
  if (share > 0.65) return ["#F08A1C", "#FFFFFF"];
  if (share > 0.45) return ["rgba(242,140,40,0.42)", "#0B0B0A"];
  return ["rgba(242,140,40,0.16)", "#0B0B0A"];
}

export function StockForecastTab({ data, reduceMotion }: { data: StockForecastResponse; reduceMotion: boolean | null }) {
  const [metric, setMetric] = useState<ForecastMetric>("orders");
  const [cover, setCover] = useState<CoverDays>(21);
  const { summary, forecast, settings } = data;
  const forecastChart = useMemo(() => forecastOption(forecast.history, forecast.future, metric, forecast.value_per_order), [forecast, metric]);
  const profitChart = useMemo(() => profitOption(data.profit), [data.profit]);
  const rhythmMax = Math.max(0, ...data.rhythm.values.flat());
  let busiestSlot: { day: number; slot: number } | null = null;
  for (let day = 0; day < data.rhythm.values.length; day++) {
    for (let slot = 0; slot < data.rhythm.values[day].length; slot++) {
      const value = data.rhythm.values[day][slot];
      if (value > 0 && (!busiestSlot || value > data.rhythm.values[busiestSlot.day][busiestSlot.slot])) busiestSlot = { day, slot };
    }
  }
  const restockRows = data.restock.filter((row) => row.status !== "empty");
  const healthAverages = data.health_averages;
  const busiestDay = WEEKDAYS[summary.busiest_weekday];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Next 30 days · delivered"
          value={summary.next30_delivered_value === null ? "—" : taka(summary.next30_delivered_value)}
          range={summary.next30_delivered_low === null ? "Needs 2 weeks of finished orders" : `likely ${taka(summary.next30_delivered_low)} – ${taka(summary.next30_delivered_high ?? 0)}`}
          note={summary.delivered_rate === null ? "Delivered value only, after cancels and returns" : `Delivered value only · ${pct(summary.delivered_rate)} of orders get delivered`}
        />
        <Tile
          label="Next 7 days · orders"
          value={units(summary.next7_orders)}
          range={`likely ${units(summary.next7_low)} – ${units(summary.next7_high)}`}
          note={summary.busiest_lift_pct && summary.busiest_lift_pct > 0 ? `${busiestDay} is your busiest day (+${summary.busiest_lift_pct}%)` : "Orders excluding cancelled"}
        />
        <Tile
          label="Restock now"
          value={summary.restock_now === 1 ? "1 product" : `${summary.restock_now} products`}
          range={summary.first_runs_out ? `${summary.first_runs_out.name} runs out ${formatDay(summary.first_runs_out.runs_out)}` : "Nothing runs out this week"}
          note={summary.first_runs_out ? `Order by ${formatDay(summary.first_runs_out.order_by)} (${settings.lead_days}-day supplier lead)` : "Based on the last 14 days of sales"}
          alert={summary.restock_now > 0}
        />
        <Tile
          label="Slow stock"
          value={summary.slow_products === 1 ? "1 product" : `${summary.slow_products} products`}
          range={summary.slow_with_cost > 0 ? `${taka(summary.slow_stock_value)} tied up at cost price` : "Cover 60+ days or not selling"}
          note={summary.slow_with_cost < summary.slow_products ? `Cost price known for ${summary.slow_with_cost} of ${summary.slow_products}` : "Stock × cost price"}
        />
      </div>

      <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
        <Panel
          eyebrow="Forecast"
          title="Orders: last 8 weeks and next 30 days"
          aside={<Segmented<ForecastMetric> label="Forecast metric" value={metric} onChange={setMetric} options={[{ id: "orders", label: "Orders" }, ...(forecast.value_per_order ? [{ id: "money" as const, label: "Delivered ৳" }] : [])]} />}
        >
          <EChart option={forecastChart} ariaLabel="Daily orders for the last 8 weeks, then a 30-day forecast with a likely range" className="h-[280px] w-full xl:h-auto xl:min-h-[300px] xl:flex-1" animate={!reduceMotion} />
          <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11px] text-black/60">
            <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-[3px] bg-black/80" />Actual</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-[3px] bg-[#F28C28]" />Forecast</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-[3px] bg-[#F28C28]/20" />Likely range</span>
          </div>
          <p className="text-[11px] leading-relaxed text-black/55">
            Orders excluding cancelled. Forecast = average of the same weekday over the last 8 weeks, adjusted by the last 4 weeks' trend ({forecast.trend >= 1 ? "+" : "−"}{Math.abs(Math.round((forecast.trend - 1) * 100))}%). Delivered ৳ multiplies by how often orders get delivered and their average value.
          </p>
        </Panel>

        <Panel eyebrow="This week" title="Do these first" aside={<Chip tone="muted">{data.actions.length} {data.actions.length === 1 ? "action" : "actions"}</Chip>}>
          {data.actions.length ? (
            <ul className="flex flex-col gap-2">
              {data.actions.map((action, index) => {
                const text = describeAction(action);
                return (
                  <li key={index} className="grid gap-1.5 rounded-xl bg-white px-3 py-2.5 text-[12px] text-black/60 sm:grid-cols-[76px_minmax(0,1fr)] sm:gap-2.5">
                    <span><Chip tone={text.tone}>{text.tag}</Chip></span>
                    <span>
                      <b className="block text-[13px] font-semibold text-black">{text.title}</b>
                      {text.detail}
                      <span className="mt-1 block font-mono text-[10px] text-black/40">{text.rule}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : <p className="py-10 text-center text-[12px] text-black/55">Nothing needs attention this week.</p>}
        </Panel>
      </div>

      <Panel
        eyebrow="Restock planner"
        title="How much to order, and by when"
        aside={<Segmented<CoverDays> label="Order enough for" value={cover} onChange={setCover} options={COVER_OPTIONS.map((days) => ({ id: days, label: `Cover ${days} days` }))} />}
      >
        <div className="relative -mx-1.5 overflow-x-auto">
          <table className="w-full min-w-[900px] border-separate border-spacing-y-1 text-[13px]">
            <caption className="sr-only">Stock, selling speed, days left and suggested order for each product</caption>
            <thead>
              <tr className="text-left">
                <th className={TH}>Product</th><th className={cn(TH, "text-right")}>In stock</th><th className={cn(TH, "text-right")}>Sold per day</th><th className={TH}>Days left</th>
                <th className={TH}>Runs out</th><th className={cn(TH, "text-right")}>Suggested order</th><th className={TH}>Order by</th><th className={TH}>Status</th>
              </tr>
            </thead>
            <tbody>
              {restockRows.map((row) => {
                const order = suggestedOrder(row, cover, settings.safety_days, settings.lead_days);
                const status = RESTOCK_STATUS[row.status];
                const later = row.days_left === null || row.days_left > 60;
                return (
                  <tr key={row.product_id} className="bg-white">
                    <td className="rounded-l-xl px-3 py-2.5 font-medium">{row.name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{units(row.stock)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {row.sold_per_day.toLocaleString("en-BD", { maximumFractionDigits: 1 })}
                      {row.change_pct !== null && row.change_pct !== 0 && (
                        <span className={cn("block text-[11px]", row.change_pct > 0 ? "text-[#2F7A55]" : "text-[#B4473A]")}>{row.change_pct > 0 ? "▲" : "▼"} {Math.abs(row.change_pct)}% vs 30 days</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {row.days_left === null ? <span className="text-black/35">No sales</span> : (
                        <div className="grid min-w-[150px] grid-cols-[minmax(90px,1fr)_44px] items-center gap-2 tabular-nums">
                          <span className="h-2 overflow-hidden rounded bg-black/[0.07]"><i className="block h-full rounded" style={{ width: `${Math.min(100, (row.days_left / 60) * 100)}%`, background: STATUS_BAR[row.status] }} /></span>
                          <span>{Math.round(row.days_left)} d</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{later ? <span className="text-black/40">{row.days_left === null ? "—" : "after 60 days"}</span> : formatDay(row.runs_out)}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">{order ? units(order) : <span className="font-normal text-black/40">None</span>}</td>
                    <td className="px-3 py-2.5 tabular-nums">{order && row.days_left !== null && row.days_left <= 30 ? formatDay(row.order_by) : <span className="text-black/40">—</span>}</td>
                    <td className="rounded-r-xl px-3 py-2.5"><Chip tone={status.tone}>{status.label}</Chip></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] leading-relaxed text-black/55">
          Units are packs as sold (all sizes together). Sold per day uses the last 14 days of orders, excluding cancelled. Suggested order covers the chosen days plus {settings.safety_days} days of safety stock and {settings.lead_days} days of supplier lead time, minus what you have.
        </p>
      </Panel>

      <Panel
        eyebrow="Product health"
        title="Who orders it, and does it get delivered?"
        aside={<div className="flex flex-wrap gap-x-3.5 text-[11px] text-black/60"><span className="inline-flex items-center gap-1.5"><i className="h-2 w-2 rounded-[3px] bg-black" />This product</span><span className="inline-flex items-center gap-1.5"><i className="h-3 w-0.5 rounded-sm bg-[#F28C28]" />Shop average</span></div>}
      >
        {data.health.length ? (
          <div className="relative -mx-1.5 overflow-x-auto">
            <table className="w-full min-w-[860px] border-separate border-spacing-y-1 text-[13px]">
              <caption className="sr-only">Views, order rate, delivered rate and return rate for each product, with a verdict</caption>
              <thead>
                <tr className="text-left">
                  <th className={TH}>Product</th><th className={cn(TH, "text-right")}>Views</th><th className={TH}>Viewers who order</th>
                  <th className={TH}>Orders delivered</th><th className={cn(TH, "text-right")}>Returned</th><th className={TH}>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {data.health.map((row) => {
                  const verdict = VERDICTS[row.verdict];
                  const highReturns = row.returned_rate !== null && healthAverages.returned_rate !== null && row.returned_rate >= Math.max(10, healthAverages.returned_rate * 2);
                  return (
                    <tr key={row.product_id} className="bg-white">
                      <td className="rounded-l-xl px-3 py-2.5 font-medium">{row.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{row.views === null ? <span className="text-black/35">—</span> : units(row.views)}</td>
                      <td className="px-3 py-2.5"><Meter value={row.order_rate} average={healthAverages.order_rate} max={Math.max(4, (healthAverages.order_rate ?? 0) * 2)} low={row.verdict === "fix_page"} /></td>
                      <td className="px-3 py-2.5"><Meter value={row.delivered_rate} average={healthAverages.delivered_rate} max={100} low={row.verdict === "check_delivery"} /></td>
                      <td className={cn("px-3 py-2.5 text-right tabular-nums", highReturns && "font-medium text-[#B4473A]")}>{pct(row.returned_rate)}</td>
                      <td className="rounded-r-xl px-3 py-2.5"><Chip tone={verdict.tone}>{verdict.label}</Chip></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="py-10 text-center text-[12px] text-black/55">No product orders in the last 30 days.</p>}
        <p className="text-[11px] leading-relaxed text-black/55">Last 30 days. Viewers who order uses product page visits recorded on the website; delivered and returned use courier results once at least 5 orders have finished.</p>
      </Panel>

      <div className="grid items-stretch gap-3 xl:grid-cols-2">
        <Panel eyebrow="Profit" title="What each product really earns (last 30 days)">
          {data.profit.length
            ? <EChart option={profitChart} ariaLabel="Delivered revenue minus cost price and courier fees, by product" className="h-[280px] w-full xl:h-auto xl:min-h-[260px] xl:flex-1" animate={!reduceMotion} />
            : <p className="py-10 text-center text-[12px] text-black/55">No delivered orders in the last 30 days.</p>}
          <p className="text-[11px] leading-relaxed text-black/55">
            Delivered revenue − cost price − courier fees, including fees for returned parcels.{summary.missing_cost_products > 0 && ` Grey bars have no cost price yet (${summary.missing_cost_products} ${summary.missing_cost_products === 1 ? "product" : "products"}); add it in the Cost column on the Products page.`}
          </p>
        </Panel>
        <Panel
          eyebrow="Weekly rhythm"
          title="When orders come in"
          aside={busiestSlot && <Chip tone="muted">Best: {WEEKDAYS[busiestSlot.day]} {data.rhythm.slots[busiestSlot.slot].label.toLowerCase()}</Chip>}
        >
          <div role="table" aria-label="Average orders by day of week and time of day" className="grid grid-cols-[40px_repeat(4,minmax(0,1fr))_44px] gap-1 text-[12px] tabular-nums sm:grid-cols-[44px_repeat(4,minmax(0,1fr))_56px]">
            <div role="row" className="contents">
              <span role="columnheader" />
              {data.rhythm.slots.map((slot) => <span key={slot.id} role="columnheader" aria-label={slot.label} className={cn(EYEBROW, "px-0.5 pb-1 tracking-[0.2em] sm:tracking-[0.3em]")}><span className="sm:hidden">{slot.label.slice(0, 3)}</span><span className="hidden sm:inline">{slot.label}</span></span>)}
              <span role="columnheader" className={cn(EYEBROW, "pb-1 text-right tracking-[0.2em] sm:tracking-[0.3em]")}>Day</span>
            </div>
            {RHYTHM_ORDER.map((day) => {
              const row = data.rhythm.values[day];
              return (
                <div key={day} role="row" className="contents">
                  <span role="rowheader" className="flex items-center text-black/60">{RHYTHM_SHORT[day]}</span>
                  {row.map((value, slot) => {
                    const [background, color] = rhythmColor(value, rhythmMax);
                    const best = busiestSlot?.day === day && busiestSlot.slot === slot;
                    return (
                      <span key={slot} role="cell" title={`${WEEKDAYS[day]} ${data.rhythm.slots[slot].label.toLowerCase()}: ${value} orders on average`}
                        className={cn("flex h-[34px] items-center justify-center rounded-lg font-medium", best && "shadow-[inset_0_0_0_2px_#0B0B0A]")} style={{ background, color }}>
                        {value.toFixed(1)}
                      </span>
                    );
                  })}
                  <span role="cell" className="flex items-center justify-end text-black/60">{Math.round(row.reduce((a, b) => a + b, 0))}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] leading-relaxed text-black/55">Average orders per slot over the last {data.rhythm.weeks} weeks, Dhaka time (morning 6–12, afternoon 12–5, evening 5–10, night 10–6). Use it to time ad pushes and staff the inbox.</p>
        </Panel>
      </div>
    </div>
  );
}
