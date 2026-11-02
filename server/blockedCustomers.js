import { hashProtectionSignal } from "./orderProtectionStore.js";

// Staff-maintained block list (public.blocked_customers). Checked on every
// website order, independent of Order Protection mode.

export const BLOCK_KINDS = Object.freeze(["phone", "device"]);

// The HMAC device code saved on orders and matched against the block list.
// Null when the storefront sent no verified device or the secret is missing.
export function deviceHashFromContext(clientContext, secret = process.env.ORDER_PROTECTION_HASH_SECRET) {
  const deviceId = clientContext?.deviceId;
  if (typeof deviceId !== "string" || !deviceId || typeof secret !== "string" || secret.length < 16) return null;
  return hashProtectionSignal(deviceId, secret);
}

// Returns true when the phone or device is blocked. A lookup failure lets the
// order through: a broken block list must never cost a genuine customer.
export async function isBlockedCustomer(supabase, { orgId, phone, deviceHash }) {
  if (!orgId || (!phone && !deviceHash)) return false;
  const filters = [];
  if (phone) filters.push(`phone.eq.${phone}`);
  if (deviceHash) filters.push(`device_hash.eq.${deviceHash}`);
  try {
    const { data, error } = await supabase.from("blocked_customers").select("id")
      .eq("org_id", orgId).or(filters.join(",")).limit(1);
    if (error) throw error;
    return Boolean(data?.length);
  } catch {
    console.warn("[BlockedCustomers] lookup failed; order allowed");
    return false;
  }
}

// Which of an order's identities are blocked: { phone: bool, device: bool }.
export async function orderBlockStatus(supabase, { orgId, order }) {
  const status = { phone: false, device: false };
  const filters = [];
  if (order.phone) filters.push(`phone.eq.${order.phone}`);
  if (order.device_hash) filters.push(`device_hash.eq.${order.device_hash}`);
  if (!filters.length) return status;
  const { data, error } = await supabase.from("blocked_customers").select("phone, device_hash")
    .eq("org_id", orgId).or(filters.join(","));
  if (error) throw error;
  for (const row of data || []) {
    if (order.phone && row.phone === order.phone) status.phone = true;
    if (order.device_hash && row.device_hash === order.device_hash) status.device = true;
  }
  return status;
}

export async function blockOrderIdentity(supabase, { orgId, order, kind, userId }) {
  const row = kind === "phone"
    ? { org_id: orgId, phone: order.phone, note: `Blocked from order ${order.order_number ?? ""}`.trim(), source_order_id: order.id, created_by: userId }
    : { org_id: orgId, device_hash: order.device_hash, note: `Blocked from order ${order.order_number ?? ""}`.trim(), source_order_id: order.id, created_by: userId };
  const conflict = kind === "phone" ? "org_id,phone" : "org_id,device_hash";
  const { error } = await supabase.from("blocked_customers").upsert(row, { onConflict: conflict, ignoreDuplicates: true });
  if (error) throw error;
}

export async function unblockOrderIdentity(supabase, { orgId, order, kind }) {
  const query = supabase.from("blocked_customers").delete().eq("org_id", orgId);
  const { error } = kind === "phone" ? await query.eq("phone", order.phone) : await query.eq("device_hash", order.device_hash);
  if (error) throw error;
}
