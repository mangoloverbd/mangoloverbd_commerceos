import { useEffect, useMemo, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { apiFetch } from "@/lib/api";
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast, DarkToast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RichButton } from "@/components/ui/rich-button";
import { Combobox } from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Plus,
  Minus,
  X,
  Truck,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import { Spinner } from "@/components/ui/ios-spinner";
import { Switch } from "@/components/base/switch/switch";
import { catalogImage, variantLabel, type CatalogProduct, type CatalogVariant } from "@/lib/orderEditor";

interface Line {
  id: string;
  name: string;
  productId: string | null;
  variantId: string | null;
  variantName: string | null;
  variants: CatalogVariant[];
  unitPrice: number;
  quantity: number;
  image?: string | null;
}

interface ExtractedOrder {
  customer_name: string;
  phone: string;
  address: string;
  product: string;
  quantity: number;
  price: number;
}

const PAYMENT_METHODS = [
  { value: "cod", label: "Cash on Delivery" },
  { value: "bkash", label: "bKash" },
  { value: "nagad", label: "Nagad" },
  { value: "card", label: "Card" },
];

const DEFAULT_DELIVERY_FEE = 100;

export default function OrderCreatorModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [orderText, setOrderText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [creating, setCreating] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [lines, setLines] = useState<Line[]>([]);
  const [deliveryOn, setDeliveryOn] = useState(true);
  const [discount, setDiscount] = useState(0);
  const [advance, setAdvance] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [notes, setNotes] = useState("");
  const [runFraudCheck, setRunFraudCheck] = useState(false);

  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [addProductId, setAddProductId] = useState("");

  useEffect(() => {
    if (!open) return;
    apiFetch("/api/products")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setProducts((data?.products || []).map((product: CatalogProduct) => ({ ...product, variants: product.variants || [] }))))
      .catch(() => {});
  }, [open]);

  const reduce = useReducedMotion();

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0),
    [lines],
  );
  const deliveryCharge = deliveryOn ? DEFAULT_DELIVERY_FEE : 0;
  const total = subtotal + deliveryCharge - discount;

  const reset = () => {
    setOrderText("");
    setCustomerName("");
    setPhone("");
    setAddress("");
    setLines([]);
    setDeliveryOn(true);
    setDiscount(0);
    setAdvance(0);
    setPaymentMethod("cod");
    setNotes("");
    setRunFraudCheck(false);
    setAddProductId("");
  };

  const applyAddress = (value: string) => {
    setAddress(value);
  };

  const extractOrder = async () => {
    if (!orderText.trim()) {
      toast.error("Please paste the order text first");
      return;
    }
    setExtracting(true);
    try {
      const res = await apiFetch("/api/extract-order-from-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");

      const order: ExtractedOrder = data.extractedOrder;
      if (!order) {
        toast.error(data.error || "Could not extract order details");
        return;
      }

      setCustomerName(order.customer_name || "");
      setPhone(order.phone || "");
      applyAddress(order.address || "");
      setLines([
        {
          id: crypto.randomUUID(),
          name: order.product || "",
          productId: null,
          variantId: null,
          variantName: null,
          variants: [],
          unitPrice: order.price || 0,
          quantity: order.quantity || 1,
        },
      ]);
      toast.success("Order details extracted!");
    } catch (error) {
      console.error("Error extracting order:", error);
      toast.error("Failed to extract order details");
    } finally {
      setExtracting(false);
    }
  };

  const addProductLine = (productId: string) => {
    if (!productId) return;
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: product.name,
        productId: product.id,
        variantId: null,
        variantName: null,
        variants: product.variants,
        unitPrice: product.selling_price ?? 0,
        quantity: 1,
        image: catalogImage(product),
      },
    ]);
    setAddProductId("");
  };

  const updateLine = (lineId: string, patch: Partial<Line>) => {
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l)));
  };

  const updateLineVariant = (lineId: string, variantId: string) => {
    setLines((prev) => prev.map((line) => {
      if (line.id !== lineId) return line;
      const variant = line.variants.find((item) => item.id === variantId);
      const product = line.productId ? products.find((item) => item.id === line.productId) : null;
      if (!variant || !product) {
        return {
          ...line,
          variantId: null,
          variantName: null,
          unitPrice: product?.selling_price ?? line.unitPrice,
        };
      }
      return {
        ...line,
        variantId: variant.id,
        variantName: variantLabel(variant.attributes),
        unitPrice: (product.selling_price ?? 0) + (variant.price_adjustment || 0),
      };
    }));
  };

  const updateLineQty = (lineId: string, delta: number) => {
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l)),
    );
  };

  const removeLine = (lineId: string) => {
    setLines((prev) => prev.filter((l) => l.id !== lineId));
  };

  const createOrder = async () => {
    if (!customerName.trim() && !phone.trim()) {
      toast.error("Add a customer name or phone number");
      return;
    }
    if (lines.length === 0) {
      toast.error("Add at least one product");
      return;
    }
    const missingVariant = lines.find((line) => line.productId && line.variants.length > 0 && !line.variantId);
    if (missingVariant) {
      toast.error(`Select a variant for ${missingVariant.name}`);
      return;
    }

    setCreating(true);
    try {
      const res = await apiFetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: customerName,
          phone,
          address,
          product: lines.map((l) => l.name).join(", "),
          quantity: lines.reduce((s, l) => s + l.quantity, 0),
          price: subtotal - discount,
          items: lines.map((line) => ({
            product_id: line.productId,
            variant_id: line.variantId,
            product_name: line.name,
            variant_name: line.variantName,
            unit_price: line.unitPrice,
            quantity: line.quantity,
          })),
          delivery_rate: deliveryCharge,
          status: "pending",
          fraud_checked: false,
          fulfillment_status: "unfulfilled",
          notes: notes || null,
          payment_method: paymentMethod,
          discount,
          advanced_payment: advance,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create order");

      if (runFraudCheck && data?.order?.id) {
        try {
          await apiFetch("/api/check-fraud", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: data.order.id }),
          });
        } catch {
          // Fraud check is best-effort — order is already saved.
        }
      }

      toast.custom(
        () => (
          <DarkToast className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/50">Order Created</span>
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-semibold text-white">{customerName || "Order"}</span>
                <span className="text-xs font-medium text-white/60">added to dashboard</span>
              </div>
            </div>
          </DarkToast>
        ),
        { fit: true },
      );

      reset();
      onCreated();
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating order:", error);
      toast.error("Failed to create order");
    } finally {
      setCreating(false);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="fixed inset-0 z-50 grid place-items-center bg-black/12 px-4 backdrop-blur-[3px]"
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content asChild forceMount>
              <motion.div
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96, filter: "blur(8px)" }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96, filter: "blur(4px)", transition: { duration: 0.2, ease: "easeIn" } }}
                transition={{ type: "spring", stiffness: 320, damping: 28, mass: 0.8 }}
                className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-2xl max-h-[90vh] overflow-y-auto translate-x-[-50%] translate-y-[-50%] gap-4 border border-black/10 bg-[#FAFAF8] p-6 shadow-2xl shadow-black/15 sm:rounded-2xl"
              >
                <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </DialogPrimitive.Close>

                <DialogHeader>
                  <DialogTitle className="text-left text-lg font-semibold">Create Order</DialogTitle>
                  <DialogDescription className="text-left">
                    Paste an order message to auto-fill, or build the order manually.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
          {/* AI extraction */}
                <div className="space-y-2">
            <Textarea
              placeholder="Paste the order message here… e.g. 'Hi, I want 2 t-shirts. Name: Rahim, phone: 01712345678, Dhanmondi, Dhaka'"
              value={orderText}
              onChange={(e) => setOrderText(e.target.value)}
              className="min-h-[90px] resize-none rounded-xl border-0 bg-black/[0.06] text-sm shadow-none placeholder:text-black/35 focus-visible:ring-1 focus-visible:ring-black/20"
            />
            <RichButton
              color="default"
              size="default"
              onClick={extractOrder}
              disabled={extracting || !orderText.trim()}
              className="w-full"
            >
              {extracting ? <Spinner className="h-4 w-4 text-black/40" /> : <Sparkles className="h-4 w-4" />}
              {extracting ? "Extracting…" : "Extract Order Details"}
            </RichButton>
          </div>

          {/* Customer */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Customer Name</label>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Rahim Uddin"
                className="h-10 rounded-xl border-0 bg-black/[0.06] text-sm shadow-none placeholder:text-black/35 focus-visible:ring-1 focus-visible:ring-black/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Phone Number</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01712345678"
                className="h-10 rounded-xl border-0 bg-black/[0.06] text-sm shadow-none placeholder:text-black/35 focus-visible:ring-1 focus-visible:ring-black/20"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Delivery Address</label>
            <Input
              value={address}
              onChange={(e) => applyAddress(e.target.value)}
              placeholder="House 12, Road 5, Dhanmondi, Dhaka"
              className="h-10 rounded-xl border-0 bg-black/[0.06] text-sm shadow-none placeholder:text-black/35 focus-visible:ring-1 focus-visible:ring-black/20"
            />
          </div>

          {/* Line items */}
          <div className="max-h-[42vh] min-h-0 space-y-2 overflow-y-auto overflow-x-hidden rounded-2xl border border-black/10 bg-black/[0.02] p-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Products</label>
              <span className="text-[11px] font-medium text-muted-foreground">
                {lines.length} item{lines.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="space-y-2">
              {lines.map((line) => (
                <div key={line.id} className="min-w-0 space-y-2 rounded-xl bg-black/[0.045] px-3 py-2">
                  {/* Row 1: image + name (wraps to 2 lines) + remove */}
                  <div className="flex min-w-0 items-start gap-2">
                    {line.image && (
                      <img
                        src={line.image}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    {line.productId ? (
                      <div className="min-w-0 flex-1 break-words text-sm font-medium leading-snug text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">{line.name}</div>
                    ) : (
                      <input
                        value={line.name}
                        onChange={(e) => updateLine(line.id, { name: e.target.value })}
                        placeholder="Product"
                        className="h-6 min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-black/30"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-red-50"
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground hover:text-red-400" />
                    </button>
                  </div>
                  {/* Row 2: variant + price + qty + line total — wraps, never forces horizontal scroll */}
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 pl-0 sm:pl-11">
                    {line.productId && line.variants.length > 0 && (
                      <select
                        aria-label={`Variant for ${line.name}`}
                        value={line.variantId || ""}
                        onChange={(e) => updateLineVariant(line.id, e.target.value)}
                        className="h-7 min-w-0 max-w-full flex-1 basis-28 truncate rounded-lg bg-black/[0.04] px-2 text-xs text-foreground outline-none"
                      >
                        <option value="">Select variant</option>
                        {line.variants.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {variantLabel(variant.attributes) || "Default variant"}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      type="number"
                      value={line.unitPrice}
                      onChange={(e) => updateLine(line.id, { unitPrice: Number(e.target.value) || 0 })}
                      aria-label={`Unit price for ${line.name}`}
                      className="h-7 w-20 shrink-0 rounded-md bg-transparent px-1 text-right text-sm text-muted-foreground outline-none focus:bg-black/[0.04]"
                    />
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateLineQty(line.id, -1)}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-black/5 transition-colors hover:bg-black/10"
                      >
                        <Minus className="h-3 w-3 text-foreground" />
                      </button>
                      <span className="w-5 text-center text-sm font-semibold text-foreground">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateLineQty(line.id, 1)}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-black/5 transition-colors hover:bg-black/10"
                      >
                        <Plus className="h-3 w-3 text-foreground" />
                      </button>
                    </div>
                    <div className="ml-auto w-auto min-w-16 shrink-0 text-right text-sm font-semibold text-foreground">
                      ৳{(line.unitPrice * line.quantity).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {products.length > 0 && (
              <div className="[&_button]:rounded-xl [&_button]:border-0 [&_button]:bg-black/[0.06]">
                <Combobox
                  items={products.map((p) => ({
                    value: p.id,
                    label: p.name,
                    price: p.selling_price ?? 0,
                    image: catalogImage(p),
                  }))}
                  value={addProductId}
                  onValueChange={addProductLine}
                  placeholder="Add a product from catalog…"
                  emptyMessage="No products found."
                  showPrice
                />
              </div>
            )}
            {products.length === 0 && (
              <p className="text-xs font-medium text-muted-foreground">
                No products in catalog yet — add them on the Products page.
              </p>
            )}
          </div>

          {/* Delivery + totals */}
          <div className="overflow-hidden rounded-2xl border border-black/10 bg-black/[0.025]">
            <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-foreground">Delivery</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{deliveryCharge > 0 ? `৳${deliveryCharge}` : "Free"}</span>
                <Switch
                  size="sm"
                  aria-label="Toggle delivery charge"
                  isSelected={deliveryOn}
                  onChange={setDeliveryOn}
                />
              </div>
            </div>

            <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
              <span className="text-xs text-muted-foreground">Subtotal</span>
              <span className="text-sm font-medium text-foreground tabular-nums">{subtotal.toLocaleString()}</span>
            </div>

            <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
              <span className="text-xs text-muted-foreground">Discount</span>
              <input
                type="number"
                value={discount}
                onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                className="w-20 bg-transparent text-right text-sm font-medium text-foreground outline-none"
              />
            </div>

            <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
              <span className="text-xs text-muted-foreground">Advance / Partial</span>
              <input
                type="number"
                value={advance}
                onChange={(e) => setAdvance(Math.max(0, Number(e.target.value) || 0))}
                className="w-20 bg-transparent text-right text-sm font-medium text-foreground outline-none"
              />
            </div>

            <div className="flex items-center justify-between bg-black/[0.035] px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Total</span>
              <div className="flex items-center gap-0.5">
                <span className="text-xl font-bold text-foreground">৳</span>
                <input
                  type="number"
                  value={total}
                  onChange={(e) => {
                    const t = Number(e.target.value) || 0;
                    setDiscount(Math.max(0, subtotal + deliveryCharge - t));
                  }}
                  style={{ width: `${Math.max(2, String(total).length + 0.5)}ch` }}
                  className="bg-transparent text-right text-xl font-bold text-foreground outline-none"
                />
              </div>
            </div>

            {advance > 0 && (
              <div className="flex items-center justify-between border-t border-black/10 px-4 py-2">
                <span className="text-[11px] text-muted-foreground">Due after advance</span>
                <span className="text-[11px] font-semibold text-foreground tabular-nums">
                  ৳{Math.max(0, total - advance).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* Payment method + notes */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Payment Method</label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="h-10 rounded-xl border-0 bg-black/[0.06] text-sm shadow-none">
                  <SelectValue placeholder="Payment method" />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Notes</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional note"
                className="h-10 rounded-xl border-0 bg-black/[0.06] text-sm shadow-none placeholder:text-black/35 focus-visible:ring-1 focus-visible:ring-black/20"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={runFraudCheck}
                onChange={(e) => setRunFraudCheck(e.target.checked)}
                className="h-4 w-4 rounded border-black/20"
              />
              <ShieldCheck className="h-4 w-4" />
              Run fraud check
            </label>
            <Button
              onClick={createOrder}
              disabled={creating}
              className="min-w-0 flex-1 h-11 rounded-xl bg-black text-white hover:bg-black/90"
            >
              {creating ? <Spinner className="h-4 w-4 text-white/50" /> : <Plus className="h-4 w-4" />}
              <span className="ml-2">{creating ? "Creating…" : "Create Order"}</span>
            </Button>
          </div>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}
