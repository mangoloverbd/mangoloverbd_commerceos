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
import { X } from "@phosphor-icons/react";
import {
  SolarCalendarIcon,
  SolarCalendarMarkIcon,
  SolarCalendarMinimalisticIcon,
  SolarCalendarSearchIcon,
  SolarGraphUpIcon,
  SolarHistoryIcon,
  SolarInfinityIcon,
  SolarStarIcon,
} from "@/components/SolarDateIcons";
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

const PRESET_ICONS: Record<string, typeof SolarCalendarIcon> = {
  "All Time": SolarInfinityIcon,
  Today: SolarCalendarMinimalisticIcon,
  Yesterday: SolarHistoryIcon,
  "Last 7 Days": SolarGraphUpIcon,
  "Last 30 Days": SolarGraphUpIcon,
  "Last 90 Days": SolarGraphUpIcon,
  "This Week": SolarCalendarMarkIcon,
  "This Month": SolarCalendarIcon,
  "Last Month": SolarCalendarSearchIcon,
  "This Year": SolarStarIcon,
};

function presetIcon(label: string) {
  return PRESET_ICONS[label] ?? SolarCalendarIcon;
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
  onReset,
}: {
  value: DateRangeValue | null;
  onChange: (value: DateRangeValue) => void;
  onCancel: () => void;
  onApply: () => void;
  onReset: () => void;
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
        <Button type="button" size="small" variant="ghost" onClick={onReset}>
          Reset
        </Button>
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
  variant = "beam",
}: {
  value: DateRange | null;
  onChange: (r: DateRange | null) => void;
  children?: ReactNode;
  triggerClassName?: string;
  placement?: "bottom" | "bottom start" | "bottom end";
  /**
   * "toolbar" drops the animated beam ring and matches the h-9 toolbar controls.
   * "plain" is a borderless text trigger showing the preset name (Home's metric strip).
   */
  variant?: "beam" | "toolbar" | "plain";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingValue, setPendingValue] = useState<DateRangeValue | null>(toDateRangeValue(value));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLElement>(null);
  useDismissOnOutsidePress(isOpen, () => setIsOpen(false), [triggerRef, popoverRef]);
  const allowOpenChange = useTriggerToggle(isOpen, triggerRef);

  const matchedPreset = (
    PRESETS.find((p) => {
      if (!p.range && !value) return true;
      if (!p.range || !value) return false;
      return (
        p.range.from && value.from && toYMD(p.range.from) === toYMD(value.from) &&
        p.range.to && value.to && toYMD(p.range.to) === toYMD(value.to)
      );
    })?.label
  );
  const activePresetLabel = matchedPreset ?? "All Time";

  const trigger = variant === "plain" ? (
    <AriaButton
      ref={triggerRef}
      data-testid="button-date-range-picker"
      className="flex items-center rounded-lg px-2 py-1 text-[14px] font-medium text-[#111110] outline-none transition-colors hover:bg-[#F2F1EC] focus-visible:ring-2 focus-visible:ring-black"
    >
      {matchedPreset ?? fmtRange(value)}
    </AriaButton>
  ) : (
    <AriaButton
      ref={triggerRef}
      data-testid="button-date-range-picker"
      className={cn(
        "flex items-center gap-2 px-3 text-[11px] font-medium text-foreground/70 hover:text-foreground border border-border hover:border-foreground/30 rounded-lg bg-background transition-all",
        variant === "toolbar" ? "h-9 whitespace-nowrap" : "h-8",
        // Leaves room for the reset × so it sits beside the arrow, not on it.
        variant === "toolbar" && value?.from && "pr-9",
      )}
    >
      <SolarCalendarIcon size={15} className="shrink-0" />
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
                  onReset={() => {
                    setPendingValue(null);
                    onChange(null);
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
        <span className={cn(variant === "toolbar" || variant === "plain" ? "relative inline-flex" : "uv-beam rounded-full", triggerClassName)}>
          {trigger}
          {variant === "toolbar" && value?.from && (
            <button
              type="button"
              aria-label="Reset date range"
              onClick={() => onChange(null)}
              className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-foreground/50 transition-colors hover:bg-black/[0.05] hover:text-foreground"
            >
              <X weight="light" size={13} />
            </button>
          )}
        </span>
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
