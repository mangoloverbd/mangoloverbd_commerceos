import { useState } from "react";
import { format, subDays, startOfMonth, startOfYear } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

function toYMD(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function fmtRange(range: DateRange | null): string {
  if (!range?.from) return "All Time";
  const from = format(range.from, "MMM d");
  if (!range.to || toYMD(range.from) === toYMD(range.to))
    return `${from}, ${format(range.from, "yyyy")}`;
  const to = format(range.to, "MMM d, yyyy");
  return `${from} – ${to}`;
}

function dhakaToday(): Date {
  const dhakaMs = Date.now() + 6 * 60 * 60 * 1000;
  const d = new Date(dhakaMs);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

const TODAY = dhakaToday();

const PRESETS: { label: string; range: DateRange | null }[] = [
  { label: "All Time",     range: null },
  { label: "Today",        range: { from: TODAY, to: TODAY } },
  { label: "Yesterday",    range: { from: subDays(TODAY, 1), to: subDays(TODAY, 1) } },
  { label: "Last 7 Days",  range: { from: subDays(TODAY, 6), to: TODAY } },
  { label: "Last 30 Days", range: { from: subDays(TODAY, 29), to: TODAY } },
  { label: "Last 90 Days", range: { from: subDays(TODAY, 89), to: TODAY } },
  { label: "This Month",   range: { from: startOfMonth(TODAY), to: TODAY } },
  { label: "This Year",    range: { from: startOfYear(TODAY), to: TODAY } },
];

export function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange | null;
  onChange: (r: DateRange | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<DateRange | undefined>(value ?? undefined);

  const activePreset = PRESETS.find((p) => {
    if (!p.range && !value) return true;
    if (!p.range || !value) return false;
    return (
      p.range.from && value.from && toYMD(p.range.from) === toYMD(value.from) &&
      p.range.to   && value.to   && toYMD(p.range.to)   === toYMD(value.to)
    );
  });

  const apply = (r: DateRange | null) => {
    onChange(r);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-2 h-8 px-3 text-[11px] font-medium text-foreground/70 hover:text-foreground border border-border hover:border-foreground/30 rounded-lg bg-background transition-all"
          data-testid="button-date-range-picker"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" className="shrink-0"><path fill="currentColor" d="M6.96 2c.418 0 .756.31.756.692V4.09c.67-.012 1.422-.012 2.268-.012h4.032c.846 0 1.597 0 2.268.012V2.692c0-.382.338-.692.756-.692s.756.31.756.692V4.15c1.45.106 2.403.368 3.103 1.008c.7.641.985 1.513 1.101 2.842v1H2V8c.116-1.329.401-2.2 1.101-2.842c.7-.64 1.652-.902 3.103-1.008V2.692c0-.382.339-.692.756-.692"/><path fill="currentColor" d="M22 14v-2c0-.839-.013-2.335-.026-3H2.006c-.013.665 0 2.161 0 3v2c0 3.771 0 5.657 1.17 6.828C4.349 22 6.234 22 10.004 22h4c3.77 0 5.654 0 6.826-1.172S22 17.771 22 14" opacity=".5"/><path fill="currentColor" d="M18 16.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0"/></svg>
          {fmtRange(value)}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0 rounded-xl border border-black/10 bg-white shadow-[0_8px_32px_rgba(0,0,0,0.08)]">
        <div className="flex">
          <div className="border-r border-black/[0.06] py-3 w-32 flex flex-col">
            <p className="text-[8px] font-semibold tracking-widest text-black/30 uppercase px-3 pb-2">Preset</p>
            {PRESETS.map((p) => {
              const isActive = p.label === (activePreset?.label ?? "All Time");
              return (
                <button
                  key={p.label}
                  onClick={() => apply(p.range)}
                  className={cn(
                    "text-left px-3 py-[7px] text-[11px] transition-colors rounded-md mx-1",
                    isActive
                      ? "text-[#202020] font-semibold bg-[#F3F3F3]"
                      : "text-black/50 hover:text-[#202020] hover:bg-black/[0.04]"
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="p-3">
            <p className="text-[8px] font-semibold tracking-widest text-black/30 uppercase px-1 pb-2">Custom Range</p>
            <Calendar
              mode="range"
              selected={pending}
              onSelect={(r) => {
                setPending(r);
                if (r?.from && r?.to) apply(r);
              }}
              className="p-0"
              classNames={{
                months: "flex flex-col sm:flex-row space-y-3 sm:space-x-4 sm:space-y-0",
                month: "space-y-2",
                caption: "flex justify-center pt-0.5 relative items-center",
                caption_label: "text-[13px] font-semibold text-[#202020]",
                nav_button: "h-7 w-7 bg-transparent p-0 opacity-40 hover:opacity-100 transition-opacity",
                nav_button_previous: "absolute left-1",
                nav_button_next: "absolute right-1",
                table: "w-full border-collapse space-y-0",
                head_row: "flex",
                head_cell: "text-black/30 rounded-md w-8 font-medium text-[10px] uppercase",
                row: "flex w-full mt-0.5",
                cell: "h-8 w-8 text-center text-xs p-0 relative first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                day: "h-8 w-8 p-0 text-xs font-normal rounded-md transition-colors duration-150",
                day_range_middle: "bg-black/[0.06] rounded-none aria-selected:bg-black/[0.06] aria-selected:text-[#202020]",
                day_selected: "bg-[#202020] text-white hover:bg-[#202020]/90 focus:bg-[#202020] focus:text-white",
                day_today: "font-bold text-[#202020]",
                day_outside: "text-black/20",
                day_disabled: "text-black/15",
                day_hidden: "invisible",
              }}
              numberOfMonths={2}
              toDate={TODAY}
            />
            {pending?.from && !pending?.to && (
              <p className="text-[10px] text-black/40 text-center pt-1">Select an end date</p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
