import crypto from "node:crypto";

const EVENT_TTL_SECONDS = 30 * 24 * 60 * 60;
const COUNTER_TTLS = Object.freeze({ last15m: 15 * 60, last1h: 60 * 60, last24h: 24 * 60 * 60 });

function requireSecret(secret) {
  if (typeof secret !== "string" || secret.length < 16) {
    throw new Error("ORDER_PROTECTION_HASH_SECRET must contain at least 16 characters");
  }
  return secret;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

export function hashProtectionSignal(value, secret) {
  return crypto.createHmac("sha256", requireSecret(secret)).update(String(value || "")).digest("hex");
}

export function buildSubmissionFingerprint(input, secret) {
  const canonical = stableValue({
    orgId: input.orgId,
    phone: input.phone,
    address: input.address,
    items: input.items,
  });
  return hashProtectionSignal(JSON.stringify(canonical), secret);
}

export async function reserveSubmissionFingerprint({ redis, fingerprint, ttlSeconds = 15 * 60 }) {
  if (!redis || typeof redis.set !== "function") return { reserved: true, unavailable: true };
  const result = await redis.set(`op:duplicate:${fingerprint}`, "1", { nx: true, ex: ttlSeconds });
  return { reserved: result === "OK" || result === true };
}

export async function recordPhoneSignal({ redis, orgId, phoneHash, sessionHash, networkHash }) {
  if (!redis || typeof redis.incr !== "function") return { unavailable: true };
  const now = Date.now();
  const operations = Object.entries(COUNTER_TTLS).map(async ([window, ttl]) => {
    const key = `op:phone:${window}:${orgId}:${phoneHash}`;
    await redis.incr(key);
    if (typeof redis.expire === "function") await redis.expire(key, ttl);
  });
  await Promise.all(operations);

  if (sessionHash && typeof redis.sadd === "function") {
    await redis.sadd(`op:sessions:${orgId}:${phoneHash}`, sessionHash);
    if (typeof redis.expire === "function") await redis.expire(`op:sessions:${orgId}:${phoneHash}`, COUNTER_TTLS.last24h);
  }
  if (networkHash && typeof redis.sadd === "function") {
    await redis.sadd(`op:networks:${orgId}:${phoneHash}`, networkHash);
    if (typeof redis.expire === "function") await redis.expire(`op:networks:${orgId}:${phoneHash}`, COUNTER_TTLS.last24h);
  }
  return { recorded: true, recordedAt: now };
}

export async function countRecentPhoneSignals({ redis, orgId, phoneHash }) {
  if (!redis || typeof redis.get !== "function") return { unavailable: true };
  const entries = await Promise.all(Object.keys(COUNTER_TTLS).map(async (window) => [
    window,
    Number(await redis.get(`op:phone:${window}:${orgId}:${phoneHash}`)) || 0,
  ]));
  const sessions = typeof redis.scard === "function"
    ? Number(await redis.scard(`op:sessions:${orgId}:${phoneHash}`)) || 0
    : 0;
  const networks = typeof redis.scard === "function"
    ? Number(await redis.scard(`op:networks:${orgId}:${phoneHash}`)) || 0
    : 0;
  return { attempts: Object.fromEntries(entries), sessions, networks };
}

export async function recordProtectionEvent({ supabase, secret, event }) {
  const payload = {
    org_id: event.orgId,
    order_id: event.orderId || null,
    review_id: event.reviewId || null,
    route: event.route,
    decision: event.decision,
    score: event.score,
    reason_codes: event.reasonCodes,
    phone_hash: event.phone ? hashProtectionSignal(event.phone, secret) : null,
    session_hash: event.clientSessionId ? hashProtectionSignal(event.clientSessionId, secret) : null,
    ip_hash: event.ip ? hashProtectionSignal(event.ip, secret) : null,
    network_hash: event.network ? hashProtectionSignal(event.network, secret) : null,
    user_agent_hash: event.userAgent ? hashProtectionSignal(event.userAgent, secret) : null,
    created_at: event.createdAt || new Date().toISOString(),
    expires_at: event.expiresAt || new Date(Date.now() + EVENT_TTL_SECONDS * 1000).toISOString(),
  };
  const { error } = await supabase.from("order_protection_events").insert(payload);
  if (error) throw error;
  return payload;
}

export async function createProtectionReview({ supabase, review }) {
  const expiresAt = review.expiresAt || new Date(Date.now() + EVENT_TTL_SECONDS * 1000).toISOString();
  const payload = {
    org_id: review.orgId,
    status: "on_hold",
    source_route: review.route,
    customer_name: review.customerName || null,
    phone: review.phone || null,
    address: review.address || null,
    items: review.items || [],
    shipping_zone_id: review.shippingZoneId || null,
    notes: review.notes || null,
    score: review.score,
    reason_codes: review.reasonCodes,
    expires_at: expiresAt,
  };
  const { data, error } = await supabase
    .from("order_protection_reviews")
    .insert(payload)
    .select("id, status, expires_at")
    .single();
  if (error) throw error;
  return data;
}

export async function listProtectionReviews({ supabase, orgId, status = "on_hold" }) {
  const { data, error } = await supabase
    .from("order_protection_reviews")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", status)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function getProtectionReview({ supabase, orgId, reviewId }) {
  const { data, error } = await supabase
    .from("order_protection_reviews")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", reviewId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function scrubExpiredProtectionData({ supabase, now = new Date().toISOString() }) {
  const { data, error } = await supabase
    .from("order_protection_reviews")
    .update({
      status: "expired",
      customer_name: null,
      phone: null,
      address: null,
      items: [],
      shipping_zone_id: null,
      notes: null,
    })
    .lt("expires_at", now)
    .in("status", ["on_hold"])
    .select("id");
  if (error) throw error;
  return data?.length || 0;
}

