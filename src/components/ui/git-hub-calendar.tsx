import { useMemo, useState } from "react";
import { addDays, format, parseISO, startOfWeek, subDays } from "date-fns";
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
};

const colors = ["#f2f1ef", "#dad9d6", "#aaa9a5", "#686763", "#171717"];
const dayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];

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

export function GitHubCalendar({ data, loading = false }: GitHubCalendarProps) {
  const [range, setRange] = useState<"weekly" | "monthly" | "yearly">("monthly");
  const [active, setActive] = useState<SalesTrendDay | null>(null);
  const rangeDays = range === "weekly" ? 91 : range === "monthly" ? 365 : 365;
  const calendarDays = useMemo(() => buildCalendarDays(data, rangeDays), [data, rangeDays]);
  const weeks = useMemo(() => {
    const grouped: SalesTrendDay[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) grouped.push(calendarDays.slice(i, i + 7));
    return grouped;
  }, [calendarDays]);

  const visibleData = calendarDays.filter((day) => data.some((source) => source.date === day.date));
  const totalRevenue = visibleData.reduce((sum, day) => sum + day.totalRevenue, 0);
  const monthLabels = weeks
    .map((week, index) => ({ week: index, label: format(parseISO(week[0].date), "MMM") }))
    .filter((item, index, arr) => index === 0 || item.label !== arr[index - 1].label);

  return (
    <section className="overflow-hidden rounded-2xl border border-black/10 bg-white">
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
              <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-black/10" /> New User</span>
              <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-black" /> Existing User</span>
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

        <div className="overflow-x-auto pb-2">
          <div className="min-w-[920px]">
            <div className="grid grid-cols-[58px_1fr] gap-4">
              <div className="space-y-[12px] pt-2 text-right text-[13px] text-black/35">
                {["60k", "50k", "40k", "30k", "20k", "10k", "0k"].map((label) => <div key={label}>{label}</div>)}
              </div>
              <div>
                <div className="flex gap-[5px]">
                  <div className="mr-1 flex flex-col gap-[5px] text-[10px] text-black/30">
                    {dayLabels.map((label, index) => <div key={`${label}-${index}`} className="h-2.5 w-7 leading-[10px]">{label}</div>)}
                  </div>
                  {weeks.map((week, weekIndex) => (
                    <div key={weekIndex} className="flex flex-col gap-[5px]">
                      {week.map((day) => (
                        <button
                          key={day.date}
                          type="button"
                          onMouseEnter={() => setActive(day)}
                          onFocus={() => setActive(day)}
                          className="h-2.5 w-2.5 rounded-[3px] transition-transform hover:scale-125 focus:outline-none focus:ring-1 focus:ring-black/30"
                          style={{ backgroundColor: colors[Math.max(0, Math.min(4, day.intensity))] }}
                          title={`${format(parseISO(day.date), "PPP")}: ${fmtBDT(day.totalRevenue)}`}
                        />
                      ))}
                    </div>
                  ))}
                </div>
                <div className="relative mt-4 h-4">
                  {monthLabels.map((month) => (
                    <span key={`${month.label}-${month.week}`} className="absolute text-xs font-medium uppercase tracking-[0.16em] text-black/35" style={{ left: `${(month.week / Math.max(weeks.length - 1, 1)) * 100}%` }}>
                      {month.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 border-t border-black/[0.06] pt-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-h-[76px] rounded-2xl border border-black/10 bg-[#F8F7F5] px-4 py-3 text-sm text-black/55 shadow-sm">
            {active ? (
              <div className="space-y-1">
                <p className="font-medium text-black/45">{format(parseISO(active.date), "MMM d, yyyy")}</p>
                <p><span className="text-black/35">New User</span> <span className="font-semibold text-black">{fmtBDT(active.newCustomerRevenue)}</span></p>
                <p><span className="text-black/35">Existing User</span> <span className="font-semibold text-black">{fmtBDT(active.existingCustomerRevenue)}</span></p>
              </div>
            ) : (
              <span>Hover a square to inspect daily new and existing customer sales.</span>
            )}
          </div>
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
