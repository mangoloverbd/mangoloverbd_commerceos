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
import { CalendarBlank, ChartBar, Infinity as InfinityIcon } from "@phosphor-icons/react";
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

function YesterdayIcon({ size = 17, className }: { size?: number | string; className?: string; weight?: unknown }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true" focusable="false">
      <path fillRule="evenodd" clipRule="evenodd" d="M2.93077 11.2003C3.00244 6.23968 7.07619 2.25 12.0789 2.25C15.3873 2.25 18.287 3.99427 19.8934 6.60721C20.1103 6.96007 20.0001 7.42199 19.6473 7.63892C19.2944 7.85585 18.8325 7.74565 18.6156 7.39279C17.2727 5.20845 14.8484 3.75 12.0789 3.75C7.8945 3.75 4.50372 7.0777 4.431 11.1982L4.83138 10.8009C5.12542 10.5092 5.60029 10.511 5.89203 10.8051C6.18377 11.0991 6.18191 11.574 5.88787 11.8657L4.20805 13.5324C3.91565 13.8225 3.44398 13.8225 3.15157 13.5324L1.47176 11.8657C1.17772 11.574 1.17585 11.0991 1.46759 10.8051C1.75933 10.5111 2.2342 10.5092 2.52824 10.8009L2.93077 11.2003ZM19.7864 10.4666C20.0786 10.1778 20.5487 10.1778 20.8409 10.4666L22.5271 12.1333C22.8217 12.4244 22.8245 12.8993 22.5333 13.1939C22.2421 13.4885 21.7673 13.4913 21.4727 13.2001L21.0628 12.7949C20.9934 17.7604 16.9017 21.75 11.8825 21.75C8.56379 21.75 5.65381 20.007 4.0412 17.3939C3.82366 17.0414 3.93307 16.5793 4.28557 16.3618C4.63806 16.1442 5.10016 16.2536 5.31769 16.6061C6.6656 18.7903 9.09999 20.25 11.8825 20.25C16.0887 20.25 19.4922 16.9171 19.5625 12.7969L19.1546 13.2001C18.86 13.4913 18.3852 13.4885 18.094 13.1939C17.8028 12.8993 17.8056 12.4244 18.1002 12.1333L19.7864 10.4666Z" fill="currentColor" />
    </svg>
  );
}

function presetIcon(label: string) {
  if (label === "All Time") return InfinityIcon;
  if (label === "Yesterday") return YesterdayIcon;
  if (label === "Last 7 Days" || label === "Last 30 Days" || label === "Last 90 Days") return ChartBar;
  return CalendarBlank;
}

const PRESET_GROUP_BREAKS = new Set([3, 6]);

function QuickSelect({
  activeLabel,
  onSelect,
}: {
  activeLabel: string;
  onSelect: (range: DateRange | null) => void;
}) {
  return (
    <div className="flex w-[172px] shrink-0 flex-col px-1.5 py-1">
      {PRESETS.map((preset, index) => {
        const Icon = presetIcon(preset.label);
        const active = preset.label === activeLabel;
        return (
          <div key={preset.label}>
            {PRESET_GROUP_BREAKS.has(index) && <div className="mx-1 my-0.5 border-t border-black/[0.08]" />}
            <button
              type="button"
              onClick={() => onSelect(preset.range)}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors duration-150 ease",
                active
                  ? "bg-[#e8f0fe] font-medium text-[#1a73e8]"
                  : "font-normal text-black hover:bg-black/[0.04]",
              )}
            >
              <Icon weight="light" size={17} className={cn("shrink-0", active ? "text-[#1a73e8]" : "text-black/45")} />
              {preset.label}
            </button>
          </div>
        );
      })}
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
  placement = "bottom end",
}: {
  value: DateRange | null;
  onChange: (r: DateRange | null) => void;
  children?: ReactNode;
  triggerClassName?: string;
  placement?: "bottom" | "bottom start" | "bottom end";
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
    <AriaPopover ref={popoverRef} offset={4} placement={placement} isNonModal className={popoverClassName}>
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
