import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Warning } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { Button as BuiButton } from "@/components/base/buttons/button";
import { Spinner } from "@/components/ui/ios-spinner";
import { toast } from "@/components/ui/sonner";
import { CustomerPanel, type CustomerDraft } from "@/components/order-editor/CustomerPanel";
import { CatalogPanel } from "@/components/order-editor/CatalogPanel";
import { CartPanel } from "@/components/order-editor/CartPanel";
import { OrderHoldFields, type OrderHoldMetadata } from "@/components/orders/OrderHoldFields";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OrderActivityTimeline } from "@/components/OrderActivityTimeline";
import { OrderEditorTabPanels, OrderEditorTabSwitch } from "@/components/order-editor/OrderEditorTabs";
import { useOrderEditorTab } from "@/hooks/useOrderEditorTab";
import { createActivityGroupId, orderItemActivityKey, type AdditionReason } from "@/lib/orderActivity";
import { prefetchOrderActivity, refreshOrderActivity } from "@/lib/orderActivityQuery";
import { syncOrders, type SyncableOrder } from "@/lib/ordersSync";
import type { StatusFilterOrder } from "@/lib/orderStatusFilters";
import { buildPendingOrdersByPhone, pendingOrderLabel, pendingOrdersForPhone } from "@/lib/abandonedPendingMatch";
import type {
  AbandonedCheckout,
  AbandonedCheckoutResponse,
} from "@/lib/abandonedCheckouts";
import {
  calculateCartTotals,
  upsertCartItem,
  variantLabel,
  type CatalogProduct,
  type CatalogVariant,
  type OrderEditorItem,
} from "@/lib/orderEditor";
import { validateOrderHoldDetails } from "../../shared/orderHold.js";

type ProductsResponse = { products: CatalogProduct[] };

// Only the fields the Pending-match needs from the shared ["/api/orders"] cache.
type PendingMatchOrder = SyncableOrder & StatusFilterOrder & { order_number?: string | null; phone?: string | null };

type MoveTarget = "keep" | "pending" | "on_hold" | "approved";

const MOVE_OPTIONS: { value: MoveTarget; label: string }[] = [
  { value: "keep", label: "Abandoned" },
  { value: "pending", label: "Pending" },
  { value: "on_hold", label: "On hold" },
  { value: "approved", label: "Approved" },
];

const MOVE_TARGET_LABELS: Record<Exclude<MoveTarget, "keep">, string> = {
  pending: "Pending",
  on_hold: "On Hold",
  approved: "Approved",
};

const EMPTY_HOLD_DETAILS: OrderHoldMetadata = { hold_reason_code: null, hold_reason_detail: null, hold_until_date: null };

function customerFromDraft(draft: AbandonedCheckout): CustomerDraft {
  return {
    customerName: draft.customer_name || "",
    phone: draft.phone || "",
    address: draft.address || "",
  };
}

function draftLineToItem(line: AbandonedCheckout["cart"][number], index: number, draftId: string): OrderEditorItem {
  return {
    id: `draft-${draftId}-${index}`,
    product_id: null,
    variant_id: null,
    product_name: line.productName,
    variant_name: line.variantName,
    product_slug: null,
    image_url: null,
    weight_kg: null,
    available_stock: null,
    unit_price: Number(line.unitPrice) || 0,
    discount_type: null,
    discount_value: 0,
    unit_discount: 0,
    quantity: line.quantity,
  };
}

function capturedLabel(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toLocaleString("en-BD") : value;
}

