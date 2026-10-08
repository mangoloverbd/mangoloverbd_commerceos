import { useState, type ComponentType } from "react";
import type { DateRange } from "react-day-picker";
import { CaretDown, Check, Headset, PencilSimpleLine, Phone, SquaresFour, TrendUp, type Icon as PhosphorIcon } from "@phosphor-icons/react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Dropdown, DropdownDivider, DropdownGroup, DropdownItem, DropdownPopover, DropdownTrigger } from "@/components/base/dropdown/dropdown";
import { CustomWebsiteLogo, FacebookLogo, InstagramLogo, WhatsAppLogo } from "@/components/IntegrationLogos";
import { ORDER_SOURCE_OPTIONS } from "@/lib/orderSource";

export const HOME_CHANNELS = [{ value: "all", label: "All channels" }, ...ORDER_SOURCE_OPTIONS] as const;
export type HomeChannel = (typeof HOME_CHANNELS)[number]["value"];

type ChannelLogo = ComponentType<{ className?: string }>;

// A Phosphor icon in one colour, for channels without a brand mark.
const tinted = (Icon: PhosphorIcon, color: string): ChannelLogo => function TintedIcon({ className }) {
  return <Icon weight="light" color={color} className={className} aria-hidden="true" />;
};

// Full-colour marks from Settings → Integrations where the channel has one.
const CHANNEL_LOGOS: Record<HomeChannel, ChannelLogo> = {
  all: tinted(SquaresFour, "#E0861B"),
  website: CustomWebsiteLogo,
  facebook: FacebookLogo,
  instagram: InstagramLogo,
  whatsapp: WhatsAppLogo,
  phone: tinted(Phone, "#14877B"),
  telesales: tinted(Headset, "#6D4AE0"),
  upsell: tinted(TrendUp, "#2B7A36"),
  manual_other: tinted(PencilSimpleLine, "#6F6D68"),
};

// "Today · All channels": the period and the order source the metric strip reports on.
export function HomeScopeControls({ range, onRangeChange, channel, onChannelChange }: {
  range: DateRange | null;
  onRangeChange: (range: DateRange | null) => void;
  channel: HomeChannel;
  onChannelChange: (channel: HomeChannel) => void;
}) {
  const [open, setOpen] = useState(false);
  const channelLabel = HOME_CHANNELS.find((option) => option.value === channel)?.label ?? "All channels";
  const [all, ...sources] = HOME_CHANNELS;
  const item = ({ value, label }: { value: HomeChannel; label: string }) => {
    const Logo = CHANNEL_LOGOS[value];
    const selected = value === channel;
    return (
      <DropdownItem
        key={value}
        selected={selected}
        onSelect={() => { onChannelChange(value); setOpen(false); }}
        className="gap-2 rounded-lg px-1.5 py-1"
      >
        {/* Same white logo tile as Settings → Integrations. */}
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border border-black/[0.07] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <Logo className="h-3.5 w-3.5" />
        </span>
        <span className={`flex-1 text-[13px] ${selected ? "font-medium text-text-primary" : "text-text-secondary"}`}>{label}</span>
        {selected && <Check weight="bold" size={12} aria-hidden="true" className="text-text-primary" />}
      </DropdownItem>
    );
  };
  return (
    <div className="flex items-center pt-0.5 text-[14px] text-[#6F6D68]">
      <DateRangePicker value={range} onChange={onRangeChange} variant="plain" placement="bottom start" />
      <span aria-hidden="true">·</span>
      <Dropdown isOpen={open} onOpenChange={setOpen}>
        <DropdownTrigger
          aria-label={`Channel: ${channelLabel}`}
          className={`flex items-center gap-1 rounded-lg px-2 py-1 transition-colors hover:bg-[#F2F1EC] hover:text-[#111110] ${open ? "bg-[#F2F1EC] text-[#111110]" : ""}`}
        >
          {channelLabel}
          <CaretDown weight="light" size={12} aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </DropdownTrigger>
        <DropdownPopover aria-label="Channel" placement="bottom start" offset={6} className="w-[188px] rounded-xl p-1.5">
          <DropdownGroup>{item(all)}</DropdownGroup>
          <DropdownDivider className="-mx-1.5 my-1" />
          <DropdownGroup>{sources.map(item)}</DropdownGroup>
        </DropdownPopover>
      </Dropdown>
    </div>
  );
}
