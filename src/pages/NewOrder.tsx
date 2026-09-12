import { useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle, Minus, Package, Plus, ShieldCheck, Sparkle, Trash, Truck } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { Button as BuiButton } from "@/components/base/buttons/button";
import { CatalogPanel } from "@/components/order-editor/CatalogPanel";
import { Spinner } from "@/components/ui/ios-spinner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichButton } from "@/components/ui/rich-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/base/switch/switch";
import { DarkToast, toast } from "@/components/ui/sonner";
import { catalogImage, variantLabel, type CatalogProduct, type CatalogVariant } from "@/lib/orderEditor";

type Line = {
  id: string;
  name: string;
  productId: string | null;
  variantId: string | null;
  variantName: string | null;
  variants: CatalogVariant[];
  unitPrice: number;
  quantity: number;
  image?: string | null;
};

type ExtractedOrder = {
  customer_name: string;
  phone: string;
  address: string;
  product: string;
  quantity: number;
  price: number;
};

type ProductsResponse = { products: CatalogProduct[] };

const PAYMENT_METHODS = [
  { value: "cod", label: "Cash on Delivery" },
  { value: "bkash", label: "bKash" },
  { value: "nagad", label: "Nagad" },
  { value: "card", label: "Card" },
];

const DEFAULT_DELIVERY_FEE = 100;

function money(value: number) {
  return `৳${Math.max(0, value).toLocaleString()}`;
}

