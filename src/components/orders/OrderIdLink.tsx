import { ArrowSquareOut } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type OrderIdLinkProps = {
  orderId: string;
  orderNumber: string | number;
  className?: string;
};

export function OrderIdLink({ orderId, orderNumber, className }: OrderIdLinkProps) {
  const label = String(orderNumber).replace(/^#+/, "");

  return (
    <Link
      to={`/orders/${orderId}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open order ${label} in a new tab`}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      className={cn(
        "group/order-link inline-flex items-center gap-1 text-black underline-offset-4 outline-none transition-colors hover:text-black/65 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-black/25 focus-visible:ring-offset-2",
        className,
      )}
    >
      <span>{orderNumber}</span>
      <ArrowSquareOut
        weight="light"
        size={13}
        aria-hidden="true"
        className="shrink-0 opacity-60 transition-opacity sm:opacity-0 sm:group-hover/order-link:opacity-60 sm:group-focus-visible/order-link:opacity-60"
      />
    </Link>
  );
}
