import type { ProtectionReview } from "@/lib/orderProtection";
import {
  abandonedCheckoutTelHref,
  abandonedCheckoutWhatsAppHref,
} from "@/lib/abandonedCheckouts";

export type ProtectionLineItem = {
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number | null;
};

type ProtectionItemLike = Record<string, unknown> | ProtectionLineItem;

const SOURCE_LABELS: Record<string, string> = {
  public_v1: "Storefront checkout",
  custom_webhook: "Storefront checkout",
};

function formatTaka(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `৳${value.toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}

export function normalizeProtectionItem(item: ProtectionItemLike): ProtectionLineItem {
  const productName = String(item.productName ?? item.product_name ?? "Product").trim() || "Product";
  const variantValue = item.variantName ?? item.variant_name;
  const variantName = typeof variantValue === "string" && variantValue.trim()
    ? variantValue.trim()
    : null;
  const quantityValue = Number(item.quantity);
  const quantity = Number.isInteger(quantityValue) && quantityValue > 0 ? quantityValue : 1;
  const priceValue = Number(item.unitPrice ?? item.unit_price);
  const unitPrice = Number.isFinite(priceValue) && priceValue >= 0 ? priceValue : null;

  return { productName, variantName, quantity, unitPrice };
}

export function formatProtectionItem(item: ProtectionItemLike) {
  const normalized = normalizeProtectionItem(item);
  const label = `${normalized.productName}${normalized.variantName ? ` — ${normalized.variantName}` : ""} × ${normalized.quantity}`;
  return normalized.unitPrice === null ? label : `${label} · ${formatTaka(normalized.unitPrice)}`;
}

export function formatProtectionItemLabel(item: ProtectionItemLike) {
  const normalized = normalizeProtectionItem(item);
  return `${normalized.productName}${normalized.variantName ? ` — ${normalized.variantName}` : ""} × ${normalized.quantity}`;
}

export function formatProtectionLinePrice(item: ProtectionItemLike) {
  const normalized = normalizeProtectionItem(item);
  return normalized.unitPrice === null ? null : formatTaka(normalized.unitPrice * normalized.quantity);
}

// Known signal codes arrive with labels from the server; older codes are tidied.
export function protectionReasonLabel(code: string, labels?: Record<string, string>) {
  const label = labels?.[code];
  if (label) return label;
  const words = code.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : code;
}

export function calculateProtectionTotal(items: ProtectionItemLike[]) {
  const normalizedItems = items.map(normalizeProtectionItem);
  if (normalizedItems.length === 0 || normalizedItems.some((item) => item.unitPrice === null)) return null;
  return normalizedItems.reduce((total, item) => total + (item.unitPrice || 0) * item.quantity, 0);
}

export function formatProtectionTotal(total: number | null) {
  return formatTaka(total);
}

export function protectionSourceLabel(sourceRoute: string) {
  return SOURCE_LABELS[sourceRoute] || "Checkout";
}

export function protectionTelHref(phone: string | null | undefined) {
  return abandonedCheckoutTelHref(phone);
}

export function protectionWhatsAppHref(phone: string | null | undefined) {
  return abandonedCheckoutWhatsAppHref(phone);
}

export function protectionCopySummary(review: ProtectionReview) {
  return [
    "Order protection review",
    `Source: ${protectionSourceLabel(review.source_route)}`,
    `Name: ${review.customer_name || "Not provided"}`,
    `Phone: ${review.phone || "Not provided"}`,
    `Address: ${review.address || "Not provided"}`,
    `Items: ${review.items.map(formatProtectionItem).join(", ") || "No cart details"}`,
    `Risk score: ${review.score}`,
    `Risk reasons: ${review.reason_codes.join(", ") || "None"}`,
    `Estimated total: ${formatProtectionTotal(calculateProtectionTotal(review.items))}`,
  ].join("\n");
}
