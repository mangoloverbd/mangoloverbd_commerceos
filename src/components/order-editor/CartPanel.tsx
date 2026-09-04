import { Minus, Package, Plus, Trash } from "@phosphor-icons/react";
import { Spinner } from "@/components/ui/ios-spinner";
import { DiscountEditor } from "./DiscountEditor";
import { calculateUnitDiscount, formatTaka, type CartTotals, type DiscountType, type OrderEditorItem } from "@/lib/orderEditor";

type CartPanelProps = {
  items: OrderEditorItem[];
  totals: CartTotals;
  canEdit: boolean;
  locked: boolean;
  saving: boolean;
  saveDisabled?: boolean;
  error?: string;
  onQuantity: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
  onDiscount: (id: string, discountType: DiscountType | null, discountValue: number) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function CartPanel({ items, totals, canEdit, locked, saving, saveDisabled = false, error, onQuantity, onRemove, onDiscount, onSave, onCancel }: CartPanelProps) {
  return (
    <section aria-label="Order cart" className="flex min-h-0 flex-col bg-[#FAFAF8] p-5">
      <div><p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/40">Order cart</p><h2 className="mt-2 text-xl font-light text-black">{totals.quantity} item{totals.quantity === 1 ? "" : "s"}</h2></div>
      {locked && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">Editing is locked after courier dispatch.</p>}
      <div className="mt-4 min-h-0 flex-1 space-y-3 xl:overflow-y-auto xl:pr-1">
        {items.length === 0 ? <div className="grid place-items-center gap-2 py-14 text-center"><Package weight="light" size={26} className="text-black/20" /><p className="text-[13px] text-black/45">Your cart is empty.</p></div> : items.map((item) => {
          const name = item.product_name || "Legacy item";
          const unitDiscount = calculateUnitDiscount(item.unit_price, item.discount_type, item.discount_value);
          const netUnit = item.unit_price - unitDiscount;
          const isLegacy = !item.product_id && !item.variant_id;
          const maxQuantity = item.available_stock ?? undefined;
          return (
            <article key={item.id} data-testid={`order-item-${item.id}`} className="rounded-lg bg-white p-3 ring-1 ring-inset ring-black/[0.06]">
              <div className="flex gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-black/[0.04]">{item.image_url ? <img src={item.image_url} alt={name} className="h-full w-full object-cover" /> : <Package weight="light" size={18} className="text-black/25" />}</div>
                <div className="min-w-0 flex-1"><h3 className="truncate text-[13px] font-medium text-black">{name}</h3>{item.product_slug && <p className="mt-0.5 truncate font-mono text-[10px] text-black/35">{item.product_slug}</p>}<p className="mt-1 text-[10px] text-black/40">{[item.variant_name, item.weight_kg ? `${item.weight_kg} kg` : null].filter(Boolean).join(" · ") || (isLegacy ? "Detached legacy item" : "Standard")}</p></div>
                <button type="button" aria-label={`Remove ${name}`} onClick={() => onRemove(item.id)} disabled={!canEdit} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-black/35 hover:bg-red-50 hover:text-red-600 disabled:opacity-25"><Trash weight="light" size={15} /></button>
              </div>
              {isLegacy && <p className="mt-3 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">Remove or replace this detached legacy item before saving cart changes.</p>}
              <div className="mt-3 flex items-end justify-between gap-3 border-t border-black/[0.06] pt-3">
                <div><div className="flex items-baseline gap-2"><span className="font-mono text-[13px] tabular-nums text-black">{formatTaka(netUnit)}</span>{unitDiscount > 0 && <span className="font-mono text-[10px] tabular-nums text-black/35 line-through">{formatTaka(item.unit_price)}</span>}</div><DiscountEditor item={item} disabled={!canEdit || isLegacy} onApply={(type, value) => onDiscount(item.id, type, value)} onRemove={() => onDiscount(item.id, null, 0)} /></div>
                <div className="flex items-center rounded-lg bg-black/[0.04] p-1"><button type="button" aria-label={`Decrease ${name} quantity`} onClick={() => onQuantity(item.id, Math.max(1, item.quantity - 1))} disabled={!canEdit || item.quantity <= 1} className="grid h-7 w-7 place-items-center rounded-md text-black/45 disabled:opacity-20"><Minus weight="light" size={13} /></button><input aria-label={`Quantity for ${name}`} type="number" min={1} max={maxQuantity} value={item.quantity} onChange={(event) => onQuantity(item.id, Math.max(1, Math.min(maxQuantity ?? Number.MAX_SAFE_INTEGER, Number.parseInt(event.target.value, 10) || 1)))} disabled={!canEdit} className="h-7 w-10 bg-transparent text-center font-mono text-[12px] outline-none disabled:opacity-40" /><button type="button" aria-label={`Increase ${name} quantity`} onClick={() => onQuantity(item.id, item.quantity + 1)} disabled={!canEdit || (maxQuantity != null && item.quantity >= maxQuantity)} className="grid h-7 w-7 place-items-center rounded-md text-black/45 disabled:opacity-20"><Plus weight="light" size={13} /></button></div>
              </div>
              <p className="mt-2 text-right font-mono text-[12px] tabular-nums text-black/55">Line total {formatTaka(netUnit * item.quantity)}</p>
            </article>
          );
        })}
      </div>
      <div className="sticky bottom-0 mt-4 border-t border-black/[0.08] bg-[#FAFAF8] pt-4">
        <dl className="space-y-2 text-[12px]"><div className="flex justify-between"><dt className="text-black/45">Subtotal</dt><dd className="font-mono tabular-nums">{formatTaka(totals.grossSubtotal)}</dd></div>{totals.itemDiscount > 0 && <div className="flex justify-between"><dt className="text-black/45">Item discounts</dt><dd className="font-mono tabular-nums text-emerald-700">−{formatTaka(totals.itemDiscount)}</dd></div>}{totals.legacyDiscount > 0 && <div className="flex justify-between"><dt className="text-black/45">Legacy order discount</dt><dd className="font-mono tabular-nums text-emerald-700">−{formatTaka(totals.legacyDiscount)}</dd></div>}<div className="flex justify-between"><dt className="text-black/45">Delivery</dt><dd className="font-mono tabular-nums">{formatTaka(totals.deliveryFee)}</dd></div><div className="flex items-baseline justify-between border-t border-black/[0.07] pt-3"><dt className="text-[11px] font-medium uppercase tracking-[0.16em] text-black/55">Final total</dt><dd className="font-mono text-lg tabular-nums">{formatTaka(totals.finalTotal)}</dd></div></dl>
        {error && <p role="alert" className="mt-3 text-[12px] text-red-600">{error}</p>}
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2"><button type="button" onClick={onSave} disabled={saving || saveDisabled} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-black px-4 text-[12px] text-white disabled:cursor-not-allowed disabled:opacity-35">{saving && <Spinner size="sm" />}{saving ? "Saving…" : "Save changes"}</button><button type="button" onClick={onCancel} disabled={saving} className="h-10 rounded-lg px-3 text-[12px] text-black/50 hover:bg-black/[0.05] disabled:opacity-35">Cancel</button></div>
      </div>
    </section>
  );
}
