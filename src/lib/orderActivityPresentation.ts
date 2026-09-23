import { formatTaka } from "@/lib/orderEditor";
import type { OrderActivityChange } from "@/lib/orderActivityQuery";
import { normalizeBusinessStatus } from "@/lib/orderTransitions";

export type ActivityChipColor = "lime" | "rose" | "yellow" | "cyan" | "blue" | "purple" | "neutral";

export type ItemChangeKind = "added" | "removed" | "increased" | "decreased" | "discount" | "other";

export type ActivityChangeInput = OrderActivityChange & {
  item_key?: string;
  quantity_delta?: number;
  amount_delta?: number;
};

export type GroupedActivityChanges = {
  status?: ActivityChangeInput;
  total?: ActivityChangeInput;
  items: ActivityChangeInput[];
  fields: ActivityChangeInput[];
};

const STATUS_PRESENTATION: Record<string, { label: string; color: ActivityChipColor }> = {
  pending: { label: "Pending", color: "yellow" },
  on_hold: { label: "On Hold", color: "purple" },
  hold: { label: "On Hold", color: "purple" },
  confirmed: { label: "Approved", color: "blue" },
  approved: { label: "Approved", color: "blue" },
  print: { label: "Print", color: "cyan" },
  processing: { label: "Processing", color: "cyan" },
  ready_to_ship: { label: "Ready To Ship", color: "cyan" },
  in_transit: { label: "In-Transit", color: "blue" },
  delivered: { label: "Delivered", color: "lime" },
  flagged: { label: "Flagged", color: "rose" },
  cancelled: { label: "Cancelled", color: "rose" },
  canceled: { label: "Cancelled", color: "rose" },
};

const MONEY_FIELDS = new Set([
  "discount",
  "delivery_rate",
  "advanced_payment",
  "price",
  "total_price",
  "subtotal",
  "total",
]);

const TOTAL_FIELDS = ["total_price", "total", "price"];

const ACTIVITY_REASONS: Record<string, string> = {
  customer_changed_mind: "Customer changed their mind",
  customer_unreachable: "Customer unreachable",
  duplicate_order: "Duplicate order",
  wrong_product_or_quantity: "Wrong product or quantity",
  pricing_issue: "Pricing issue",
  delivery_charge_objection: "Delivery-charge objection",
  delivery_delay: "Delivery delay",
  out_of_stock: "Out of stock",
  fraud_or_suspicious: "Fraud or suspicious order",
  invalid_contact_information: "Invalid contact information",
  service_area_unavailable: "Service area unavailable",
  test_or_fake_order: "Test or fake order",
  upsell: "Upsell",
  customer_request: "Customer request",
  correction: "Correction",
  replacement: "Replacement",
  other: "Other",
};

const humanize = (value: string) =>
  value.split("_").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");

export function activityReasonLabel(code: string): string {
  return ACTIVITY_REASONS[code] || humanize(code);
}

const isEmpty = (value: unknown) => value === null || value === undefined || value === "";

export function activityStatusLabel(value: unknown): string {
  if (isEmpty(value)) return "Not set";
  const normalized = normalizeBusinessStatus(String(value));
  return STATUS_PRESENTATION[normalized]?.label || humanize(normalized) || String(value);
}

export function activityStatusColor(value: unknown): ActivityChipColor {
  if (isEmpty(value)) return "neutral";
  return STATUS_PRESENTATION[normalizeBusinessStatus(String(value))]?.color || "neutral";
}

export function isItemChange(change: ActivityChangeInput): boolean {
  return Boolean(change.type?.startsWith("item_") || change.item_key);
}

export function itemChangeKind(change: ActivityChangeInput): ItemChangeKind {
  switch (change.type) {
    case "item_added": return "added";
    case "item_removed": return "removed";
    case "item_quantity_increased": return "increased";
    case "item_quantity_decreased": return "decreased";
    case "item_discount_changed": return "discount";
  }
  const before = Number(change.before);
  const after = Number(change.after);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return "other";
  if (before === 0 && after > 0) return "added";
  if (before > 0 && after === 0) return "removed";
  if (after > before) return "increased";
  if (after < before) return "decreased";
  return "other";
}

// Legacy variant names are stored as JSON attribute objects, e.g. {"size":"১ কেজি"}.
export function cleanActivityItemLabel(label?: string): string {
  if (!label) return "Product";
  return label.replace(/\{[^{}]*\}/g, (raw) => {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const values = Object.values(parsed).filter((value) => !isEmpty(value)).map(String);
        return values.length ? values.join(" / ") : raw;
      }
    } catch {
      // Not JSON; keep the original text.
    }
    return raw;
  });
}

export function groupActivityChanges(changes: ActivityChangeInput[] = []): GroupedActivityChanges {
  const grouped: GroupedActivityChanges = { items: [], fields: [] };
  for (const change of changes) {
    if (isItemChange(change)) {
      grouped.items.push(change);
    } else if (change.field === "status") {
      grouped.status ??= change;
    } else if (change.field && TOTAL_FIELDS.includes(change.field)) {
      grouped.total ??= change;
    } else {
      grouped.fields.push(change);
    }
  }
  return grouped;
}

export type ActivityChangeLayout = GroupedActivityChanges & {
  inlineFields: ActivityChangeInput[];
  listFields: ActivityChangeInput[];
};

// Field edits sit inline on their own; alongside a status or item summary they move to the list below.
export function layoutActivityChanges(changes: ActivityChangeInput[] = []): ActivityChangeLayout {
  const grouped = groupActivityChanges(changes);
  const hasHeadline = Boolean(grouped.status || grouped.total || grouped.items.length);
  return {
    ...grouped,
    inlineFields: hasHeadline ? [] : grouped.fields,
    listFields: hasHeadline ? grouped.fields : [],
  };
}

export function summarizeItemChanges(items: ActivityChangeInput[]): string {
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const item of items) {
    const kind = itemChangeKind(item);
    if (kind === "added") added += 1;
    else if (kind === "removed") removed += 1;
    else changed += 1;
  }
  return [
    added ? `${added} added` : "",
    removed ? `${removed} removed` : "",
    changed ? `${changed} changed` : "",
  ].filter(Boolean).join(" · ");
}

export function formatSignedTaka(value: number): string {
  if (!Number.isFinite(value) || value === 0) return formatTaka(0);
  return `${value > 0 ? "+" : "−"}${formatTaka(Math.abs(value))}`;
}

export function isMoneyField(field?: string): boolean {
  return Boolean(field && MONEY_FIELDS.has(field));
}

export function formatActivityFieldValue(field: string | undefined, value: unknown): string {
  if (isEmpty(value)) return "Not set";
  if (field === "status") return activityStatusLabel(value);
  if (isMoneyField(field) && Number.isFinite(Number(value))) return formatTaka(Number(value));
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
