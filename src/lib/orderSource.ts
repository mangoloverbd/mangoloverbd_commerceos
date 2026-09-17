export const ORDER_SOURCE_OPTIONS = [
  { value: "website", label: "Website" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "phone", label: "Phone" },
  { value: "manual_other", label: "Manual / Other" },
] as const;

export type OrderSource = (typeof ORDER_SOURCE_OPTIONS)[number]["value"];

const SOURCE_LABELS: Record<OrderSource, string> = Object.fromEntries(
  ORDER_SOURCE_OPTIONS.map(({ value, label }) => [value, label]),
) as Record<OrderSource, string>;

export function normalizeOrderSource(value: string | null | undefined): OrderSource {
  const normalized = String(value || "").trim().toLowerCase();
  if (["custom_store", "custom_website", "custom_website_tracker", "storefront", "storefront_review", "webhook", "website"].includes(normalized)) return "website";
  if (ORDER_SOURCE_OPTIONS.some((option) => option.value === normalized)) return normalized as OrderSource;
  return "manual_other";
}

export function orderSourceLabel(value: string | null | undefined): string {
  return SOURCE_LABELS[normalizeOrderSource(value)];
}
