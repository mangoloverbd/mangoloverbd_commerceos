import { useId, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { EChart } from "@/components/business-report/EChart";
import { CHART, OUTCOME_COLORS, categoricalColor } from "@/components/business-report/chartTheme";
import { FunnelChart, type FunnelStage } from "@/components/ui/funnel-chart";
import { useIsMobile } from "@/hooks/use-mobile";
import { sparklineOption } from "@/lib/businessReportCharts";
import { cn } from "@/lib/utils";
import {
  acquisitionTotals, biggestDrop, formatDuration, formatNumber, formatPct, formatTaka, funnelSteps, hourLabel, peakHour,
  healthSummary, percentDelta, pointsDelta, rate, sourceLabel, sourcePerformance, timeAgo,
  type AcquisitionRow, type AttributionModel, type Delta, type WebsiteAnalyticsResponse,
} from "@/lib/websiteAnalytics";
import {
  deliveredBySourceOption, deliveredRingsOption, deviceConversionOption, groupSlices, productLeaderboardOption, productName,
  rhythmOption, sessionDonutOption, sourceOutcomeSankeyOption, trafficOption, type TrafficMetric,
} from "@/lib/websiteAnalyticsCharts";

type TabProps = { data: WebsiteAnalyticsResponse; reduceMotion: boolean | null };

const TONE_CLASS: Record<Delta["tone"], string> = { good: "text-[#2F7A55]", bad: "text-[#B4473A]", neutral: "text-black/55" };
const EYEBROW = "text-[8px] font-medium uppercase tracking-[0.3em] text-black";

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

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-[12px] text-black/55">{children}</p>;
}

