import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { Button as BuiButton } from "@/components/base/buttons/button";
import { Spinner } from "@/components/ui/ios-spinner";
import { CustomerPanel, type CustomerDraft } from "@/components/order-editor/CustomerPanel";
import { CatalogPanel } from "@/components/order-editor/CatalogPanel";
import { CartPanel } from "@/components/order-editor/CartPanel";
import {
  calculateCartTotals,
  calculateUnitDiscount,
  roundTaka,
  upsertCartItem,
  type CatalogProduct,
  type CatalogVariant,
  type DiscountType,
  type OrderEditorItem,
} from "@/lib/orderEditor";

type Order = {
  id: string;
  order_number?: string | number | null;
  customer_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  status?: string | null;
  payment_method?: string | null;
  delivery_rate?: number | null;
  price?: number | null;
  discount?: number | null;
  courier_name?: string | null;
  courier_status?: string | null;
  consignment_id?: string | null;
  fraud_data?: { risk_level?: string } | null;
  created_at?: string | null;
  updated_at?: string | null;
  sent_to_courier?: boolean | null;
  items?: Array<Partial<OrderEditorItem> & Pick<OrderEditorItem, "product_name" | "variant_name" | "quantity">>;
};

type OrderDetailResponse = {
  order: Order;
  items: OrderEditorItem[];
  canEditItems: boolean;
};

const DEFAULT_DELIVERY_FEE = 100;

type ProductsResponse = { products: CatalogProduct[] };

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function orderNumberLabel(value: string | number | null | undefined) {
  if (value == null || value === "") return "";
  return `#${String(value).replace(/^#+/, "")}`;
}

function customerFromOrder(order: Order): CustomerDraft {
  return {
    customerName: order.customer_name || order.contact_name || "",
    phone: order.phone || "",
    address: order.address || "",
  };
}

function normalizedItem(item: Partial<OrderEditorItem>, index: number, orderId: string): OrderEditorItem {
  return {
    id: item.id || `cached-${orderId}-${index}`,
    product_id: item.product_id || null,
    variant_id: item.variant_id || null,
    product_name: item.product_name || null,
    variant_name: item.variant_name || null,
    product_slug: item.product_slug || null,
    image_url: item.image_url || null,
    weight_kg: item.weight_kg ?? null,
    available_stock: item.available_stock ?? null,
    unit_price: Number(item.unit_price) || 0,
    discount_type: item.discount_type || null,
    discount_value: Number(item.discount_value) || 0,
    unit_discount: Number(item.unit_discount) || 0,
    quantity: Math.max(1, Number(item.quantity) || 1),
  };
}

function itemIntent(items: OrderEditorItem[]) {
  return items.map((item) => ({
    productId: item.product_id,
    variantId: item.variant_id,
    quantity: item.quantity,
    discountType: item.discount_type,
    discountValue: item.discount_value,
  }));
}

function cartsMatch(left: OrderEditorItem[], right: OrderEditorItem[]) {
  return JSON.stringify(itemIntent(left)) === JSON.stringify(itemIntent(right));
}

function phoneKey(phone: string | null | undefined): string {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.length > 11 ? digits.slice(-11) : digits;
}

