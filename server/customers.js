import { customerKeyFor, normalizeCustomerPhone, parseInboxPhone } from "../shared/customerIdentity.js";
import { customerOrderOutcome } from "./customerOutcomes.js";
export { customerKeyFor, normalizeCustomerPhone, parseInboxPhone } from "../shared/customerIdentity.js";

export function customerPhoneCandidates(phone) {
  const normalized = normalizeCustomerPhone(phone);
  if (!normalized) return [];
  const international = `880${normalized.slice(1)}`;
  return [normalized, international, `+${international}`];
}

export function findCustomerOrderByPhone(orders, phone) {
  const normalized = normalizeCustomerPhone(phone);
  if (!normalized || !Array.isArray(orders)) return null;
  return orders.find((order) => normalizeCustomerPhone(order?.phone) === normalized) || null;
}

// Mirrors ORDER_SOURCE_OPTIONS in src/lib/orderSource.ts, the sources staff pick on the order form.
const ORDER_SOURCES = new Set(["website", "facebook", "instagram", "whatsapp", "phone", "telesales", "upsell", "manual_other"]);
const WEBSITE_SOURCE_ALIASES = new Set(["custom_store", "custom_website", "custom_website_tracker", "storefront", "storefront_review", "webhook", "website"]);
const SOCIAL_PLATFORMS = new Set(["facebook", "instagram", "whatsapp"]);

export function detectCustomerOrderSource(row, tableKind) {
  if (tableKind === "social") {
    const platform = String(row?.platform || row?.source || "").trim().toLowerCase();
    return SOCIAL_PLATFORMS.has(platform) ? platform : "manual_other";
  }
  const source = String(row?.source || "").trim().toLowerCase();
  if (WEBSITE_SOURCE_ALIASES.has(source)) return "website";
  return ORDER_SOURCES.has(source) ? source : "manual_other";
}

