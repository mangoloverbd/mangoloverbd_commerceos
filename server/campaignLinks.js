import { createHmac } from "node:crypto";
import { isIP } from "node:net";

const STOREFRONT_ORIGIN = "https://www.mangolover.com.bd";
const CHANNELS = new Set(["facebook", "instagram", "tiktok", "youtube", "whatsapp", "influencer", "print", "sms", "other"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNSAFE_CHARACTERS = /[\\\u0000-\u001f\u007f]/;
const ATTRIBUTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizeCampaignSlug(value) {
  if (typeof value !== "string") return undefined;
  const slug = value.trim().toLowerCase();
  return slug.length >= 3 && slug.length <= 60 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? slug : undefined;
}

export function slugFromName(name) {
  if (typeof name !== "string") return undefined;
  return normalizeCampaignSlug(name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, ""));
}

export function normalizeCampaignChannel(value) {
  if (typeof value !== "string") return undefined;
  const channel = value.trim().toLowerCase();
  return CHANNELS.has(channel) ? channel : undefined;
}

export function normalizeDestinationPath(value) {
  if (typeof value !== "string" || value.length > 200 || !value.startsWith("/") || value.startsWith("//") || UNSAFE_CHARACTERS.test(value)) return undefined;
  try {
    // Validate escapes in the entire URL, but query values never choose an origin.
    if (UNSAFE_CHARACTERS.test(decodeURIComponent(value))) return undefined;
    let path = value.split(/[?#]/, 1)[0];
    for (let depth = 0; depth < 8; depth += 1) {
      if (!path.startsWith("/") || path.startsWith("//") || UNSAFE_CHARACTERS.test(path)
        || /%2f|%3f|%23/i.test(path)) return undefined;
      const parsed = new URL(path, STOREFRONT_ORIGIN);
      if (parsed.origin !== STOREFRONT_ORIGIN || parsed.pathname.startsWith("//") || /^\/go(?:\/|$)/i.test(parsed.pathname)) return undefined;
      const decoded = /%[0-9a-f]{2}/i.test(path) ? decodeURIComponent(path) : path;
      if (decoded === path) {
        const url = new URL(value, STOREFRONT_ORIGIN);
        const result = `${url.pathname}${url.search}${url.hash}`;
        return url.origin === STOREFRONT_ORIGIN && result.length <= 200 ? result : undefined;
      }
      path = decoded;
    }
  } catch { /* Invalid percent encoding / URL: fail closed. */ }
  return undefined;
}

export function buildCampaignUtm(link) {
  return { utm_source: link.channel, utm_medium: "campaign_link", utm_campaign: link.slug };
}

export function isBotUserAgent(userAgent) {
  if (typeof userAgent !== "string") return false;
  const ua = userAgent.slice(0, 400);
  if (/facebookexternalhit|facebot|meta-externalagent|meta-externalfetcher|skypeuripreview|bot\b|crawler|spider|headlesschrome|^curl\/|^wget\/|python-requests/i.test(ua)) return true;
  // WhatsApp's preview fetch identifies only the app, unlike its real WebViews.
  return /^WhatsApp(?:\/|\s|$)/i.test(ua.trim());
}

function timestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  const day = value.slice(0, 10);
  if (!validDay(day)) return NaN;
  return Date.parse(value);
}

function validDay(day) {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
}

// click is a server-loaded FK-backed row, never a client-supplied association.
// When a link join is supplied, verify its association too (archive is irrelevant).
export function resolveCampaignAttribution({ click, orgId, effectiveAt } = {}) {
  if (!click || !UUID_RE.test(orgId || "") || click.org_id !== orgId || click.is_bot !== false
    || !UUID_RE.test(click.id || "") || !UUID_RE.test(click.link_id || "")) return {};
  if (Object.hasOwn(click, "link") && (!click.link || click.link.id !== click.link_id || click.link.org_id !== orgId)) return {};
  const clickedAt = timestamp(click.clicked_at);
  const effective = timestamp(effectiveAt);
  const age = effective - clickedAt;
  if (!Number.isFinite(age) || age < 0 || age > ATTRIBUTION_WINDOW_MS) return {};
  return { campaign_link_id: click.link_id, campaign_click_id: click.id, campaign_attributed_at: new Date(effective).toISOString() };
}

// Caller must obtain ip/UA from verified signed client context, not raw headers.
export function buildCampaignVisitorHash({ ip, userAgent, dhakaDay, secret } = {}) {
  if (typeof ip !== "string" || !isIP(ip) || !validDay(dhakaDay) || typeof secret !== "string" || secret.length < 32) return undefined;
  const boundedUa = typeof userAgent === "string" ? userAgent.slice(0, 400) : "";
  return createHmac("sha256", secret)
    .update(JSON.stringify(["mlbd:campaign-visitor-day:v1", dhakaDay, ip, boundedUa])).digest("hex");
}
