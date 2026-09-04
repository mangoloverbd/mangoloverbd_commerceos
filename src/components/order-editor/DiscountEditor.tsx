import { useEffect, useState } from "react";
import { Tag, X } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { calculateUnitDiscount, formatTaka, type DiscountType, type OrderEditorItem } from "@/lib/orderEditor";

type DiscountEditorProps = {
  item: OrderEditorItem;
  disabled: boolean;
  onApply: (discountType: DiscountType, discountValue: number) => void;
  onRemove: () => void;
};

export function DiscountEditor({ item, disabled, onApply, onRemove }: DiscountEditorProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DiscountType>(item.discount_type || "fixed");
  const [value, setValue] = useState(String(item.discount_value || ""));

  useEffect(() => {
    if (!open) {
      setMode(item.discount_type || "fixed");
      setValue(String(item.discount_value || ""));
    }
  }, [item.discount_type, item.discount_value, open]);

  const numericValue = Number(value);
  const invalid = value.trim() === "" || !Number.isFinite(numericValue) || numericValue < 0 || (mode === "percentage" ? numericValue > 100 : numericValue > item.unit_price);
  const previewDiscount = invalid ? 0 : calculateUnitDiscount(item.unit_price, mode, numericValue);
  const unitNet = item.unit_price - previewDiscount;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} aria-label={`${item.discount_type ? "Edit" : "Add"} discount ${item.discount_type ? "for" : "to"} ${item.product_name || "item"}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] text-black/50 transition hover:bg-black/[0.05] disabled:opacity-30">
          <Tag weight="light" size={14} /> {item.discount_type ? (item.discount_type === "percentage" ? `${item.discount_value}% off` : `${formatTaka(item.discount_value)} off`) : "Add discount"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 rounded-lg border-black/[0.08] bg-[#FAFAF8] p-4 shadow-xl">
        <div className="flex items-center justify-between"><p className="text-[11px] font-medium uppercase tracking-[0.16em] text-black/50">Item discount</p><button type="button" aria-label="Close discount editor" onClick={() => setOpen(false)} className="grid h-7 w-7 place-items-center rounded-lg text-black/40 hover:bg-black/[0.05]"><X weight="light" size={14} /></button></div>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-black/[0.04] p-1">
          <button type="button" aria-label="Fixed amount" onClick={() => setMode("fixed")} className={`h-8 rounded-md text-[11px] ${mode === "fixed" ? "bg-white text-black ring-1 ring-black/[0.06]" : "text-black/45"}`}>Fixed amount</button>
          <button type="button" aria-label="Percentage" onClick={() => setMode("percentage")} className={`h-8 rounded-md text-[11px] ${mode === "percentage" ? "bg-white text-black ring-1 ring-black/[0.06]" : "text-black/45"}`}>Percentage</button>
        </div>
        <label className="mt-3 block text-[10px] font-medium uppercase tracking-[0.16em] text-black/45">Discount value<input aria-label="Discount value" type="number" min="0" max={mode === "percentage" ? 100 : item.unit_price} step="0.01" value={value} onChange={(event) => setValue(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg bg-white px-3 font-mono text-[13px] outline-none ring-1 ring-inset ring-black/[0.08] focus:ring-black/25" /></label>
        {invalid && value.trim() !== "" && <p role="alert" className="mt-2 text-[11px] text-red-600">{mode === "percentage" ? "Enter a percentage from 0 to 100." : `Enter an amount from 0 to ${formatTaka(item.unit_price)}.`}</p>}
        <div className="mt-3 rounded-lg bg-black/[0.04] p-3"><p className="text-[10px] uppercase tracking-[0.16em] text-black/40">Preview</p><p className="mt-1 font-mono text-[14px] tabular-nums text-black">{formatTaka(unitNet)} per unit</p><p className="mt-0.5 text-[11px] text-black/45">{formatTaka(unitNet * item.quantity)} line total</p></div>
        <div className="mt-3 flex items-center gap-2"><button type="button" aria-label="Apply discount" disabled={invalid} onClick={() => { onApply(mode, numericValue); setOpen(false); }} className="h-9 flex-1 rounded-lg bg-black px-3 text-[12px] text-white disabled:opacity-25">Apply</button>{item.discount_type && <button type="button" aria-label="Remove discount" onClick={() => { onRemove(); setOpen(false); }} className="h-9 rounded-lg px-3 text-[12px] text-red-600 hover:bg-red-50">Remove discount</button>}</div>
      </PopoverContent>
    </Popover>
  );
}
