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

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<OrderEditorItem[]>([]);
  const [customer, setCustomer] = useState<CustomerDraft>({ customerName: "", phone: "", address: "" });
  const [catalogSearch, setCatalogSearch] = useState("");
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

  useEffect(() => {
    if (!detailQuery.data || !id) return;
    const shouldInitialize = initializedOrderId.current !== id || (initializedWithPlaceholder.current && !detailQuery.isPlaceholderData);
    if (!shouldInitialize) return;
    setDraft(detailQuery.data.items.map((item, index) => normalizedItem(item, index, id)));
    setCustomer(customerFromOrder(detailQuery.data.order));
    initializedOrderId.current = id;
    initializedWithPlaceholder.current = detailQuery.isPlaceholderData;
  }, [detailQuery.data, detailQuery.isPlaceholderData, id]);

  const detail = detailQuery.data;
  const order = detail?.order;
  const legacyDiscount = useMemo(() => {
    if (!detail) return 0;
    const representedDiscount = detail.items.reduce(
      (sum, item) => sum + (Number(item.unit_discount) || 0) * (Number(item.quantity) || 0),
      0,
    );
    return Math.max(0, (Number(detail.order.discount) || 0) - representedDiscount);
  }, [detail]);
  const totals = useMemo(
    () => calculateCartTotals(draft, Number(order?.delivery_rate) || 0, legacyDiscount),
    [draft, legacyDiscount, order?.delivery_rate],
  );
  const canEditCart = Boolean(detail && !detailQuery.isPlaceholderData && detail.canEditItems);
  const cartLocked = Boolean(detail && !detailQuery.isPlaceholderData && !detail.canEditItems);

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
    if (cartChanged && draft.some((item) => !item.product_id && !item.variant_id)) {
      setSaveError("Remove or replace detached legacy items before saving cart changes");
      return;
    }

    setSaving(true);
    setSaveError("");
    try {
      let currentOrder = order;
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
        queryClient.setQueryData<OrderDetailResponse>([`/api/orders/${id}`], (current) => current ? { ...current, order: currentOrder } : current);
      }

      if (!cartChanged) return;
      const res = await apiFetch(`/api/orders/${id}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: itemIntent(draft) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to save order items");
      const savedDetail = json as OrderDetailResponse;
      queryClient.setQueryData([`/api/orders/${id}`], savedDetail);
      setDraft(savedDetail.items.map((item, index) => normalizedItem(item, index, id)));
      setCustomer(customerFromOrder(savedDetail.order));
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : "Failed to save order changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-full space-y-5 bg-[#FAFAF8] p-1 lg:p-2">
      <div className="flex items-center gap-3">
        <BuiButton variant="ghost" size="small" iconOnly leadingIcon={ArrowLeft} aria-label="Back" onClick={() => navigate("/")} />
        <div className="flex items-baseline gap-2"><h1 className="text-[22px] font-light tracking-tight text-black">Order editor</h1><span className="text-[22px] font-light tracking-tight text-black">{orderNumberLabel(order?.order_number)}</span></div>
      </div>

      {detailQuery.isPending ? <div data-testid="order-detail-loading" className="grid place-items-center py-24"><Spinner size="md" /></div> : detailQuery.error && (detailQuery.error as ApiError).status === 404 ? <div className="py-24 text-center"><p className="text-[15px] font-medium text-black">Order not found.</p><button type="button" onClick={() => navigate("/")} className="mt-2 text-[13px] text-black/50 underline">Back to orders</button></div> : detailQuery.error ? <div className="py-24 text-center text-[13px] text-red-600">{detailQuery.error.message}</div> : order && detail && (
        <motion.div
          data-testid="order-detail-animated-content"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="grid min-h-0 gap-px overflow-hidden rounded-lg bg-black/[0.07] ring-1 ring-black/[0.07] xl:h-[calc(100vh-10.5rem)] xl:grid-cols-[minmax(240px,0.72fr)_minmax(320px,1fr)_minmax(340px,1.08fr)]"
        >
          <CustomerPanel order={order} customer={customer} disabled={saving} onApply={setCustomer} />
          <CatalogPanel products={productsQuery.data?.products || []} search={catalogSearch} loading={productsQuery.isPending} error={productsQuery.isError} canEdit={canEditCart} locked={cartLocked} onSearch={setCatalogSearch} onRetry={() => { void productsQuery.refetch(); }} onAdd={addCatalogItem} />
          <CartPanel items={draft} totals={totals} canEdit={canEditCart} locked={cartLocked} saving={saving} saveDisabled={detailQuery.isPlaceholderData} error={saveError} onQuantity={updateQuantity} onRemove={(itemId) => setDraft((items) => items.filter((item) => item.id !== itemId))} onDiscount={updateDiscount} onSave={() => { void save(); }} onCancel={() => navigate("/")} />
        </motion.div>
      )}
    </div>
  );
}
