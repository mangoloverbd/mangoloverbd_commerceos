import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { Button as BuiButton } from "@/components/base/buttons/button";
import { Spinner } from "@/components/ui/ios-spinner";
import { toast } from "@/components/ui/sonner";
import { CustomerPanel, type CustomerDraft } from "@/components/order-editor/CustomerPanel";
import { CatalogPanel } from "@/components/order-editor/CatalogPanel";
import { CartPanel } from "@/components/order-editor/CartPanel";
import type {
  AbandonedCheckout,
  AbandonedCheckoutResponse,
} from "@/lib/abandonedCheckouts";
import {
  calculateCartTotals,
  variantLabel,
  type CatalogProduct,
  type CatalogVariant,
  type OrderEditorItem,
} from "@/lib/orderEditor";

type ProductsResponse = { products: CatalogProduct[] };

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

function variantLabelOf(variant: CatalogVariant): string | null {
  return variantLabel(variant.attributes || {}) || null;
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
  const [draft, setDraft] = useState<OrderEditorItem[]>([]);
  const [customer, setCustomer] = useState<CustomerDraft>({ customerName: "", phone: "", address: "" });
  const [catalogSearch, setCatalogSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deliveryOn, setDeliveryOn] = useState(true);
  const [deliveryRate, setDeliveryRate] = useState(100);
  const initializedDraftKey = useRef<string | null>(null);

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
    enabled: Boolean(draftId),
    queryFn: async () => {
      const res = await apiFetch("/api/products");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to load products");
      return json as ProductsResponse;
    },
  });

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
  }, [checkout]);

  const totals = useMemo(
    () => calculateCartTotals(draft, deliveryOn ? deliveryRate : 0, 0),
    [draft, deliveryOn, deliveryRate],
  );

  function addCatalogItem(product: CatalogProduct, variant?: CatalogVariant) {
    const variantName = variant ? variantLabelOf(variant) : null;
    const unitPrice = (product.selling_price ?? 0) + (variant?.price_adjustment || 0);
    setDraft((items) => {
      const existing = items.find((item) => item.product_name === product.name && (item.variant_name || null) === variantName);
      if (existing) {
        return items.map((item) => item.id === existing.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...items, {
        id: `draft-${draftId}-custom-${Date.now()}`,
        product_id: null, variant_id: null, product_name: product.name,
        variant_name: variantName, product_slug: null, image_url: null,
        weight_kg: null, available_stock: null, unit_price: unitPrice,
        discount_type: null, discount_value: 0, unit_discount: 0, quantity: 1,
      }];
    });
  }

  function updateQuantity(itemId: string, quantity: number) {
    setDraft((items) => items.map((item) => item.id === itemId ? { ...item, quantity } : item));
  }

  function goBack() {
    navigate("/", { state: { fulfillmentTab: "abandoned" } });
  }

  async function save() {
    if (!checkout || !draftId || saving) return;
    const phone = customer.phone.replace(/\D/g, "");
    if (!/^01\d{9}$/.test(phone)) {
      setSaveError("Enter a valid 11-digit phone number starting with 01");
      return;
    }
    if (draft.length === 0) {
      setSaveError("Add at least one item before saving");
      return;
    }
    const invalidLine = draft.some((item) => !(item.product_name || "").trim()
      || !Number.isInteger(item.quantity) || item.quantity < 1
      || !Number.isFinite(item.unit_price) || item.unit_price < 0);
    if (invalidLine) {
      setSaveError("Each line needs a name, a quantity of at least 1, and a valid price");
      return;
    }
    const rate = deliveryOn ? deliveryRate : 0;
    if (!Number.isFinite(rate) || rate < 0) {
      setSaveError("Delivery rate must be a valid amount");
      return;
    }

    setSaving(true);
    setSaveError("");
    try {
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
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404 || res.status === 409) {
          toast.error("Checkout is no longer active");
          goBack();
          return;
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
      toast.success("Checkout updated");
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : "Could not save checkout edits");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-3 bg-[#FAFAF8] px-4 pb-4 pt-1 lg:px-5 lg:pt-2">
      <div data-testid="abandoned-editor-toolbar" className="sticky top-0 z-30 flex items-center gap-3 bg-[#FAFAF8]/95 py-2 backdrop-blur-sm">
        <BuiButton variant="ghost" size="small" iconOnly leadingIcon={ArrowLeft} aria-label="Back" onClick={goBack} />
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h1 style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }} className="text-[28px] font-medium tracking-tight text-black">Abandoned editor</h1>
          {checkout && (
            <span className="truncate text-[13px] text-black/45">
              Captured {capturedLabel(checkout.created_at)}{checkout.phone ? ` · ${checkout.phone}` : ""}
            </span>
          )}
        </div>
      </div>

      {!checkout ? (
        listQuery.isLoading ? (
          <div data-testid="abandoned-detail-loading" className="grid place-items-center py-24"><Spinner size="md" /></div>
        ) : listQuery.isError ? (
          <div className="py-24 text-center text-[13px] text-red-600">{(listQuery.error as Error).message}</div>
        ) : (
          <div className="py-24 text-center">
            <p className="text-[15px] font-medium text-black">Checkout not found.</p>
            <button type="button" aria-label="Back to abandoned checkouts" onClick={goBack} className="mt-2 text-[13px] text-black/50 underline">Back to abandoned checkouts</button>
          </div>
        )
      ) : (
        <div className="flex min-h-0 flex-col gap-px overflow-hidden rounded-xl bg-black/[0.07] ring-1 ring-black/[0.07]">
          <CustomerPanel order={{}} customer={customer} disabled={saving} onApply={setCustomer} />
          <div data-testid="abandoned-editor-workspace" data-mobile-layout="single-column" className="grid min-h-0 grid-cols-1 items-start gap-px bg-black/[0.07] xl:h-[100vh] xl:min-h-[560px] xl:grid-cols-2">
            <CatalogPanel products={productsQuery.data?.products || []} search={catalogSearch} loading={productsQuery.isPending} error={productsQuery.isError} canEdit locked={false} onSearch={setCatalogSearch} onRetry={() => { void productsQuery.refetch(); }} onAdd={addCatalogItem} />
            <CartPanel items={draft} totals={totals} canEdit locked={false} saving={saving} error={saveError} overallDiscountType={null} overallDiscountValue={0} deliveryOn={deliveryOn} status={null} onStatusChange={() => {}} notes="" onNotesChange={() => {}} onToggleDelivery={setDeliveryOn} onOverallDiscount={() => {}} onRemoveOverallDiscount={() => {}} onQuantity={updateQuantity} onRemove={(itemId) => setDraft((items) => items.filter((item) => item.id !== itemId))} onDiscount={() => {}} onSave={() => { void save(); }} onCancel={goBack} hideOrderSections />
          </div>
        </div>
      )}
    </div>
  );
}
