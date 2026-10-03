// First-party website analytics: validation and classification of tracker hits.
//
// Pure module (no Express, Supabase or clock). The ping route supplies request
// metadata and the current time; the database function record_analytics_hit
// applies the result atomically. Rules follow
// docs/superpowers/plans/2026-10-02-first-party-analytics-revised.md §4–§5.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PATH = 200;
const MAX_LABEL = 100;
const MAX_ACTIVE_SECONDS = 1800;
const STEP_EVENTS = Object.freeze({ cart: "cart", checkout: "checkout", purchased: "purchase_signal" });
const UTM_KEYS = Object.freeze(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]);
const PAID_MEDIUMS = new Set(["cpc", "ppc", "paid", "paid_social", "paidsocial", "ads", "ad", "display", "cpm"]);
const SOCIAL_HOSTS = [
  ["facebook", /(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/],
  ["instagram", /(^|\.)instagram\.com$/],
  ["tiktok", /(^|\.)tiktok\.com$/],
  ["youtube", /(^|\.)(youtube\.com|youtu\.be)$/],
  ["whatsapp", /(^|\.)(whatsapp\.com|wa\.me)$/],
  ["google", /(^|\.)google\.[a-z.]+$/],
  ["bing", /(^|\.)bing\.com$/],
];

export const isAnalyticsId = (value) => typeof value === "string" && UUID_RE.test(value);

const clip = (value, max = MAX_LABEL) => {
  if (typeof value !== "string") return null;
  // Drop control characters; labels are display text, never markup.
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned ? cleaned.slice(0, max) : null;
};

function parseUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try { return new URL(value); } catch { return null; }
}

// Path only: query strings and fragments can carry tokens or personal data.
export function normalizeAnalyticsPath(value) {
  const url = parseUrl(value);
  if (!url || !/^https?:$/.test(url.protocol)) return null;
  let path = url.pathname.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  if (path.length > MAX_PATH || path.startsWith("/api/")) return null;
  return path || "/";
}

export function productSlugFromPath(path) {
  const match = typeof path === "string" ? path.match(/^\/products?\/([a-z0-9]+(?:-[a-z0-9]+)*)$/i) : null;
  return match ? match[1].toLowerCase() : null;
}

function referrerHost(referrer, ownHost) {
  const url = parseUrl(referrer);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!host || (ownHost && host === ownHost)) return null;
  return host.slice(0, MAX_LABEL);
}

// Entry attribution for a new session. Campaign Links tag their redirects with
// utm_medium=campaign_link; fbclid alone is not proof of a paid click.
export function classifyTrafficSource({ url, referrer } = {}) {
  const page = parseUrl(url);
  const ownHost = page ? page.hostname.toLowerCase().replace(/^www\./, "") : null;
  const params = page ? page.searchParams : new URLSearchParams();
  const utm = Object.fromEntries(UTM_KEYS.map((key) => [key, clip(params.get(key))?.toLowerCase() ?? null]));
  const host = referrerHost(referrer, ownHost);
  const hostSource = host ? SOCIAL_HOSTS.find(([, pattern]) => pattern.test(host))?.[0] ?? null : null;

  let source;
  if (utm.utm_medium === "campaign_link") source = "campaign_link";
  else if (utm.utm_source) source = utm.utm_source;
  else if (hostSource) source = hostSource;
  else if (params.has("fbclid")) source = "facebook";
  else if (params.has("gclid")) source = "google";
  else if (host) source = host;
  else source = "direct";

  let medium;
  if (utm.utm_medium) medium = PAID_MEDIUMS.has(utm.utm_medium) ? "paid" : utm.utm_medium;
  else if (params.has("gclid")) medium = "paid";
  else if (source === "direct") medium = "none";
  else if (hostSource && hostSource !== "google" && hostSource !== "bing") medium = "social";
  else if (hostSource) medium = "organic";
  else medium = "referral";

  return { source: source.slice(0, MAX_LABEL), medium: medium.slice(0, MAX_LABEL), referrer_host: host, ...utm };
}

export function deviceFromUserAgent(userAgent) {
  const ua = typeof userAgent === "string" ? userAgent : "";
  if (!ua) return "unknown";
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android|fban|fbav|instagram/i.test(ua)) return "mobile";
  return "desktop";
}

const decodeHeader = (value) => {
  if (typeof value !== "string" || !value) return null;
  try { return clip(decodeURIComponent(value), 80); } catch { return clip(value, 80); }
};

// Returns null when the hit is not a first-party analytics event (legacy
// script, heartbeat, malformed ids). Never throws.
export function parseTrackerAnalyticsHit(body, { kind, bucket, userAgent, country, city, now } = {}) {
  if (!body || typeof body !== "object") return null;
  const { event_id: eventId, visitor_id: visitorId, session_id: sessionId } = body;
  if (!isAnalyticsId(eventId) || !isAnalyticsId(visitorId) || !isAnalyticsId(sessionId)) return null;

  let event;
  if (kind === "pageview") event = "page_view";
  else if (kind === "step") event = STEP_EVENTS[bucket] ?? null;
  else if (kind === "engage") event = "engage";
  if (!event) return null;

  const path = normalizeAnalyticsPath(body.url);
  if (!path && event !== "engage") return null;
  const active = Number(body.active_seconds);
  const activeSeconds = event === "engage" && Number.isFinite(active) ? Math.max(0, Math.min(MAX_ACTIVE_SECONDS, Math.round(active))) : 0;
  if (event === "engage" && activeSeconds === 0) return null;

  return {
    eventId: eventId.toLowerCase(),
    visitorId: visitorId.toLowerCase(),
    sessionId: sessionId.toLowerCase(),
    event,
    path: path ?? "/",
    productSlug: event === "page_view" ? productSlugFromPath(path) : null,
    activeSeconds,
    receivedAt: (now instanceof Date ? now : new Date()).toISOString(),
    entry: {
      ...classifyTrafficSource({ url: body.url, referrer: body.referrer }),
      device: deviceFromUserAgent(userAgent),
      country: decodeHeader(country),
      city: decodeHeader(city),
    },
  };
}
