import { Select, SelectItem } from "@/components/base/select/select";
import { ORDER_SOURCE_OPTIONS, type OrderSource } from "@/lib/orderSource";

type OrderSourceSelectProps = {
  value: OrderSource;
  onChange: (source: OrderSource) => void;
  disabled?: boolean;
  compact?: boolean;
};

export function OrderSourceSelect({ value, onChange, disabled = false, compact = false }: OrderSourceSelectProps) {
  return (
    <Select
      aria-label="Order source"
      selectedKey={value}
      onSelectionChange={(key) => onChange(String(key) as OrderSource)}
      isDisabled={disabled}
      size={compact ? "sm" : "md"}
      triggerClassName={compact ? "h-8 min-w-0 text-[12px]" : "h-10 min-w-0 text-[13px]"}
    >
      {ORDER_SOURCE_OPTIONS.map((source) => (
        <SelectItem key={source.value} id={source.value} textValue={source.label}>
          {source.label}
        </SelectItem>
      ))}
    </Select>
  );
}
