export function normalizeCustomerPhone(phone) {
  let clean = String(phone || "").replace(/\D/g, "");
  if (clean.startsWith("880")) clean = `0${clean.slice(3)}`;
  if (clean.length === 10 && clean.startsWith("1")) clean = `0${clean}`;
  return /^01\d{9}$/.test(clean) ? clean : "";
}

export function detectCustomerOrderSource(row, tableKind) {
  const source = String(row?.source || "").toLowerCase();
  if (tableKind === "social") {
    if (["facebook", "instagram", "whatsapp"].includes(source)) return source;
    return "social_inbox";
  }
  if (["custom_store", "custom_website", "webhook"].includes(source)) return "custom_website";
  if (source === "shopify") return "shopify";
  if (Number(row?.shopify_order_id) > 0) return "shopify";
  return "manual";
}

function toNumber(value) {
  const n = Number(String(value ?? "0").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseInboxPhone(order) {
  const direct = normalizeCustomerPhone(order?.phone);
  if (direct) return direct;
  const match = String(order?.notes || "").match(/Phone:\s*([^\n,]+)/i);
  return normalizeCustomerPhone(match?.[1]);
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

function sourceRank(source) {
  return { custom_website: 4, shopify: 3, whatsapp: 2, facebook: 2, instagram: 2, social_inbox: 1, manual: 0 }[source] ?? 0;
}

function addTimeline(customer, entry) {
  customer.timeline.push(entry);
  customer.timeline.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  customer.lastOrderAt = customer.timeline[0]?.createdAt || customer.lastOrderAt;
}

export function buildCustomers({ orders = [], inboxOrders = [], now = new Date() } = {}) {
  const byKey = new Map();

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
        segments: [],
        timeline: [],
      });
    }
    return byKey.get(key);
  };

  for (const order of orders) {
    const phone = normalizeCustomerPhone(order?.phone);
    const name = String(order?.customer_name || "").trim();
    const key = phone || `name:${name.toLowerCase() || order?.id || order?.order_number}`;
    const source = detectCustomerOrderSource(order, "order");
    const customer = getCustomer(key, name, phone, source);
    if (name) customer.name = name;
    if (phone) customer.phone = phone;
    if (!customer.sources.includes(source)) customer.sources.push(source);
    if (sourceRank(source) >= sourceRank(customer.primarySource)) customer.primarySource = source;
    customer.totalOrders += 1;
    customer.totalSpent += toNumber(order?.price);
    if (String(order?.status || "").toLowerCase() === "cancelled") customer.cancelledOrders += 1;
    if (String(order?.return_status || "").toLowerCase() && String(order?.return_status || "").toLowerCase() !== "none") customer.returnedOrders += 1;
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
    const key = phone || `social:${name.toLowerCase() || order?.id}`;
    const source = detectCustomerOrderSource(order, "social");
    const customer = getCustomer(key, name, phone, source);
    if (name) customer.name = name;
    if (phone) customer.phone = phone;
    if (!customer.sources.includes(source)) customer.sources.push(source);
    if (sourceRank(source) >= sourceRank(customer.primarySource)) customer.primarySource = source;
    customer.totalOrders += 1;
    customer.totalSpent += toNumber(order?.total_price);
    if (String(order?.status || "").toLowerCase() === "cancelled") customer.cancelledOrders += 1;
    if (String(order?.return_status || "").toLowerCase() && String(order?.return_status || "").toLowerCase() !== "none") customer.returnedOrders += 1;
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
    customer.averageOrderValue = customer.totalOrders ? Math.round(customer.totalSpent / customer.totalOrders) : 0;
    customer.riskLevel = riskLevelFor(customer);
    customer.daysSinceLastOrder = customer.lastOrderAt
      ? Math.max(0, Math.floor((nowTime - new Date(customer.lastOrderAt).getTime()) / 86_400_000))
      : null;
    customer.segments = segmentsFor(customer);
    return customer;
  }).sort((a, b) => new Date(b.lastOrderAt || 0).getTime() - new Date(a.lastOrderAt || 0).getTime());
}

export function summarizeCustomers(customers) {
  return {
    totalCustomers: customers.length,
    repeatBuyers: customers.filter((customer) => customer.segments.includes("repeat_buyer")).length,
    vipCustomers: customers.filter((customer) => customer.segments.includes("vip")).length,
    highRiskCustomers: customers.filter((customer) => customer.riskLevel === "high").length,
    customWebsiteCustomers: customers.filter((customer) => customer.sources.includes("custom_website")).length,
    shopifyCustomers: customers.filter((customer) => customer.sources.includes("shopify")).length,
  };
}
