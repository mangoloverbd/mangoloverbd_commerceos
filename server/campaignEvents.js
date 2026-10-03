import { createHmac, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 60_000;
const DEVICES = new Set(["mobile", "desktop", "tablet", "unknown"]);

export function campaignReceiptPayload(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export function signCampaignReceipt(value, secret) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("Invalid campaign receipt secret");
  const payload = campaignReceiptPayload(value);
  const signature = createHmac("sha256", secret).update(`campaign-receipt-v1:${payload}`).digest("hex");
  return `${payload}.${signature}`;
}

export function verifyCampaignReceipt(token, secret, { now = Date.now() } = {}) {
  if (typeof token !== "string" || token.length > 2048 || typeof secret !== "string" || secret.length < 32) return undefined;
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]{1,1800}$/.test(parts[0]) || !/^[a-f0-9]{64}$/.test(parts[1])) return undefined;
  const expected = createHmac("sha256", secret).update(`campaign-receipt-v1:${parts[0]}`).digest();
  if (!timingSafeEqual(Buffer.from(parts[1], "hex"), expected)) return undefined;
  try {
    const value = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (!value || value.v !== 1 || value.handle !== "mangoloverbd" || !UUID.test(value.linkId || "") || !UUID.test(value.clickId || "")
      || typeof value.clickedAt !== "string" || typeof value.isBot !== "boolean"
      || !(value.visitorHash === null || HASH.test(value.visitorHash))
      || !(value.referrerHost === null || (typeof value.referrerHost === "string" && value.referrerHost.length <= 253 && !/[\s/?#@]/.test(value.referrerHost)))
      || !DEVICES.has(value.device)) return undefined;
    const clickedAt = Date.parse(value.clickedAt);
    if (!Number.isFinite(clickedAt) || new Date(clickedAt).toISOString() !== value.clickedAt
      || clickedAt > now + MAX_FUTURE_MS || now - clickedAt > MAX_AGE_MS) return undefined;
    return value;
  } catch { return undefined; }
}

// Inserts are idempotent across queue retries and checkout races. A duplicate
// is accepted only after scoped read-back proves the complete key association.
export async function persistCampaignEvent(supabase, orgId, event, signal) {
  const row = { id: event.clickId, org_id: orgId, link_id: event.linkId, request_id: event.clickId,
    clicked_at: event.clickedAt, visitor_hash: event.visitorHash, referrer_host: event.referrerHost,
    device: event.device, is_bot: event.isBot };
  let insert = supabase.from("campaign_link_clicks").insert(row).select("id, org_id, link_id, request_id, clicked_at, is_bot");
  if (signal) insert = insert.abortSignal(signal);
  const { data, error } = await insert.single();
  if (!error) return data;
  if (error.code !== "23505") throw error;
  let lookup = supabase.from("campaign_link_clicks")
    .select("id, org_id, link_id, request_id, clicked_at, is_bot").eq("org_id", orgId).eq("request_id", event.clickId);
  if (signal) lookup = lookup.abortSignal(signal);
  const { data: existing, error: readError } = await lookup.maybeSingle();
  if (readError) throw readError;
  if (existing?.id === event.clickId && existing.org_id === orgId && existing.link_id === event.linkId && existing.request_id === event.clickId
    && Date.parse(existing.clicked_at) === Date.parse(event.clickedAt) && existing.is_bot === event.isBot) return existing;
  throw new Error("campaign_event_conflict");
}
