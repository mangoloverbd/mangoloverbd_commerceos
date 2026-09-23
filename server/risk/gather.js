import { readIdentityCounts } from "./links.js";
import { findListHits } from "./store.js";

const emptyCounts = () => ({
  links: { devicePhones7d: 0, phoneDevices7d: 0, deviceNetworks1h: 0, networkPhones24h: 0 },
  attempts: { phone15m: 0, phone24h: 0, device15m: 0 },
});
const emptyHistory = () => ({ phoneDelivered: 0, phoneFakeCancelled: 0, deviceDelivered: 0, deviceFakeCancelled: 0 });

async function data(query) {
  const { data: rows, error } = await query;
  if (error) throw error;
  return rows || [];
}

async function loadHistory(supabase, ctx) {
  const phoneOrders = await data(supabase.from("orders")
    .select("id, courier_status, status, cancellation_reason_code").eq("org_id", ctx.orgId).eq("phone", ctx.customer.phone).limit(100));
  const deviceRows = ctx.hashes.device || ctx.hashes.fingerprint
    ? await data(supabase.from("order_risk_attempts").select("order_id").eq("org_id", ctx.orgId)
      .or([ctx.hashes.device && `device_hash.eq.${ctx.hashes.device}`, ctx.hashes.fingerprint && `fingerprint_hash.eq.${ctx.hashes.fingerprint}`].filter(Boolean).join(",")).limit(100))
    : [];
  const ids = [...new Set(deviceRows.map(row => row.order_id).filter(Boolean))];
  const deviceOrders = ids.length ? await data(supabase.from("orders")
    .select("id, courier_status, status, cancellation_reason_code").eq("org_id", ctx.orgId).in("id", ids).limit(100)) : [];
  const delivered = order => ["delivered", "delivered_approval_pending"].includes(String(order.courier_status || "").toLowerCase());
  const fake = order => String(order.status || "").toLowerCase() === "cancelled"
    && ["fraud_or_suspicious", "test_or_fake_order"].includes(order.cancellation_reason_code);
  return {
    phoneDelivered: phoneOrders.filter(delivered).length, phoneFakeCancelled: phoneOrders.filter(fake).length,
    deviceDelivered: deviceOrders.filter(delivered).length, deviceFakeCancelled: deviceOrders.filter(fake).length,
  };
}

async function courierFacts(fraudLookup, phone, timeoutMs) {
  if (typeof fraudLookup !== "function") return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const value = await Promise.race([
      fraudLookup(phone, { signal: controller.signal }),
      new Promise((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true })),
    ]);
    if (!value || !Number.isInteger(value.totalParcels) || value.totalParcels < 0 || !Number.isFinite(value.successRate) || value.successRate < 0 || value.successRate > 100) return null;
    return { totalParcels: value.totalParcels, successRate: value.successRate };
  } finally { clearTimeout(timeout); }
}

export async function gatherRiskFacts(ctx, { redis, supabase, fraudLookup, fraudTimeoutMs = 2000 }) {
  const tasks = [
    Promise.resolve().then(() => readIdentityCounts(redis, ctx)),
    Promise.resolve().then(() => loadHistory(supabase, ctx)),
    Promise.resolve().then(() => findListHits(supabase, { orgId: ctx.orgId, hashes: ctx.hashes })),
    Promise.resolve().then(() => courierFacts(fraudLookup, ctx.customer.phone, fraudTimeoutMs)),
  ];
  const [counts, history, lists, courier] = await Promise.allSettled(tasks);
  const unavailable = [];
  if (counts.status === "rejected") unavailable.push("redis");
  if (history.status === "rejected" || lists.status === "rejected") unavailable.push("supabase");
  if (courier.status === "rejected") unavailable.push("fraudshield");
  const countData = counts.status === "fulfilled" ? counts.value : emptyCounts();
  return {
    ...countData,
    history: history.status === "fulfilled" ? history.value : emptyHistory(),
    lists: lists.status === "fulfilled" ? lists.value : { block: [], allow: [] },
    courier: courier.status === "fulfilled" ? courier.value : null,
    unavailable,
  };
}
