import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, CaretDown, Check, Plus, Trash } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { Button as BuiButton } from "@/components/base/buttons/button";
import { Dropdown, DropdownGroup, DropdownItem, DropdownPopover, DropdownTrigger } from "@/components/base/dropdown/dropdown";
import { Input as BuiInput } from "@/components/base/input/input";
import { RichButton } from "@/components/ui/rich-button";
import { Spinner } from "@/components/ui/ios-spinner";

type Order = {
  id: string;
  order_number?: string | number | null;
  customer_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  address?: string | null;
  status?: string | null;
  payment_method?: string | null;
  delivery_rate?: number | null;
  price?: number | null;
  courier_name?: string | null;
  courier_status?: string | null;
  consignment_id?: string | null;
  fraud_data?: { risk_level?: string } | null;
  created_at?: string | null;
  updated_at?: string | null;
  sent_to_courier?: boolean | null;
  items?: { product_id?: string | null; variant_id?: string | null; product_name: string | null; variant_name: string | null; unit_price?: number | null; quantity: number }[];
};

type OrderItem = {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string | null;
  variant_name: string | null;
  unit_price: number;
  quantity: number;
};

type OrderDetailResponse = { order: Order; items: OrderItem[]; canEditItems: boolean };
type CatalogVariant = { id: string; attributes: Record<string, string>; price_adjustment?: number | null };
type CatalogProduct = { id: string; name: string; selling_price: number | null; image_url?: string | null; images?: { url?: string | null }[]; variants: CatalogVariant[] };
type ProductsResponse = { products: CatalogProduct[] };

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function money(value: number | null | undefined) {
  return value == null ? "—" : `৳${Number(value).toLocaleString("en-BD")}`;
}

function orderNumberLabel(value: string | number | null | undefined) {
  if (value == null || value === "") return "";
  return `#${String(value).replace(/^#+/, "")}`;
}

function attributes(variant: CatalogVariant) {
  return Object.values(variant.attributes).filter(Boolean).join(" · ");
}

function variantLabel(value: string | null) {
  if (!value) return "—";
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") return Object.values(parsed).filter(Boolean).join(" · ") || "—";
  } catch {
    // Legacy rows may already contain a display string.
  }
  return value;
}

function DetailField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black/40">{label}</p>
      <p className="mt-1 break-words text-[13px] text-black">{value || "—"}</p>
    </div>
  );
}

