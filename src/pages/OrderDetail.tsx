import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { readPendingOrderQueue } from "@/lib/pendingOrderQueue";
import { toast } from "@/components/ui/sonner";
import { Button as BuiButton } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { Spinner } from "@/components/ui/ios-spinner";
import { CustomerPanel, type CustomerDraft } from "@/components/order-editor/CustomerPanel";
import { CatalogPanel } from "@/components/order-editor/CatalogPanel";
import { CartPanel } from "@/components/order-editor/CartPanel";
import { OrderActivityTimeline } from "@/components/OrderActivityTimeline";
import { OrderEditorTabPanels, OrderEditorTabSwitch } from "@/components/order-editor/OrderEditorTabs";
import { OrderRiskPanel } from "@/components/risk/OrderRiskPanel";
import { useOrderEditorTab } from "@/hooks/useOrderEditorTab";
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
import { normalizeOrderSource, type OrderSource } from "@/lib/orderSource";
import { createActivityGroupId, orderItemActivityKey, orderViewSurface, type AdditionReason, type CancellationReason } from "@/lib/orderActivity";
import { prefetchOrderActivity, refreshOrderActivity } from "@/lib/orderActivityQuery";

type Order = {
  id: string;
  order_number?: string | number | null;
  customer_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  address?: string | null;
  source?: string | null;
  landing_page_path?: string | null;
  notes?: string | null;
  status?: string | null;
  payment_method?: string | null;
  delivery_rate?: number | null;
  price?: number | null;
  discount?: number | null;
  courier_name?: string | null;
  courier_status?: string | null;
  consignment_id?: string | null;
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
  const location = useLocation();
  const queryClient = useQueryClient();
  const [editorTab, setEditorTab] = useOrderEditorTab();
  const returnTab = (location.state as { fulfillmentTab?: unknown } | null)?.fulfillmentTab;
  const backState = typeof returnTab === "string" && returnTab ? { fulfillmentTab: returnTab } : undefined;
  function goBack() {
    navigate("/", backState ? { state: backState } : undefined);
  }
  const rawPendingOrderIds = (location.state as { pendingOrderIds?: unknown } | null)?.pendingOrderIds;
  const statePendingOrderIds = Array.isArray(rawPendingOrderIds)
    ? rawPendingOrderIds.filter((value): value is string => typeof value === "string")
    : null;
  const queryFulfillmentTab = new URLSearchParams(location.search).get("fulfillmentTab");
  const stateFulfillmentTab = (location.state as { fulfillmentTab?: unknown } | null)?.fulfillmentTab;
  const isPendingContext = stateFulfillmentTab === "pending" || queryFulfillmentTab === "pending";
  const storedPendingOrderIds =
    !statePendingOrderIds && isPendingContext ? readPendingOrderQueue() : null;
  const pendingOrderIds = statePendingOrderIds ?? storedPendingOrderIds;
  const pendingIndex = pendingOrderIds && id ? pendingOrderIds.indexOf(id) : -1;
  const hasPendingNav = Boolean(pendingOrderIds) && pendingIndex !== -1;
  const prevPendingOrderId = hasPendingNav && pendingIndex > 0 ? pendingOrderIds![pendingIndex - 1] : null;
  const nextPendingOrderId =
    hasPendingNav && pendingIndex < pendingOrderIds!.length - 1 ? pendingOrderIds![pendingIndex + 1] : null;
  // Carries pendingOrderIds forward on any jump to another order (Prev/Next,
  // customer history) so the snapshot survives the hop; falls back to backState.
  const siblingState = pendingOrderIds ? { fulfillmentTab: returnTab, pendingOrderIds } : backState;
  function goToSibling(targetId: string) {
    navigate(`/orders/${targetId}`, { state: siblingState, replace: true });
  }
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
  const [sourceDraft, setSourceDraft] = useState<OrderSource>("manual_other");
  const [additionReasons, setAdditionReasons] = useState<Record<string, AdditionReason | "">>({});
  const [cancellationReasonCode, setCancellationReasonCode] = useState<CancellationReason | "">("");
  const [cancellationReasonNote, setCancellationReasonNote] = useState("");
  const initializedOrderId = useRef<string | null>(null);
  const initializedWithPlaceholder = useRef(false);
  const viewedOrderId = useRef<string | null>(null);

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
    setSourceDraft(normalizeOrderSource(detailQuery.data.order.source));
    setAdditionReasons({}); setCancellationReasonCode(""); setCancellationReasonNote("");
    initializedOrderId.current = id;
    initializedWithPlaceholder.current = detailQuery.isPlaceholderData;
  }, [detailQuery.data, detailQuery.isPlaceholderData, id]);

  useEffect(() => {
    if (id) void prefetchOrderActivity(queryClient, `/api/orders/${id}/activity`);
  }, [id, queryClient]);

  useEffect(() => {
    if (!id || !detailQuery.data || detailQuery.isPlaceholderData || viewedOrderId.current === id) return;
    viewedOrderId.current = id;
    void apiFetch(`/api/orders/${id}/activity/view`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_surface: orderViewSurface(location.state) }) }).then((response) => response.ok && refreshOrderActivity(queryClient, `/api/orders/${id}/activity`)).catch(() => {});
  }, [detailQuery.data, detailQuery.isPlaceholderData, id, location.state, queryClient]);

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
  const sourceChanged = sourceDraft !== normalizeOrderSource(order?.source);
  const requiredAdditionReasonKeys = useMemo(() => {
    const initial = new Map(detail?.items.map((item) => [orderItemActivityKey(item), Number(item.quantity) || 0]) || []);
    return draft.filter((item) => Number(item.quantity) > (initial.get(orderItemActivityKey(item)) || 0)).map(orderItemActivityKey);
  }, [detail?.items, draft]);
  const cancellationRequired = ["cancelled", "canceled"].includes((statusDraft || "").toLowerCase()) && !["cancelled", "canceled"].includes((order?.status || "").toLowerCase());
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
  const ordersById = useMemo(() => {
    const map = new Map<string, Order>();
    for (const cached of historyQuery.data || []) map.set(cached.id, cached);
    return map;
  }, [historyQuery.data]);
  const prevPendingOrder = prevPendingOrderId ? ordersById.get(prevPendingOrderId) : null;
  const nextPendingOrder = nextPendingOrderId ? ordersById.get(nextPendingOrderId) : null;

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
    if (!detailsChanged && !cartChanged && !overallChanged && !deliveryChanged && !notesChanged && !statusChanged && !sourceChanged) {
      if (!hasPendingNav) goBack();
      return;
    }
    if (cartChanged && draft.some((item) => !item.product_id && !item.variant_id)) {
      setSaveError("Remove or replace detached legacy items before saving cart changes");
      return;
    }
    if (requiredAdditionReasonKeys.some((key) => !additionReasons[key])) { setSaveError("Choose a reason for every added product or quantity increase"); return; }
    if (cancellationRequired && !cancellationReasonCode) { setSaveError("Choose a cancellation reason"); return; }
    if (cancellationRequired && cancellationReasonCode === "other" && !cancellationReasonNote.trim()) { setSaveError("Add a cancellation note for Other"); return; }

    setSaving(true);
    setSaveError("");
    const activityGroupId = createActivityGroupId();
    const completedSegments: string[] = [];
    const pendingSegments: string[] = [
      ...(detailsChanged ? ["customer details"] : []),
      ...(cartChanged ? ["order items"] : []),
      ...((overallChanged || deliveryChanged || notesChanged || statusChanged || sourceChanged) ? ["totals and status"] : []),
    ];
    const expectedVersion = order.updated_at || null;
    try {
      let currentOrder = order;
      let currentItems = detail.items;
      const failWith = async (segment: string, message: string, status?: number, code?: string) => {
        if (status === 409 && code === "stale_write") {
          await queryClient.invalidateQueries({ queryKey: [`/api/orders/${id}`] });
          throw new Error("Order changed before it could be saved. Refresh and try again.");
        }
        if (completedSegments.length > 0) {
          await queryClient.invalidateQueries({ queryKey: [`/api/orders/${id}`] });
          const saved = completedSegments.join(", ");
          const remaining = pendingSegments.filter((entry) => !completedSegments.includes(entry) && entry !== segment).concat([segment]).join(", ");
          throw new Error(`Partial save: ${saved} saved, but ${remaining} was not saved (${message}). Refresh to see saved changes, then retry the remaining edits (a new save uses a new history group).`);
        }
        throw new Error(message);
      };
      if (detailsChanged) {
        const detailsRes = await apiFetch(`/api/orders/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer_name: customer.customerName.trim(),
            phone: customer.phone.trim(),
            address: customer.address.trim(),
            activity_group_id: activityGroupId,
            ...(expectedVersion ? { expected_updated_at: expectedVersion } : {}),
          }),
        });
        const detailsJson = await detailsRes.json().catch(() => ({}));
        if (!detailsRes.ok) await failWith("customer details", detailsJson.error || "Failed to save customer details", detailsRes.status, detailsJson.code);
        currentOrder = detailsJson.order;
        completedSegments.push("customer details");
      }

      if (cartChanged) {
        const res = await apiFetch(`/api/orders/${id}/items`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: itemIntent(draft), addition_reasons: additionReasons, activity_group_id: activityGroupId, ...(currentOrder.updated_at ? { expected_updated_at: currentOrder.updated_at } : {}) }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) await failWith("order items", json.error || "Failed to save order items", res.status, json.code);
        const savedDetail = json as OrderDetailResponse;
        currentOrder = savedDetail.order;
        currentItems = savedDetail.items;
        completedSegments.push("order items");
      }

      if (overallChanged || deliveryChanged || notesChanged || statusChanged || sourceChanged) {
        const orderPatch: { discount?: number; delivery_rate?: number; notes?: string | null; status?: string; source?: OrderSource; activity_group_id: string; expected_updated_at?: string | null; cancellation_reason_code?: CancellationReason; cancellation_reason_note?: string | null } = { activity_group_id: activityGroupId, ...(currentOrder.updated_at ? { expected_updated_at: currentOrder.updated_at } : {}) };
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
        if (cancellationRequired && cancellationReasonCode) { orderPatch.cancellation_reason_code = cancellationReasonCode; orderPatch.cancellation_reason_note = cancellationReasonNote.trim() || null; }
        if (sourceChanged) orderPatch.source = sourceDraft;
        if (Object.keys(orderPatch).length > 0) {
          const totalsRes = await apiFetch(`/api/orders/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(orderPatch),
          });
          const totalsJson = await totalsRes.json().catch(() => ({}));
          if (!totalsRes.ok) await failWith("totals and status", totalsJson.error || "Failed to save order totals", totalsRes.status, totalsJson.code);
          currentOrder = totalsJson.order;
          completedSegments.push("totals and status");
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
      setSourceDraft(normalizeOrderSource(currentOrder.source));
      setAdditionReasons({}); setCancellationReasonCode(""); setCancellationReasonNote("");
      void refreshOrderActivity(queryClient, `/api/orders/${id}/activity`);
      if (hasPendingNav) {
        toast.success("Order saved");
      } else {
        goBack();
      }
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : "Failed to save order changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-3 bg-[#FAFAF8] px-2 pb-3 pt-0 lg:px-3 lg:pt-1">
      <div data-testid="order-editor-toolbar" className="sticky top-0 z-30 flex flex-wrap items-center gap-3 bg-[#FAFAF8]/95 py-2 backdrop-blur-sm">
        <BuiButton variant="ghost" size="small" iconOnly leadingIcon={ArrowLeft} aria-label="Back" onClick={goBack} />
        <div className="flex min-w-0 items-baseline gap-2.5"><h1 style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }} className="text-[28px] font-medium tracking-tight text-black">Order editor</h1><span style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }} className="text-[28px] font-medium tracking-tight text-black">{orderNumberLabel(order?.order_number)}</span></div>
        {order?.id && <OrderEditorTabSwitch value={editorTab} onChange={setEditorTab} showRisk={order.source === "website"} className="sm:ml-auto" />}
      </div>

      {detailQuery.isPending ? <div data-testid="order-detail-loading" className="grid place-items-center py-24"><Spinner size="md" /></div> : detailQuery.error && (detailQuery.error as ApiError).status === 404 ? <div className="py-24 text-center"><p className="text-[15px] font-medium text-black">Order not found.</p><button type="button" onClick={goBack} className="mt-2 text-[13px] text-black underline">Back to orders</button></div> : detailQuery.error ? <div className="py-24 text-center text-[13px] text-red-600">{detailQuery.error.message}</div> : order && detail && (
        <motion.div
          key={id}
          data-testid="order-detail-animated-content"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="min-h-0"
        >
          <OrderEditorTabPanels
            tab={editorTab}
            risk={order.source === "website" ? <OrderRiskPanel orderId={order.id} /> : null}
            logs={
              <div className="overflow-hidden rounded-xl ring-1 ring-black/[0.07]">
                <OrderActivityTimeline endpoint={`/api/orders/${order.id}/activity`} variant="full" />
              </div>
            }
            details={
              <div className="flex min-h-0 flex-col gap-px overflow-hidden rounded-xl bg-black/[0.07] ring-1 ring-black/[0.07]">
                <CustomerPanel order={order} customer={customer} disabled={saving} history={history} historyLoading={historyQuery.isPending} onOpenOrder={(orderId) => navigate(`/orders/${orderId}`, siblingState ? { state: siblingState } : undefined)} onApply={setCustomer} source={sourceDraft} onSourceChange={setSourceDraft} sourceDisabled={saving || detailQuery.isPlaceholderData} />
                <div data-testid="order-editor-workspace" data-mobile-layout="single-column" className="grid min-h-0 grid-cols-1 items-start gap-px bg-black/[0.07] xl:h-[100vh] xl:min-h-[560px] xl:grid-cols-2">
                  <CatalogPanel products={productsQuery.data?.products || []} search={catalogSearch} loading={productsQuery.isPending} error={productsQuery.isError} canEdit={canEditCart} locked={cartLocked} onSearch={setCatalogSearch} onRetry={() => { void productsQuery.refetch(); }} onAdd={addCatalogItem} />
                  <CartPanel items={draft} totals={totals} canEdit={canEditCart} locked={cartLocked} saving={saving} saveDisabled={detailQuery.isPlaceholderData} error={saveError} overallDiscountType={overallType} overallDiscountValue={overallValue} deliveryOn={deliveryOn} status={statusDraft} onStatusChange={setStatusDraft} notes={notesDraft} onNotesChange={setNotesDraft} onToggleDelivery={setDeliveryOn} onOverallDiscount={(type, value) => { setOverallType(type); setOverallValue(value); }} onRemoveOverallDiscount={() => { setOverallType(null); setOverallValue(0); }} onQuantity={updateQuantity} onRemove={(itemId) => setDraft((items) => items.filter((item) => item.id !== itemId))} onDiscount={updateDiscount} onSave={() => { void save(); }} onCancel={goBack} requiredAdditionReasonKeys={requiredAdditionReasonKeys} additionReasons={additionReasons} onAdditionReasonChange={(key, reason) => setAdditionReasons((current) => ({ ...current, [key]: reason }))} cancellationRequired={cancellationRequired} cancellationReasonCode={cancellationReasonCode} cancellationReasonNote={cancellationReasonNote} onCancellationReasonChange={setCancellationReasonCode} onCancellationReasonNoteChange={setCancellationReasonNote} />
                </div>
              </div>
            }
          />
        </motion.div>
      )}

      {hasPendingNav && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          data-testid="order-editor-pending-nav"
          className="sticky bottom-0 z-40 -mx-2 mt-1 flex items-center justify-between border-t border-black/[0.08] bg-[#FAFAF8]/95 px-3 py-2.5 backdrop-blur-sm lg:-mx-3"
        >
          <div className="flex min-w-0 items-center gap-2">
            <BuiButton
              variant="ghost"
              size="small"
              iconOnly
              leadingIcon={CaretLeft}
              aria-label="Previous pending order"
              disabled={!prevPendingOrderId}
              onClick={() => prevPendingOrderId && goToSibling(prevPendingOrderId)}
            />
            {prevPendingOrder && (
              <Chip variant="subtle" color="cyan" className="h-8 min-w-8 px-2 font-mono">
                {orderNumberLabel(prevPendingOrder.order_number)}
              </Chip>
            )}
          </div>
          <span className="shrink-0 text-[11px] font-medium tracking-[0.1em] text-black/50">
            {pendingIndex + 1} of {pendingOrderIds!.length} pending
          </span>
          <div className="flex min-w-0 items-center gap-2">
            {nextPendingOrder && (
              <Chip variant="subtle" color="purple" className="h-8 min-w-8 px-2 font-mono">
                {orderNumberLabel(nextPendingOrder.order_number)}
              </Chip>
            )}
            <BuiButton
              variant="ghost"
              size="small"
              iconOnly
              leadingIcon={CaretRight}
              aria-label="Next pending order"
              disabled={!nextPendingOrderId}
              onClick={() => nextPendingOrderId && goToSibling(nextPendingOrderId)}
            />
          </div>
        </motion.div>
      )}
    </div>
  );
}
