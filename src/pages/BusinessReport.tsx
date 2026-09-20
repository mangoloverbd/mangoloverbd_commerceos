import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { DateRange } from "react-day-picker";
import { ArrowsClockwise, CaretDown, CaretRight } from "@phosphor-icons/react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Chip } from "@/components/base/badges/chip";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/ios-spinner";
import { apiFetch } from "@/lib/api";

type Metrics = {
  intake_count: number;
  order_value: number;
  approved_count: number;
  approved_value: number;
  cancelled_count: number;
  cancelled_value: number;
  returned_count: number;
  returned_value: number;
  pending_count: number;
  pending_value: number;
  delivery_charged: number;
  courier_fees_recorded: number;
  net_delivery_position: number;
  courier_fee_order_count: number;
};

type IntakeBucket = {
  key: string;
  label: string;
  intake_count: number;
  order_value: number;
};

type LandingPage = {
  path: string | null;
  label: string;
  intake_count: number;
  order_value: number;
  approved_count: number;
  cancelled_count: number;
  returned_count: number;
  pending_count: number;
};

type BusinessReportSource = Metrics & {
  source: string;
  label: string;
  landing_pages: LandingPage[];
};

type BusinessReportResponse = {
  range: { from: string | null; to: string | null };
  summary: Metrics;
  series: {
    granularity: "hour" | "day";
    label: string;
    buckets: IntakeBucket[];
  };
  sources: BusinessReportSource[];
};

