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
};

export type AbandonedCheckoutResponse = {
  checkouts: AbandonedCheckout[];
  activeCount: number;
};

const SOURCE_LABELS: Record<string, string> = {
  storefront: "Storefront checkout",
  sundarbans_honey: "Sundarbans Honey",
  kalojira_mixed: "Kalojira Mixed",
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

export function abandonedCheckoutSourceLabel(source: string) {
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
    abandonedCheckoutSourceLabel(checkout.source),
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
    `Source: ${abandonedCheckoutSourceLabel(checkout.source)}`,
    `Name: ${checkout.customer_name || "Not provided"}`,
    `Phone: ${checkout.phone || "Not provided"}`,
    `Address: ${checkout.address || "Not provided"}`,
    `Cart: ${abandonedCheckoutCartSummary(checkout.cart)}`,
    `Estimated total: ${formatTaka(checkout.total)}`,
  ].join("\n");
}
