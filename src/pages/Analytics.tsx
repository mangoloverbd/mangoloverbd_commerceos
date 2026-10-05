import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useState, type KeyboardEvent } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ChartBar } from "@phosphor-icons/react";
import { Button } from "@/components/base/buttons/button";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/ios-spinner";
import { AnimatedText } from "@/components/ui/animated-text";
import { FunnelChart, type FunnelStage } from "@/components/ui/funnel-chart";
import { useLiveVisitors } from "@/hooks/useLiveVisitors";
import { ANALYTICS_TABS, isWebsiteTab, resolveAnalyticsTab, type AnalyticsTab } from "@/lib/analyticsTabs";
import { StockForecastTab } from "@/components/analytics/StockForecastTab";
import type { StockForecastResponse } from "@/lib/stockForecast";
import { DateRangePicker } from "@/components/DateRangePicker";
import { AcquisitionTab, FunnelTab, HealthTab, OverviewTab, ProductsTab } from "@/components/analytics/WebsiteReportTabs";
import { healthSummary, timeAgo, type WebsiteAnalyticsResponse } from "@/lib/websiteAnalytics";

const WEBSITE_BEHAVIOR_REFETCH_MS = 30 * 1000;

type WebsiteBehaviorResponse = {
  configured: boolean;
  lookbackDays: number;
  funnel: {
    visitors: number;
    productViews: number;
    carts: number;
    checkouts: number;
    purchases: number;
    conversionRate: number;
  };
  dropOff: {
    step: string;
    rate: number;
    hint: string;
    summary?: string;
    bullets?: string[];
  } | null;
  productDemand: Array<{
    url: string;
    productName: string;
    views: number;
    carts: number;
    checkouts: number;
    purchases: number;
    conversionRate: number;
  }>;
  trafficSources: Array<{
    source: string;
    visitors: number;
    carts: number;
    purchases: number;
    conversionRate: number;
  }>;
};

function fmtPct(value: number) {
  return `${Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 1 })}%`;
}

class ReportError extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
}

function todayInDhaka(): DateRange {
  const dhaka = new Date(Date.now() + 6 * 60 * 60 * 1000);
  const today = new Date(dhaka.getUTCFullYear(), dhaka.getUTCMonth(), dhaka.getUTCDate());
  return { from: today, to: today };
}