function legacyDiscountOf(orderDiscount: unknown, items: Array<Pick<OrderEditorItem, "unit_discount" | "quantity">>) {
  const represented = items.reduce(
    (sum, item) => sum + (Number(item.unit_discount) || 0) * (Number(item.quantity) || 0),
    0,
  );
  return Math.max(0, (Number(orderDiscount) || 0) - represented);
}

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<OrderEditorItem[]>([]);
  const [customer, setCustomer] = useState<CustomerDraft>({ customerName: "", phone: "", address: "" });
  const [catalogSearch, setCatalogSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [overallType, setOverallType] = useState<DiscountType | null>(null);
  const [overallValue, setOverallValue] = useState(0);
  const [deliveryOn, setDeliveryOn] = useState(true);
  const [deliveryRate, setDeliveryRate] = useState(DEFAULT_DELIVERY_FEE);
  const [notesDraft, setNotesDraft] = useState("");
  const [statusDraft, setStatusDraft] = useState<string | null>(null);
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
      return json as OrderDetailResponse;
    },
    placeholderData: (() => {
      const cachedOrder = queryClient.getQueryData<Order[]>(["/api/orders"])?.find((cached) => cached.id === id);
      if (!cachedOrder) return undefined;
      return {
        order: cachedOrder,
        items: (cachedOrder.items || []).map((item, index) => normalizedItem(item, index, cachedOrder.id)),
        canEditItems: false,
      };
    })(),
  });

  const productsQuery = useQuery<ProductsResponse>({
    queryKey: ["/api/products"],
    staleTime: 60_000,
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await apiFetch("/api/products");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to load products");
      return json as ProductsResponse;
    },
  });

  const historyQuery = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    staleTime: 30_000,
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await apiFetch("/api/orders");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to load orders");
      return ((json as { orders?: Order[] }).orders || []) as Order[];
    },
  });

  useEffect(() => {
    if (!detailQuery.data || !id) return;
    const shouldInitialize = initializedOrderId.current !== id || (initializedWithPlaceholder.current && !detailQuery.isPlaceholderData);
    if (!shouldInitialize) return;
    setDraft(detailQuery.data.items.map((item, index) => normalizedItem(item, index, id)));
    setCustomer(customerFromOrder(detailQuery.data.order));
    const legacy = legacyDiscountOf(detailQuery.data.order.discount, detailQuery.data.items);
    setOverallType(legacy > 0 ? "fixed" : null);
    setOverallValue(legacy > 0 ? legacy : 0);
    const savedDeliveryRate = Number(detailQuery.data.order.delivery_rate) || 0;
    setDeliveryRate(savedDeliveryRate > 0 ? savedDeliveryRate : DEFAULT_DELIVERY_FEE);
    setDeliveryOn(savedDeliveryRate > 0);
    setNotesDraft(detailQuery.data.order.notes ?? "");
    setStatusDraft(detailQuery.data.order.status ?? null);
    initializedOrderId.current = id;
    initializedWithPlaceholder.current = detailQuery.isPlaceholderData;
  }, [detailQuery.data, detailQuery.isPlaceholderData, id]);

  const detail = detailQuery.data;
  const order = detail?.order;
  const legacyDiscount = useMemo(() => {
    if (!detail) return 0;
    return legacyDiscountOf(detail.order.discount, detail.items);
  }, [detail]);
  const draftBase = useMemo(() => {
    const withoutOverall = calculateCartTotals(draft, 0, 0);
    return roundTaka(withoutOverall.grossSubtotal - withoutOverall.itemDiscount);
  }, [draft]);
  const overallAmount = calculateUnitDiscount(draftBase, overallType, overallValue);
  const deliveryFee = deliveryOn ? deliveryRate : 0;
  const totals = useMemo(
    () => calculateCartTotals(draft, deliveryFee, overallAmount),
    [draft, deliveryFee, overallAmount],
  );
  const overallChanged = overallAmount !== legacyDiscount;
  const deliveryChanged = deliveryFee !== (Number(order?.delivery_rate) || 0);
  const notesChanged = notesDraft.trim() !== (order?.notes ?? "").trim();
  const statusChanged = statusDraft !== (order?.status ?? null);
  const canEditCart = Boolean(detail && !detailQuery.isPlaceholderData && detail.canEditItems);
  const cartLocked = Boolean(detail && !detailQuery.isPlaceholderData && !detail.canEditItems);
  const history = useMemo(() => {
    const all = historyQuery.data || [];
    const key = phoneKey(order?.phone);
    const name = (order?.customer_name || order?.contact_name || "").trim().toLowerCase();
    return all
      .filter((o) => o.id !== id && (key ? phoneKey(o.phone) === key : Boolean(name) && (o.customer_name || o.contact_name || "").trim().toLowerCase() === name))
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 5);
  }, [historyQuery.data, id, order?.phone, order?.customer_name, order?.contact_name]);

  function addCatalogItem(product: CatalogProduct, variant?: CatalogVariant) {
    setDraft((items) => upsertCartItem(items, product, variant));
  }

  function updateQuantity(itemId: string, quantity: number) {
    setDraft((items) => items.map((item) => item.id === itemId ? { ...item, quantity } : item));
  }

  function updateDiscount(itemId: string, discountType: DiscountType | null, discountValue: number) {
    setDraft((items) => items.map((item) => item.id === itemId ? {
      ...item,
      discount_type: discountType,
      discount_value: discountType ? discountValue : 0,
      unit_discount: calculateUnitDiscount(item.unit_price, discountType, discountValue),
    } : item));
  }

  async function save() {
    if (!detail || !order || !id || detailQuery.isPlaceholderData || saving) return;
    const originalCustomer = customerFromOrder(order);
    const detailsChanged = JSON.stringify(customer) !== JSON.stringify(originalCustomer);
    const cartChanged = !cartsMatch(draft, detail.items);
    if (!detailsChanged && !cartChanged && !overallChanged && !deliveryChanged && !notesChanged && !statusChanged) {
      navigate("/");
      return;
    }
    if (cartChanged && draft.some((item) => !item.product_id && !item.variant_id)) {
      setSaveError("Remove or replace detached legacy items before saving cart changes");
      return;
    }

    setSaving(true);
    setSaveError("");
    try {
      let currentOrder = order;
      let currentItems = detail.items;
      if (detailsChanged) {
        const detailsRes = await apiFetch(`/api/orders/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_name: customer.customerName.trim(),
            phone: customer.phone.trim(),
            address: customer.address.trim(),
          }),
        });
        const detailsJson = await detailsRes.json().catch(() => ({}));
        if (!detailsRes.ok) throw new Error(detailsJson.error || "Failed to save customer details");
        currentOrder = detailsJson.order;
      }

      if (cartChanged) {
        const res = await apiFetch(`/api/orders/${id}/items`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: itemIntent(draft) }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Failed to save order items");
        const savedDetail = json as OrderDetailResponse;
        currentOrder = savedDetail.order;
        currentItems = savedDetail.items;
      }

      if (overallChanged || deliveryChanged || notesChanged || statusChanged) {
        const orderPatch: { discount?: number; delivery_rate?: number; notes?: string | null; status?: string } = {};
        if (overallChanged) {
          const itemTotal = currentItems.reduce(
            (sum, item) => sum + (Number(item.unit_discount) || 0) * (Number(item.quantity) || 0),
            0,
          );
          const desired = roundTaka(itemTotal + overallAmount);
          if (desired !== Number(currentOrder.discount || 0)) orderPatch.discount = desired;
        }
        if (deliveryChanged && deliveryFee !== Number(currentOrder.delivery_rate || 0)) {
          orderPatch.delivery_rate = deliveryFee;
        }
        if (notesChanged) orderPatch.notes = notesDraft.trim() || null;
        if (statusChanged && statusDraft) orderPatch.status = statusDraft;
        if (Object.keys(orderPatch).length > 0) {
          const totalsRes = await apiFetch(`/api/orders/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(orderPatch),
          });
          const totalsJson = await totalsRes.json().catch(() => ({}));
          if (!totalsRes.ok) throw new Error(totalsJson.error || "Failed to save order totals");
          currentOrder = totalsJson.order;
        }
      }

      queryClient.setQueryData<OrderDetailResponse>([`/api/orders/${id}`], (current) => current ? { ...current, order: currentOrder, items: currentItems } : current);
      queryClient.setQueryData<Order[]>(["/api/orders"], (current) => Array.isArray(current) ? current.map((item) => item.id === id ? { ...item, ...currentOrder } : item) : current);
      setDraft(currentItems.map((item, index) => normalizedItem(item, index, id)));
      setCustomer(customerFromOrder(currentOrder));
      const savedDeliveryRate = Number(currentOrder.delivery_rate) || 0;
      setDeliveryRate(savedDeliveryRate > 0 ? savedDeliveryRate : DEFAULT_DELIVERY_FEE);
      setDeliveryOn(savedDeliveryRate > 0);
      setNotesDraft(currentOrder.notes ?? "");
      setStatusDraft(currentOrder.status ?? null);
      navigate("/");
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : "Failed to save order changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-3 bg-[#FAFAF8] px-4 pb-4 pt-1 lg:px-5 lg:pt-2">
      <div data-testid="order-editor-toolbar" className="sticky top-0 z-30 flex items-center gap-3 bg-[#FAFAF8]/95 py-2 backdrop-blur-sm">
        <BuiButton variant="ghost" size="small" iconOnly leadingIcon={ArrowLeft} aria-label="Back" onClick={() => navigate("/")} />
        <div className="flex min-w-0 items-baseline gap-2.5"><h1 style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }} className="text-[28px] font-medium tracking-tight text-black">Order editor</h1><span style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }} className="text-[28px] font-medium tracking-tight text-black">{orderNumberLabel(order?.order_number)}</span></div>
      </div>

      {detailQuery.isPending ? <div data-testid="order-detail-loading" className="grid place-items-center py-24"><Spinner size="md" /></div> : detailQuery.error && (detailQuery.error as ApiError).status === 404 ? <div className="py-24 text-center"><p className="text-[15px] font-medium text-black">Order not found.</p><button type="button" onClick={() => navigate("/")} className="mt-2 text-[13px] text-black/50 underline">Back to orders</button></div> : detailQuery.error ? <div className="py-24 text-center text-[13px] text-red-600">{detailQuery.error.message}</div> : order && detail && (
        <motion.div
          key={id}
          data-testid="order-detail-animated-content"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex min-h-0 flex-col gap-px overflow-hidden rounded-xl bg-black/[0.07] ring-1 ring-black/[0.07]"
        >
          <CustomerPanel order={order} customer={customer} disabled={saving} history={history} historyLoading={historyQuery.isPending} onApply={setCustomer} />
            <div data-testid="order-editor-workspace" data-mobile-layout="single-column" className="grid min-h-0 grid-cols-1 items-start gap-px bg-black/[0.07] xl:h-[100vh] xl:min-h-[560px] xl:grid-cols-2">
            <CatalogPanel products={productsQuery.data?.products || []} search={catalogSearch} loading={productsQuery.isPending} error={productsQuery.isError} canEdit={canEditCart} locked={cartLocked} onSearch={setCatalogSearch} onRetry={() => { void productsQuery.refetch(); }} onAdd={addCatalogItem} />
            <CartPanel items={draft} totals={totals} canEdit={canEditCart} locked={cartLocked} saving={saving} saveDisabled={detailQuery.isPlaceholderData} error={saveError} overallDiscountType={overallType} overallDiscountValue={overallValue} deliveryOn={deliveryOn} status={statusDraft} onStatusChange={setStatusDraft} notes={notesDraft} onNotesChange={setNotesDraft} onToggleDelivery={setDeliveryOn} onOverallDiscount={(type, value) => { setOverallType(type); setOverallValue(value); }} onRemoveOverallDiscount={() => { setOverallType(null); setOverallValue(0); }} onQuantity={updateQuantity} onRemove={(itemId) => setDraft((items) => items.filter((item) => item.id !== itemId))} onDiscount={updateDiscount} onSave={() => { void save(); }} onCancel={() => navigate("/")} />
          </div>
        </motion.div>
      )}
    </div>
  );
}
