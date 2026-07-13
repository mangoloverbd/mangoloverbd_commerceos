import { normalizeCustomerPhone } from "./customers.js";

function toDayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function customerKey(order) {
  const phone = normalizeCustomerPhone(order.phone);
  const name = String(order.customer_name || "").trim().toLowerCase();
  if (phone) return `phone:${phone}`;
  if (name) return `name:${name}`;
  return "";
}

export function buildSalesTrend(orders, { now = new Date(), days = 365 } = {}) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = addDays(end, -(days - 1));
  const dayMap = new Map();

  for (let i = 0; i < days; i += 1) {
    const date = addDays(start, i).toISOString().slice(0, 10);
    dayMap.set(date, {
      date,
      totalRevenue: 0,
      newCustomerRevenue: 0,
      existingCustomerRevenue: 0,
      totalOrders: 0,
      newCustomerOrders: 0,
      existingCustomerOrders: 0,
      intensity: 0,
    });
  }

  const seenCustomers = new Set();
  const sortedOrders = [...(orders || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  for (const order of sortedOrders) {
    const date = toDayKey(order.created_at);
    const day = date ? dayMap.get(date) : null;
    const revenue = Number.parseFloat(order.price || order.cod_amount || 0) || 0;
    const key = customerKey(order);
    const isExisting = key && seenCustomers.has(key);

    if (!day) {
      if (key) seenCustomers.add(key);
      continue;
    }

    day.totalRevenue += revenue;
    day.totalOrders += 1;
    if (isExisting) {
      day.existingCustomerRevenue += revenue;
      day.existingCustomerOrders += 1;
    } else {
      day.newCustomerRevenue += revenue;
      day.newCustomerOrders += 1;
    }

    if (key) seenCustomers.add(key);
  }

  const maxRevenue = Math.max(...Array.from(dayMap.values()).map((day) => day.totalRevenue), 0);
  const trendDays = Array.from(dayMap.values()).map((day) => ({
    ...day,
    totalRevenue: Math.round(day.totalRevenue),
    newCustomerRevenue: Math.round(day.newCustomerRevenue),
    existingCustomerRevenue: Math.round(day.existingCustomerRevenue),
    intensity: maxRevenue > 0 && day.totalRevenue > 0 ? Math.max(1, Math.ceil((day.totalRevenue / maxRevenue) * 4)) : 0,
  }));

  return {
    totalRevenue: trendDays.reduce((sum, day) => sum + day.totalRevenue, 0),
    days: trendDays,
  };
}
