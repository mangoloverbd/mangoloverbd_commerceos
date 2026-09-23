import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle, MapPin, Minus, NotePencil, Package, Phone as PhoneIcon, Plus, ShieldCheck, ShoppingCartSimple, Trash, Truck, User, UserPlus } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { Chip } from "@/components/base/badges/chip";
import { Button as BuiButton } from "@/components/base/buttons/button";
import { CatalogPanel } from "@/components/order-editor/CatalogPanel";
import { Spinner } from "@/components/ui/ios-spinner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/base/switch/switch";
import { DarkToast, toast } from "@/components/ui/sonner";
import {
  calculateCartTotals,
  calculateUnitDiscount,
  formatTaka,
  roundTaka,
  upsertCartItem,
  variantLabel,
  type CatalogProduct,
  type CatalogVariant,
  type DiscountType,
  type OrderEditorItem,
} from "@/lib/orderEditor";
import { DiscountEditor } from "@/components/order-editor/DiscountEditor";
import { CartDiscountEditor } from "@/components/order-editor/CartDiscountEditor";
import { OrderSourceSelect } from "@/components/order-editor/OrderSourceSelect";
import { FraudPanel } from "@/components/order-editor/FraudPanel";
import { useFraudCheckMutation } from "@/hooks/useFraudCheck";
import { normalizeBdPhone } from "@/lib/bdPhone";
import { StaffSelect } from "@/components/order-editor/StaffSelect";
import { useAuth } from "@/hooks/useAuth";
import type { OrderSource } from "@/lib/orderSource";

type Line = OrderEditorItem;

type ProductsResponse = { products: CatalogProduct[] };
type CustomerLookupResponse = {
  customer: {
    customerName: string;
    address: string;
    lastOrderAt: string | null;
  } | null;
};

const PAYMENT_METHODS = [
  { value: "cod", label: "Cash on Delivery" },
  { value: "bkash", label: "bKash" },
  { value: "nagad", label: "Nagad" },
  { value: "card", label: "Card" },
];

