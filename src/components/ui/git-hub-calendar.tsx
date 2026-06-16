import { useMemo, useRef, useState } from "react";
import { addDays, addMonths, format, parseISO, startOfWeek, subDays } from "date-fns";
import { cn } from "@/lib/utils";

export type SalesTrendDay = {
  date: string;
  totalRevenue: number;
  newCustomerRevenue: number;
  existingCustomerRevenue: number;
  totalOrders: number;
  newCustomerOrders: number;
  existingCustomerOrders: number;
  intensity: number;
};

type GitHubCalendarProps = {
  data: SalesTrendDay[];
  loading?: boolean;
  monthlyRevenue?: number;
};

const colors = ["#f2f1ef", "#dad9d6", "#aaa9a5", "#686763", "#171717"];

function fmtBDT(value: number) {
  return "৳" + Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 0 });
}

function buildCalendarDays(data: SalesTrendDay[], rangeDays: number) {
  const map = new Map(data.map((day) => [day.date, day]));
  const end = data.length ? parseISO(data[data.length - 1].date) : new Date();
  const start = startOfWeek(subDays(end, rangeDays - 1));
  const cells: SalesTrendDay[] = [];
  const totalCells = Math.ceil((rangeDays + start.getDay()) / 7) * 7;

  for (let i = 0; i < totalCells; i += 1) {
    const date = addDays(start, i);
    const key = format(date, "yyyy-MM-dd");
    cells.push(
      map.get(key) || {
        date: key,
        totalRevenue: 0,
        newCustomerRevenue: 0,
        existingCustomerRevenue: 0,
        totalOrders: 0,
        newCustomerOrders: 0,
        existingCustomerOrders: 0,
        intensity: 0,
      }
    );
  }

  return cells;
}

