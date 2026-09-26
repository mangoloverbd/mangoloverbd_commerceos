import { CalendarBlank } from "@phosphor-icons/react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select as BuiSelect, SelectItem as BuiSelectItem } from "@/components/base/select/select";
import { getBangladeshDateKey, ORDER_HOLD_REASONS } from "../../../shared/orderHold.js";

export type OrderHoldMetadata = {
  hold_reason_code: string | null;
  hold_reason_detail: string | null;
  hold_until_date: string | null;
};

type OrderHoldFieldsProps = {
  value: OrderHoldMetadata;
  onChange: (value: OrderHoldMetadata) => void;
  disabled?: boolean;
  popoverPortalContainer?: Element;
};

const DATE_REASON_CODE = "customer_requested_after_date";

function dateFromDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateKeyFromDate(value: Date): string {
  return format(value, "yyyy-MM-dd");
}

export function OrderHoldFields({ value, onChange, disabled = false, popoverPortalContainer }: OrderHoldFieldsProps) {
  const isDateReason = value.hold_reason_code === DATE_REASON_CODE;
  const isOtherReason = value.hold_reason_code === "other";

  return (
    <div className="col-span-3 mt-1 grid gap-2 rounded-lg bg-black/[0.025] p-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <span className="mb-1.5 block text-[11px] font-medium text-black">হোল্ডের কারণ</span>
        <BuiSelect
          aria-label="Hold reason"
          selectedKey={value.hold_reason_code || null}
          onSelectionChange={(key) => {
            const reasonCode = key == null ? null : String(key);
            onChange({
              hold_reason_code: reasonCode,
              hold_reason_detail: reasonCode === "other" ? value.hold_reason_detail : null,
              hold_until_date: reasonCode === DATE_REASON_CODE ? value.hold_until_date : null,
            });
          }}
          disabled={disabled}
          popoverPlacement="top"
          popoverPortalContainer={popoverPortalContainer}
          popoverClassName="max-h-[min(240px,40vh)]"
          triggerClassName="h-9 w-full rounded-lg px-3 py-1.5 text-[12px]"
        >
          {ORDER_HOLD_REASONS.map((reason) => (
            <BuiSelectItem key={reason.code} id={reason.code} textValue={reason.label}>{reason.label}</BuiSelectItem>
          ))}
        </BuiSelect>
      </div>

      {isOtherReason && (
        <label className="sm:col-span-2">
          <span className="mb-1.5 block text-[11px] font-medium text-black">বিস্তারিত (ঐচ্ছিক)</span>
          <input
            aria-label="Other hold details"
            value={value.hold_reason_detail || ""}
            onChange={(event) => onChange({ ...value, hold_reason_detail: event.target.value || null })}
            maxLength={250}
            disabled={disabled}
            placeholder="সংক্ষেপে জানান"
            className="h-9 w-full rounded-lg bg-white px-3 text-[12px] text-black ring-1 ring-inset ring-black/[0.08] placeholder:text-black/35 disabled:opacity-50"
          />
        </label>
      )}

      {isDateReason && (
        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-[11px] font-medium text-black">কোন তারিখ পর্যন্ত হোল্ড থাকবে?</span>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Hold return date"
                aria-required="true"
                disabled={disabled}
                className="inline-flex h-9 w-full items-center justify-between rounded-lg bg-white px-3 text-left text-[12px] text-black ring-1 ring-inset ring-black/[0.08] disabled:opacity-50"
              >
                <span>{value.hold_until_date ? format(dateFromDateKey(value.hold_until_date), "PPP") : "তারিখ নির্বাচন করুন"}</span>
                <CalendarBlank aria-hidden weight="light" size={16} className="text-black/55" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={value.hold_until_date ? dateFromDateKey(value.hold_until_date) : undefined}
                onSelect={(date) => {
                  if (date) onChange({ ...value, hold_until_date: dateKeyFromDate(date) });
                }}
                disabled={{ before: dateFromDateKey(getBangladeshDateKey()) }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <span className="mt-1 block text-[10px] text-black/55">নির্বাচিত দিনটি হোল্ডে থাকার শেষ দিন।</span>
        </div>
      )}
    </div>
  );
}
