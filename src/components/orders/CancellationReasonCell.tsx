import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { cancellationReasonDotClass, cancellationReasonKey, cancellationReasonLabel, type CancelledOrder } from "@/lib/cancellationInsights";

/** Why an order was cancelled: the reason and the staff note. */
export function CancellationReasonCell({ order }: { order: CancelledOrder }) {
  const key = cancellationReasonKey(order);
  return (
    <div data-testid={`cancellation-reason-cell-${order.id}`} className="flex min-w-[190px] flex-col items-center gap-1 text-center">
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-[#F2F2F0] px-2.5 py-1 text-[11.5px] font-medium">
        <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", cancellationReasonDotClass(key))} />
        {cancellationReasonLabel(key)}
      </span>
      {order.cancellation_reason_note && (
        <span className="line-clamp-2 text-[11.5px] text-black/60" title={order.cancellation_reason_note}>{order.cancellation_reason_note}</span>
      )}
    </div>
  );
}

/** When the order was cancelled; older cancellations without a recorded time show a dash. */
export function CancelledAtCell({ order }: { order: CancelledOrder }) {
  if (!order.cancelled_at) return <span className="text-[11px] text-black/40">—</span>;
  const cancelledAt = new Date(order.cancelled_at);
  return (
    <div data-testid={`cancelled-at-cell-${order.id}`} className="inline-flex flex-col items-center">
      <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-black">{format(cancelledAt, "MMM dd, yyyy")}</span>
      <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-black">{format(cancelledAt, "h:mm a")}</span>
    </div>
  );
}
