import { formatTaka } from "@/lib/orderEditor";
import type { OrderActivityChange } from "@/lib/orderActivityQuery";
import { normalizeBusinessStatus } from "@/lib/orderTransitions";

export type ActivityChipColor = "lime" | "rose" | "yellow" | "cyan" | "blue" | "purple" | "neutral";

export type ItemChangeKind = "added" | "removed" | "increased" | "decreased" | "discount" | "variant" | "other";

export type ActivityChangeInput = OrderActivityChange & {
  item_key?: string;
  quantity_delta?: number;
  amount_delta?: number;
  /** Set on merged size-change rows: units swapped from one variant to another. */
  quantity?: number;
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
  zone_change: "Zone change",
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
    case "item_variant_changed": return "variant";
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

function changeDeltaInCents(change?: ActivityChangeInput): number | null {
  if (!change) return null;
  const before = Number(change.before);
  const after = Number(change.after);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
  return Math.round((after - before) * 100);
}

function discountIsReflectedInTotal(
  total: ActivityChangeInput | undefined,
  items: ActivityChangeInput[],
  fields: ActivityChangeInput[],
): boolean {
  if (!total || items.length > 0 || fields.length !== 1 || fields[0].field !== "discount") return false;
  const totalDelta = changeDeltaInCents(total);
  const discountDelta = changeDeltaInCents(fields[0]);
  return totalDelta !== null && discountDelta !== null
    && totalDelta !== 0 && discountDelta !== 0
    && totalDelta === -discountDelta;
}

// The stored order discount is the sum of every line's discount, so adding a
// discounted item moves it even though nobody touched the whole-order
// discount. When the total moved by exactly the items' net amounts, the
// discount change is already inside those item rows and only confuses.
function discountIsExplainedByItems(total: ActivityChangeInput | undefined, items: ActivityChangeInput[]): boolean {
  if (!total || items.length === 0) return false;
  const totalDelta = changeDeltaInCents(total);
  if (totalDelta === null) return false;
  return itemDeltaInCents(items) === totalDelta;
}

function itemDeltaInCents(items: ActivityChangeInput[]): number | null {
  let sum = 0;
  for (const item of items) {
    const amount = Number(item.amount_delta);
    if (item.amount_delta === undefined || item.amount_delta === null || !Number.isFinite(amount)) return null;
    sum += Math.round(amount * 100);
  }
  return sum;
}

// An abandoned-checkout subtotal is just the item lines added up.
function subtotalIsExplainedByItems(fields: ActivityChangeInput[], items: ActivityChangeInput[]): boolean {
  const subtotal = fields.find((field) => field.field === "subtotal");
  if (!subtotal || items.length === 0) return false;
  const delta = changeDeltaInCents(subtotal);
  return delta !== null && delta === itemDeltaInCents(items);
}

// Item keys are "<product>:<variant>"; the product part identifies a size swap.
function productPart(key: string | undefined): string | null {
  if (!key) return null;
  const split = key.lastIndexOf(":");
  return split > 0 ? key.slice(0, split) : null;
}

function splitItemLabel(label: string | undefined): { base: string; variant: string } {
  const clean = cleanActivityItemLabel(label);
  const split = clean.lastIndexOf(" · ");
  return split > 0 ? { base: clean.slice(0, split), variant: clean.slice(split + 3) } : { base: clean, variant: "" };
}

// Staff change a size by removing one variant and adding another of the same
// product in the same quantity; show that as one "size changed" row.
function mergeVariantSwaps(items: ActivityChangeInput[]): ActivityChangeInput[] {
  const used = new Set<number>();
  const merged: ActivityChangeInput[] = [];
  items.forEach((removed, removedIndex) => {
    if (used.has(removedIndex) || itemChangeKind(removed) !== "removed") return;
    const product = productPart(removed.item_key);
    if (!product) return;
    const addedIndex = items.findIndex((added, index) => !used.has(index)
      && index !== removedIndex
      && itemChangeKind(added) === "added"
      && productPart(added.item_key) === product
      && added.item_key !== removed.item_key
      && Number(added.after) === Number(removed.before));
    if (addedIndex === -1) return;
    const added = items[addedIndex];
    const from = splitItemLabel(removed.label);
    const to = splitItemLabel(added.label);
    if (!from.variant || !to.variant) return;
    used.add(removedIndex);
    used.add(addedIndex);
    merged.push({
      type: "item_variant_changed",
      item_key: added.item_key,
      label: to.base || from.base,
      before: from.variant,
      after: to.variant,
      quantity: Number(added.after),
      amount_delta: (Number(added.amount_delta) || 0) + (Number(removed.amount_delta) || 0),
      addition_reason: added.addition_reason,
    });
  });
  return [...merged, ...items.filter((_, index) => !used.has(index))];
}

// Field edits sit inline on their own; alongside a status or item summary they move to the list below.
export function layoutActivityChanges(changes: ActivityChangeInput[] = []): ActivityChangeLayout {
  const grouped = groupActivityChanges(changes);
  let fields = discountIsReflectedInTotal(grouped.total, grouped.items, grouped.fields)
    ? []
    : discountIsExplainedByItems(grouped.total, grouped.items)
      ? grouped.fields.filter((field) => field.field !== "discount")
      : grouped.fields;
  if (subtotalIsExplainedByItems(fields, grouped.items)) fields = fields.filter((field) => field.field !== "subtotal");
  grouped.items = mergeVariantSwaps(grouped.items);
  const hasHeadline = Boolean(grouped.status || grouped.total || grouped.items.length);
  return {
    ...grouped,
    fields,
    inlineFields: hasHeadline ? [] : fields,
    listFields: hasHeadline ? fields : [],
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