export function GitHubCalendar({ data, loading = false, monthlyRevenue }: GitHubCalendarProps) {
  const [range, setRange] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [active, setActive] = useState<(SalesTrendDay & { x: number; y: number }) | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const rangeDays = range === "weekly" ? 91 : range === "monthly" ? 365 : 365;
  const selectedPeriodDays = range === "weekly" ? 7 : range === "monthly" ? 30 : 365;
  const calendarDays = useMemo(() => buildCalendarDays(data, rangeDays), [data, rangeDays]);
  const weeks = useMemo(() => {
    const grouped: SalesTrendDay[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) grouped.push(calendarDays.slice(i, i + 7));
    return grouped;
  }, [calendarDays]);

  const endDate = data.length ? parseISO(data[data.length - 1].date) : new Date();
  const selectedStartDate = subDays(endDate, selectedPeriodDays - 1);
  const computedTotalRevenue = data
    .filter((day) => parseISO(day.date) >= selectedStartDate && parseISO(day.date) <= endDate)
    .reduce((sum, day) => sum + day.totalRevenue, 0);
  const totalRevenue = range === "monthly" && monthlyRevenue != null ? monthlyRevenue : computedTotalRevenue;
  const monthLabels = useMemo(() => {
    const start = parseISO(calendarDays[0]?.date || format(new Date(), "yyyy-MM-dd"));
    return Array.from({ length: 12 }, (_, index) => ({
      label: format(addMonths(start, index), "MMM"),
      left: `${(index / 11) * 100}%`,
    }));
  }, [calendarDays]);

  const showTooltip = (day: SalesTrendDay, element: HTMLElement) => {
    const chart = chartRef.current;
    if (!chart) return;
    const chartRect = chart.getBoundingClientRect();
    const cellRect = element.getBoundingClientRect();
    const tooltipWidth = 210;
    const rawX = cellRect.left - chartRect.left + cellRect.width / 2;
    const x = Math.max(tooltipWidth / 2, Math.min(rawX, chartRect.width - tooltipWidth / 2));
    setActive({
      ...day,
      x,
      y: cellRect.top - chartRect.top - 10,
    });
  };

  return (
    <section className="rounded-2xl border border-black/10 bg-white">
      <div className="flex h-11 items-center justify-between border-b border-black/10 bg-[#F4F3F1] px-6">
        <div className="flex items-center gap-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.22em] text-black/40">Sales Trend</h2>
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-black/10 text-[9px] font-bold text-white">i</span>
        </div>
        <button className="flex h-7 w-7 items-center justify-center rounded-full border border-black/10 bg-[#F8F7F5] text-black/50 shadow-sm">
          <span className="text-base leading-none">...</span>
        </button>
      </div>

      <div className="px-6 pb-5 pt-5">
        <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-8">
            <div className="flex items-baseline gap-3">
              <span className="text-[13px] text-black/45">Total Revenue :</span>
              <span className="font-sf-display text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
                {loading ? "—" : fmtBDT(totalRevenue)}
              </span>
            </div>
            <div className="flex items-center gap-6 text-[12px] font-medium uppercase tracking-[0.2em] text-black/45">
              <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-black/10" /> New Customer</span>
              <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-black" /> Existing Customer</span>
            </div>
          </div>
          <div className="grid w-full grid-cols-3 rounded-full bg-black/[0.055] p-1 text-sm font-medium text-black/45 xl:w-[300px]">
            {(["weekly", "monthly", "yearly"] as const).map((option) => (
              <button
                key={option}
                onClick={() => setRange(option)}
                className={cn(
                  "h-8 rounded-full capitalize transition-all",
                  range === option && "bg-white text-slate-800 shadow-sm ring-1 ring-black/5"
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-visible pb-2">
          <div className="min-w-0">
            <div className="grid grid-cols-[92px_1fr] gap-4">
              <div className="space-y-[8px] pt-0.5 text-left text-[13px] leading-4 text-black/35">
                {["60k", "50k", "40k", "30k", "20k", "10k", "0k"].map((label) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="w-8">{label}</span>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-black/25" />
                    <span className="h-px flex-1 border-t border-dotted border-black/20" />
                  </div>
                ))}
              </div>
              <div ref={chartRef} className="relative">
                <div className="grid w-full gap-[5px]" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
                  {weeks.map((week, weekIndex) => (
                    <div key={weekIndex} className="flex min-w-0 flex-col items-center gap-[8px]">
                      {week.map((day) => (
                        <button
                          key={day.date}
                          type="button"
                          onMouseEnter={(event) => showTooltip(day, event.currentTarget)}
                          onFocus={(event) => showTooltip(day, event.currentTarget)}
                          onMouseLeave={() => setActive(null)}
                          onBlur={() => setActive(null)}
                          className="aspect-square w-full max-w-4 rounded-[4px] transition-transform hover:scale-125 focus:outline-none focus:ring-1 focus:ring-black/30"
                          style={{ backgroundColor: colors[Math.max(0, Math.min(4, day.intensity))] }}
                        />
                      ))}
                    </div>
                  ))}
                </div>
                {active && (
                  <div
                    className="pointer-events-none absolute z-20 w-[210px] -translate-x-1/2 -translate-y-full rounded-2xl border border-black/10 bg-white p-3 text-sm text-black/55 shadow-xl ring-1 ring-black/[0.03]"
                    style={{ left: active.x, top: active.y }}
                  >
                    <div className="mb-2 rounded-xl bg-black/[0.035] px-3 py-2 font-medium text-black/45">
                      {format(parseISO(active.date), "MMM d, yyyy")}
                    </div>
                    <div className="space-y-2 px-1">
                      <p className="flex items-center justify-between gap-3"><span className="text-black/35">New Customer</span><span className="font-semibold text-black">{fmtBDT(active.newCustomerRevenue)}</span></p>
                      <p className="flex items-center justify-between gap-3"><span className="text-black/35">Existing Customer</span><span className="font-semibold text-black">{fmtBDT(active.existingCustomerRevenue)}</span></p>
                    </div>
                  </div>
                )}
                <div className="relative mt-7 h-4">
                  {monthLabels.map((month, index) => (
                    <span key={`${month.label}-${index}`} className="absolute -translate-x-1/2 text-xs font-medium uppercase tracking-[0.16em] text-black/35 first:translate-x-0 last:-translate-x-full" style={{ left: month.left }}>
                      {month.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end border-t border-black/[0.06] pt-4">
          <div className="flex items-center gap-2 text-xs text-black/40">
            <span>Less</span>
            {colors.map((color) => <span key={color} className="h-3 w-3 rounded-[4px]" style={{ backgroundColor: color }} />)}
            <span>More</span>
          </div>
        </div>
      </div>
    </section>
  );
}
