import { format } from "date-fns";

export type AbandonedCheckoutStatus = "open" | "contacted";

export type AbandonedCheckoutCartItem = {
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
};

export type AbandonedCheckout = {
  id: string;
  status: AbandonedCheckoutStatus;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  cart: AbandonedCheckoutCartItem[];
  subtotal: number | null;
  delivery_rate: number | null;
  total: number | null;
  source: string;
  source_path: string;
  campaign: Record<string, string>;
  contacted_at: string | null;
  created_at: string;
  updated_at: string;
  /** Set while this shopper's order is waiting in Order Protection. */
  protection_review_id?: string | null;
};

export type AbandonedCheckoutResolution = "dismissed" | "already_ordered" | "rejected_in_order_protection" | (string & {});

/** A checkout in the Dismissed list: GET /api/abandoned-checkouts/dismissed. */
export type DismissedAbandonedCheckout = Omit<AbandonedCheckout, "status"> & {
  status: "dismissed";
  resolved_at: string | null;
  resolution: AbandonedCheckoutResolution | null;
  /** Staff name from the latest dismiss event; null for automatic dismissals. */
  dismissed_by: string | null;
};

export type DismissedAbandonedCheckoutResponse = {
  checkouts: DismissedAbandonedCheckout[];
};

/** Order Protection rejections stay dismissed; everything else can be restored. */
export function isRestorableDismissedCheckout(checkout: Pick<DismissedAbandonedCheckout, "resolution">): boolean {
  return checkout.resolution !== "rejected_in_order_protection";
}

/** "Dismissed · 9 Nov, 3:15 PM · by Rahim", or why it was dismissed automatically. */
export function dismissedCheckoutLabel(checkout: Pick<DismissedAbandonedCheckout, "resolved_at" | "resolution" | "dismissed_by">): string {
  const date = checkout.resolved_at ? new Date(checkout.resolved_at) : null;
  const when = date && !Number.isNaN(date.getTime()) ? format(date, "d MMM, h:mm a") : null;
  if (checkout.resolution === "rejected_in_order_protection") {
    return ["Rejected in Order Protection", when].filter(Boolean).join(" · ");
  }
  const who = checkout.resolution === "already_ordered"
    ? "auto: already ordered"
    : checkout.dismissed_by ? `by ${checkout.dismissed_by}` : null;
  return ["Dismissed", when, who].filter(Boolean).join(" · ");
}

export function formatAbandonedCheckoutTotal(total: number | null) {
  return typeof total === "number" && Number.isFinite(total)
    ? `৳${total.toLocaleString("en-BD", { maximumFractionDigits: 0 })}`
    : "—";
}

export function formatAbandonedCheckoutCaptureTime(createdAt: string) {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? "Captured recently" : `Captured ${format(date, "d MMM, h:mm a")}`;
}

export type AbandonedCheckoutResponse = {
  checkouts: AbandonedCheckout[];
  activeCount: number;
};

export type AbandonedCheckoutConvertStatus = "pending" | "on_hold" | "approved";

export type AbandonedCheckoutConvertOverrides = {
  customer_name?: string;
  address?: string;
  hold_reason_code?: string | null;
  hold_reason_detail?: string | null;
  hold_until_date?: string | null;
};

const SOURCE_LABELS: Record<string, string> = {
  storefront: "Storefront checkout",
  sundarbans_honey: "Sundarbans Honey",
  kalojira_mixed: "Kalojira Mixed",
  homemade_pumpkin_bori: "Homemade Pumpkin Bori",
  honey_nut: "Honey Nut",
};

function normalizedPhone(phone: string | null | undefined) {
  const digits = String(phone || "").replace(/\D/g, "");
  return /^01\d{9}$/.test(digits) ? digits : null;
}

function normalizeSearchValue(value: string) {
  return value.trim().toLocaleLowerCase();
}

function formatTaka(amount: number | null) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "—";
  return `৳${amount.toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}

// The pumpkin bori page reused the Kalojira Mixed checkout, so its carts were
// stored as "kalojira_mixed". Name those by their contents instead.
const isPumpkinBoriCart = (cart: AbandonedCheckoutCartItem[]) =>
  cart.length > 0 && cart.every((item) => /pumpkin bori/i.test(item.productName));

export function abandonedCheckoutSourceLabel(source: string, cart: AbandonedCheckoutCartItem[] = []) {
  if (source === "kalojira_mixed" && isPumpkinBoriCart(cart)) return SOURCE_LABELS.homemade_pumpkin_bori;
  return SOURCE_LABELS[source] || "Checkout";
}

export function abandonedCheckoutCartSummary(cart: AbandonedCheckoutCartItem[]) {
  if (!cart.length) return "No cart details";
  return cart
    .map((item) => `${item.quantity} × ${item.productName}${item.variantName ? ` — ${item.variantName}` : ""}`)
    .join(", ");
}

export function matchesAbandonedCheckoutSearch(checkout: AbandonedCheckout, query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return true;

  const searchableFields = [
    checkout.customer_name,
    checkout.phone,
    checkout.address,
    abandonedCheckoutSourceLabel(checkout.source, checkout.cart),
    checkout.source_path,
    ...checkout.cart.flatMap((item) => [item.productName, item.variantName]),
  ];

  return searchableFields.some((value) => normalizeSearchValue(value || "").includes(normalizedQuery));
}

export function abandonedCheckoutTelHref(phone: string | null | undefined) {
  const normalized = normalizedPhone(phone);
  return normalized ? `tel:${normalized}` : null;
}

export function abandonedCheckoutWhatsAppHref(phone: string | null | undefined) {
  const normalized = normalizedPhone(phone);
  return normalized ? `https://wa.me/88${normalized}` : null;
}

export function abandonedCheckoutCopySummary(checkout: AbandonedCheckout) {
  return [
    "Abandoned checkout",
    `Source: ${abandonedCheckoutSourceLabel(checkout.source, checkout.cart)}`,
    `Name: ${checkout.customer_name || "Not provided"}`,
    `Phone: ${checkout.phone || "Not provided"}`,
    `Address: ${checkout.address || "Not provided"}`,
    `Cart: ${abandonedCheckoutCartSummary(checkout.cart)}`,
    `Estimated total: ${formatTaka(checkout.total)}`,
  ].join("\n");
}

export function computeAbandonedCheckoutTotals(
  cart: AbandonedCheckoutCartItem[],
  deliveryRate: number,
) {
  const round = (value: number) => Math.round(value * 100) / 100;
  const subtotal = round(cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  const rate = Number.isFinite(deliveryRate) ? deliveryRate : 0;
  return { subtotal, total: round(subtotal + rate) };
}
