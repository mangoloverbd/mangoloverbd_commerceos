import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle, MapPin, Minus, Package, Phone as PhoneIcon, Plus, ShieldCheck, ShoppingCartSimple, Trash, Truck, User, UserPlus } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { Button as BuiButton } from "@/components/base/buttons/button";
import { CatalogPanel } from "@/components/order-editor/CatalogPanel";
import { Spinner } from "@/components/ui/ios-spinner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/base/switch/switch";
import { DarkToast, toast } from "@/components/ui/sonner";
import { catalogImage, variantLabel, type CatalogProduct, type CatalogVariant } from "@/lib/orderEditor";
import { OrderSourceSelect } from "@/components/order-editor/OrderSourceSelect";
import { FraudPanel } from "@/components/order-editor/FraudPanel";
import { useFraudCheckMutation } from "@/hooks/useFraudCheck";
import { normalizeBdPhone } from "@/lib/bdPhone";
import { StaffSelect } from "@/components/order-editor/StaffSelect";
import { useAuth } from "@/hooks/useAuth";
import type { OrderSource } from "@/lib/orderSource";

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
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const returnTo = typeof location.state?.from === "string" ? location.state.from : "/";
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
  const [source, setSource] = useState<OrderSource>("manual_other");
  const [assignedTo, setAssignedTo] = useState<string | null>(null);

  useEffect(() => {
    if (!assignedTo && user?.id) setAssignedTo(user.id);
  }, [assignedTo, user?.id]);

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

  function resetCustomer() {
    setCustomerName("");
    setPhone("");
    setAddress("");
  }

  const normalizedPhone = normalizeBdPhone(phone);
  const fraudCheck = useFraudCheckMutation(phone);
  const autoCheckedPhone = useRef<string | null>(null);

  // Check the number in the background as soon as it becomes a valid BD
  // phone. resolveFraudCheck returns fresh cache without spending a request,
  // so re-typing a known number costs nothing.
  useEffect(() => {
    if (normalizedPhone && autoCheckedPhone.current !== normalizedPhone) {
      autoCheckedPhone.current = normalizedPhone;
      fraudCheck.mutate({ force: false });
    }
  }, [normalizedPhone, fraudCheck]);

  async function createOrder() {
    if (!phone.trim()) {
      toast.error("Phone number is required");
      return;
    }
    if (!customerName.trim()) {
      toast.error("Add a customer name");
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
          status: "confirmed",
          fraud_checked: false,
          fulfillment_status: "unfulfilled",
          notes: notes.trim() || null,
          payment_method: paymentMethod,
          discount,
          advanced_payment: advance,
          source,
          assigned_to: assignedTo,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to create order");

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
    <div className="flex min-h-full min-w-0 flex-col gap-3 bg-[#FAFAF8] px-2 pb-3 pt-0 lg:px-3 lg:pt-1">
      <div className="flex shrink-0 items-center gap-3 bg-[#FAFAF8] py-2">
        <BuiButton variant="ghost" size="small" iconOnly leadingIcon={ArrowLeft} aria-label="Back" onClick={() => navigate(returnTo)} />
        <div className="min-w-0">
          <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">New order</p>
          <h1 className="truncate text-[28px] font-medium tracking-tight text-black">Order editor</h1>
        </div>
        <div className="ml-auto hidden items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-black ring-1 ring-inset ring-black/[0.06] sm:flex"><ShieldCheck weight="light" size={15} /> Protected checkout</div>
      </div>

      <div className="min-h-0 overflow-hidden rounded-xl bg-black/[0.07] ring-1 ring-black/[0.07]">
        <section aria-label="Customer and order" className="bg-[#FAFAF8] px-5 py-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
            <div className="flex flex-col gap-4">
              <div className="rounded-xl bg-white p-4 ring-1 ring-inset ring-black/[0.06]">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eaf7ef]">
                      <User weight="light" size={19} className="text-[#2e9e5b]" />
                    </span>
                    <div>
                      <p className="text-[15px] font-semibold text-black">Customer details</p>
                      <p className="text-[11.5px] text-black/45">Enter customer information to create the order</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={resetCustomer}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#eaf7ef] px-2.5 py-1.5 text-[12px] font-medium text-[#2e9e5b] transition hover:bg-[#dcf0e4]"
                  >
                    <UserPlus weight="light" size={14} />
                    New customer
                  </button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="block text-[10px] font-medium uppercase tracking-[0.16em] text-black">
                    Customer name
                    <div className="relative mt-2">
                      <User weight="light" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-black/35" />
                      <input aria-label="Customer name" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Rahim Uddin" className="h-12 w-full rounded-lg bg-black/[0.04] pl-10 pr-3.5 text-[14px] normal-case tracking-normal text-black outline-none ring-1 ring-inset ring-black/[0.06] transition focus:bg-white focus:ring-black/20" />
                    </div>
                  </label>
                  <label className="block text-[10px] font-medium uppercase tracking-[0.16em] text-black">
                    Phone <span className="text-red-500">*</span>
                    <div className="relative mt-2">
                      <PhoneIcon weight="light" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-black/35" />
                      <input aria-label="Phone" type="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="01712345678" className="h-12 w-full rounded-lg bg-black/[0.04] pl-10 pr-3.5 text-[14px] normal-case tracking-normal text-black outline-none ring-1 ring-inset ring-black/[0.06] transition focus:bg-white focus:ring-black/20" />
                    </div>
                  </label>
                  <label className="block text-[10px] font-medium uppercase tracking-[0.16em] text-black sm:col-span-2">
                    Delivery address
                    <div className="relative mt-2">
                      <MapPin weight="light" size={16} className="pointer-events-none absolute left-3.5 top-3 text-black/35" />
                      <textarea aria-label="Delivery address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="House 12, Road 5, Dhanmondi, Dhaka" rows={4} className="min-h-32 w-full resize-none rounded-lg bg-black/[0.04] py-2.5 pl-10 pr-3.5 text-[14px] normal-case tracking-normal text-black outline-none ring-1 ring-inset ring-black/[0.06] transition focus:bg-white focus:ring-black/20" />
                    </div>
                  </label>
                </div>
              </div>

              <div className="rounded-xl bg-white p-4 ring-1 ring-inset ring-black/[0.06]">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eaf7ef]">
                    <ShoppingCartSimple weight="light" size={19} className="text-[#2e9e5b]" />
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold text-black">Order settings</p>
                    <p className="text-[11.5px] text-black/45">Set order source and assign telesales staff</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="block text-[10px] font-medium uppercase tracking-[0.16em] text-black">Order source<div className="mt-2"><OrderSourceSelect value={source} onChange={setSource} disabled={creating} /></div></label>
                  <label className="block text-[10px] font-medium uppercase tracking-[0.16em] text-black">Telesales staff<div className="mt-2"><StaffSelect value={assignedTo} onChange={setAssignedTo} disabled={creating} /></div></label>
                </div>
              </div>
            </div>
            <div className="rounded-xl bg-white p-4 ring-1 ring-inset ring-black/[0.06]">
              <FraudPanel phone={phone} defaultExpanded compact alignHeader="left" className="flex h-full flex-col justify-between gap-3" />
            </div>
          </div>
        </section>

        <div data-testid="new-order-workspace" className="grid min-h-0 grid-cols-1 gap-px bg-black/[0.07] xl:h-[calc(100vh-260px)] xl:min-h-[560px] xl:grid-cols-2">
          <CatalogPanel products={products} search={catalogSearch} loading={productsQuery.isPending} error={productsQuery.isError} canEdit={!creating} locked={false} onSearch={setCatalogSearch} onRetry={() => { void productsQuery.refetch(); }} onAdd={addCatalogItem} />

          <section aria-label="Order cart" className="flex min-h-0 flex-col overflow-hidden bg-[#FAFAF8] px-5 py-4 xl:h-full">
            <div className="flex items-baseline justify-between gap-3"><p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Order cart</p><h2 className="text-[15px] font-medium text-black">{lines.reduce((sum, line) => sum + line.quantity, 0)} items</h2></div>
            <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-auto pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin]">
              {lines.length === 0 ? <div className="grid place-items-center gap-2 py-16 text-center"><Package weight="light" size={28} className="text-black/20" /><p className="text-[13px] text-black">Choose products from the catalog.</p></div> : lines.map((line) => (
                <article key={line.id} className="rounded-lg bg-white p-4 ring-1 ring-inset ring-black/[0.06]">
                  <div className="flex min-w-0 gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-black/[0.04]">{line.image ? <img src={line.image} alt="" className="h-full w-full object-cover" /> : <Package weight="light" size={18} className="text-black/25" />}</div><div className="min-w-0 flex-1"><h3 className="truncate text-[13px] font-medium text-black">{line.name || "Product"}</h3><p className="mt-1 truncate text-[11px] text-black">{line.variantName || (line.productId ? "Standard" : "Manual item")}</p></div><button type="button" aria-label={`Remove ${line.name || "product"}`} onClick={() => removeLine(line.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-black/35 hover:bg-red-50 hover:text-red-600"><Trash weight="light" size={15} /></button></div>
                  <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-black/[0.06] pt-3"><div className="flex items-center gap-2">{line.productId && line.variants.length > 0 && <select aria-label={`Variant for ${line.name}`} value={line.variantId || ""} onChange={(event) => updateLineVariant(line.id, event.target.value)} className="h-8 min-w-24 max-w-36 truncate rounded-lg bg-black/[0.04] px-2 text-[12px] text-black outline-none"><option value="">Select variant</option>{line.variants.map((variant) => <option key={variant.id} value={variant.id}>{variantLabel(variant.attributes) || "Default variant"}</option>)}</select>}<span className="font-mono text-[13px] tabular-nums text-black">{money(line.unitPrice)}</span></div><div className="flex items-center rounded-lg bg-black/[0.04] p-1"><button type="button" aria-label={`Decrease ${line.name || "product"} quantity`} onClick={() => updateLineQty(line.id, -1)} className="grid h-7 w-7 place-items-center rounded-md text-black disabled:opacity-20" disabled={line.quantity <= 1}><Minus weight="light" size={13} /></button><span className="w-6 text-center font-mono text-[12px]">{line.quantity}</span><button type="button" aria-label={`Increase ${line.name || "product"} quantity`} onClick={() => updateLineQty(line.id, 1)} className="grid h-7 w-7 place-items-center rounded-md text-black"><Plus weight="light" size={13} /></button></div></div>
                  <p className="mt-2 text-right font-mono text-[11px] tabular-nums text-black">Line total {money(line.unitPrice * line.quantity)}</p>
                </article>
              ))}

              <div className="overflow-hidden rounded-lg bg-white ring-1 ring-inset ring-black/[0.06]">
                <div className="flex items-center justify-between border-b border-black/[0.07] px-4 py-3"><div className="flex items-center gap-2"><Truck weight="light" size={17} className="text-black" /><span className="text-[13px] text-black">Delivery</span></div><div className="flex items-center gap-2"><span className="text-[13px] font-medium text-black">{deliveryCharge > 0 ? money(deliveryCharge) : "Free"}</span><Switch size="sm" aria-label="Toggle delivery charge" isSelected={deliveryOn} onChange={setDeliveryOn} /></div></div>
                <div className="flex items-center justify-between border-b border-black/[0.07] px-4 py-3"><span className="text-[13px] text-black">Subtotal</span><span className="font-mono text-[13px] tabular-nums">{money(subtotal)}</span></div>
                <label className="flex items-center justify-between border-b border-black/[0.07] px-4 py-3"><span className="text-[13px] text-black">Discount</span><input aria-label="Discount" type="number" min={0} value={discount} onChange={(event) => setDiscount(Math.max(0, Number(event.target.value) || 0))} className="w-20 bg-transparent text-right font-mono text-[13px] outline-none" /></label>
                <label className="flex items-center justify-between border-b border-black/[0.07] px-4 py-3"><span className="text-[13px] text-black">Advance / partial</span><input aria-label="Advance payment" type="number" min={0} value={advance} onChange={(event) => setAdvance(Math.max(0, Number(event.target.value) || 0))} className="w-20 bg-transparent text-right font-mono text-[13px] outline-none" /></label>
                <div className="flex items-center justify-between bg-black/[0.035] px-4 py-3"><span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black">Final total</span><span className="font-mono text-[19px] font-semibold tabular-nums text-black">{money(total)}</span></div>
                {advance > 0 && <div className="flex items-center justify-between border-t border-black/[0.07] px-4 py-2"><span className="text-[11px] text-black">Due after advance</span><span className="font-mono text-[11px] font-semibold tabular-nums">{money(total - advance)}</span></div>}
              </div>

              <div className="grid gap-3 rounded-lg bg-white p-4 ring-1 ring-inset ring-black/[0.06] sm:grid-cols-2"><label className="space-y-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-black">Payment method<Select value={paymentMethod} onValueChange={setPaymentMethod}><SelectTrigger className="mt-1 h-10 rounded-lg border-0 bg-black/[0.04] text-[13px] normal-case tracking-normal shadow-none"><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_METHODS.map((method) => <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>)}</SelectContent></Select></label><label className="space-y-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-black">Internal note<Input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional note" className="mt-1 h-10 rounded-lg border-0 bg-black/[0.04] text-[13px] normal-case tracking-normal shadow-none placeholder:text-black/35 focus-visible:ring-1 focus-visible:ring-black/20" /></label></div>
            </div>
            <div className="mt-3 flex shrink-0 flex-col gap-3 border-t border-black/[0.08] pt-3 sm:flex-row sm:items-center sm:justify-end"><button type="button" onClick={() => navigate(returnTo)} disabled={creating} className="h-10 rounded-lg px-3 text-[12px] text-black hover:bg-black/[0.05] disabled:opacity-40">Cancel</button><button type="button" onClick={() => void createOrder()} disabled={creating} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-black px-4 text-[12px] font-medium text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-40">{creating ? <Spinner size="sm" /> : <Plus weight="light" size={15} />}{creating ? "Creating…" : "Create order"}</button></div>
          </section>
        </div>
      </div>
    </div>
  );
}
