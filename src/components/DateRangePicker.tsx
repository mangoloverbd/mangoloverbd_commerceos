import { useRef, useState, type ReactNode } from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  Popover as AriaPopover,
  RangeCalendar,
} from "react-aria-components";
import { CalendarDate } from "@internationalized/date";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/base/buttons/button";
import { DateChipInput, MonthPanel, popoverClassName } from "@/components/base/date-picker/shared";
import { buildDateRangePresets } from "@/lib/dateRangePresets";
import { cn } from "@/lib/utils";
import { useDismissOnOutsidePress, useTriggerToggle } from "@/utils/use-dismiss-on-outside-press";

/**
 * The trigger button (icon, date-range text, border) is this app's own —
 * unchanged from before BoardUI. Only the popover CARD (dual-month range
 * calendar, quick-select list, editable date chips, Cancel/Apply footer) is
 * BoardUI's `date-range-picker` (`npx boardui@latest add date-range-picker`),
 * wired up here instead of through its own bundled trigger so both stay in
 * sync with this app's Dhaka-aware presets and nullable "All Time" state.
 */

type DateRangeValue = { start: CalendarDate; end: CalendarDate };

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

function toCalendarDate(date: Date): CalendarDate {
  return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function fromCalendarDate(date: CalendarDate): Date {
  return new Date(date.year, date.month - 1, date.day);
}

function toDateRangeValue(range: DateRange | null): DateRangeValue | null {
  if (!range?.from) return null;
  const start = toCalendarDate(range.from);
  const end = range.to ? toCalendarDate(range.to) : start;
  return { start, end };
}

function toDateRange(value: DateRangeValue): DateRange {
  return { from: fromCalendarDate(value.start), to: fromCalendarDate(value.end) };
}

function daysInRange(value: DateRangeValue) {
  const ms = value.end.compare(value.start) * 86_400_000;
  return Math.round(ms / 86_400_000) + 1;
}

const TODAY = dhakaToday();
const MAX_DATE = toCalendarDate(TODAY);
const PRESETS = buildDateRangePresets(TODAY);

function QuickSelect({
  activeLabel,
  onSelect,
}: {
  activeLabel: string;
  onSelect: (range: DateRange | null) => void;
}) {
  return (
    <div className="flex w-[132px] shrink-0 flex-col gap-0.5">
      {PRESETS.map((preset) => (
        <button
          key={preset.label}
          type="button"
          onClick={() => onSelect(preset.range)}
          className={cn(
            "w-full cursor-pointer whitespace-nowrap rounded-lg px-2.5 py-0.5 text-left text-caption-1-medium text-text-primary transition-colors duration-150 ease",
            preset.label === activeLabel
              ? "bg-background-tertiary-default"
              : "hover:bg-background-secondary-hover",
          )}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

function Footer({
  value,
  onChange,
  onCancel,
  onApply,
}: {
  value: DateRangeValue | null;
  onChange: (value: DateRangeValue) => void;
  onCancel: () => void;
  onApply: () => void;
}) {
  return (
    <div className="flex items-center justify-between pt-2 pr-2">
      <div className="flex items-center gap-1.5">
        <AnimatePresence>
          {value && (
            <motion.div
              key="range-summary"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25, ease: [0.34, 1.2, 0.64, 1] }}
              className="flex items-center gap-1.5"
            >
              <div className="flex items-center gap-1">
                <DateChipInput
                  date={value.start}
                  label="Start date"
                  onCommit={(start) =>
                    onChange({ start, end: start.compare(value.end) > 0 ? start : value.end })
                  }
                />
                <span className="text-caption-1-medium text-text-secondary">-</span>
                <DateChipInput
                  date={value.end}
                  label="End date"
                  onCommit={(end) =>
                    onChange({ start: end.compare(value.start) < 0 ? end : value.start, end })
                  }
                />
              </div>
              <span className="rounded-lg bg-background-tertiary-default px-1.5 py-1.5 text-caption-1-medium text-text-secondary">
                {daysInRange(value)} day{daysInRange(value) === 1 ? "" : "s"} selected
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-1.5">
        <Button type="button" size="small" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="small" onClick={onApply} disabled={!value}>
          Apply
        </Button>
      </div>
    </div>
  );
}

export function DateRangePicker({
  value,
  onChange,
  children,
  triggerClassName = "",
}: {
  value: DateRange | null;
  onChange: (r: DateRange | null) => void;
  children?: ReactNode;
  triggerClassName?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingValue, setPendingValue] = useState<DateRangeValue | null>(toDateRangeValue(value));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLElement>(null);
  useDismissOnOutsidePress(isOpen, () => setIsOpen(false), [triggerRef, popoverRef]);
  const allowOpenChange = useTriggerToggle(isOpen, triggerRef);

  const activePresetLabel = (
    PRESETS.find((p) => {
      if (!p.range && !value) return true;
      if (!p.range || !value) return false;
      return (
        p.range.from && value.from && toYMD(p.range.from) === toYMD(value.from) &&
        p.range.to && value.to && toYMD(p.range.to) === toYMD(value.to)
      );
    })?.label ?? "All Time"
  );

  const trigger = (
    <AriaButton
      ref={triggerRef}
      data-testid="button-date-range-picker"
      className="flex items-center gap-2 h-8 px-3 text-[11px] font-medium text-foreground/70 hover:text-foreground border border-border hover:border-foreground/30 rounded-lg bg-background transition-all"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" className="shrink-0"><path fill="currentColor" d="M6.96 2c.418 0 .756.31.756.692V4.09c.67-.012 1.422-.012 2.268-.012h4.032c.846 0 1.597 0 2.268.012V2.692c0-.382.338-.692.756-.692s.756.31.756.692V4.15c1.45.106 2.403.368 3.103 1.008c.7.641.985 1.513 1.101 2.842v1H2V8c.116-1.329.401-2.2 1.101-2.842c.7-.64 1.652-.902 3.103-1.008V2.692c0-.382.339-.692.756-.692"/><path fill="currentColor" d="M22 14v-2c0-.839-.013-2.335-.026-3H2.006c-.013.665 0 2.161 0 3v2c0 3.771 0 5.657 1.17 6.828C4.349 22 6.234 22 10.004 22h4c3.77 0 5.654 0 6.826-1.172S22 17.771 22 14" opacity=".5"/><path fill="currentColor" d="M18 16.5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 0 1 3 0"/></svg>
      {fmtRange(value)}
      <ChevronDown className="h-3 w-3 opacity-50" />
    </AriaButton>
  );

  const popover = (
    <AriaPopover ref={popoverRef} offset={4} placement="bottom end" isNonModal className={popoverClassName}>
      <Dialog aria-label="Date range" className="outline-none">
        {({ close }) => (
          <RangeCalendar
            aria-label="Date range"
            visibleDuration={{ months: 2 }}
            value={pendingValue}
            onChange={setPendingValue}
            maxValue={MAX_DATE}
          >
            <div className="flex gap-2">
              <div className="pt-2 pl-3">
                <QuickSelect
                  activeLabel={activePresetLabel}
                  onSelect={(range) => {
                    onChange(range);
                    close();
                  }}
                />
              </div>
              <div className="flex flex-col pt-2 pr-2 pb-2">
                <div className="flex gap-2">
                  <MonthPanel offset={0} showPrev />
                  <MonthPanel offset={1} showNext />
                </div>
                <Footer
                  value={pendingValue}
                  onChange={setPendingValue}
                  onCancel={() => {
                    setPendingValue(toDateRangeValue(value));
                    close();
                  }}
                  onApply={() => {
                    if (pendingValue) onChange(toDateRange(pendingValue));
                    close();
                  }}
                />
              </div>
            </div>
          </RangeCalendar>
        )}
      </Dialog>
    </AriaPopover>
  );

  const handleOpenChange = (open: boolean) => {
    if (!allowOpenChange(open)) return;
    if (open) setPendingValue(toDateRangeValue(value));
    setIsOpen(open);
  };

  if (!children) {
    return (
      <DialogTrigger isOpen={isOpen} onOpenChange={handleOpenChange}>
        <span className={cn("uv-beam rounded-full", triggerClassName)}>{trigger}</span>
        {popover}
      </DialogTrigger>
    );
  }

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={handleOpenChange}>
      <div className="mt-4 flex flex-row flex-wrap items-center justify-center gap-4 text-center">
        {children}
        <span className={cn("uv-beam rounded-full", triggerClassName)}>{trigger}</span>
      </div>
      {popover}
    </DialogTrigger>
  );
}
