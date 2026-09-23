import { CLIENT_CONTEXT_HEADER, verifyClientContext } from "../clientContext.js";
import { createProtectionReview } from "../orderProtectionStore.js";
import { verifyTurnstileToken } from "../turnstile.js";
import { buildRiskContext } from "./context.js";
import { decideRisk } from "./decide.js";
import { detectSignals } from "./detect.js";
import { gatherRiskFacts } from "./gather.js";
import { recordIdentityLinks } from "./links.js";
import { resolveProtectionMode } from "./mode.js";
import { insertRiskAttempt, linkAttemptToOrder, linkAttemptToReview } from "./store.js";

const DEFAULT_DISTRICTS = ["15", "16", "18", "19"];
const retryable = mode => ({ mode, decision: "BLOCK", score: 0, signals: [], reasons: ["configuration_unavailable"], attemptId: null, reviewId: null, enforced: true, retryable: true, ctx: null });
const summarizeAgent = value => {
  if (!value) return null;
  const browser = /Edg\//.test(value) ? "Edge" : /Chrome\//.test(value) ? "Chrome" : /Firefox\//.test(value) ? "Firefox" : /Safari\//.test(value) ? "Safari" : "Other browser";
  const system = /Android/.test(value) ? "Android" : /iPhone|iPad/.test(value) ? "iOS" : /Windows/.test(value) ? "Windows" : /Mac OS/.test(value) ? "macOS" : "Other system";
  return `${browser} · ${system}`;
};
const setting = async (deps, key) => typeof deps.getSetting === "function" ? deps.getSetting(key) : null;
function parseList(value, fallback) {
  try { const parsed = typeof value === "string" ? JSON.parse(value) : value; return Array.isArray(parsed) ? parsed : fallback; }
  catch { return fallback; }
}

export async function assessOrderRisk({ orgId, route, body, headers = {}, requestIp, deps = {} }) {
  const mode = resolveProtectionMode({ envMode: deps.envMode ?? process.env.ORDER_PROTECTION_MODE, settingMode: await setting(deps, `${orgId}:order_protection_mode`) });
  if (mode === "off") return { mode, decision: "ALLOW", score: 0, signals: [], reasons: [], attemptId: null, reviewId: null, enforced: false, ctx: null };
  if (typeof deps.secret !== "string" || deps.secret.length < 16) return retryable(mode);
  const verified = verifyClientContext(headers[CLIENT_CONTEXT_HEADER], { secret: deps.contextSecret });
  const contextTrusted = verified.ok;
  const clientContext = contextTrusted ? verified.context : null;
  const turnstile = typeof deps.verifyTurnstile === "function"
    ? await deps.verifyTurnstile({ token: body?.turnstileToken || body?.turnstile_token, remoteIp: clientContext?.ip || requestIp })
    : await verifyTurnstileToken({ token: body?.turnstileToken || body?.turnstile_token, remoteIp: clientContext?.ip || requestIp, secret: deps.turnstileSecret });
  const ctx = buildRiskContext({ orgId, route, body, clientContext, contextTrusted, secret: deps.secret, turnstile: turnstile?.unconfigured ? "unconfigured" : turnstile?.unavailable ? "unavailable" : turnstile?.ok ? "ok" : body?.turnstileToken || body?.turnstile_token ? "failed" : "missing" });
  let linkUnavailable = false;
  try { await recordIdentityLinks(deps.redis, ctx); }
  catch { linkUnavailable = true; }
  const facts = await gatherRiskFacts(ctx, { redis: deps.redis, supabase: deps.supabase, fraudLookup: deps.fraudLookup });
  const haterDistrictIds = parseList(await setting(deps, `${orgId}:order_protection_hater_districts`), DEFAULT_DISTRICTS);
  const extraAbuseTerms = parseList(await setting(deps, `${orgId}:order_protection_extra_abuse_terms`), []);
  const signals = detectSignals(ctx, facts, { haterDistrictIds, extraAbuseTerms });
  const assessment = decideRisk({ signals, contextTrusted, dependencyUnavailable: linkUnavailable || facts.unavailable.some(name => name !== "fraudshield") });
  const row = {
    org_id: orgId, route, mode, decision: assessment.decision, score: assessment.score,
    signals: assessment.signals, reasons: assessment.reasons,
    customer_name: ctx.customer.name, phone: ctx.customer.phone, address: ctx.customer.address,
    items: ctx.items, context_trusted: ctx.contextTrusted,
    phone_hash: ctx.hashes.phone, device_hash: ctx.hashes.device, fingerprint_hash: ctx.hashes.fingerprint,
    network_hash: ctx.hashes.network, ip_hash: ctx.hashes.ip, user_agent_hash: ctx.hashes.userAgent,
    ip_prefix: ctx.networkKey, network_type: ctx.network.type,
    geo_city: ctx.geo.city, geo_region: ctx.geo.region, geo_country: ctx.geo.country,
    user_agent_summary: summarizeAgent(ctx.userAgent),
  };
  let attemptId = null;
  try { attemptId = (await insertRiskAttempt(deps.supabase, row))?.id || null; }
  catch {
    if (mode === "active") return { ...retryable(mode), reasons: ["attempt_persistence_unavailable"], ctx };
  }
  if (mode === "shadow") return { mode, decision: assessment.decision, assessedDecision: assessment.decision, score: assessment.score, signals, reasons: assessment.reasons, attemptId, reviewId: null, enforced: false, ctx };
  let reviewId = null;
  if (assessment.decision === "HOLD") {
    try {
      const review = { orgId, route, customerName: ctx.customer.name, phone: ctx.customer.phone, address: ctx.customer.address, notes: ctx.customer.notes, items: ctx.items, shippingZoneId: body.shippingZoneId || body.shipping_zone_id, score: assessment.score, reasonCodes: signals.map(signal => signal.code) };
      const created = typeof deps.createReview === "function" ? await deps.createReview(review) : await createProtectionReview({ supabase: deps.supabase, review });
      reviewId = created?.id || null;
      if (!reviewId) throw new Error("Missing review id");
      if (attemptId) {
        try { await linkAttemptToReview(deps.supabase, { orgId, attemptId, reviewId }); }
        catch { console.warn("[OrderRisk] review attempt link failed"); }
      }
    } catch { return { ...retryable(mode), reasons: ["review_persistence_unavailable"], attemptId, ctx }; }
  }
  return { mode, decision: assessment.decision, score: assessment.score, signals, reasons: assessment.reasons, attemptId, reviewId, enforced: true, ctx };
}

export async function finalizeOrderRisk({ supabase, orgId, attemptId, orderId }) {
  if (!attemptId) return null;
  try { return await linkAttemptToOrder(supabase, { orgId, attemptId, orderId }); }
  catch { console.warn("[OrderRisk] order attempt link failed"); return null; }
}
