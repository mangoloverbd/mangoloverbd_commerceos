import { format } from "date-fns";
import { ArrowRight, CalendarBlank, Check, MapPin, Phone, ShieldCheck, Warning, X } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { displayStatusLabel } from "@/lib/orderTransitions";
import type { Order } from "@/components/OrdersTable";

type MobileOrderCardsProps = {
  orders: Order[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onToggleSelectAll: () => void;
  onOpenOrder: (id: string) => void;
  renderActions: (order: Order) => ReactNode;
};

function money(value: number | null) {
  return value == null ? "—" : `৳${Number(value).toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}

function productLabel(order: Order) {
  if (order.items?.length) {
    const first = order.items[0];
    const variant = first.variant_name ? ` · ${first.variant_name}` : "";
    const more = order.items.length > 1 ? ` +${order.items.length - 1} more` : "";
    return `${first.product_name || "Product"}${variant} · ×${first.quantity}${more}`;
  }
  return order.product || "No items";
}

function statusClass(status: string) {
  if (status === "confirmed") return "bg-emerald-50 text-emerald-700";
  if (status === "cancelled") return "bg-red-50 text-red-600";
  return "bg-amber-50 text-amber-700";
}

function FraudState({ order }: { order: Order }) {
  if (!order.fraud_checked) {
    return <span className="inline-flex items-center gap-1 text-[10px] text-black/40"><Warning weight="light" size={14} /> Not checked</span>;
  }

  const data = order.fraud_data;
  const total = Number(data?.total_parcels) || 0;
  const delivered = Number(data?.total_delivered) || 0;
  const rate = total ? Math.round((delivered / total) * 100) : 0;
  const risky = total > 0 && rate < 50;

  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px]", risky ? "text-red-600" : "text-emerald-600")}>
      {risky ? <X weight="light" size={14} /> : <ShieldCheck weight="light" size={14} />}
      {total ? `${rate}% delivered` : "New customer"}
    </span>
  );
}

export function MobileOrderCards({
  orders,
  loading,
  selectedIds,
  onToggleSelection,
  onToggleSelectAll,
  onOpenOrder,
  renderActions,
}: MobileOrderCardsProps) {
  if (loading) {
    return (
      <div className="space-y-3 p-3" aria-label="Loading orders">
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-40 animate-pulse rounded-2xl bg-black/[0.04]" />)}
      </div>
    );
  }

  if (!orders.length) {
    return <div className="px-5 py-20 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-black/45">No records found</div>;
  }

  const allSelected = selectedIds.size === orders.length;

  return (
    <div className="space-y-3 p-3" data-testid="mobile-order-cards">
      <div className="flex items-center justify-between px-1 pb-1">
        <label className="flex min-h-11 items-center gap-2 text-xs font-medium text-black/55">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(input) => { if (input) input.indeterminate = selectedIds.size > 0 && !allSelected; }}
            onChange={onToggleSelectAll}
            className="h-5 w-5 accent-black"
            aria-label="Select all orders"
          />
          Select all
        </label>
        {selectedIds.size > 0 && <span className="text-xs font-medium text-black/50">{selectedIds.size} selected</span>}
      </div>

      {orders.map((order) => {
        const orderLabel = `#${String(order.order_number).replace(/^#+/, "")}`;
        const selected = selectedIds.has(order.id);
        return (
          <article key={order.id} className={cn("rounded-2xl border bg-white p-4 transition-colors", selected ? "border-blue-300 bg-blue-50/30" : "border-black/[0.08]")}>
            <div className="flex items-start gap-3">
              <label className="flex min-h-11 min-w-11 shrink-0 items-center justify-center" onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleSelection(order.id)}
                  className="h-5 w-5 accent-black"
                  aria-label={`Select order ${orderLabel}`}
                />
              </label>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-black">{orderLabel}</span>
                  <span className={cn("rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide", statusClass(order.status))}>{displayStatusLabel(order.status)}</span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-[10px] text-black/45"><CalendarBlank weight="light" size={13} />{format(new Date(order.created_at), "MMM d, yyyy")}</div>
              </div>
              <span className="shrink-0 text-base font-semibold tabular-nums text-black">{money(order.price)}</span>
            </div>

            <div className="mt-4 grid gap-2 text-xs text-black/65">
              <div className="flex min-w-0 items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full bg-black/20" /><span className="truncate font-medium text-black">{order.customer_name || "Guest User"}</span></div>
              <div className="flex min-w-0 items-center gap-2"><Phone weight="light" size={14} className="shrink-0 text-black/35" /><span className="truncate">{order.phone || "No phone"}</span></div>
              <div className="flex min-w-0 items-center gap-2"><MapPin weight="light" size={14} className="shrink-0 text-black/35" /><span className="truncate">{order.address || "Digital delivery"}</span></div>
              <p className="truncate rounded-xl bg-black/[0.035] px-3 py-2 text-[11px] text-black/65">{productLabel(order)}</p>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-black/[0.06] pt-3">
              <FraudState order={order} />
              <span className="text-[10px] text-black/45">{order.sent_to_courier ? (order.courier_status || "Sent to courier") : "Not dispatched"}</span>
            </div>

            {renderActions(order) && <div className="mt-3 border-t border-black/[0.06] pt-3">{renderActions(order)}</div>}
            <button type="button" onClick={() => onOpenOrder(order.id)} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-black/80" aria-label={`Open order ${orderLabel}`}>
              Open order <ArrowRight weight="light" size={16} />
            </button>
          </article>
        );
      })}
    </div>
  );
}
