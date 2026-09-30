import type { OrderSource } from "@/lib/orderSource";
import { customerKeyFor } from "../../shared/customerIdentity.js";

export function customerProfileHref(order: { id: string; phone?: string | null; notes?: string | null }, kind: "order" | "social" = "order") {
  return `/customers/${encodeURIComponent(customerKeyFor(order, kind))}`;
}

export function customerPrefillFromState(state: unknown): { customerName: string; phone: string; address: string } {
  const prefill = state && typeof state === "object" && "customerPrefill" in state ? state.customerPrefill : null;
  const textField = (key: string) => prefill && typeof prefill === "object" && key in prefill && typeof prefill[key] === "string" ? prefill[key] : "";
  return { customerName: textField("customerName"), phone: textField("phone"), address: textField("address") };
}

export type CustomerContextData = {
  tags: string[];
  followUpOn: string | null;
  followUpReason: string;
  version: number;
  updatedAt: string | null;
  updatedByName: string | null;
};
export type CustomerNote = { id: string; body: string; authorId: string; authorName: string; createdAt: string };
export type CustomerHistoryOrder = {
  id: string;
  kind: "order" | "social_order";
  orderNumber: string | null;
  source: OrderSource;
  createdAt: string | null;
  amount: number | null;
  status: string;
  outcome: "active" | "delivered" | "partial_delivered" | "cancelled" | "returned";
  products: Array<{ name: string; quantity: number | null }>;
  courierName: string | null;
  courierStatus: string | null;
  trackingCode: string | null;
  consignmentId: string | null;
  pendingReturn: boolean;
  conversationId: string | null;
};
export type ProfilePage<T> = { items: T[]; page: number; total: number; totalPages: number };
export type CustomerActivity = { id: string; orderId: string; kind: "order" | "social_order"; summary: string; actorName: string; createdAt: string };
export type CustomerProfileResponse = {
  profile: {
    id: string; name: string; phone: string; latestAddress: string | null;
    addresses: Array<{ address: string; lastUsedAt: string | null; orders: number }>;
    firstOrderAt: string | null; lastOrderAt: string | null;
    firstPurchaseAt: string | null; lastPurchaseAt: string | null;
    sources: OrderSource[]; primarySource: OrderSource;
    lifecycleStage: "new" | "repeat" | "vip" | "dormant" | "risky";
    campaignSegments: string[];
    riskLevel: "low" | "medium" | "high"; riskExplanation: string;
    products: Array<{ name: string; quantity: number | null; orders: number }>;
    suggestion: string;
    summary: {
      totalOrders: number; deliveredOrders: number; cancelledOrders: number; returnedOrders: number;
      partialDeliveredOrders: number; activeOrders: number; pendingReturns: number;
      orderValue: number | null; deliveredValue: number | null; averageDeliveredValue: number | null;
      missingAmounts: number; daysSinceLastOrder: number | null; daysSinceLastPurchase: number | null;
      averagePurchaseIntervalDays: number | null;
    };
  };
  context: CustomerContextData;
  notes: ProfilePage<CustomerNote>;
  orders: ProfilePage<CustomerHistoryOrder>;
  activeOrders: CustomerHistoryOrder[];
  activity: ProfilePage<CustomerActivity>;
};

export function customerMoney(value: number | null) {
  return value === null ? "Unavailable" : `৳${value.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
}
export function customerDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Unavailable";
  return new Date(value.length === 10 ? `${value}T00:00:00+06:00` : value).toLocaleDateString("en-BD", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
}
export function customerOrderHref(order: Pick<CustomerHistoryOrder, "kind" | "id">) {
  return order.kind === "order" ? `/orders/${encodeURIComponent(order.id)}` : `/inbox/orders?order=${encodeURIComponent(order.id)}`;
}

export function customerInboxTarget<T extends { id: string }>(orders: T[], targetId: string | null): T[] {
  return targetId ? orders.filter((order) => order.id === targetId) : orders;
}
