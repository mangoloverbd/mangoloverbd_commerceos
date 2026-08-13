import { computeOrderCogs } from "./cog.js";
import { normalizeCustomerPhone } from "./customers.js";

function toDayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(start, end) {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
}

function classifyCourierStatus(status) {
  const s = (status || "").toLowerCase();
  if (s === "delivered" || s === "partial_delivered") return "delivered";
  if (s === "returned" || s === "cancelled" || s === "rejected") return "failed";
  if (s === "pending" || s === "processing") return "pending";
  return "in_transit";
}

function customerKey(order) {
  const phone = normalizeCustomerPhone(order.phone);
  const name = String(order.customer_name || "").trim().toLowerCase();
  if (phone) return `phone:${phone}`;
  if (name) return `name:${name}`;
  return "";
}

export function buildOverviewData(orders, products, socialConversations, socialMessages, { since, until, prevSince, prevUntil, now = new Date() }) {
  const dayCount = daysBetween(since, until);
  const prevDayCount = prevSince && prevUntil ? daysBetween(prevSince, prevUntil) : dayCount;

  const currentOrders = (orders || []).filter((o) => {
    const day = toDayKey(o.created_at);
    return day >= since && day <= until;
  });
  const prevOrders = (orders || []).filter((o) => {
    const day = toDayKey(o.created_at);
    return day >= prevSince && day <= prevUntil;
  });

  const currentCogResult = computeOrderCogs(currentOrders, products || []);
  const prevCogResult = computeOrderCogs(prevOrders, products || []);

  const sumRevenue = (os) => os.reduce((s, o) => s + (parseFloat(o.price || 0) + parseFloat(o.delivery_rate || 0)), 0);
  const sumShipping = (os) => os.reduce((s, o) => s + parseFloat(o.delivery_rate || 0), 0);

  const currentRevenue = sumRevenue(currentOrders);
  const prevRevenue = sumRevenue(prevOrders);
  const currentProfit = currentRevenue - currentCogResult.totalCog - sumShipping(currentOrders);
  const prevProfit = prevRevenue - prevCogResult.totalCog - sumShipping(prevOrders);

  const profitMargin = currentRevenue > 0 ? (currentProfit / currentRevenue) * 100 : 0;
  const prevProfitMargin = prevRevenue > 0 ? (prevProfit / prevRevenue) * 100 : 0;

  const courierStatusCounts = (os) => {
    const counts = { delivered: 0, failed: 0, in_transit: 0, pending: 0 };
    for (const o of os) {
      const cls = classifyCourierStatus(o.courier_status);
      counts[cls] = (counts[cls] || 0) + 1;
    }
    return counts;
  };
  const currentCourier = courierStatusCounts(currentOrders);
  const prevCourier = courierStatusCounts(prevOrders);
  const currentDelivered = currentCourier.delivered;
  const currentFailed = currentCourier.failed;
  const deliverySuccess = currentDelivered + currentFailed > 0 ? (currentDelivered / (currentDelivered + currentFailed)) * 100 : 0;
  const prevDelivered = prevCourier.delivered;
  const prevFailed = prevCourier.failed;
  const prevDeliverySuccess = prevDelivered + prevFailed > 0 ? (prevDelivered / (prevDelivered + prevFailed)) * 100 : 0;

  const totalUnread = (socialConversations || []).reduce((s, c) => s + (c.unread_count || 0), 0);
  const todayKey = toDayKey(now);
  const yesterdayKey = addDaysYmd(todayKey, -1);
  const yesterdayConvs = (socialConversations || []).filter((c) => toDayKey(c.created_at) === yesterdayKey);
  const yesterdayUnread = yesterdayConvs.reduce((s, c) => s + (c.unread_count || 0), 0);

  const trend = (cur, prev) => {
    if (prev === 0) return cur > 0 ? 100 : 0;
    return ((cur - prev) / prev) * 100;
  };

  const kpis = {
    totalOrders: { value: currentOrders.length, trend: trend(currentOrders.length, prevOrders.length), previousValue: prevOrders.length },
    revenue: { value: Math.round(currentRevenue), trend: trend(currentRevenue, prevRevenue), previousValue: Math.round(prevRevenue) },
    profitMargin: { value: Math.round(profitMargin * 10) / 10, trend: trend(profitMargin, prevProfitMargin), previousValue: Math.round(prevProfitMargin * 10) / 10 },
    deliverySuccess: { value: Math.round(deliverySuccess * 10) / 10, trend: trend(deliverySuccess, prevDeliverySuccess), previousValue: Math.round(prevDeliverySuccess * 10) / 10 },
    unreadMessages: { value: totalUnread, trend: yesterdayUnread > 0 ? trend(totalUnread, yesterdayUnread) : 0, previousValue: yesterdayUnread },
  };

  const orderVolumeSeries = [];
  for (let i = 0; i < dayCount; i++) {
    const day = addDaysYmd(since, i);
    const prevDay = addDaysYmd(prevSince, i);
    const current = currentOrders.filter((o) => toDayKey(o.created_at) === day).length;
    const previous = prevOrders.filter((o) => toDayKey(o.created_at) === prevDay).length;
    orderVolumeSeries.push({ date: day, current, previous });
  }

  const revenueSeries = [];
  for (let i = 0; i < dayCount; i++) {
    const day = addDaysYmd(since, i);
    const dayOrders = currentOrders.filter((o) => toDayKey(o.created_at) === day);
    const dayCog = computeOrderCogs(dayOrders, products || []);
    const revenue = sumRevenue(dayOrders);
    const shipping = sumShipping(dayOrders);
    const cog = dayCog.totalCog;
    const profit = revenue - cog - shipping;
    revenueSeries.push({ date: day, revenue: Math.round(revenue), cog: Math.round(cog), shipping: Math.round(shipping), profit: Math.round(profit) });
  }

  const courierPerformance = {};
  const courierNames = new Set(currentOrders.map((o) => o.courier_name).filter(Boolean));
  for (const name of courierNames) {
    const courierOrders = currentOrders.filter((o) => o.courier_name === name);
    const counts = courierStatusCounts(courierOrders);
    courierPerformance[name.toLowerCase()] = counts;
  }

  const byChannel = {};
  for (const conv of socialConversations || []) {
    const p = conv.platform || "unknown";
    byChannel[p] = (byChannel[p] || 0) + 1;
  }
  const todayConvs = (socialConversations || []).filter((c) => toDayKey(c.created_at) === todayKey);
  const socialInbox = {
    unread: totalUnread,
    avgResponseTimeMinutes: 0,
    conversationsToday: todayConvs.length,
    byChannel,
  };

  const customerOrders = new Map();
  for (const o of currentOrders) {
    const key = customerKey(o);
    if (!key) continue;
    const existing = customerOrders.get(key) || { name: o.customer_name || "", phone: o.phone || "", count: 0, spent: 0 };
    existing.count += 1;
    existing.spent += parseFloat(o.price || 0) + parseFloat(o.delivery_rate || 0);
    customerOrders.set(key, existing);
  }
  const totalCustomers = customerOrders.size;
  const repeatCustomers = Array.from(customerOrders.values()).filter((c) => c.count >= 2).length;
  const repeatRate = totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0;
  const topCustomers = Array.from(customerOrders.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((c) => ({ name: c.name, phone: c.phone, orderCount: c.count, totalSpent: Math.round(c.spent) }));

  const customerRetention = {
    repeatRate: Math.round(repeatRate * 10) / 10,
    repeatCustomers,
    totalCustomers,
    topCustomers,
  };

  return { kpis, orderVolumeSeries, revenueSeries, courierPerformance, socialInbox, customerRetention };
}