export default function NewOrder() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const returnTo = typeof location.state?.from === "string" ? location.state.from : "/";
  const [orderText, setOrderText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [deliveryOn, setDeliveryOn] = useState(true);
  const [discount, setDiscount] = useState(0);
  const [advance, setAdvance] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [notes, setNotes] = useState("");
  const [runFraudCheck, setRunFraudCheck] = useState(false);

  const productsQuery = useQuery<ProductsResponse>({
    queryKey: ["/api/products"],
    staleTime: 60_000,
    queryFn: async () => {
      const response = await apiFetch("/api/products");
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to load products");
      return { products: (data.products || []).map((product: CatalogProduct) => ({ ...product, variants: product.variants || [] })) };
    },
  });

  const products = productsQuery.data?.products || [];
  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0), [lines]);
  const deliveryCharge = deliveryOn ? DEFAULT_DELIVERY_FEE : 0;
  const total = Math.max(0, subtotal + deliveryCharge - discount);

  function addCatalogItem(product: CatalogProduct, variant?: CatalogVariant) {
    const price = (product.selling_price || 0) + (variant?.price_adjustment || 0);
    const variantId = variant?.id || null;
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id && line.variantId === variantId);
      if (existing) return current.map((line) => line.id === existing.id ? { ...line, quantity: line.quantity + 1 } : line);
      return [...current, {
          id: crypto.randomUUID(),
          name: product.name,
          productId: product.id,
          variantId,
          variantName: variant ? variantLabel(variant.attributes) : null,
          variants: product.variants,
          unitPrice: price,
          quantity: 1,
          image: catalogImage(product),
        }];
    });
  }

  function updateLine(lineId: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => line.id === lineId ? { ...line, ...patch } : line));
  }

  function updateLineVariant(lineId: string, variantId: string) {
    setLines((current) => current.map((line) => {
      if (line.id !== lineId) return line;
      const variant = line.variants.find((item) => item.id === variantId);
      const product = products.find((item) => item.id === line.productId);
      if (!variant || !product) return { ...line, variantId: null, variantName: null, unitPrice: product?.selling_price || line.unitPrice };
      return { ...line, variantId: variant.id, variantName: variantLabel(variant.attributes), unitPrice: (product.selling_price || 0) + (variant.price_adjustment || 0) };
    }));
  }

  function updateLineQty(lineId: string, delta: number) {
    setLines((current) => current.map((line) => line.id === lineId ? { ...line, quantity: Math.max(1, line.quantity + delta) } : line));
  }

  function removeLine(lineId: string) {
    setLines((current) => current.filter((line) => line.id !== lineId));
  }

  async function extractOrder() {
    if (!orderText.trim()) {
      toast.error("Please paste the order text first");
      return;
    }
    setExtracting(true);
    try {
      const response = await apiFetch("/api/extract-order-from-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderText }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Extraction failed");
      const order = data.extractedOrder as ExtractedOrder | undefined;
      if (!order) throw new Error(data.error || "Could not extract order details");
      setCustomerName(order.customer_name || "");
      setPhone(order.phone || "");
      setAddress(order.address || "");
      setLines([{ id: crypto.randomUUID(), name: order.product || "", productId: null, variantId: null, variantName: null, variants: [], unitPrice: order.price || 0, quantity: order.quantity || 1 }]);
      toast.success("Order details extracted!");
    } catch (error) {
      console.error("Error extracting order:", error);
      toast.error(error instanceof Error ? error.message : "Failed to extract order details");
    } finally {
      setExtracting(false);
    }
  }

  async function createOrder() {
    if (!customerName.trim() && !phone.trim()) {
      toast.error("Add a customer name or phone number");
      return;
    }
    if (!address.trim()) {
      toast.error("Add a delivery address");
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
      const response = await apiFetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: customerName.trim(),
          phone: phone.trim(),
          address: address.trim(),
          product: lines.map((line) => line.name).join(", "),
          quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
          price: subtotal - discount,
          items: lines.map((line) => ({ product_id: line.productId, variant_id: line.variantId, product_name: line.name, variant_name: line.variantName, unit_price: line.unitPrice, quantity: line.quantity })),
          delivery_rate: deliveryCharge,
          status: "pending",
          fraud_checked: false,
          fulfillment_status: "unfulfilled",
          notes: notes.trim() || null,
          payment_method: paymentMethod,
          discount,
          advanced_payment: advance,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to create order");

      if (runFraudCheck && data?.order?.id) {
        try {
          await apiFetch("/api/check-fraud", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: data.order.id }),
          });
        } catch {
          // The order is saved even if the optional manual fraud check fails.
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast.custom(() => <DarkToast className="flex items-center gap-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15"><CheckCircle weight="light" size={20} className="text-emerald-400" /></div><div><span className="block text-[10px] font-semibold uppercase tracking-widest text-white/50">Order created</span><span className="text-sm font-semibold text-white">{customerName || "Order"}</span></div></DarkToast>, { fit: true });
      navigate(returnTo, { replace: true });
    } catch (error) {
      console.error("Error creating order:", error);
      toast.error(error instanceof Error ? error.message : "Failed to create order");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-3 bg-[#FAFAF8] px-4 pb-4 pt-1 lg:px-5 lg:pt-2">
      <div className="flex shrink-0 items-center gap-3 bg-[#FAFAF8] py-2">
        <BuiButton variant="ghost" size="small" iconOnly leadingIcon={ArrowLeft} aria-label="Back" onClick={() => navigate(returnTo)} />
        <div className="min-w-0">
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/40">New order</p>
          <h1 className="truncate text-[28px] font-medium tracking-tight text-black">Order editor</h1>
        </div>
        <div className="ml-auto hidden items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-black/50 ring-1 ring-inset ring-black/[0.06] sm:flex"><ShieldCheck weight="light" size={15} /> Protected checkout</div>
      </div>

      <div className="min-h-0 overflow-hidden rounded-xl bg-black/[0.07] ring-1 ring-black/[0.07]">
        <section aria-label="Customer and order" className="bg-[#FAFAF8] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/40">Customer and order</p><h2 className="mt-1 text-[18px] font-medium text-black">{customerName || "New customer"}</h2></div>
            <span className="hidden text-[12px] text-black/40 sm:block">Enter details or paste a message to start</span>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[10px] font-medium uppercase tracking-[0.16em] text-black/45">Customer name<input aria-label="Customer name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Rahim Uddin" className="mt-2 h-12 w-full rounded-lg bg-black/[0.04] px-3.5 text-[14px] normal-case tracking-normal text-black outline-none ring-1 ring-inset ring-black/[0.06] transition focus:bg-white focus:ring-black/20" /></label>
              <label className="block text-[10px] font-medium uppercase tracking-[0.16em] text-black/45">Phone<input aria-label="Phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="01712345678" className="mt-2 h-12 w-full rounded-lg bg-black/[0.04] px-3.5 text-[14px] normal-case tracking-normal text-black outline-none ring-1 ring-inset ring-black/[0.06] transition focus:bg-white focus:ring-black/20" /></label>
              <label className="block text-[10px] font-medium uppercase tracking-[0.16em] text-black/45 sm:col-span-2">Delivery address<textarea aria-label="Delivery address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="House 12, Road 5, Dhanmondi, Dhaka" rows={2} className="mt-2 min-h-16 w-full resize-none rounded-lg bg-black/[0.04] px-3.5 py-2.5 text-[14px] normal-case tracking-normal text-black outline-none ring-1 ring-inset ring-black/[0.06] transition focus:bg-white focus:ring-black/20" /></label>
            </div>
            <div className="rounded-xl bg-white p-4 ring-1 ring-inset ring-black/[0.06]">
              <div className="flex items-center gap-2"><Sparkle weight="light" size={17} className="text-black/60" /><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-black/55">AI capture</p></div>
              <Textarea aria-label="Order message" value={orderText} onChange={(event) => setOrderText(event.target.value)} placeholder="Paste an inbox message…" className="mt-3 min-h-16 resize-none rounded-lg border-0 bg-black/[0.04] text-[13px] shadow-none placeholder:text-black/35 focus-visible:ring-1 focus-visible:ring-black/20" />
              <RichButton color="default" size="default" onClick={() => void extractOrder()} disabled={extracting || !orderText.trim()} className="mt-3 w-full">{extracting ? <Spinner size="sm" /> : <Sparkle weight="light" size={16} />}{extracting ? "Extracting…" : "Extract details"}</RichButton>
            </div>
          </div>
        </section>

        <div data-testid="new-order-workspace" className="grid min-h-0 grid-cols-1 gap-px bg-black/[0.07] xl:h-[calc(100vh-260px)] xl:min-h-[560px] xl:grid-cols-2">
          <CatalogPanel products={products} search={catalogSearch} loading={productsQuery.isPending} error={productsQuery.isError} canEdit={!creating} locked={false} onSearch={setCatalogSearch} onRetry={() => { void productsQuery.refetch(); }} onAdd={addCatalogItem} />

          <section aria-label="Order cart" className="flex min-h-0 flex-col overflow-hidden bg-[#FAFAF8] px-5 py-4 xl:h-full">
            <div className="flex items-baseline justify-between gap-3"><p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/40">Order cart</p><h2 className="text-[15px] font-medium text-black">{lines.reduce((sum, line) => sum + line.quantity, 0)} items</h2></div>
            <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-auto pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin]">
              {lines.length === 0 ? <div className="grid place-items-center gap-2 py-16 text-center"><Package weight="light" size={28} className="text-black/20" /><p className="text-[13px] text-black/45">Choose products from the catalog.</p></div> : lines.map((line) => (
                <article key={line.id} className="rounded-lg bg-white p-4 ring-1 ring-inset ring-black/[0.06]">
                  <div className="flex min-w-0 gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-black/[0.04]">{line.image ? <img src={line.image} alt="" className="h-full w-full object-cover" /> : <Package weight="light" size={18} className="text-black/25" />}</div><div className="min-w-0 flex-1"><h3 className="truncate text-[13px] font-medium text-black">{line.name || "Product"}</h3><p className="mt-1 truncate text-[11px] text-black/40">{line.variantName || (line.productId ? "Standard" : "Manual item")}</p></div><button type="button" aria-label={`Remove ${line.name || "product"}`} onClick={() => removeLine(line.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-black/35 hover:bg-red-50 hover:text-red-600"><Trash weight="light" size={15} /></button></div>
                  <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-black/[0.06] pt-3"><div className="flex items-center gap-2">{line.productId && line.variants.length > 0 && <select aria-label={`Variant for ${line.name}`} value={line.variantId || ""} onChange={(event) => updateLineVariant(line.id, event.target.value)} className="h-8 min-w-24 max-w-36 truncate rounded-lg bg-black/[0.04] px-2 text-[12px] text-black outline-none"><option value="">Select variant</option>{line.variants.map((variant) => <option key={variant.id} value={variant.id}>{variantLabel(variant.attributes) || "Default variant"}</option>)}</select>}<span className="font-mono text-[13px] tabular-nums text-black/60">{money(line.unitPrice)}</span></div><div className="flex items-center rounded-lg bg-black/[0.04] p-1"><button type="button" aria-label={`Decrease ${line.name || "product"} quantity`} onClick={() => updateLineQty(line.id, -1)} className="grid h-7 w-7 place-items-center rounded-md text-black/45 disabled:opacity-20" disabled={line.quantity <= 1}><Minus weight="light" size={13} /></button><span className="w-6 text-center font-mono text-[12px]">{line.quantity}</span><button type="button" aria-label={`Increase ${line.name || "product"} quantity`} onClick={() => updateLineQty(line.id, 1)} className="grid h-7 w-7 place-items-center rounded-md text-black/45"><Plus weight="light" size={13} /></button></div></div>
                  <p className="mt-2 text-right font-mono text-[11px] tabular-nums text-black/55">Line total {money(line.unitPrice * line.quantity)}</p>
                </article>
              ))}

              <div className="overflow-hidden rounded-lg bg-white ring-1 ring-inset ring-black/[0.06]">
                <div className="flex items-center justify-between border-b border-black/[0.07] px-4 py-3"><div className="flex items-center gap-2"><Truck weight="light" size={17} className="text-black/45" /><span className="text-[13px] text-black/70">Delivery</span></div><div className="flex items-center gap-2"><span className="text-[13px] font-medium text-black">{deliveryCharge > 0 ? money(deliveryCharge) : "Free"}</span><Switch size="sm" aria-label="Toggle delivery charge" isSelected={deliveryOn} onChange={setDeliveryOn} /></div></div>
                <div className="flex items-center justify-between border-b border-black/[0.07] px-4 py-3"><span className="text-[13px] text-black/45">Subtotal</span><span className="font-mono text-[13px] tabular-nums">{money(subtotal)}</span></div>
                <label className="flex items-center justify-between border-b border-black/[0.07] px-4 py-3"><span className="text-[13px] text-black/45">Discount</span><input aria-label="Discount" type="number" min={0} value={discount} onChange={(event) => setDiscount(Math.max(0, Number(event.target.value) || 0))} className="w-20 bg-transparent text-right font-mono text-[13px] outline-none" /></label>
                <label className="flex items-center justify-between border-b border-black/[0.07] px-4 py-3"><span className="text-[13px] text-black/45">Advance / partial</span><input aria-label="Advance payment" type="number" min={0} value={advance} onChange={(event) => setAdvance(Math.max(0, Number(event.target.value) || 0))} className="w-20 bg-transparent text-right font-mono text-[13px] outline-none" /></label>
                <div className="flex items-center justify-between bg-black/[0.035] px-4 py-3"><span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/55">Final total</span><span className="font-mono text-[19px] font-semibold tabular-nums text-black">{money(total)}</span></div>
                {advance > 0 && <div className="flex items-center justify-between border-t border-black/[0.07] px-4 py-2"><span className="text-[11px] text-black/40">Due after advance</span><span className="font-mono text-[11px] font-semibold tabular-nums">{money(total - advance)}</span></div>}
              </div>

              <div className="grid gap-3 rounded-lg bg-white p-4 ring-1 ring-inset ring-black/[0.06] sm:grid-cols-2"><label className="space-y-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-black/45">Payment method<Select value={paymentMethod} onValueChange={setPaymentMethod}><SelectTrigger className="mt-1 h-10 rounded-lg border-0 bg-black/[0.04] text-[13px] normal-case tracking-normal shadow-none"><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_METHODS.map((method) => <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>)}</SelectContent></Select></label><label className="space-y-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-black/45">Internal note<Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional note" className="mt-1 h-10 rounded-lg border-0 bg-black/[0.04] text-[13px] normal-case tracking-normal shadow-none placeholder:text-black/35 focus-visible:ring-1 focus-visible:ring-black/20" /></label></div>
            </div>
            <div className="mt-3 flex shrink-0 flex-col gap-3 border-t border-black/[0.08] pt-3 sm:flex-row sm:items-center"><label className="flex flex-1 cursor-pointer items-center gap-2 text-[12px] text-black/50"><input type="checkbox" checked={runFraudCheck} onChange={(event) => setRunFraudCheck(event.target.checked)} className="h-4 w-4 rounded border-black/20 accent-black" /><ShieldCheck weight="light" size={16} /> Run fraud check</label><button type="button" onClick={() => navigate(returnTo)} disabled={creating} className="h-10 rounded-lg px-3 text-[12px] text-black/50 hover:bg-black/[0.05] disabled:opacity-40">Cancel</button><button type="button" onClick={() => void createOrder()} disabled={creating} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-black px-4 text-[12px] font-medium text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-40">{creating ? <Spinner size="sm" /> : <Plus weight="light" size={15} />}{creating ? "Creating…" : "Create order"}</button></div>
          </section>
        </div>
      </div>
    </div>
  );
}
