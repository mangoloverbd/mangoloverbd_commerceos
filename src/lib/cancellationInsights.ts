import type { DateRange } from "react-day-picker";
import { normalizeBdPhone } from "@/lib/bdPhone";
import { CANCELLATION_REASON_OPTIONS } from "@/lib/orderActivity";

export type CancellationPreset = "today" | "yesterday" | "7d" | "30d" | "all";
export type CancellationDateBasis = "cancelled" | "ordered";
/** Cancelled without a recorded reason: courier or Shopify cancellations, and orders from before reasons were required. */
export const NO_REASON = "none";
export type CancellationReasonKey = (typeof CANCELLATION_REASON_OPTIONS)[number]["value"] | typeof NO_REASON;

export const CANCELLATION_PRESETS: Array<{ id: CancellationPreset; label: string }> = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "all", label: "All time" },
];

export type CancelledOrder = {
  id: string;
  order_number?: string | null;
  customer_name?: string | null;
  phone?: string | null;
  created_at: string;
  cancelled_at?: string | null;
  cancellation_reason_code?: string | null;
  cancellation_reason_note?: string | null;
  price?: number | null;
  delivery_rate?: number | null;
  advanced_payment?: number | null;
  product?: string | null;
  items?: Array<{ product_name: string | null; variant_name: string | null; quantity: number }>;
};

const REASON_LABELS = new Map<string, string>(CANCELLATION_REASON_OPTIONS.map((option) => [option.value, option.label]));

export function cancellationReasonKey(order: CancelledOrder): CancellationReasonKey {
  const code = order.cancellation_reason_code;
  if (!code) return NO_REASON;
  return REASON_LABELS.has(code) ? (code as CancellationReasonKey) : "other";
}

export function cancellationReasonLabel(key: CancellationReasonKey) {
  return key === NO_REASON ? "No reason recorded" : REASON_LABELS.get(key) ?? "Other";
}

/** Related reasons share a colour so the breakdown scans by kind of problem. */
const REASON_DOT_CLASSES: Record<CancellationReasonKey, string> = {
  customer_unreachable: "bg-amber-500", invalid_contact_information: "bg-amber-500",
  delivery_charge_objection: "bg-sky-500", pricing_issue: "bg-sky-500",
  customer_changed_mind: "bg-violet-500", duplicate_order: "bg-violet-500", wrong_product_or_quantity: "bg-violet-500",
  out_of_stock: "bg-teal-500", delivery_delay: "bg-teal-500", service_area_unavailable: "bg-teal-500", zone_change: "bg-teal-500",
  fraud_or_suspicious: "bg-rose-500", test_or_fake_order: "bg-rose-500",
  other: "bg-zinc-400", [NO_REASON]: "bg-zinc-300",
};

export function cancellationReasonDotClass(key: CancellationReasonKey) {
  return REASON_DOT_CLASSES[key] ?? "bg-zinc-400";
}

export function presetRange(preset: CancellationPreset, now = new Date()): DateRange | null {
  const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
  switch (preset) {
    case "today": return { from: day(0), to: day(0) };
    case "yesterday": return { from: day(1), to: day(1) };
    case "7d": return { from: day(6), to: day(0) };
    case "30d": return { from: day(29), to: day(0) };
    default: return null;
  }
}

/** Orders cancelled before cancelled_at was recorded fall back to their order date. */
export function cancellationDate(order: CancelledOrder, basis: CancellationDateBasis) {
  return basis === "ordered" ? order.created_at : order.cancelled_at || order.created_at;
}

/** Keep orders whose basis date falls on a local day inside the inclusive range. */
export function filterCancelledByDate<T extends CancelledOrder>(orders: T[], range: DateRange | null | undefined, basis: CancellationDateBasis): T[] {
  if (!range?.from) return orders;
  const from = new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate()).getTime();
  const to = range.to ?? range.from;
  const until = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1).getTime();
  return orders.filter((order) => {
    const time = Date.parse(cancellationDate(order, basis));
    return Number.isFinite(time) && time >= from && time < until;
  });
}

export function filterCancelledByReasons<T extends CancelledOrder>(orders: T[], reasons: ReadonlySet<CancellationReasonKey>): T[] {
  if (reasons.size === 0) return orders;
  return orders.filter((order) => reasons.has(cancellationReasonKey(order)));
}

/** Reasons ranked by count; "No reason recorded" always last. */
export function countCancellationReasons(orders: CancelledOrder[]) {
  const counts = new Map<CancellationReasonKey, number>();
  for (const order of orders) {
    const key = cancellationReasonKey(order);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: cancellationReasonLabel(key), count }))
    .sort((a, b) => Number(a.key === NO_REASON) - Number(b.key === NO_REASON) || b.count - a.count || a.label.localeCompare(b.label));
}

function phoneKey(phone: string | null | undefined) {
  return normalizeBdPhone(phone) ?? (phone?.trim() || null);
}

/** Each customer's phone once, in list order. */
export function uniqueCancelledPhones(orders: CancelledOrder[]) {
  const seen = new Set<string>();
  const phones: string[] = [];
  for (const order of orders) {
    const key = phoneKey(order.phone);
    if (key && !seen.has(key)) {
      seen.add(key);
      phones.push(key);
    }
  }
  return phones;
}

/** How many cancelled orders each phone has across the whole cancelled list. */
export function cancellationsByPhone(orders: CancelledOrder[]) {
  const counts = new Map<string, number>();
  for (const order of orders) {
    const key = phoneKey(order.phone);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function cancellationCountFor(counts: Map<string, number>, phone: string | null | undefined) {
  const key = phoneKey(phone);
  return key ? counts.get(key) ?? 0 : 0;
}

export function cancelledOrderTotal(order: CancelledOrder) {
  return Math.max(0, (order.price || 0) + (order.delivery_rate || 0) - (order.advanced_payment || 0));
}

export function summarizeCancellations(orders: CancelledOrder[], allCancelled: CancelledOrder[]) {
  const counts = cancellationsByPhone(allCancelled);
  const phones = uniqueCancelledPhones(orders);
  return {
    orders: orders.length,
    customers: phones.length,
    value: orders.reduce((sum, order) => sum + cancelledOrderTotal(order), 0),
    repeatCustomers: phones.filter((phone) => (counts.get(phone) ?? 0) > 1).length,
  };
}

function csvCell(value: string | number) {
  let text = String(value ?? "");
  // A cell starting with a formula character would run as a formula in Excel; phone numbers are left as they are.
  if (/^[=+\-@\t\r]/.test(text) && !/^\+?\d[\d\s-]*$/.test(text)) text = `'${text}`;
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function itemsLabel(order: CancelledOrder) {
  if (order.items?.length) {
    return order.items.map((item) => `${[item.product_name, item.variant_name].filter(Boolean).join(" - ")} x${item.quantity}`).join("; ");
  }
  return order.product || "";
}

const exportDate = (value: string | null | undefined) => (value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "");

export function buildCancelledOrdersCsv(orders: CancelledOrder[]) {
  const header = ["Order", "Customer", "Phone", "Reason", "Note", "Ordered", "Cancelled", "Items", "Total"];
  const rows = orders.map((order) => [
    order.order_number || order.id,
    order.customer_name || "",
    phoneKey(order.phone) || "",
    cancellationReasonLabel(cancellationReasonKey(order)),
    order.cancellation_reason_note || "",
    exportDate(order.created_at),
    exportDate(order.cancelled_at),
    itemsLabel(order),
    cancelledOrderTotal(order),
  ]);
  // The byte-order mark lets Excel read Bangla names as UTF-8.
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}`;
}
