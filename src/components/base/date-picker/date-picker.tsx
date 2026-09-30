import { useRef, useState } from "react";
import { format } from "date-fns";
import { Button as AriaButton, Calendar, Dialog, DialogTrigger, Popover as AriaPopover } from "react-aria-components";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { ChevronDown } from "lucide-react";
import { X } from "@phosphor-icons/react";
import { SolarCalendarIcon } from "@/components/SolarDateIcons";
import { Button } from "@/components/base/buttons/button";
import { MonthPanel, popoverClassName } from "@/components/base/date-picker/shared";
import { cn } from "@/lib/utils";
import { useDismissOnOutsidePress, useTriggerToggle } from "@/utils/use-dismiss-on-outside-press";
import { getBangladeshDateKey } from "../../../../shared/orderHold.js";

/**
 * Single-date counterpart of `DateRangePicker`: the same trigger chrome,
 * popover card and month panel, around react-aria's `Calendar`. Values are
 * `YYYY-MM-DD` strings (or null) so forms can store them directly.
 */
export function DatePicker({
  value,
  onChange,
  isDisabled,
  placeholder = "Pick a date",
  className,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  isDisabled?: boolean;
  placeholder?: string;
  className?: string;
  "aria-label": string;
  "aria-describedby"?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLElement>(null);
  useDismissOnOutsidePress(isOpen, () => setIsOpen(false), [triggerRef, popoverRef]);
  const allowOpenChange = useTriggerToggle(isOpen, triggerRef);

  let selected: CalendarDate | null = null;
  try { selected = value ? parseDate(value) : null; } catch { selected = null; }
  const label = selected ? format(new Date(selected.year, selected.month - 1, selected.day), "MMM d, yyyy") : placeholder;
  const pick = (next: string | null) => { onChange(next); setIsOpen(false); };

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={(open) => allowOpenChange(open) && setIsOpen(open)}>
      <span className={cn("relative flex", className)}>
        <AriaButton
          ref={triggerRef}
          isDisabled={isDisabled}
          aria-label={`${ariaLabel}: ${selected ? label : "not set"}`}
          aria-describedby={ariaDescribedBy}
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 text-[13px] transition-all hover:border-foreground/30 disabled:opacity-60",
            selected ? "text-foreground pr-9" : "text-foreground/45",
          )}
        >
          <SolarCalendarIcon size={15} className="shrink-0 text-foreground/70" />
          <span className="flex-1 text-left">{label}</span>
          {!selected && <ChevronDown className="h-3 w-3 opacity-50" />}
        </AriaButton>
        {selected && !isDisabled && (
          <button
            type="button"
            aria-label={`Clear ${ariaLabel.toLowerCase()}`}
            onClick={() => onChange(null)}
            className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-foreground/50 transition-colors hover:bg-black/[0.05] hover:text-foreground"
          >
            <X weight="light" size={13} />
          </button>
        )}
      </span>
      <AriaPopover ref={popoverRef} offset={4} placement="bottom start" isNonModal className={popoverClassName}>
        <Dialog aria-label={ariaLabel} className="outline-none">
          <Calendar aria-label={ariaLabel} value={selected} onChange={(date) => pick(date.toString())}>
            <div className="flex flex-col gap-2 p-2">
              <MonthPanel offset={0} showPrev showNext />
              <div className="flex items-center justify-between gap-2 px-1">
                <Button variant="ghost" size="small" onClick={() => pick(null)}>Clear</Button>
                <Button variant="secondary" size="small" onClick={() => pick(getBangladeshDateKey())}>Today</Button>
              </div>
            </div>
          </Calendar>
        </Dialog>
      </AriaPopover>
    </DialogTrigger>
  );
}