const DEFAULT_DELIVERY_FEE = 100;

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
  const [matchedCustomerPhone, setMatchedCustomerPhone] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [deliveryOn, setDeliveryOn] = useState(true);
  const [overallType, setOverallType] = useState<DiscountType | null>(null);
  const [overallValue, setOverallValue] = useState(0);
  const [advance, setAdvance] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [notes, setNotes] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
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
  const deliveryCharge = deliveryOn ? DEFAULT_DELIVERY_FEE : 0;
  const draftBase = useMemo(() => {
    const withoutOverall = calculateCartTotals(lines, 0, 0);
    return roundTaka(withoutOverall.grossSubtotal - withoutOverall.itemDiscount);
  }, [lines]);
  const overallAmount = calculateUnitDiscount(draftBase, overallType, overallValue);
  const totals = useMemo(
    () => calculateCartTotals(lines, deliveryCharge, overallAmount),
    [lines, deliveryCharge, overallAmount],
  );
  const total = totals.finalTotal;

  function addCatalogItem(product: CatalogProduct, variant?: CatalogVariant) {
    setLines((current) => upsertCartItem(current, product, variant));
  }

  function updateLineVariant(lineId: string, variantId: string) {
    setLines((current) => current.map((line) => {
      if (line.id !== lineId) return line;
      const product = products.find((item) => item.id === line.product_id);
      const allVariants = product?.variants || [];
      const variant = allVariants.find((item) => item.id === variantId);
      if (!variant || !product) {
        const fallbackPrice = product?.selling_price || line.unit_price;
        return {
          ...line,
          variant_id: null,
          variant_name: null,
          unit_price: fallbackPrice,
          unit_discount: calculateUnitDiscount(fallbackPrice, line.discount_type, line.discount_value),
        };
      }
      const nextPrice = (product.selling_price || 0) + (variant.price_adjustment || 0);
      return {
        ...line,
        variant_id: variant.id,
        variant_name: variantLabel(variant.attributes),
        unit_price: nextPrice,
        available_stock: variant.stock_quantity ?? product.stock_quantity,
        weight_kg: variant.weight_kg ?? product.weight_kg ?? line.weight_kg ?? null,
        unit_discount: calculateUnitDiscount(nextPrice, line.discount_type, line.discount_value),
      };
    }));
  }

  function updateLineQty(lineId: string, delta: number) {
    setLines((current) => current.map((line) => {
      if (line.id !== lineId) return line;
      const max = line.available_stock ?? Number.MAX_SAFE_INTEGER;
      return { ...line, quantity: Math.max(1, Math.min(max, line.quantity + delta)) };
    }));
  }

  function setLineQty(lineId: string, qty: number) {
    setLines((current) => current.map((line) => {
      if (line.id !== lineId) return line;
      const max = line.available_stock ?? Number.MAX_SAFE_INTEGER;
      const next = Number.isFinite(qty) ? Math.trunc(qty) : line.quantity;
      return { ...line, quantity: Math.max(1, Math.min(max, next || 1)) };
    }));
  }

  function updateLineDiscount(lineId: string, discountType: DiscountType | null, discountValue: number) {
    setLines((current) => current.map((line) => line.id === lineId ? {
      ...line,
      discount_type: discountType,
      discount_value: discountType ? discountValue : 0,
      unit_discount: calculateUnitDiscount(line.unit_price, discountType, discountValue),
    } : line));
  }

  function removeLine(lineId: string) {
    setLines((current) => current.filter((line) => line.id !== lineId));
  }

  function resetCustomer() {
    setCustomerName("");
    setPhone("");
    setAddress("");
    setMatchedCustomerPhone(null);
  }

  const normalizedPhone = normalizeBdPhone(phone);
  const customerLookup = useQuery<CustomerLookupResponse>({
    queryKey: ["/api/customers/lookup", normalizedPhone],
    enabled: Boolean(normalizedPhone),
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      if (!normalizedPhone) return { customer: null };
      const response = await apiFetch(`/api/customers/lookup?phone=${encodeURIComponent(normalizedPhone)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to look up customer");
      return { customer: data.customer || null };
    },
  });
  const fraudCheck = useFraudCheckMutation(phone);
  const autoCheckedPhone = useRef<string | null>(null);
  const cartScrollRef = useRef<HTMLDivElement>(null);
  const prevLineCount = useRef(0);

  // Keep the newest cart item in view so the operator can preview it
  // right after adding. Only fires when a new line appears (length
  // increase) — quantity bumps on existing lines don't move the scroll.
  useEffect(() => {
    if (lines.length > prevLineCount.current) {
      const scroller = cartScrollRef.current;
      if (scroller && typeof scroller.scrollTo === "function") {
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
      }
    }
    prevLineCount.current = lines.length;
  }, [lines.length]);

  // Check the number in the background as soon as it becomes a valid BD
  // phone. resolveFraudCheck returns fresh cache without spending a request,
  // so re-typing a known number costs nothing.
  useEffect(() => {
    if (normalizedPhone && autoCheckedPhone.current !== normalizedPhone) {
      autoCheckedPhone.current = normalizedPhone;
      fraudCheck.mutate({ force: false });
    }
  }, [normalizedPhone, fraudCheck]);

  useEffect(() => {
    if (!normalizedPhone) {
      setMatchedCustomerPhone(null);
      return;
    }

    const customer = customerLookup.data?.customer;
    if (!customer) {
      if (customerLookup.isSuccess) setMatchedCustomerPhone(null);
      return;
    }

    setCustomerName((current) => current.trim() ? current : customer.customerName || "");
    setAddress((current) => current.trim() ? current : customer.address || "");
    setMatchedCustomerPhone(normalizedPhone);
  }, [customerLookup.data, customerLookup.isSuccess, normalizedPhone]);

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
    const missingVariant = lines.find((line) => {
      if (!line.product_id || line.variant_id) return false;
      const product = products.find((item) => item.id === line.product_id);
      return (product?.variants?.length || 0) > 0;
    });
    if (missingVariant) {
      toast.error(`Select a variant for ${missingVariant.product_name || "product"}`);
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
          product: lines.map((line) => line.product_name || "Product").join(", "),
          quantity: totals.quantity,
          price: totals.netMerchandiseTotal,
          items: lines.map((line) => ({ product_id: line.product_id, variant_id: line.variant_id, product_name: line.product_name, variant_name: line.variant_name, unit_price: line.unit_price, quantity: line.quantity, discount_type: line.discount_type, discount_value: line.discount_value, unit_discount: line.unit_discount })),
          delivery_rate: deliveryCharge,
          status: "confirmed",
          fraud_checked: false,
          fulfillment_status: "unfulfilled",
          notes: notes.trim() || null,
          payment_method: paymentMethod,
          discount: totals.aggregateDiscount,
          advanced_payment: Math.min(advance, total),
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
      <div data-testid="new-order-toolbar" className="sticky top-0 z-30 flex shrink-0 items-center gap-3 bg-[#FAFAF8]/95 py-2 backdrop-blur-sm">
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
                    {normalizedPhone && matchedCustomerPhone === normalizedPhone && <p className="mt-1.5 text-[11px] normal-case tracking-normal text-[#2e9e5b]">Previous customer found</p>}
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

        <div data-testid="new-order-workspace" className="grid min-h-0 grid-cols-1 gap-px bg-black/[0.07] xl:h-[calc(100vh-68px)] xl:min-h-[560px] xl:grid-cols-2">
          <CatalogPanel products={products} search={catalogSearch} loading={productsQuery.isPending} error={productsQuery.isError} canEdit={!creating} locked={false} onSearch={setCatalogSearch} onRetry={() => { void productsQuery.refetch(); }} onAdd={addCatalogItem} />

          <section aria-label="Order cart" className="flex min-h-0 flex-col overflow-hidden bg-[#FAFAF8] px-5 py-3 xl:h-full">
            <div className="flex items-baseline justify-between gap-3"><p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Order cart</p><h2 className="text-[15px] font-medium text-black">{totals.quantity} items</h2></div>
            <div ref={cartScrollRef} className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-auto pr-1 [scrollbar-gutter:stable] [scrollbar-width:thin]">
              {lines.length === 0 ? <div className="grid place-items-center gap-2 py-16 text-center"><Package weight="light" size={28} className="text-black/20" /><p className="text-[13px] text-black">Choose products from the catalog.</p></div> : lines.map((line) => {
                const lineName = line.product_name || "Product";
                const productForLine = products.find((item) => item.id === line.product_id);
                const variantOptions = productForLine?.variants || [];
                const unitDiscount = calculateUnitDiscount(line.unit_price, line.discount_type, line.discount_value);
                const netUnit = line.unit_price - unitDiscount;
                const maxQty = line.available_stock ?? undefined;
                return (
                <article key={line.id} className="rounded-lg bg-white p-4 ring-1 ring-inset ring-black/[0.06]">
                  <div className="flex min-w-0 gap-3"><div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-black/[0.04]">{line.image_url ? <img src={line.image_url} alt="" className="h-full w-full object-cover" /> : <Package weight="light" size={18} className="text-black/25" />}</div><div className="min-w-0 flex-1"><h3 className="truncate text-[13px] font-medium text-black">{lineName}</h3><p className="mt-1 truncate text-[11px] text-black">{line.variant_name || (line.product_id ? "Standard" : "Manual item")}</p></div><button type="button" aria-label={`Remove ${lineName}`} onClick={() => removeLine(line.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-black/35 hover:bg-red-50 hover:text-red-600"><Trash weight="light" size={15} /></button></div>
                  <div className="mt-3 flex min-w-0 flex-wrap items-end justify-between gap-2 border-t border-black/[0.06] pt-3"><div className="flex flex-col gap-1">{line.product_id && variantOptions.length > 0 && <select aria-label={`Variant for ${lineName}`} value={line.variant_id || ""} onChange={(event) => updateLineVariant(line.id, event.target.value)} className="h-8 min-w-24 max-w-36 truncate rounded-lg bg-black/[0.04] px-2 text-[12px] text-black outline-none"><option value="">Select variant</option>{variantOptions.map((variant) => <option key={variant.id} value={variant.id}>{variantLabel(variant.attributes) || "Default variant"}</option>)}</select>}<div className="flex items-baseline gap-2"><span className="font-mono text-[13px] tabular-nums text-black">{formatTaka(netUnit)}</span>{unitDiscount > 0 && <span className="font-mono text-[10px] tabular-nums text-black/35 line-through">{formatTaka(line.unit_price)}</span>}</div><DiscountEditor item={line} disabled={creating} onApply={(type, value) => updateLineDiscount(line.id, type, value)} onRemove={() => updateLineDiscount(line.id, null, 0)} /></div><div className="flex items-center rounded-lg bg-black/[0.04] p-1"><button type="button" aria-label={`Decrease ${lineName} quantity`} onClick={() => updateLineQty(line.id, -1)} className="grid h-7 w-7 place-items-center rounded-md text-black disabled:opacity-20" disabled={line.quantity <= 1}><Minus weight="light" size={13} /></button><input aria-label={`Quantity for ${lineName}`} type="number" min={1} max={maxQty} value={line.quantity} onChange={(event) => setLineQty(line.id, Number.parseInt(event.target.value, 10))} disabled={creating} className="h-7 w-10 bg-transparent text-center font-mono text-[12px] outline-none disabled:opacity-40" /><button type="button" aria-label={`Increase ${lineName} quantity`} onClick={() => updateLineQty(line.id, 1)} disabled={creating || (maxQty != null && line.quantity >= maxQty)} className="grid h-7 w-7 place-items-center rounded-md text-black disabled:opacity-20"><Plus weight="light" size={13} /></button></div></div>
                  <p className="mt-2 text-right font-mono text-[11px] tabular-nums text-black">Line total {formatTaka(netUnit * line.quantity)}</p>
                </article>
                );
              })}
            </div>
            <div className="mt-3 shrink-0 border-t border-black/[0.08] bg-[#FAFAF8] pt-2">
              <div className="overflow-hidden rounded-lg bg-white ring-1 ring-inset ring-black/[0.06]">
                <div className="flex items-center justify-between border-b border-black/[0.07] px-4 py-2"><div className="flex items-center gap-2"><Truck weight="light" size={17} className="text-black" /><span className="text-[13px] text-black">Delivery</span></div><div className="flex items-center gap-2"><span className="text-[13px] font-medium text-black">{deliveryCharge > 0 ? formatTaka(deliveryCharge) : "Free"}</span><Switch size="sm" aria-label="Toggle delivery charge" isSelected={deliveryOn} onChange={setDeliveryOn} /></div></div>
                <div className="px-4 py-1"><CartDiscountEditor base={draftBase} discountType={overallType} discountValue={overallValue} disabled={creating} onApply={(type, value) => { setOverallType(type); setOverallValue(value); }} onRemove={() => { setOverallType(null); setOverallValue(0); }} /></div>
                <div className="flex items-center justify-between border-b border-black/[0.07] px-4 py-2"><span className="text-[13px] text-black">Subtotal</span><span className="font-mono text-[13px] tabular-nums">{formatTaka(totals.grossSubtotal)}</span></div>
                {totals.itemDiscount > 0 && <div className="flex items-center justify-between border-b border-black/[0.07] px-4 py-2"><span className="text-[13px] text-black">Item discounts</span><span className="font-mono text-[13px] tabular-nums text-emerald-700">−{formatTaka(totals.itemDiscount)}</span></div>}
                {totals.legacyDiscount > 0 && <div className="flex items-center justify-between border-b border-black/[0.07] px-4 py-2"><span className="text-[13px] text-black">Order discount</span><span className="font-mono text-[13px] tabular-nums text-emerald-700">−{formatTaka(totals.legacyDiscount)}</span></div>}
                <div className="flex items-center justify-between gap-2 border-b border-black/[0.07] px-4 py-2"><span className="text-[13px] text-black">Advance / partial</span><span className="flex items-center gap-1.5"><span className="flex items-center gap-1 rounded-lg bg-black/[0.04] py-1 pl-2.5 pr-1 ring-1 ring-inset ring-black/[0.06] transition focus-within:bg-white focus-within:ring-black/25"><span className="font-mono text-[13px] text-black/40">৳</span><input aria-label="Advance payment" type="number" min={0} max={total} value={advance > 0 ? advance : ""} placeholder="0" onChange={(event) => setAdvance(Math.min(total, Math.max(0, Number(event.target.value) || 0)))} className="w-20 bg-transparent text-right font-mono text-[13px] font-medium tabular-nums outline-none placeholder:text-black/30" /></span></span></div>
                <div className="flex items-center justify-between bg-black/[0.035] px-4 py-2"><span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black">Final total</span><span className="font-mono text-[19px] font-semibold tabular-nums text-black">{formatTaka(total)}</span></div>
                {advance > 0 && <div className="flex items-center justify-between border-t border-black/[0.07] px-4 py-2"><span className="text-[11px] text-black">Due after advance</span>{advance < total ? <Chip variant="subtle" color="lime" className="font-mono tabular-nums">{formatTaka(total - advance)}</Chip> : <Chip variant="subtle" color="lime" className="font-medium">Paid</Chip>}</div>}
                <div className="flex flex-wrap items-center gap-2 border-t border-black/[0.07] px-4 py-1.5">
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}><SelectTrigger aria-label="Payment method" className="h-9 w-[150px] rounded-lg border-0 bg-black/[0.04] text-[12px] shadow-none"><SelectValue /></SelectTrigger><SelectContent>{PAYMENT_METHODS.map((method) => <SelectItem key={method.value} value={method.value}>{method.label}</SelectItem>)}</SelectContent></Select>
                  <Popover open={noteOpen} onOpenChange={(open) => { if (open) setNoteDraft(notes); setNoteOpen(open); }}>
                    <PopoverTrigger asChild>
                      <button type="button" aria-label="Internal note" title={notes.trim() ? notes : "Add internal note"} className={notes.trim() ? "relative grid h-9 w-9 place-items-center rounded-lg bg-[#eaf7ef] text-[#2e9e5b] transition hover:bg-[#dcf0e4]" : "relative grid h-9 w-9 place-items-center rounded-lg bg-black/[0.04] text-black transition hover:bg-black/[0.08]"}>
                        <NotePencil weight="light" size={16} />
                        {notes.trim() !== "" && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#2e9e5b]" />}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 rounded-lg border-black/[0.08] bg-[#FAFAF8] p-4 shadow-xl">
                      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-black">Internal note</p>
                      <textarea aria-label="Internal note" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Optional note for this order" rows={3} className="mt-2 h-20 w-full resize-none rounded-lg bg-white px-3 py-2 text-[13px] text-black outline-none ring-1 ring-inset ring-black/[0.08] placeholder:text-black/35 focus:ring-black/25" />
                      <div className="mt-3 flex items-center gap-2"><button type="button" onClick={() => setNoteOpen(false)} className="h-9 rounded-lg px-3 text-[12px] text-black hover:bg-black/[0.05]">Cancel</button><button type="button" aria-label="Save note" onClick={() => { setNotes(noteDraft); setNoteOpen(false); }} className="h-9 flex-1 rounded-lg bg-black px-3 text-[12px] text-white">Save</button></div>
                    </PopoverContent>
                  </Popover>
                  <div className="ml-auto flex items-center gap-1.5"><BuiButton variant="ghost" size="medium" onClick={() => navigate(returnTo)} disabled={creating}>Cancel</BuiButton><button type="button" onClick={() => void createOrder()} disabled={creating} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-black px-3.5 text-[12px] font-medium text-white hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-40">{creating ? <Spinner size="sm" /> : <Plus weight="light" size={15} />}{creating ? "Creating…" : "Create order"}</button></div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
