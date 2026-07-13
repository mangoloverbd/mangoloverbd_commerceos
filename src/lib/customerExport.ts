type ExportCustomer = {
  name?: string;
  phone?: string;
  totalOrders?: number;
  totalSpent?: number;
  averageOrderValue?: number;
  primarySource?: string;
  sources?: string[];
  riskLevel?: string;
  lifecycleStage?: string;
  campaignSegments?: string[];
  lastOrderAt?: string | null;
};

const labelOverrides: Record<string, string> = {
  cod_guardrail: "COD Guardrail",
  custom_site_retarget: "Custom Site Retarget",
  custom_website: "Custom Website",
  facebook: "Facebook",
  first_order_nurture: "First Order Nurture",
  instagram: "Instagram",
  manual: "Manual",
  new: "New",
  repeat: "Repeat",
  repeat_upsell: "Repeat Upsell",
  review_request: "Review Request",
  risky: "Risky",
  shopify: "Shopify",
  social_inbox: "Social Inbox",
  social_retarget: "Social Retarget",
  vip: "VIP",
  vip_loyalty: "VIP Loyalty",
  whatsapp: "WhatsApp",
  win_back: "Win-back",
};

function label(value: string | undefined) {
  if (!value) return "";
  if (labelOverrides[value]) return labelOverrides[value];
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function money(value: number | undefined) {
  return `৳${Math.round(value || 0).toLocaleString("en-BD")}`;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-BD", { month: "short", day: "numeric", year: "numeric" });
}

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCustomerExportCsv(customers: ExportCustomer[]) {
  const header = ["Name", "Phone", "Lifecycle Stage", "Campaign Segments", "Primary Source", "Sources", "Orders", "Total Spent", "AOV", "Risk", "Last Order"];
  const rows = customers.map((customer) => [
    customer.name || "",
    customer.phone || "",
    label(customer.lifecycleStage),
    (customer.campaignSegments || []).map(label).join("; "),
    label(customer.primarySource),
    (customer.sources || []).map(label).join("; "),
    customer.totalOrders || 0,
    money(customer.totalSpent),
    money(customer.averageOrderValue),
    label(customer.riskLevel),
    dateLabel(customer.lastOrderAt),
  ]);

  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}
