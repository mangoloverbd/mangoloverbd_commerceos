import { CLIENT_CONTEXT_HEADER, verifyClientContext } from "../clientContext.js";
import { createProtectionReview } from "../orderProtectionStore.js";
import { verifyTurnstileToken } from "../turnstile.js";
import { normalizeBdPhone } from "../abandonedCheckouts.js";
import { buildRiskContext } from "./context.js";
import { decideRisk } from "./decide.js";
import { detectSignals } from "./detect.js";
import { gatherRiskFacts } from "./gather.js";
import { recordIdentityLinks } from "./links.js";
import { resolveProtectionMode } from "./mode.js";
import { insertRiskAttempt, linkAttemptToOrder, linkAttemptToReview } from "./store.js";

const DEFAULT_DISTRICTS = ["15", "16", "18", "19"];
const summarizeAgent = value => {
  if (!value) return null;
  const browser = /Edg\//.test(value) ? "Edge" : /Chrome\//.test(value) ? "Chrome" : /Firefox\//.test(value) ? "Firefox" : /Safari\//.test(value) ? "Safari" : "Other browser";
  const system = /Android/.test(value) ? "Android" : /iPhone|iPad/.test(value) ? "iOS" : /Windows/.test(value) ? "Windows" : /Mac OS/.test(value) ? "macOS" : "Other system";
  return `${browser} · ${system}`;
};
const setting = async (deps, key) => {
  if (typeof deps.getSetting !== "function") return null;
  try { return await deps.getSetting(key); } catch { return null; }
};
function parseList(value, fallback) {
  try { const parsed = typeof value === "string" ? JSON.parse(value) : value; return Array.isArray(parsed) ? parsed : fallback; }
  catch { return fallback; }
}
const text = (value, max) => typeof value === "string" ? value.trim().slice(0, max) : "";
const outcome = (mode, decision, extra = {}) => ({
  mode, decision, score: 0, signals: [], reasons: [], attemptId: null, reviewId: null,
  enforced: mode === "active", ctx: null, ...extra,
});

// A hold is only returned when a staff review row exists. If the review cannot
// be written, the order proceeds normally rather than being lost.
async function createHold({ deps, orgId, route, body, customer, items, score, reasonCodes }) {
  try {
    const review = {
      orgId, route,
      customerName: customer?.name ?? text(body?.customerName ?? body?.customer_name, 120),
      phone: customer?.phone ?? (normalizeBdPhone(body?.phone) || text(body?.phone, 40)),
      address: customer?.address ?? text(body?.address, 500),
      notes: customer?.notes ?? text(body?.notes, 500),
      items: items ?? (Array.isArray(body?.items) ? body.items.slice(0, 100) : []),
      shippingZoneId: body?.shippingZoneId || body?.shipping_zone_id,
      score, reasonCodes,
    };
    const created = typeof deps.createReview === "function"
      ? await deps.createReview(review)
      : await createProtectionReview({ supabase: deps.supabase, review });
    return created?.id || null;
  } catch {
    console.warn("[OrderRisk] review creation failed; order will proceed");
    return null;
  }
}

export async function assessOrderRisk({ orgId, route, body, headers = {}, requestIp, deps = {} }) {
  const mode = resolveProtectionMode({ envMode: deps.envMode ?? process.env.ORDER_PROTECTION_MODE, settingMode: await setting(deps, `${orgId}:order_protection_mode`) });
  if (mode === "off") return outcome(mode, "ALLOW", { enforced: false });

  try {
    return await assess({ mode, orgId, route, body, headers, requestIp, deps });
  } catch {
    // An engine fault must never cost a customer their order.
    console.warn("[OrderRisk] assessment failed");
    return outcome(mode, "ALLOW", { reasons: ["engine_error"] });
  }
}

