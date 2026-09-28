import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { motion, useReducedMotion } from "framer-motion";
import type { DateRange } from "react-day-picker";
import { WarningCircle } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { DateRangePicker } from "@/components/DateRangePicker";
import {
  ApprovalGaugePanel,
  DeliveryEconomicsPanel,
  BestDayPanel,
  IntakeRhythmPanel,
  OutcomeSankeyPanel,
  ProductWeightPanel,
  SourceMixPanel,
} from "@/components/business-report/ReportCharts";
import { SourcePerformanceTable } from "@/components/business-report/SourcePerformanceTable";
import { SummaryTiles } from "@/components/business-report/SummaryTiles";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/ios-spinner";
import { apiFetch } from "@/lib/api";
import type { BusinessReportResponse } from "@/components/business-report/types";

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
    staleTime: 60_000,
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
              <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={reportQuery.isFetching ? "animate-spin" : ""}><path opacity="0.5" d="M3.46447 3.46447C2 4.92893 2 7.28595 2 12C2 16.714 2 19.0711 3.46447 20.5355C4.92893 22 7.28595 22 12 22C16.714 22 19.0711 22 20.5355 20.5355C22 19.0711 22 16.714 22 12C22 7.28595 22 4.92893 20.5355 3.46447C19.0711 2 16.714 2 12 2C7.28595 2 4.92893 2 3.46447 3.46447Z" fill="currentColor" /><path d="M12.0096 5.25C8.62406 5.25 5.83333 7.79988 5.46058 11.0833H5.00002C4.69658 11.0833 4.42304 11.2662 4.30701 11.5466C4.19099 11.8269 4.25534 12.1496 4.47005 12.364L5.63832 13.5307C5.93113 13.8231 6.40544 13.8231 6.69825 13.5307L7.86651 12.364C8.08122 12.1496 8.14558 11.8269 8.02955 11.5466C7.91353 11.2662 7.63998 11.0833 7.33654 11.0833H6.97332C7.33642 8.63219 9.45215 6.75 12.0096 6.75C13.541 6.75 14.9136 7.42409 15.8479 8.49347C16.1204 8.80539 16.5942 8.83733 16.9061 8.56479C17.2181 8.29226 17.25 7.81846 16.9775 7.50653C15.7702 6.12471 13.9916 5.25 12.0096 5.25Z" fill="currentColor" /><path d="M18.3618 10.4693C18.069 10.1769 17.5947 10.1769 17.3018 10.4693L16.1336 11.636C15.9189 11.8504 15.8545 12.1731 15.9705 12.4534C16.0866 12.7338 16.3601 12.9167 16.6636 12.9167H17.0268C16.6637 15.3678 14.548 17.25 11.9905 17.25C10.4591 17.25 9.08654 16.5759 8.15222 15.5065C7.87968 15.1946 7.40589 15.1627 7.09396 15.4352C6.78203 15.7077 6.7501 16.1815 7.02263 16.4935C8.22995 17.8753 10.0085 18.75 11.9905 18.75C15.376 18.75 18.1668 16.2001 18.5395 12.9167H19.0001C19.3035 12.9167 19.5771 12.7338 19.6931 12.4534C19.8091 12.1731 19.7448 11.8504 19.53 11.636L18.3618 10.4693Z" fill="currentColor" /></svg>
            </button>
          </div>
        </header>

        {data.missing_weight_products.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-y border-amber-500/20 bg-amber-50/60 px-3 py-2 text-[11px] text-amber-950/70">
            <WarningCircle size={16} weight="light" className="text-amber-700" />
            <span>
              {data.missing_weight_products.length} product{data.missing_weight_products.length === 1 ? " is" : "s are"} missing a catalog weight: {data.missing_weight_products.slice(0, 3).map((product) => product.name).join(", ")}{data.missing_weight_products.length > 3 ? `, and ${data.missing_weight_products.length - 3} more` : ""}.
            </span>
            <Link to="/products" className="font-medium text-amber-950 underline underline-offset-2">Review products</Link>
          </div>
        )}

        {summary.intake_count === 0 ? (
          <div className="border-y border-black/[0.08] py-12 text-center text-[12px] text-black/60">
            No regular orders were created in this range.
          </div>
        ) : (
          <>
            <SummaryTiles report={data} reduceMotion={reduceMotion} />

            <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
              <IntakeRhythmPanel report={data} reduceMotion={reduceMotion} />
              <OutcomeSankeyPanel report={data} reduceMotion={reduceMotion} />
            </section>
            <section className="grid gap-3 lg:grid-cols-3">
              <SourceMixPanel report={data} reduceMotion={reduceMotion} />
              <ApprovalGaugePanel report={data} reduceMotion={reduceMotion} />
              <DeliveryEconomicsPanel report={data} />
            </section>
            <BestDayPanel report={data} reduceMotion={reduceMotion} />
            <ProductWeightPanel report={data} reduceMotion={reduceMotion} />

            <SourcePerformanceTable report={data} />
          </>
        )}
      </motion.div>
    </div>
  );
}
