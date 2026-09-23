import { isIP } from "node:net";
import { normalizeBdPhone } from "../abandonedCheckouts.js";
import { hashProtectionSignal } from "../orderProtectionStore.js";
import { classifyNetwork, networkKey } from "./network.js";

const bounded = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
const digest = (value, secret) => value ? hashProtectionSignal(value, secret) : null;

export function buildRiskContext({ orgId, route, body, clientContext, contextTrusted, secret, now = Date.now(), turnstile = "unconfigured" }) {
  if (typeof secret !== "string" || secret.length < 16) throw new TypeError("Missing risk hash secret");
  if (typeof orgId !== "string" || !/^[0-9a-f-]{36}$/i.test(orgId) || !["public_v1", "custom_webhook"].includes(route)) throw new TypeError("Invalid risk scope");
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new TypeError("Invalid order body");
  const phone = normalizeBdPhone(body.phone);
  if (!phone || !/^01[3-9]\d{8}$/.test(phone)) throw new TypeError("Invalid BD phone");
  // The order route validates items authoritatively; risk only needs a bounded view.
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 100).filter(item => item && typeof item === "object");
  const trusted = Boolean(contextTrusted && clientContext);
  const ip = trusted && isIP(clientContext.ip) ? clientContext.ip : null;
  const deviceId = trusted && typeof clientContext.deviceId === "string" ? clientContext.deviceId : null;
  const fingerprint = trusted && /^[a-f0-9]{64}$/.test(clientContext.fingerprint) ? clientContext.fingerprint : null;
  const userAgent = trusted ? bounded(clientContext.userAgent, 400) || null : null;
  const key = ip ? networkKey(ip) : null;
  const geo = trusted ? {
    country: bounded(clientContext.geo?.country, 80) || null,
    region: bounded(clientContext.geo?.region, 80) || null,
    city: bounded(clientContext.geo?.city, 80) || null,
  } : { country: null, region: null, city: null };
  const candidates = trusted && Array.isArray(clientContext.telemetry?.phoneCandidates)
    ? [...new Set(clientContext.telemetry.phoneCandidates.slice(0, 5).map(normalizeBdPhone).filter(candidate => /^01[3-9]\d{8}$/.test(candidate || "")))] : [];
  const first = trusted && clientContext.telemetry?.firstInteractionAt ? Date.parse(clientContext.telemetry.firstInteractionAt) : NaN;
  const pasted = trusted && Array.isArray(clientContext.telemetry?.pastedFields)
    ? [...new Set(clientContext.telemetry.pastedFields.filter(field => ["name", "phone", "address"].includes(field)))].slice(0, 3) : [];
  return {
    orgId, route, now,
    customer: { name: bounded(body.customerName ?? body.customer_name, 120), phone, address: bounded(body.address, 500), notes: bounded(body.notes, 500) },
    items: items.map(item => {
      const quantity = Math.trunc(Number(item.quantity));
      return { productId: item.productId ?? item.product_id ?? null, variantId: item.variantId ?? item.variant_id ?? null, quantity: Number.isFinite(quantity) && quantity > 0 ? Math.min(quantity, 100000) : 1 };
    }),
    honeypot: bounded(body.website, 200), turnstile, contextTrusted: trusted,
    ip, networkKey: key, network: classifyNetwork({ ip, country: geo.country }), geo,
    deviceId, fingerprint, userAgent,
    telemetry: { firstInteractionAt: Number.isFinite(first) && first <= now ? first : null, phoneCandidates: candidates, pastedFields: pasted },
    hashes: { phone: digest(phone, secret), device: digest(deviceId, secret), fingerprint: digest(fingerprint, secret), network: digest(key, secret), ip: digest(ip, secret), userAgent: digest(userAgent, secret) },
  };
}