async function assess({ mode, orgId, route, body, headers, requestIp, deps }) {
  if (typeof deps.secret !== "string" || deps.secret.length < 16) {
    console.warn("[OrderRisk] ORDER_PROTECTION_HASH_SECRET is not configured");
    throw new Error("Risk hash secret missing");
  }
  const verified = verifyClientContext(headers?.[CLIENT_CONTEXT_HEADER], { secret: deps.contextSecret });
  const contextTrusted = verified.ok;
  const clientContext = contextTrusted ? verified.context : null;
  const token = body?.turnstileToken || body?.turnstile_token;
  let turnstile;
  try {
    turnstile = typeof deps.verifyTurnstile === "function"
      ? await deps.verifyTurnstile({ token, remoteIp: clientContext?.ip || requestIp })
      : await verifyTurnstileToken({ token, remoteIp: clientContext?.ip || requestIp, secret: deps.turnstileSecret });
  } catch { turnstile = { ok: false, unavailable: true }; }
  const turnstileState = turnstile?.unconfigured ? "unconfigured" : turnstile?.unavailable ? "unavailable" : turnstile?.ok ? "ok" : token ? "failed" : "missing";
  const ctx = buildRiskContext({ orgId, route, body, clientContext, contextTrusted, secret: deps.secret, turnstile: turnstileState });

  let linkUnavailable = false;
  try { await recordIdentityLinks(deps.redis, ctx); }
  catch { linkUnavailable = true; }
  const facts = await gatherRiskFacts(ctx, { redis: deps.redis, supabase: deps.supabase, fraudLookup: deps.fraudLookup });
  const haterDistrictIds = parseList(await setting(deps, `${orgId}:order_protection_hater_districts`), DEFAULT_DISTRICTS);
  const extraAbuseTerms = parseList(await setting(deps, `${orgId}:order_protection_extra_abuse_terms`), []);
  const signals = detectSignals(ctx, facts, { haterDistrictIds, extraAbuseTerms });
  // The custom webhook is authenticated with a server API key and cannot carry
  // browser context, so a missing context only holds public storefront orders.
  const assessment = decideRisk({ signals, contextTrusted: contextTrusted || route === "custom_webhook", dependencyUnavailable: linkUnavailable || facts.unavailable.some(name => name !== "fraudshield") });
  const row = {
    org_id: orgId, route, mode, decision: route === "custom_webhook" && mode === "active" ? "ALLOW" : assessment.decision, score: assessment.score,
    signals: assessment.signals, reasons: route === "custom_webhook" && mode === "active" && assessment.decision !== "ALLOW"
      ? [...assessment.reasons, "webhook_review_unsupported"] : assessment.reasons,
    customer_name: ctx.customer.name, phone: ctx.customer.phone, address: ctx.customer.address,
    items: ctx.items, context_trusted: ctx.contextTrusted,
    phone_hash: ctx.hashes.phone, device_hash: ctx.hashes.device, fingerprint_hash: ctx.hashes.fingerprint,
    network_hash: ctx.hashes.network, ip_hash: ctx.hashes.ip, user_agent_hash: ctx.hashes.userAgent,
    ip_prefix: ctx.networkKey, network_type: ctx.network.type,
    geo_city: ctx.geo.city, geo_region: ctx.geo.region, geo_country: ctx.geo.country,
    user_agent_summary: summarizeAgent(ctx.userAgent),
  };
  let attemptId = null;
  // The attempt row is an audit record; failing to write it never changes the decision.
  try { attemptId = (await insertRiskAttempt(deps.supabase, row))?.id || null; }
  catch { console.warn("[OrderRisk] attempt log unavailable"); }

  const base = { mode, score: assessment.score, signals, reasons: assessment.reasons, attemptId, assessedDecision: assessment.decision, ctx };
  if (mode === "shadow") {
    // Staff rehearse on real would-be holds: a review row is created so the
    // Reviews tab shows it, but the order still proceeds normally. Approving
    // such a review links to the already-placed order (see
    // approveHeldProtectionReview) and never creates a duplicate.
    if (assessment.decision === "HOLD" && route !== "custom_webhook") {
      const reviewId = await createHold({ deps, orgId, route, body, customer: ctx.customer, items: ctx.items, score: assessment.score, reasonCodes: signals.map(signal => signal.code) });
      if (reviewId) {
        if (attemptId) {
          try { await linkAttemptToReview(deps.supabase, { orgId, attemptId, reviewId }); }
          catch { console.warn("[OrderRisk] review attempt link failed"); }
        }
        return outcome(mode, assessment.decision, { ...base, enforced: false, reviewId });
      }
    }
    return outcome(mode, assessment.decision, { ...base, enforced: false });
  }
  // The authenticated custom-store webhook sends free-form products rather
  // than canonical variants. Staff cannot safely approve its held payload.
  if (route === "custom_webhook") return outcome(mode, "ALLOW", { ...base, reasons: row.reasons });
  if (assessment.decision !== "HOLD") return outcome(mode, assessment.decision, base);

  const reviewId = await createHold({ deps, orgId, route, body, customer: ctx.customer, items: ctx.items, score: assessment.score, reasonCodes: signals.map(signal => signal.code) });
  if (!reviewId) return outcome(mode, "ALLOW", { ...base, reasons: [...assessment.reasons, "review_unavailable"] });
  if (attemptId) {
    try { await linkAttemptToReview(deps.supabase, { orgId, attemptId, reviewId }); }
    catch { console.warn("[OrderRisk] review attempt link failed"); }
  }
  return outcome(mode, "HOLD", { ...base, reviewId });
}

export async function finalizeOrderRisk({ supabase, orgId, attemptId, orderId }) {
  if (!attemptId || !orderId) return null;
  try { return await linkAttemptToOrder(supabase, { orgId, attemptId, orderId }); }
  catch { console.warn("[OrderRisk] order attempt link failed"); return null; }
}