export default function Analytics() {
  const [params, setParams] = useSearchParams();
  const tab = resolveAnalyticsTab(params.get("tab"));
  const reduceMotion = useReducedMotion();
  const liveVisitors = useLiveVisitors();
  const [dateRange, setDateRange] = useState<DateRange | null>(todayInDhaka);
  const from = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null;
  const to = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null;
  const selectTab = (next: AnalyticsTab) => {
    const nextParams = new URLSearchParams(params);
    if (next === "overview") nextParams.delete("tab"); else nextParams.set("tab", next);
    setParams(nextParams, { replace: true });
  };
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = ANALYTICS_TABS[(index + (event.key === "ArrowRight" ? 1 : ANALYTICS_TABS.length - 1)) % ANALYTICS_TABS.length];
    selectTab(next.id);
    document.getElementById(`analytics-tab-${next.id}`)?.focus();
  };

  const stock = useQuery<StockForecastResponse>({
    queryKey: ["/api/analytics/stock-forecast"],
    queryFn: async () => {
      const res = await apiFetch("/api/analytics/stock-forecast");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load stock and forecast");
      return json;
    },
    retry: false,
    staleTime: 5 * 60_000,
    enabled: tab === "stock",
  });

  const { data: websiteBehavior, isLoading: behaviorLoading, isFetching: behaviorFetching, refetch: refetchWebsiteBehavior } = useQuery<WebsiteBehaviorResponse>({
    queryKey: ["/api/order-analysis/website-behavior"],
    queryFn: async () => {
      const res = await apiFetch("/api/order-analysis/website-behavior");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load website behavior");
      return json;
    },
    staleTime: 0,
    refetchInterval: WEBSITE_BEHAVIOR_REFETCH_MS,
    enabled: tab === "health",
  });

  const website = useQuery<WebsiteAnalyticsResponse, ReportError>({
    queryKey: ["/api/analytics/website", from, to],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (from && to) { params.set("from", from); params.set("to", to); }
      const query = params.toString();
      const res = await apiFetch(`/api/analytics/website${query ? `?${query}` : ""}`);
      const json = await res.json();
      if (!res.ok) throw new ReportError(json.error || "Could not load website analytics", json.code);
      return json;
    },
    retry: false,
    staleTime: 60_000,
    enabled: isWebsiteTab(tab),
  });
  const isFetching = tab === "stock" ? stock.isFetching : website.isFetching || (tab === "health" && behaviorFetching);
  const health = website.data ? healthSummary(website.data.health) : null;

  return (
    <div className="min-h-full space-y-6 bg-[#FAFAF8] p-1 lg:p-2">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-start justify-between gap-4 px-2 pt-2"
        >
          <div>
            <h1 className="font-sf-display text-[22px] font-bold tracking-tight text-black">Analytics</h1>
            <p className="mt-1 text-[13px] text-black/45">Visitors, sources, products and the path to delivered orders.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
          {liveVisitors.loaded && (
            <span className="inline-flex h-8 items-center gap-2 rounded-[10px] bg-[#1F9D63]/10 px-3 text-[13px] font-medium tabular-nums text-[#2F7A55]" title="People on the website in the last minute">
              <span aria-hidden="true" className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#1F9D63] opacity-60 motion-reduce:animate-none" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[#1F9D63]" /></span>
              {liveVisitors.count.toLocaleString("en-BD")} on the site now
            </span>
          )}
          {isWebsiteTab(tab) && health && website.data && (
            <button
              type="button"
              onClick={() => selectTab("health")}
              title="Open Data health"
              className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-black/[0.04] px-3 text-[12px] text-black/60 transition-colors hover:text-black"
            >
              Data <b className={cn("font-medium", health.tone === "ok" ? "text-[#2F7A55]" : "text-[#8A5F05]")}>{health.label.toLowerCase()}</b> · {timeAgo(website.data.health.latest_event_at)}
            </button>
          )}
          {isWebsiteTab(tab) && <DateRangePicker value={dateRange} onChange={setDateRange} />}
          <Button
            variant="ghost"
            onClick={() => {
              if (tab === "stock") { stock.refetch(); return; }
              website.refetch();
              if (tab === "health") refetchWebsiteBehavior();
            }}
            disabled={isFetching}
            leadingIcon={
              isFetching
                ? (p) => <Spinner {...p} />
                : (p) => (
                    <svg {...p} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M6.71275 10.6736C7.16723 8.15492 9.38539 6.25 12.0437 6.25C13.6212 6.25 15.0431 6.9209 16.0328 7.9907C16.3141 8.29476 16.2956 8.76927 15.9915 9.05055C15.6875 9.33183 15.213 9.31337 14.9317 9.0093C14.2154 8.23504 13.1879 7.75 12.0437 7.75C10.2056 7.75 8.66974 9.00212 8.24452 10.6853L8.48095 10.4586C8.77994 10.172 9.25471 10.182 9.54137 10.4809C9.82804 10.7799 9.81805 11.2547 9.51905 11.5414L7.89662 13.0969C7.74932 13.2381 7.55084 13.3133 7.34695 13.3049C7.14306 13.2966 6.95137 13.2056 6.81608 13.0528L5.43852 11.4972C5.16391 11.1871 5.19267 10.7131 5.50277 10.4385C5.81286 10.1639 6.28686 10.1927 6.56148 10.5028L6.71275 10.6736Z" fill="currentColor" />
                      <path d="M16.6485 10.6959C16.8523 10.704 17.044 10.7947 17.1795 10.9472L18.5607 12.5019C18.8358 12.8115 18.8078 13.2856 18.4981 13.5607C18.1885 13.8358 17.7144 13.8078 17.4393 13.4981L17.2841 13.3234C16.8295 15.8458 14.6011 17.7509 11.9348 17.7509C10.3635 17.7509 8.94543 17.0895 7.95312 16.0322C7.66966 15.7302 7.68472 15.2555 7.98675 14.9721C8.28879 14.6886 8.76342 14.7037 9.04688 15.0057C9.76546 15.7714 10.792 16.2509 11.9348 16.2509C13.7819 16.2509 15.322 14.9991 15.7503 13.3193L15.5195 13.5409C15.2208 13.8278 14.746 13.8183 14.4591 13.5195C14.1721 13.2208 14.1817 12.746 14.4805 12.4591L16.0993 10.9044C16.2464 10.7631 16.4447 10.6878 16.6485 10.6959Z" fill="currentColor" />
                      <path fillRule="evenodd" clipRule="evenodd" d="M12 1.25C6.06294 1.25 1.25 6.06294 1.25 12C1.25 17.9371 6.06294 22.75 12 22.75C17.9371 22.75 22.75 17.9371 22.75 12C22.75 6.06294 17.9371 1.25 12 1.25ZM2.75 12C2.75 6.89137 6.89137 2.75 12 2.75C17.1086 2.75 21.25 6.89137 21.25 12C21.25 17.1086 17.1086 21.25 12 21.25C6.89137 21.25 2.75 17.1086 2.75 12Z" fill="currentColor" />
                    </svg>
                  )
            }
          >
            Refresh
          </Button>
          </div>
        </motion.div>

        <div role="tablist" aria-label="Analytics sections" className="flex gap-1 overflow-x-auto border-b border-black/[0.09] px-2 [scrollbar-width:none]">
          {ANALYTICS_TABS.map((item, index) => {
            const selected = tab === item.id;
            return (
              <button
                key={item.id}
                id={`analytics-tab-${item.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`analytics-panel-${item.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(item.id)}
                onKeyDown={(event) => onTabKey(event, index)}
                className={cn("relative shrink-0 px-3 pb-2.5 pt-2 text-[13px] transition-colors duration-150", selected ? "font-medium text-black" : "text-black/55 hover:text-black")}
              >
                {item.label}
                {selected && (
                  <motion.span layoutId="analytics-tab-underline" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-black" transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 40 }} />
                )}
              </button>
            );
          })}
        </div>

        {isWebsiteTab(tab) && (
          <div role="tabpanel" id={`analytics-panel-${tab}`} aria-labelledby={`analytics-tab-${tab}`}>
            {website.isLoading ? (
              <div className="grid gap-3 lg:grid-cols-2" aria-busy="true">
                {[0, 1, 2, 3].map((index) => <div key={index} className="h-[220px] animate-pulse rounded-2xl bg-black/[0.04]" />)}
              </div>
            ) : website.isError || !website.data ? (
              <div className="rounded-2xl bg-black/[0.04] px-6 py-12 text-center">
                <p className="text-sm font-medium text-black">{website.error?.code === "analytics_not_ready" ? "Website analytics is not set up yet" : "Could not load website analytics"}</p>
                <p className="mt-2 text-[12px] text-black/55">{website.error?.code === "analytics_not_ready" ? "The database changes for first-party analytics have not been applied." : website.error?.message}</p>
                <Button variant="ghost" className="mt-4" onClick={() => website.refetch()}>Try again</Button>
              </div>
            ) : tab === "overview" ? (
              <OverviewTab data={website.data} reduceMotion={reduceMotion} onOpenFunnel={() => selectTab("funnel")} />
            ) : tab === "acquisition" ? (
              <AcquisitionTab data={website.data} reduceMotion={reduceMotion} />
            ) : tab === "products" ? (
              <ProductsTab data={website.data} reduceMotion={reduceMotion} />
            ) : tab === "funnel" ? (
              <FunnelTab data={website.data} reduceMotion={reduceMotion} />
            ) : (
              <HealthTab data={website.data} comparison={<WebsiteBehaviorPanel data={websiteBehavior} loading={behaviorLoading} />} />
            )}
          </div>
        )}

        {tab === "stock" && (
          <div role="tabpanel" id="analytics-panel-stock" aria-labelledby="analytics-tab-stock">
            {stock.isLoading ? (
              <div className="grid gap-3 lg:grid-cols-2" aria-busy="true">
                {[0, 1, 2, 3].map((index) => <div key={index} className="h-[220px] animate-pulse rounded-2xl bg-black/[0.04]" />)}
              </div>
            ) : stock.isError || !stock.data ? (
              <div className="rounded-2xl bg-black/[0.04] px-6 py-12 text-center">
                <p className="text-sm font-medium text-black">Could not load stock and forecast</p>
                <p className="mt-2 text-[12px] text-black/55">{stock.error?.message}</p>
                <Button variant="ghost" className="mt-4" onClick={() => stock.refetch()}>Try again</Button>
              </div>
            ) : (
              <StockForecastTab data={stock.data} reduceMotion={reduceMotion} />
            )}
          </div>
        )}
    </div>
  );
}