export default function AbandonedDetail() {
  const { id } = useParams();
  const draftId = id ?? "";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editorTab, setEditorTab] = useOrderEditorTab();
  const [draft, setDraft] = useState<OrderEditorItem[]>([]);
  const [customer, setCustomer] = useState<CustomerDraft>({ customerName: "", phone: "", address: "" });
  const [catalogSearch, setCatalogSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deliveryOn, setDeliveryOn] = useState(true);
  const [deliveryRate, setDeliveryRate] = useState(100);
  // Advance taken while recovering the checkout; saved on the order it converts into.
  const [advanceDraft, setAdvanceDraft] = useState(0);
  const [advanceMethod, setAdvanceMethod] = useState("");
  const [advanceReference, setAdvanceReference] = useState("");
  const [additionReasons, setAdditionReasons] = useState<Record<string, AdditionReason | "">>({});
  const [target, setTarget] = useState<MoveTarget>("keep");
  const [holdDetails, setHoldDetails] = useState<OrderHoldMetadata>(EMPTY_HOLD_DETAILS);
  const [dismissOpen, setDismissOpen] = useState(false);
  const customerPanelRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const initializedDraftKey = useRef<string | null>(null);
  const viewedDraftId = useRef<string | null>(null);

  const cachedDraft = queryClient
    .getQueryData<AbandonedCheckoutResponse>(["/api/abandoned-checkouts"])
    ?.checkouts.find((checkout) => checkout.id === draftId);

  const listQuery = useQuery<AbandonedCheckoutResponse>({
    queryKey: ["/api/abandoned-checkouts"],
    staleTime: 30_000,
    enabled: Boolean(draftId) && !cachedDraft,
    queryFn: async () => {
      const res = await apiFetch("/api/abandoned-checkouts");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to load checkout");
      return json as AbandonedCheckoutResponse;
    },
  });

  const checkout = cachedDraft ?? listQuery.data?.checkouts.find((item) => item.id === draftId);

  const productsQuery = useQuery<ProductsResponse>({
    queryKey: ["/api/products"],
    staleTime: 60_000,
    enabled: Boolean(draftId) && Boolean(checkout),
    queryFn: async () => {
      const res = await apiFetch("/api/products");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to load products");
      return json as ProductsResponse;
    },
  });

  const ordersQuery = useQuery<PendingMatchOrder[]>({
    queryKey: ["/api/orders"],
    staleTime: 60_000,
    enabled: Boolean(checkout),
    queryFn: () => syncOrders<PendingMatchOrder>(queryClient),
  });

  const pendingOrdersByPhone = useMemo(() => buildPendingOrdersByPhone(ordersQuery.data ?? []), [ordersQuery.data]);
  const pendingMatches = checkout ? pendingOrdersForPhone(pendingOrdersByPhone, customer.phone) : [];

  useEffect(() => {
    if (!checkout) return;
    const key = `${checkout.id}:${checkout.updated_at}`;
    if (initializedDraftKey.current === key) return;
    initializedDraftKey.current = key;
    setCustomer(customerFromDraft(checkout));
    setDraft(checkout.cart.map((line, index) => draftLineToItem(line, index, checkout.id)));
    const savedRate = Number(checkout.delivery_rate) || 0;
    setDeliveryRate(savedRate > 0 ? savedRate : 100);
    setDeliveryOn(savedRate > 0);
    setSaveError("");
    setAdditionReasons({});
  }, [checkout]);

  useEffect(() => {
    if (!checkout || viewedDraftId.current === checkout.id) return;
    viewedDraftId.current = checkout.id;
    const activityEndpoint = `/api/abandoned-checkouts/${checkout.id}/activity`;
    void prefetchOrderActivity(queryClient, activityEndpoint);
    void apiFetch(`${activityEndpoint}/view`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_surface: "abandoned_queue" }) }).then((response) => response.ok && refreshOrderActivity(queryClient, activityEndpoint)).catch(() => {});
  }, [checkout, queryClient]);

  // When products load, try to match existing cart items (product_id: null) to catalog products by name
  useEffect(() => {
    const products = productsQuery.data?.products;
    if (!products?.length) return;
    setDraft((items) => {
      let changed = false;
      const resolved = items.map((item) => {
        if (item.product_id) return item;
        const match = products.find(
          (p) => p.name.trim().toLowerCase() === (item.product_name || "").trim().toLowerCase(),
        );
        if (!match) return item;
        changed = true;
        const variantMatch = match.variants.find((v) => {
          const label = variantLabel(v.attributes || {});
          return label && item.variant_name
            && label.toLowerCase() === item.variant_name.toLowerCase();
        });
        return {
          ...item,
          product_id: match.id,
          variant_id: variantMatch?.id || null,
          product_slug: match.slug || null,
          image_url: match.image_url || null,
          weight_kg: variantMatch?.weight_kg ?? match.weight_kg ?? null,
          available_stock: variantMatch?.stock_quantity ?? match.stock_quantity ?? null,
        };
      });
      return changed ? resolved : items;
    });
  }, [productsQuery.data]);

  const totals = useMemo(
    () => calculateCartTotals(draft, deliveryOn ? deliveryRate : 0, 0),
    [draft, deliveryOn, deliveryRate],
  );
  const advance = Math.min(Math.max(0, advanceDraft), totals.finalTotal);
  const requiredAdditionReasonKeys = useMemo(() => {
    if (!checkout) return [];
    const initial = new Map(checkout.cart.map((line) => [`${line.productName}:${line.variantName || ""}`, Number(line.quantity) || 0]));
    return draft.filter((item) => Number(item.quantity) > (initial.get(`${item.product_name || ""}:${item.variant_name || ""}`) || 0)).map(orderItemActivityKey);
  }, [checkout, draft]);
  const isDirty = useMemo(() => {
    if (!checkout) return false;
    if (customer.customerName.trim() !== (checkout.customer_name || "").trim()) return true;
    if (customer.address.trim() !== (checkout.address || "").trim()) return true;
    if (customer.phone.replace(/\D/g, "") !== (checkout.phone || "").replace(/\D/g, "")) return true;
    if ((deliveryOn ? deliveryRate : 0) !== (Number(checkout.delivery_rate) || 0)) return true;
    if (draft.length !== checkout.cart.length) return true;
    return draft.some((item, index) => {
      const line = checkout.cart[index];
      return (item.product_name || "") !== (line.productName || "")
        || (item.variant_name || "") !== (line.variantName || "")
        || item.quantity !== Number(line.quantity)
        || item.unit_price !== (Number(line.unitPrice) || 0);
    });
  }, [checkout, customer, draft, deliveryOn, deliveryRate]);

  function addCatalogItem(product: CatalogProduct, variant?: CatalogVariant) {
    setDraft((items) => upsertCartItem(items, product, variant));
  }

  function updateQuantity(itemId: string, quantity: number) {
    setDraft((items) => items.map((item) => item.id === itemId ? { ...item, quantity } : item));
  }

  function goBack() {
    navigate("/", { state: { fulfillmentTab: "abandoned" } });
  }

  function removeFromAbandonedCache() {
    queryClient.setQueryData<AbandonedCheckoutResponse>(["/api/abandoned-checkouts"], (current) => {
      if (!current) return current;
      const existed = current.checkouts.some((item) => item.id === draftId);
      return {
        checkouts: current.checkouts.filter((item) => item.id !== draftId),
        activeCount: existed ? Math.max(0, current.activeCount - 1) : current.activeCount,
      };
    });
  }

  // Validates and PATCHes the staff edits. Returns true only when the edits were saved.
  async function persistEdits(): Promise<boolean> {
    if (!checkout || !draftId) return false;
    const phone = customer.phone.replace(/\D/g, "");
    if (!/^01\d{9}$/.test(phone)) {
      setSaveError("Enter a valid 11-digit phone number starting with 01");
      return false;
    }
    if (draft.length === 0) {
      setSaveError("Add at least one item before saving");
      return false;
    }
    const invalidLine = draft.some((item) => !(item.product_name || "").trim()
      || !Number.isInteger(item.quantity) || item.quantity < 1
      || !Number.isFinite(item.unit_price) || item.unit_price < 0);
    if (invalidLine) {
      setSaveError("Each line needs a name, a quantity of at least 1, and a valid price");
      return false;
    }
    const rate = deliveryOn ? deliveryRate : 0;
    if (!Number.isFinite(rate) || rate < 0) {
      setSaveError("Delivery rate must be a valid amount");
      return false;
    }
    if (requiredAdditionReasonKeys.some((key) => !additionReasons[key])) { setSaveError("Choose a reason for every added product or quantity increase"); return false; }

    setSaveError("");
    try {
      const activityGroupId = createActivityGroupId();
      const additionReasonsByName = Object.fromEntries(draft.map((item) => [`${item.product_name || ""}:${item.variant_name || ""}`, additionReasons[orderItemActivityKey(item)] || ""]));
      const res = await apiFetch(`/api/abandoned-checkouts/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customer.customerName.trim(),
          phone,
          address: customer.address.trim(),
          items: draft.map((item) => ({
            productName: (item.product_name || "").trim(),
            variantName: item.variant_name,
            quantity: item.quantity,
            unitPrice: item.unit_price,
          })),
          deliveryRate: rate,
          addition_reasons: additionReasonsByName,
          activity_group_id: activityGroupId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404 || res.status === 409) {
          toast.error("Checkout is no longer active");
          goBack();
          return false;
        }
        throw new Error(data.error || "Could not save checkout edits");
      }
      const updated = data.checkout as AbandonedCheckout;
      queryClient.setQueryData<AbandonedCheckoutResponse>(["/api/abandoned-checkouts"], (current) => current
        ? { ...current, checkouts: current.checkouts.map((item) => item.id === draftId ? updated : item) }
        : current);
      initializedDraftKey.current = `${updated.id}:${updated.updated_at}`;
      setCustomer(customerFromDraft(updated));
      setDraft(updated.cart.map((line, index) => draftLineToItem(line, index, updated.id)));
      setAdditionReasons({});
      void refreshOrderActivity(queryClient, `/api/abandoned-checkouts/${draftId}/activity`);
      return true;
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : "Could not save checkout edits");
      return false;
    }
  }

  async function submit() {
    if (!checkout || !draftId || saving || busyRef.current) return;
    if (target === "keep") {
      busyRef.current = true;
      setSaving(true);
      try {
        if (await persistEdits()) toast.success("Checkout updated");
      } finally {
        busyRef.current = false;
        setSaving(false);
      }
      return;
    }

    const customerName = customer.customerName.trim();
    const address = customer.address.trim();
    if (target === "on_hold") {
      const holdError = validateOrderHoldDetails({
        reasonCode: holdDetails.hold_reason_code,
        reasonDetail: holdDetails.hold_reason_detail ?? "",
        holdUntilDate: holdDetails.hold_until_date,
      });
      if (holdError) { setSaveError(holdError.error); return; }
    }
    if (target === "approved" && (!customerName || !address)) {
      setSaveError("Add the customer name and address before approving");
      return;
    }

    busyRef.current = true;
    setSaving(true);
    try {
      const editsSaved = isDirty;
      if (isDirty && !(await persistEdits())) return;
      setSaveError("");
      const onHold = target === "on_hold";
      const res = await apiFetch(`/api/abandoned-checkouts/${draftId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: target,
          customer_name: customerName,
          address,
          hold_reason_code: onHold ? holdDetails.hold_reason_code : null,
          hold_reason_detail: onHold ? holdDetails.hold_reason_detail : null,
          hold_until_date: onHold ? holdDetails.hold_until_date : null,
          ...(advance > 0
            ? {
                advanced_payment: advance,
                advance_payment_method: advanceMethod || undefined,
                advance_payment_reference: advanceReference.trim() || undefined,
              }
            : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.order) {
        if (res.status === 404) {
          toast.error("Checkout is no longer active");
          goBack();
          return;
        }
        const message = typeof data.error === "string" && data.error ? data.error : "Could not move checkout";
        setSaveError(editsSaved ? `${message} Your edits were saved.` : message);
        return;
      }
      removeFromAbandonedCache();
      toast.success(`Order #${(data.order as { order_number: string }).order_number} moved to ${MOVE_TARGET_LABELS[target]}`);
      goBack();
    } catch {
      setSaveError("Could not move checkout");
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  async function dismiss() {
    if (!draftId || saving || busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    try {
      const res = await apiFetch(`/api/abandoned-checkouts/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismissed", activity_group_id: createActivityGroupId() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.checkout) {
        if (res.status === 404 || res.status === 409) {
          toast.error("Checkout is no longer active");
          goBack();
          return;
        }
        toast.error("Could not dismiss checkout");
        return;
      }
      removeFromAbandonedCache();
      toast.success("Checkout dismissed");
      goBack();
    } catch {
      toast.error("Could not dismiss checkout");
    } finally {
      busyRef.current = false;
      setSaving(false);
    }
  }

  const submitRef = useRef(submit);
  useEffect(() => { submitRef.current = submit; });
  useEffect(() => {
    if (!checkout || saving || dismissOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || customerPanelRef.current?.contains(event.target as Node)) return;
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void submitRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [checkout, saving, dismissOpen]);

  const primaryLabel = target === "keep" ? "Save changes" : `Save & move to ${MOVE_OPTIONS.find((option) => option.value === target)?.label}`;

  const actionBlock = (
    <div data-testid="abandoned-action-bar" className="mt-2 flex flex-col gap-2">
      <p className="text-[8px] font-medium uppercase tracking-[0.3em] text-black">Status after save</p>
      <div role="group" aria-label="Move checkout to" className="grid grid-cols-4 gap-1 rounded-[10px] bg-black/[0.04] p-1">
        {MOVE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={target === option.value}
            disabled={saving}
            onClick={() => { setTarget(option.value); setSaveError(""); }}
            className={`h-8 truncate rounded-[6px] text-[12px] disabled:cursor-not-allowed disabled:opacity-35 ${target === option.value ? "bg-white font-medium text-black ring-1 ring-inset ring-black/[0.08]" : "text-black/60 hover:text-black"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {target === "on_hold" && (
        <div>
          <OrderHoldFields value={holdDetails} onChange={setHoldDetails} disabled={saving} />
        </div>
      )}
      {saveError && <p role="alert" className="text-[12px] text-red-600">{saveError}</p>}
      <div className="flex items-center gap-1.5">
        <BuiButton variant="danger" size="medium" onClick={() => setDismissOpen(true)} disabled={saving} className="rounded-[6px]">Dismiss</BuiButton>
        <BuiButton variant="ghost" size="medium" onClick={goBack} disabled={saving} className="ml-auto rounded-[6px]">Cancel</BuiButton>
        <button type="button" onClick={() => { void submit(); }} disabled={saving} className="inline-flex h-9 items-center justify-center gap-2 rounded-[6px] bg-black px-4 text-[12px] text-white disabled:cursor-not-allowed disabled:opacity-35">{saving && <Spinner size="sm" />}{saving ? "Saving…" : primaryLabel}</button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-col gap-3 bg-[#FAFAF8] px-2 pb-3 pt-0 lg:px-3 lg:pt-1">
      <div data-testid="abandoned-editor-toolbar" className="sticky top-0 z-30 flex flex-wrap items-center gap-3 bg-[#FAFAF8]/95 py-2 backdrop-blur-sm">
        <BuiButton variant="ghost" size="small" iconOnly leadingIcon={ArrowLeft} aria-label="Back" onClick={goBack} />
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h1 style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }} className="text-[28px] font-medium tracking-tight text-black">Abandoned editor</h1>
          {checkout && (
            <span className="truncate text-[13px] text-black">
              Captured {capturedLabel(checkout.created_at)}{checkout.phone ? ` · ${checkout.phone}` : ""}
            </span>
          )}
        </div>
        {checkout && <OrderEditorTabSwitch value={editorTab} onChange={setEditorTab} className="sm:ml-auto" />}
      </div>

      {pendingMatches.length > 0 && (
        <div role="status" className="flex items-start gap-2 rounded-[6px] bg-status-rose-background/60 px-3 py-2 text-[13px] text-status-rose-text">
          <Warning weight="light" size={16} aria-hidden className="mt-0.5 shrink-0" />
          <p>
            <strong className="font-medium">Already ordered</strong>
            {pendingMatches.length === 1 ? (
              <>
                {" — "}
                <Link to={`/orders/${pendingMatches[0].id}`} className="rounded-[6px] underline underline-offset-2">{pendingOrderLabel(pendingMatches[0])}</Link>
                {" is waiting in Pending. Check it before contacting or moving this checkout."}
              </>
            ) : (
              <>
                {` — ${pendingMatches.length} orders are waiting in Pending: `}
                {pendingMatches.map((match, index) => (
                  <span key={match.id}>
                    {index > 0 && ", "}
                    <Link to={`/orders/${match.id}`} className="rounded-[6px] underline underline-offset-2">{pendingOrderLabel(match)}</Link>
                  </span>
                ))}
                .
              </>
            )}
          </p>
        </div>
      )}

      {!checkout ? (
        listQuery.isLoading ? (
          <div data-testid="abandoned-detail-loading" className="grid place-items-center py-24"><Spinner size="md" /></div>
        ) : listQuery.isError ? (
          <div className="py-24 text-center text-[13px] text-red-600">{(listQuery.error as Error).message}</div>
        ) : (
          <div className="py-24 text-center">
            <p className="text-[15px] font-medium text-black">Checkout not found.</p>
            <button type="button" aria-label="Back to abandoned checkouts" onClick={goBack} className="mt-2 text-[13px] text-black underline">Back to abandoned checkouts</button>
          </div>
        )
      ) : (
        <OrderEditorTabPanels
          tab={editorTab}
          logs={
            <div className="overflow-hidden rounded-xl ring-1 ring-black/[0.07]">
              <OrderActivityTimeline endpoint={`/api/abandoned-checkouts/${checkout.id}/activity`} variant="full" />
            </div>
          }
          details={
            <div className="flex min-h-0 flex-col gap-px overflow-hidden rounded-xl bg-black/[0.07] ring-1 ring-black/[0.07]">
              <div ref={customerPanelRef}>
                <CustomerPanel order={{}} customer={customer} disabled={saving} onApply={setCustomer} />
              </div>
              <div data-testid="abandoned-editor-workspace" data-mobile-layout="single-column" className="grid min-h-0 grid-cols-1 items-start gap-px bg-black/[0.07] xl:h-[100vh] xl:min-h-[560px] xl:grid-cols-2">
                <CatalogPanel products={productsQuery.data?.products || []} search={catalogSearch} loading={productsQuery.isPending} error={productsQuery.isError} canEdit locked={false} onSearch={setCatalogSearch} onRetry={() => { void productsQuery.refetch(); }} onAdd={addCatalogItem} />
                <CartPanel items={draft} totals={totals} canEdit locked={false} saving={saving} error={undefined} overallDiscountType={null} overallDiscountValue={0} deliveryOn={deliveryOn} advance={advance} onAdvanceChange={setAdvanceDraft} advanceMethod={advanceMethod} advanceReference={advanceReference} onAdvanceMethodChange={setAdvanceMethod} onAdvanceReferenceChange={setAdvanceReference} status={null} onStatusChange={() => {}} onToggleDelivery={setDeliveryOn} onOverallDiscount={() => {}} onRemoveOverallDiscount={() => {}} onQuantity={updateQuantity} onRemove={(itemId) => setDraft((items) => items.filter((item) => item.id !== itemId))} onDiscount={() => {}} onSave={() => {}} onCancel={goBack} hideOrderSections actions={actionBlock} requiredAdditionReasonKeys={requiredAdditionReasonKeys} additionReasons={additionReasons} onAdditionReasonChange={(key, reason) => setAdditionReasons((current) => ({ ...current, [key]: reason }))} />
              </div>
            </div>
          }
        />
      )}
      <AlertDialog open={dismissOpen} onOpenChange={setDismissOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dismiss checkout?</AlertDialogTitle>
            <AlertDialogDescription>
              Dismiss this checkout from the recovery queue? This cannot be undone.{isDirty ? " Your unsaved changes will be lost." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-[6px]">Keep checkout</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { void dismiss(); }}
              className="rounded-[6px] bg-red-600 text-white hover:bg-red-700"
            >
              Dismiss checkout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
