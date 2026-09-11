import { useEffect, useState } from "react";
import { Plus, Trash } from "@phosphor-icons/react";
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
  computeAbandonedCheckoutTotals,
  type AbandonedCheckout,
  type AbandonedCheckoutCartItem,
} from "@/lib/abandonedCheckouts";

export type AbandonedCheckoutEditItem = {
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
};

export type AbandonedCheckoutEditPayload = {
  customerName: string;
  phone: string;
  address: string;
  items: AbandonedCheckoutEditItem[];
  deliveryRate: number;
};

export type AbandonedCheckoutEditDialogProps = {
  checkout: AbandonedCheckout;
  open: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (payload: AbandonedCheckoutEditPayload) => void;
};

type LineDraft = {
  productName: string;
  variantName: string;
  quantity: number;
  unitPrice: string;
};

const labelClass = "text-[8px] font-medium tracking-[0.3em] text-black uppercase";
const inputClass =
  "w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-black outline-none transition-colors placeholder:text-black/30 focus:border-black/30";

function toLineDrafts(cart: AbandonedCheckoutCartItem[]): LineDraft[] {
  return cart.map((item) => ({
    productName: item.productName,
    variantName: item.variantName ?? "",
    quantity: item.quantity,
    unitPrice: String(item.unitPrice),
  }));
}