function Metric({ value, muted }: { value: string; muted?: string }) {
  return (
    <div className="px-4 py-4">
      <p className="text-sm font-medium text-foreground tabular-nums">{value}</p>
      {muted && <p className="mt-1 text-xs text-muted-foreground tabular-nums">{muted}</p>}
    </div>
  );
}

function WebsiteBehaviorPanel({ data, loading }: { data?: WebsiteBehaviorResponse; loading: boolean }) {
  const steps = [
    { label: "Visitors", value: data?.funnel.visitors ?? 0 },
    { label: "Product Views", value: data?.funnel.productViews ?? 0 },
    { label: "Added to Cart", value: data?.funnel.carts ?? 0 },
    { label: "Checkout", value: data?.funnel.checkouts ?? 0 },
    { label: "Purchased", value: data?.funnel.purchases ?? 0 },
  ];
  const funnelHasData = steps[0].value > 0;
  const funnelGradients = [
    ["var(--chart-1)", "var(--chart-2)"],
    ["var(--chart-2)", "var(--chart-3)"],
    ["var(--chart-3)", "var(--chart-4)"],
    ["var(--chart-4)", "var(--chart-5)"],
    ["var(--chart-5)", "var(--chart-1)"],
  ];
  const funnelStages: FunnelStage[] = steps.map((step, i) => ({
    label: step.label,
    value: step.value,
    displayValue: step.value.toLocaleString("en-BD"),
    gradient: [
      { offset: "0%", color: funnelGradients[i][0] },
      { offset: "100%", color: funnelGradients[i][1] },
    ],
  }));
  const defaultTrafficSources = ["Direct", "Facebook", "Instagram", "Google"];
  const trafficSources = defaultTrafficSources.map((source) => {
    const actual = data?.trafficSources.find((item) => item.source.toLowerCase() === source.toLowerCase());
    return actual || { source, visitors: 0, carts: 0, purchases: 0, conversionRate: 0 };
  });

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.02 }}
      className="overflow-hidden rounded-2xl bg-white"
    >
      <div className="flex h-[50px] items-center border-b border-black/10 px-6">
        <div className="flex items-center gap-2.5">
          <ChartBar weight="light" size={16} className="text-muted-foreground" />
          <AnimatedText className="font-sf-display text-[15px] font-semibold tracking-normal text-foreground">Website Funnel</AnimatedText>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 py-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="h-[220px] animate-pulse rounded-2xl bg-black/[0.05]" />
          <div className="h-[220px] animate-pulse rounded-2xl bg-black/[0.05]" />
        </div>
      ) : data?.configured === false ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm font-semibold text-foreground">PostHog query credentials are not configured</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Add POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID to unlock Website Funnel, Conversion Drop-off, Product Demand Signals, and Traffic Source Performance.
          </p>
        </div>
      ) : (
        <div className="grid items-stretch gap-4 py-6 xl:h-[760px] xl:grid-cols-[1.15fr_0.85fr]">
          <div className="website-behavior-scroll-card h-full min-h-0 overflow-y-auto rounded-2xl bg-black/[0.04] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-black/35">Conversion Flow</p>
                <h3 className="mt-2 font-sf-display text-5xl font-light leading-none tracking-[-0.06em] text-foreground">
                  {fmtPct(data?.funnel.conversionRate ?? 0)}
                </h3>
                <p className="mt-3 text-sm font-medium text-muted-foreground">
                  {(data?.funnel.purchases ?? 0).toLocaleString("en-BD")} purchase{(data?.funnel.purchases ?? 0) === 1 ? "" : "s"} from {(data?.funnel.visitors ?? 0).toLocaleString("en-BD")} tracked visitors
                </p>
              </div>
              <div className="rounded-full bg-black px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                Live web
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-black/30">Conversion Funnel</p>
              {funnelHasData ? (
                <div className="rounded-2xl bg-black/[0.03] px-2 py-4">
                  <FunnelChart data={funnelStages} layers={3} gap={6} />
                </div>
              ) : (
                <div className="flex min-h-[180px] items-center justify-center rounded-2xl bg-black/[0.03] text-sm text-muted-foreground">
                  Funnel appears once tracked visitors arrive.
                </div>
              )}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-black/[0.04] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/35">Main Leak</p>
                <p className="mt-3 text-base font-semibold tracking-tight text-foreground">{data?.dropOff?.step || "No drop-off yet"}</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{data?.dropOff?.summary || data?.dropOff?.hint || "More traffic is needed before a reliable leak appears."}</p>
              </div>
              <div className="rounded-2xl bg-black/[0.04] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/35">Best Signal</p>
                <p className="mt-3 text-base font-semibold leading-snug tracking-tight text-foreground">{data?.productDemand[0]?.productName || "No product signal"}</p>
                {data?.productDemand[0]?.url && (
                  <p className="mt-1 break-all text-[11px] leading-relaxed text-muted-foreground">{data.productDemand[0].url}</p>
                )}
                {data?.productDemand[0] ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <div className="best-signal-stat rounded-[12px] bg-black/[0.04] px-3 py-2">
                      <p className="text-[10px] font-medium text-black/45">Views</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{data.productDemand[0].views.toLocaleString("en-BD")}</p>
                    </div>
                    <div className="best-signal-stat rounded-[12px] bg-black/[0.04] px-3 py-2">
                      <p className="text-[10px] font-medium text-black/45">Carts</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{data.productDemand[0].carts.toLocaleString("en-BD")}</p>
                    </div>
                    <div className="best-signal-stat rounded-[12px] bg-black/[0.04] px-3 py-2">
                      <p className="text-[10px] font-medium text-black/45">Purchases</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{data.productDemand[0].purchases.toLocaleString("en-BD")}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Product demand signals will appear after tracked product visits.</p>
                )}
              </div>
            </div>
          </div>

          <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
            <div className="website-behavior-scroll-card min-h-0 overflow-y-auto rounded-2xl bg-black/[0.04] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/35">Conversion Drop-off</p>
              {data?.dropOff ? (
                <>
                  <div className="mt-3 flex items-end justify-between gap-4">
                    <div>
                      <h3 className="font-sf-display text-xl font-light tracking-tight text-foreground">{data.dropOff.step}</h3>
                      {data.dropOff.bullets?.length ? (
                        <ul className="mt-3 list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-muted-foreground">
                          {data.dropOff.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{data.dropOff.hint}</p>
                      )}
                    </div>
                    <p className="text-3xl font-light tabular-nums text-red-600">{fmtPct(data.dropOff.rate)}</p>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No meaningful drop-off detected yet.</p>
              )}
            </div>

            <div className="website-behavior-scroll-card min-h-0 overflow-y-auto rounded-2xl bg-black/[0.04] p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/35">Product Demand Signals</p>
                <span className="text-xs text-muted-foreground">{data?.productDemand.length ?? 0} pages</span>
              </div>
              <div className="mt-4 space-y-3">
                {data?.productDemand.length ? data.productDemand.slice(0, 4).map((item) => (
                  <div key={item.url} className="grid gap-2 rounded-xl bg-black/[0.04] p-3 md:grid-cols-[1fr_auto] md:items-center">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">{item.productName}</p>
                      <p className="mt-0.5 break-all text-[10px] text-muted-foreground">{item.url}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {item.views.toLocaleString("en-BD")} views · {item.carts.toLocaleString("en-BD")} carts · {item.purchases.toLocaleString("en-BD")} purchases
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums text-foreground">{fmtPct(item.conversionRate)}</p>
                  </div>
                )) : (
                  <p className="text-sm text-muted-foreground">No product demand signals yet. Install the custom website tracker and wait for visitor events.</p>
                )}
              </div>
            </div>

          </div>

          <div className="website-behavior-scroll-card col-span-full max-h-[360px] overflow-y-auto rounded-2xl bg-black/[0.04] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/35">Traffic Source Performance</p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Campaign quality by visitor source, cart intent, and completed purchases.</p>
              </div>
              <span className="text-xs text-muted-foreground">{data?.trafficSources.length ?? 0} sources</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {trafficSources.map((item) => (
                <div key={item.source} className="rounded-2xl bg-black/[0.04] p-4">
                  <div className="grid min-h-[112px] content-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{item.source}</p>
                      {item.visitors || item.carts || item.purchases ? (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {item.visitors.toLocaleString("en-BD")} visitors · {item.carts.toLocaleString("en-BD")} carts · {item.purchases.toLocaleString("en-BD")} purchases
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] text-muted-foreground">No tracked purchases yet</p>
                      )}
                    </div>
                    <p className="text-2xl font-medium tracking-[-0.05em] text-foreground tabular-nums">{fmtPct(item.conversionRate)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </motion.section>
  );
}