function Tile({ label, value, description, delta, spark, delay, reduceMotion }: {
  label: string; value: string; description: string; delta: Delta | null; spark?: number[]; delay: number; reduceMotion: boolean | null;
}) {
  const option = useMemo(() => sparklineOption(spark ?? []), [spark]);
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : delay, duration: 0.35 }}
      className="flex min-h-[112px] min-w-0 flex-col rounded-2xl bg-black/[0.04] px-4 pb-2 pt-3 sm:px-5"
    >
      <p className={EYEBROW}>{label}</p>
      <p className="mt-1 truncate text-2xl font-light tabular-nums tracking-[-0.04em] text-black">{value}</p>
      <p className="mt-0.5 text-[11px] text-black/60">
        {description}
        {delta && <span className={`ml-1.5 font-medium tabular-nums ${TONE_CLASS[delta.tone]}`}>{delta.text}</span>}
      </p>
      {spark && spark.length > 1 && <EChart option={option} ariaLabel={`${label} trend`} className="mt-auto h-[30px] w-full" animate={!reduceMotion} />}
    </motion.div>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ id: T; label: string }>; onChange: (next: T) => void }) {
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

function SourceDot({ index }: { index: number }) {
  return <span aria-hidden="true" className="mr-2 inline-block h-[7px] w-[7px] rounded-full align-[1px]" style={{ background: categoricalColor(index) }} />;
}

function funnelStages(data: WebsiteAnalyticsResponse): FunnelStage[] {
  return funnelSteps(data.current.totals).map((step) => ({
    label: step.label,
    value: step.value,
    displayValue: formatNumber(step.value),
    color: step.key === "delivered" ? OUTCOME_COLORS.approved : CHART.ink,
  }));
}

// Horizontal on wider screens; vertical on phones so six stage labels never collide.
function WebsiteFunnel({ data, wide = false }: { data: WebsiteAnalyticsResponse; wide?: boolean }) {
  const isMobile = useIsMobile();
  return (
    <div className="rounded-2xl px-1 py-2">
      <FunnelChart
        data={funnelStages(data)}
        layers={3}
        gap={6}
        orientation={isMobile ? "vertical" : "horizontal"}
        className={isMobile ? "aspect-[1/1.2]" : wide ? "aspect-[2.2/1] lg:aspect-[3.4/1]" : "aspect-[2.2/1]"}
        style={{ aspectRatio: undefined }}
      />
    </div>
  );
}

function NoVisits() {
  return (
    <div className="rounded-2xl bg-black/[0.04] px-6 py-12 text-center">
      <p className="text-sm font-medium text-black">No website visits in this range yet</p>
      <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-black/55">Visits are recorded from 3 October 2026, when first-party collection started. Pick a recent range, or check Data health if this looks wrong.</p>
    </div>
  );
}

export function OverviewTab({ data, reduceMotion, onOpenFunnel }: TabProps & { onOpenFunnel: () => void }) {
  const [metric, setMetric] = useState<TrafficMetric>("visitors");
  const { current, previous } = data;
  const totals = current.totals;
  const prev = previous?.totals;
  const traffic = useMemo(() => trafficOption(current.daily, previous?.daily ?? null, metric), [current.daily, previous?.daily, metric]);
  const rhythm = useMemo(() => rhythmOption(current.hourly), [current.hourly]);
  const peak = peakHour(current.hourly);
  const slices = useMemo(() => groupSlices(current.sources.map((row) => ({ label: sourceLabel(row.source, row.medium), value: row.sessions }))), [current.sources]);
  const donut = useMemo(() => sessionDonutOption(slices), [slices]);
  const delivered = acquisitionTotals(current.acquisition.last);
  const previousDelivered = previous ? acquisitionTotals(previous.acquisition.last) : null;
  const conversion = rate(totals.ordered_sessions, totals.sessions);

  if (totals.sessions === 0) return <NoVisits />;
  const tiles = [
    { label: "Visitors", value: formatNumber(totals.visitors), description: `${formatNumber(totals.new_visitors)} new`, delta: percentDelta(totals.visitors, prev?.visitors), spark: current.daily.map((row) => row.visitors) },
    { label: "Visits", value: formatNumber(totals.sessions), description: `${(totals.pageviews / Math.max(totals.sessions, 1)).toFixed(1)} pages each`, delta: percentDelta(totals.sessions, prev?.sessions), spark: current.daily.map((row) => row.sessions) },
    { label: "Conversion", value: formatPct(conversion), description: "Visits with an order", delta: pointsDelta(conversion, prev ? rate(prev.ordered_sessions, prev.sessions) : undefined, prev?.sessions), spark: current.daily.map((row) => rate(row.ordered_sessions, row.sessions)) },
    { label: "Orders", value: formatNumber(totals.orders), description: "From these visits", delta: percentDelta(totals.orders, prev?.orders), spark: current.daily.map((row) => row.ordered_sessions) },
    { label: "Delivered revenue", value: formatTaka(delivered.delivered_value), description: `${formatNumber(delivered.delivered)} delivered orders`, delta: percentDelta(delivered.delivered_value, previousDelivered?.delivered_value) },
    { label: "Time on site", value: formatDuration(totals.engaged_seconds / Math.max(totals.sessions, 1)), description: `${formatPct(rate(totals.bounced_sessions, totals.sessions))} left after one page`, delta: null },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        {tiles.map((tile, index) => <Tile key={tile.label} {...tile} delay={0.02 + index * 0.04} reduceMotion={reduceMotion} />)}
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel
          eyebrow="Traffic"
          title={metric === "visitors" ? "Visitors by day" : "Visits with an order by day"}
          aside={<Segmented<TrafficMetric> label="Metric" value={metric} onChange={setMetric} options={[{ id: "visitors", label: "Visitors" }, { id: "orders", label: "Orders" }]} />}
        >
          <EChart option={traffic} ariaLabel="Daily traffic with the previous period as a dashed line" className="h-[260px] w-full" animate={!reduceMotion} />
          <p className="text-[11px] text-black/55">Dashed line: previous period. The busiest day is orange.</p>
        </Panel>
        <Panel eyebrow="Visit rhythm" title="When people visit" aside={peak && <span className="rounded-md bg-black/[0.05] px-2 py-0.5 text-[11px] tabular-nums text-black/70">Peak {hourLabel(peak.hour)}</span>}>
          <EChart option={rhythm.option} ariaLabel={peak ? `Visits by hour of day, peak at ${hourLabel(peak.hour)}` : "Visits by hour of day"} className="h-[220px] w-full" animate={!reduceMotion} />
          <p className="text-[11px] text-black/55">Dhaka time. Each square is {formatNumber(rhythm.visitsPerCell)} {rhythm.visitsPerCell === 1 ? "visit" : "visits"}.</p>
        </Panel>
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Panel eyebrow="Source mix" title="Where visitors come from">
          <EChart option={donut} ariaLabel="Visits by source" className="h-[180px] w-full" animate={!reduceMotion} />
          <ul className="grid gap-1.5">
            {slices.map((slice, index) => (
              <li key={slice.label} className="grid grid-cols-[10px_minmax(0,1fr)_auto_auto] items-center gap-2 text-[12px]">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: categoricalColor(index) }} />
                <span className="truncate">{slice.label}</span>
                <span className="tabular-nums">{formatNumber(slice.value)}</span>
                <span className="min-w-[36px] text-right tabular-nums text-black/45">{Math.round(rate(slice.value, totals.sessions))}%</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel eyebrow="Funnel" title="From visit to delivered" aside={<button type="button" onClick={onOpenFunnel} className="rounded-md bg-black/[0.05] px-2 py-0.5 text-[11px] text-black/70 hover:text-black">Open funnel →</button>}>
          <WebsiteFunnel data={data} />
        </Panel>
      </div>
    </div>
  );
}

function OutcomeBar({ row }: { row: AcquisitionRow }) {
  const parts = [
    { value: row.delivered + row.partial_delivered, color: OUTCOME_COLORS.approved },
    { value: row.active, color: OUTCOME_COLORS.pending },
    { value: row.cancelled, color: OUTCOME_COLORS.cancelled },
    { value: row.returned, color: OUTCOME_COLORS.returned },
  ];
  return (
    <div className="min-w-[140px]">
      <div className="flex h-2 gap-0.5 overflow-hidden rounded bg-black/[0.04]" aria-hidden="true">
        {parts.map((part, index) => part.value > 0 && <i key={index} className="block h-full" style={{ width: `${rate(part.value, row.orders)}%`, background: part.color }} />)}
      </div>
      <span className="mt-1 block text-[11px] tabular-nums text-black/45">{formatPct(rate(row.delivered, row.orders))} delivered · {formatNumber(row.cancelled + row.returned)} lost</span>
    </div>
  );
}

const TH = "px-3 py-1 text-[8px] font-medium uppercase tracking-[0.3em] text-black whitespace-nowrap";

export function AcquisitionTab({ data, reduceMotion }: TabProps) {
  const [model, setModel] = useState<AttributionModel>("last");
  const rows = data.current.acquisition[model];
  const revenue = useMemo(() => deliveredBySourceOption(rows), [rows]);
  const sankey = useMemo(() => sourceOutcomeSankeyOption(rows), [rows]);
  const { sources, acquisition } = data.current;
  const performance = useMemo(() => sourcePerformance(sources, acquisition.last), [sources, acquisition.last]);
  const perVisit = (row: (typeof performance)[number]) => (row.economics && row.sessions ? row.economics.delivered_value / row.sessions : 0);
  const best = performance.filter((row) => row.sessions >= 20 && perVisit(row) > 0).sort((a, b) => perVisit(b) - perVisit(a))[0];
  const campaigns = data.current.acquisition.campaigns;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Panel
          eyebrow="Delivered revenue"
          title="By source"
          aside={<Segmented<AttributionModel> label="Attribution" value={model} onChange={setModel} options={[{ id: "last", label: "Last non-direct" }, { id: "first", label: "First visit" }]} />}
        >
          {rows.length ? <EChart option={revenue} ariaLabel="Delivered revenue by source" className="h-[240px] w-full" animate={!reduceMotion} /> : <Empty>No website orders were linked to a visit in this range.</Empty>}
          <p className="text-[11px] leading-relaxed text-black/55">
            {model === "last"
              ? "Each order counts once, for the last source that wasn't a direct visit within 30 days."
              : "Each order counts once, for the first visit within 30 days: what started the journey."}
            {" "}Orders placed in these dates; delivered value excludes delivery charges.
          </p>
        </Panel>
        <Panel eyebrow="Outcomes" title="Where each source's orders end up">
          {rows.length ? <EChart option={sankey} ariaLabel="Orders flowing from each source to delivered, in progress, cancelled and returned" className="h-[280px] w-full" animate={!reduceMotion} /> : <Empty>Outcomes appear once orders are linked to visits.</Empty>}
        </Panel>
      </div>
      <Panel eyebrow="Sources" title="Performance by source" aside={<span className="text-[11px] text-black/55">Ad spend and return on ad spend come in Release 2</span>}>
        <div className="relative -mx-1.5 overflow-x-auto">
          <table className="w-full min-w-[820px] border-separate border-spacing-y-1 text-[13px]">
            <caption className="sr-only">Visits, conversion and delivered revenue by source</caption>
            <thead>
              <tr className="text-left">
                <th className={TH}>Source</th><th className={cn(TH, "text-right")}>Visits</th><th className={cn(TH, "text-right")}>Conversion</th>
                <th className={cn(TH, "text-right")}>Orders</th><th className={TH}>Outcomes</th><th className={cn(TH, "text-right")}>Delivered ৳</th><th className={cn(TH, "text-right")}>৳ / visit</th>
              </tr>
            </thead>
            <tbody>
              {performance.map((row, index) => {
                const economics = row.economics;
                return (
                  <tr key={`${row.source}-${row.medium}`} className="bg-white">
                    <td className="rounded-l-xl px-3 py-2.5">
                      <SourceDot index={index} />
                      <span className="font-medium">{sourceLabel(row.source, row.medium)}</span>
                      {row === best && <span className="ml-2 rounded-md bg-[#F28C28]/15 px-1.5 py-0.5 text-[11px] font-medium text-[#9A4A06]">Best ৳ / visit</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(row.sessions)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.sessions ? formatPct(rate(row.ordered_sessions, row.sessions)) : "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(economics?.orders ?? 0)}</td>
                    <td className="px-3 py-2.5">{economics?.orders ? <OutcomeBar row={economics} /> : <span className="text-black/35">—</span>}</td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">{economics ? formatTaka(economics.delivered_value) : "—"}</td>
                    <td className="rounded-r-xl px-3 py-2.5 text-right tabular-nums">{economics && row.sessions ? formatTaka(economics.delivered_value / row.sessions) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-black/55">Visits and conversion use the source a visit started from. Orders and revenue use last non-direct credit.</p>
      </Panel>
      {campaigns.length > 0 && (
        <Panel eyebrow="Campaigns" title="Campaign links and UTM campaigns">
          <ul className="grid gap-1.5">
            {campaigns.map((row) => (
              <li key={row.campaign} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 rounded-xl bg-white px-3 py-2.5 text-[13px]">
                <span className="truncate font-mono text-[12px]">{row.campaign}</span>
                <span className="tabular-nums text-black/60">{formatNumber(row.orders)} orders · {formatNumber(row.delivered)} delivered</span>
                <span className="font-medium tabular-nums">{formatTaka(row.delivered_value)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

export function ProductsTab({ data, reduceMotion }: TabProps) {
  const { products, entry_pages: entryPages, pages } = data.current;
  const leaderboard = useMemo(() => productLeaderboardOption(products), [products]);
  const rings = useMemo(() => deliveredRingsOption(products), [products]);
  const ringProducts = [...products].filter((row) => row.delivered > 0).sort((a, b) => b.delivered - a.delivered).slice(0, 4);
  const bestEntry = entryPages.filter((row) => row.sessions >= 20).sort((a, b) => rate(b.ordered_sessions, b.sessions) - rate(a.ordered_sessions, a.sessions))[0];

  if (data.current.totals.sessions === 0) return <NoVisits />;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel eyebrow="Leaderboard" title="Most viewed products" aside={<span className="text-[11px] text-black/55">Views → orders → delivered</span>}>
          {products.length ? <EChart option={leaderboard} ariaLabel="Product views with orders and deliveries" className="h-[300px] w-full" animate={!reduceMotion} /> : <Empty>No product pages were viewed in this range.</Empty>}
        </Panel>
        <Panel eyebrow="Product share" title="Delivered orders by product">
          {ringProducts.length ? (
            <>
              <EChart option={rings} ariaLabel="Share of delivered orders for the most viewed products" className="h-[160px] w-full" animate={!reduceMotion} />
              <ul className="grid gap-1.5">
                {ringProducts.map((row, index) => (
                  <li key={row.product_slug} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 text-[12px]">
                    <span className="h-2 w-2 rounded-[2px]" style={{ background: categoricalColor(index) }} />
                    <span className="truncate">{productName(row)}</span>
                    <span className="tabular-nums">{formatNumber(row.delivered)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : <Empty>Delivered orders appear here as couriers report back.</Empty>}
        </Panel>
      </div>
      <Panel eyebrow="Landing pages" title="Where visits start" aside={<span className="text-[11px] text-black/55">Entry pages, including /step/ landing pages</span>}>
        <div className="relative -mx-1.5 overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-y-1 text-[13px]">
            <caption className="sr-only">Entry pages with visits, one-page visits, orders and conversion</caption>
            <thead>
              <tr className="text-left">
                <th className={TH}>Page</th><th className={cn(TH, "text-right")}>Visits</th><th className={cn(TH, "text-right")}>Left after one page</th>
                <th className={cn(TH, "text-right")}>Orders</th><th className={cn(TH, "text-right")}>Conversion</th>
              </tr>
            </thead>
            <tbody>
              {entryPages.map((row) => (
                <tr key={row.path} className="bg-white">
                  <td className="rounded-l-xl px-3 py-2.5">
                    <span className="font-mono text-[12px]">{row.path}</span>
                    {row.path.startsWith("/step/") && <span className="ml-2 rounded-md bg-black/[0.05] px-1.5 py-0.5 text-[11px] text-black/60">Landing page</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(row.sessions)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatPct(rate(row.bounced_sessions, row.sessions))}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(row.orders)}</td>
                  <td className="rounded-r-xl px-3 py-2.5 text-right tabular-nums">
                    {row === bestEntry
                      ? <span className="rounded-md bg-[#F28C28]/15 px-1.5 py-0.5 font-medium text-[#9A4A06]">{formatPct(rate(row.ordered_sessions, row.sessions))}</span>
                      : formatPct(rate(row.ordered_sessions, row.sessions))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel eyebrow="Pages" title="Most viewed pages">
        <ul className="grid gap-1.5">
          {pages.map((row) => (
            <li key={row.path} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 rounded-xl bg-white px-3 py-2.5 text-[13px]">
              <span className="truncate font-mono text-[12px]">{row.path}</span>
              <span className="tabular-nums text-black/60">{formatNumber(row.sessions)} visits</span>
              <span className="min-w-[70px] text-right font-medium tabular-nums">{formatNumber(row.views)} views</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

const DROP_ADVICE: Record<string, string> = {
  visits: "Most visitors leave before opening a product. Check that ads and links land on the right product or landing page.",
  product: "Most visitors look at a product but never add it to the cart. Try a clearer price per kg, the delivery charge up front, or a stronger Buy now button.",
  cart: "Many carts never reach checkout. Make the checkout button obvious and keep the cart short.",
  checkout: "Many checkouts never become orders. Check the form on a phone and look at abandoned checkouts.",
};

export function FunnelTab({ data, reduceMotion }: TabProps) {
  const totals = data.current.totals;
  const steps = funnelSteps(totals);
  const drop = biggestDrop(steps);
  const deviceRows = data.current.devices;
  const devices = useMemo(() => deviceConversionOption(deviceRows), [deviceRows]);

  if (totals.sessions === 0) return <NoVisits />;
  return (
    <div className="space-y-3">
      <Panel eyebrow="Funnel" title="From visit to delivered" aside={<span className="text-[11px] text-black/55">Each stage counts visits that reached it</span>}>
        <WebsiteFunnel data={data} wide />
        <div className="flex flex-wrap gap-1.5 text-[11px] tabular-nums text-black/60">
          {steps.slice(1).map((step, index) => (
            <span key={step.key} className={cn("rounded-md bg-white px-2 py-1", drop?.index === index && "bg-[#D9483B]/10 font-medium text-[#B4473A]")}>
              {steps[index].label} → {step.label.toLowerCase()} {steps[index].value ? formatPct(rate(step.value, steps[index].value)) : "—"}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 border-t border-black/[0.09] pt-3 text-[11px] text-black/60 sm:grid-cols-3">
          <div>Visit → order<strong className="block text-[18px] font-light tabular-nums tracking-[-0.03em] text-black">{formatPct(rate(totals.ordered_sessions, totals.sessions))}</strong></div>
          <div>Order → delivered<strong className="block text-[18px] font-light tabular-nums tracking-[-0.03em] text-black">{formatPct(rate(totals.delivered_sessions, totals.ordered_sessions))}</strong></div>
          <div>Cart → order<strong className="block text-[18px] font-light tabular-nums tracking-[-0.03em] text-black">{totals.cart_sessions ? formatPct(rate(totals.ordered_sessions, totals.cart_sessions)) : "—"}</strong></div>
        </div>
      </Panel>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {drop ? (
          <div className="flex items-start gap-3 self-start rounded-xl border border-black/[0.09] bg-white px-4 py-3">
            <span className="text-[22px] font-light tabular-nums tracking-[-0.03em] text-[#B4473A]">{formatPct((1 - drop.kept) * 100)}</span>
            <div>
              <p className="text-[13px] font-semibold text-black">Biggest drop: {steps[drop.index].label.toLowerCase()} → {steps[drop.index + 1].label.toLowerCase()}</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-black/60">{DROP_ADVICE[steps[drop.index].key]}</p>
            </div>
          </div>
        ) : <div />}
        <Panel eyebrow="Devices" title="Conversion by device">
          <EChart option={devices} ariaLabel="Share of visits with an order, by device" className="h-[180px] w-full" animate={!reduceMotion} />
        </Panel>
      </div>
      <p className="text-[11px] text-black/50">Cart and checkout use the steps the website already reports. Checkout failure reasons and recovered checkouts arrive in Release 2.</p>
    </div>
  );
}

function HealthCell({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2.5 text-[11px] text-black/60">
      {label}
      <strong className={cn("mt-0.5 block text-[16px] font-normal tabular-nums text-black", tone === "ok" && "text-[#2F7A55]", tone === "warn" && "text-[#8A5F05]")}>{value}</strong>
    </div>
  );
}

export function HealthTab({ data, comparison }: { data: WebsiteAnalyticsResponse; comparison?: ReactNode }) {
  const { health } = data;
  const summary = healthSummary(data.health);
  return (
    <div className="space-y-3">
      <Panel
        eyebrow="Data health"
        title="Can you trust these numbers?"
        aside={<span className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", summary.tone === "ok" ? "bg-[#1F9D63]/10 text-[#2F7A55]" : "bg-[#E0A21B]/15 text-[#8A5F05]")}>{summary.label}</span>}
      >
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <HealthCell label="Last visit recorded" value={timeAgo(health.latest_event_at)} tone={health.collecting ? "ok" : "warn"} />
          <HealthCell label="Orders linked to a visit" value={health.order_coverage === null ? "—" : formatPct(health.order_coverage * 100)} tone={health.order_coverage !== null && health.order_coverage < 0.6 ? "warn" : undefined} />
          <HealthCell label="Website orders in range" value={`${formatNumber(health.matched_orders)} of ${formatNumber(health.website_orders)}`} />
          <HealthCell label="Direct visits" value={health.direct_share === null ? "—" : formatPct(health.direct_share * 100)} />
          <HealthCell
            label="Nightly summary"
            value={health.rollup.last_failed_at ? `Failed ${timeAgo(health.rollup.last_failed_at)}` : health.rollup.last_succeeded_at ? `Done ${timeAgo(health.rollup.last_succeeded_at)}` : "Not run yet"}
            tone={health.rollup.healthy ? "ok" : "warn"}
          />
          <HealthCell label="Raw events kept" value="90 days" />
          <HealthCell label="Visits kept" value="25 months" />
          <HealthCell label="Updated" value={timeAgo(data.generated_at)} />
        </div>
        <p className="text-[11px] leading-relaxed text-black/55">
          Orders placed before 3 October 2026, from phones opted out with ?ms_exclude=1, or where the shopper's visit expired are not linked to a visit. Bots and team browsers are never recorded.
        </p>
      </Panel>
      {comparison && (
        <div className="space-y-2">
          <div className="px-1">
            <p className={EYEBROW}>Switch-over check</p>
            <p className="mt-1 text-[12px] text-black/55">PostHog's numbers for the last 30 days, shown until PostHog is turned off. Visitor counts should agree within about 10%; purchases differ on purpose because PostHog guesses from thank-you pages.</p>
          </div>
          {comparison}
        </div>
      )}
    </div>
  );
}