function formatTaka(amount: number) {
  return `৳${amount.toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}

export function AbandonedCheckoutEditDialog({
  checkout,
  open,
  saving,
  error,
  onClose,
  onSave,
}: AbandonedCheckoutEditDialogProps) {
  const [customerName, setCustomerName] = useState(checkout.customer_name ?? "");
  const [phone, setPhone] = useState(checkout.phone ?? "");
  const [address, setAddress] = useState(checkout.address ?? "");
  const [deliveryRate, setDeliveryRate] = useState(String(checkout.delivery_rate ?? 0));
  const [lines, setLines] = useState<LineDraft[]>(() => toLineDrafts(checkout.cart));
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCustomerName(checkout.customer_name ?? "");
    setPhone(checkout.phone ?? "");
    setAddress(checkout.address ?? "");
    setDeliveryRate(String(checkout.delivery_rate ?? 0));
    setLines(toLineDrafts(checkout.cart));
    setValidationError(null);
  }, [open, checkout]);

  const parsedDeliveryRate = Number(deliveryRate);
  const parsedLines = lines.map((line) => ({
    productName: line.productName.trim(),
    variantName: line.variantName.trim() || null,
    quantity: line.quantity,
    unitPrice: line.unitPrice.trim() === "" ? Number.NaN : Number(line.unitPrice),
  }));
  const totals = computeAbandonedCheckoutTotals(
    parsedLines.map((line) => ({
      productName: line.productName,
      variantName: line.variantName,
      quantity: line.quantity,
      unitPrice: Number.isFinite(line.unitPrice) ? line.unitPrice : 0,
    })),
    Number.isFinite(parsedDeliveryRate) && parsedDeliveryRate >= 0 ? parsedDeliveryRate : 0,
  );

  const updateLine = (index: number, patch: Partial<LineDraft>) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const addLine = () => {
    setLines((prev) => [...prev, { productName: "", variantName: "", quantity: 1, unitPrice: "" }]);
  };

  const handleSave = () => {
    const digits = phone.replace(/\D/g, "");
    if (!/^01\d{9}$/.test(digits)) {
      setValidationError("Enter a valid Bangladeshi phone number (01XXXXXXXXX).");
      return;
    }
    if (lines.length === 0) {
      setValidationError("Add at least one line to the cart.");
      return;
    }
    for (const line of lines) {
      if (!line.productName.trim()) {
        setValidationError("Every line needs a product name.");
        return;
      }
      if (!Number.isInteger(line.quantity) || line.quantity < 1) {
        setValidationError("Every line needs a quantity of at least 1.");
        return;
      }
      if (line.unitPrice.trim() === "" || !Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) < 0) {
        setValidationError("Every line needs a unit price of 0 or more.");
        return;
      }
    }
    if (deliveryRate.trim() === "" || !Number.isFinite(parsedDeliveryRate) || parsedDeliveryRate < 0) {
      setValidationError("Enter a delivery charge of 0 or more.");
      return;
    }
    setValidationError(null);
    onSave({
      customerName: customerName.trim(),
      phone: digits,
      address: address.trim(),
      items: parsedLines.map((line) => ({
        productName: line.productName,
        variantName: line.variantName,
        quantity: line.quantity,
        unitPrice: Math.round(line.unitPrice * 100) / 100,
      })),
      deliveryRate: parsedDeliveryRate,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-xl bg-[#FAFAF8]">
        <DialogHeader>
          <DialogTitle className="text-base font-medium text-black">Edit checkout</DialogTitle>
          <DialogDescription>Update the contact details and cart before converting to an order.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="abandoned-edit-name" className={labelClass}>
              Customer name
            </label>
            <input
              id="abandoned-edit-name"
              type="text"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Customer name"
              className={inputClass}
            />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="abandoned-edit-phone" className={labelClass}>
              Phone
            </label>
            <input
              id="abandoned-edit-phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="01XXXXXXXXX"
              className={inputClass}
            />
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="abandoned-edit-address" className={labelClass}>
              Address
            </label>
            <textarea
              id="abandoned-edit-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Delivery address"
              rows={2}
              className={inputClass}
            />
          </div>

          <div className="grid gap-2">
            <p className={labelClass}>Cart lines</p>
            {lines.map((line, index) => (
              <div key={index} className="grid gap-2 rounded-xl border border-black/10 bg-white p-3">
                <div className="grid gap-1.5">
                  <label htmlFor={`abandoned-edit-product-${index}`} className={labelClass}>
                    Product
                  </label>
                  <input
                    id={`abandoned-edit-product-${index}`}
                    type="text"
                    value={line.productName}
                    onChange={(event) => updateLine(index, { productName: event.target.value })}
                    placeholder="Product name"
                    className={inputClass}
                  />
                </div>
                <div className="grid gap-1.5">
                  <label htmlFor={`abandoned-edit-variant-${index}`} className={labelClass}>
                    Variant
                  </label>
                  <input
                    id={`abandoned-edit-variant-${index}`}
                    type="text"
                    value={line.variantName}
                    onChange={(event) => updateLine(index, { variantName: event.target.value })}
                    placeholder="Variant (optional)"
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1.5">
                    <label htmlFor={`abandoned-edit-quantity-${index}`} className={labelClass}>
                      Quantity
                    </label>
                    <input
                      id={`abandoned-edit-quantity-${index}`}
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(event) =>
                        updateLine(index, { quantity: Math.max(1, Number.parseInt(event.target.value, 10) || 1) })
                      }
                      className={inputClass}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label htmlFor={`abandoned-edit-price-${index}`} className={labelClass}>
                      Unit price
                    </label>
                    <input
                      id={`abandoned-edit-price-${index}`}
                      type="number"
                      min={0}
                      value={line.unitPrice}
                      onChange={(event) => updateLine(index, { unitPrice: event.target.value })}
                      placeholder="0"
                      className={inputClass}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Remove line ${index + 1}`}
                  onClick={() => removeLine(index)}
                  className="inline-flex h-8 items-center gap-1.5 self-start rounded-lg px-2 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
                >
                  <Trash size={14} weight="light" aria-hidden />
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addLine}
              className="inline-flex h-9 items-center gap-1.5 self-start rounded-lg px-2.5 text-xs font-medium text-black/70 transition-colors hover:bg-black/[0.05] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30"
            >
              <Plus size={14} weight="light" aria-hidden />
              Add line
            </button>
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="abandoned-edit-delivery" className={labelClass}>
              Delivery charge
            </label>
            <input
              id="abandoned-edit-delivery"
              type="number"
              min={0}
              value={deliveryRate}
              onChange={(event) => setDeliveryRate(event.target.value)}
              placeholder="0"
              className={inputClass}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-black/[0.03] px-3 py-2 text-xs text-black/70">
            <span>
              Subtotal <span className="font-medium tabular-nums text-black">{formatTaka(totals.subtotal)}</span>
            </span>
            <span>
              Total <span className="font-medium tabular-nums text-black">{formatTaka(totals.total)}</span>
            </span>
          </div>

          {validationError && <p className="text-xs text-red-600">{validationError}</p>}
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
            onClick={handleSave}
            disabled={saving}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-black px-4 text-xs font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/30 disabled:cursor-wait disabled:opacity-50"
          >
            {saving && <Spinner size="sm" />}
            Save changes
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