function ItemRow({ item, canEdit, onQuantity, onRemove }: { item: OrderItem; canEdit: boolean; onQuantity: (value: number) => void; onRemove: () => void }) {
  return (
    <div data-testid={`order-item-${item.id}`} className="grid gap-3 border-b border-black/[0.08] py-4 md:grid-cols-[minmax(0,1fr)_minmax(130px,0.7fr)_100px_100px_36px] md:items-center">
      <div>
        <p className="text-[14px] font-medium text-black">{item.product_name || "Legacy item"}</p>
      </div>
      <p className="text-[13px] text-black/55">{variantLabel(item.variant_name)}</p>
      <p className="font-mono text-[13px] tabular-nums text-black">{money(item.unit_price)}</p>
      <BuiInput aria-label={`Quantity for ${item.product_name || "item"}`} data-testid={`quantity-${item.id}`} type="number" min={1} value={String(item.quantity)} onChange={(value) => onQuantity(Math.max(1, parseInt(value, 10) || 1))} isDisabled={!canEdit} />
      <button type="button" aria-label={`Remove ${item.product_name || "item"}`} onClick={onRemove} disabled={!canEdit} className="flex h-9 w-9 items-center justify-center rounded-[8px] text-black/35 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30">
        <Trash weight="light" size={18} />
      </button>
    </div>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<OrderItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedVariant, setSelectedVariant] = useState("");
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const initializedOrderId = useRef<string | null>(null);
  const initializedWithPlaceholder = useRef(false);

  const detailQuery = useQuery<OrderDetailResponse>({
    queryKey: [`/api/orders/${id}`],
    staleTime: 30_000,
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await apiFetch(`/api/orders/${id}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new ApiError(json.error || "Failed to load order", res.status);
      return json;
    },
    placeholderData: (() => {
      const cachedOrder = queryClient.getQueryData<Order[]>(["/api/orders"])?.find((cached) => cached.id === id);
      if (!cachedOrder) return undefined;
      return {
        order: cachedOrder,
        items: (cachedOrder.items || []).map((item, index) => ({
          id: `cached-${cachedOrder.id}-${index}`,
          product_id: item.product_id || null,
          variant_id: item.variant_id || null,
          product_name: item.product_name,
          variant_name: item.variant_name,
          unit_price: item.unit_price || 0,
          quantity: item.quantity,
        })),
        canEditItems: false,
      };
    })(),
  });
  const productsQuery = useQuery<ProductsResponse>({
    queryKey: ["/api/products"],
    enabled: productPickerOpen,
    queryFn: async () => {
      const res = await apiFetch("/api/products");
      if (!res.ok) throw new Error("Failed to load products");
      return res.json();
    },
  });

  useEffect(() => {
    if (detailQuery.data && id && (initializedOrderId.current !== id || (initializedWithPlaceholder.current && !detailQuery.isPlaceholderData))) {
      setDraft(detailQuery.data.items);
      setCustomerName(detailQuery.data.order.customer_name || detailQuery.data.order.contact_name || "");
      setPhone(detailQuery.data.order.phone || "");
      setAddress(detailQuery.data.order.address || "");
      initializedOrderId.current = id;
      initializedWithPlaceholder.current = detailQuery.isPlaceholderData;
    }
  }, [detailQuery.data, detailQuery.isPlaceholderData, id]);

  const detail = detailQuery.data;
  const order = detail?.order;
  const product = productsQuery.data?.products.find((candidate) => candidate.id === selectedProduct);
  const subtotal = draft.reduce((total, item) => total + item.unit_price * item.quantity, 0);
  const quantity = draft.reduce((total, item) => total + item.quantity, 0);

  function addItem() {
    if (!product) return;
    const variant = product.variants.find((candidate) => candidate.id === selectedVariant);
    const key = `${product.id}:${variant?.id || ""}`;
    if (draft.some((item) => `${item.product_id || ""}:${item.variant_id || ""}` === key)) return;
    setDraft((items) => [...items, {
      id: `draft-${product.id}-${variant?.id || "product"}`,
      product_id: product.id,
      variant_id: variant?.id || null,
      product_name: product.name,
      variant_name: variant ? attributes(variant) : null,
      unit_price: (product.selling_price || 0) + (variant?.price_adjustment || 0),
      quantity: 1,
    }]);
    setSelectedProduct("");
    setSelectedVariant("");
    setProductPickerOpen(false);
  }

  const productImage = (candidate: CatalogProduct) => candidate.image_url || candidate.images?.[0]?.url || null;

  async function save() {
    if (detailQuery.isPlaceholderData) return;
    setSaving(true);
    setSaveError("");
    try {
      const originalName = order?.customer_name || order?.contact_name || "";
      const detailsChanged = customerName !== originalName || phone !== (order?.phone || "") || address !== (order?.address || "");
      if (detailsChanged) {
        const detailsRes = await apiFetch(`/api/orders/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customer_name: customerName.trim(), phone: phone.trim(), address: address.trim() }),
        });
        const detailsJson = await detailsRes.json().catch(() => ({}));
        if (!detailsRes.ok) throw new Error(detailsJson.error || "Failed to save customer details");
        queryClient.setQueryData<OrderDetailResponse>([`/api/orders/${id}`], (current) => current ? { ...current, order: detailsJson.order } : current);
      }

      if (detailsChanged && !detail?.items.some((item, index) => {
        const draftItem = draft[index];
        return !draftItem || draftItem.product_id !== item.product_id || draftItem.variant_id !== item.variant_id || draftItem.quantity !== item.quantity;
      }) && draft.length === (detail?.items.length || 0)) {
        return;
      }
      const res = await apiFetch(`/api/orders/${id}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: draft.map((item) => ({ productId: item.product_id, variantId: item.variant_id, quantity: item.quantity })) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to save order items");
      queryClient.setQueryData([`/api/orders/${id}`], json);
      setDraft(json.items);
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : "Failed to save order items");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-full space-y-6 bg-white p-1 lg:p-2">
      <div className="flex items-center justify-between">
           <div className="flex items-center gap-3">
             <BuiButton variant="ghost" size="small" iconOnly leadingIcon={ArrowLeft} aria-label="Back" onClick={() => navigate("/")} />
            <div className="flex items-baseline gap-2"><h1 className="font-sf-display text-[22px] font-bold tracking-tight text-black">Order detail</h1><span className="font-sf-display text-[22px] font-bold tracking-tight text-black">{orderNumberLabel(order?.order_number)}</span></div>
        </div>
      </div>

      {detailQuery.isPending ? <div data-testid="order-detail-loading" className="grid place-items-center py-24"><Spinner size="md" /></div> : detailQuery.error && (detailQuery.error as ApiError).status === 404 ? <div className="py-24 text-center"><p className="text-[15px] font-medium text-black">Order not found.</p><button type="button" onClick={() => navigate("/")} className="mt-2 text-[13px] text-black/50 underline">Back to orders</button></div> : detailQuery.error ? <div className="py-24 text-center text-[13px] text-red-600">{detailQuery.error.message}</div> : order && (
         <motion.div
           data-testid="order-detail-animated-content"
           initial={{ opacity: 0, y: 8 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ duration: 0.4 }}
           className="space-y-4"
         >
          <section className="rounded-[16px] border border-black/[0.07] bg-[#FAFAF8] p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/45">Customer details</h2><span className="rounded-[8px] bg-black/[0.05] px-2.5 py-1 text-[10px] uppercase tracking-widest text-black/60">{order.status || "pending"}</span></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><BuiInput label="Customer name" value={customerName} onChange={setCustomerName} isDisabled={saving} /><BuiInput label="Phone" type="tel" value={phone} onChange={setPhone} isDisabled={saving} /><BuiInput label="Delivery address" value={address} onChange={setAddress} isDisabled={saving} /></div><div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4"><DetailField label="Payment" value={order.payment_method} /><DetailField label="Order total" value={money(order.price)} /><DetailField label="Delivery fee" value={money(order.delivery_rate)} /><DetailField label="Courier" value={order.courier_name || order.courier_status} /><DetailField label="Fraud" value={order.fraud_data?.risk_level} /><DetailField label="Created" value={order.created_at ? new Date(order.created_at).toLocaleString("en-BD") : null} /><DetailField label="Updated" value={order.updated_at ? new Date(order.updated_at).toLocaleString("en-BD") : null} /><DetailField label="Consignment" value={order.consignment_id} /></div></section>
           <section className="rounded-[16px] border border-black/[0.07] bg-[#FAFAF8] p-5"><div className="mb-2 flex items-center justify-between"><div><h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-black/45">Line items</h2><p className="mt-1 text-[12px] text-black/40">{quantity} item{quantity === 1 ? "" : "s"} · {money(subtotal)} subtotal</p></div></div>
             {!detailQuery.isPlaceholderData && !detail.canEditItems && <p className="mb-2 rounded-[8px] bg-amber-50 px-3 py-2 text-[12px] text-amber-800">Editing is locked after courier dispatch.</p>}
             <div className="hidden border-b border-black/[0.08] pb-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-black/40 md:grid md:grid-cols-[minmax(0,1fr)_minmax(130px,0.7fr)_100px_100px_36px] md:gap-3"><span>Product</span><span>Variant</span><span>Unit price</span><span>Quantity</span><span /></div><div>{draft.map((item) => <ItemRow key={item.id} item={item} canEdit={detail.canEditItems} onQuantity={(value) => setDraft((items) => items.map((current) => current.id === item.id ? { ...current, quantity: value } : current))} onRemove={() => setDraft((items) => items.filter((current) => current.id !== item.id))} />)}</div>
              <div className="mt-4 grid gap-3 rounded-[14px] border border-dashed border-black/[0.12] bg-black/[0.02] p-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <div className="min-w-0">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-black/40">Product</span>
                  <Dropdown isOpen={productPickerOpen} onOpenChange={setProductPickerOpen}>
                  <DropdownTrigger aria-label="Select product" isDisabled={!detail.canEditItems} className="flex h-10 w-full items-center gap-2 rounded-[12px] border border-black/[0.1] bg-white px-2 text-left text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-black/20 disabled:opacity-40">
                    <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-[7px] bg-black/[0.05]">{product && productImage(product) ? <img src={productImage(product)!} alt="" className="h-full w-full object-cover" /> : <Plus weight="light" size={14} className="text-black/35" />}</span>
                    <span className="flex-1 truncate">{product?.name || "Select product"}</span>
                    <CaretDown weight="light" size={15} className="text-black/40" />
                  </DropdownTrigger>
                  <DropdownPopover aria-label="Select product" placement="top start" className="w-[var(--trigger-width)] max-w-[calc(100vw-32px)] p-2" dialogClassName="gap-2">
                    <DropdownGroup>
                      {(productsQuery.data?.products || []).map((candidate) => (
                        <DropdownItem key={candidate.id} onSelect={() => { setSelectedProduct(candidate.id); setSelectedVariant(""); }} className="px-2 py-1.5">
                          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[8px] bg-black/[0.05]">{productImage(candidate) ? <img src={productImage(candidate)!} alt={candidate.name} className="h-full w-full object-cover" /> : <Plus weight="light" size={15} className="text-black/35" />}</span>
                          <span className="truncate text-[13px]">{candidate.name}</span>
                        </DropdownItem>
                      ))}
                    </DropdownGroup>
                  </DropdownPopover>
                  </Dropdown>
                </div>
                <div><label htmlFor="add-variant" className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-black/40">Variant</label><select id="add-variant" aria-label="Add variant" value={selectedVariant} onChange={(event) => setSelectedVariant(event.target.value)} disabled={!detail.canEditItems || !product || product.variants.length === 0} className="h-9 w-full rounded-[12px] border border-black/[0.1] bg-white px-3 text-[13px] outline-none disabled:opacity-40"><option value="">{product?.variants.length ? "Select variant" : "Default"}</option>{product?.variants.map((variant) => <option key={variant.id} value={variant.id}>{attributes(variant)}</option>)}</select></div>
                <RichButton type="button" onClick={addItem} disabled={!detail.canEditItems || !product || (product.variants.length > 0 && !selectedVariant)} className="h-9 rounded-[8px]"><Plus weight="light" size={16} /> Add item</RichButton>
              </div>
             <div className="mt-5 flex justify-end border-t border-black/[0.08] pt-4"><span className="font-mono text-[15px] font-medium tabular-nums text-black">Total {money(subtotal + (order.delivery_rate || 0))}</span></div></section>
          {saveError && <p role="alert" className="text-[13px] text-red-600">{saveError}</p>}
             <div className="flex items-center gap-2"><RichButton type="button" onClick={save} disabled={saving || detailQuery.isPlaceholderData} className="h-9 rounded-[8px]"><span className="flex items-center gap-2">{saving ? <Spinner size="sm" /> : <Check weight="light" size={16} />}{saving ? "Saving…" : "Save changes"}</span></RichButton><RichButton type="button" onClick={() => navigate("/")} disabled={saving} className="bg-transparent text-text-secondary shadow-none hover:bg-black/[0.05]">Cancel</RichButton></div>
         </motion.div>
      )}
    </div>
  );
}
