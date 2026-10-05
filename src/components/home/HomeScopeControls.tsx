import type { DateRange } from "react-day-picker";
import { CaretDown } from "@phosphor-icons/react";
import { DateRangePicker } from "@/components/DateRangePicker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ORDER_SOURCE_OPTIONS } from "@/lib/orderSource";

export const HOME_CHANNELS = [{ value: "all", label: "All channels" }, ...ORDER_SOURCE_OPTIONS] as const;
export type HomeChannel = (typeof HOME_CHANNELS)[number]["value"];

// "Today · All channels": the period and the order source the metric strip reports on.
export function HomeScopeControls({ range, onRangeChange, channel, onChannelChange }: {
  range: DateRange | null;
  onRangeChange: (range: DateRange | null) => void;
  channel: HomeChannel;
  onChannelChange: (channel: HomeChannel) => void;
}) {
  const channelLabel = HOME_CHANNELS.find((option) => option.value === channel)?.label ?? "All channels";
  return (
    <div className="flex items-center gap-0.5 pt-0.5 text-[14px] text-[#55534E]">
      <DateRangePicker value={range} onChange={onRangeChange} variant="plain" placement="bottom start" />
      <span aria-hidden="true">·</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Channel: ${channelLabel}`}
          className="flex items-center gap-1 rounded-lg px-2 py-1 outline-none transition-colors hover:bg-[#F2F1EC] hover:text-[#111110] focus-visible:ring-2 focus-visible:ring-black"
        >
          {channelLabel}
          <CaretDown weight="light" size={12} className="opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px]">
          <DropdownMenuRadioGroup value={channel} onValueChange={(value) => onChannelChange(value as HomeChannel)}>
            {HOME_CHANNELS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
