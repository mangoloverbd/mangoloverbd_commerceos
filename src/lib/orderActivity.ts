import type { OrderEditorItem } from "@/lib/orderEditor";

export const ADDITION_REASON_OPTIONS = [
  { value: "upsell", label: "Upsell" }, { value: "customer_request", label: "Customer request" },
  { value: "correction", label: "Correction" }, { value: "replacement", label: "Replacement" }, { value: "other", label: "Other" },
] as const;
export const CANCELLATION_REASON_OPTIONS = [
  { value: "customer_changed_mind", label: "Customer changed their mind" }, { value: "customer_unreachable", label: "Customer unreachable" },
  { value: "duplicate_order", label: "Duplicate order" }, { value: "wrong_product_or_quantity", label: "Wrong product or quantity" },
  { value: "pricing_issue", label: "Pricing issue" }, { value: "delivery_charge_objection", label: "Delivery-charge objection" },
  { value: "delivery_delay", label: "Delivery delay" }, { value: "out_of_stock", label: "Out of stock" },
  { value: "fraud_or_suspicious", label: "Fraud or suspicious order" }, { value: "invalid_contact_information", label: "Invalid contact information" },
  { value: "service_area_unavailable", label: "Service area unavailable" }, { value: "test_or_fake_order", label: "Test or fake order" }, { value: "zone_change", label: "Zone change" }, { value: "other", label: "Other" },
] as const;
export type AdditionReason = (typeof ADDITION_REASON_OPTIONS)[number]["value"];
export type CancellationReason = (typeof CANCELLATION_REASON_OPTIONS)[number]["value"];
export const orderItemActivityKey = (item: Pick<OrderEditorItem, "product_id" | "variant_id">) => `${item.product_id || ""}:${item.variant_id || ""}`;
export const createActivityGroupId = () => crypto.randomUUID();
export function orderViewSurface(state: unknown) {
  const value = state && typeof state === "object" ? state as { activitySurface?: unknown; fulfillmentTab?: unknown } : null;
  if (["search", "customer_history", "activity_log", "notification"].includes(String(value?.activitySurface))) return String(value?.activitySurface);
  if (value?.fulfillmentTab === "pending") return "pending_queue";
  return "direct_link";
}