function toNumber(value) {
  const n = Number(String(value ?? "0").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatInboxItems(items) {
  if (Array.isArray(items)) {
    return items.map((item) => [item?.name, item?.quantity ? `x${item.quantity}` : ""].filter(Boolean).join(" ")).filter(Boolean).join(", ");
  }
  if (typeof items === "string") return items;
  return "";
}

function riskLevelFor({ totalOrders, cancelledOrders, returnedOrders }) {
  if (!totalOrders) return "low";
  const badRate = (cancelledOrders + returnedOrders) / totalOrders;
  if (badRate > 0.5 && totalOrders >= 2) return "high";
  if (badRate > 0) return "medium";
  return "low";
}

function segmentsFor(customer) {
  const segments = [];
  if (customer.totalOrders >= 2) segments.push("repeat_buyer");
  if (customer.totalSpent >= 10000) segments.push("vip");
  if (customer.riskLevel === "high") segments.push("high_risk");
  if (customer.daysSinceLastOrder != null && customer.daysSinceLastOrder >= 45) segments.push("inactive");
  if (!segments.length) segments.push("new_customer");
  return segments;
}

function lifecycleStageFor(customer) {
  if (customer.daysSinceLastOrder != null && customer.daysSinceLastOrder >= 45) return "dormant";
  if (customer.riskLevel === "high") return "risky";
  if (customer.totalSpent >= 10000) return "vip";
  if (customer.totalOrders >= 2) return "repeat";
  return "new";
}

function campaignSegmentsFor(customer) {
  const segments = [];
  if (customer.lifecycleStage === "dormant") segments.push("win_back");
  if (customer.totalSpent >= 10000) segments.push("vip_loyalty");
  if (customer.totalOrders >= 2) segments.push("repeat_upsell");
  if (customer.totalOrders === 1) segments.push("first_order_nurture");
  if (customer.riskLevel !== "low") segments.push("cod_guardrail");
  if (customer.riskLevel === "low" && customer.totalOrders >= 1) segments.push("review_request");
  if (customer.sources.some((source) => SOCIAL_PLATFORMS.has(source))) segments.push("social_retarget");
  if (customer.sources.includes("website")) segments.push("custom_site_retarget");
  return segments;
}

// The channel a customer used most; ties go to the channel of their latest order.
function primarySourceFor(timeline) {
  const counts = new Map();
  for (const entry of timeline) counts.set(entry.source, (counts.get(entry.source) || 0) + 1);
  let best = null;
  for (const entry of timeline) {
    if (best === null || counts.get(entry.source) > counts.get(best)) best = entry.source;
  }
  return best;
}

function addTimeline(customer, entry) {
  customer.timeline.push(entry);
}

export function buildCustomers({ orders = [], inboxOrders = [], now = new Date() } = {}) {
  const byKey = new Map();
  const nameDates = new Map();
  const updateName = (customer, name, createdAt) => {
    const date = Number.isFinite(Date.parse(createdAt)) ? Date.parse(createdAt) : 0;
    if (name && (!nameDates.has(customer.id) || date > nameDates.get(customer.id))) {
      customer.name = name;
      nameDates.set(customer.id, date);
    }
  };

  const getCustomer = (key, name, phone, source) => {
    if (!byKey.has(key)) {
      byKey.set(key, {
        id: key,
        name: name || "Unknown",
        phone,
        totalOrders: 0,
        totalSpent: 0,
        averageOrderValue: 0,
        cancelledOrders: 0,
        returnedOrders: 0,
        sources: [],
        primarySource: source,
        lastOrderAt: null,
        riskLevel: "low",
        lifecycleStage: "new",
        campaignSegments: [],
        segments: [],
        timeline: [],
      });
    }
    return byKey.get(key);
  };

  for (const order of orders) {
    const phone = normalizeCustomerPhone(order?.phone);
    const name = String(order?.customer_name || "").trim();
    const key = customerKeyFor(order, "order");
    const source = detectCustomerOrderSource(order, "order");
    const customer = getCustomer(key, name, phone, source);
    updateName(customer, name, order?.created_at);
    if (phone) customer.phone = phone;
    if (!customer.sources.includes(source)) customer.sources.push(source);
    customer.totalOrders += 1;
    customer.totalSpent += toNumber(order?.price);
    if (customerOrderOutcome(order) === "cancelled") customer.cancelledOrders += 1;
    if (customerOrderOutcome(order) === "returned") customer.returnedOrders += 1;
    addTimeline(customer, {
      id: order?.id,
      kind: "order",
      source,
      orderNumber: order?.order_number,
      product: order?.product || "",
      amount: toNumber(order?.price),
      status: order?.status || "pending",
      createdAt: order?.created_at || null,
    });
  }

  for (const order of inboxOrders) {
    const phone = parseInboxPhone(order);
    const name = String(order?.contact_name || order?.customer_name || "").trim();
    const key = customerKeyFor(order, "social");
    const source = detectCustomerOrderSource(order, "social");
    const customer = getCustomer(key, name, phone, source);
    updateName(customer, name, order?.created_at);
    if (phone) customer.phone = phone;
    if (!customer.sources.includes(source)) customer.sources.push(source);
    customer.totalOrders += 1;
    customer.totalSpent += toNumber(order?.total_price);
    if (customerOrderOutcome(order) === "cancelled") customer.cancelledOrders += 1;
    if (customerOrderOutcome(order) === "returned") customer.returnedOrders += 1;
    addTimeline(customer, {
      id: order?.id,
      kind: "social_order",
      source,
      orderNumber: order?.order_number || "",
      product: formatInboxItems(order?.items),
      amount: toNumber(order?.total_price),
      status: order?.status || "pending",
      createdAt: order?.created_at || null,
    });
  }

  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return Array.from(byKey.values()).map((customer) => {
    customer.timeline.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    customer.lastOrderAt = customer.timeline[0]?.createdAt || null;
    customer.primarySource = primarySourceFor(customer.timeline) || customer.primarySource;
    customer.averageOrderValue = customer.totalOrders ? Math.round(customer.totalSpent / customer.totalOrders) : 0;
    customer.riskLevel = riskLevelFor(customer);
    customer.daysSinceLastOrder = customer.lastOrderAt
      ? Math.max(0, Math.floor((nowTime - new Date(customer.lastOrderAt).getTime()) / 86_400_000))
      : null;
    customer.segments = segmentsFor(customer);
    customer.lifecycleStage = lifecycleStageFor(customer);
    customer.campaignSegments = campaignSegmentsFor(customer);
    return customer;
  }).sort((a, b) => new Date(b.lastOrderAt || 0).getTime() - new Date(a.lastOrderAt || 0).getTime());
}

export function summarizeCustomers(customers) {
  return {
    totalCustomers: customers.length,
    repeatBuyers: customers.filter((customer) => customer.segments.includes("repeat_buyer")).length,
    vipCustomers: customers.filter((customer) => customer.segments.includes("vip")).length,
    highRiskCustomers: customers.filter((customer) => customer.riskLevel === "high").length,
    websiteCustomers: customers.filter((customer) => customer.sources.includes("website")).length,
  };
}