function dhakaToday(): Date {
  const dhakaMs = Date.now() + 6 * 60 * 60 * 1000;
  const date = new Date(dhakaMs);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function formatTaka(value: number) {
  return `৳${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString("en-BD");
}

function formatPercent(numerator: number, denominator: number) {
  if (!denominator) return "0%";
  return `${((numerator / denominator) * 100).toLocaleString("en-BD", { maximumFractionDigits: 1 })}%`;
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
      <p className="mt-0.5 text-[11px] text-black/60">{description}</p>
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

function IntakeSeries({ series }: { series: BusinessReportResponse["series"] }) {
  const maximum = Math.max(1, ...series.buckets.map((bucket) => bucket.intake_count));
  const stretch = series.granularity === "day";

  return (
    <section aria-label={series.label} className="rounded-2xl bg-black/[0.04] px-4 py-4 sm:px-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">{series.label}</p>
          <p className="mt-1 text-[11px] text-black/60">Orders created in the selected range</p>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-black/55">{formatNumber(series.buckets.reduce((sum, bucket) => sum + bucket.intake_count, 0))} orders</span>
      </div>
      <div className="mt-4 overflow-x-auto pb-1">
        <ul className={`flex items-end gap-1.5 ${stretch ? "w-full" : "min-w-max"}`} aria-label={`${series.label} buckets`}>
          {series.buckets.map((bucket) => {
            const height = bucket.intake_count > 0
              ? Math.max(8, (bucket.intake_count / maximum) * 84)
              : 1;
            return (
              <li
                key={bucket.key}
                aria-label={`${bucket.label}: ${bucket.intake_count} orders`}
                className={`flex flex-col items-center gap-1 ${stretch ? "min-w-9 flex-1" : "w-6"}`}
              >
                <span className="flex h-[88px] w-full items-end rounded-sm bg-black/[0.05]" aria-hidden="true">
                  <span
                    className="w-full rounded-sm bg-black/70 transition-[height] duration-300"
                    style={{ height: `${height}px` }}
                  />
                </span>
                <span className="whitespace-nowrap text-center text-[9px] tabular-nums text-black/55">{bucket.label}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function LandingPageList({ landingPages }: { landingPages: LandingPage[] }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="text-[8px] font-medium uppercase tracking-[0.25em] text-black/60">Landing pages</p>
      <div className="mt-2 space-y-2">
        {landingPages.map((landingPage) => {
          const outcomes = [
            landingPage.approved_count ? `Approved ${formatNumber(landingPage.approved_count)}` : null,
            landingPage.cancelled_count ? `Cancelled ${formatNumber(landingPage.cancelled_count)}` : null,
            landingPage.returned_count ? `RTO ${formatNumber(landingPage.returned_count)}` : null,
            landingPage.pending_count ? `Pending ${formatNumber(landingPage.pending_count)}` : null,
          ].filter(Boolean);

          return (
            <div
              key={landingPage.path || "other-website"}
              className="flex min-w-0 items-start justify-between gap-3 rounded-lg bg-black/[0.03] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-black">{landingPage.label}</p>
                {outcomes.length > 0 && (
                  <p className="mt-0.5 text-[10px] text-black/55">{outcomes.join(" · ")}</p>
                )}
              </div>
              <span className="shrink-0 text-right text-[10px] tabular-nums text-black/60">
                {formatNumber(landingPage.intake_count)} orders · {formatTaka(landingPage.order_value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SourceCard({
  source,
  index,
  reduceMotion,
}: {
  source: BusinessReportSource;
  index: number;
  reduceMotion: boolean | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = `business-report-details-${source.source}`;
  const action = expanded ? "Hide" : "Show";
  const detailItems = [
    { label: "Delivery charged", value: formatTaka(source.delivery_charged) },
    { label: "Courier fees recorded", value: formatTaka(source.courier_fees_recorded) },
    { label: "Net delivery position", value: formatTaka(source.net_delivery_position) },
    { label: "Fee coverage", value: `${formatNumber(source.courier_fee_order_count)} of ${formatNumber(source.intake_count)} orders` },
  ];

  return (
    <motion.article
      data-testid={`business-report-source-${source.source}`}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : Math.min(index * 0.04, 0.2), duration: 0.3 }}
      className="overflow-hidden rounded-2xl bg-black/[0.04] transition-colors hover:bg-black/[0.055]"
    >
      <button
        type="button"
        aria-label={`${action} details for ${source.label}`}
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((current) => !current)}
        className="group flex w-full items-start justify-between gap-4 px-5 pb-3 pt-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black/25"
      >
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold tracking-tight text-black">{source.label}</span>
          <span className="mt-1 block text-[11px] text-black/60">Ranked by intake value</span>
        </span>
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-black/60 transition-colors group-hover:text-black">
          {expanded ? <CaretDown size={15} weight="light" /> : <CaretRight size={15} weight="light" />}
        </span>
      </button>

      <div className="grid grid-cols-3 gap-2 px-5 pb-3">
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.2em] text-black/55">Intake</p>
          <p className="mt-1 text-[16px] font-light tabular-nums tracking-[-0.04em] text-black">{formatNumber(source.intake_count)}</p>
        </div>
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.2em] text-black/55">Order value</p>
          <p className="mt-1 truncate text-[16px] font-light tabular-nums tracking-[-0.04em] text-black">{formatTaka(source.order_value)}</p>
        </div>
        <div className="text-right">
          <p className="text-[8px] font-medium uppercase tracking-[0.2em] text-black/55">Net delivery</p>
          <p className="mt-1 truncate text-[16px] font-light tabular-nums tracking-[-0.04em] text-black">{formatTaka(source.net_delivery_position)}</p>
        </div>
      </div>

      <div className="mx-5 border-t border-black/[0.08]" />
      <div className="flex flex-wrap gap-1.5 px-5 pt-3">
        <Chip variant="caption" color="blue" className="gap-1 tabular-nums">Intake {formatNumber(source.intake_count)}</Chip>
        <Chip variant="caption" color="lime" className="gap-1 tabular-nums">Approved {formatNumber(source.approved_count)}</Chip>
        <Chip variant="caption" color="rose" className="gap-1 tabular-nums">Cancelled {formatNumber(source.cancelled_count)}</Chip>
        <Chip variant="caption" color="yellow" className="gap-1 tabular-nums">RTO {formatNumber(source.returned_count)}</Chip>
        <Chip variant="caption" color="soft" className="gap-1 tabular-nums">Pending {formatNumber(source.pending_count)}</Chip>
      </div>
      <p className="px-5 pb-3 pt-2 text-[10px] tabular-nums text-black/55">
        Courier fee coverage: {formatNumber(source.courier_fee_order_count)} of {formatNumber(source.intake_count)} orders
      </p>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={detailsId}
            initial={reduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-black/[0.08] px-5 py-4">
              <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Operational detail</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <DetailGroup title="Delivery economics" items={detailItems} />
                {source.source === "website" && <LandingPageList landingPages={source.landing_pages} />}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}

export default function BusinessReport() {
  const reduceMotion = useReducedMotion();
  const defaultRange = useMemo<DateRange>(() => {
    const today = dhakaToday();
    return { from: today, to: today };
  }, []);
  const [dateRange, setDateRange] = useState<DateRange | null>(defaultRange);
  const from = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null;
  const to = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null;

  const reportQuery = useQuery({
    queryKey: ["business-report", from, to],
    retry: false,
    queryFn: async (): Promise<BusinessReportResponse> => {
      const params = new URLSearchParams();
      if (from && to) {
        params.set("from", from);
        params.set("to", to);
      }
      const queryString = params.toString();
      const response = await apiFetch(`/api/reports/business${queryString ? `?${queryString}` : ""}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error || "Could not load business report");
      return body as BusinessReportResponse;
    },
  });

  if (reportQuery.isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-96px)] items-center justify-center bg-[#FAFAF8]">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" className="text-black" />
          <span className="text-sm font-medium text-black/60">Loading business report</span>
        </div>
      </div>
    );
  }

  if (reportQuery.isError || !reportQuery.data) {
    return (
      <div className="flex min-h-[calc(100vh-96px)] items-center justify-center bg-[#FAFAF8]">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-medium text-black/60">Could not load business report</p>
          <Button type="button" variant="outline" size="sm" onClick={() => reportQuery.refetch()}>Try again</Button>
        </div>
      </div>
    );
  }

  const data = reportQuery.data;
  const summary = data.summary;

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
            <h1 className="font-sf-display text-[22px] font-bold tracking-tight text-black">Business Report</h1>
            <p className="mt-1 max-w-2xl text-[13px] text-black/60">Regular-order intake and operating totals, using Asia/Dhaka dates.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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

        {summary.intake_count === 0 ? (
          <div className="border-y border-black/[0.08] py-12 text-center text-[12px] text-black/60">
            No regular orders were created in this range.
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SnapshotCard
                label="Intake"
                value={formatNumber(summary.intake_count)}
                description="Regular orders created"
                testId="business-report-summary-intake"
                delay={0.02}
                reduceMotion={reduceMotion}
              />
              <SnapshotCard
                label="Order value"
                value={formatTaka(summary.order_value)}
                description="Intake value before delivery"
                testId="business-report-summary-order-value"
                delay={0.06}
                reduceMotion={reduceMotion}
              />
              <SnapshotCard
                label="Approved / progressing"
                value={formatNumber(summary.approved_count)}
                description={`${formatPercent(summary.approved_count, summary.intake_count)} of intake`}
                testId="business-report-summary-approved"
                delay={0.1}
                reduceMotion={reduceMotion}
              />
              <SnapshotCard
                label="Cancelled"
                value={formatNumber(summary.cancelled_count)}
                description={`${formatPercent(summary.cancelled_count, summary.intake_count)} of intake`}
                testId="business-report-summary-cancelled"
                delay={0.14}
                reduceMotion={reduceMotion}
              />
            </div>

            <section className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]" aria-label="Business report operations">
              <div className="rounded-2xl bg-black/[0.04] px-4 py-4 sm:px-5">
                <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Delivery economics</p>
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
                  <div>
                    <dt className="text-[10px] text-black/55">Delivery charged</dt>
                    <dd className="mt-1 text-[18px] font-light tabular-nums tracking-[-0.04em] text-black">{formatTaka(summary.delivery_charged)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-black/55">Courier fees recorded</dt>
                    <dd className="mt-1 text-[18px] font-light tabular-nums tracking-[-0.04em] text-black">{formatTaka(summary.courier_fees_recorded)}</dd>
                  </div>
                  <div className="col-span-2 border-t border-black/[0.08] pt-3">
                    <dt className="text-[10px] text-black/55">Net delivery position</dt>
                    <dd className="mt-1 text-[22px] font-light tabular-nums tracking-[-0.04em] text-black">{formatTaka(summary.net_delivery_position)}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-[10px] tabular-nums text-black/55">
                  Courier fee coverage: {formatNumber(summary.courier_fee_order_count)} of {formatNumber(summary.intake_count)} orders
                </p>
              </div>
              <IntakeSeries series={data.series} />
            </section>

            <motion.section
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0 : 0.1, duration: 0.4 }}
              aria-labelledby="source-performance-heading"
            >
              <div className="flex items-center gap-2.5 py-3">
                <h2 id="source-performance-heading" className="font-sf-display text-[15px] font-semibold tracking-normal text-black">Source performance</h2>
                <div className="h-3.5 w-px bg-black/10" />
                <span className="text-[13px] tabular-nums text-black/60">{formatNumber(data.sources.length)} sources</span>
                <span className="hidden text-[11px] text-black/45 sm:inline">Ranked by order value</span>
              </div>
              <div className="grid grid-cols-1 gap-3">
                {data.sources.map((source, index) => (
                  <SourceCard key={source.source} source={source} index={index} reduceMotion={reduceMotion} />
                ))}
              </div>
            </motion.section>
          </>
        )}
      </motion.div>
    </div>
  );
}
