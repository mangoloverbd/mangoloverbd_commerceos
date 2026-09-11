import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/ios-spinner";
import {
  abandonedCheckoutCartSummary,
  type AbandonedCheckout,
} from "@/lib/abandonedCheckouts";

export type AbandonedCheckoutConvertStatus = "pending" | "on_hold" | "approved";

export type AbandonedCheckoutConvertOverrides = {
  customer_name: string;
  address: string;
};

export type AbandonedCheckoutConvertDialogProps = {
  checkout: AbandonedCheckout;
  status: AbandonedCheckoutConvertStatus;
  open: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (overrides: AbandonedCheckoutConvertOverrides) => void;
};

const STATUS_LABELS: Record<AbandonedCheckoutConvertStatus, string> = {
  pending: "Pending",
  on_hold: "On Hold",
  approved: "Approved",
};

const labelClass = "text-[8px] font-medium tracking-[0.3em] text-black uppercase";
const inputClass =
  "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black outline-none transition-colors placeholder:text-black/30 focus:border-black/30";

function formatTaka(amount: number | null) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "—";
  return `৳${amount.toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}

export function AbandonedCheckoutConvertDialog({
  checkout,
  status,
  open,
  saving,
  error,
  onClose,
  onConfirm,
}: AbandonedCheckoutConvertDialogProps) {
  const [customerName, setCustomerName] = useState(checkout.customer_name ?? "");
  const [address, setAddress] = useState(checkout.address ?? "");

  useEffect(() => {
    if (!open) return;
    setCustomerName(checkout.customer_name ?? "");
    setAddress(checkout.address ?? "");
  }, [open, checkout]);

  const statusLabel = STATUS_LABELS[status];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-xl bg-[#FAFAF8]">
        <DialogHeader>
          <DialogTitle className="text-base font-medium text-black">Convert to order</DialogTitle>
          <DialogDescription>
            Create a new order from this captured checkout. The draft leaves the recovery queue.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-black/55">
              {statusLabel}
            </span>
            <span className="text-xs text-black/45">New order status</span>
          </div>

          <dl className="grid gap-1.5 rounded-xl bg-black/[0.03] px-3 py-2.5 text-xs text-black/70">
            <div className="flex items-center justify-between gap-3">
              <dt className={labelClass}>Name</dt>
              <dd className="font-medium text-black">{checkout.customer_name || "Not provided"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className={labelClass}>Phone</dt>
              <dd className="font-medium tabular-nums text-black">{checkout.phone || "Not provided"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className={labelClass}>Cart</dt>
              <dd className="text-right font-medium text-black">
                {abandonedCheckoutCartSummary(checkout.cart)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className={labelClass}>Estimated total</dt>
              <dd className="font-medium tabular-nums text-black">{formatTaka(checkout.total)}</dd>
            </div>
          </dl>

          <div className="grid gap-1.5">
            <label htmlFor="abandoned-convert-name" className={labelClass}>
              Customer name
            </label>
            <input
              id="abandoned-convert-name"
              type="text"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Customer name"
              className={inputClass}
            />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="abandoned-convert-address" className={labelClass}>
              Delivery address
            </label>
            <textarea
              id="abandoned-convert-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Delivery address"
              rows={2}
              className={inputClass}
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-medium text-black/70 transition-colors hover:bg-black/[0.05] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm({ customer_name: customerName.trim(), address: address.trim() })
            }
            disabled={saving}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-black px-4 text-xs font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 disabled:cursor-wait disabled:opacity-50"
          >
            {saving && <Spinner size="sm" />}
            Convert to {statusLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
