import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { convertMetaSpendToBdt } from "./metaAdCurrency.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFile } from "fs/promises";
import pg from "pg";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import Stripe from "stripe";
import { computeOrderCogs } from "./cog.js";
import { buildOverviewData } from "./overview.js";
import { buildSalesTrend } from "./salesTrend.js";
import { calculateShippingCost } from "./shippingCalculation.js";
import { buildCustomers, summarizeCustomers } from "./customers.js";
import { toPublicProduct, toPublicInventoryEntry, PublicInventoryResponseSchema, PublicInventoryEntrySchema } from "./publicCatalog.js";
import {
  HANDLE_REGEX,
  RESERVED_HANDLES,
  normalizeStorefrontHandle,
  validateStorefrontHandle,
} from "./storefrontHandle.js";
const { Pool } = pg;

// ─── Rate limiting (Upstash Redis) ───────────────────────────────────────────
// Three tiers keyed by authenticated user ID (or IP for auth endpoints):
//   ai   — expensive AI/crawl routes: 20 req / 60 s
//   auth — registration: 5 req / 15 min (brute-force protection)
//   api  — all other /api routes: 120 req / 60 s
//
// Falls back silently when Redis is unreachable — never blocks the request.

let redisClient = null;
let rlAI = null;
let rlAuth = null;
let rlAPI = null;
let rlHandleClaimUser = null;
let rlHandleClaimIp = null;
let rlPublicRead = null;

// Cloudflare edge-cache purge + warm-token bypass (Task 1).
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID || "";
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || "";
const PUBLIC_DOMAIN = process.env.PUBLIC_DOMAIN || "";
const WARM_TOKEN = process.env.WARM_TOKEN || "";

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    rlAI = new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(20, "60 s"),
      prefix: "rl:ai",
    });
    rlAuth = new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(5, "15 m"),
      prefix: "rl:auth",
    });
    rlAPI = new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(120, "60 s"),
      prefix: "rl:api",
    });
    rlHandleClaimUser = new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(5, "1 h"),
      prefix: "rl:handle:user",
    });
    rlHandleClaimIp = new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(20, "1 h"),
      prefix: "rl:handle:ip",
    });
    rlPublicRead = new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(60, "60 s"),
      prefix: "rl:public:read",
    });
    console.log("[RateLimit] Upstash Redis connected.");
  } catch (err) {
    console.warn("[RateLimit] Failed to init Upstash — rate limiting disabled:", err.message);
  }
} else {
  console.warn("[RateLimit] UPSTASH_REDIS_REST_URL / TOKEN not set — rate limiting disabled.");
}

/**
 * Build an Express middleware for a given Ratelimit instance.
 * @param {Ratelimit|null} limiter
 * @param {"user"|"ip"} keyStrategy  "user" uses the JWT subject; "ip" uses remote IP
 */
function makeRateLimitMiddleware(limiter, keyStrategy = "user") {
  return async (req, res, next) => {
    if (!limiter) return next(); // disabled — pass through

    // Allow a caller to force the identifier (e.g. IP+handle for public reads).
    if (req.__forceId) return runRateLimit(limiter, req.__forceId, res, next);

    let identifier;
    if (keyStrategy === "ip") {
      identifier = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
    } else {
      // Extract user id from JWT without full verification (already verified per-route).
      // Use IP as fallback for unauthenticated requests.
      try {
        const authHeader = req.headers.authorization || "";
        const token = authHeader.replace(/^Bearer\s+/i, "");
        if (token) {
          const [, payloadB64] = token.split(".");
          const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
          identifier = payload.sub || payload.user_id || null;
        }
      } catch { /* ignore malformed JWT */ }
      if (!identifier) {
        identifier = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      }
    }

    return runRateLimit(limiter, identifier, res, next);
  };
}

// Shared execution + 429 path for both the JWT/IP and forced-identifier strategies.
async function runRateLimit(limiter, identifier, res, next) {
  if (!limiter) return next();
  try {
    const { success, limit, remaining, reset } = await limiter.limit(identifier);
    res.setHeader("X-RateLimit-Limit", limit);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", reset);

    if (!success) {
      const retryAfterSecs = Math.ceil((reset - Date.now()) / 1000);
      res.setHeader("Retry-After", retryAfterSecs);
      return res.status(429).json({
        error: "Too many requests. Please slow down.",
        retryAfter: retryAfterSecs,
      });
    }
    next();
  } catch (err) {
    console.warn("[RateLimit] Redis check failed, allowing request:", err.message);
    next();
  }
}

const rateLimitAI   = makeRateLimitMiddleware(rlAI,   "user");
const rateLimitAuth = makeRateLimitMiddleware(rlAuth,  "ip");
const rateLimitAPI  = makeRateLimitMiddleware(rlAPI,   "user");
const rateLimitHandleUser = makeRateLimitMiddleware(rlHandleClaimUser, "user");
const rateLimitHandleIp   = makeRateLimitMiddleware(rlHandleClaimIp,   "ip");
// Public storefront reads are unauthenticated. Key by IP+handle so a scraper
// hammering one handle from one IP is throttled, but a merchant's busy storefront
// (many visitors, many IPs) and a scraper rotating IPs per handle stay usable.
// Warm-token requests (purge re-warms) bypass the limiter entirely so a
// write storm can't lock out its own cache warming.
import { isWarmRequest } from "./warmToken.js";

const rateLimitPublicRead = (req, res, next) => {
  if (isWarmRequest(req)) return next();
  if (!rlPublicRead) return next();
  const ip = req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  const handle = req.params.handle || req.params.storefrontId || "*";
  return makeRateLimitMiddleware(rlPublicRead, "ip")({ ...req, __forceId: `${ip}:${handle}` }, res, next);
};
const PRODUCT_IMAGES_BUCKET = "product-images";
const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const PRODUCT_IMAGE_MAX_COUNT = 8;
const PRODUCT_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// ─── Stripe ─────────────────────────────────────────────────────────────────

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const STRIPE_PRICE_MAP = {
  starter: "price_1TeARSA5T00t4EO71W7svkrN",
  growth: "price_1TeARSA5T00t4EO79vEi4zBY",
  pro: "price_1TeARSA5T00t4EO7pgBtMKgH",
  enterprise: "price_1TeARTA5T00t4EO7c3f1thOz",
};

// ─────────────────────────────────────────────────────────────────────────────

// Let Railway restart the process after truly unexpected failures. Continuing
// after these can leave auth or DB state half-broken.
process.on("unhandledRejection", (reason, promise) => {
  console.error("[Server] Unhandled rejection at:", promise, "reason:", reason);
  setImmediate(() => process.exit(1));
});
process.on("uncaughtException", (err) => {
  console.error("[Server] Uncaught exception:", err);
  setImmediate(() => process.exit(1));
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
// Cloudflare -> Railway proxy -> Express. Trust 2 hops so req.ip
// reflects the real client behind Cloudflare, not the proxy IP.
app.set("trust proxy", 2);
app.use(cors({ origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : true }));
const publicTrackerCors = cors({
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  maxAge: 86400,
});

// Parse JSON and simultaneously capture raw body buffer for webhook HMAC verification.
// Using the verify callback avoids consuming the stream twice.
app.use(express.json({
  limit: "20mb",
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

// Apply general API rate limit to all /api/* routes.
// AI-specific routes apply their own stricter rateLimitAI middleware on top.
// Webhook routes are excluded — they are server-to-server and must not be blocked.
// Public storefront routes set their own caching + rate limiting and are exempt
// here so the global /api limiter can't defeat the warm-token bypass.
app.use("/api", (req, res, next) => {
  const path = req.path;
  // Public v1 routes set their own caching + rate limiting.
  if (path.startsWith("/public/")) return next();
  // Everything else under /api is per-user data — never cache.
  res.set("Cache-Control", "private, no-store");
  // Exclude webhook endpoints and public config from rate limiting
  if (
    path.startsWith("/webhooks/") ||
    path === "/tracker.js" ||
    path === "/live-visitor/ping" ||
    path === "/config"
  ) return next();
  return rateLimitAPI(req, res, next);
});

const PORT = process.env.PORT || 5000;
const isDev = process.env.NODE_ENV !== "production";

function getServiceSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

// ─── Auth Helper ────────────────────────────────────────────────────────────

function getToken(req) {
  return (req.headers.authorization || "").replace("Bearer ", "").trim();
}

function adminEmails() {
  return (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isConfiguredAdmin(user) {
  const email = (user?.email || "").toLowerCase();
  return !!email && adminEmails().includes(email);
}

async function findFirstAdminOrg(supabase) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id, org_id")
    .eq("role", "admin")
    .not("org_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.org_id || data?.user_id || null;
}

async function hasAnyAdmin(supabase) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .limit(1);
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

async function ensureUserRole(supabase, user) {
  const { data: existingRole, error: roleError } = await supabase
    .from("user_roles")
    .select("org_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (roleError) throw roleError;

  const configuredAdmin = isConfiguredAdmin(user);
  if (existingRole?.role && existingRole?.org_id && !configuredAdmin) {
    return existingRole;
  }

  if (existingRole?.role === "admin" || configuredAdmin) {
    const { data, error } = await supabase
      .from("user_roles")
      .upsert({ user_id: user.id, role: "admin", org_id: user.id }, { onConflict: "user_id" })
      .select("org_id, role")
      .single();
    if (error) throw error;
    return data;
  }

  if (existingRole?.role === "team_member") {
    const orgId = existingRole.org_id || await findFirstAdminOrg(supabase);
    if (!orgId) return existingRole;
    const { data, error } = await supabase
      .from("user_roles")
      .upsert({ user_id: user.id, role: "team_member", org_id: orgId }, { onConflict: "user_id" })
      .select("org_id, role")
      .single();
    if (error) throw error;
    return data;
  }

  if (!await hasAnyAdmin(supabase)) {
    const { data, error } = await supabase
      .from("user_roles")
      .upsert({ user_id: user.id, role: "admin", org_id: user.id }, { onConflict: "user_id" })
      .select("org_id, role")
      .single();
    if (error) throw error;
    return data;
  }

  return existingRole;
}

async function getUser(token) {
  if (!token) return { user: null };
  try {
    const supabase = getServiceSupabase();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return { user: null };

    const existingRole = await ensureUserRole(supabase, user);
    if (!existingRole?.org_id || !existingRole?.role) {
      console.warn(`[Auth] user ${user.id} has no organization role; denying API access`);
      return { user: null, missingRole: true };
    }

    return { user };
  } catch (err) {
    console.error("[Auth] getUser error:", err.message);
    return { user: null };
  }
}

async function getUserOrg(supabase, userId) {
  const { data: roleRow, error } = await supabase
    .from("user_roles")
    .select("org_id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const orgId = roleRow?.org_id || null;
  const role = roleRow?.role || null;
  if (!orgId) {
    const err = new Error("User has no organisation assigned. Please contact your administrator.");
    err.statusCode = 403;
    throw err;
  }
  return { orgId, role };
}

async function requireAdmin(req, res) {
  const { user } = await getUser(getToken(req));
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const supabase = getServiceSupabase();
  const { orgId, role } = await getUserOrg(supabase, user.id);
  if (role !== "admin" || !orgId) {
    res.status(403).json({ error: "Only admins can manage team members" });
    return null;
  }
  return { supabase, user, orgId, role };
}

function applyOrgScope(query, orgId) {
  return query.eq("org_id", orgId);
}

function errorMessage(err) {
  if (err instanceof Error) return err.message;
  if (err?.message) return err.message;
  if (err?.error_description) return err.error_description;
  if (err?.details) return err.details;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

function sendError(res, err) {
  const msg = errorMessage(err);
  const status = err?.statusCode || 500;
  return res.status(status).json({ error: msg });
}

function parseOpenAIError(status, body) {
  let message = body;
  let code = "";
  try {
    const parsed = JSON.parse(body);
    message = parsed?.error?.message || parsed?.message || body;
    code = parsed?.error?.code || parsed?.error?.type || "";
  } catch {
    // OpenAI can return plain text for gateway-level issues.
  }

  const detail = String(message || "").slice(0, 220);
  if (status === 401 || code === "invalid_api_key") {
    return "OpenAI rejected the API key. Check that OPENAI_API_KEY is a valid project API key and restart localhost after editing .env.";
  }
  if (status === 403 || /model|project|organization|permission/i.test(detail)) {
    return `OpenAI access error: ${detail}`;
  }
  if (status === 429 && /quota|credits|billing|balance/i.test(detail)) {
    return `OpenAI billing/quota error: ${detail}`;
  }
  if (status === 429) {
    return "OpenAI rate limit exceeded. Please try again shortly.";
  }
  return `OpenAI error ${status}: ${detail || "request failed"}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBdPhone(phone) {
  let clean = (phone || "").replace(/\D/g, "");
  if (clean.startsWith("880")) {
    const after = clean.slice(3);
    if (after.startsWith("01") && after.length === 11) clean = after;
    else if (after.startsWith("1") && after.length === 10) clean = "0" + after;
  }
  if (clean.length !== 11 || !clean.startsWith("01")) return null;
  return clean;
}

function parseFraudShieldError(status, body) {
  let message = body;
  try {
    const parsed = JSON.parse(body);
    message = parsed.message || parsed.error || parsed.details || body;
  } catch {
    // FraudShield sometimes returns plain text/HTML on upstream failures.
  }

  if (status === 502) {
    return "FraudShield server returned a 502 Bad Gateway. This usually indicates their origin database or upstream courier sync service is down.";
  }
  if (status === 504) {
    return "FraudShield server returned a 504 Gateway Timeout. The request timed out while querying courier records.";
  }

  if (/BdCourierService|transformApiResponse|null returned/i.test(message)) {
    return "FraudShield is temporarily failing while reading BD Courier data. Please try again later or contact FraudShield support if it continues.";
  }

  const hint =
    status === 401 || status === 403
      ? "Invalid or expired API key"
      : `HTTP ${status}`;
  return `${hint}: ${String(message).substring(0, 200) || "(no body)"}`;
}

async function checkFraudStatus(phone, apiKey) {
  const cleanedPhone = normalizeBdPhone(phone);
  if (!cleanedPhone) {
    return { fraudData: null, successRate: null, errorMessage: `Invalid phone format: "${phone}"` };
  }
  if (!apiKey) {
    return { fraudData: null, successRate: null, errorMessage: "No API key provided" };
  }

  const trimmedApiKey = apiKey.trim();

  try {
    const response = await fetch("https://fraudshield.bd/api/customer/check", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${trimmedApiKey}`,
        "X-API-Key": trimmedApiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ phone: cleanedPhone }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[FraudShield] API returned error for ${cleanedPhone}: status ${response.status}, body: ${errorBody}`);
      return {
        fraudData: null,
        successRate: null,
        errorMessage: parseFraudShieldError(response.status, errorBody),
      };
    }

    let result;
    try {
      result = await response.json();
    } catch {
      return {
        fraudData: null,
        successRate: null,
        errorMessage: "FraudShield returned an invalid JSON response. Please try again later.",
      };
    }

    if (!result.courierData) {
      return {
        fraudData: null,
        successRate: null,
        errorMessage: `Unexpected response: ${JSON.stringify(result).substring(0, 200)}`,
      };
    }

    // API returns courierData as a keyed object: { pathao: {...}, steadfast: {...} }
    // Each entry has: total_parcel, success_parcel, cancelled_parcel, success_ratio, name, logo
    const courierEntries = Object.entries(result.courierData);

    let totalParcels = 0;
    let totalDelivered = 0;
    let totalCancelled = 0;
    const apis = {};

    for (const [key, c] of courierEntries) {
      const total = c.total_parcel ?? c.total ?? 0;
      const delivered = c.success_parcel ?? c.successful ?? 0;
      const cancelled = c.cancelled_parcel ?? c.cancelled ?? 0;
      totalParcels += total;
      totalDelivered += delivered;
      totalCancelled += cancelled;
      apis[c.name ?? key] = {
        total_parcels: total,
        total_delivered_parcels: delivered,
        total_cancelled_parcels: cancelled,
      };
    }

    const successRate = totalParcels > 0
      ? Math.round((totalDelivered / totalParcels) * 100)
      : 0;

    const riskLevel =
      result.fraudRiskScore?.level ??
      (successRate >= 70 ? "low" : successRate >= 50 ? "medium" : "high");

    const fraudData = {
      mobile_number: cleanedPhone,
      total_parcels: totalParcels,
      total_delivered: totalDelivered,
      total_cancel: totalCancelled,
      fraud_risk: riskLevel,
      success_rate: successRate,
      last_delivery: "",
      apis,
    };

    return { fraudData, successRate, errorMessage: null };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { fraudData: null, successRate: null, errorMessage: `Network error: ${msg}` };
  }
}

async function sendBulkSms(orgId, type, order) {
  try {
    const keys = [
      `${orgId}:bulksms_enabled`,
      `${orgId}:bulksms_api_key`,
      `${orgId}:bulksms_sender_id`,
      `${orgId}:bulksms_confirmation_template`,
      `${orgId}:bulksms_dispatch_template`
    ];
    const settings = await getSettings(keys);
    
    if (settings[`${orgId}:bulksms_enabled`] !== "true") return;
    
    const apiKey = settings[`${orgId}:bulksms_api_key`];
    const senderId = settings[`${orgId}:bulksms_sender_id`];
    if (!apiKey || !senderId) return;

    let template = "";
    if (type === "confirmation") {
      template = settings[`${orgId}:bulksms_confirmation_template`] || "";
    } else if (type === "dispatch") {
      template = settings[`${orgId}:bulksms_dispatch_template`] || "";
    }
    
    if (!template.trim() || !order.phone) return;
    
    const phone = normalizeBdPhone(order.phone);
    if (!phone) return;

    let message = template
      .replace(/{customer_name}/g, order.customer_name || "")
      .replace(/{order_id}/g, order.order_number || "")
      .replace(/{price}/g, order.price || "")
      .replace(/{delivery_fee}/g, order.delivery_rate || "")
      .replace(/{courier_name}/g, order.courier_name || "")
      .replace(/{tracking_code}/g, order.tracking_code || "");
      
    const url = `https://bulksmsbd.net/api/smsapi?api_key=${encodeURIComponent(apiKey)}&type=text&number=${encodeURIComponent(phone)}&senderid=${encodeURIComponent(senderId)}&message=${encodeURIComponent(message)}`;

    // Fire and forget
    fetch(url).then(res => res.json()).then(data => {
      console.log(`[BulkSMS] Sent to ${phone}, Response:`, data);
    }).catch(err => {
      console.error(`[BulkSMS] Failed to send SMS to ${phone}:`, err);
    });

  } catch (err) {
    console.error("[BulkSMS] Error in sendBulkSms:", err);
  }
}

async function getPathaoToken(orgId) {
  const cfg = await getOrgSettings(orgId, ["pathao_client_id", "pathao_client_secret", "pathao_username", "pathao_password"]);
  const clientId = cfg["pathao_client_id"];
  const clientSecret = cfg["pathao_client_secret"];
  const username = cfg["pathao_username"];
  const password = cfg["pathao_password"];

  if (!clientId || !clientSecret || !username || !password) {
    throw new Error("Pathao credentials not configured. Go to Settings → Integrations to add them.");
  }

  const response = await fetch("https://api-hermes.pathao.com/aladdin/api/v1/issue-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      username,
      password,
      grant_type: "password",
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(data.message || "Failed to get Pathao access token");
  }
  return data.access_token;
}

// ─── Public Config Endpoint ───────────────────────────────────────────────────

app.get("/api/config", (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
  });
});

// ─── Auth Registration Endpoint ──────────────────────────────────────────────

// Register a new user and automatically assign them the admin role
app.post("/api/auth/register", rateLimitAuth, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const supabase = getServiceSupabase();

    // Create the user via service role (auto-confirm email)
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) {
      return res.status(400).json({ error: createError.message });
    }

    const { error: roleError } = await supabase
      .from("user_roles")
      .upsert({ user_id: newUser.user.id, role: "admin", org_id: newUser.user.id }, { onConflict: "user_id" });

    if (roleError) throw roleError;

    // Set up 7-day free trial for new business owner
    const orgId = newUser.user.id;
    const trialStarted = new Date().toISOString();
    const trialEnds = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await saveOrgSettings(orgId, {
      billing_plan: "growth",
      billing_started_at: trialStarted,
      billing_renews_at: trialEnds,
      billing_status: "trialing",
      trial_ends_at: trialEnds,
    });

    return res.json({ success: true, userId: newUser.user.id });
  } catch (err) {
    return sendError(res, err);
  }
});

// ─── Role Management Endpoints ───────────────────────────────────────────────

// Allows a user to claim admin if no admins exist yet (first-run bootstrap)
// Or allows an existing admin to assign roles to others
app.post("/api/admin/assign-role", async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return res.status(401).json({ error: "Authorization token required" });

    const supabase = getServiceSupabase();

    // Verify the requesting user's JWT
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: "Invalid token" });
    await ensureUserRole(supabase, user);

    const { targetUserId, role } = req.body;
    const roleToAssign = role || "admin";

    // Check if any admins exist yet
    const { data: existingAdmins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")
      .limit(1);

    const noAdminsYet = !existingAdmins || existingAdmins.length === 0;

    if (!noAdminsYet) {
      // Admins exist — only an existing admin can assign roles
      const { data: callerRole } = await supabase
        .from("user_roles")
        .select("org_id, role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (callerRole?.role !== "admin") {
        return res.status(403).json({ error: "Only admins can assign roles" });
      }
      if (!callerRole.org_id) {
        return res.status(403).json({ error: "Admin user is not assigned to an organization" });
      }
      const assignTo = targetUserId || user.id;
      const { error: upsertError } = await supabase
        .from("user_roles")
        .upsert({ user_id: assignTo, role: roleToAssign, org_id: callerRole.org_id }, { onConflict: "user_id" });

      if (upsertError) throw upsertError;

      return res.json({ success: true, userId: assignTo, role: roleToAssign });
    }

    // Assign the role (upsert)
    const assignTo = targetUserId || user.id;
    const { error: upsertError } = await supabase
      .from("user_roles")
      .upsert({ user_id: assignTo, role: roleToAssign, org_id: assignTo }, { onConflict: "user_id" });

    if (upsertError) throw upsertError;

    return res.json({ success: true, userId: assignTo, role: roleToAssign });
  } catch (err) {
    return sendError(res, err);
  }
});

async function getCurrentUserContext(token) {
  if (!token) return null;

  // getUser validates the JWT and requires an existing organization role.
  const { user } = await getUser(token);
  if (!user) return null;

  const supabase = getServiceSupabase();
  const { data: roleRow, error } = await supabase
    .from("user_roles")
    .select("org_id, role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;

  const orgId = roleRow?.org_id || null;
  const orgSettings = orgId ? await getOrgSettings(orgId, ["org_name"]) : {};
  const role = roleRow?.role || null;

  return {
    user: {
      id: user.id,
      email: user.email || "",
    },
    role,
    orgId,
    orgName: orgSettings.org_name || "",
    isAdmin: role === "admin",
    isTeamMember: role === "team_member",
    hasRole: !!roleRow,
  };
}

app.get("/api/me", async (req, res) => {
  try {
    const context = await getCurrentUserContext(getToken(req));
    if (!context) return res.status(401).json({ error: "Unauthorized" });
    return res.json(context);
  } catch (err) {
    return sendError(res, err);
  }
});

// Check if the current user is admin
app.get("/api/admin/check", async (req, res) => {
  try {
    const context = await getCurrentUserContext(getToken(req));
    if (!context) return res.json({ isAdmin: false, hasAdmins: false });

    return res.json({
      isAdmin: context.isAdmin,
      hasAdmins: context.hasRole,
      role: context.role,
      orgId: context.orgId,
    });
  } catch {
    return res.json({ isAdmin: false, hasAdmins: false });
  }
});

function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  return Array.from({ length: 14 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
}

async function getAuthUserEmail(supabase, userId) {
  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error) return "";
    return data?.user?.email || "";
  } catch {
    return "";
  }
}

app.get("/api/team-members", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { supabase, orgId } = admin;

    const { data: roles, error } = await supabase
      .from("user_roles")
      .select("id, user_id, role, org_id, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const members = await Promise.all((roles || []).map(async (member) => ({
      ...member,
      email: await getAuthUserEmail(supabase, member.user_id),
    })));

    return res.json({ members });
  } catch (err) {
    return sendError(res, err);
  }
});

async function createTeamMemberHandler(req, res) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { supabase, orgId } = admin;
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = req.body?.password ? String(req.body.password) : generateTemporaryPassword();

    if (!email) return res.status(400).json({ error: "Email is required" });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) return res.status(400).json({ error: createError.message });

    const { data: roleRow, error: roleError } = await supabase
      .from("user_roles")
      .upsert(
        { user_id: newUser.user.id, role: "team_member", org_id: orgId },
        { onConflict: "user_id" }
      )
      .select("id, user_id, role, org_id, created_at")
      .single();

    if (roleError) throw roleError;

    return res.status(201).json({
      success: true,
      email,
      password,
      userId: newUser.user.id,
      member: { ...roleRow, email },
    });
  } catch (err) {
    return sendError(res, err);
  }
}

app.post("/api/team-members", createTeamMemberHandler);
app.post("/api/create-team-member", createTeamMemberHandler);

app.delete("/api/team-members/:id", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const { supabase, user, orgId } = admin;

    const { data: member, error: fetchError } = await supabase
      .from("user_roles")
      .select("id, user_id, role, org_id")
      .eq("id", req.params.id)
      .eq("org_id", orgId)
      .single();

    if (fetchError || !member) return res.status(404).json({ error: "Team member not found" });
    if (member.user_id === user.id) return res.status(400).json({ error: "You cannot remove yourself" });
    if (member.role === "admin") return res.status(400).json({ error: "Admin users cannot be removed from Team Management" });

    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(member.user_id);
    if (deleteUserError) throw deleteUserError;

    await supabase
      .from("user_roles")
      .delete()
      .eq("id", member.id)
      .eq("org_id", orgId);

    return res.json({ success: true, id: member.id });
  } catch (err) {
    return sendError(res, err);
  }
});

// ─── App Settings Endpoints ──────────────────────────────────────────────────

async function getSettings(keys) {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", keys);
  const map = {};
  for (const row of data || []) {
    map[row.key] = row.value;
  }
  return map;
}

async function saveSettings(settings) {
  const supabase = getServiceSupabase();
  const rows = Object.entries(settings).map(([key, value]) => ({
    key,
    value: String(value),
    updated_at: new Date().toISOString(),
  }));
  return supabase.from("app_settings").upsert(rows, { onConflict: "key" });
}

function orgSettingKey(orgId, key) {
  return `${orgId}:${key}`;
}

async function getOrgSettings(orgId, keys) {
  const scopedKeys = keys.map((key) => orgSettingKey(orgId, key));
  const settings = await getSettings(scopedKeys);
  const map = {};
  for (const key of keys) {
    map[key] = settings[orgSettingKey(orgId, key)];
  }
  return map;
}

// ─── Public Storefront Handle ────────────────────────────────────────────────
//
// Handles let merchants advertise storefronts as /:handle instead of a raw
// orgId UUID. Two app_settings keys back each handle:
//   storefront_handle:<handle>          -> orgId   (forward: handle -> org)
//   <orgId>:public_storefront_handle    -> handle  (reverse: org -> handle)
// Claiming a handle races: we rely on the app_settings PK to make the forward
// insert atomic (ON CONFLICT DO NOTHING via Supabase's ignoreDuplicates).

async function resolveStorefrontHandle(handle) {
  const check = validateStorefrontHandle(handle);
  if (!check.ok) return null;
  const key = `storefront_handle:${check.handle}`;
  const settings = await getSettings([key]);
  return settings[key] || null;
}

async function getStorefrontHandle(orgId) {
  const key = `${orgId}:public_storefront_handle`;
  const settings = await getSettings([key]);
  return settings[key] || null;
}

// Fire-and-forget edge purge. URL-based (tag-based purge is Cloudflare
// Enterprise-only); Cache-Tag headers still ship so the future switch is a
// config change, not a code change. Failures log + drop — the outbox
// replay job is a separate plan.
async function purgeProductCache(orgId, productId, { listChanged = false, warm = true } = {}) {
  if (!CLOUDFLARE_ZONE_ID || !CLOUDFLARE_API_TOKEN || !PUBLIC_DOMAIN) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("[Purge] Cloudflare not configured — skipping purge");
    }
    return;
  }
  const handle = await getStorefrontHandle(orgId);
  if (!handle) return;

  const urls = [];
  if (productId) {
    urls.push(`https://${PUBLIC_DOMAIN}/api/public/v1/${handle}/products/${productId}`);
    urls.push(`https://${PUBLIC_DOMAIN}/api/public/v1/${handle}/products/${productId}/inventory`);
  }
  if (listChanged) {
    urls.push(`https://${PUBLIC_DOMAIN}/api/public/v1/${handle}/products`);
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ files: urls }),
      },
    );
    if (!response.ok) {
      const body = await response.text();
      console.warn(`[Purge] Cloudflare purge failed: ${body}`);
    } else {
      console.log(`[Purge] Purged ${urls.length} URL(s) for org ${orgId} product ${productId || "*"}`);
    }
  } catch (e) {
    console.warn("[Purge] Cloudflare purge error:", e.message);
  }

  if (warm && WARM_TOKEN) {
    const warmHeaders = { headers: { "X-Warm-Token": WARM_TOKEN } };
    for (const url of urls) {
      fetch(url, warmHeaders).catch(() => {});
    }
  }
}

async function setStorefrontHandle(orgId, handle) {
  if (!orgId) throw new Error("orgId required");
  const validation = validateStorefrontHandle(handle);
  if (!validation.ok) {
    const message = validation.reason === "reserved"
      ? `"${normalizeStorefrontHandle(handle)}" is a reserved handle`
      : "Handle must be 2-50 characters, lowercase letters, numbers, and hyphens only (no leading/trailing hyphen)";
    const err = new Error(message);
    err.code = validation.reason === "reserved" ? "HANDLE_RESERVED" : "HANDLE_INVALID";
    throw err;
  }
  const clean = validation.handle;

  const supabase = getServiceSupabase();
  const forwardKey = `storefront_handle:${clean}`;
  const reverseKey = `${orgId}:public_storefront_handle`;

  // Atomic claim: insert the forward key; on conflict, do nothing.
  // If nothing was inserted and the existing row belongs to a different org, 409.
  const nowIso = new Date().toISOString();
  const { data: inserted, error: insertError } = await supabase
    .from("app_settings")
    .insert({ key: forwardKey, value: orgId, updated_at: nowIso })
    .select();
  if (insertError && insertError.code !== "23505") throw insertError;

  if (!inserted || inserted.length === 0) {
    const existing = await getSettings([forwardKey]);
    if (existing[forwardKey] && existing[forwardKey] !== orgId) {
      const err = new Error(`Storefront handle "${clean}" is already taken`);
      err.code = "HANDLE_TAKEN";
      throw err;
    }
    // Already owned by this org — idempotent, fall through.
  }

  // Update reverse mapping. If the org previously had a different handle,
  // free that forward key so it can be reclaimed and doesn't keep resolving.
  const previous = await getStorefrontHandle(orgId);
  if (previous && previous !== clean) {
    await supabase.from("app_settings").delete().eq("key", `storefront_handle:${previous}`);
  }
  await saveSettings({ [reverseKey]: clean });
  return clean;
}

async function saveOrgSettings(orgId, settings) {
  const scopedSettings = {};
  for (const [key, value] of Object.entries(settings)) {
    scopedSettings[orgSettingKey(orgId, key)] = value;
  }
  return saveSettings(scopedSettings);
}

async function getNextManualOrderSeq(orgId) {
  const supabase = getServiceSupabase();
  const key = orgSettingKey(orgId, "manual_order_seq");
  const now = new Date().toISOString();

  // Ensure a counter row exists. ignoreDuplicates protects progress if another
  // process already initialized or incremented it.
  await supabase
    .from("app_settings")
    .upsert({ key, value: "0", updated_at: now }, { onConflict: "key", ignoreDuplicates: true });

  for (let attempt = 0; attempt < 8; attempt++) {
    const { data: existing } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    const currentStr = existing?.value ?? "0";
    const highestShopifyStyleOrderNumber = await getHighestShopifyStyleOrderNumber(orgId);
    const current = parseInt(currentStr, 10) || 0;
    const baseline = Math.max(current, highestShopifyStyleOrderNumber);
    const next = baseline + 1;

    const { data: updated, error } = await supabase
      .from("app_settings")
      .update({ value: String(next), updated_at: now })
      .eq("key", key)
      .eq("value", currentStr)
      .select("value");

    if (error) throw error;
    if (updated && updated.length > 0) return next;
  }

  throw new Error("Failed to allocate manual order sequence after retries");
}

async function getHighestShopifyStyleOrderNumber(orgId) {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("orders")
    .select("order_number")
    .eq("org_id", orgId);
  if (error) throw error;

  return (data || []).reduce((highest, order) => {
    if (!/^#\d+$/.test(order.order_number || "")) return highest;
    const orderNumber = Number(order.order_number.replace("#", ""));
    return Number.isFinite(orderNumber) ? Math.max(highest, orderNumber) : highest;
  }, 0);
}

async function getProductStockMap(orgId, productIds) {
  if (!productIds.length) return {};
  const keys = productIds.map((id) => `${orgId}:product_stock:${id}`);
  const settings = await getSettings(keys);
  const map = {};
  for (const id of productIds) {
    map[id] = Math.max(0, parseInt(settings[`${orgId}:product_stock:${id}`] || "0", 10) || 0);
  }
  return map;
}

async function saveProductStock(orgId, productId, quantity) {
  return saveSettings({ [`${orgId}:product_stock:${productId}`]: Math.max(0, parseInt(quantity, 10) || 0) });
}

async function loadProductImagesMap(supabase, orgId, productIds) {
  if (!productIds.length) return {};
  const { data, error } = await supabase
    .from("product_images")
    .select("id, product_id, image_url, alt_text, sort_order, is_primary, created_at")
    .eq("org_id", orgId)
    .in("product_id", productIds)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  const map = {};
  for (const image of data || []) {
    if (!map[image.product_id]) map[image.product_id] = [];
    map[image.product_id].push({
      id: image.id,
      url: image.image_url,
      alt_text: image.alt_text || null,
      sort_order: image.sort_order || 0,
      is_primary: image.is_primary === true,
    });
  }
  return map;
}

async function ensureProductImagesBucket(supabase) {
  const { data: bucket, error: getError } = await supabase.storage.getBucket(PRODUCT_IMAGES_BUCKET);
  if (bucket && !getError) return;
  const { error } = await supabase.storage.createBucket(PRODUCT_IMAGES_BUCKET, {
    public: true,
    allowedMimeTypes: Array.from(PRODUCT_IMAGE_MIME_TYPES),
    fileSizeLimit: PRODUCT_IMAGE_MAX_BYTES,
  });
  if (error && !/already exists/i.test(error.message || "")) throw error;
}

function parseProductImagePayload(file) {
  const dataUrl = String(file?.dataUrl || file?.data_url || "");
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = String(file?.mimeType || file?.type || match?.[1] || "").toLowerCase();
  if (!PRODUCT_IMAGE_MIME_TYPES.has(mimeType)) {
    const err = new Error("Only JPEG, PNG, and WebP images are allowed");
    err.status = 400;
    throw err;
  }
  const base64 = match ? match[2] : String(file?.base64 || "");
  if (!base64) {
    const err = new Error("Image data is required");
    err.status = 400;
    throw err;
  }
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > PRODUCT_IMAGE_MAX_BYTES) {
    const err = new Error("Each product image must be 5MB or smaller");
    err.status = 400;
    throw err;
  }
  return { buffer, mimeType };
}

function productImageExtension(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function slugifyProductName(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "product";
}

async function getUniqueProductSlug(supabase, orgId, productId, preferredSlug, fallbackName) {
  const base = slugifyProductName(preferredSlug || fallbackName || productId);
  let slug = base;
  for (let i = 2; i < 100; i++) {
    const { data, error } = await supabase
      .from("products")
      .select("id")
      .eq("org_id", orgId)
      .eq("slug", slug)
      .neq("id", productId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

// ─── Secret Storage Helpers ─────────────────────────────────────────────────

function getTokenEncryptionKey() {
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("Missing TOKEN_ENCRYPTION_KEY env var");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptToken(value) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getTokenEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptToken(value) {
  if (!value) return "";
  if (!String(value).startsWith("v1:")) return String(value);
  const [, ivB64, tagB64, encryptedB64] = String(value).split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getTokenEncryptionKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function metaGraphVersion() {
  return process.env.META_GRAPH_VERSION || "v23.0";
}

function metaGraphUrl(path, params = {}) {
  const url = new URL(`https://graph.facebook.com/${metaGraphVersion()}/${String(path).replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function metaGraph(path, { method = "GET", token, params = {}, body } = {}) {
  const url = metaGraphUrl(path, method === "GET" ? { ...params, access_token: token } : params);
  const response = await fetch(url, {
    method,
    headers: {
      ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
      ...(token && method !== "GET" ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const err = new Error(data?.error?.message || `Meta API ${response.status}`);
    err.meta = data?.error;
    err.statusCode = response.status;
    throw err;
  }
  return data;
}

function signMetaState(payload) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) throw new Error("META_APP_SECRET env var is not set");
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyMetaState(state) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) throw new Error("META_APP_SECRET env var is not set");
  const raw = String(state || "");
  // base64url state contains no dots except our separator — split on last dot only
  const dotIdx = raw.lastIndexOf(".");
  if (dotIdx === -1) throw new Error("Invalid OAuth state: missing separator");
  const encoded = raw.slice(0, dotIdx);
  const signature = raw.slice(dotIdx + 1);
  if (!encoded || !signature) throw new Error("Invalid OAuth state: empty parts");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url");
  // Pad buffers to same length before timingSafeEqual to avoid crash on mismatch
  const sigBuf = Buffer.from(signature.padEnd(expected.length, " "));
  const expBuf = Buffer.from(expected.padEnd(signature.length, " "));
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error("Invalid OAuth state: signature mismatch");
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid OAuth state: malformed payload");
  }
  if (!payload.ts || Date.now() - payload.ts > 15 * 60 * 1000) {
    throw new Error("OAuth state expired — please try connecting again");
  }
  return payload;
}

function metaRedirectUri() {
  return process.env.META_REDIRECT_URI || "https://merchant-suite.com/api/meta/oauth/callback";
}

const META_SCOPES = [
  "pages_show_list",
  "pages_manage_metadata",
  "pages_messaging",
  "instagram_basic",
  "instagram_manage_messages",
  "business_management",
  "ads_read",
  "whatsapp_business_management",
  "whatsapp_business_messaging",
];

function sanitizeMetaConnection(row) {
  if (!row) return null;
  const { encrypted_user_access_token, ...safe } = row;
  return safe;
}

function sanitizeMetaPage(row) {
  if (!row) return null;
  const { encrypted_page_access_token, ...safe } = row;
  return safe;
}

function sanitizeMetaWhatsApp(row) {
  if (!row) return null;
  const { encrypted_access_token, ...safe } = row;
  return safe;
}

async function getMetaConnectionForOrg(supabase, orgId) {
  const { data, error } = await supabase
    .from("meta_connections")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getMetaStatus(supabase, orgId) {
  const [connection, pages, instagram, whatsapp, ads] = await Promise.all([
    supabase.from("meta_connections").select("*").eq("org_id", orgId).maybeSingle(),
    supabase.from("meta_pages").select("*").eq("org_id", orgId).order("page_name"),
    supabase.from("meta_instagram_accounts").select("*").eq("org_id", orgId).order("account_name"),
    supabase.from("meta_whatsapp_accounts").select("*").eq("org_id", orgId).order("account_name"),
    supabase.from("meta_ad_accounts").select("*").eq("org_id", orgId).order("account_name"),
  ]);
  for (const result of [connection, pages, instagram, whatsapp, ads]) {
    if (result.error) throw result.error;
  }
  return {
    connected: !!connection.data,
    connection: sanitizeMetaConnection(connection.data),
    pages: (pages.data || []).map(sanitizeMetaPage),
    instagramAccounts: instagram.data || [],
    whatsappAccounts: (whatsapp.data || []).map(sanitizeMetaWhatsApp),
    adAccounts: ads.data || [],
  };
}

async function upsertMetaWebhookEvent(supabase, event) {
  await supabase.from("meta_webhook_events").insert({
    org_id: event.orgId || null,
    platform: event.platform || null,
    object_type: event.objectType || null,
    page_id: event.pageId || null,
    instagram_account_id: event.instagramAccountId || null,
    sender_id: event.senderId || null,
    event_type: event.eventType || null,
    payload: event.payload || {},
  });
}

app.get("/api/settings", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const prefix = `${orgId}:`;
    const { data, error } = await supabase.from("app_settings").select("key, value").like("key", `${prefix}%`).order("key");
    if (error) throw error;
    const settings = {};
    for (const row of data || []) {
      if (row.key.startsWith(prefix)) {
        settings[row.key.slice(prefix.length)] = row.value;
      }
    }
    return res.json({ settings });
  } catch (err) {
    return sendError(res, err);
  }
});

app.post("/api/settings", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { settings } = req.body;
    if (!settings || typeof settings !== "object") {
      return res.status(400).json({ error: "settings object required" });
    }
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    await saveOrgSettings(orgId, settings);
    return res.json({ success: true });
  } catch (err) {
    return sendError(res, err);
  }
});

// ─── Billing ─────────────────────────────────────────────────────────────────

async function incrementUsage(orgId, metric) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const settings = await getOrgSettings(orgId, [`usage_${metric}`, "usage_period"]);
  const storedPeriod = settings.usage_period || "";
  let count = parseInt(settings[`usage_${metric}`] || "0", 10);
  if (storedPeriod !== currentMonth) {
    count = 0;
    await saveOrgSettings(orgId, { usage_period: currentMonth, [`usage_${metric}`]: "1" });
    return 1;
  }
  count += 1;
  await saveOrgSettings(orgId, { [`usage_${metric}`]: String(count) });
  return count;
}

const PLAN_LIMITS = {
  starter:    { aiInboxReplies: 300,   aiOrderCaptures: 50,   aiExtractions: 100,   fraudChecks: 50 },
  growth:     { aiInboxReplies: 1500,  aiOrderCaptures: 300,  aiExtractions: 500,   fraudChecks: 300 },
  pro:        { aiInboxReplies: 7000,  aiOrderCaptures: 1500, aiExtractions: 2000,  fraudChecks: 1500 },
  enterprise: { aiInboxReplies: 30000, aiOrderCaptures: 99999, aiExtractions: 10000, fraudChecks: 99999 },
};

const PLAN_PRICES = { starter: 1499, growth: 3499, pro: 7999, enterprise: 14999 };

app.get("/api/billing/plan", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId, role } = await getUserOrg(supabase, user.id);
    if (role !== "admin") return res.status(403).json({ error: "Admin only" });

    const settings = await getOrgSettings(orgId, ["billing_plan", "billing_started_at", "billing_renews_at", "billing_status", "trial_ends_at"]);
    const planId = settings.billing_plan || "growth";

    // Check if trial has expired
    let status = settings.billing_status || "active";
    if (status === "trialing" && settings.trial_ends_at) {
      const trialEnd = new Date(settings.trial_ends_at).getTime();
      if (Date.now() > trialEnd) {
        status = "trial_expired";
      }
    }

    const plan = {
      id: planId,
      name: planId.charAt(0).toUpperCase() + planId.slice(1),
      price: PLAN_PRICES[planId] || 3499,
      interval: "monthly",
      status,
      startedAt: settings.billing_started_at || new Date().toISOString(),
      renewsAt: settings.billing_renews_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      trialEndsAt: settings.trial_ends_at || null,
    };
    return res.json({ plan });
  } catch (err) {
    return sendError(res, err);
  }
});

app.post("/api/billing/plan", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId, role } = await getUserOrg(supabase, user.id);
    if (role !== "admin") return res.status(403).json({ error: "Admin only" });

    const { planId } = req.body;
    if (!planId || !PLAN_LIMITS[planId]) {
      return res.status(400).json({ error: "Invalid plan. Must be one of: starter, growth, pro, enterprise" });
    }

    const now = new Date().toISOString();
    const renewsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await saveOrgSettings(orgId, {
      billing_plan: planId,
      billing_started_at: now,
      billing_renews_at: renewsAt,
      billing_status: "active",
    });

    return res.json({ success: true, plan: { id: planId, price: PLAN_PRICES[planId], renewsAt } });
  } catch (err) {
    return sendError(res, err);
  }
});

app.get("/api/billing/usage", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId, role } = await getUserOrg(supabase, user.id);
    if (role !== "admin") return res.status(403).json({ error: "Admin only" });

    const settings = await getOrgSettings(orgId, [
      "billing_plan",
      "usage_ai_inbox_replies",
      "usage_ai_order_captures",
      "usage_ai_extractions",
      "usage_fraud_checks",
      "usage_period",
    ]);

    const planId = settings.billing_plan || "growth";
    const limits = PLAN_LIMITS[planId] || PLAN_LIMITS.growth;

    const currentMonth = new Date().toISOString().slice(0, 7);
    const storedPeriod = settings.usage_period || "";

    // Reset counts if the period has changed (new month)
    let aiInboxReplies = parseInt(settings.usage_ai_inbox_replies || "0", 10);
    let aiOrderCaptures = parseInt(settings.usage_ai_order_captures || "0", 10);
    let aiExtractions = parseInt(settings.usage_ai_extractions || "0", 10);
    let fraudChecks = parseInt(settings.usage_fraud_checks || "0", 10);

    if (storedPeriod !== currentMonth) {
      aiInboxReplies = 0;
      aiOrderCaptures = 0;
      aiExtractions = 0;
      fraudChecks = 0;
      await saveOrgSettings(orgId, {
        usage_ai_inbox_replies: "0",
        usage_ai_order_captures: "0",
        usage_ai_extractions: "0",
        usage_fraud_checks: "0",
        usage_period: currentMonth,
      });
    }

    const monthStart = new Date(`${currentMonth}-01`);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    monthEnd.setDate(0);
    const periodLabel = `${monthStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} — ${monthEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;

    return res.json({
      usage: {
        aiInboxReplies: { used: aiInboxReplies, limit: limits.aiInboxReplies },
        aiOrderCaptures: { used: aiOrderCaptures, limit: limits.aiOrderCaptures },
        aiExtractions: { used: aiExtractions, limit: limits.aiExtractions },
        fraudChecks: { used: fraudChecks, limit: limits.fraudChecks },
        period: periodLabel,
      },
    });
  } catch (err) {
    return sendError(res, err);
  }
});

app.get("/api/billing/invoices", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId, role } = await getUserOrg(supabase, user.id);
    if (role !== "admin") return res.status(403).json({ error: "Admin only" });

    const settings = await getOrgSettings(orgId, ["billing_invoices"]);
    let invoices = [];
    try {
      invoices = JSON.parse(settings.billing_invoices || "[]");
    } catch { /* empty */ }

    return res.json({ invoices });
  } catch (err) {
    return sendError(res, err);
  }
});

// ─── Stripe Billing ─────────────────────────────────────────────────────────

app.post("/api/billing/checkout", async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: "Stripe not configured" });
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId, role } = await getUserOrg(supabase, user.id);
    if (role !== "admin") return res.status(403).json({ error: "Admin only" });

    const { planId } = req.body;
    if (!planId || !STRIPE_PRICE_MAP[planId]) {
      return res.status(400).json({ error: "Invalid plan" });
    }

    const settings = await getOrgSettings(orgId, ["stripe_customer_id"]);
    let customerId = settings.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { org_id: orgId },
      });
      customerId = customer.id;
      await saveOrgSettings(orgId, { stripe_customer_id: customerId });
    }

    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      client_reference_id: orgId,
      mode: "subscription",
      line_items: [{ price: STRIPE_PRICE_MAP[planId], quantity: 1 }],
      success_url: `${baseUrl}/billing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/billing`,
      metadata: { org_id: orgId, plan_id: planId },
      subscription_data: { metadata: { org_id: orgId, plan_id: planId } },
    });

    return res.json({ url: session.url });
  } catch (err) {
    return sendError(res, err);
  }
});

app.post("/api/billing/portal", async (req, res) => {
  try {
    if (!stripe) return res.status(503).json({ error: "Stripe not configured" });
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId, role } = await getUserOrg(supabase, user.id);
    if (role !== "admin") return res.status(403).json({ error: "Admin only" });

    const settings = await getOrgSettings(orgId, ["stripe_customer_id"]);
    if (!settings.stripe_customer_id) {
      return res.status(400).json({ error: "No billing account yet. Subscribe to a plan first." });
    }

    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const session = await stripe.billingPortal.sessions.create({
      customer: settings.stripe_customer_id,
      return_url: `${baseUrl}/billing`,
    });

    return res.json({ url: session.url });
  } catch (err) {
    return sendError(res, err);
  }
});

app.post("/api/webhooks/stripe", async (req, res) => {
  try {
    if (!stripe) return res.status(503).end();
    const sig = req.headers["stripe-signature"];
    if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(400).json({ error: "Missing signature" });
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error("[Stripe] Webhook signature verification failed:", err.message);
      return res.status(400).json({ error: "Invalid signature" });
    }

    const supabase = getServiceSupabase();

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const orgId = session.metadata?.org_id || session.client_reference_id;
        const planId = session.metadata?.plan_id;
        if (orgId && planId) {
          const now = new Date().toISOString();
          const renewsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          await saveOrgSettings(orgId, {
            billing_plan: planId,
            billing_started_at: now,
            billing_renews_at: renewsAt,
            billing_status: "active",
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object;
        const orgId = sub.metadata?.org_id;
        if (orgId) {
          const priceId = sub.items?.data?.[0]?.price?.id;
          const planId = Object.entries(STRIPE_PRICE_MAP).find(([, v]) => v === priceId)?.[0];
          const updates = { billing_status: sub.status };
          if (planId) updates.billing_plan = planId;
          if (sub.current_period_end) {
            updates.billing_renews_at = new Date(sub.current_period_end * 1000).toISOString();
          }
          await saveOrgSettings(orgId, updates);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const orgId = sub.metadata?.org_id;
        if (orgId) {
          await saveOrgSettings(orgId, {
            billing_status: "canceled",
            stripe_subscription_id: "",
          });
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const { data: settingsRows } = await supabase
          .from("app_settings")
          .select("key, value")
          .like("key", "%:stripe_customer_id")
          .eq("value", customerId)
          .maybeSingle();
        const orgId = settingsRows?.key?.split(":")[0];
        if (orgId) {
          const existingSettings = await getOrgSettings(orgId, ["billing_invoices"]);
          let invoices = [];
          try { invoices = JSON.parse(existingSettings.billing_invoices || "[]"); } catch {}
          invoices.unshift({
            id: invoice.id,
            date: new Date(invoice.created * 1000).toISOString(),
            amount: Math.round(invoice.amount_paid / 100),
            status: "paid",
            url: invoice.hosted_invoice_url || "",
          });
          await saveOrgSettings(orgId, { billing_invoices: JSON.stringify(invoices.slice(0, 50)) });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const { data: settingsRows } = await supabase
          .from("app_settings")
          .select("key, value")
          .like("key", "%:stripe_customer_id")
          .eq("value", customerId)
          .maybeSingle();
        const orgId = settingsRows?.key?.split(":")[0];
        if (orgId) {
          await saveOrgSettings(orgId, { billing_status: "past_due" });
        }
        break;
      }
    }

    return res.json({ received: true });
  } catch (err) {
    console.error("[Stripe] Webhook error:", err);
    return res.status(500).json({ error: "Webhook handler error" });
  }
});

// ─── Shopify OAuth (per-tenant credentials) ────────────────────────────────

const SHOPIFY_SCOPES = "read_orders,read_products,read_customers";

function shopifyRedirectUri() {
  return process.env.SHOPIFY_REDIRECT_URI || "https://merchant-suite.com/api/auth/shopify/callback";
}

function signShopifyState(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyShopifyState(state, secret) {
  const raw = String(state || "");
  const dotIdx = raw.lastIndexOf(".");
  if (dotIdx === -1) throw new Error("Invalid OAuth state: missing separator");
  const encoded = raw.slice(0, dotIdx);
  const signature = raw.slice(dotIdx + 1);
  if (!encoded || !signature) throw new Error("Invalid OAuth state: empty parts");
  const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
  const sigBuf = Buffer.from(signature.padEnd(expected.length, " "));
  const expBuf = Buffer.from(expected.padEnd(signature.length, " "));
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error("Invalid OAuth state: signature mismatch");
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("Invalid OAuth state: malformed payload");
  }
  if (!payload.ts || Date.now() - payload.ts > 15 * 60 * 1000) {
    throw new Error("OAuth state expired — please try connecting again");
  }
  return payload;
}

function verifyShopifyHmac(query, secret) {
  const { hmac, ...params } = query;
  if (!hmac) return false;
  const sorted = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  const computed = crypto.createHmac("sha256", secret).update(sorted).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hmac));
}

app.post("/api/auth/shopify/init", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const cfg = await getOrgSettings(orgId, ["shopify_store_url", "shopify_client_id", "shopify_client_secret"]);
    if (!cfg.shopify_store_url || !cfg.shopify_client_id || !cfg.shopify_client_secret) {
      return res.status(400).json({ error: "Please save your Shopify Store URL, Client ID, and Client Secret first" });
    }
    const cleanShop = cfg.shopify_store_url.replace(/^https?:\/\//, "").replace(/\/$/, "").trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(cleanShop)) {
      return res.status(400).json({ error: "Invalid shop domain. Expected format: yourstore.myshopify.com" });
    }
    const state = signShopifyState(
      { orgId, userId: user.id, shop: cleanShop, ts: Date.now(), nonce: crypto.randomUUID() },
      cfg.shopify_client_secret
    );
    const url = `https://${cleanShop}/admin/oauth/authorize?client_id=${cfg.shopify_client_id}&scope=${SHOPIFY_SCOPES}&redirect_uri=${encodeURIComponent(shopifyRedirectUri())}&state=${state}`;
    return res.json({ url });
  } catch (err) {
    return sendError(res, err);
  }
});

app.get("/api/auth/shopify/callback", async (req, res) => {
  try {
    const { code, hmac, shop, state } = req.query;
    if (!code || !shop || !state) {
      return res.redirect("/settings?shopify=error&message=" + encodeURIComponent("Missing OAuth parameters"));
    }
    // Decode state to get orgId, then load that org's client_secret for verification
    let statePayload;
    try {
      const dotIdx = String(state).lastIndexOf(".");
      const encoded = String(state).slice(0, dotIdx);
      statePayload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    } catch {
      return res.redirect("/settings?shopify=error&message=" + encodeURIComponent("Invalid OAuth state"));
    }
    const orgId = statePayload.orgId;
    if (!orgId) {
      return res.redirect("/settings?shopify=error&message=" + encodeURIComponent("Missing org in state"));
    }
    const cfg = await getOrgSettings(orgId, ["shopify_client_id", "shopify_client_secret"]);
    if (!cfg.shopify_client_id || !cfg.shopify_client_secret) {
      return res.redirect("/settings?shopify=error&message=" + encodeURIComponent("Shopify credentials not found"));
    }
    if (!verifyShopifyHmac(req.query, cfg.shopify_client_secret)) {
      return res.redirect("/settings?shopify=error&message=" + encodeURIComponent("HMAC verification failed"));
    }
    const verified = verifyShopifyState(state, cfg.shopify_client_secret);
    if (shop !== verified.shop) {
      return res.redirect("/settings?shopify=error&message=" + encodeURIComponent("Shop mismatch"));
    }
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: cfg.shopify_client_id,
        client_secret: cfg.shopify_client_secret,
        code,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      const msg = tokenData.error_description || tokenData.error || "Token exchange failed";
      return res.redirect("/settings?shopify=error&message=" + encodeURIComponent(msg));
    }
    await saveOrgSettings(orgId, {
      shopify_admin_api_token: tokenData.access_token,
      shopify_oauth_connected: "true",
      shopify_connected_scope: tokenData.scope || SHOPIFY_SCOPES,
    });
    return res.redirect("/settings?shopify=connected");
  } catch (err) {
    console.error("[Shopify OAuth] callback failed:", errorMessage(err));
    return res.redirect("/settings?shopify=error&message=" + encodeURIComponent(errorMessage(err)));
  }
});

app.get("/api/auth/shopify/status", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const cfg = await getOrgSettings(orgId, ["shopify_store_url", "shopify_admin_api_token", "shopify_oauth_connected"]);
    const connected = !!(cfg.shopify_store_url && cfg.shopify_admin_api_token && cfg.shopify_oauth_connected === "true");
    return res.json({
      connected,
      shop: cfg.shopify_store_url || null,
      oauth: cfg.shopify_oauth_connected === "true",
    });
  } catch (err) {
    return sendError(res, err);
  }
});

app.post("/api/auth/shopify/disconnect", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    await saveOrgSettings(orgId, {
      shopify_admin_api_token: "",
      shopify_oauth_connected: "",
      shopify_connected_scope: "",
    });
    return res.json({ success: true });
  } catch (err) {
    return sendError(res, err);
  }
});

// ─── Storefront Handle ───────────────────────────────────────────────────────

app.post("/api/storefront/handle", rateLimitHandleUser, rateLimitHandleIp, async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId, role } = await getUserOrg(supabase, user.id);
    if (role !== "admin") return res.status(403).json({ error: "Admin only" });

    const raw = typeof req.body?.handle === "string" ? req.body.handle : "";
    try {
      const handle = await setStorefrontHandle(orgId, raw);
      return res.json({ success: true, handle });
    } catch (err) {
      if (err.code === "HANDLE_TAKEN") {
        return res.status(409).json({ error: err.message });
      }
      if (err.message?.startsWith("Handle must be") || err.message?.includes("reserved handle")) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }
  } catch (err) {
    return sendError(res, err);
  }
});

app.get("/api/storefront/handle", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const handle = await getStorefrontHandle(orgId);
    return res.json({ handle: handle || null });
  } catch (err) {
    return sendError(res, err);
  }
});

// ─── Storefront Settings ──────────────────────────────────────────────────────
// Authenticated CRUD for the merchant's storefront branding and configuration.
// Reads/writes the storefront_settings table (one row per org_id).

app.get("/api/storefront/settings", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const { data, error } = await supabase
      .from("storefront_settings")
      .select("*")
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) throw error;
    // Return defaults if no row exists yet (merchant hasn't configured storefront)
    return res.json({
      settings: data ? {
        enabled: data.enabled,
        storeName: data.store_name,
        tagline: data.tagline,
        logoUrl: data.logo_url,
        faviconUrl: data.favicon_url,
        primaryColor: data.primary_color,
        backgroundColor: data.background_color,
        fontFamily: data.font_family,
        contactPhone: data.contact_phone,
        contactEmail: data.contact_email,
        socialFacebook: data.social_facebook,
        socialInstagram: data.social_instagram,
        socialTiktok: data.social_tiktok,
        seoTitleTemplate: data.seo_title_template,
        seoDescriptionTemplate: data.seo_description_template,
        shippingZones: data.shipping_zones,
      } : {
        enabled: false,
        storeName: "",
        tagline: "",
        logoUrl: null,
        faviconUrl: null,
        primaryColor: "#000000",
        backgroundColor: "#FAFAF8",
        fontFamily: "Geist Sans",
        contactPhone: null,
        contactEmail: null,
        socialFacebook: null,
        socialInstagram: null,
        socialTiktok: null,
        seoTitleTemplate: "{product_name} | {store_name}",
        seoDescriptionTemplate: "{product_description}",
        shippingZones: [],
      },
    });
  } catch (err) {
    return sendError(res, err);
  }
});

app.post("/api/storefront/settings", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId, role } = await getUserOrg(supabase, user.id);
    if (role !== "admin") return res.status(403).json({ error: "Admin only" });

    const s = req.body?.settings || {};
    const row = {
      org_id: orgId,
      enabled: Boolean(s.enabled),
      store_name: s.storeName || null,
      tagline: s.tagline || null,
      logo_url: s.logoUrl || null,
      favicon_url: s.faviconUrl || null,
      primary_color: s.primaryColor || "#000000",
      background_color: s.backgroundColor || "#FAFAF8",
      font_family: s.fontFamily || "Geist Sans",
      contact_phone: s.contactPhone || null,
      contact_email: s.contactEmail || null,
      social_facebook: s.socialFacebook || null,
      social_instagram: s.socialInstagram || null,
      social_tiktok: s.socialTiktok || null,
      seo_title_template: s.seoTitleTemplate || "{product_name} | {store_name}",
      seo_description_template: s.seoDescriptionTemplate || "{product_description}",
      shipping_zones: Array.isArray(s.shippingZones) ? s.shippingZones : [],
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("storefront_settings")
      .upsert(row, { onConflict: "org_id" });
    if (error) throw error;

    // Purge the cached config so the storefront picks up changes quickly
    await purgeStorefrontConfigCache(orgId);

    return res.json({ success: true });
  } catch (err) {
    return sendError(res, err);
  }
});

// Purge Cloudflare cache for the storefront config endpoint.
// Called after settings are saved so the storefront reflects changes immediately.
async function purgeStorefrontConfigCache(orgId) {
  if (!CLOUDFLARE_ZONE_ID || !CLOUDFLARE_API_TOKEN || !PUBLIC_DOMAIN) return;
  const handle = await getStorefrontHandle(orgId);
  if (!handle) return;
  try {
    await fetch(
      `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          files: [`https://${PUBLIC_DOMAIN}/api/public/v1/${handle}/config`],
        }),
      },
    );
  } catch (e) {
    console.warn("[Purge] Could not purge storefront config cache:", e.message);
  }
}

// ─── Integration Test Endpoints ──────────────────────────────────────────────

// Test Facebook Ads connection server-side so the token never appears in a browser URL
app.post("/api/settings/test-facebook", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const cfg = await getOrgSettings(orgId, ["facebook_access_token", "facebook_ad_account_id"]);
    const token = cfg["facebook_access_token"];
    const accountId = cfg["facebook_ad_account_id"];
    if (!token || !accountId) return res.status(400).json({ error: "Facebook credentials not configured" });
    const id = accountId.startsWith("act_") ? accountId : `act_${accountId}`;
    const fbRes = await fetch(
      `https://graph.facebook.com/v20.0/${id}/insights?fields=spend&date_preset=last_30d`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const fbData = await fbRes.json();
    if (fbData.error) return res.status(400).json({ error: "Facebook API error", message: fbData.error.message });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "An internal error occurred" });
  }
});


// ─── Meta Business OAuth + Asset Sync ───────────────────────────────────────

// Used ONLY for the standard OAuth redirect flow (/api/meta/oauth/callback).
// Do NOT use for FB.login() Embedded Signup — popup codes are bound to
// Facebook's internal xd_arbiter redirect URI and cannot be exchanged
// server-side regardless of what redirect_uri value you pass.
async function exchangeMetaCodeForToken(code, { fromEmbeddedSignup = false } = {}) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("Missing META_APP_ID or META_APP_SECRET env vars");

  const shortLived = await metaGraph("/oauth/access_token", {
    params: {
      client_id: appId,
      client_secret: appSecret,
      // Standard OAuth redirect flow must pass the registered callback URL.
      // fromEmbeddedSignup omits it (empty string is skipped by metaGraphUrl).
      redirect_uri: fromEmbeddedSignup ? "" : metaRedirectUri(),
      code,
    },
  });

  const longLived = await metaGraph("/oauth/access_token", {
    params: {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLived.access_token,
    },
  });

  return longLived.access_token || shortLived.access_token;
}

async function subscribeMetaPage(pageId, pageToken) {
  try {
    await metaGraph(`/${pageId}/subscribed_apps`, {
      method: "POST",
      token: pageToken,
      body: {
        subscribed_fields: [
          "messages",
          "messaging_postbacks",
          "messaging_optins",
          "messaging_referrals",
          "message_deliveries",
          "message_reads",
        ],
      },
    });
    console.log(`[Meta] Page ${pageId} subscribed.`);
    return { subscribed: true, error: null };
  } catch (err) {
    console.warn(`[Meta] Failed to subscribe page ${pageId}:`, errorMessage(err));
    return { subscribed: false, error: errorMessage(err) };
  }
}

// Subscribe a WhatsApp Business Account to receive message webhooks.
// Requires the WABA id and a user token with whatsapp_business_messaging scope.
// This is separate from Facebook page subscription — must be called for each WABA.
async function subscribeWhatsAppWABA(wabaId, userToken) {
  try {
    // Check current subscription first
    let currentSubs = [];
    try {
      const existing = await metaGraph(`/${wabaId}/subscribed_apps`, { token: userToken });
      currentSubs = existing?.data || [];
    } catch { /* ignore — may not have read permission */ }

    await metaGraph(`/${wabaId}/subscribed_apps`, {
      method: "POST",
      token: userToken,
    });
    console.log(`[Meta] WhatsApp WABA ${wabaId} subscribed to webhook. Previous subs: ${JSON.stringify(currentSubs.map(s => s.name || s.id))}`);
    return { subscribed: true };
  } catch (err) {
    console.warn(`[Meta] Failed to subscribe WhatsApp WABA ${wabaId}:`, errorMessage(err));
    return { subscribed: false, error: errorMessage(err) };
  }
}

async function unsubscribeMetaPage(pageId, pageToken) {
  try {
    await metaGraph(`/${pageId}/subscribed_apps`, { method: "DELETE", token: pageToken });
  } catch (err) {
    console.warn(`[Meta] Failed to unsubscribe page ${pageId}:`, errorMessage(err));
  }
}

async function syncMetaAssets({ supabase, orgId, userId, userToken }) {
  const me = await metaGraph("/me", { token: userToken, params: { fields: "id,name,email" } });
  const expiresAt = new Date(Date.now() + 55 * 24 * 60 * 60 * 1000).toISOString();

  const { data: connection, error: connectionError } = await supabase
    .from("meta_connections")
    .upsert({
      org_id: orgId,
      connected_by_user_id: userId,
      meta_user_id: me.id,
      meta_user_name: me.name || "",
      encrypted_user_access_token: encryptToken(userToken),
      token_expires_at: expiresAt,
      scopes: META_SCOPES,
      status: "connected",
      updated_at: new Date().toISOString(),
    }, { onConflict: "org_id" })
    .select()
    .single();
  if (connectionError) throw connectionError;

  const pagesResult = await metaGraph("/me/accounts", {
    token: userToken,
    params: {
      fields: "id,name,access_token,tasks,instagram_business_account{id,username,name}",
      limit: 100,
    },
  });
  const pages = pagesResult.data || [];

  let subscribed = 0;
  for (const page of pages) {
    const subscription = page.access_token ? await subscribeMetaPage(page.id, page.access_token) : { subscribed: false };
    if (subscription.subscribed) subscribed++;

    const { error: pageError } = await supabase
      .from("meta_pages")
      .upsert({
        org_id: orgId,
        connection_id: connection.id,
        page_id: page.id,
        page_name: page.name || "",
        encrypted_page_access_token: encryptToken(page.access_token || ""),
        instagram_account_id: page.instagram_business_account?.id || null,
        webhook_subscribed: !!subscription.subscribed,
        status: "connected",
        updated_at: new Date().toISOString(),
      }, { onConflict: "org_id,page_id" });
    if (pageError) throw pageError;

    if (page.instagram_business_account?.id) {
      const ig = page.instagram_business_account;
      const { error: igError } = await supabase
        .from("meta_instagram_accounts")
        .upsert({
          org_id: orgId,
          connection_id: connection.id,
          page_id: page.id,
          instagram_account_id: ig.id,
          username: ig.username || "",
          account_name: ig.name || ig.username || "",
          status: "connected",
          updated_at: new Date().toISOString(),
        }, { onConflict: "org_id,instagram_account_id" });
      if (igError) throw igError;
    }
  }

  try {
    const adAccounts = await metaGraph("/me/adaccounts", {
      token: userToken,
      params: { fields: "id,account_id,name,account_status,currency", limit: 100 },
    });
    for (const ad of adAccounts.data || []) {
      const adAccountId = ad.id || (ad.account_id ? `act_${ad.account_id}` : null);
      if (!adAccountId) continue;
      const { error: adError } = await supabase
        .from("meta_ad_accounts")
        .upsert({
          org_id: orgId,
          connection_id: connection.id,
          ad_account_id: adAccountId,
          account_name: ad.name || adAccountId,
          currency: ad.currency || null,
          status: String(ad.account_status || "connected"),
          updated_at: new Date().toISOString(),
        }, { onConflict: "org_id,ad_account_id" });
      if (adError) throw adError;
    }
  } catch (err) {
    console.warn("[Meta] Ad account sync skipped:", errorMessage(err));
  }

  try {
    const businesses = await metaGraph("/me/businesses", {
      token: userToken,
      params: { fields: "id,name", limit: 50 },
    });
    for (const business of businesses.data || []) {
      const wabas = await metaGraph(`/${business.id}/owned_whatsapp_business_accounts`, {
        token: userToken,
        params: { fields: "id,name,phone_numbers{id,display_phone_number,verified_name}", limit: 50 },
      });
      for (const waba of wabas.data || []) {
        // Subscribe this WABA to receive webhook message events
        await subscribeWhatsAppWABA(waba.id, userToken);

        const phoneNumbers = waba.phone_numbers?.data?.length ? waba.phone_numbers.data : [null];
        for (const phone of phoneNumbers) {
          const { error: waError } = await supabase
            .from("meta_whatsapp_accounts")
            .upsert({
              org_id: orgId,
              connection_id: connection.id,
              whatsapp_business_account_id: waba.id,
              phone_number_id: phone?.id || null,
              display_phone_number: phone?.display_phone_number || "",
              account_name: phone?.verified_name || waba.name || "",
              encrypted_access_token: encryptToken(userToken),
              status: "connected",
              updated_at: new Date().toISOString(),
            }, { onConflict: "org_id,whatsapp_business_account_id,phone_number_id" });
          if (waError) throw waError;
        }
      }
    }
  } catch (err) {
    console.warn("[Meta] WhatsApp asset sync skipped:", errorMessage(err));
  }

  // Build the channels list from what was actually discovered in this OAuth flow,
  // then MERGE with whatever was already stored — so connecting WhatsApp later
  // never clobbers the existing facebook/instagram setting, and vice versa.
  const discoveredChannels = [];
  if (pages.length > 0) {
    discoveredChannels.push("facebook");
    if (pages.some((p) => p.instagram_business_account?.id)) discoveredChannels.push("instagram");
  }
  // Check if any WhatsApp accounts were upserted in this sync
  const { data: waRows } = await supabase
    .from("meta_whatsapp_accounts")
    .select("id")
    .eq("org_id", orgId)
    .limit(1);
  if (waRows?.length > 0) discoveredChannels.push("whatsapp");

  // Read existing channels and merge (union) — never remove a channel that was already enabled
  const existingSettings = await getOrgSettings(orgId, ["auto_reply_channels"]);
  let existingChannels = [];
  try { existingChannels = JSON.parse(existingSettings.auto_reply_channels || "[]"); } catch { existingChannels = []; }
  const mergedChannels = Array.from(new Set([...existingChannels, ...discoveredChannels]));

  await saveOrgSettings(orgId, {
    ai_auto_reply_enabled: "true",
    auto_reply_channels: JSON.stringify(mergedChannels),
    auto_reply_handoff_rules: JSON.stringify({ pause_on_human_reply: true }),
  });

  return { connection, pages: pages.length, subscribed };
}

app.get("/api/meta/status", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const status = await getMetaStatus(supabase, orgId);
    const settings = await getOrgSettings(orgId, ["ai_auto_reply_enabled", "auto_reply_channels", "auto_reply_handoff_rules"]);
    return res.json({
      ...status,
      aiAutomation: {
        enabled: settings.ai_auto_reply_enabled === "true",
        channels: JSON.parse(settings.auto_reply_channels || "[]"),
        handoffRules: JSON.parse(settings.auto_reply_handoff_rules || "{}"),
      },
      whatsappConfigReady: !!process.env.META_WHATSAPP_CONFIG_ID,
    });
  } catch (err) {
    return sendError(res, err);
  }
});

// PATCH /api/meta/ai-automation — update enabled flag and/or per-channel toggles
app.patch("/api/meta/ai-automation", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const { enabled, channels } = req.body;
    const patch = {};
    if (enabled !== undefined) patch.ai_auto_reply_enabled = enabled ? "true" : "false";
    if (Array.isArray(channels)) {
      const valid = ["facebook", "instagram", "whatsapp"];
      patch.auto_reply_channels = JSON.stringify(channels.filter((c) => valid.includes(c)));
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: "Provide enabled or channels" });
    await saveOrgSettings(orgId, patch);
    return res.json({ success: true });
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/meta/resubscribe-whatsapp
// Re-subscribes all connected WhatsApp WABAs to webhooks without needing a full re-OAuth.
// Call this once after connecting a new WhatsApp account to fix missing webhook subscriptions.
app.post("/api/meta/resubscribe-whatsapp", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    // Get the user access token from the Meta connection
    const { data: connection } = await supabase
      .from("meta_connections")
      .select("encrypted_user_access_token")
      .eq("org_id", orgId)
      .maybeSingle();

    if (!connection?.encrypted_user_access_token) {
      return res.status(400).json({ error: "No Meta connection found. Please connect via OAuth first." });
    }
    const userToken = decryptToken(connection.encrypted_user_access_token);

    // Get all WABAs for this org
    const { data: waAccounts } = await supabase
      .from("meta_whatsapp_accounts")
      .select("whatsapp_business_account_id")
      .eq("org_id", orgId);

    if (!waAccounts?.length) {
      return res.status(400).json({ error: "No WhatsApp accounts found for this org." });
    }

    // Deduplicate WABA IDs (multiple phone numbers share one WABA)
    const wabaIds = [...new Set(waAccounts.map((a) => a.whatsapp_business_account_id))];
    const results = [];
    for (const wabaId of wabaIds) {
      const result = await subscribeWhatsAppWABA(wabaId, userToken);
      results.push({ wabaId, ...result });
    }

    const succeeded = results.filter((r) => r.subscribed).length;
    return res.json({
      success: true,
      message: `Subscribed ${succeeded}/${wabaIds.length} WhatsApp Business Accounts to webhooks.`,
      results,
    });
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/meta/resubscribe-pages
// Re-subscribes all Facebook Pages with the full field list (Messenger + Instagram DMs).
// Run this once after adding instagram_manage_messages to the subscription.
app.post("/api/meta/resubscribe-pages", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    const { data: pages } = await supabase
      .from("meta_pages")
      .select("page_id, encrypted_page_access_token")
      .eq("org_id", orgId);

    if (!pages?.length) {
      return res.status(400).json({ error: "No Facebook Pages found for this org." });
    }

    const results = [];
    for (const page of pages) {
      const token = page.encrypted_page_access_token
        ? decryptToken(page.encrypted_page_access_token)
        : "";
      if (!token) { results.push({ pageId: page.page_id, subscribed: false, error: "No token" }); continue; }
      const result = await subscribeMetaPage(page.page_id, token);
      results.push({ pageId: page.page_id, ...result });
    }

    const succeeded = results.filter((r) => r.subscribed).length;
    const errors = results.filter((r) => !r.subscribed).map((r) => `${r.pageId}: ${r.error}`);
    console.log("[Meta Resubscribe] results:", JSON.stringify(results));
    return res.json({
      success: succeeded > 0,
      message: succeeded > 0
        ? `Re-subscribed ${succeeded}/${pages.length} pages with Instagram DM fields.`
        : `Failed to subscribe all ${pages.length} pages. ${errors[0] || "Check page tokens."}`,
      results,
    });
  } catch (err) {
    return sendError(res, err);
  }
});

// ── WhatsApp Embedded Signup ──────────────────────────────────────────────────

// GET /api/meta/whatsapp/config
// Returns public config needed by the Embedded Signup frontend flow.
app.get("/api/meta/whatsapp/config", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    return res.json({
      appId: process.env.META_APP_ID || "",
      configId: process.env.META_WHATSAPP_CONFIG_ID || "",
      ready: !!(process.env.META_APP_ID && process.env.META_WHATSAPP_CONFIG_ID),
    });
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/meta/whatsapp/exchange-token
// Called after Embedded Signup completes. Receives the auth code from the
// FB SDK callback, exchanges it for a token, then syncs the WABA assets.
// Uses META_SYSTEM_USER_TOKEN for ongoing WABA operations if available.
app.post("/api/meta/whatsapp/exchange-token", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { code, accessToken, wabaId, phoneNumberId } = req.body;
    if (!accessToken && !code) return res.status(400).json({ error: "accessToken is required" });

    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
      return res.status(500).json({ error: "META_APP_ID or META_APP_SECRET not configured" });
    }

    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    // The correct Embedded Signup token flow:
    //
    // FB.login() popup returns authResponse.accessToken (short-lived user token).
    // We extend it to a long-lived token via grant_type=fb_exchange_token.
    // No redirect_uri is needed or used — it has nothing to do with OAuth redirects.
    //
    // The "code" path is kept only as a last-resort fallback but should never be
    // reached in normal operation because FB.login() popup codes are bound to
    // Facebook's internal xd_arbiter URI and cannot be exchanged server-side.
    let userToken;
    try {
      if (accessToken) {
        console.log("[WA Signup] extending short-lived user token via fb_exchange_token");
        const longLived = await metaGraph("/oauth/access_token", {
          params: {
            grant_type: "fb_exchange_token",
            client_id: process.env.META_APP_ID,
            client_secret: process.env.META_APP_SECRET,
            fb_exchange_token: accessToken,
          },
        });
        userToken = longLived.access_token || accessToken;
        console.log("[WA Signup] long-lived token obtained");
      } else {
        // Fallback: code path — likely to fail with redirect_uri mismatch for popup flows
        console.warn("[WA Signup] falling back to code exchange — this may fail for FB.login() popup codes");
        userToken = await exchangeMetaCodeForToken(code, { fromEmbeddedSignup: true });
      }
    } catch (err) {
      console.error("[WA Signup] token exchange failed:", errorMessage(err));
      return res.status(400).json({ error: `Token exchange failed: ${errorMessage(err)}` });
    }

    // If we have a system user token and a specific WABA ID from the session info,
    // use the system user token for the WABA subscription (more reliable, doesn't expire)
    const systemToken = process.env.META_SYSTEM_USER_TOKEN;

    // If wabaId came from the session postMessage, subscribe it directly
    if (wabaId && systemToken) {
      try {
        // Subscribe WABA to webhook using system user token
        await subscribeWhatsAppWABA(wabaId, systemToken);

        // Save the WhatsApp account with system user token
        if (phoneNumberId) {
          // Get phone number details
          let phoneDetails = { display_phone_number: "", verified_name: "" };
          try {
            const pn = await metaGraph(`/${phoneNumberId}`, {
              token: systemToken,
              params: { fields: "display_phone_number,verified_name,id" },
            });
            phoneDetails = pn;
          } catch { /* ignore */ }

          const { data: conn } = await supabase
            .from("meta_connections")
            .select("id")
            .eq("org_id", orgId)
            .maybeSingle();

          await supabase.from("meta_whatsapp_accounts").upsert({
            org_id: orgId,
            connection_id: conn?.id || null,
            whatsapp_business_account_id: wabaId,
            phone_number_id: phoneNumberId,
            display_phone_number: phoneDetails.display_phone_number || "",
            account_name: phoneDetails.verified_name || "",
            encrypted_access_token: encryptToken(systemToken),
            status: "connected",
            updated_at: new Date().toISOString(),
          }, { onConflict: "org_id,whatsapp_business_account_id,phone_number_id" });

          // Ensure auto-reply is enabled for whatsapp
          const existing = await getOrgSettings(orgId, ["auto_reply_channels", "ai_auto_reply_enabled"]);
          let channels = [];
          try { channels = JSON.parse(existing.auto_reply_channels || "[]"); } catch { channels = []; }
          if (!channels.includes("whatsapp")) channels.push("whatsapp");
          await saveOrgSettings(orgId, {
            ai_auto_reply_enabled: "true",
            auto_reply_channels: JSON.stringify(channels),
          });

          console.log(`[WA Signup] WABA ${wabaId} phone ${phoneNumberId} connected for org ${orgId}`);
        }
      } catch (err) {
        console.warn("[WA Signup] direct WABA setup failed, falling back to syncMetaAssets:", errorMessage(err));
        // Fall through to syncMetaAssets below
      }
    }

    // Full sync using the user token to discover all assets
    const result = await syncMetaAssets({ supabase, orgId, userId: user.id, userToken });

    // Return the refreshed status so the UI updates immediately
    const statusData = await getMetaStatus(supabase, orgId);
    return res.json({
      success: true,
      pages: result.pages,
      subscribed: result.subscribed,
      status: statusData,
    });
  } catch (err) {
    console.error("[WhatsApp Embedded Signup] token exchange failed:", errorMessage(err));
    return sendError(res, err);
  }
});

app.post("/api/meta/oauth/start", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
      return res.status(500).json({ error: "Missing META_APP_ID or META_APP_SECRET env vars" });
    }
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const state = signMetaState({ orgId, userId: user.id, ts: Date.now(), nonce: crypto.randomUUID() });
    const url = new URL(`https://www.facebook.com/${metaGraphVersion()}/dialog/oauth`);
    url.searchParams.set("client_id", process.env.META_APP_ID);
    url.searchParams.set("redirect_uri", metaRedirectUri());
    url.searchParams.set("state", state);
    url.searchParams.set("scope", META_SCOPES.join(","));
    url.searchParams.set("response_type", "code");
    return res.json({ url: url.toString() });
  } catch (err) {
    return sendError(res, err);
  }
});

app.get("/api/meta/oauth/callback", async (req, res) => {
  try {
    if (req.query.error) {
      return res.redirect(`/settings?meta=error&message=${encodeURIComponent(req.query.error_description || req.query.error)}`);
    }
    const rawState = req.query.state;
    if (!rawState) {
      console.error("[Meta OAuth] callback missing state parameter — query:", JSON.stringify(req.query));
      throw new Error("Missing OAuth state parameter");
    }
    const { orgId, userId } = verifyMetaState(rawState);
    const code = req.query.code;
    if (!code) throw new Error("Missing OAuth code");
    const userToken = await exchangeMetaCodeForToken(code);
    const supabase = getServiceSupabase();
    await syncMetaAssets({ supabase, orgId, userId, userToken });
    return res.redirect("/settings?meta=connected");
  } catch (err) {
    console.error("[Meta OAuth] callback failed:", errorMessage(err));
    return res.redirect(`/settings?meta=error&message=${encodeURIComponent(errorMessage(err))}`);
  }
});

app.post("/api/meta/disconnect", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    const { data: pages } = await supabase
      .from("meta_pages")
      .select("page_id, encrypted_page_access_token")
      .eq("org_id", orgId);
    for (const page of pages || []) {
      const token = page.encrypted_page_access_token ? decryptToken(page.encrypted_page_access_token) : "";
      if (token) await unsubscribeMetaPage(page.page_id, token);
    }

    await supabase.from("meta_ad_accounts").delete().eq("org_id", orgId);
    await supabase.from("meta_whatsapp_accounts").delete().eq("org_id", orgId);
    await supabase.from("meta_instagram_accounts").delete().eq("org_id", orgId);
    await supabase.from("meta_pages").delete().eq("org_id", orgId);
    await supabase.from("meta_connections").delete().eq("org_id", orgId);
    await saveOrgSettings(orgId, {
      ai_auto_reply_enabled: "false",
      auto_reply_channels: JSON.stringify([]),
    });

    return res.json({ success: true });
  } catch (err) {
    return sendError(res, err);
  }
});

app.delete("/api/meta/assets/:type/:id", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const { type, id } = req.params;

    if (type === "page") {
      const { data: page, error: pageError } = await supabase
        .from("meta_pages")
        .select("id, page_id, encrypted_page_access_token, instagram_account_id")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();
      if (pageError) throw pageError;
      if (!page) return res.status(404).json({ error: "Page asset not found" });

      const token = page.encrypted_page_access_token ? decryptToken(page.encrypted_page_access_token) : "";
      if (token) await unsubscribeMetaPage(page.page_id, token);
      if (page.instagram_account_id) {
        await supabase
          .from("meta_instagram_accounts")
          .delete()
          .eq("org_id", orgId)
          .eq("instagram_account_id", page.instagram_account_id);
      }
      const { error } = await supabase.from("meta_pages").delete().eq("id", id).eq("org_id", orgId);
      if (error) throw error;
      return res.json({ success: true });
    }

    const tableByType = {
      instagram: "meta_instagram_accounts",
      whatsapp: "meta_whatsapp_accounts",
      ad: "meta_ad_accounts",
    };
    const table = tableByType[type];
    if (!table) return res.status(400).json({ error: "Invalid Meta asset type" });

    const { error } = await supabase.from(table).delete().eq("id", id).eq("org_id", orgId);
    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    return sendError(res, err);
  }
});

// ─── Overview ────────────────────────────────────────────────────────────────

app.get("/api/overview", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    const since = req.query.since || null;
    const until = req.query.until || null;

    const todayDhaka = () => {
      const dhakaMs = Date.now() + 6 * 60 * 60 * 1000;
      const d = new Date(dhakaMs);
      return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    };
    const today = todayDhaka();
    const defaultUntil = today.toISOString().slice(0, 10);
    const defaultSince = new Date(today.getTime() - 6 * 86400000).toISOString().slice(0, 10);

    const rangeSince = since || defaultSince;
    const rangeUntil = until || defaultUntil;

    const rangeDays = Math.round((new Date(`${rangeUntil}T00:00:00Z`) - new Date(`${rangeSince}T00:00:00Z`)) / 86400000) + 1;
    const prevUntil = new Date(new Date(`${rangeSince}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
    const prevSince = new Date(new Date(`${prevUntil}T00:00:00Z`).getTime() - (rangeDays - 1) * 86400000).toISOString().slice(0, 10);

    const { data: allOrders, error: ordersError } = await supabase
      .from("orders")
      .select("*")
      .eq("org_id", orgId)
      .gte("created_at", `${prevSince}T00:00:00+06:00`)
      .lte("created_at", `${rangeUntil}T23:59:59+06:00`);
    if (ordersError) throw ordersError;

    const { data: products } = await supabase
      .from("products")
      .select("id, name, selling_price, cog")
      .eq("org_id", orgId);

    const { data: socialConversations } = await supabase
      .from("social_conversations")
      .select("id, platform, unread_count, created_at")
      .eq("org_id", orgId);

    const convIds = (socialConversations || []).map((c) => c.id);
    let socialMessages = [];
    if (convIds.length > 0) {
      const { data: msgs } = await supabase
        .from("social_messages")
        .select("id, conversation_id, sender, created_at")
        .in("conversation_id", convIds);
      socialMessages = msgs || [];
    }

    const overview = buildOverviewData(
      allOrders || [],
      products || [],
      socialConversations || [],
      socialMessages,
      { since: rangeSince, until: rangeUntil, prevSince, prevUntil }
    );

    console.log(`[Overview] range: ${rangeSince} to ${rangeUntil}, prev: ${prevSince} to ${prevUntil}, orders: ${(allOrders || []).length}`);

    res.json(overview);
  } catch (err) {
    console.error("[Overview] Error:", err.message);
    res.status(500).json({ error: "Failed to load overview data" });
  }
});

// ─── Analytics ───────────────────────────────────────────────────────────────

app.get("/api/analytics", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    // Optional date range from query params (YYYY-MM-DD)
    const since = req.query.since || null;
    const until = req.query.until || null;

    // Use SELECT * so PostgREST doesn't validate individual column names against
    // its schema cache. If org_id isn't cached yet, named selects throw a 500;
    // with * PostgREST returns whatever Postgres gives and we filter in JS.
    let ordersQuery = supabase.from("orders").select("*").eq("org_id", orgId);
    if (since) ordersQuery = ordersQuery.gte("created_at", `${since}T00:00:00+06:00`);
    if (until) ordersQuery = ordersQuery.lte("created_at", `${until}T23:59:59+06:00`);

    const { data: rawOrders, error: ordersError } = await ordersQuery;
    if (ordersError) throw ordersError;

    const orders = rawOrders || [];

    console.log(`[Analytics] date filter: since=${since} until=${until}, matched ${orders.length} orders`);

    const dhakaParts = (value) => {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(value));
      const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return {
        ymd: `${map.year}-${map.month}-${map.day}`,
        hour: map.hour || "00",
      };
    };
    const todayDhaka = () => dhakaParts(new Date()).ymd;
    const addDaysYmd = (ymd, days) => {
      const date = new Date(`${ymd}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    };
    const compareYmd = (a, b) => a.localeCompare(b);
    const orderDays = orders
      .map((order) => dhakaParts(order.created_at).ymd)
      .sort();
    const seriesStart = since || orderDays[0] || todayDhaka();
    const seriesEnd = until || orderDays[orderDays.length - 1] || seriesStart;
    const singleDaySeries = seriesStart === seriesEnd;
    const seriesBuckets = [];

    if (singleDaySeries) {
      for (let hour = 0; hour < 24; hour++) {
        const hh = String(hour).padStart(2, "0");
        seriesBuckets.push({
          key: `${seriesStart}-${hh}`,
          label: `${hour}:00`,
          revenue: 0,
          shipping: 0,
          adSpend: 0,
          totalCog: 0,
          profit: null,
        });
      }
    } else {
      for (let ymd = seriesStart; compareYmd(ymd, seriesEnd) <= 0; ymd = addDaysYmd(ymd, 1)) {
        seriesBuckets.push({
          key: ymd,
          label: ymd,
          revenue: 0,
          shipping: 0,
          adSpend: 0,
          totalCog: 0,
          profit: null,
        });
      }
    }
    const seriesByKey = new Map(seriesBuckets.map((bucket) => [bucket.key, bucket]));

    // Compute COG per order by matching each line item in the order's
    // `product` string against the org's products catalog. Line items with
    // no catalog match or with cog=0 contribute 0 (not an estimate).
    // coverage.set counts priced line items; coverage.total counts all parsed
    // line items.
    let totalCog = 0;
    let cogCoverage = { set: 0, total: 0 };
    const cogByOrderId = new Map();
    try {
      const { data: prods } = await supabase
        .from("products")
        .select("id, name, selling_price, cog")
        .eq("org_id", orgId);
      const result = computeOrderCogs(orders, prods || []);
      totalCog = result.totalCog;
      cogCoverage = result.coverage;
      for (const [orderId, orderCog] of result.cogByOrderId) {
        cogByOrderId.set(orderId, orderCog);
      }
    } catch { /* ignore – no products yet */ }

    // price = total_price from Shopify (subtotal + shipping − discounts) = what the customer pays.
    // delivery_rate = shipping component (kept separately for the Shipping card display).
    // Revenue = total sales (price + delivery_rate per order)
    let revenue = 0;
    let shipping = 0;
    for (const o of orders || []) {
      const orderPrice = parseFloat(o.price || 0);
      const orderShipping = parseFloat(o.delivery_rate || 0);
      const orderRevenue = orderPrice + orderShipping;
      const orderCog = cogByOrderId.get(o.id) || 0;
      revenue += orderRevenue;
      shipping += orderShipping;
      const parts = dhakaParts(o.created_at);
      const bucket = seriesByKey.get(singleDaySeries ? `${parts.ymd}-${parts.hour}` : parts.ymd);
      if (bucket) {
        bucket.revenue += orderRevenue;
        bucket.shipping += orderShipping;
        bucket.totalCog += orderCog;
      }
    }

    // Fetch Meta/Facebook ad spend. Prefer OAuth-connected Meta ad accounts,
    // but keep legacy manual Facebook Ads settings as fallback.
    let adSpend = null;
    let fbError = null;
    const cfg = await getOrgSettings(orgId, ["facebook_access_token", "facebook_ad_account_id", "usd_to_bdt_rate"]);
    let fbToken = cfg["facebook_access_token"];
    let fbAccountId = cfg["facebook_ad_account_id"];
    let fbAccountCurrency = null;
    if (!fbToken || !fbAccountId) {
      try {
        const { data: connection } = await supabase
          .from("meta_connections")
          .select("encrypted_user_access_token")
          .eq("org_id", orgId)
          .maybeSingle();
        const { data: adAccount } = await supabase
          .from("meta_ad_accounts")
          .select("ad_account_id, currency")
          .eq("org_id", orgId)
          .limit(1)
          .maybeSingle();
        if (connection?.encrypted_user_access_token && adAccount?.ad_account_id) {
          fbToken = decryptToken(connection.encrypted_user_access_token);
          fbAccountId = adAccount.ad_account_id;
          fbAccountCurrency = adAccount.currency;
        }
      } catch (err) {
        console.warn("[Meta Analytics] OAuth ad account fallback unavailable:", errorMessage(err));
      }
    }
    if (fbAccountId && !fbAccountCurrency) {
      try {
        const storedAccountIds = [
          fbAccountId,
          fbAccountId.startsWith("act_") ? fbAccountId.slice(4) : `act_${fbAccountId}`,
        ];
        const { data: adAccount } = await supabase
          .from("meta_ad_accounts")
          .select("currency")
          .eq("org_id", orgId)
          .in("ad_account_id", storedAccountIds)
          .limit(1)
          .maybeSingle();
        fbAccountCurrency = adAccount?.currency || null;
      } catch (err) {
        console.warn("[Meta Analytics] Ad account currency unavailable:", errorMessage(err));
      }
    }
    const usdToBdt = parseFloat(cfg["usd_to_bdt_rate"] || "0") || 110; // default 110

    if (fbToken && fbAccountId) {
      const accountId = fbAccountId.startsWith("act_") ? fbAccountId : `act_${fbAccountId}`;
      try {
        // Use time_range when a date filter is applied, otherwise use date_preset=maximum
        let dateParam;
        if (since && until) {
          dateParam = `time_range=${encodeURIComponent(JSON.stringify({ since, until }))}`;
        } else if (since) {
          const todayStr = new Date().toISOString().slice(0, 10);
          dateParam = `time_range=${encodeURIComponent(JSON.stringify({ since, until: todayStr }))}`;
        } else {
          dateParam = "date_preset=maximum";
        }

        let totalSpendUsd = 0;
        const spendByDayUsd = new Map();
        let nextUrl = `https://graph.facebook.com/${metaGraphVersion()}/${accountId}/insights?fields=spend,date_start&level=account&${dateParam}&time_increment=1&access_token=${encodeURIComponent(fbToken)}`;
        let pages = 0;
        const MAX_PAGES = 10;

        while (nextUrl && pages < MAX_PAGES) {
          const fbRes = await fetch(nextUrl);
          const fbData = await fbRes.json();
          console.log(`[FB Analytics] page ${pages + 1}:`, JSON.stringify(fbData).slice(0, 500));

          if (fbData.error) {
            fbError = fbData.error.message || "Facebook API error";
            break;
          }

          if (fbData.data && fbData.data.length > 0) {
            for (const row of fbData.data) {
              const spendUsd = parseFloat(row.spend || 0);
              totalSpendUsd += spendUsd;
              if (row.date_start) {
                spendByDayUsd.set(row.date_start, (spendByDayUsd.get(row.date_start) || 0) + spendUsd);
              }
            }
          }

          nextUrl = fbData.paging?.next || null;
          pages++;
        }

        adSpend = convertMetaSpendToBdt(totalSpendUsd, fbAccountCurrency, usdToBdt);
        if (adSpend === null) {
          fbError = `Unsupported or missing Meta ad account currency: ${fbAccountCurrency || "unknown"}`;
        }
        if (singleDaySeries) {
          const dailySpend = convertMetaSpendToBdt(
            spendByDayUsd.get(seriesStart) || totalSpendUsd,
            fbAccountCurrency,
            usdToBdt,
          );
          if (dailySpend !== null) {
            for (const bucket of seriesBuckets) bucket.adSpend = dailySpend;
          }
        } else {
          for (const bucket of seriesBuckets) {
            const dailySpend = convertMetaSpendToBdt(
              spendByDayUsd.get(bucket.key) || 0,
              fbAccountCurrency,
              usdToBdt,
            );
            if (dailySpend !== null) bucket.adSpend = dailySpend;
          }
        }
        console.log(`[FB Analytics] total ${fbAccountCurrency || "unknown"} spend: ${totalSpendUsd}, rate: ${usdToBdt}, BDT: ${adSpend}`);
      } catch (e) {
        fbError = e.message || "Failed to reach Facebook API";
      }
    }

    // Net Profit = Revenue − Ad Spend − Shipping − COG
    const shippingCost = parseFloat(shipping.toFixed(2));
    const profit = adSpend !== null
      ? revenue - adSpend - shippingCost - totalCog
      : null;
    for (const bucket of seriesBuckets) {
      bucket.revenue = parseFloat(bucket.revenue.toFixed(2));
      bucket.shipping = parseFloat(bucket.shipping.toFixed(2));
      bucket.profit = adSpend !== null
        ? parseFloat((bucket.revenue - bucket.totalCog - bucket.adSpend - bucket.shipping).toFixed(2))
        : null;
    }

    return res.json({
      revenue: parseFloat(revenue.toFixed(2)),
      shipping: shippingCost,
      adSpend,
      totalCog: parseFloat(totalCog.toFixed(2)),
      cogCoverage,
      profit: profit !== null ? parseFloat(profit.toFixed(2)) : null,
      fbConfigured: !!(fbToken && fbAccountId),
      usdToBdt,
      fbError,
      series: {
        buckets: seriesBuckets,
        revenue: seriesBuckets.map((bucket) => bucket.revenue),
        shipping: seriesBuckets.map((bucket) => bucket.shipping),
        adSpend: seriesBuckets.map((bucket) => bucket.adSpend),
        totalCog: seriesBuckets.map((bucket) => bucket.totalCog),
        profit: seriesBuckets.map((bucket) => bucket.profit ?? 0),
      },
    });
  } catch (err) {
    return sendError(res, err);
  }
});

// ─── AI Business Forecast ───────────────────────────────────────────────────

function normalizeProductName(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9\u0980-\u09ff]+/gi, " ").trim();
}

function orderMentionsProduct(orderProduct, productName) {
  const orderText = normalizeProductName(orderProduct);
  const name = normalizeProductName(productName);
  if (!orderText || !name) return false;
  return orderText.includes(name) || name.includes(orderText);
}

function pctChange(current, previous) {
  if (!previous && !current) return 0;
  if (!previous) return 100;
  return ((current - previous) / previous) * 100;
}

const OPENAI_SIDEBAR_ALERT_MODEL = "gpt-5.4-mini";

function fallbackSidebarInsight(type, orders) {
  if (!orders.length) return undefined;
  const oldest = orders[0];
  if (type === "stalePending") {
    return {
      headline: `${orders.length} pending order${orders.length === 1 ? "" : "s"} need follow-up`,
      insight: `Oldest is #${oldest.order_number}, ${oldest.daysOld}d old. Follow up before courier confidence drops.`,
    };
  }
  return {
    headline: `${orders.length} confirmed order${orders.length === 1 ? "" : "s"} ready to dispatch`,
    insight: `Start with #${oldest.order_number}. These are confirmed but not yet sent to courier.`,
  };
}

function extractResponsesText(data) {
  if (data?.output_text) return data.output_text;
  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.text) parts.push(content.text);
    }
  }
  return parts.join("\n");
}

function extractResponsesImageGeneration(data) {
  for (const item of data?.output || []) {
    if (item?.type === "image_generation_call" && item?.result) {
      return {
        image: String(item.result).startsWith("data:")
          ? String(item.result)
          : `data:image/png;base64,${item.result}`,
        revisedPrompt: item.revised_prompt || null,
      };
    }
  }
  return null;
}

function parseJsonObject(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

let viralHookCache = null;

async function getViralHookTemplates() {
  if (viralHookCache) return viralHookCache;
  try {
    const filePath = join(__dirname, "..", "data", "viral_hooks.md");
    const markdown = await readFile(filePath, "utf8");
    const blocks = markdown.split(/\n### Hook #/).slice(1);
    viralHookCache = blocks
      .map((block) => {
        const id = block.match(/^(\d+)/)?.[1] || "";
        const category = block.match(/\*\*Category:\*\*\s*([^\n]+)/)?.[1]?.trim() || "";
        const hook = block.match(/\*\*Hook:\*\*\s*([\s\S]*?)(?:\n\n\*\*Reference Examples:\*\*|\n---|\n$)/)?.[1]?.replace(/\s+/g, " ").trim() || "";
        const examples = [...block.matchAll(/-\s*(https?:\/\/[^\s]+)/g)].map((m) => m[1]);
        return { id, category, hook, examples };
      })
      .filter((item) => item.hook && !/^h=/.test(item.hook));
  } catch (err) {
    console.warn("[Studio] viral hooks unavailable:", errorMessage(err));
    viralHookCache = [];
  }
  return viralHookCache;
}

function scoreHookTemplate(template, query) {
  const text = `${template.category} ${template.hook}`.toLowerCase();
  const words = String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9\u0980-\u09ff]+/i)
    .filter((word) => word.length > 2);
  let score = 0;
  for (const word of words) {
    if (text.includes(word)) score += 2;
  }
  if (/how|exactly|teach|learn|guide|tips|steps/i.test(template.hook)) score += 2;
  if (/did you know|nobody|stop|mistake|do not|if you/i.test(template.hook)) score += 3;
  if (/comparison|myth|storytelling|educational/i.test(template.category)) score += 1;
  return score;
}

async function selectViralHooks(productDetails, target = "script") {
  const templates = await getViralHookTemplates();
  if (!templates.length) return [];
  const ranked = templates
    .map((template) => ({ template, score: scoreHookTemplate(template, productDetails) + Math.random() * (target === "hook" ? 4 : 1) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, target === "hook" ? 12 : 8)
    .map(({ template }) => template);
  return ranked;
}

async function buildSidebarAlertInsights({ stalePending, unsentConfirmed }) {
  const fallback = {
    stalePending: fallbackSidebarInsight("stalePending", stalePending),
    unsentConfirmed: fallbackSidebarInsight("unsentConfirmed", unsentConfirmed),
  };

  if (!process.env.OPENAI_API_KEY || (!stalePending.length && !unsentConfirmed.length)) {
    return fallback;
  }

  try {
    const payload = {
      stalePending: stalePending.slice(0, 10),
      unsentConfirmed: unsentConfirmed.slice(0, 10),
    };
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_SIDEBAR_ALERT_MODEL,
        input: [
          {
            role: "system",
            content:
              "You write concise operational sidebar alerts for a Bangladeshi ecommerce order dashboard. Return JSON only. Use practical language, no markdown.",
          },
          {
            role: "user",
            content:
              "Create short AI insights for these sidebar alert groups. Keep headline under 52 characters and insight under 120 characters. Return shape: {\"stalePending\":{\"headline\":\"\",\"insight\":\"\"},\"unsentConfirmed\":{\"headline\":\"\",\"insight\":\"\"}}. Omit a group by returning null when it has no orders.\n\n" +
              JSON.stringify(payload),
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.warn("[Sidebar Alerts] OpenAI failed:", response.status, body.slice(0, 240));
      return fallback;
    }

    const json = parseJsonObject(extractResponsesText(await response.json()));
    return {
      stalePending: json?.stalePending || fallback.stalePending,
      unsentConfirmed: json?.unsentConfirmed || fallback.unsentConfirmed,
    };
  } catch (err) {
    console.warn("[Sidebar Alerts] AI fallback:", errorMessage(err));
    return fallback;
  }
}

async function buildForecastNarrative(payload) {
  if (!process.env.OPENAI_API_KEY) return payload.executiveSummary;
  try {
    const prompt = `You are an operator for a Bangladeshi ecommerce business. Write a concise executive summary and practical action plan from this JSON. Use taka symbol. Focus on stock-outs, products to stop, restocking, and risk.\n\n${JSON.stringify(payload).slice(0, 12000)}`;
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Return markdown only. Be specific, concise, and operational." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
    });
    const data = await response.json();
    return data.choices?.[0]?.message?.content || payload.executiveSummary;
  } catch {
    return payload.executiveSummary;
  }
}

function emptyWebsiteBehaviorPayload(configured = true, lookbackDays = 30) {
  return {
    configured,
    lookbackDays,
    funnel: {
      visitors: 0,
      productViews: 0,
      carts: 0,
      checkouts: 0,
      purchases: 0,
      conversionRate: 0,
    },
    dropOff: null,
    productDemand: [],
    trafficSources: [],
  };
}

function productNameFromUrl(value) {
  try {
    const url = new URL(String(value || ""));
    const parts = url.pathname.split("/").filter(Boolean);
    const productIndex = parts.findIndex((part) => ["product", "products"].includes(part.toLowerCase()));
    const slug = productIndex >= 0 ? parts[productIndex + 1] : parts[parts.length - 1];
    if (!slug) return "Homepage";
    return decodeURIComponent(slug)
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  } catch {
    return "Unknown product";
  }
}

function extractPostHogTrafficSource(url, referrer) {
  try {
    const parsedUrl = new URL(String(url || ""));
    const utmSource = parsedUrl.searchParams.get("utm_source");
    if (utmSource) return utmSource.trim().toLowerCase();
  } catch { /* ignore invalid event URL */ }

  try {
    const host = new URL(String(referrer || "")).hostname.replace(/^www\./, "");
    if (!host) return "Direct";
    if (host.includes("facebook") || host.includes("fb.")) return "Facebook";
    if (host.includes("instagram")) return "Instagram";
    if (host.includes("tiktok")) return "TikTok";
    if (host.includes("google")) return "Google";
    if (host.includes("youtube")) return "YouTube";
    return host;
  } catch {
    return "Direct";
  }
}

async function queryPostHogHogql(query, values = {}) {
  const personalApiKey = process.env.POSTHOG_PERSONAL_API_KEY;
  const projectId = process.env.POSTHOG_PROJECT_ID;
  if (!personalApiKey || !projectId) return null;

  const host = (process.env.POSTHOG_HOST || "https://app.posthog.com").replace(/\/+$/, "");
  const response = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${personalApiKey}`,
    },
    body: JSON.stringify({
      query: {
        kind: "HogQLQuery",
        query,
        values,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`PostHog query failed (${response.status}): ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  return Array.isArray(data?.results) ? data.results : [];
}

function pctDropOff(from, to) {
  if (!from || from <= 0) return 0;
  return Math.max(0, Math.min(100, Number((((from - to) / from) * 100).toFixed(1))));
}

function buildWebsiteBehaviorDropOff(funnel) {
  const candidates = [
    {
      step: "Product View to Cart",
      rate: pctDropOff(funnel.productViews, funnel.carts),
      hint: "Improve product page clarity, price trust, and add-to-cart visibility.",
      summary: "Shoppers are interested enough to view products, but the product page is not giving enough confidence to add items to cart.",
    },
    {
      step: "Cart to Checkout",
      rate: pctDropOff(funnel.carts, funnel.checkouts),
      hint: "Review delivery cost, cart friction, and checkout CTA placement.",
      summary: "Customers are adding items, but something in the cart is making checkout feel unclear or not worth continuing.",
    },
    {
      step: "Checkout to Purchase",
      rate: pctDropOff(funnel.checkouts, funnel.purchases),
      hint: "Check payment trust, form length, and courier promise clarity.",
      summary: "Customers reach checkout, but they still need stronger trust, simpler forms, and clearer delivery expectations before placing the order.",
    },
  ];
  const meaningful = candidates.filter((candidate) => candidate.rate > 0);
  return meaningful.sort((a, b) => b.rate - a.rate)[0] || null;
}

function fallbackWebsiteBehaviorDropOffBullets(dropOff) {
  if (!dropOff) return [];
  if (dropOff.step === "Checkout to Purchase") {
    return [
      "Add COD, delivery time, and return-policy reassurance near the submit button.",
      "Remove optional fields or split checkout into fewer visible decisions.",
      "Show a clear courier promise before the final order action.",
    ];
  }
  if (dropOff.step === "Cart to Checkout") {
    return [
      "Make delivery fee and total cost visible before checkout starts.",
      "Keep the checkout CTA sticky or repeated near cart totals.",
      "Reduce cart distractions that pull shoppers away from checkout.",
    ];
  }
  return [
    "Put price, benefits, and product proof above the first scroll break.",
    "Move the add-to-cart button closer to product details on mobile.",
    "Add trust cues such as reviews, delivery promise, and return clarity.",
  ];
}

async function buildWebsiteBehaviorDropOffBullets(dropOff, funnel) {
  const fallback = fallbackWebsiteBehaviorDropOffBullets(dropOff);
  if (!dropOff || !process.env.OPENAI_API_KEY) return fallback;
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Return JSON only: {\"bullets\":[\"...\",\"...\",\"...\"]}. Write concise ecommerce operator advice for Bangladesh. No markdown." },
          { role: "user", content: JSON.stringify({ dropOff, funnel }) },
        ],
        temperature: 0.2,
      }),
    });
    if (!response.ok) return fallback;
    const json = await response.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content || "{}");
    const bullets = Array.isArray(parsed.bullets) ? parsed.bullets.map((item) => String(item).trim()).filter(Boolean).slice(0, 3) : [];
    return bullets.length ? bullets : fallback;
  } catch {
    return fallback;
  }
}

app.get("/api/order-analysis/website-behavior", rateLimitAI, async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const lookbackDays = Math.max(7, Math.min(90, parseInt(req.query.days || "30", 10) || 30));

    if (!process.env.POSTHOG_PERSONAL_API_KEY || !process.env.POSTHOG_PROJECT_ID) {
      return res.json(emptyWebsiteBehaviorPayload(false, lookbackDays));
    }

    try {
      const eventFilter = `
        event = 'merchant_suite_live_visitor'
        AND properties.org_id = {orgId}
        AND timestamp >= now() - INTERVAL ${lookbackDays} DAY
      `;
      const purchaseFilter = `properties.bucket = 'purchased' AND (properties.explicit = true OR match(coalesce(properties.url, ''), '(thank[-_]?you|order[-_]?received|order[-_]?confirmation|order[-_]?placed|purchase[-_]?complete|payment[-_]?success)'))`;
      const [funnelRows, demandRows, sourceRows] = await Promise.all([
        queryPostHogHogql(`
          SELECT
            uniq(distinct_id) AS visitors,
            uniqIf(distinct_id, coalesce(properties.bucket, '') = '') AS productViews,
            uniqIf(distinct_id, properties.bucket = 'cart') AS carts,
            uniqIf(distinct_id, properties.bucket = 'checkout') AS checkouts,
            uniqIf(distinct_id, ${purchaseFilter}) AS purchases
          FROM events
          WHERE ${eventFilter}
        `, { orgId }),
        queryPostHogHogql(`
          SELECT
            coalesce(properties.url, 'Unknown page') AS url,
            uniqIf(distinct_id, coalesce(properties.bucket, '') = '') AS views,
            uniqIf(distinct_id, properties.bucket = 'cart') AS carts,
            uniqIf(distinct_id, properties.bucket = 'checkout') AS checkouts,
            uniqIf(distinct_id, ${purchaseFilter}) AS purchases
          FROM events
          WHERE ${eventFilter}
          GROUP BY url
          ORDER BY views DESC
          LIMIT 8
        `, { orgId }),
        queryPostHogHogql(`
          SELECT
            coalesce(properties.url, '') AS url,
            coalesce(properties.referrer, '') AS referrer,
            uniq(distinct_id) AS visitors,
            uniqIf(distinct_id, properties.bucket = 'cart') AS carts,
            uniqIf(distinct_id, ${purchaseFilter}) AS purchases
          FROM events
          WHERE ${eventFilter}
          GROUP BY url, referrer
          ORDER BY visitors DESC
          LIMIT 50
        `, { orgId }),
      ]);

      const funnelRow = funnelRows?.[0] || [];
      const funnel = {
        visitors: Number(funnelRow[0]) || 0,
        productViews: Number(funnelRow[1]) || 0,
        carts: Number(funnelRow[2]) || 0,
        checkouts: Number(funnelRow[3]) || 0,
        purchases: Number(funnelRow[4]) || 0,
        conversionRate: Number((((Number(funnelRow[4]) || 0) / Math.max(Number(funnelRow[0]) || 0, 1)) * 100).toFixed(1)),
      };
      const productDemand = (demandRows || []).map((row) => {
        const views = Number(row[1]) || 0;
        const purchases = Number(row[4]) || 0;
        return {
          url: String(row[0] || "Unknown page"),
          productName: productNameFromUrl(row[0]),
          views,
          carts: Number(row[2]) || 0,
          checkouts: Number(row[3]) || 0,
          purchases,
          conversionRate: Number(((purchases / Math.max(views, 1)) * 100).toFixed(1)),
        };
      });
      const sourceMap = new Map();
      for (const row of sourceRows || []) {
        const source = extractPostHogTrafficSource(row[0], row[1]);
        const current = sourceMap.get(source) || { source, visitors: 0, carts: 0, purchases: 0 };
        current.visitors += Number(row[2]) || 0;
        current.carts += Number(row[3]) || 0;
        current.purchases += Number(row[4]) || 0;
        sourceMap.set(source, current);
      }
      const trafficSources = [...sourceMap.values()]
        .map((source) => ({
          ...source,
          conversionRate: Number(((source.purchases / Math.max(source.visitors, 1)) * 100).toFixed(1)),
        }))
        .sort((a, b) => b.visitors - a.visitors)
        .slice(0, 6);

      const dropOff = buildWebsiteBehaviorDropOff(funnel);
      if (dropOff) dropOff.bullets = await buildWebsiteBehaviorDropOffBullets(dropOff, funnel);

      return res.json({
        configured: true,
        lookbackDays,
        funnel,
        dropOff,
        productDemand,
        trafficSources,
      });
    } catch (err) {
      console.warn("[PostHog] website behavior query failed:", err.message);
      return res.json(emptyWebsiteBehaviorPayload(true, lookbackDays));
    }
  } catch (err) {
    console.error("[Website Behavior] error:", err);
    return sendError(res, err);
  }
});

app.get("/api/business-forecast", rateLimitAI, async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const now = new Date();
    const lookbackDays = Math.max(7, Math.min(90, parseInt(req.query.days || "30", 10) || 30));
    const currentStart = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
    const previousStart = new Date(now.getTime() - lookbackDays * 2 * 24 * 60 * 60 * 1000);
    const { data: rawOrders, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
    if (ordersError) throw ordersError;

    const { data: rawProducts, error: productsError } = await supabase
        .from("products")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });
    if (productsError) throw productsError;

    const orders = rawOrders || [];
    const stockMap = await getProductStockMap(orgId, (rawProducts || []).map((p) => p.id));
    const products = (rawProducts || []).map((p) => ({ ...p, stock_quantity: stockMap[p.id] || 0 }));
    const currentOrders = orders.filter((o) => new Date(o.created_at) >= currentStart);
    const previousOrders = orders.filter((o) => new Date(o.created_at) < currentStart && new Date(o.created_at) >= previousStart);

    const currentRevenue = currentOrders.reduce((sum, o) => sum + (parseFloat(o.price || 0) || 0), 0);
    const previousRevenue = previousOrders.reduce((sum, o) => sum + (parseFloat(o.price || 0) || 0), 0);
    const projectedRevenue30d = (currentRevenue / lookbackDays) * 30;

    const productForecasts = products.map((product) => {
      const matchedCurrent = currentOrders.filter((o) => orderMentionsProduct(o.product, product.name));
      const matchedPrevious = previousOrders.filter((o) => orderMentionsProduct(o.product, product.name));
      const unitsSold = matchedCurrent.reduce((sum, o) => sum + (parseInt(o.quantity || 1, 10) || 1), 0);
      const previousUnits = matchedPrevious.reduce((sum, o) => sum + (parseInt(o.quantity || 1, 10) || 1), 0);
      const revenue = matchedCurrent.reduce((sum, o) => sum + (parseFloat(o.price || 0) || 0), 0);
      const canceledOrders = matchedCurrent.filter((o) => {
        const status = `${o.status || ""} ${o.fulfillment_status || ""} ${o.courier_status || ""}`.toLowerCase();
        return status.includes("cancel") || status.includes("fail") || status.includes("return") || status.includes("restock");
      }).length;
      const velocity = unitsSold / lookbackDays;
      const stock = parseInt(product.stock_quantity || 0, 10) || 0;
      const daysUntilStockout = velocity > 0 ? stock / velocity : null;
      const margin = product.selling_price ? ((parseFloat(product.selling_price) - parseFloat(product.cog || 0)) / parseFloat(product.selling_price)) * 100 : null;
      const cancellationRate = matchedCurrent.length ? (canceledOrders / matchedCurrent.length) * 100 : 0;
      const growthRate = pctChange(unitsSold, previousUnits);

      let recommendation = "Monitor";
      let status = "stable";
      let score = 50;
      if (velocity > 0) score += Math.min(25, velocity * 10);
      if (margin != null) score += Math.max(-20, Math.min(20, (margin - 20) / 2));
      score -= Math.min(25, cancellationRate / 2);
      if (daysUntilStockout != null && daysUntilStockout <= 7) {
        status = "stockout";
        recommendation = `Restock ${Math.max(10, Math.ceil(velocity * 14))} units soon`;
        score += 10;
      } else if (unitsSold === 0 && stock > 0) {
        status = "dead_stock";
        recommendation = "Pause restocking and test discount or bundle";
        score -= 25;
      } else if ((margin != null && margin < 15) || cancellationRate >= 35) {
        status = "shutdown_candidate";
        recommendation = "Review pricing, courier fit, or stop promotion";
        score -= 20;
      } else if (growthRate >= 30 && unitsSold > 0) {
        status = "winner";
        recommendation = "Protect stock and consider increasing promotion";
        score += 15;
      }

      return {
        id: product.id,
        name: product.name,
        stockQuantity: stock,
        unitsSold,
        revenue: Math.round(revenue),
        salesVelocity: Number(velocity.toFixed(2)),
        daysUntilStockout: daysUntilStockout == null ? null : Number(daysUntilStockout.toFixed(1)),
        margin: margin == null ? null : Number(margin.toFixed(1)),
        cancellationRate: Number(cancellationRate.toFixed(1)),
        growthRate: Number(growthRate.toFixed(1)),
        status,
        recommendation,
        score: Math.max(0, Math.min(100, Math.round(score))),
      };
    }).sort((a, b) => {
      const riskRank = { stockout: 0, shutdown_candidate: 1, dead_stock: 2, winner: 3, stable: 4 };
      return (riskRank[a.status] ?? 9) - (riskRank[b.status] ?? 9) || b.revenue - a.revenue;
    });

    const stockoutRisks = productForecasts.filter((p) => p.status === "stockout");
    const shutdownCandidates = productForecasts.filter((p) => p.status === "shutdown_candidate" || p.status === "dead_stock");
    const winners = productForecasts.filter((p) => p.status === "winner");
    const topActions = [
      ...stockoutRisks.slice(0, 3).map((p) => ({ priority: "critical", title: `Restock ${p.name}`, detail: `${p.daysUntilStockout} days until stock-out at current velocity.` })),
      ...shutdownCandidates.slice(0, 3).map((p) => ({ priority: "warning", title: `Review ${p.name}`, detail: p.recommendation })),
      ...winners.slice(0, 2).map((p) => ({ priority: "growth", title: `Scale ${p.name}`, detail: "Strong sales signal. Keep inventory protected before increasing promotion." })),
    ].slice(0, 6);

    const payload = {
      generatedAt: now.toISOString(),
      lookbackDays,
      overview: {
        currentOrders: currentOrders.length,
        previousOrders: previousOrders.length,
        currentRevenue: Math.round(currentRevenue),
        previousRevenue: Math.round(previousRevenue),
        revenueChange: Number(pctChange(currentRevenue, previousRevenue).toFixed(1)),
        projectedRevenue30d: Math.round(projectedRevenue30d),
        productsTracked: products.length,
        stockoutCount: stockoutRisks.length,
        shutdownCount: shutdownCandidates.length,
      },
      productForecasts,
      stockoutRisks,
      shutdownCandidates,
      topActions,
      salesTrend: buildSalesTrend(orders, { now, days: 365 }),
      executiveSummary: `## Business forecast\n\nYou have ${currentOrders.length} orders in the last ${lookbackDays} days with projected 30-day revenue of ৳${Math.round(projectedRevenue30d).toLocaleString("en-BD")}. ${stockoutRisks.length} products need restock attention and ${shutdownCandidates.length} products should be reviewed for discounting, bundling, or stopping promotion.`,
    };

    payload.aiSummary = await buildForecastNarrative(payload);
    return res.json(payload);
  } catch (err) {
    console.error("[Business Forecast] error:", err);
    return sendError(res, err);
  }
});

// ─── API Routes ─────────────────────────────────────────────────────────────

app.get("/api/sidebar-alerts", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await applyOrgScope(
      supabase
      .from("orders")
      .select("id, order_number, customer_name, created_at, status, sent_to_courier, org_id")
        .in("status", ["pending", "confirmed"]),
      orgId
    )
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw error;

    const legacyCompatData = data || [];
    const alertsSource = legacyCompatData.filter((order) => {
      const status = String(order.status || "").toLowerCase();
      if (status === "pending") {
        return new Date(order.created_at) < new Date(twoDaysAgo);
      }
      if (status === "confirmed") {
        return order.sent_to_courier !== true;
      }
      return false;
    });

    const now = Date.now();
    const alerts = alertsSource.map((order) => ({
      id: order.id,
      type: String(order.status || "").toLowerCase() === "pending" ? "stale_pending" : "unsent_confirmed",
      order_number: order.order_number,
      customer_name: order.customer_name,
      created_at: order.created_at,
      daysOld: Math.floor((now - new Date(order.created_at).getTime()) / 86400000),
    }));

    const stalePending = alerts.filter((alert) => alert.type === "stale_pending");
    const unsentConfirmed = alerts.filter((alert) => alert.type === "unsent_confirmed");
    const aiInsights = await buildSidebarAlertInsights({ stalePending, unsentConfirmed });

    return res.json({
      alerts,
      stalePending,
      unsentConfirmed,
      aiInsights,
      model: OPENAI_SIDEBAR_ALERT_MODEL,
    });
  } catch (e) {
    console.error("[Sidebar Alerts] error:", errorMessage(e));
    return res.status(500).json({ error: errorMessage(e) });
  }
});

// ─── Image generation with GPT Image 2 ──────────────────────────────────────

app.post("/api/generate-image", rateLimitAI, async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });

    const { prompt, image, size = "auto", quality = "medium" } = req.body || {};
    if (!prompt) return res.status(400).json({ error: "prompt is required" });

    const validSizes = ["1024x1024", "1536x1024", "1024x1536", "auto"];
    const finalSize = validSizes.includes(size) ? size : "1024x1024";
    const validQualities = ["low", "medium", "high", "auto"];
    const finalQuality = validQualities.includes(quality) ? quality : "medium";
    const inputContent = [{ type: "input_text", text: String(prompt) }];

    if (image) {
      inputContent.push({
        type: "input_image",
        image_url: String(image).startsWith("data:")
          ? String(image)
          : `data:image/png;base64,${image}`,
      });
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5.5",
        input: [
          {
            role: "user",
            content: inputContent,
          },
        ],
        tools: [
          {
            type: "image_generation",
            size: finalSize,
            quality: finalQuality,
            action: image ? "edit" : "generate",
          },
        ],
        tool_choice: { type: "image_generation" },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("[Image Gen] Responses API failed:", response.status, body.slice(0, 300));
      const message = parseOpenAIError(response.status, body);
      const statusCode = [401, 403, 429].includes(response.status) ? response.status : 502;
      return res.status(statusCode).json({ error: message });
    }

    const data = await response.json();
    const generated = extractResponsesImageGeneration(data);
    if (!generated?.image) return res.status(500).json({ error: "No image returned" });

    return res.json({
      image: generated.image,
      revisedPrompt: generated.revisedPrompt,
      model: "gpt-5.5",
      imageModel: "gpt-image-2",
    });
  } catch (err) {
    console.error("[Image Gen] error:", errorMessage(err));
    return res.status(500).json({ error: errorMessage(err) });
  }
});

const ORDER_CHAT_MODELS = new Set(["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"]);

app.post("/api/order-chat", rateLimitAI, async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });

    const model = ORDER_CHAT_MODELS.has(req.body?.model) ? req.body.model : "gpt-5.4-mini";
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];

    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    // Fetch all data in parallel
    const [
      { data: rawOrders },
      { data: rawProductsBase },
      { data: rawInboxOrders },
      orgSettings,
    ] = await Promise.all([
      applyOrgScope(supabase.from("orders").select("*"), orgId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("products").select("*").eq("org_id", orgId),
      supabase.from("social_inbox_orders").select("*").eq("org_id", orgId)
        .order("created_at", { ascending: false }).limit(200),
      getOrgSettings(orgId, ["org_name", "shopify_store_url"]),
    ]);

    // Merge stock from app_settings into products
    const baseProducts = rawProductsBase || [];
    const stockMap = baseProducts.length > 0
      ? await getProductStockMap(orgId, baseProducts.map((p) => p.id))
      : {};
    const rawProducts = baseProducts.map((p) => ({ ...p, stock_quantity: stockMap[p.id] ?? 0 }));

    // Load variants for all products in one query
    let chatVariantsMap = {};
    if (baseProducts.length > 0) {
      const { data: variantRows } = await supabase
        .from("product_variants")
        .select("product_id, attributes, stock_quantity, price_adjustment")
        .in("product_id", baseProducts.map((p) => p.id))
        .eq("org_id", orgId);
      for (const v of variantRows || []) {
        if (!chatVariantsMap[v.product_id]) chatVariantsMap[v.product_id] = [];
        chatVariantsMap[v.product_id].push(v);
      }
    }

    const orders = rawOrders || [];
    const products = rawProducts || [];
    const inboxOrders = rawInboxOrders || [];

    // Order stats
    const pendingOrders    = orders.filter((o) => o.status === "pending");
    const confirmedOrders  = orders.filter((o) => o.status === "confirmed");
    const cancelledOrders  = orders.filter((o) => o.status === "cancelled");
    const sentToCourier    = orders.filter((o) => o.sent_to_courier);
    const notSentToCourier = orders.filter((o) => !o.sent_to_courier);
    const withNotes        = orders.filter((o) => o.notes);
    const fraudChecked     = orders.filter((o) => o.fraud_checked);
    const totalRevenue        = orders.reduce((sum, o) => sum + (parseFloat(o.price || 0) || 0), 0);
    const totalDeliveryCharges = orders.reduce((sum, o) => sum + (parseFloat(o.delivery_rate || 0) || 0), 0);
    const totalCOG = products.reduce((sum, p) => sum + (parseFloat(p.cog || 0) || 0), 0);
    const totalProductValue = products.reduce((sum, p) => sum + (parseFloat(p.selling_price || 0) || 0), 0);

    const orderDetails = orders.map((o) => ({
      "#": o.order_number,
      c: o.customer_name,
      ph: o.phone,
      addr: o.address,
      p: o.product,
      qty: o.quantity,
      price: o.price,
      dlv: o.delivery_rate,
      st: o.status,
      fs: o.fulfillment_status,
      sent: o.sent_to_courier ? 1 : 0,
      cid: o.consignment_id,
      trk: o.tracking_code,
      cs: o.courier_status,
      fc: o.fraud_checked ? 1 : 0,
      note: o.notes,
      dt: o.created_at?.slice(0, 10),
    }));

    const productDetails = products.map((p) => {
      const variants = (chatVariantsMap[p.id] || []).map((v) => ({
        option: Object.entries(v.attributes || {}).map(([k, val]) => `${k}: ${val}`).join(", "),
        available: v.stock_quantity > 0,
        price: v.price_adjustment
          ? (p.selling_price != null ? Number(p.selling_price) + Number(v.price_adjustment) : null)
          : (p.selling_price != null ? Number(p.selling_price) : null),
      }));
      const entry = {
        id: p.id,
        name: p.name,
        price: p.selling_price,
        cog: p.cog,
        stock: variants.length > 0 ? null : (p.stock_quantity ?? null),
        available: variants.length > 0
          ? variants.some((v) => v.available)
          : (p.stock_quantity ?? 0) > 0,
        url: p.url,
      };
      if (variants.length > 0) entry.variants = variants;
      return entry;
    });

    const inboxOrderDetails = inboxOrders.map((o) => ({
      "#": o.order_number,
      c: o.customer_name,
      ph: o.phone,
      addr: o.address,
      p: o.product,
      qty: o.quantity,
      price: o.price,
      st: o.status,
      src: o.source,
      dt: o.created_at?.slice(0, 10),
    }));

    const systemPrompt = `You are an intelligent business assistant for a Bangladeshi e-commerce business called "${orgSettings.org_name || "this business"}". You have full access to all business data below. Answer any question about orders, products, stock, revenue, inbox orders, analytics, or operations.

Rules:
- Never use markdown tables.
- Keep answers short, practical, and accurate.
- Use compact numbered lists for orders: "1. #OrderNum (Customer): detail"
- Use bold for key numbers.
- Use ৳ for currency.
- If asked about stock, reference the products data. For products with variants, check per-variant availability.
- If asked which colors/sizes/options are available, list only variants where available=true.
- If all variants are unavailable, say the product is out of stock.
- If asked about social/inbox orders, reference the inbox orders data.

=== BUSINESS SUMMARY ===
Org: ${orgSettings.org_name || "N/A"} | Store: ${orgSettings.shopify_store_url || "N/A"}

=== ORDERS SUMMARY ===
Total: ${orders.length} | Pending: ${pendingOrders.length} | Confirmed: ${confirmedOrders.length} | Cancelled: ${cancelledOrders.length} | Sent to courier: ${sentToCourier.length} | Not sent: ${notSentToCourier.length} | With notes: ${withNotes.length} | Fraud checked: ${fraudChecked.length}
Revenue: ৳${totalRevenue.toFixed(2)} | Delivery charges: ৳${totalDeliveryCharges.toFixed(2)} | Net (excl. COG): ৳${(totalRevenue - totalDeliveryCharges).toFixed(2)}

Order field key: #=order_number, c=customer, ph=phone, addr=address, p=product, qty=quantity, price=price, dlv=delivery_rate, st=status, fs=fulfillment_status, sent=sent_to_courier(1/0), cid=consignment_id, trk=tracking_code, cs=courier_status, fc=fraud_checked(1/0), note=notes, dt=date

=== ORDERS (last 500) ===
${JSON.stringify(orderDetails).slice(0, 40000)}

=== PRODUCTS & STOCK ===
Total products: ${products.length} | Total catalog value: ৳${totalProductValue.toFixed(2)} | Total COG: ৳${totalCOG.toFixed(2)}
Product field key: id, name, price=selling_price, cog=cost_of_goods, stock=stock_quantity(null when variants exist), available=in_stock, url, variants=[{option, available, price}]

${JSON.stringify(productDetails).slice(0, 8000)}

=== INBOX ORDERS (from social chats) ===
Total: ${inboxOrders.length}
Field key: #=order_number, c=customer, ph=phone, addr=address, p=product, qty=quantity, price=price, st=status, src=source(facebook/instagram/whatsapp), dt=date

${JSON.stringify(inboxOrderDetails).slice(0, 8000)}`;

    const input = [
      { role: "system", content: systemPrompt },
      ...messages.map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: String(message.content || ""),
      })),
    ];

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("[Order Chat] OpenAI error:", response.status, body.slice(0, 300));
      const message = parseOpenAIError(response.status, body);
      const statusCode = [401, 403, 429].includes(response.status) ? response.status : 502;
      return res.status(statusCode).json({ error: message });
    }

    const data = await response.json();
    const text = extractResponsesText(data) || "I couldn't generate a response.";

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (e) {
    console.error("[Order Chat] error:", errorMessage(e));
    return res.status(500).json({ error: errorMessage(e) });
  }
});

// ── Studio: AI Copy Generation ────────────────────────────────────────────────
app.post("/api/studio/generate", rateLimitAI, async (req, res) => {
  try {
    const token = getToken(req);
    const { user } = await getUser(token);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });

    const { productDetails, framework, frameworkName, frameworkLabel, language, regenerationTarget, existingScript } = req.body;
    if (!productDetails || !framework) return res.status(400).json({ error: "Missing productDetails or framework" });

    const isBangla = language === "bangla";

    const frameworkPrompts = {
      aida: "Structure the copy as: ATTENTION (hook that grabs attention), INTEREST (build curiosity and relevance), DESIRE (make them want it), ACTION (clear call to action).",
      pas: "Structure the copy as: PROBLEM (identify the pain point), AGITATE (make the problem feel urgent and real), SOLUTION (present the product as the answer).",
      bab: "Structure the copy as: BEFORE (describe their current situation/struggle), AFTER (paint the dream outcome), BRIDGE (explain how this product gets them there).",
      "4ps": "Structure the copy as: PICTURE (vivid scene they can imagine), PROMISE (what the product delivers), PROVE (evidence, results, credibility), PUSH (strong call to action).",
      fab: "Structure the copy as: FEATURES (what it has), ADVANTAGES (why those features matter), BENEFITS (how it improves the customer's life).",
      quest: "Structure the copy as: QUALIFY (identify the right audience), UNDERSTAND (show you understand their needs), EDUCATE (inform them about the solution), STIMULATE (create desire), TRANSITION (move them to purchase).",
      pastor: "Structure the copy as: PROBLEM (identify the core problem), AMPLIFY (show consequences of not solving it), STORY (share a relatable story or case), TRANSFORMATION (the change the product creates), OFFER (present the product clearly), RESPONSE (call to action).",
      slap: "Structure the copy as: STOP (interrupt their scroll with a strong hook), LOOK (make them read more), ACT (tell them exactly what to do), PURCHASE (make buying easy and obvious).",
      acca: "Structure the copy as: AWARENESS (introduce the problem), COMPREHENSION (help them understand it fully), CONVICTION (build belief that this solution works), ACTION (drive them to buy).",
      "4us": "Structure the copy using the 4 U's: make it URGENT (time-sensitive reason to act now), UNIQUE (what makes this different from anything else), USEFUL (clear practical value), ULTRA-SPECIFIC (precise details, numbers, outcomes).",
    };

    const languageInstruction = isBangla
      ? "Write the entire script in fluent, natural Bengali (বাংলা). Use everyday Bangladeshi Bengali that feels warm and conversational. All section headers, body copy, and calls to action must be in Bengali."
      : "Write the entire script in English.";

    const studioSchemaInstruction = `Return JSON only, no markdown fences. Shape:
{
  "hook": {
    "time": "0:00-0:03",
    "script": "",
    "templateName": "Blackfile Template",
    "templateLine": "",
    "templateViews": "",
    "tags": ["pattern_interrupt"],
    "score": 94,
    "whyItWorks": "",
    "retentionMechanism": ""
  },
  "sceneAnalysis": [
    {"time":"0:00-0:03","title":"Hook","line":"","psychology":"","retention":""}
  ],
  "scenes": [
    {"number":1,"time":"0:04-0:12","title":"Problem Setup","dialogue":"","visual":"","textOverlay":"","transition":"","psychology":"","retention":""}
  ],
  "cameraLighting": {"mainShots":"","broll":"","lighting":"","colorGrade":""},
  "editingPatterns": {"cutFrequency":"","transitions":"","textOverlays":"","music":""},
  "cta": {"time":"0:26-0:30","dialogue":"","textOverlay":"","visual":""},
  "viralProbability": 90,
  "scoreBreakdown": {"hookStrength":95,"scriptStructure":90,"trendAlignment":88,"engagementPotential":92},
  "productionSpecs": {"cutFrequency":"Every 2-3 sec","shotType":"Medium close-up","lighting":"Soft key 45°","textOverlay":"Bold yellow"}
}`;

    const systemPrompt = `You are an expert viral short-form video strategist and marketing copywriter. Write compelling, conversion-focused scripts using the ${frameworkName} framework (${frameworkLabel}). ${frameworkPrompts[framework] || ""}

${languageInstruction}

Create a 30-second vertical Reels/TikTok/Shorts script with hook psychology, retention mechanics, scene-by-scene production direction, camera notes, editing notes, CTA, and scoring. Use emojis only inside display titles when useful. Make it specific to the product details provided.

${studioSchemaInstruction}`;

    const hookOnly = regenerationTarget === "hook";
    const viralHooks = await selectViralHooks(productDetails, hookOnly ? "hook" : "script");
    const viralHookContext = viralHooks.map((item) => ({
      id: item.id,
      category: item.category,
      hook: item.hook,
      referenceExamples: item.examples.slice(0, 2),
    }));
    const userPrompt = hookOnly
      ? `Regenerate ONLY the hook for this product and existing script. Use one of the provided viral hook templates as inspiration. Return the full JSON shape, but keep all existing non-hook sections unchanged when possible. Make the hook meaningfully different and stronger. Do not copy a template verbatim; adapt its pattern to the product.\n\nProduct:\n${productDetails}\n\nRelevant viral hook templates:\n${JSON.stringify(viralHookContext)}\n\nExisting script JSON:\n${JSON.stringify(existingScript || {}).slice(0, 12000)}`
      : `Create a complete viral marketing script using the ${frameworkName} framework for this product. Use the provided viral hook templates as inspiration for the opening hook and scene psychology. Do not copy a template verbatim; adapt its pattern to the product.\n\nProduct:\n${productDetails}\n\nRelevant viral hook templates:\n${JSON.stringify(viralHookContext)}`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5.4",
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_output_tokens: 3200,
      }),
    });

    const bodyText = await response.text();

    if (!response.ok) {
      const errMsg = parseOpenAIError(response.status, bodyText);
      return res.status(response.status).json({ error: errMsg });
    }

    let data;
    try {
      data = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      return res.status(500).json({ error: "Invalid response from AI service" });
    }

    const outputText = extractResponsesText(data);
    const script = parseJsonObject(outputText);
    if (!script) return res.status(500).json({ error: "AI returned an invalid structured script. Please try again." });
    return res.json({ script, text: outputText });
  } catch (e) {
    console.error("[Studio] generate error:", e);
    return res.status(500).json({ error: e.message || "Generation failed" });
  }
});

// ─── Shopify Order Sync ─────────────────────────────────────────────────────

app.post("/api/fetch-shopify-orders", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const cfg = await getOrgSettings(orgId, ["shopify_store_url", "shopify_admin_api_token"]);
    if (!cfg.shopify_store_url || !cfg.shopify_admin_api_token) {
      return res.status(400).json({ error: "Shopify not connected. Go to Settings → Shopify to connect your store." });
    }
    const cleanShop = cfg.shopify_store_url.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const shopifyRes = await fetch(
      `https://${cleanShop}/admin/api/2024-10/orders.json?status=any&limit=250&order=created_at+desc`,
      { headers: { "X-Shopify-Access-Token": cfg.shopify_admin_api_token, "Content-Type": "application/json" } }
    );
    if (!shopifyRes.ok) {
      const errText = await shopifyRes.text();
      console.error(`[Shopify Sync] API error ${shopifyRes.status}:`, errText.slice(0, 300));
      return res.status(shopifyRes.status).json({ error: "Failed to fetch orders from Shopify", details: errText.slice(0, 200) });
    }
    const shopifyData = await shopifyRes.json();
    const orders = shopifyData.orders || [];

    // Fetch existing orders to preserve fraud data and manual edits
    const { data: existingOrders } = await supabase
      .from("orders")
      .select("shopify_order_id, fraud_checked, fraud_data, delivery_rate, price")
      .eq("org_id", orgId);
    const existingMap = new Map((existingOrders || []).map((o) => [o.shopify_order_id, o]));

    const processedOrders = orders.map((order) => {
      // Phone extraction
      let phone = order.shipping_address?.phone || order.customer?.phone || "";
      if (!phone && order.note_attributes) {
        const phoneAttr = order.note_attributes.find((a) =>
          a.name.toLowerCase().includes("phone") || a.name.toLowerCase().includes("tel") || a.name.toLowerCase().includes("mobile")
        );
        if (phoneAttr) phone = phoneAttr.value;
      }
      if (phone) {
        let p = phone.replace(/\D/g, "");
        if (p.startsWith("880")) p = p.slice(3);
        if (p.length === 10 && p.startsWith("1")) p = "0" + p;
        phone = p;
      }

      // Address
      const addr = order.shipping_address || order.customer?.default_address;
      let addressParts = [addr?.address1, addr?.city, addr?.province, addr?.country, addr?.zip].filter(Boolean);
      if (addressParts.length <= 1 && order.note_attributes) {
        const noteAddr = [];
        const addrFields = ["address", "shipping address", "delivery address", "street", "road", "house", "flat"];
        const cityFields = ["city", "town", "district", "thana", "upazila", "area"];
        for (const attr of order.note_attributes) {
          const n = attr.name.toLowerCase();
          const v = attr.value?.trim();
          if (!v) continue;
          if ([...addrFields, ...cityFields].some((f) => n.includes(f))) noteAddr.push(v);
        }
        if (noteAddr.length > 0) {
          if (addr?.country) noteAddr.push(addr.country);
          addressParts = noteAddr;
        }
      }
      const address = addressParts.join(", ");

      // Customer name
      let customerName = "";
      if (order.shipping_address?.name) customerName = order.shipping_address.name;
      else if (order.shipping_address?.first_name || order.shipping_address?.last_name) customerName = `${order.shipping_address.first_name || ""} ${order.shipping_address.last_name || ""}`.trim();
      else if (order.billing_address?.name) customerName = order.billing_address.name;
      else if (order.billing_address?.first_name || order.billing_address?.last_name) customerName = `${order.billing_address.first_name || ""} ${order.billing_address.last_name || ""}`.trim();
      else if (order.customer?.first_name || order.customer?.last_name) customerName = `${order.customer.first_name || ""} ${order.customer.last_name || ""}`.trim();
      else if (order.customer?.default_address?.name) customerName = order.customer.default_address.name;
      if (!customerName && order.note_attributes) {
        const nameAttr = order.note_attributes.find((a) => a.name.toLowerCase().includes("name") && !a.name.toLowerCase().includes("phone"));
        if (nameAttr) customerName = nameAttr.value;
      }

      // Line items
      const lineItems = order.line_items || [];
      const product = lineItems.map((i) => `${i.quantity || 1}x ${i.name}`).join(", ");
      const quantity = lineItems.reduce((acc, i) => acc + (i.quantity || 0), 0);

      // Prices
      const subtotalPrice = parseFloat(order.subtotal_price) || 0;
      const shippingPrice = parseFloat(order.total_shipping_price_set?.shop_money?.amount || "0");

      // Preserve existing fraud data
      const existing = existingMap.get(order.id);

      // Preserve manually-edited price: if existing price differs from Shopify's subtotal, keep it
      const preservedPrice = existing?.price != null && existing.price !== subtotalPrice
        ? existing.price
        : subtotalPrice;

      return {
        shopify_order_id: order.id,
        order_number: order.name || `#${order.order_number}`,
        customer_name: customerName,
        phone,
        address,
        product,
        quantity,
        price: preservedPrice,
        delivery_rate: shippingPrice,
        fulfillment_status: order.fulfillment_status || null,
        fraud_checked: existing?.fraud_checked || false,
        fraud_data: existing?.fraud_data || null,
        created_at: order.created_at || new Date().toISOString(),
        org_id: orgId,
      };
    });

    if (processedOrders.length > 0) {
      const { error: upsertErr } = await supabase
        .from("orders")
        .upsert(processedOrders, { onConflict: "org_id,shopify_order_id", ignoreDuplicates: false });
      if (upsertErr) {
        console.error("[Shopify Sync] upsert error:", upsertErr.message);
        return res.status(500).json({ error: "Failed to save orders", details: upsertErr.message });
      }
    }

    return res.json({ success: true, synced: processedOrders.length });
  } catch (err) {
    console.error("[Shopify Sync] error:", errorMessage(err));
    return sendError(res, err);
  }
});

app.get("/api/orders", async (req, res) => {
  try {
    const token = getToken(req);
    const { user } = await getUser(token);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    console.log(`[Orders] user=${user.id}`);

    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const { data: allData, error } = await supabase
      .from("orders")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const allOrders = allData || [];

    const orders = allOrders;

    console.log(`[Orders] total=${allOrders.length}`);
    return res.json({ orders });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get("/api/orders/recent-notifications", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;
    return res.json({ orders: data || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/custom-orders/webhook", async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(401).json({ error: "Missing x-api-key header" });
    }

    const supabase = getServiceSupabase();
    // Look up the org_id by API key in app_settings.
    const { data: settings, error: settingsError } = await supabase
      .from("app_settings")
      .select("key")
      .eq("value", apiKey)
      .like("key", "%:custom_store_api_key");

    if (settingsError || !settings || settings.length === 0) {
      return res.status(401).json({ error: "Invalid API Key" });
    }

    // Extract orgId from the setting key (orgId is a UUID before the colon)
    const orgId = settings[0].key.split(":")[0];

    // Validate and format incoming order data
    const allowed = [
      "order_number",
      "customer_name",
      "phone",
      "address",
      "product",
      "quantity",
      "price",
      "delivery_rate",
      "status",
      "notes",
    ];
    const row = { org_id: orgId, source: "custom_store" };
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) row[key] = req.body[key];
    }

    // Force sequential order number, ignoring any provided order_id
    row.order_number = `#${await getNextManualOrderSeq(orgId)}`;

    if (!row.status) row.status = "pending";
    if (!row.shopify_order_id) {
       row.shopify_order_id = -(Math.floor(Math.random() * 9_000_000_000_000) + 1_000_000_000_000);
    }

    const { data, error } = await supabase
      .from("orders")
      .insert(row)
      .select("*")
      .single();

    if (error) throw error;

    // Send Order Confirmation SMS in background
    sendBulkSms(orgId, "confirmation", data).catch(console.error);

    return res.status(201).json({ success: true, order_id: data.order_number, order: data });
  } catch (e) {
    console.error("Custom Store Webhook Error:", e);
    return res.status(500).json({ error: e.message });
  }
});

// ─── Live Visitor Tracking ──────────────────────────────────────────────────
const VISITOR_TTL_MS = 60_000;
const POSTHOG_CAPTURE_TIMEOUT_MS = 900;
const memoryLiveVisitors = new Map();

function isValidOrgId(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function liveVisitorBucketFromUrl(value) {
  const url = String(value || "").toLowerCase();
  if (/\/((thank[-_]?you)|(order[-_]?received)|(order[-_]?confirmation)|(purchase[-_]?complete))\b/.test(url)) return "purchased";
  if (/\/(checkout|checkouts)\b/.test(url)) return "checkout";
  if (/\/(cart|basket|bag)\b/.test(url)) return "cart";
  return null;
}

function validLiveVisitorBucket(value) {
  return ["cart", "checkout", "purchased"].includes(value) ? value : null;
}

function pruneMemoryLiveVisitors(key, now) {
  const visitors = memoryLiveVisitors.get(key);
  if (!visitors) return new Map();
  for (const [sessionId, lastSeen] of visitors.entries()) {
    if (lastSeen < now - VISITOR_TTL_MS) visitors.delete(sessionId);
  }
  if (visitors.size === 0) memoryLiveVisitors.delete(key);
  return visitors;
}

async function addLiveVisitorPresence(key, sessionId, now) {
  if (redisClient) {
    try {
      await redisClient.zadd(key, { score: now, member: sessionId });
      await redisClient.expire(key, Math.ceil(VISITOR_TTL_MS / 1000) * 2);
      return;
    } catch (err) {
      console.warn("[LiveVisitor] Redis write failed, falling back to memory:", err.message);
    }
  }

  const visitors = pruneMemoryLiveVisitors(key, now);
  visitors.set(sessionId, now);
  memoryLiveVisitors.set(key, visitors);
}

async function countLiveVisitorsForKey(key, now) {
  if (redisClient) {
    try {
      await redisClient.zremrangebyscore(key, 0, now - VISITOR_TTL_MS);
      const count = await redisClient.zcount(key, now - VISITOR_TTL_MS, "+inf");
      return Number(count) || 0;
    } catch (err) {
      console.warn("[LiveVisitor] Redis count failed, falling back to memory:", err.message);
    }
  }

  return pruneMemoryLiveVisitors(key, now).size;
}

async function capturePostHogEvent({ orgId, sessionId, url, referrer, bucket, explicit }) {
  const apiKey = process.env.POSTHOG_PROJECT_API_KEY;
  if (!apiKey) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), POSTHOG_CAPTURE_TIMEOUT_MS);
  try {
    const host = (process.env.POSTHOG_HOST || "https://app.posthog.com").replace(/\/+$/, "");
    const response = await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: apiKey,
        event: "merchant_suite_live_visitor",
        distinct_id: `${orgId}:${sessionId}`,
        properties: {
          org_id: orgId,
          session_id: sessionId,
          url: typeof url === "string" ? url : "",
          referrer: typeof referrer === "string" ? referrer : "",
          bucket: bucket || null,
          explicit: explicit === true,
          source: "custom_website_tracker",
        },
      }),
    });

    if (!response.ok) {
      console.warn("[PostHog] capture failed:", response.status, response.statusText);
    }
  } catch (err) {
    console.warn("[PostHog] capture failed:", err.message);
  } finally {
    clearTimeout(timeout);
  }
}

app.options("/api/live-visitor/ping", publicTrackerCors);

app.get("/api/tracker.js", publicTrackerCors, (req, res) => {
  const orgId = req.query.org;
  if (!isValidOrgId(orgId)) {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    return res.status(400).send("/* Merchant-Suite tracker: invalid org */");
  }

  res.set({
    "Content-Type": "application/javascript; charset=utf-8",
    "Cache-Control": "public, max-age=300",
  });

  return res.send(`(function(){
  var org = ${JSON.stringify(orgId)};
  var currentScript = document.currentScript;
  var endpoint = new URL("/api/live-visitor/ping", currentScript && currentScript.src ? currentScript.src : window.location.href).toString();
  var storageKey = "merchant_suite_live_sid_" + org;
  function makeId(){
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){var r=Math.random()*16|0,v=c==="x"?r:(r&3|8);return v.toString(16);});
  }
  function getSessionId(){
    try {
      var existing = sessionStorage.getItem(storageKey);
      if (existing) return existing;
      var next = makeId();
      sessionStorage.setItem(storageKey, next);
      return next;
    } catch (_) {
      return makeId();
    }
  }
  var sessionId = getSessionId();
  function detectBucketFromLocation(value){
    var text = String(value || "").toLowerCase();
    if (text.indexOf("thank you") !== -1 || text.indexOf("order received") !== -1 || text.indexOf("order confirmation") !== -1 || text.indexOf("order placed") !== -1 || text.indexOf("purchase complete") !== -1 || text.indexOf("payment success") !== -1) return "purchased";
    return detectBucketFromText(text);
  }
  function ping(bucket, explicit){
    if (document.hidden) return;
    var payload = JSON.stringify({ org_id: org, session_id: sessionId, url: window.location.href, referrer: document.referrer || "", bucket: bucket || null, explicit: explicit === true });
    try {
      fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, mode: "cors", keepalive: true, credentials: "omit" }).catch(function(){});
    } catch (_) {}
  }
  function detectBucketFromText(value){
    var text = String(value || "").toLowerCase();
    if (!text) return null;
    if (text.indexOf("checkout") !== -1 || text.indexOf("check out") !== -1 || text.indexOf("buy now") !== -1) return "checkout";
    if (text.indexOf("add to cart") !== -1 || text.indexOf("add-to-cart") !== -1 || text.indexOf("add_to_cart") !== -1 || text.indexOf("cart") !== -1 || text.indexOf("basket") !== -1 || text.indexOf("bag") !== -1) return "cart";
    return null;
  }
  function bucketFromElement(el){
    var node = el;
    for (var i = 0; node && i < 4; i++, node = node.parentElement) {
      var text = [node.innerText, node.textContent, node.id, node.className, node.name, node.value, node.getAttribute && node.getAttribute("aria-label"), node.getAttribute && node.getAttribute("data-action"), node.getAttribute && node.getAttribute("href")].join(" ");
      var bucket = detectBucketFromText(text);
      if (bucket) return bucket;
    }
    return null;
  }
  function pingCurrentLocation(){
    ping(detectBucketFromLocation(window.location.pathname + " " + window.location.search + " " + document.title));
  }
  window.MerchantSuiteTracker = window.MerchantSuiteTracker || {};
  window.MerchantSuiteTracker.track = function(bucket){ ping(bucket, true); };
  document.addEventListener("click", function(event){
    var bucket = bucketFromElement(event.target);
    if (bucket) setTimeout(function(){ ping(bucket); }, 0);
  }, true);
  document.addEventListener("submit", function(event){
    var bucket = bucketFromElement(event.target);
    if (bucket) ping(bucket);
  }, true);
  ["pushState", "replaceState"].forEach(function(method){
    var original = history[method];
    if (typeof original !== "function") return;
    history[method] = function(){
      var result = original.apply(this, arguments);
      window.dispatchEvent(new Event("locationchange"));
      return result;
    };
  });
  window.addEventListener("popstate", function(){ window.dispatchEvent(new Event("locationchange")); });
  window.addEventListener("locationchange", function(){ setTimeout(pingCurrentLocation, 0); });
  pingCurrentLocation();
  setInterval(ping, 15000);
  document.addEventListener("visibilitychange", function(){ if (!document.hidden) ping(); });
  window.addEventListener("focus", ping);
})();`);
});

app.post("/api/live-visitor/ping", publicTrackerCors, async (req, res) => {
  const { org_id, session_id, url, referrer, bucket, explicit } = req.body || {};
  if (!isValidOrgId(org_id) || typeof session_id !== "string" || session_id.length > 128) {
    return res.status(400).json({ error: "Invalid live visitor payload" });
  }

  try {
    const allKey = `visitors:${org_id}:all`;
    const behaviorBucket = validLiveVisitorBucket(bucket) || liveVisitorBucketFromUrl(url);
    const bucketKey = behaviorBucket ? `visitors:${org_id}:${behaviorBucket}` : null;
    const now = Date.now();
    const keys = [allKey, `visitors:${org_id}:cart`, `visitors:${org_id}:checkout`, `visitors:${org_id}:purchased`];
    await Promise.all(keys.map((key) => countLiveVisitorsForKey(key, now)));
    await addLiveVisitorPresence(allKey, session_id, now);
    if (bucketKey) await addLiveVisitorPresence(bucketKey, session_id, now);
    await capturePostHogEvent({ orgId: org_id, sessionId: session_id, url, referrer, bucket: behaviorBucket, explicit });
    return res.json({ ok: true, tracked: true, bucket: behaviorBucket, storage: redisClient ? "redis" : "memory" });
  } catch (err) {
    console.warn("[LiveVisitor] Redis ping failed:", err.message);
    return res.json({ ok: true, tracked: false });
  }
});

app.get("/api/live-visitors", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    try {
      const allKey = `visitors:${orgId}:all`;
      const cartKey = `visitors:${orgId}:cart`;
      const checkoutKey = `visitors:${orgId}:checkout`;
      const purchasedKey = `visitors:${orgId}:purchased`;
      const now = Date.now();
      const [count, activeCarts, checkingOut, purchased] = await Promise.all([
        countLiveVisitorsForKey(allKey, now),
        countLiveVisitorsForKey(cartKey, now),
        countLiveVisitorsForKey(checkoutKey, now),
        countLiveVisitorsForKey(purchasedKey, now),
      ]);
      return res.json({
        count,
        tracked: true,
        storage: redisClient ? "redis" : "memory",
        details: { activeCarts, checkingOut, purchased },
      });
    } catch (err) {
      console.warn("[LiveVisitor] Redis count failed:", err.message);
      return res.json({ count: 0, tracked: false });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

function buildCustomerAiInsight(customer) {
  const sourceLabel = customer.primarySource === "custom_website" ? "custom website webhook" : customer.primarySource;
  const riskReason = customer.riskLevel === "low"
    ? "No major cancellation or return pattern is visible."
    : `${customer.cancelledOrders || 0} cancelled and ${customer.returnedOrders || 0} returned order(s) across ${customer.totalOrders || 0} order(s).`;
  const nextAction = customer.riskLevel === "high"
    ? "Confirm before dispatch and prefer prepaid payment."
    : customer.segments?.includes("vip")
      ? "Reward with an early-access offer or bundle discount."
      : customer.segments?.includes("inactive")
        ? "Send a win-back message with a clear limited-time offer."
        : "Follow up with a relevant product recommendation.";
  return {
    summary: `${customer.name || "This customer"} has ${customer.totalOrders || 0} order(s), ৳${Math.round(customer.totalSpent || 0).toLocaleString("en-BD")} total spend, and was last seen through ${sourceLabel}.`,
    riskExplanation: riskReason,
    nextAction,
  };
}

app.get("/api/customers", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const [{ data: orders, error: ordersError }, { data: inboxOrders, error: inboxError }] = await Promise.all([
      supabase
        .from("orders")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false }),
      supabase
        .from("social_inbox_orders")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false }),
    ]);

    if (ordersError) throw ordersError;
    if (inboxError) throw inboxError;

    const customers = buildCustomers({ orders: orders || [], inboxOrders: inboxOrders || [] });
    return res.json({ customers, summary: summarizeCustomers(customers) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/customers/ai-insight", rateLimitAI, async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const supabase = getServiceSupabase();
    await getUserOrg(supabase, user.id);

    const customer = req.body?.customer;
    if (!customer || typeof customer !== "object") return res.status(400).json({ error: "customer is required" });

    const fallback = buildCustomerAiInsight(customer);
    if (!process.env.OPENAI_API_KEY) return res.json({ insight: fallback, source: "rules" });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.CUSTOMER_INSIGHT_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 350,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are a Bangladeshi e-commerce customer intelligence analyst. Return only JSON with summary, riskExplanation, nextAction. Be concise. Do not invent facts outside the provided customer object.",
          },
          {
            role: "user",
            content: JSON.stringify({
              name: customer.name,
              phone: customer.phone ? "present" : "missing",
              totalOrders: customer.totalOrders,
              totalSpent: customer.totalSpent,
              averageOrderValue: customer.averageOrderValue,
              primarySource: customer.primarySource,
              sources: customer.sources,
              riskLevel: customer.riskLevel,
              segments: customer.segments,
              recentTimeline: Array.isArray(customer.timeline) ? customer.timeline.slice(0, 5) : [],
            }),
          },
        ],
      }),
    });

    if (!response.ok) return res.json({ insight: fallback, source: "rules" });
    const data = await response.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    return res.json({ insight: { ...fallback, ...parsed }, source: "ai" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/orders", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const allowed = [
      "shopify_order_id",
      "order_number",
      "customer_name",
      "phone",
      "address",
      "product",
      "quantity",
      "price",
      "delivery_rate",
      "status",
      "fraud_checked",
      "fraud_data",
      "fulfillment_status",
      "notes",
    ];
    const row = { org_id: orgId };
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) row[key] = req.body[key];
    }
    if (!row.shopify_order_id) {
      row.shopify_order_id = -(Math.floor(Math.random() * 9_000_000_000_000) + 1_000_000_000_000);
    }
    if (!row.order_number) row.order_number = `#M${await getNextManualOrderSeq(orgId)}`;
    if (!row.status) row.status = "pending";

    const { data, error } = await supabase
      .from("orders")
      .insert(row)
      .select("*")
      .single();

    if (error) throw error;
    return res.status(201).json({ success: true, order: data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.patch("/api/orders/:id", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const allowed = ["status", "notes", "courier_status", "consignment_id", "tracking_code", "courier_message", "sent_to_courier", "fraud_checked", "fraud_data", "price", "delivery_rate"];
    const update = {};
    for (const k of allowed) { if (req.body[k] !== undefined) update[k] = req.body[k]; }
    // Verify org ownership — tenant can only update their own orders.
    const { data: orderCheck } = await supabase.from("orders").select("*").eq("id", req.params.id).eq("org_id", orgId).single();
    if (!orderCheck) return res.status(404).json({ error: "Order not found" });
    await supabase.from("orders").update(update).eq("id", req.params.id).eq("org_id", orgId);
    const { data } = await supabase.from("orders").select("*").eq("id", req.params.id).eq("org_id", orgId).single();
    return res.json({ success: true, order: data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.delete("/api/orders", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: "ids array required" });

    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const { data, error } = await supabase
      .from("orders")
      .delete()
      .in("id", ids)
      .eq("org_id", orgId)
      .select("id");

    if (error) throw error;
    return res.json({ success: true, deleted: data?.length || 0, ids: (data || []).map((row) => row.id) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/send-to-courier", async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: "Order ID is required" });

    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const cfg = await getOrgSettings(orgId, ["steadfast_api_key", "steadfast_secret_key"]);
    const apiKey = cfg["steadfast_api_key"];
    const secretKey = cfg["steadfast_secret_key"];
    if (!apiKey || !secretKey) return res.status(500).json({ error: "Steadfast credentials not configured. Go to Settings → Integrations." });

    const { data: order, error: fetchError } = await supabase.from("orders").select("*").eq("id", orderId).eq("org_id", orgId).single();
    if (fetchError || !order) return res.status(404).json({ error: "Order not found" });
    if (order.sent_to_courier) return res.status(400).json({ error: "Order already sent to courier", consignment_id: order.consignment_id });

    const cleanedPhone = normalizeBdPhone(order.phone || "");
    if (cleanedPhone === null || cleanedPhone.length !== 11 || !cleanedPhone.startsWith("01")) {
      return res.status(400).json({ error: "Invalid phone number. Must be 11 digits starting with 01." });
    }

    const invoice = `ORD-${(order.order_number || order.id.slice(-8)).replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase()}`;
    const payload = {
      invoice,
      recipient_name: order.customer_name || "Customer",
      recipient_phone: cleanedPhone,
      recipient_address: order.address || "No address provided",
      cod_amount: (parseFloat(order.price) || 0) + (parseFloat(order.delivery_rate) || 0),
      note: order.product ? `${order.quantity || 1}x ${order.product}` : "N/A",
    };

    const sfRes = await fetch("https://portal.packzy.com/api/v1/create_order", {
      method: "POST",
      headers: { "Api-Key": apiKey, "Secret-Key": secretKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const sfData = await sfRes.json();

    if (sfData.status !== 200) {
      const sfError = sfData.message || (sfData.errors ? JSON.stringify(sfData.errors) : "Steadfast rejected the order");
      console.error("[Steadfast] create_order rejected:", JSON.stringify(sfData));
      await supabase.from("orders").update({ courier_message: sfError }).eq("id", orderId).eq("org_id", orgId);
      return res.status(400).json({ error: sfError, details: sfData });
    }

    const consignment = sfData.consignment;
    await supabase.from("orders").update({
      sent_to_courier: true,
      consignment_id: String(consignment.consignment_id),
      tracking_code: consignment.tracking_code,
      courier_status: consignment.status,
      courier_message: "Sent to Steadfast successfully",
      courier_name: "steadfast",
    }).eq("id", orderId).eq("org_id", orgId);

    const { data: updated } = await supabase.from("orders").select("*").eq("id", orderId).eq("org_id", orgId).single();
    // Send Order Dispatch SMS in background
    if (updated) {
      sendBulkSms(orgId, "dispatch", updated).catch(console.error);
    }
    return res.json({ success: true, consignment, order: updated });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/send-to-pathao", async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: "Order ID is required" });

    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const cfg = await getOrgSettings(orgId, ["pathao_store_id"]);
    const storeId = cfg["pathao_store_id"];
    if (!storeId) return res.status(500).json({ error: "Pathao credentials not configured. Go to Settings → Integrations." });

    const { data: order, error: fetchError } = await supabase.from("orders").select("*").eq("id", orderId).eq("org_id", orgId).single();
    if (fetchError || !order) return res.status(404).json({ error: "Order not found" });

    const cleanedPhone = normalizeBdPhone(order.phone || "");
    if (cleanedPhone === null || cleanedPhone.length !== 11 || !cleanedPhone.startsWith("01")) {
      return res.status(400).json({ error: "Invalid phone number. Must be 11 digits starting with 01." });
    }

    const accessToken = await getPathaoToken(orgId);
    const pathaoPayload = {
      store_id: parseInt(storeId),
      merchant_order_id: `ORD-${order.order_number || order.id.slice(-8).toUpperCase()}`,
      recipient_name: order.customer_name || "Customer",
      recipient_phone: cleanedPhone,
      recipient_address: order.address || "No address provided",
      delivery_type: 48,
      item_type: 2,
      special_instruction: order.product ? `${order.quantity || 1}x ${order.product}` : "N/A",
      item_quantity: order.quantity || 1,
      item_weight: 0.5,
      amount_to_collect: (parseFloat(order.price) || 0) + (parseFloat(order.delivery_rate) || 0),
    };

    const pathaoRes = await fetch("https://api-hermes.pathao.com/aladdin/api/v1/orders", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(pathaoPayload),
    });
    const pathaoData = await pathaoRes.json();

    if (!pathaoRes.ok) {
      await supabase.from("orders").update({ courier_message: pathaoData.message || "Failed" }).eq("id", orderId).eq("org_id", orgId);
      return res.status(400).json({ error: pathaoData.message || "Pathao rejected the order", details: pathaoData });
    }

    const consignment = pathaoData.data;
    const consignmentId = consignment?.consignment_id ? String(consignment.consignment_id) : null;
    const deliveryFee = consignment?.delivery_fee != null ? Number(consignment.delivery_fee) : null;
    await supabase.from("orders").update({
      sent_to_courier: true,
      consignment_id: consignmentId,
      tracking_code: consignmentId,
      courier_status: "Pending",
      courier_message: "Sent to Pathao successfully",
      courier_name: "pathao",
      courier_fee: deliveryFee,
    }).eq("id", orderId).eq("org_id", orgId);

    const { data: updated } = await supabase.from("orders").select("*").eq("id", orderId).eq("org_id", orgId).single();
    // Send Order Dispatch SMS in background
    if (updated) {
      sendBulkSms(orgId, "dispatch", updated).catch(console.error);
    }
    return res.json({ success: true, consignment, order: updated });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── Pathao: refresh courier status for all active Pathao orders ───────────────
app.post("/api/pathao/refresh-status", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    const finalStatuses = ["delivered", "returned", "cancelled", "rejected"];
    const { data: pathaoOrders } = await supabase
      .from("orders")
      .select("id, consignment_id, tracking_code, courier_status, status, courier_name, courier_message")
      .eq("org_id", orgId)
      .eq("sent_to_courier", true);

    if (!pathaoOrders?.length) return res.json({ updated: 0 });

    // Filter to Pathao orders only (by courier_name or courier_message fallback)
    const activeOrders = pathaoOrders.filter((o) => {
      const isPathao = o.courier_name === "pathao" ||
        (!o.courier_name && (o.courier_message || "").toLowerCase().includes("pathao"));
      const hasId = o.consignment_id || o.tracking_code;
      const notFinal = !finalStatuses.includes((o.courier_status || "").toLowerCase());
      return isPathao && hasId && notFinal;
    });

    if (!activeOrders.length) return res.json({ updated: 0 });

    let accessToken;
    try { accessToken = await getPathaoToken(orgId); }
    catch { return res.json({ updated: 0, error: "Pathao not configured" }); }

    let updated = 0;
    for (const order of activeOrders) {
      try {
        const pollId = order.consignment_id || order.tracking_code;
        const infoRes = await fetch(
          `https://api-hermes.pathao.com/aladdin/api/v1/orders/${pollId}/info`,
          { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
        );
        if (!infoRes.ok) continue;
        const info = await infoRes.json();
        const newStatus = info?.data?.order_status || info?.data?.order_status_slug;
        if (!newStatus) continue;

        const normalizedStatus = newStatus.toLowerCase();
        if (normalizedStatus === (order.courier_status || "").toLowerCase()) continue;

        const patch = { courier_status: newStatus };
        if (info?.data?.delivery_fee != null) {
          patch.courier_fee = Number(info.data.delivery_fee) + Number(info.data.cod_fee || 0);
        }
        if (normalizedStatus === "delivered") {
          patch.status = "confirmed";
          patch.fulfillment_status = "delivered";
        } else if (["returned", "return_requested", "return in transit"].some(s => normalizedStatus.includes(s))) {
          patch.courier_status = "Returned";
          patch.status = "cancelled";
        }
        await supabase.from("orders").update(patch).eq("id", order.id).eq("org_id", orgId);
        updated++;
      } catch { /* skip */ }
    }
    return res.json({ updated, total: activeOrders.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── Steadfast: refresh courier status for all active Steadfast orders ─────────
app.post("/api/steadfast/refresh-status", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    const cfg = await getOrgSettings(orgId, ["steadfast_api_key", "steadfast_secret_key"]);
    const apiKey = cfg["steadfast_api_key"];
    const secretKey = cfg["steadfast_secret_key"];
    if (!apiKey || !secretKey) return res.json({ updated: 0, error: "Steadfast not configured" });

    const finalStatuses = ["delivered", "partial_delivered", "cancelled", "returned"];
    const { data: sfOrders } = await supabase
      .from("orders")
      .select("id, consignment_id, tracking_code, courier_status, status, courier_name, courier_message")
      .eq("org_id", orgId)
      .eq("sent_to_courier", true);

    if (!sfOrders?.length) return res.json({ updated: 0 });

    // Filter to Steadfast orders only
    const activeOrders = sfOrders.filter((o) => {
      const isSteadfast = o.courier_name === "steadfast" ||
        (!o.courier_name && (o.courier_message || "").toLowerCase().includes("steadfast"));
      const hasId = o.consignment_id || o.tracking_code;
      const notFinal = !finalStatuses.includes((o.courier_status || "").toLowerCase());
      return isSteadfast && hasId && notFinal;
    });

    if (!activeOrders.length) return res.json({ updated: 0 });

    console.log(`[Steadfast Refresh] Polling ${activeOrders.length} active orders for org=${orgId}`);
    let updated = 0;
    for (const order of activeOrders) {
      try {
        const sfPollId = order.consignment_id || order.tracking_code;
        const statusRes = await fetch(
          `https://portal.packzy.com/api/v1/status_by_cid/${sfPollId}`,
          {
            headers: {
              "Api-Key": apiKey,
              "Secret-Key": secretKey,
              "Content-Type": "application/json",
            },
          }
        );
        if (!statusRes.ok) {
          console.log(`[Steadfast Refresh] API returned ${statusRes.status} for cid=${sfPollId}`);
          continue;
        }
        const statusData = await statusRes.json();
        const newStatus = statusData?.delivery_status;
        if (!newStatus) {
          console.log(`[Steadfast Refresh] No delivery_status in response for cid=${sfPollId}:`, JSON.stringify(statusData).slice(0, 200));
          continue;
        }

        const normalizedStatus = newStatus.toLowerCase();
        if (normalizedStatus === (order.courier_status || "").toLowerCase()) continue;

        const patch = { courier_status: newStatus };

        // Map Steadfast statuses to order status updates
        if (normalizedStatus === "delivered" || normalizedStatus === "partial_delivered") {
          patch.status = "confirmed";
          patch.fulfillment_status = "delivered";
        } else if (normalizedStatus === "cancelled") {
          patch.status = "cancelled";
        } else if (normalizedStatus.includes("return") || normalizedStatus === "partial_delivered_approval_pending") {
          patch.courier_status = "returned";
          patch.status = "cancelled";
        }

        console.log(`[Steadfast Refresh] Order ${order.id} cid=${sfPollId}: ${order.courier_status} → ${newStatus}`);
        await supabase.from("orders").update(patch).eq("id", order.id).eq("org_id", orgId);
        updated++;
      } catch (err) {
        console.error(`[Steadfast Refresh] Error polling cid=${order.consignment_id}:`, err.message);
      }
    }
    console.log(`[Steadfast Refresh] Done. Updated ${updated}/${activeOrders.length} orders.`);
    return res.json({ updated, total: activeOrders.length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── Steadfast: webhook for real-time delivery status updates ─────────────────
app.post("/api/webhooks/steadfast", async (req, res) => {
  try {
    const supabase = getServiceSupabase();
    const payload = req.body;
    const consignmentId = String(payload?.consignment_id || "");
    const status = payload?.status || payload?.delivery_status || "";
    if (!consignmentId || !status) {
      return res.status(400).json({ error: "Missing consignment_id or status" });
    }

    // Verify bearer token against stored webhook secret
    const authHeader = req.headers.authorization || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    // Find the order by consignment_id
    const { data: order } = await supabase
      .from("orders")
      .select("id, org_id, courier_status")
      .eq("consignment_id", consignmentId)
      .eq("sent_to_courier", true)
      .maybeSingle();

    if (!order) {
      return res.status(200).json({ ok: true, skipped: "order not found" });
    }

    // Verify webhook secret if configured
    if (bearerToken) {
      const cfg = await getOrgSettings(order.org_id, ["courier_webhook_secret"]);
      const secret = cfg["courier_webhook_secret"];
      if (secret && bearerToken !== secret) {
        return res.status(401).json({ error: "Invalid webhook token" });
      }
    }

    const normalizedStatus = status.toLowerCase();
    if (normalizedStatus === (order.courier_status || "").toLowerCase()) {
      return res.status(200).json({ ok: true, skipped: "status unchanged" });
    }

    const patch = { courier_status: status };
    if (normalizedStatus === "delivered" || normalizedStatus === "partial_delivered") {
      patch.status = "confirmed";
      patch.fulfillment_status = "delivered";
    } else if (normalizedStatus === "cancelled") {
      patch.status = "cancelled";
    } else if (normalizedStatus.includes("return") || normalizedStatus === "partial_delivered_approval_pending") {
      patch.courier_status = "returned";
      patch.status = "cancelled";
    }

    await supabase.from("orders").update(patch).eq("id", order.id).eq("org_id", order.org_id);
    console.log(`[Steadfast Webhook] Order ${order.id} status updated: ${order.courier_status} → ${status}`);
    return res.status(200).json({ ok: true, updated: true });
  } catch (e) {
    console.error("[Steadfast Webhook] error:", e.message);
    return res.status(200).json({ ok: true, error: e.message });
  }
});

// ── Returns ──────────────────────────────────────────────────────────────────

app.get("/api/returns", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    const { data: mainOrders } = await supabase
      .from("orders")
      .select("id, order_number, customer_name, phone, product, price, courier_status, courier_name, courier_fee, consignment_id, return_status, return_reason, return_requested_at, sent_to_courier, created_at")
      .eq("org_id", orgId)
      .eq("sent_to_courier", true)
      .or("courier_status.ilike.%return%,return_status.neq.null,courier_status.eq.cancelled");

    const { data: inboxOrders } = await supabase
      .from("social_inbox_orders")
      .select("id, contact_name, items, total_price, courier_status, courier_name, courier_fee, consignment_id, return_status, return_reason, return_requested_at, sent_to_courier, notes, created_at")
      .eq("org_id", orgId)
      .eq("sent_to_courier", true)
      .or("courier_status.ilike.%return%,return_status.neq.null,courier_status.eq.cancelled");

    const returns = [];

    for (const o of (mainOrders || [])) {
      const cs = (o.courier_status || "").toLowerCase();
      returns.push({
        id: o.id,
        source: "shopify",
        order_number: o.order_number || o.id.slice(-6).toUpperCase(),
        customer_name: o.customer_name || "Unknown",
        phone: o.phone || "",
        product: o.product || "",
        cod_amount: o.price || 0,
        courier_name: o.courier_name || "unknown",
        courier_status: o.courier_status || "",
        courier_fee: o.courier_fee || null,
        consignment_id: o.consignment_id || "",
        return_status: o.return_status || (cs.includes("return") ? "returned" : "cancelled"),
        return_reason: o.return_reason || "",
        return_requested_at: o.return_requested_at || null,
        created_at: o.created_at,
      });
    }

    for (const o of (inboxOrders || [])) {
      const notesStr = o.notes || "";
      const phoneMatch = notesStr.match(/Phone:\s*([^,\n]+)/i);
      const items = o.items || [];
      const productStr = items.map((i) => `${i.quantity || 1}x ${i.product}`).join(", ");
      const cs = (o.courier_status || "").toLowerCase();
      returns.push({
        id: o.id,
        source: "inbox",
        order_number: `IO-${o.id.slice(-6).toUpperCase()}`,
        customer_name: o.contact_name || "Unknown",
        phone: phoneMatch?.[1]?.trim() || "",
        product: productStr,
        cod_amount: o.total_price || 0,
        courier_name: o.courier_name || "unknown",
        courier_status: o.courier_status || "",
        courier_fee: o.courier_fee || null,
        consignment_id: o.consignment_id || "",
        return_status: o.return_status || (cs.includes("return") ? "returned" : "cancelled"),
        return_reason: o.return_reason || "",
        return_requested_at: o.return_requested_at || null,
        created_at: o.created_at,
      });
    }

    returns.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const summary = {
      total: returns.length,
      totalLostRevenue: returns.reduce((s, r) => s + (r.cod_amount || 0), 0),
      totalCourierFeesLost: returns.reduce((s, r) => s + (r.courier_fee || 0), 0),
      pending: returns.filter((r) => r.return_status === "pending").length,
      processing: returns.filter((r) => ["approved", "processing"].includes(r.return_status)).length,
      completed: returns.filter((r) => ["completed", "returned"].includes(r.return_status)).length,
    };

    return res.json({ returns, summary });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/returns/request", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    const { orderId, source, reason } = req.body;
    if (!orderId) return res.status(400).json({ error: "orderId required" });

    const table = source === "inbox" ? "social_inbox_orders" : "orders";
    const { data: order, error: orderErr } = await supabase
      .from(table)
      .select("id, consignment_id, courier_name, courier_status, sent_to_courier")
      .eq("id", orderId)
      .eq("org_id", orgId)
      .single();

    if (orderErr || !order) return res.status(404).json({ error: "Order not found" });
    if (!order.sent_to_courier) return res.status(400).json({ error: "Order not sent to courier yet" });
    if (!order.consignment_id) return res.status(400).json({ error: "No consignment ID" });

    const courierName = (order.courier_name || "").toLowerCase();
    let returnResult = null;

    if (courierName === "steadfast" || !courierName) {
      const cfg = await getOrgSettings(orgId, ["steadfast_api_key", "steadfast_secret_key"]);
      if (!cfg.steadfast_api_key || !cfg.steadfast_secret_key) {
        return res.status(400).json({ error: "Steadfast not configured" });
      }
      const sfRes = await fetch("https://portal.packzy.com/api/v1/create_return_request", {
        method: "POST",
        headers: {
          "Api-Key": cfg.steadfast_api_key,
          "Secret-Key": cfg.steadfast_secret_key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ consignment_id: order.consignment_id, reason: reason || "" }),
      });
      const sfData = await sfRes.json();
      if (!sfRes.ok) return res.status(400).json({ error: sfData?.message || "Steadfast return request failed" });
      returnResult = sfData;
    } else if (courierName === "pathao") {
      const accessToken = await getPathaoToken(orgId);
      const pathaoRes = await fetch(
        `https://api-hermes.pathao.com/aladdin/api/v1/orders/${order.consignment_id}/cancel`,
        { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" } }
      );
      const pathaoData = await pathaoRes.json();
      if (!pathaoRes.ok) return res.status(400).json({ error: pathaoData?.message || "Pathao cancel request failed" });
      returnResult = pathaoData;
    } else {
      return res.status(400).json({ error: "Unknown courier" });
    }

    const now = new Date().toISOString();
    await supabase.from(table).update({ return_status: "pending", return_reason: reason || null, return_requested_at: now }).eq("id", orderId).eq("org_id", orgId);

    return res.json({ success: true, return_status: "pending", result: returnResult });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get("/api/returns/sync", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    const cfg = await getOrgSettings(orgId, ["steadfast_api_key", "steadfast_secret_key"]);
    let synced = 0;

    if (cfg.steadfast_api_key && cfg.steadfast_secret_key) {
      try {
        const sfRes = await fetch("https://portal.packzy.com/api/v1/get_return_requests", {
          headers: { "Api-Key": cfg.steadfast_api_key, "Secret-Key": cfg.steadfast_secret_key, "Content-Type": "application/json" },
        });
        if (sfRes.ok) {
          const sfData = await sfRes.json();
          const requests = Array.isArray(sfData) ? sfData : (sfData?.data || []);
          for (const rr of requests) {
            if (!rr.consignment_id || !rr.status) continue;
            const { data: updated } = await supabase.from("orders").update({ return_status: rr.status }).eq("consignment_id", String(rr.consignment_id)).eq("org_id", orgId).select("id");
            if (updated?.length) { synced++; continue; }
            await supabase.from("social_inbox_orders").update({ return_status: rr.status }).eq("consignment_id", String(rr.consignment_id)).eq("org_id", orgId);
            synced++;
          }
        }
      } catch (err) {
        console.warn("[Returns Sync] Steadfast failed:", err.message);
      }
    }

    return res.json({ synced });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/returns/backfill-fees", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    // Find all orders with courier but no fee recorded
    const { data: orders } = await supabase
      .from("orders")
      .select("id, consignment_id, courier_name, courier_message")
      .eq("org_id", orgId)
      .eq("sent_to_courier", true)
      .is("courier_fee", null);

    if (!orders?.length) return res.json({ updated: 0, message: "No orders missing courier fees" });

    const pathaoOrders = orders.filter((o) => {
      const cn = (o.courier_name || "").toLowerCase();
      const cm = (o.courier_message || "").toLowerCase();
      return cn === "pathao" || (!cn && cm.includes("pathao"));
    });
    const steadfastOrders = orders.filter((o) => {
      const cn = (o.courier_name || "").toLowerCase();
      const cm = (o.courier_message || "").toLowerCase();
      return cn === "steadfast" || (!cn && !cm.includes("pathao"));
    });

    let updated = 0;

    // Backfill courier fees using configurable flat rates
    // Pathao order info API does NOT return delivery_fee — only the create response does.
    // So for past orders, use flat rate settings.
    const cfg = await getOrgSettings(orgId, ["steadfast_delivery_fee", "pathao_delivery_fee"]);
    const sfFee = Number(cfg.steadfast_delivery_fee) || 70;
    const pathaoFee = Number(cfg.pathao_delivery_fee) || 80;

    for (const order of pathaoOrders) {
      await supabase.from("orders").update({ courier_fee: pathaoFee }).eq("id", order.id).eq("org_id", orgId);
      updated++;
    }

    for (const order of steadfastOrders) {
      await supabase.from("orders").update({ courier_fee: sfFee }).eq("id", order.id).eq("org_id", orgId);
      updated++;
    }

    // Also backfill social_inbox_orders
    const { data: inboxOrders } = await supabase
      .from("social_inbox_orders")
      .select("id, consignment_id, courier_name, courier_message")
      .eq("org_id", orgId)
      .eq("sent_to_courier", true)
      .is("courier_fee", null);

    if (inboxOrders?.length) {
      for (const order of inboxOrders) {
        const cn = (order.courier_name || "").toLowerCase();
        const cm = (order.courier_message || "").toLowerCase();
        const isPathao = cn === "pathao" || (!cn && cm.includes("pathao"));
        const fee = isPathao ? pathaoFee : sfFee;
        await supabase.from("social_inbox_orders").update({ courier_fee: fee }).eq("id", order.id).eq("org_id", orgId);
        updated++;
      }
    }

    return res.json({ updated, pathao: pathaoOrders.length, steadfast: steadfastOrders.length, message: `Applied flat rates: Pathao ৳${pathaoFee}, Steadfast ৳${sfFee}. Set pathao_delivery_fee / steadfast_delivery_fee in Settings to customize.` });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/check-fraud", async (req, res) => {
  try {
    const { orderId } = req.body || {};
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    incrementUsage(orgId, "fraud_checks").catch(() => {});
    const fraudShieldApiKey = (process.env.FRAUDSHIELD_API_KEY || "").trim();
    if (!fraudShieldApiKey) return res.status(400).json({ error: "FraudShield API key not configured in environment" });

    if (orderId) {
      const { data: order, error: fetchError } = await supabase
        .from("orders")
        .select("id, phone, fraud_checked, fraud_data")
        .eq("id", orderId)
        .eq("org_id", orgId)
        .single();

      if (fetchError || !order) return res.status(404).json({ error: "Order not found" });
      if (!order.phone) return res.status(400).json({ error: "Order has no phone number" });

      const { fraudData, errorMessage } = await checkFraudStatus(order.phone, fraudShieldApiKey);
      const dataToStore = fraudData ?? { _error: errorMessage ?? "Unknown error" };

      await supabase
        .from("orders")
        .update({ fraud_checked: true, fraud_data: dataToStore })
        .eq("id", order.id)
        .eq("org_id", orgId);

      const { data: updatedOrder } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .eq("org_id", orgId)
        .single();

      return res.json({ success: true, order: updatedOrder, fraudError: errorMessage });
    }

    const { data: orders, error: fetchError } = await supabase
      .from("orders")
      .select("id, shopify_order_id, phone, fraud_checked, fraud_data")
      .eq("org_id", orgId)
      .order("shopify_order_id", { ascending: false })
      .limit(15);

    if (fetchError) return res.status(500).json({ error: "Failed to fetch orders", details: fetchError.message });

    const ordersToCheck = (orders || []).filter((order) => !order.fraud_data && order.phone);
    let checkedCount = 0;
    let successCount = 0;

    for (const order of ordersToCheck) {
      if (checkedCount > 0) await new Promise((resolve) => setTimeout(resolve, 1500));

      const { fraudData, errorMessage } = await checkFraudStatus(order.phone, fraudShieldApiKey);
      checkedCount++;

      const dataToStore = fraudData ?? { _error: errorMessage ?? "Unknown error" };
      const { error: updateError } = await supabase
        .from("orders")
        .update({ fraud_checked: true, fraud_data: dataToStore })
        .eq("id", order.id)
        .eq("org_id", orgId);

      if (!updateError && fraudData) successCount++;
    }

    const { data: allOrders } = await supabase
      .from("orders")
      .select("*")
      .eq("org_id", orgId)
      .order("shopify_order_id", { ascending: false });

    return res.json({ success: true, checked: checkedCount, successful: successCount, orders: allOrders || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/inbox-orders/check-fraud", async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: "Order ID is required" });

    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    incrementUsage(orgId, "fraud_checks").catch(() => {});
    const { data: order, error: fetchError } = await supabase.from("social_inbox_orders").select("*").eq("id", orderId).eq("org_id", orgId).single();
    if (fetchError || !order) return res.status(404).json({ error: "Inbox order not found" });

    const { phone: rawPhone } = parseInboxOrderNotes(order.notes);
    if (!rawPhone) return res.status(400).json({ error: "No phone number found in this order's notes" });

    const fraudShieldApiKey = (process.env.FRAUDSHIELD_API_KEY || "").trim();
    if (!fraudShieldApiKey) return res.status(400).json({ error: "FraudShield API key not configured in environment" });

    const { fraudData, errorMessage } = await checkFraudStatus(rawPhone, fraudShieldApiKey);
    const dataToStore = fraudData ?? { _error: errorMessage ?? "Unknown error" };

    await supabase.from("social_inbox_orders").update({ fraud_checked: true, fraud_data: dataToStore }).eq("id", orderId).eq("org_id", orgId);
    const { data: updated } = await supabase.from("social_inbox_orders").select("*").eq("id", orderId).eq("org_id", orgId).single();
    return res.json({ success: true, order: updated, fraudError: errorMessage });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ─── Unified Social Inbox + Meta Webhooks ───────────────────────────────────

async function findMetaChannelByRecipient(supabase, recipientId, platformHint = "facebook") {
  if (!recipientId) return null;
  if (platformHint === "instagram") {
    const { data: ig } = await supabase
      .from("meta_instagram_accounts")
      .select("org_id, page_id, instagram_account_id")
      .eq("instagram_account_id", recipientId)
      .maybeSingle();
    if (ig) {
      const { data: page } = await supabase
        .from("meta_pages")
        .select("encrypted_page_access_token, page_id")
        .eq("org_id", ig.org_id)
        .eq("page_id", ig.page_id)
        .maybeSingle();
      return { ...ig, page_id: ig.page_id || page?.page_id, encrypted_page_access_token: page?.encrypted_page_access_token };
    }
  }
  const { data: page } = await supabase
    .from("meta_pages")
    .select("org_id, page_id, instagram_account_id, encrypted_page_access_token")
    .eq("page_id", recipientId)
    .maybeSingle();
  if (page) return page;
  const { data: igByPage } = await supabase
    .from("meta_pages")
    .select("org_id, page_id, instagram_account_id, encrypted_page_access_token")
    .eq("instagram_account_id", recipientId)
    .maybeSingle();
  return igByPage || null;
}

async function upsertSocialMessage({ supabase, orgId, platform, contactId, contactName, sender, content, imageUrl, messageType }) {
  const now = new Date().toISOString();
  let { data: conversation, error: findError } = await supabase
    .from("social_conversations")
    .select("*")
    .eq("org_id", orgId)
    .eq("platform", platform)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (findError) throw findError;

  if (!conversation) {
    const inserted = await supabase
      .from("social_conversations")
      .insert({
        org_id: orgId,
        platform,
        contact_id: contactId,
        contact_name: contactName || contactId,
        last_message: content || `[${messageType}]`,
        last_message_at: now,
        unread_count: sender === "user" ? 1 : 0,
      })
      .select()
      .single();
    if (inserted.error) throw inserted.error;
    conversation = inserted.data;
  } else {
    const { data: updated, error: updateError } = await supabase
      .from("social_conversations")
      .update({
        contact_name: (contactName && contactName !== contactId)
          ? contactName
          : (/^\d{10,}$/.test(conversation.contact_name || "") ? (contactName || conversation.contact_name) : conversation.contact_name),
        last_message: content || `[${messageType}]`,
        last_message_at: now,
        unread_count: sender === "user" ? (conversation.unread_count || 0) + 1 : conversation.unread_count || 0,
      })
      .eq("id", conversation.id)
      .eq("org_id", orgId)
      .select()
      .single();
    if (updateError) throw updateError;
    conversation = updated;
  }

  const { data: message, error: messageError } = await supabase
    .from("social_messages")
    .insert({
      conversation_id: conversation.id,
      sender,
      content: content || "",
      image_url: imageUrl || null,
      message_type: messageType || "text",
    })
    .select()
    .single();
  if (messageError) throw messageError;
  return { conversation, message };
}

// ─── Meta AI Reply Pipeline ───────────────────────────────────────────────────
//
// Clean, single-function design:
//  1. Every incoming message → one GPT-4o call with vision + catalog + history
//  2. GPT returns JSON with { reply, order } — structured output
//  3. If order is fully populated, insert to social_inbox_orders automatically
//
// No heuristic intent detection. No conditional product loading. Always run GPT.

async function getMetaReplyProductContext(orgId) {
  try {
    const supabase = getServiceSupabase();
    const { data: products, error } = await supabase
      .from("products")
      .select("id, name, url, image_url, selling_price")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(250);
    if (error) throw error;
    const rows = products || [];
    const stockMap = rows.length ? await getProductStockMap(orgId, rows.map((p) => p.id)) : {};

    // Load all variants for these products in one query
    let variantsMap = {};
    if (rows.length > 0) {
      const { data: variantRows } = await supabase
        .from("product_variants")
        .select("product_id, attributes, stock_quantity, price_adjustment")
        .in("product_id", rows.map((p) => p.id))
        .eq("org_id", orgId);
      for (const v of variantRows || []) {
        if (!variantsMap[v.product_id]) variantsMap[v.product_id] = [];
        variantsMap[v.product_id].push(v);
      }
    }

    return rows.map((p) => {
      const baseStock = stockMap[p.id] ?? 0;
      const variants = (variantsMap[p.id] || []).map((v) => ({
        attributes: v.attributes,                      // e.g. {color:"Black", size:"M"}
        available: v.stock_quantity > 0,
        price: v.price_adjustment
          ? (p.selling_price != null ? Number(p.selling_price) + Number(v.price_adjustment) : null)
          : (p.selling_price != null ? Number(p.selling_price) : null),
      }));
      return {
        name: p.name,
        price: p.selling_price != null ? Number(p.selling_price) : null,
        // available reflects product-level stock only when no variants exist
        available: variants.length > 0
          ? variants.some((v) => v.available)          // true if at least one variant is in stock
          : baseStock > 0,
        variants,                                       // [] for products with no variants
        url: p.url || null,
        image_url: p.image_url || null,
      };
    });
  } catch (err) {
    console.warn("[Meta AI] product context unavailable:", errorMessage(err));
    return [];
  }
}

// ─── Image helpers ────────────────────────────────────────────────────────────

const OPENAI_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

function normalizeOpenAiImageMime(mime = "") {
  const value = String(mime || "").split(";")[0].trim().toLowerCase();
  if (value === "image/jpg" || value === "image/pjpeg") return "image/jpeg";
  return value;
}

async function prepareOpenAiImageRef(url = "", authToken = "") {
  const value = String(url || "").trim();
  if (!value) return null;
  if (value.startsWith("data:")) {
    const mime = normalizeOpenAiImageMime(value.match(/^data:([^;,]+)[;,]/i)?.[1]);
    return OPENAI_IMAGE_MIME_TYPES.has(mime) ? value : null;
  }
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.toLowerCase();
    // Only return as direct URL if public (no token) AND has clear image extension
    if (!authToken && /\.(png|jpe?g|gif|webp)$/i.test(pathname)) return value;
  } catch { /* not a URL */ }
  // Fetch and base64-encode — use auth token if provided (Instagram, WhatsApp CDN URLs are token-gated)
  try {
    const headers = { "User-Agent": "ArcLab/1.0" };
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
    const response = await fetch(value, {
      headers,
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return null;
    const mime = normalizeOpenAiImageMime(response.headers.get("content-type"));
    if (!OPENAI_IMAGE_MIME_TYPES.has(mime)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 18 * 1024 * 1024) return null;
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

// ─── Image Embedding Helpers ─────────────────────────────────────────────────

async function describeProductImage(imageUrl) {
  if (!imageUrl || !process.env.OPENAI_API_KEY) return null;
  try {
    const safeUrl = typeof imageUrl === "string" && imageUrl.startsWith("data:") ? imageUrl : await prepareOpenAiImageRef(imageUrl);
    if (!safeUrl) return null;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 150,
        messages: [
          {
            role: "system",
            content: "Describe this product image in 1-2 sentences for search purposes. Focus on: product type, material, color, shape, size, and primary function. Be specific and factual. Do not mention backgrounds or styling.",
          },
          {
            role: "user",
            content: [{ type: "image_url", image_url: { url: safeUrl } }],
          },
        ],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.warn("[Embedding] describeProductImage failed:", err.message);
    return null;
  }
}

async function generateTextEmbedding(text) {
  if (!text || !process.env.OPENAI_API_KEY) return null;
  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.data?.[0]?.embedding || null;
  } catch (err) {
    console.warn("[Embedding] generateTextEmbedding failed:", err.message);
    return null;
  }
}

async function generateProductEmbedding(imageUrl) {
  const description = await describeProductImage(imageUrl);
  if (!description) return { embedding: null, description: null };
  const embedding = await generateTextEmbedding(description);
  return { embedding, description };
}

async function findSimilarProducts(orgId, embedding, limit = 3, threshold = 0.6) {
  if (!embedding || !orgId) return [];
  const supabase = getServiceSupabase();
  const vectorStr = `[${embedding.join(",")}]`;

  const { data, error } = await supabase.rpc("match_products_by_embedding", {
    query_embedding: vectorStr,
    match_org_id: orgId,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    console.warn("[Embedding] findSimilarProducts RPC failed:", error.message);
    return [];
  }
  return data || [];
}

// ─── Conversation history ─────────────────────────────────────────────────────
// Only include messages from the current session.
// A "session" ends after 30 minutes of inactivity — if the gap between any two
// consecutive messages exceeds 30 minutes, everything before that gap is dropped.
// This prevents stale order-collection state from bleeding into a new conversation.

async function getRecentConversationHistory(supabase, conversationId, limit = 20) {
  if (!conversationId) return { history: "", isNewSession: false, priorSessionHistory: "" };
  const { data, error } = await supabase
    .from("social_messages")
    .select("sender, content, image_url, message_type, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[Meta AI] history lookup failed:", errorMessage(error));
    return { history: "", isNewSession: false, priorSessionHistory: "" };
  }
  const messages = (data || []).reverse();
  if (!messages.length) return { history: "", isNewSession: false, priorSessionHistory: "" };

  // Find the start of the current session — walk backwards from the latest
  // message and stop when we hit a gap of more than 30 minutes between messages.
  const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes
  const sessionMessages = [];
  let sessionBoundaryIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (sessionMessages.length === 0) {
      sessionMessages.unshift(messages[i]);
    } else {
      const newerTs = new Date(sessionMessages[0].created_at).getTime();
      const olderTs = new Date(messages[i].created_at).getTime();
      if (newerTs - olderTs > SESSION_GAP_MS) { sessionBoundaryIdx = i; break; }
      sessionMessages.unshift(messages[i]);
    }
  }

  const formatMessages = (msgs) => msgs.map((m) => {
    const who = m.sender === "bot" ? "assistant" : "customer";
    const img = m.image_url ? " [image]" : "";
    const body = String(m.content || "").trim() || `[${m.message_type || "message"}]`;
    return `${who}${img}: ${body}`.slice(0, 900);
  }).join("\n");

  const isNewSession = sessionBoundaryIdx >= 0 && sessionMessages.length <= 2;
  const priorSessionMessages = sessionBoundaryIdx >= 0 ? messages.slice(0, sessionBoundaryIdx + 1) : [];

  return {
    history: formatMessages(sessionMessages),
    isNewSession,
    priorSessionHistory: formatMessages(priorSessionMessages),
  };
}

// ─── Conversation summary generation ─────────────────────────────────────────

async function generateConversationSummary(conversationHistory, existingSummary = "") {
  if (!process.env.OPENAI_API_KEY || !conversationHistory) return existingSummary || "";
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 300,
        messages: [
          { role: "system", content: `You summarize customer conversations for a Bangladeshi e-commerce shop. Create a concise summary that captures: customer preferences, products discussed, orders placed (with details), complaints, delivery info, and any important context for future interactions. Keep it under 200 words. Write in English.${existingSummary ? `\n\nPREVIOUS SUMMARY:\n${existingSummary}` : ""}` },
          { role: "user", content: `Summarize this conversation session:\n${conversationHistory}` },
        ],
      }),
    });
    if (!response.ok) return existingSummary || "";
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || existingSummary || "";
  } catch {
    return existingSummary || "";
  }
}

// ─── Delivery charge inference ────────────────────────────────────────────────

function inferDeliveryCharge(address = "") {
  const lower = String(address || "").toLowerCase();
  const dhakaKeywords = [
    "dhaka", "dhanmondi", "gulshan", "banani", "mirpur", "mohammadpur",
    "uttara", "badda", "khilgaon", "motijheel", "paltan", "farmgate",
    "shahbagh", "new market", "azampur", "tejgaon",
  ];
  return dhakaKeywords.some((k) => lower.includes(k)) ? 80 : 120;
}

function parseInboxOrderNotes(notes = "") {
  return {
    phone: (notes || "").match(/Phone:\s*([^\n,]+)/i)?.[1]?.trim() || "",
    address: (notes || "").match(/Address:\s*(.+)/i)?.[1]?.trim() || "",
  };
}

// ─── Core AI function: one GPT-4o call per message ───────────────────────────
//
// Returns { reply: string, order: object|null }
//
// GPT-4o is instructed to return structured JSON with two fields:
//   reply  — the natural-language reply to send back to the customer
//   order  — null, or a fully-populated order object when all fields collected
//
// This eliminates all heuristic intent detection. GPT decides when the order
// is complete, not a regex.

async function runMetaAI({ brandDoc, products, conversationHistory, customerMessage, imageUrls, imageUrl, platformToken = "", existingOrder = null, aiSummary = "", embeddingMatches = [] }) {
  // Support both old imageUrl (single) and new imageUrls (array)
  const allImageUrls = Array.isArray(imageUrls) && imageUrls.length > 0
    ? imageUrls
    : (imageUrl ? [imageUrl] : []);
  // Build catalog — include variant breakdown so AI can answer availability per option
  const catalog = products.map((p) => {
    const entry = {
      name: p.name,
      price: p.price,
      available: p.available,
      url: p.url || null,
      image_url: p.image_url || null,
    };
    if (p.variants && p.variants.length > 0) {
      // Each variant: readable label + availability + price
      entry.variants = p.variants.map((v) => ({
        option: Object.entries(v.attributes).map(([k, val]) => `${k}: ${val}`).join(", "),
        available: v.available,
        price: v.price,
      }));
    }
    return entry;
  });

  const systemPrompt = `You are a helpful sales assistant for a Bangladeshi e-commerce shop replying to social media DMs (Facebook, Instagram, WhatsApp).

BRAND KNOWLEDGE BASE — read this first and follow it in every reply:
${brandDoc ? brandDoc.slice(0, 3000) : "(No brand document set — use catalog and general best practices only.)"}

RULES:
- Reply in the same language the customer uses (Bangla or English). Keep replies SHORT and natural (1-3 sentences).
- Always follow the tone, policies, and product information in the Brand Knowledge Base above.
- You have vision ability. If the customer sends a product image OR a screenshot of a product page/ad/post, carefully identify the MAIN PRODUCT shown. For screenshots: ignore UI elements, navigation bars, buttons, text overlays, and page chrome — focus on the actual product photos within the screenshot.
- PRODUCT MATCHING: Match the identified product to the catalog by its FUNCTION and core features, NOT by exact name or visual description. Products often have creative/marketing names that do NOT describe their appearance. For example, a product named "Oil Storage Jar" might look like a decorative gold teapot/kettle — the name is about its PURPOSE (storing oil), not its shape. Similarly:
  • "Automatic mixing cup" / "Self Stirring Coffee Mug" / "Electric Stirring Mug" = SAME product
  • "Insulated tumbler" / "Vacuum flask" / "Thermal cup" = SAME category
  • A gold/stainless steel kettle-shaped container = could be an "Oil Storage Jar" or "Oil Dispenser"
  IMPORTANT: Each product in the catalog has an image_url field. If the product in the customer's image could plausibly be ANY item in the catalog (considering that catalog names may be creative/non-literal), lean toward MATCHING rather than rejecting. Only say "not available" when you are highly confident the product is genuinely NOT in the catalog at all — err on the side of matching.
- Use ৳ for prices. Never reveal exact stock counts — only say "available" or "out of stock" per variant or product.
- When a customer asks about a product that has variants (colors, sizes, weights, etc.), list the AVAILABLE variants only. Do NOT mention out-of-stock variants unless the customer specifically asks.
- If ALL variants of a product are out of stock, say the product is currently unavailable.
- When the customer wants to place a NEW order: ask for ALL required details in ONE message using bullet points — name, phone number, and delivery address. Do NOT ask for them one by one. Example: "অর্ডার করতে নিচের তথ্যগুলো দিন:\n• নাম\n• ফোন নম্বর\n• ডেলিভারি ঠিকানা"
- Once you have name, phone, address, product name, and quantity all confirmed, set order to the populated object. Do not set order until every field is present and confirmed.
- Never invent prices, discounts, or delivery promises not in the catalog or brand knowledge base.
- IMPORTANT: If the customer sends a simple greeting (Hi, Hello, Hey, Assalamualaikum, etc.) with NO prior context in the conversation history shown, treat it as the START of a new conversation. Greet them naturally and ask how you can help. Do NOT continue any previous order collection or assume they want to order something specific.
- PRICING: unit_price must be the price PER SINGLE ITEM from the catalog. If a customer asks "980 takai koita glass?" they are asking how many items they get for 980 — answer based on catalog price. Do NOT set unit_price to the total package price. Example: if catalog price is 490/item and customer orders 2, unit_price=490, quantity=2.
- CONFIRMED TOTAL: When you confirm the order, calculate confirmed_total = (unit_price × quantity) + delivery charge. Use 80 for Dhaka, 120 for outside Dhaka. Always state the total clearly to the customer before confirming.
- ORDER EDITS: If an existing order was already placed in this conversation (shown in EXISTING ORDER below) and the customer wants to change items, add items, change quantity, address, or other details:
  • Do NOT ask for name, phone, or address again — you already have these from the existing order. Just confirm the change and apply it immediately.
  • If the customer wants to REPLACE an item (e.g., "eita change kore onno ta diyen"), REMOVE the old item and ADD the new one. The final items list should ONLY contain what the customer actually wants after the change.
  • If the customer wants to ADD an item to the existing order, keep existing items AND add the new one.
  • Set order_action to "edit". IMPORTANT: In the "order" JSON, you MUST still include customer_name, phone, address, product_name, quantity, and unit_price fields (copy them from the existing order). The system requires these fields to process the edit. Only change the items/product fields — keep name, phone, address the same as the existing order.
  • There is only ONE delivery charge per order regardless of how many items. confirmed_total = (sum of all item prices × their quantities) + ONE delivery charge.
- ORDER CANCEL: If the customer wants to cancel their existing order, set order_action to "cancel" with the existing order fields. Confirm cancellation with the customer before setting cancel.

CATALOG (name, price, availability, variants where applicable):
${JSON.stringify(catalog).slice(0, 12000)}
${embeddingMatches.length > 0 ? `
IMAGE MATCH RESULTS (products from our catalog that visually match the customer's image, ranked by similarity):
${embeddingMatches.map((m, i) => `${i + 1}. ${m.name} — ৳${m.selling_price || "N/A"} (${(m.similarity * 100).toFixed(0)}% match)${m.image_description ? ` [${m.image_description}]` : ""}`).join("\n")}

IMPORTANT: If the customer sent an image, prefer the IMAGE MATCH RESULTS above over guessing from the catalog names. The top match is very likely the correct product. Use it to respond.` : ""}

RESPONSE FORMAT — return ONLY valid JSON, no prose, no markdown:
{
  "reply": "<your message to the customer>",
  "order": null,
  "order_action": null
}

Or when all order fields are collected (new order):
{
  "reply": "<confirmation message>",
  "order": {
    "customer_name": "",
    "phone": "",
    "address": "",
    "product_name": "",
    "quantity": 1,
    "unit_price": 0,
    "confirmed_total": 0
  },
  "order_action": "create"
}

Or when customer wants to edit their existing order (add/change items):
{
  "reply": "<update confirmation message>",
  "order": {
    "customer_name": "",
    "phone": "",
    "address": "",
    "product_name": "item1, item2",
    "quantity": 1,
    "unit_price": 0,
    "confirmed_total": 0,
    "items": [{"product": "item1", "quantity": 1, "unit_price": 100}, {"product": "item2", "quantity": 2, "unit_price": 200}]
  },
  "order_action": "edit"
}
Note: For edits with multiple items, use the "items" array. confirmed_total = sum of (each item's unit_price × quantity) + ONE delivery charge.

Or when customer wants to cancel:
{
  "reply": "<cancellation confirmation>",
  "order": null,
  "order_action": "cancel"
}`;

  // Build message array — add ALL customer images to the vision context
  const userContent = [];
  const summaryContext = aiSummary
    ? `\n\nPRIOR CONVERSATION SUMMARY (from previous sessions with this customer):\n${aiSummary}`
    : "";
  let existingOrderContext = "";
  if (existingOrder) {
    const notesStr = existingOrder.notes || "";
    const phoneMatch = notesStr.match(/Phone:\s*([^,\n]+)/i);
    const addressMatch = notesStr.match(/Address:\s*(.+)/i);
    existingOrderContext = `\n\nEXISTING ORDER (already placed in this conversation — customer may want to edit it):\nOrder ID: ${existingOrder.id}\nCustomer Name: ${existingOrder.contact_name || "Unknown"}\nPhone: ${phoneMatch?.[1]?.trim() || "Unknown"}\nAddress: ${addressMatch?.[1]?.trim() || "Unknown"}\nItems: ${JSON.stringify(existingOrder.items)}\nTotal: ৳${existingOrder.total_price}\nStatus: ${existingOrder.status}\n\nWhen editing this order, copy the customer_name, phone, and address into the order JSON — do NOT ask the customer for them again.`;
  }
  userContent.push({ type: "text", text: `${summaryContext}\n\nCONVERSATION SO FAR:\n${conversationHistory || "(start of conversation)"}${existingOrderContext}\n\nCUSTOMER MESSAGE:\n${customerMessage || "(no text, image only)"}` });

  // Fetch and add all images (max 5 to stay within token limits)
  const imagesToProcess = allImageUrls.slice(0, 5);
  let loadedCount = 0;
  for (const url of imagesToProcess) {
    const safeUrl = await prepareOpenAiImageRef(url, platformToken);
    if (safeUrl) {
      if (loadedCount === 0) userContent.push({ type: "text", text: `CUSTOMER IMAGE${imagesToProcess.length > 1 ? "S" : ""} (this may be a screenshot of a product page/ad — look for the actual product in the image and match it to the catalog by function and features, not just appearance):` });
      userContent.push({ type: "image_url", image_url: { url: safeUrl } });
      loadedCount++;
    }
  }
  if (allImageUrls.length > 0 && loadedCount === 0) {
    userContent.push({ type: "text", text: "(Customer sent an image but it could not be loaded. Use conversation context only.)" });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.META_REPLY_MODEL || "gpt-4o",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "";

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // GPT returned non-JSON — treat as plain reply
    return { reply: raw || null, order: null };
  }

  const reply = String(parsed?.reply || "").trim() || null;
  const orderRaw = parsed?.order;
  const orderAction = parsed?.order_action || "create";

  // Validate order has all required fields
  let order = null;
  const hasItems = Array.isArray(orderRaw?.items) && orderRaw.items.length > 0;
  const hasBasicFields = orderRaw &&
    typeof orderRaw === "object" &&
    orderRaw.customer_name?.trim() &&
    orderRaw.phone?.trim() &&
    orderRaw.address?.trim();
  // For multi-item edits, product_name/quantity/unit_price may be summaries — validate from items array instead
  const hasProductFields = hasItems
    ? orderRaw.items.every((i) => i.product && Number(i.quantity) >= 1 && Number(i.unit_price) > 0)
    : (orderRaw?.product_name?.trim() && Number(orderRaw?.quantity) >= 1 && Number(orderRaw?.unit_price) > 0);

  if (hasBasicFields && hasProductFields) {
    order = {
      customer_name: String(orderRaw.customer_name).trim(),
      phone: String(orderRaw.phone).trim(),
      address: String(orderRaw.address).trim(),
      product_name: String(orderRaw.product_name || orderRaw.items?.map((i) => i.product).join(", ") || "").trim(),
      quantity: Math.max(1, Number.parseInt(orderRaw.quantity, 10) || orderRaw.items?.reduce((s, i) => s + (Number(i.quantity) || 1), 0) || 1),
      unit_price: Number(orderRaw.unit_price) > 0 ? Number(orderRaw.unit_price) : (hasItems ? orderRaw.items[0].unit_price : 0),
      confirmed_total: Number(orderRaw.confirmed_total) > 0 ? Number(orderRaw.confirmed_total) : null,
      items: hasItems ? orderRaw.items : null,
    };
  }

  return { reply, order, orderAction };
}

// ─── Save confirmed order to social_inbox_orders ──────────────────────────────

async function saveMetaInboxOrder({ supabase, orgId, platform, conversation, contactId, contactName, order }) {
  // Deduplicate: same phone in this conversation within 5 min = duplicate
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const phone = normalizeBdPhone(order.phone) || order.phone;
  const { data: existingOrders } = await supabase
    .from("social_inbox_orders")
    .select("id, notes")
    .eq("org_id", orgId)
    .eq("conversation_id", conversation.id)
    .gte("created_at", since);
  const duplicate = (existingOrders || []).some((o) => (o.notes || "").includes(phone));
  if (duplicate) return { order: existingOrders[0], duplicate: true };

  const deliveryRate = inferDeliveryCharge(order.address);
  const totalPrice = Number(order.confirmed_total) > 0
    ? Number(order.confirmed_total)
    : order.unit_price * order.quantity + deliveryRate;

  const notes = [
    `Phone: ${phone}`,
    `Address: ${order.address}`,
    `Source: ${platform} AI auto-capture`,
  ].join("\n");

  const { data, error } = await supabase
    .from("social_inbox_orders")
    .insert({
      org_id: orgId,
      conversation_id: conversation.id,
      platform,
      contact_name: order.customer_name,
      contact_id: contactId,
      items: [{ product: order.product_name, quantity: order.quantity, unit_price: order.unit_price }],
      notes,
      total_price: totalPrice,
      delivery_rate: deliveryRate,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    console.error("[Meta AI] saveInboxOrder failed:", error.message);
    return null;
  }

  // Clear the order_fields notepad so a new order can start fresh in this conversation
  await supabase
    .from("social_conversations")
    .update({ order_fields: {} })
    .eq("id", conversation.id)
    .eq("org_id", orgId);

  console.log("[OrderFields] order saved and notepad cleared:", data.id);
  return { order: data, duplicate: false };
}

// ─── Platform send helpers ────────────────────────────────────────────────────

async function sendMetaMessage({ platform, pageId, pageToken, recipientId, text, instagramAccountId }) {
  if (!text || !pageToken || !recipientId) return;
  // For Instagram, try the instagram account endpoint first, fall back to page endpoint
  const endpointId = (platform === "instagram" && instagramAccountId)
    ? instagramAccountId
    : pageId;
  try {
    await metaGraph(`/${endpointId}/messages`, {
      method: "POST",
      token: pageToken,
      body: {
        recipient: { id: recipientId },
        messaging_type: "RESPONSE",
        message: { text: text.slice(0, 1000) },
      },
    });
  } catch (err) {
    // If instagram account endpoint fails with #3, fall back to page endpoint
    if (platform === "instagram" && instagramAccountId && endpointId !== pageId) {
      console.log(`[Meta AI] Instagram account endpoint failed, trying page endpoint for ${pageId}`);
      await metaGraph(`/${pageId}/messages`, {
        method: "POST",
        token: pageToken,
        body: {
          recipient: { id: recipientId },
          messaging_type: "RESPONSE",
          message: { text: text.slice(0, 1000) },
        },
      });
    } else {
      throw err;
    }
  }
}

async function findMetaWhatsAppChannel(supabase, phoneNumberId) {
  if (!phoneNumberId) return null;
  const { data, error } = await supabase
    .from("meta_whatsapp_accounts")
    .select("org_id, whatsapp_business_account_id, phone_number_id, encrypted_access_token")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getWhatsAppMediaDataUrl(mediaId, token) {
  if (!mediaId || !token) return null;
  try {
    const media = await metaGraph(`/${mediaId}`, { token });
    if (!media?.url) return null;
    const response = await fetch(media.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    console.warn("[WhatsApp] media fetch failed:", errorMessage(err));
    return null;
  }
}

async function sendWhatsAppMessage({ phoneNumberId, token, recipientId, text }) {
  if (!phoneNumberId || !token || !recipientId || !text) {
    console.error("[WhatsApp Send] missing params:", { hasPhoneNumberId: !!phoneNumberId, hasToken: !!token, hasRecipientId: !!recipientId, hasText: !!text });
    throw new Error(`WhatsApp send failed: missing ${!phoneNumberId ? "phoneNumberId" : !token ? "access token" : !recipientId ? "recipient" : "text"}`);
  }
  const result = await metaGraph(`/${phoneNumberId}/messages`, {
    method: "POST",
    token,
    body: {
      messaging_product: "whatsapp",
      to: recipientId,
      type: "text",
      text: { body: text.slice(0, 4000), preview_url: true },
    },
  });
  console.log("[WhatsApp Send] success:", { phoneNumberId, recipientId: recipientId.slice(0, 6) + "...", messageId: result?.messages?.[0]?.id });
  return result;
}

// ─── Unified message handler ──────────────────────────────────────────────────

async function handleMetaMessage({ supabase, orgId, platform, channel, senderId, contactName, text, imageUrl, imageUrls, messageType }) {
  // Normalise — always work with an array of image URLs
  const allImageUrls = Array.isArray(imageUrls) && imageUrls.length > 0
    ? imageUrls
    : (imageUrl ? [imageUrl] : []);
  const primaryImageUrl = allImageUrls[0] || null;
  // 1. Get settings
  const settings = await getOrgSettings(orgId, ["brand_doc", "ai_auto_reply_enabled", "auto_reply_channels"]);

  console.log(`[${platform.toUpperCase()} AI] orgId=${orgId} enabled=${settings.ai_auto_reply_enabled} channels=${settings.auto_reply_channels} hasText=${!!text} hasImage=${!!imageUrl}`);

  if (settings.ai_auto_reply_enabled !== "true") { console.log(`[${platform.toUpperCase()} AI] skipped: ai_auto_reply_enabled is not true`); return; }
  let channels = [];
  try { channels = JSON.parse(settings.auto_reply_channels || "[]"); } catch { channels = []; }
  // Auto-heal: if enabled but channel missing, add it silently
  if (!channels.includes(platform)) {
    channels.push(platform);
    await saveOrgSettings(orgId, { auto_reply_channels: JSON.stringify(channels) });
    console.log(`[${platform.toUpperCase()} AI] auto-added ${platform} to channels`);
  }
  if (!process.env.OPENAI_API_KEY) { console.log(`[${platform.toUpperCase()} AI] skipped: no OPENAI_API_KEY`); return; }
  if (!text && allImageUrls.length === 0) { console.log(`[${platform.toUpperCase()} AI] skipped: no text and no image`); return; }

  console.log(`[${platform.toUpperCase()} AI] processing message from senderId=${senderId} images=${allImageUrls.length}`);

  // 2. Store the incoming user message (store first image URL in DB for display)
  const { conversation } = await upsertSocialMessage({
    supabase,
    orgId,
    platform,
    contactId: senderId,
    contactName: contactName || senderId,
    sender: "user",
    content: text || "",
    imageUrl: primaryImageUrl,
    messageType: messageType || (primaryImageUrl ? "image" : "text"),
  });

  // Check if AI is paused for this conversation (human takeover mode)
  if (conversation.paused_ai) {
    console.log(`[${platform.toUpperCase()} AI] skipped: paused_ai=true for conversation ${conversation.id}`);
    return;
  }

  // Race condition guard: if this is a plain-text message with no image, check if the
  // previous message in this conversation was an image sent within the last 6 seconds.
  if (text && allImageUrls.length === 0) {
    const { data: recentMessages } = await supabase
      .from("social_messages")
      .select("sender, message_type, created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(3);
    const prevUserMsg = (recentMessages || []).find(
      (m) => m.sender === "user" && m.message_type === "image"
    );
    if (prevUserMsg) {
      const ageMs = Date.now() - new Date(prevUserMsg.created_at).getTime();
      if (ageMs < 6000) {
        console.log(`[${platform.toUpperCase()} AI] skipped: image sent ${ageMs}ms ago, deferring to image AI call`);
        return;
      }
    }

    // Reverse race condition: if text is short (likely accompanies an image) or contains
    // deictic references, wait 3 seconds then re-check for an image.
    const textLower = (text || "").toLowerCase().trim();
    const wordCount = textLower.split(/\s+/).length;
    const hasDeicticRef = /\b(eita|এইটা|এটা|eta|this one|this|ata|etar|eita diyen|eta diyen|price|dam|দাম|koto|কত|rate|er dam|er price)\b/i.test(textLower);
    const isShortMessage = wordCount <= 3;
    if (hasDeicticRef || isShortMessage) {
      await new Promise((r) => setTimeout(r, 3000));
      const { data: followUp } = await supabase
        .from("social_messages")
        .select("sender, message_type, created_at, image_url")
        .eq("conversation_id", conversation.id)
        .eq("sender", "user")
        .order("created_at", { ascending: false })
        .limit(3);
      const recentImage = (followUp || []).find(
        (m) => m.message_type === "image" && (Date.now() - new Date(m.created_at).getTime()) < 8000
      );
      if (recentImage) {
        console.log(`[${platform.toUpperCase()} AI] skipped: text has deictic ref and image arrived, deferring to image AI call`);
        return;
      }
    }
  }

  // 3. Load context + check for existing orders in this conversation
  const [historyResult, products, existingOrdersResult] = await Promise.all([
    getRecentConversationHistory(supabase, conversation.id, 20),
    getMetaReplyProductContext(orgId),
    supabase.from("social_inbox_orders").select("id, items, total_price, status, delivery_rate, notes, contact_name").eq("conversation_id", conversation.id).eq("org_id", orgId).order("created_at", { ascending: false }).limit(1),
  ]);
  const { history: conversationHistory, isNewSession, priorSessionHistory } = historyResult;
  const existingOrder = existingOrdersResult.data?.[0] || null;
  const aiSummary = conversation.ai_summary || "";

  // If this is a new session and we have prior messages, update the summary
  if (isNewSession && priorSessionHistory) {
    generateConversationSummary(priorSessionHistory, aiSummary).then((newSummary) => {
      if (newSummary && newSummary !== aiSummary) {
        supabase.from("social_conversations").update({ ai_summary: newSummary }).eq("id", conversation.id).eq("org_id", orgId).then(() => {});
      }
    }).catch(() => {});
  }

  const brandDoc = settings.brand_doc || "";

  // 3b. If customer sent an image, find similar products via embedding search
  const platformToken = platform === "whatsapp"
    ? (channel.encrypted_access_token ? decryptToken(channel.encrypted_access_token) : "")
    : (channel.encrypted_page_access_token ? decryptToken(channel.encrypted_page_access_token) : "");

  let embeddingMatches = [];
  if (allImageUrls.length > 0) {
    try {
      const customerImageUrl = allImageUrls[0];
      const safeUrl = await prepareOpenAiImageRef(customerImageUrl, platformToken);
      if (safeUrl) {
        const description = await describeProductImage(safeUrl);
        if (description) {
          const embedding = await generateTextEmbedding(description);
          if (embedding) {
            embeddingMatches = await findSimilarProducts(orgId, embedding, 3, 0.6);
            if (embeddingMatches.length > 0) {
              console.log(`[${platform.toUpperCase()} AI] Embedding matches: ${embeddingMatches.map((m) => `${m.name} (${(m.similarity * 100).toFixed(1)}%)`).join(", ")}`);
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[${platform.toUpperCase()} AI] Embedding search failed:`, err.message);
    }
  }

  // 4. Run GPT-4o — single call handles reply + order detection
  let aiResult;
  try {
    aiResult = await runMetaAI({ brandDoc, products, conversationHistory, customerMessage: text || "", imageUrls: allImageUrls, platformToken, existingOrder, aiSummary, embeddingMatches });
  } catch (err) {
    console.error("[Meta AI] GPT call failed:", errorMessage(err));
    return;
  }

  let reply = aiResult.reply;
  const orderData = aiResult.order;
  const orderAction = aiResult.orderAction || "create";

  // Track AI inbox reply usage
  incrementUsage(orgId, "ai_inbox_replies").catch(() => {});

  // 5. Save, edit, or cancel order based on AI action
  if (orderAction === "cancel" && existingOrder) {
    try {
      const { error: cancelErr } = await supabase
        .from("social_inbox_orders")
        .update({ status: "cancelled" })
        .eq("id", existingOrder.id)
        .eq("org_id", orgId);
      if (cancelErr) {
        console.error("[Meta AI] order cancel failed:", cancelErr.message);
      } else {
        const shortId = existingOrder.id.slice(-6).toUpperCase();
        reply = reply || `Your order IO-${shortId} has been cancelled.`;
        console.log("[Meta AI] order cancelled:", existingOrder.id);
      }
    } catch (err) {
      console.error("[Meta AI] order cancel failed:", errorMessage(err));
    }
  } else if (orderData) {
    try {
      await syncOrderFieldsFromAIResult({ supabase, orgId, conversation, order: orderData });

      if (orderAction === "edit" && existingOrder) {
        // Update existing order — use items array if provided, otherwise single item
        const deliveryRate = inferDeliveryCharge(orderData.address);
        const items = Array.isArray(orderData.items) && orderData.items.length > 0
          ? orderData.items.map((i) => ({ product: i.product, quantity: Number(i.quantity) || 1, unit_price: Number(i.unit_price) || 0 }))
          : [{ product: orderData.product_name, quantity: orderData.quantity, unit_price: orderData.unit_price }];
        const itemsTotal = items.reduce((sum, i) => sum + (i.unit_price * i.quantity), 0);
        const totalPrice = Number(orderData.confirmed_total) > 0
          ? Number(orderData.confirmed_total)
          : itemsTotal + deliveryRate;
        const phone = normalizeBdPhone(orderData.phone) || orderData.phone;
        const notes = [
          `Phone: ${phone}`,
          `Address: ${orderData.address}`,
          `Source: ${platform} AI auto-capture (edited)`,
        ].join("\n");

        const { data: updated, error: updateErr } = await supabase
          .from("social_inbox_orders")
          .update({
            contact_name: orderData.customer_name,
            items,
            notes,
            total_price: totalPrice,
            delivery_rate: deliveryRate,
          })
          .eq("id", existingOrder.id)
          .eq("org_id", orgId)
          .select("*")
          .single();

        if (updateErr) {
          console.error("[Meta AI] order edit failed:", updateErr.message);
        } else {
          const shortId = updated.id.slice(-6).toUpperCase();
          reply = reply || `Your order IO-${shortId} has been updated! New total: ৳${Number(updated.total_price || 0).toLocaleString("en-US")}.`;
          console.log("[Meta AI] order edited:", updated.id);
        }
      } else {
        // Create new order
        const saved = await saveMetaInboxOrder({
          supabase, orgId, platform,
          conversation,
          contactId: senderId,
          contactName: contactName || senderId,
          order: orderData,
        });
        if (saved && !saved.duplicate) {
          incrementUsage(orgId, "ai_order_captures").catch(() => {});
          const shortId = saved.order.id.slice(-6).toUpperCase();
          reply = `Your order has been placed! Order ID: IO-${shortId}. Total: ৳${Number(saved.order.total_price || 0).toLocaleString("en-US")}. We'll be in touch soon.`;
        }
      }
    } catch (err) {
      console.error("[Meta AI] order save failed:", errorMessage(err));
    }
  }

  if (!reply) return;

  // 6. Send reply back via platform API
  const pageToken = channel.encrypted_page_access_token ? decryptToken(channel.encrypted_page_access_token) : "";
  try {
    if (platform === "whatsapp") {
      await sendWhatsAppMessage({
        phoneNumberId: channel.phone_number_id,
        token: channel.encrypted_access_token ? decryptToken(channel.encrypted_access_token) : pageToken,
        recipientId: senderId,
        text: reply,
      });
    } else {
      await sendMetaMessage({
        platform,
        pageId: channel.page_id || "",
        pageToken,
        recipientId: senderId,
        text: reply,
        instagramAccountId: channel.instagram_account_id || null,
      });
    }
  } catch (err) {
    const errMsg = errorMessage(err);
    console.warn(`[Meta AI] send failed for ${platform}:`, errMsg);
  }

  // 7. Store bot reply
  await upsertSocialMessage({
    supabase,
    orgId,
    platform,
    contactId: senderId,
    contactName: contactName || senderId,
    sender: "bot",
    content: reply,
    messageType: "text",
  });

  // 8. Update conversation summary after order events (create/edit/cancel)
  if (orderData || orderAction === "cancel") {
    const fullHistory = conversationHistory + `\nassistant: ${reply}`;
    generateConversationSummary(fullHistory, aiSummary).then((newSummary) => {
      if (newSummary && newSummary !== aiSummary) {
        supabase.from("social_conversations").update({ ai_summary: newSummary }).eq("id", conversation.id).eq("org_id", orgId).then(() => {});
      }
    }).catch(() => {});
  }
}

// ─── Order capture: pre-filter + stateful field tracking ─────────────────────

// ─── Order capture: event-driven extraction ───────────────────────────────────

const PHONE_RE = /\b(01[3-9]\d{8})\b/;
const PRICE_RE = /(\d[\d,]+)\s*(taka|টাকা|৳|tk)\b|৳\s*\d/i;
const CONFIRM_RE = /\b(confirm|confirmed|korun|korte chai|order\s*d(en|iye|ilam)|yes|haan|ha\b|thik|theek|proceed|place.*order|order.*place)\b/i;
const ORDER_INTENT_RE = /\b(order|ordar|nite chai|kinbo|buy|purchase|lagbe|chai|dorkar|dite paren)\b/i;
const ADDRESS_RE = /\b(road|rd|block|sector|avenue|ave|lane|ln|floor|flat|apt|house|building|dohs|dhanmondi|gulshan|mirpur|uttara|mohammadpur|banani|bashundhara|baridhara|motijheel|khilgaon|rampura|badda|gazipur|narayanganj|cumilla|chittagong|sylhet|rajshahi|khulna)\b/i;
const NAME_ONLY_RE = /^[A-Za-z\u0980-\u09FF]+([\s][A-Za-z\u0980-\u09FF]+){0,3}$/;
const NOT_NAME_RE = /\d|taka|taaka|order|confirm|address|phone|price|deliver|product|stock|available/i;

function classifyMessageEvent(text, messageType, existingFields = {}, catalog = []) {
  if (!text && messageType !== "image") return "irrelevant";
  const t = (text || "").trim();
  if (messageType === "image" || messageType === "mixed") return "image_uploaded";
  if (t.length < 2) return "irrelevant";
  if (/^[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+$/u.test(t)) return "irrelevant";
  if (/^(hi+|hello|hey|ok|okay|thanks|thank you|done|👍|🙏|sure|np|good|great|noted|hmm|lol|আচ্ছা|ঠিক আছে)\s*[!.?]*$/i.test(t)) return "irrelevant";
  if (PHONE_RE.test(t) && !existingFields.phone) return "phone_shared";
  if (/total\s*[\d,]+\s*(taka|টাকা|৳|tk)/i.test(t) || /total\s*৳\s*[\d,]+/i.test(t)) return "order_confirmed";
  if (PRICE_RE.test(t) && !existingFields.unit_price && !existingFields.confirmed_total) return "price_stated";
  if (CONFIRM_RE.test(t)) return "order_confirmed";
  if (!existingFields.address && ADDRESS_RE.test(t)) return "address_shared";
  if (!existingFields.product_name) {
    const tLower = t.toLowerCase();
    const catalogHit = catalog.some((p) => p.name && tLower.includes(p.name.toLowerCase().split(" ")[0]));
    if (catalogHit || ORDER_INTENT_RE.test(t)) return "product_mentioned";
  }
  if (!existingFields.customer_name && NAME_ONLY_RE.test(t) && !NOT_NAME_RE.test(t) && t.split(" ").length <= 4) return "name_shared";
  if (!existingFields.address && t.split(" ").length >= 3 && !PHONE_RE.test(t) && !PRICE_RE.test(t)) return "address_shared";
  return "irrelevant";
}

function fieldsToExtract(event, existingFields) {
  const missing = (keys) => keys.filter((k) => !existingFields[k]);
  switch (event) {
    case "phone_shared":      return missing(["phone", "customer_name"]);
    case "price_stated":      return missing(["unit_price", "quantity", "product_name"]);
    case "order_confirmed":   return missing(["confirmed_total", "customer_name", "phone", "address", "product_name", "quantity", "unit_price"]);
    case "address_shared":    return missing(["address", "customer_name"]);
    case "product_mentioned": return missing(["product_name", "quantity"]);
    case "name_shared":       return missing(["customer_name"]);
    case "image_uploaded":    return missing(["product_name"]);
    default:                  return [];
  }
}

function isOrderComplete(fields) {
  const qty = Number(fields?.quantity) >= 1 ? Number(fields.quantity) : 1;
  return !!(
    fields?.customer_name?.trim() &&
    fields?.phone?.trim() &&
    fields?.address?.trim() &&
    fields?.product_name?.trim() &&
    qty >= 1 &&
    Number(fields?.unit_price) > 0
  );
}

function mergeFields(existing = {}, incoming = {}) {
  const merged = { ...existing };
  for (const key of ["customer_name", "phone", "address", "product_name", "quantity", "unit_price", "confirmed_total"]) {
    const v = incoming[key];
    if (v !== null && v !== undefined && v !== "" && !merged[key]) merged[key] = v;
  }
  return merged;
}

async function extractNewFields({ text, event, fieldsNeeded, existingFields = {}, products = [] }) {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!fieldsNeeded || fieldsNeeded.length === 0) return null;

  const catalog = products.slice(0, 50).map((p) => ({ name: p.name, price: p.price }));
  const knownStr = Object.entries(existingFields).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(", ") || "none yet";

  const eventHints = {
    phone_shared:      "The customer just sent their contact info. Extract phone number and name if present.",
    price_stated:      "The agent just quoted a price. Extract unit_price. Also extract product_name and quantity if mentioned.",
    order_confirmed:   "The order is being confirmed. Extract confirmed_total if agent stated a total. Extract any remaining missing fields.",
    address_shared:    "The customer just sent their delivery address. Extract address and customer_name if present.",
    product_mentioned: "The customer mentioned a product or order intent. Extract product_name and quantity.",
    name_shared:       "The customer shared their name. Extract customer_name.",
    image_uploaded:    "Customer sent an image. Extract product_name if it can be inferred.",
  };

  const systemPrompt = `You are an order field extractor for a Bangladeshi e-commerce shop.

EVENT: ${event}
HINT: ${eventHints[event] || "Extract any relevant order fields."}

Already collected: ${knownStr}
Extract ONLY these fields: ${fieldsNeeded.join(", ")}

CATALOG (for price lookup only if no price stated):
${JSON.stringify(catalog).slice(0, 2000)}

RULES:
- Explicitly stated price overrides catalog price.
- "total X taka" from agent → confirmed_total = X.
- Bangla quantities: ekta=1, duita=2, tinta=3, charta=4. "1 ta"/"2ta" = 1, 2.
- No quantity stated + order intent = quantity 1.
- Do NOT guess. If a field is not clearly present, return null for it.

Return ONLY valid JSON with exactly these keys:
${JSON.stringify(Object.fromEntries(fieldsNeeded.map((k) => [k, null])))}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 150,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: String(text || "").slice(0, 800) },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || "";
    console.log(`[OrderFields] event=${event} extracted from "${(text||"").slice(0,35)}": ${raw.slice(0,100)}`);
    try { return JSON.parse(raw); } catch { return null; }
  } catch { return null; }
}

async function updateConversationOrderFields(supabase, conversationId, orgId, fields) {
  await supabase.from("social_conversations").update({ order_fields: fields }).eq("id", conversationId).eq("org_id", orgId);
}

async function processOrderFieldsFromMessage({ supabase, orgId, platform, conversation, contactId, contactName, text, messageType, products }) {
  const { data: freshConv } = await supabase
    .from("social_conversations")
    .select("order_fields")
    .eq("id", conversation.id)
    .eq("org_id", orgId)
    .maybeSingle();

  const existing = freshConv?.order_fields || {};

  if (isOrderComplete(existing)) {
    const fields = { ...existing, quantity: existing.quantity || 1 };
    const saved = await saveMetaInboxOrder({
      supabase, orgId, platform, conversation, contactId, contactName,
      order: {
        customer_name: fields.customer_name, phone: fields.phone,
        address: fields.address, product_name: fields.product_name,
        quantity: Number(fields.quantity), unit_price: Number(fields.unit_price),
        confirmed_total: fields.confirmed_total ? Number(fields.confirmed_total) : null,
      },
    });
    if (!saved?.duplicate) console.log("[OrderFields] saved on retry:", saved?.order?.id);
    return;
  }

  const event = classifyMessageEvent(text, messageType, existing, products);
  if (event === "irrelevant") { console.log(`[OrderFields] irrelevant: "${(text||"").slice(0,35)}"`); return; }

  const fieldsNeeded = fieldsToExtract(event, existing);
  if (fieldsNeeded.length === 0) { console.log(`[OrderFields] event=${event} all fields collected`); return; }

  console.log(`[OrderFields] event=${event} fieldsNeeded=${fieldsNeeded.join(",")}`);

  const extracted = await extractNewFields({ text, event, fieldsNeeded, existingFields: existing, products });
  if (!extracted) return;

  const merged = mergeFields(existing, extracted);
  if (merged.phone && !existing.phone) merged.phone = normalizeBdPhone(merged.phone) || merged.phone;

  const { error: updateErr } = await supabase.from("social_conversations").update({ order_fields: merged }).eq("id", conversation.id).eq("org_id", orgId);
  if (updateErr) { console.warn("[OrderFields] update failed:", updateErr.message); return; }

  if (!merged.quantity) merged.quantity = 1;

  if (isOrderComplete(merged)) {
    console.log("[OrderFields] COMPLETE — saving", JSON.stringify(merged));
    await saveMetaInboxOrder({
      supabase, orgId, platform, conversation, contactId, contactName,
      order: {
        customer_name: merged.customer_name, phone: merged.phone,
        address: merged.address, product_name: merged.product_name,
        quantity: Number(merged.quantity), unit_price: Number(merged.unit_price),
        confirmed_total: merged.confirmed_total ? Number(merged.confirmed_total) : null,
      },
    });
  }
}

async function syncOrderFieldsFromAIResult({ supabase, orgId, conversation, order }) {
  if (!order) return;
  await updateConversationOrderFields(supabase, conversation.id, orgId, {
    customer_name:  order.customer_name || null,
    phone:          order.phone || null,
    address:        order.address || null,
    product_name:   order.product_name || null,
    quantity:       order.quantity || null,
    unit_price:     order.unit_price || null,
    confirmed_total: order.confirmed_total || null,
  });
}

// Fetch image from a URL that may require auth (Instagram CDN URLs are token-gated).
// For Instagram, we need to fetch the media URL via the Graph API first.
async function fetchInstagramMediaUrl(mediaId, pageToken) {
  if (!mediaId || !pageToken) return null;
  try {
    // Get the CDN URL for the media item
    const media = await metaGraph(`/${mediaId}`, {
      token: pageToken,
      params: { fields: "image_data,video_data" },
    });
    const url = media?.image_data?.url || media?.video_data?.url;
    if (!url) return null;
    // Fetch and base64-encode so OpenAI can read it
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${pageToken}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const mime = normalizeOpenAiImageMime(response.headers.get("content-type") || "image/jpeg");
    if (!OPENAI_IMAGE_MIME_TYPES.has(mime)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 18 * 1024 * 1024) return null;
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch (err) {
    console.warn("[Instagram] media fetch failed:", errorMessage(err));
    return null;
  }
}

async function fetchMetaUserName(senderId, pageToken, platform = "facebook") {
  if (!pageToken) return null;
  try {
    if (platform === "instagram") {
      const data = await metaGraph(`/${senderId}`, { token: pageToken, params: { fields: "name,username" } });
      return data?.name || data?.username || null;
    }
    // Facebook Messenger: try the user profile endpoint
    const data = await metaGraph(`/${senderId}`, { token: pageToken, params: { fields: "first_name,last_name" } });
    const name = [data?.first_name, data?.last_name].filter(Boolean).join(" ");
    if (name) return name;
    return null;
  } catch (err) {
    // Fallback: try the conversations API to get participant name
    if (platform === "facebook") {
      try {
        const convData = await metaGraph(`/me/conversations`, {
          token: pageToken,
          params: { fields: "participants", user_id: senderId },
        });
        const participants = convData?.data?.[0]?.participants?.data || [];
        const sender = participants.find((p) => p.id === senderId);
        if (sender?.name) return sender.name;
      } catch { /* ignore */ }
    }
    return null;
  }
}

async function handleMetaMessagingEvent({ supabase, objectType, entry, messaging }) {
  const platform = objectType === "instagram" ? "instagram" : "facebook";
  const senderId = messaging.sender?.id;
  const recipientId = messaging.recipient?.id || entry.id;
  const text = messaging.message?.text || messaging.postback?.payload || "";
  const attachment = messaging.message?.attachments?.[0];

  // Skip echo messages (bot's own messages reflected back) — same as Messenger
  if (messaging.message?.is_echo) return;
  // Skip unsupported / delivery / read receipts
  if (!senderId || !recipientId) return;
  if (!text && !attachment && !messaging.message) return;

  console.log(`[${platform.toUpperCase()}] incoming senderId=${senderId} recipientId=${recipientId} entry.id=${entry.id} text="${text?.slice(0,50)}" attachment_type=${attachment?.type || "none"}`);

  let channel = await findMetaChannelByRecipient(supabase, recipientId, platform);
  // Fallback: for Instagram, the recipientId (IGSID) may differ from the stored instagram_account_id.
  // Try entry.id which is often the Instagram Business Account ID or page ID.
  if (!channel?.org_id && entry.id && entry.id !== recipientId) {
    channel = await findMetaChannelByRecipient(supabase, entry.id, platform);
  }
  if (!channel?.org_id) {
    console.log(`[${platform.toUpperCase()}] unmatched channel for recipientId=${recipientId} entry.id=${entry.id}`);
    await upsertMetaWebhookEvent(supabase, { objectType, platform, pageId: recipientId, senderId, eventType: "unmatched_message", payload: messaging });
    return;
  }

  console.log(`[${platform.toUpperCase()}] channel matched orgId=${channel.org_id} page_id=${channel.page_id} ig_id=${channel.instagram_account_id}`);

  const pageToken = channel.encrypted_page_access_token ? decryptToken(channel.encrypted_page_access_token) : "";

  // ── Image resolution — extract ALL image attachments, not just the first ──────
  const allAttachments = messaging.message?.attachments || [];
  const imageUrls = [];
  let messageType = text ? "text" : "event";

  for (const att of allAttachments) {
    if (!att) continue;
    messageType = att.type || "attachment";
    let url = null;

    if (att.type === "image" || att.type === "sticker") {
      url = att.payload?.url || null;
      messageType = "image";
    } else if (att.type === "video" || att.type === "audio") {
      url = att.payload?.url || null;
    } else if (att.type === "share") {
      url = att.payload?.url || null;
    }

    // Instagram: media ID instead of direct URL
    if (platform === "instagram" && att.payload?.id && !url) {
      url = await fetchInstagramMediaUrl(att.payload.id, pageToken);
    }

    if (url) imageUrls.push(url);
  }

  // Single imageUrl for DB storage (first image); all imageUrls passed to AI
  const imageUrl = imageUrls[0] || null;

  await upsertMetaWebhookEvent(supabase, {
    orgId: channel.org_id, objectType, platform,
    pageId: channel.page_id || recipientId,
    instagramAccountId: channel.instagram_account_id || null,
    senderId, eventType: "message", payload: messaging,
  });

  // ── Contact name — same approach for both platforms ──────────────────────────
  const resolvedName = await fetchMetaUserName(senderId, pageToken, platform);

  await handleMetaMessage({
    supabase,
    orgId: channel.org_id,
    platform,
    channel,
    senderId,
    contactName: resolvedName || senderId,
    text,
    imageUrl,
    imageUrls,
    messageType,
  });
}

async function handleWhatsAppMessageEvent({ supabase, value, message, contact }) {
  const phoneNumberId = value.metadata?.phone_number_id;
  const senderId = message.from;
  if (!phoneNumberId || !senderId) return;

  // Skip status updates (delivered, read, failed) — not customer messages
  if (message.type === "status" || value.statuses?.length) return;

  const channel = await findMetaWhatsAppChannel(supabase, phoneNumberId);
  if (!channel?.org_id) {
    await upsertMetaWebhookEvent(supabase, { objectType: "whatsapp_business_account", platform: "whatsapp", pageId: phoneNumberId, senderId, eventType: "unmatched_message", payload: message });
    return;
  }

  const token = channel.encrypted_access_token ? decryptToken(channel.encrypted_access_token) : "";

  // Extract text from all WhatsApp message types
  const text =
    message.text?.body ||
    message.button?.text ||
    message.interactive?.button_reply?.title ||
    message.interactive?.list_reply?.title ||
    "";

  // Extract ALL media — WhatsApp sends one media item per message
  // but handle image, video, document, sticker, audio
  const imageUrls = [];
  let messageType = message.type || "text";

  if (message.image?.id) {
    const url = await getWhatsAppMediaDataUrl(message.image.id, token);
    if (url) imageUrls.push(url);
    messageType = "image";
  } else if (message.sticker?.id) {
    const url = await getWhatsAppMediaDataUrl(message.sticker.id, token);
    if (url) imageUrls.push(url);
    messageType = "image";
  } else if (message.document?.id) {
    // Documents — store but don't send to vision AI
    messageType = "document";
  } else if (message.audio?.id) {
    messageType = "audio";
  } else if (message.video?.id) {
    const url = await getWhatsAppMediaDataUrl(message.video.id, token);
    if (url) imageUrls.push(url);
    messageType = "video";
  } else if (message.location) {
    // Location share — pass as text context
    const loc = message.location;
    const locationText = `📍 Location: ${loc.name || ""} ${loc.address || ""} (lat: ${loc.latitude}, lng: ${loc.longitude})`.trim();
    await upsertMetaWebhookEvent(supabase, {
      orgId: channel.org_id, objectType: "whatsapp_business_account", platform: "whatsapp",
      pageId: phoneNumberId, senderId, eventType: "message", payload: message,
    });
    await handleMetaMessage({
      supabase, orgId: channel.org_id, platform: "whatsapp",
      channel: { ...channel, phone_number_id: phoneNumberId },
      senderId, contactName: contact?.profile?.name || (senderId ? `+${senderId}` : senderId),
      text: locationText, imageUrl: null, imageUrls: [], messageType: "text",
    });
    return;
  }

  const imageUrl = imageUrls[0] || null;

  await upsertMetaWebhookEvent(supabase, {
    orgId: channel.org_id, objectType: "whatsapp_business_account", platform: "whatsapp",
    pageId: phoneNumberId, senderId, eventType: "message", payload: message,
  });

  await handleMetaMessage({
    supabase,
    orgId: channel.org_id,
    platform: "whatsapp",
    channel: { ...channel, phone_number_id: phoneNumberId },
    senderId,
    contactName: contact?.profile?.name || (senderId ? `+${senderId}` : senderId),
    text,
    imageUrl,
    imageUrls,
    messageType,
  });
}


app.get("/api/webhooks/facebook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/api/webhooks/facebook", async (req, res) => {
  const signature = req.headers["x-hub-signature-256"];
  if (process.env.META_APP_SECRET && signature && req.rawBody) {
    const expected = "sha256=" + crypto.createHmac("sha256", process.env.META_APP_SECRET).update(req.rawBody).digest("hex");
    if (signature !== expected) {
      console.warn("[Webhook/FB] HMAC signature mismatch — got:", signature?.slice(0, 20) + "...", "expected:", expected?.slice(0, 20) + "...", "secret_len:", process.env.META_APP_SECRET?.length);
      // Allow through — some Meta test webhooks use stale signatures
    }
  }
  const supabase = getServiceSupabase();
  const body = req.body || {};
  res.sendStatus(200); // always ack immediately

  // ── FULL RAW LOG — see exact payload Meta sends ───────────────────────────
  console.log("[Webhook/FB] FULL BODY:", JSON.stringify(body, null, 2));

  try {
    const entries = Array.isArray(body.entry) ? body.entry : [];
    const objectType = body.object || "";

    for (const entry of entries) {

      // ── SCENARIO A: object=page, entry.messaging[] ─────────────────────────
      // Standard Facebook Messenger + some Instagram setups
      if (entry.messaging?.length) {
        for (const messaging of entry.messaging) {
          const platform = objectType === "instagram" ? "instagram" : "facebook";
          console.log(`[Webhook/FB] scenario=A platform=${platform} sender=${messaging.sender?.id} text=${messaging.message?.text?.slice(0,50)}`);
          await handleMetaMessagingEvent({ supabase, objectType: platform === "instagram" ? "instagram" : objectType, entry, messaging });
        }
      }

      // ── SCENARIO B: object=instagram OR object=page, entry.changes[] ───────
      // Instagram DMs arrive here in most configurations
      if (entry.changes?.length) {
        for (const change of entry.changes) {
          const value = change.value || {};
          const field = change.field || "";
          console.log(`[Webhook/FB] scenario=B object=${objectType} field=${field} value_keys=${Object.keys(value).join(",")} sender=${value.sender?.id} from=${value.from?.id}`);

          // Instagram DM: value has sender + message
          if (field === "messages" && (value.sender?.id || value.from?.id) && (value.message || value.text)) {
            const senderId = value.sender?.id || value.from?.id;
            const recipientId = value.recipient?.id || value.to?.id || entry.id;
            const msgText = value.message?.text || value.text?.body || value.text || "";
            const mid = value.message?.mid || value.message?.id || "";
            const messaging = {
              sender:    { id: senderId },
              recipient: { id: recipientId },
              message:   { mid, text: msgText, attachments: value.message?.attachments },
              timestamp: value.timestamp,
            };
            const platform = objectType === "instagram" ? "instagram" : "facebook";
            console.log(`[Webhook/FB] DM matched platform=${platform} sender=${senderId} recipient=${recipientId} text="${msgText?.slice(0,50)}"`);
            await handleMetaMessagingEvent({ supabase, objectType: platform === "instagram" ? "instagram" : objectType, entry, messaging });
          } else {
            // Non-DM change event — just store it
            const platform = objectType === "instagram" ? "instagram" : "facebook";
            await upsertMetaWebhookEvent(supabase, {
              objectType,
              platform,
              pageId: entry.id,
              eventType: field || "change",
              payload: change,
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("[Meta Webhook] processing failed:", errorMessage(err));
  }
});

app.get("/api/webhooks/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.WA_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/api/webhooks/whatsapp", async (req, res) => {
  const signature = req.headers["x-hub-signature-256"];
  if (process.env.META_APP_SECRET && signature && req.rawBody) {
    const expected = "sha256=" + crypto.createHmac("sha256", process.env.META_APP_SECRET).update(req.rawBody).digest("hex");
    if (signature !== expected) {
      console.warn("[Webhook/WA] HMAC signature mismatch — rejecting");
      return res.sendStatus(403);
    }
  }
  const supabase = getServiceSupabase();
  const body = req.body || {};
  res.sendStatus(200);
  try {
    const entries = Array.isArray(body.entry) ? body.entry : [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value || {};

        // Skip status updates (delivered/read receipts) — log minimally
        if (value.statuses?.length && !value.messages?.length) {
          console.log(`[Webhook/WA] status update: ${value.statuses.map(s => `${s.status} id=${s.id}`).join(", ")}`);
          continue;
        }

        // Log real message events
        if (value.messages?.length) {
          console.log(`[Webhook/WA] message from=${value.messages[0].from} type=${value.messages[0].type} phone_number_id=${value.metadata?.phone_number_id}`);
        }

        const contacts = new Map((value.contacts || []).map((contact) => [contact.wa_id, contact]));
        for (const message of value.messages || []) {
          await handleWhatsAppMessageEvent({
            supabase,
            value,
            message,
            contact: contacts.get(message.from),
          });
        }
        if (!value.messages?.length && !value.statuses?.length) {
          await upsertMetaWebhookEvent(supabase, {
            objectType: body.object || "whatsapp_business_account",
            platform: "whatsapp",
            pageId: value.metadata?.phone_number_id || null,
            eventType: change.field || "change",
            payload: change,
          });
        }
      }
    }
  } catch (err) {
    console.error("[WhatsApp Webhook] processing failed:", errorMessage(err));
  }
});

app.get("/api/social/conversations/:platform", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const platform = req.params.platform;
    if (!["facebook", "instagram", "whatsapp"].includes(platform)) return res.status(400).json({ error: "Invalid platform" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const { data, error } = await supabase
      .from("social_conversations")
      .select("*")
      .eq("org_id", orgId)
      .eq("platform", platform)
      .order("last_message_at", { ascending: false });
    if (error) throw error;
    // Re-resolve numeric contact names in background (don't block response)
    const conversations = data || [];
    const numericNameConvos = conversations.filter(c => c.contact_name && /^\d{10,}$/.test(c.contact_name));
    if (numericNameConvos.length > 0 && platform !== "whatsapp") {
      // Try to resolve names — get page token for this org
      const { data: page } = await supabase
        .from("meta_pages")
        .select("encrypted_page_access_token")
        .eq("org_id", orgId)
        .limit(1)
        .maybeSingle();
      if (page?.encrypted_page_access_token) {
        const pageToken = decryptToken(page.encrypted_page_access_token);
        for (const conv of numericNameConvos.slice(0, 10)) {
          try {
            const name = await fetchMetaUserName(conv.contact_id, pageToken, platform);
            if (name && name !== conv.contact_name) {
              conv.contact_name = name;
              supabase.from("social_conversations").update({ contact_name: name }).eq("id", conv.id).then(() => {});
            }
          } catch {}
        }
      }
    }
    // For WhatsApp, ensure phone numbers have + prefix
    if (platform === "whatsapp") {
      for (const conv of conversations) {
        if (conv.contact_name && /^\d{10,}$/.test(conv.contact_name)) {
          conv.contact_name = `+${conv.contact_name}`;
        }
      }
    }
    return res.json({ conversations });
  } catch (err) {
    return sendError(res, err);
  }
});

app.delete("/api/social/conversations/:conversationId", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    // Verify the conversation belongs to this org before deleting
    const { data: conv, error: convErr } = await supabase
      .from("social_conversations")
      .select("id")
      .eq("id", req.params.conversationId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (convErr) throw convErr;
    if (!conv) return res.status(404).json({ error: "Conversation not found" });
    // Delete messages first (in case FK constraint doesn't cascade)
    await supabase.from("social_messages").delete().eq("conversation_id", conv.id);
    const { error: delErr } = await supabase
      .from("social_conversations")
      .delete()
      .eq("id", conv.id)
      .eq("org_id", orgId);
    if (delErr) throw delErr;
    return res.json({ success: true });
  } catch (err) {
    return sendError(res, err);
  }
});

app.get("/api/social/messages/:conversationId", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const { data: conversation, error: convError } = await supabase
      .from("social_conversations")
      .select("id")
      .eq("id", req.params.conversationId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (convError) throw convError;
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });
    await supabase.from("social_conversations").update({ unread_count: 0 }).eq("id", conversation.id).eq("org_id", orgId);
    const { data, error } = await supabase
      .from("social_messages")
      .select("*")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true });
    if (error) throw error;
    // Include paused_ai status for the composer UI
    const { data: convData } = await supabase.from("social_conversations").select("paused_ai").eq("id", conversation.id).maybeSingle();
    return res.json({ messages: data || [], paused_ai: convData?.paused_ai || false });
  } catch (err) {
    return sendError(res, err);
  }
});

// ── Manual reply from dashboard ───────────────────────────────────────────────
app.post("/api/social/reply", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { conversationId, text } = req.body;
    if (!conversationId || !text?.trim()) return res.status(400).json({ error: "conversationId and text required" });

    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    // Verify conversation belongs to this org
    const { data: conv, error: convErr } = await supabase
      .from("social_conversations")
      .select("id, platform, contact_id, org_id")
      .eq("id", conversationId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (convErr) throw convErr;
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const platform = conv.platform;
    const recipientId = conv.contact_id;

    // Resolve channel credentials for sending
    if (platform === "whatsapp") {
      // Find the WhatsApp account for this org that has a phone_number_id
      const { data: waAccount } = await supabase
        .from("meta_whatsapp_accounts")
        .select("phone_number_id, encrypted_access_token")
        .eq("org_id", orgId)
        .not("phone_number_id", "is", null)
        .limit(1)
        .maybeSingle();
      if (!waAccount) return res.status(400).json({ error: "No WhatsApp account connected with a phone number. Please reconnect WhatsApp in Settings." });
      const token = waAccount.encrypted_access_token ? decryptToken(waAccount.encrypted_access_token) : "";
      console.log("[Social Reply] WhatsApp send:", { phoneNumberId: waAccount.phone_number_id, recipientId, hasToken: !!token });
      await sendWhatsAppMessage({ phoneNumberId: waAccount.phone_number_id, token, recipientId, text: text.trim() });
    } else {
      // Facebook or Instagram — use meta_pages
      const { data: page } = await supabase
        .from("meta_pages")
        .select("page_id, instagram_account_id, encrypted_page_access_token")
        .eq("org_id", orgId)
        .limit(1)
        .maybeSingle();
      if (!page) return res.status(400).json({ error: "No Facebook/Instagram page connected" });
      const pageToken = page.encrypted_page_access_token ? decryptToken(page.encrypted_page_access_token) : "";
      await sendMetaMessage({
        platform,
        pageId: page.page_id,
        pageToken,
        recipientId,
        text: text.trim(),
        instagramAccountId: platform === "instagram" ? page.instagram_account_id : null,
      });
    }

    // Store the sent message in social_messages
    const now = new Date().toISOString();
    await supabase.from("social_messages").insert({
      conversation_id: conversationId,
      sender: "bot",
      content: text.trim(),
      message_type: "text",
      created_at: now,
    });

    // Update conversation last_message
    await supabase.from("social_conversations").update({
      last_message: text.trim().slice(0, 200),
      last_message_at: now,
    }).eq("id", conversationId).eq("org_id", orgId);

    return res.json({ success: true });
  } catch (err) {
    console.error("[Social Reply] error:", errorMessage(err));
    return sendError(res, err);
  }
});

// Toggle AI auto-reply for a specific conversation
app.patch("/api/social/conversations/:id/pause-ai", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const paused = req.body.paused === true;
    const { data, error } = await supabase
      .from("social_conversations")
      .update({ paused_ai: paused })
      .eq("id", req.params.id)
      .eq("org_id", orgId)
      .select("id, paused_ai")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Conversation not found" });
    return res.json({ success: true, paused_ai: data.paused_ai });
  } catch (err) {
    return sendError(res, err);
  }
});

app.get("/api/social/inbox-orders", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const { data, error } = await supabase
      .from("social_inbox_orders")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return res.json({ orders: data || [] });
  } catch (err) {
    return sendError(res, err);
  }
});

app.patch("/api/social/inbox-orders/:id", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const allowed = ["status", "notes", "sent_to_courier", "consignment_id", "tracking_code", "courier_status", "courier_message", "fraud_checked", "fraud_data", "delivery_rate", "items", "total_price", "contact_name"];
    const update = {};
    for (const key of allowed) {
      if (req.body?.[key] !== undefined) update[key] = req.body[key];
    }
    if (!Object.keys(update).length) return res.status(400).json({ error: "Nothing to update" });
    const { data, error } = await supabase
      .from("social_inbox_orders")
      .update(update)
      .eq("id", req.params.id)
      .eq("org_id", orgId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Inbox order not found" });
    return res.json({ success: true, order: data });
  } catch (err) {
    return sendError(res, err);
  }
});

app.delete("/api/social/inbox-orders/:id", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const { data, error } = await supabase
      .from("social_inbox_orders")
      .delete()
      .eq("id", req.params.id)
      .eq("org_id", orgId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Inbox order not found" });
    return res.json({ success: true, id: data.id });
  } catch (err) {
    return sendError(res, err);
  }
});

// Brand document
app.get("/api/social/brand-doc", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const cfg = await getOrgSettings(orgId, ["brand_doc"]);
    res.json({ content: cfg["brand_doc"] || "" });
  } catch (e) { res.json({ content: "" }); }
});

app.post("/api/social/brand-doc", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { content } = req.body;
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    await saveOrgSettings(orgId, { brand_doc: content || "" });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── DB Init ─────────────────────────────────────────────────────────────────

const MULTI_TENANCY_SQL = `
-- ── Create social tables if they don't exist ────────────────────────────────
-- These tables are not covered by the Supabase migration files, so we create
-- them here idempotently on every server cold-start.

CREATE TABLE IF NOT EXISTS public.social_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  contact_name TEXT,
  contact_avatar TEXT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  unread_count INT DEFAULT 0,
  paused_ai BOOLEAN DEFAULT false,
  org_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(platform, contact_id)
);
ALTER TABLE public.social_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_conversations ADD COLUMN IF NOT EXISTS paused_ai BOOLEAN DEFAULT false;
DO $$ BEGIN
  CREATE POLICY "service_role_all_social_conv" ON public.social_conversations
    TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.social_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.social_conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  content TEXT,
  image_url TEXT,
  message_type TEXT DEFAULT 'text',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.social_messages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_all_social_msg" ON public.social_messages
    TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.social_inbox_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.social_conversations(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  contact_name TEXT,
  contact_id TEXT,
  items JSONB,
  notes TEXT,
  total_price NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',
  org_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_to_courier BOOLEAN DEFAULT FALSE,
  consignment_id TEXT,
  tracking_code TEXT,
  courier_status TEXT,
  courier_message TEXT,
  fraud_checked BOOLEAN DEFAULT FALSE,
  fraud_data JSONB,
  delivery_rate NUMERIC
);
ALTER TABLE public.social_inbox_orders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_all_social_orders" ON public.social_inbox_orders
    TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Add org_id to pre-existing tables that may not have it yet ───────────────

DO $$ BEGIN
  ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS org_id UUID;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS org_id UUID;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.social_conversations ADD COLUMN IF NOT EXISTS org_id UUID;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS org_id UUID;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS org_id UUID;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 0;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS slug TEXT;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description TEXT;
  ALTER TABLE public.products ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS products_org_slug_unique_idx
    ON public.products(org_id, slug)
    WHERE slug IS NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS public.product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    alt_text TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
  CREATE INDEX IF NOT EXISTS product_images_org_product_idx ON public.product_images(org_id, product_id, sort_order);
  CREATE POLICY "service_role_all_product_images" ON public.product_images TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "auth_users_product_images" ON public.product_images FOR ALL TO authenticated USING (org_id IN (SELECT org_id FROM public.user_roles WHERE user_id = auth.uid()::text)) WITH CHECK (org_id IN (SELECT org_id FROM public.user_roles WHERE user_id = auth.uid()::text));
EXCEPTION WHEN undefined_table OR duplicate_object THEN NULL;
END $$;

-- Product variants (sizes / option combos). Multi-tenant via org_id.
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS public.product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    cog NUMERIC NOT NULL DEFAULT 0,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    price_adjustment NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
  CREATE INDEX IF NOT EXISTS product_variants_org_product_idx ON public.product_variants(org_id, product_id);
  CREATE POLICY "service_role_all_product_variants" ON public.product_variants TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN undefined_table OR duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "auth_users_product_variants" ON public.product_variants FOR ALL TO authenticated USING (org_id IN (SELECT org_id FROM public.user_roles WHERE user_id = auth.uid()::text)) WITH CHECK (org_id IN (SELECT org_id FROM public.user_roles WHERE user_id = auth.uid()::text));
EXCEPTION WHEN undefined_table OR duplicate_object THEN NULL;
END $$;

-- Social conversations must be unique per organization, not globally.
DO $$ BEGIN
  ALTER TABLE public.social_conversations DROP CONSTRAINT IF EXISTS social_conversations_platform_contact_id_key;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS social_conversations_org_platform_contact_idx
  ON public.social_conversations(org_id, platform, contact_id);

-- ── Multi-tenant Meta Business integration ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.meta_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE,
  connected_by_user_id UUID,
  meta_user_id TEXT,
  meta_user_name TEXT,
  encrypted_user_access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'connected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_all_meta_connections" ON public.meta_connections TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.meta_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  connection_id UUID REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  page_name TEXT,
  encrypted_page_access_token TEXT,
  instagram_account_id TEXT,
  webhook_subscribed BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'connected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, page_id)
);
ALTER TABLE public.meta_pages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_all_meta_pages" ON public.meta_pages TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.meta_instagram_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  connection_id UUID REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  page_id TEXT,
  instagram_account_id TEXT NOT NULL,
  username TEXT,
  account_name TEXT,
  status TEXT DEFAULT 'connected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, instagram_account_id)
);
ALTER TABLE public.meta_instagram_accounts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_all_meta_instagram" ON public.meta_instagram_accounts TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.meta_whatsapp_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  connection_id UUID REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  whatsapp_business_account_id TEXT NOT NULL,
  phone_number_id TEXT,
  display_phone_number TEXT,
  account_name TEXT,
  encrypted_access_token TEXT,
  status TEXT DEFAULT 'connected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, whatsapp_business_account_id, phone_number_id)
);
ALTER TABLE public.meta_whatsapp_accounts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_all_meta_whatsapp" ON public.meta_whatsapp_accounts TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.meta_ad_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  connection_id UUID REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  ad_account_id TEXT NOT NULL,
  account_name TEXT,
  currency TEXT,
  status TEXT DEFAULT 'connected',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, ad_account_id)
);
ALTER TABLE public.meta_ad_accounts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_all_meta_ads" ON public.meta_ad_accounts TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.meta_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  platform TEXT,
  object_type TEXT,
  page_id TEXT,
  instagram_account_id TEXT,
  sender_id TEXT,
  event_type TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.meta_webhook_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_all_meta_events" ON public.meta_webhook_events TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Image embedding for product matching ─────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_embedding vector(1536);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_description TEXT;

CREATE OR REPLACE FUNCTION match_products_by_embedding(
  query_embedding vector(1536),
  match_org_id UUID,
  match_threshold FLOAT DEFAULT 0.75,
  match_count INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  selling_price NUMERIC,
  image_url TEXT,
  image_description TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.selling_price,
    p.image_url,
    p.image_description,
    (1 - (p.image_embedding <=> query_embedding))::FLOAT AS similarity
  FROM public.products p
  WHERE p.org_id = match_org_id
    AND p.image_embedding IS NOT NULL
    AND 1 - (p.image_embedding <=> query_embedding) > match_threshold
  ORDER BY p.image_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ── Return tracking columns ──────────────────────────────────────────────────
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courier_fee NUMERIC;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS return_requested_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS return_status TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS return_reason TEXT;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS courier_fee NUMERIC;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS return_requested_at TIMESTAMPTZ;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS return_status TEXT;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS return_reason TEXT;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS courier_name TEXT;

-- Reload PostgREST schema cache so all new columns are visible immediately
NOTIFY pgrst, 'reload schema';
`;

const SETUP_SQL = `
-- Create app_role type if it doesn't exist
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'team_member');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID,
  role public.app_role NOT NULL DEFAULT 'team_member',
  UNIQUE(user_id)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can view their own role" ON public.user_roles
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_all_user_roles" ON public.user_roles
    TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create has_role helper function
CREATE OR REPLACE FUNCTION public.has_role(uid UUID, check_role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = uid AND role = check_role);
$$;

-- Create orders table
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shopify_order_id BIGINT UNIQUE NOT NULL,
  order_number TEXT NOT NULL,
  customer_name TEXT,
  phone TEXT,
  address TEXT,
  product TEXT,
  quantity INTEGER,
  price NUMERIC(10, 2),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('confirmed', 'pending')),
  fraud_checked BOOLEAN DEFAULT false,
  fraud_data JSONB,
  delivery_rate NUMERIC(5, 2),
  courier_status TEXT DEFAULT NULL,
  consignment_id TEXT DEFAULT NULL,
  tracking_code TEXT DEFAULT NULL,
  courier_message TEXT DEFAULT NULL,
  sent_to_courier BOOLEAN DEFAULT false,
  notes TEXT,
  fulfillment_status TEXT DEFAULT NULL,
  org_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can view all orders" ON public.orders FOR SELECT TO authenticated USING (org_id IN (SELECT org_id FROM public.user_roles WHERE user_id = auth.uid()::text));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated users can insert orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (org_id IN (SELECT org_id FROM public.user_roles WHERE user_id = auth.uid()::text));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated users can update orders" ON public.orders FOR UPDATE TO authenticated USING (org_id IN (SELECT org_id FROM public.user_roles WHERE user_id = auth.uid()::text));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated users can delete orders" ON public.orders FOR DELETE TO authenticated USING (org_id IN (SELECT org_id FROM public.user_roles WHERE user_id = auth.uid()::text));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;
CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create app_settings table
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "service_role_all_settings" ON public.app_settings TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Social Inbox tables
CREATE TABLE IF NOT EXISTS public.social_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  contact_name TEXT,
  contact_avatar TEXT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  unread_count INT DEFAULT 0,
  paused_ai BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(platform, contact_id)
);
ALTER TABLE public.social_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_conversations ADD COLUMN IF NOT EXISTS paused_ai BOOLEAN DEFAULT false;
DO $$ BEGIN
  CREATE POLICY "service_role_all_social_conv" ON public.social_conversations TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.social_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.social_conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  content TEXT,
  image_url TEXT,
  message_type TEXT DEFAULT 'text',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.social_messages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_all_social_msg" ON public.social_messages TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.social_inbox_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.social_conversations(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  contact_name TEXT,
  contact_id TEXT,
  items JSONB,
  notes TEXT,
  total_price NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_to_courier BOOLEAN DEFAULT FALSE,
  consignment_id TEXT,
  tracking_code TEXT,
  courier_status TEXT,
  courier_message TEXT,
  fraud_checked BOOLEAN DEFAULT FALSE,
  fraud_data JSONB,
  delivery_rate NUMERIC
);
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS sent_to_courier BOOLEAN DEFAULT FALSE;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS consignment_id TEXT;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS tracking_code TEXT;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS courier_status TEXT;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS courier_message TEXT;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS fraud_checked BOOLEAN DEFAULT FALSE;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS fraud_data JSONB;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS delivery_rate NUMERIC;
ALTER TABLE public.social_inbox_orders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_all_social_orders" ON public.social_inbox_orders TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Products catalog table
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT,
  image_url TEXT,
  selling_price NUMERIC,
  cog NUMERIC NOT NULL DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  source_url TEXT,
  org_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC;
CREATE UNIQUE INDEX IF NOT EXISTS products_org_slug_unique_idx
  ON public.products(org_id, slug)
  WHERE slug IS NOT NULL;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_all_products" ON public.products TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "auth_users_products" ON public.products FOR ALL TO authenticated USING (org_id IN (SELECT org_id FROM public.user_roles WHERE user_id = auth.uid()::text)) WITH CHECK (org_id IN (SELECT org_id FROM public.user_roles WHERE user_id = auth.uid()::text));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  alt_text TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS product_images_org_product_idx ON public.product_images(org_id, product_id, sort_order);
DO $$ BEGIN
  CREATE POLICY "service_role_all_product_images" ON public.product_images TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "auth_users_product_images" ON public.product_images FOR ALL TO authenticated USING (org_id IN (SELECT org_id FROM public.user_roles WHERE user_id = auth.uid()::text)) WITH CHECK (org_id IN (SELECT org_id FROM public.user_roles WHERE user_id = auth.uid()::text));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

// ─── Products Catalog ────────────────────────────────────────────────────────

app.get("/api/products", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const productIds = (data || []).map((p) => p.id);
    const stockMap = await getProductStockMap(orgId, productIds);
    const imagesMap = await loadProductImagesMap(supabase, orgId, productIds);

    // Load all variants for this org's products in one query
    let variantsMap = {};
    if (productIds.length > 0) {
      const { data: variantRows } = await supabase
        .from("product_variants")
        .select("*")
        .in("product_id", productIds)
        .eq("org_id", orgId)
        .order("created_at", { ascending: true });
      for (const v of variantRows || []) {
        if (!variantsMap[v.product_id]) variantsMap[v.product_id] = [];
        variantsMap[v.product_id].push(v);
      }
    }

    const handle = await getStorefrontHandle(orgId);
    const origin = `${req.protocol}://${req.get("host")}`;
    return res.json({
      storefront: {
        id: orgId,
        handle: handle || null,
        products_url: handle
          ? `${origin}/api/public/v1/${handle}/products`
          : `${origin}/api/public/v1/storefronts/${orgId}/products`,
      },
      products: (data || []).map((p) => ({
        ...p,
        image_url: imagesMap[p.id]?.[0]?.url || p.image_url,
        stock_quantity: stockMap[p.id] || 0,
        variants: variantsMap[p.id] || [],
        images: imagesMap[p.id] || [],
      })),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Canonical public storefront routes are versioned under /api/public/v1/.
// The unversioned /api/public/storefronts/... paths remain for one deprecation
// window and set Deprecation + Sunset headers on every response.
const PUBLIC_STOREFRONT_SUNSET = "Sat, 17 Oct 2026 00:00:00 GMT";

function setDeprecationHeaders(res, canonicalPath) {
  res.set("Deprecation", "true");
  res.set("Sunset", PUBLIC_STOREFRONT_SUNSET);
  res.set("Link", `<${canonicalPath}>; rel="successor-version"`);
}

// ─── Public cache helpers ───────────────────────────────────────────────
// Two-tier cache for the storefront:
//   • Catalog  — s-maxage=60, stale-while-revalidate=86400. Static-ish;
//     invalidated by Cache-Tag purge on product write.
//   • Inventory — s-maxage=5,  SWR=30. Stock truth; short so the
//     add-to-cart button is never more than ~5s stale on a hard refresh.
// Cache-Tag uses storefront:<handle> / product:<id> (never org_id) so a
// purge can target one product or one merchant without leaking the tenant id.
function cacheTagHeader(handle, ids = []) {
  const tags = [`storefront=${handle}`];
  for (const id of ids) tags.push(`product=${id}`);
  return tags.join(",");
}

function computeEtag(fingerprint) {
  return "W/\"" + crypto.createHash("sha1").update(fingerprint).digest("base64url").slice(0, 16) + "\"";
}

// Weak ETag keyed on only render-affecting fields. Includes updated_at
// so a save that touches no price/slug field still invalidates.
function catalogEtag(products) {
  const fp = products
    .map((p) => `${p.id}:${p.updated_at ?? ""}:${p.slug}:${p.price ?? ""}`)
    .join("|");
  return computeEtag(fp);
}

function inventoryEtag(inventory) {
  const fp = Object.entries(inventory)
    .map(([id, e]) => `${id}:${e.stock_quantity}:${e.available}`)
    .sort()
    .join("|");
  return computeEtag(fp);
}

// Sets cache headers + honours If-None-Match. Returns true if a 304 was sent
// (caller should then return without writing a body).
function respondCached(res, { etag, cacheControl, cacheTag }) {
  res.set("Cache-Control", cacheControl);
  res.set("ETag", etag);
  res.set("Vary", "Accept-Encoding");
  if (cacheTag) res.set("Cache-Tag", cacheTag);
  res.set("X-Merchant-Suite-API-Version", "2026-07-19");
  const inm = res.req.headers["if-none-match"];
  if (inm && inm.split(",").map((s) => s.trim()).includes(etag)) {
    res.status(304).end();
    return true;
  }
  return false;
}

// Catalog is stock-free: no getProductStockMap here. Stock lives on
// /inventory with its own short TTL so a cached catalog + fresh stock renders
// correctly on the merchant site.
async function loadPublicProducts(orgId) {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("org_id", orgId)
    .eq("published", true)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const products = data || [];
  const productIds = products.map((p) => p.id);
  const imagesMap = await loadProductImagesMap(supabase, orgId, productIds);
  const variantsMap = {};
  if (productIds.length > 0) {
    const { data: variantRows, error: variantsError } = await supabase
      .from("product_variants")
      .select("id, product_id, attributes, price_adjustment")
      .in("product_id", productIds)
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });
    if (variantsError) throw variantsError;
    for (const variant of variantRows || []) {
      if (!variantsMap[variant.product_id]) variantsMap[variant.product_id] = [];
      variantsMap[variant.product_id].push(variant);
    }
  }
  return products.map((product) =>
    toPublicProduct(product, variantsMap[product.id] || [], imagesMap[product.id] || []),
  );
}

async function loadPublicProductBySlug(orgId, slug) {
  const supabase = getServiceSupabase();
  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("org_id", orgId)
    .eq("published", true)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!product) return null;

  const [imagesMap, { data: variants, error: variantsError }] = await Promise.all([
    loadProductImagesMap(supabase, orgId, [product.id]),
    supabase
      .from("product_variants")
      .select("id, product_id, attributes, price_adjustment")
      .eq("product_id", product.id)
      .eq("org_id", orgId)
      .order("created_at", { ascending: true }),
  ]);
  if (variantsError) throw variantsError;

  return toPublicProduct(product, variants || [], imagesMap[product.id] || []);
}

async function loadPublicInventory(orgId, ids) {
  if (!ids.length) return {};
  const supabase = getServiceSupabase();
  const { data: rows, error } = await supabase
    .from("products")
    .select("id")
    .eq("org_id", orgId)
    .eq("published", true)
    .in("id", ids);
  if (error) throw error;
  const validIds = (rows || []).map((r) => r.id);
  if (!validIds.length) return {};

  const [stockMap, variantsResult] = await Promise.all([
    getProductStockMap(orgId, validIds),
    supabase
      .from("product_variants")
      .select("id, product_id, stock_quantity")
      .in("product_id", validIds)
      .eq("org_id", orgId),
  ]);
  if (variantsResult.error) throw variantsResult.error;

  const variantsByProduct = {};
  for (const v of variantsResult.data || []) {
    if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
    variantsByProduct[v.product_id].push(v);
  }

  const inventory = {};
  for (const id of validIds) {
    inventory[id] = toPublicInventoryEntry({
      stockQuantity: stockMap[id] || 0,
      variants: variantsByProduct[id] || [],
    });
  }
  return inventory;
}

async function handlePublicStorefrontProducts(req, res) {
  try {
    const products = await loadPublicProducts(req.params.storefrontId);
    if (respondCached(res, {
      etag: catalogEtag(products),
      cacheControl: "public, max-age=60, stale-while-revalidate=86400, s-maxage=60",
      cacheTag: cacheTagHeader(req.params.storefrontId),
    })) return;
    return res.json({ products });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function handlePublicStorefrontProductDetail(req, res) {
  try {
    const product = await loadPublicProductBySlug(req.params.storefrontId, req.params.slug);
    if (!product) return res.status(404).json({ error: "Product not found" });
    if (respondCached(res, {
      etag: catalogEtag([product]),
      cacheControl: "public, max-age=120, stale-while-revalidate=86400, s-maxage=120",
      cacheTag: cacheTagHeader(req.params.storefrontId, [product.id]),
    })) return;
    return res.json({ product });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ─── Public Storefront Config ────────────────────────────────────────────────
// Returns merchant branding configuration (name, logo, colors, shipping zones)
// for the storefront app to render. Cacheable with the same catalog-tier headers.
async function loadPublicStorefrontConfig(orgId) {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("storefront_settings")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function configEtag(config) {
  if (!config) return computeEtag("empty");
  return computeEtag(`${config.org_id}:${config.updated_at || ""}:${config.store_name || ""}`);
}

async function handlePublicHandleConfig(req, res) {
  try {
    const orgId = await resolveStorefrontHandle(req.params.handle);
    if (!orgId) return res.status(404).json({ error: "not_found" });
    const config = await loadPublicStorefrontConfig(orgId);
    // Return defaults when storefront settings haven't been configured yet —
    // the storefront still needs to render even if the merchant hasn't customized.
    const payload = {
      storeName: config?.store_name || "",
      tagline: config?.tagline || "",
      logoUrl: config?.logo_url || null,
      faviconUrl: config?.favicon_url || null,
      primaryColor: config?.primary_color || "#000000",
      backgroundColor: config?.background_color || "#FAFAF8",
      fontFamily: config?.font_family || "Geist Sans",
      contactPhone: config?.contact_phone || null,
      contactEmail: config?.contact_email || null,
      socialLinks: {
        facebook: config?.social_facebook || null,
        instagram: config?.social_instagram || null,
        tiktok: config?.social_tiktok || null,
      },
      shippingZones: config?.shipping_zones || [],
    };
    if (respondCached(res, {
      etag: configEtag(config),
      cacheControl: "public, max-age=60, stale-while-revalidate=86400, s-maxage=60",
      cacheTag: cacheTagHeader(req.params.handle),
    })) return;
    return res.json(payload);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// ─── Public Storefront Order Submission ──────────────────────────────────────
// Accepts orders from the storefront checkout flow. No authentication required —
// the storefront is public. Validates stock, calculates shipping from zones,
// creates the order, and decrements variant stock.
async function handlePublicHandleOrderSubmit(req, res) {
  try {
    const orgId = await resolveStorefrontHandle(req.params.handle);
    if (!orgId) return res.status(404).json({ error: "not_found" });

    const supabase = getServiceSupabase();
    const { customerName, phone, address, items, shippingZoneId, notes } = req.body || {};

    // ── Validate required fields ─────────────────────────────────────────
    if (!customerName || typeof customerName !== "string") {
      return res.status(400).json({ error: "customer_name is required" });
    }
    const cleanPhone = normalizeBdPhone(phone);
    if (!cleanPhone) {
      return res.status(400).json({ error: "A valid Bangladeshi phone number is required" });
    }
    if (!address || typeof address !== "string") {
      return res.status(400).json({ error: "address is required" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "At least one item is required" });
    }

    // ── Validate items and check stock ───────────────────────────────────
    const variantIds = items.map((i) => i.variantId).filter(Boolean);
    if (variantIds.length !== items.length) {
      return res.status(400).json({ error: "Each item must have a variantId" });
    }

    // Fetch all variants + their parent products in one pass
    const { data: variants, error: vErr } = await supabase
      .from("product_variants")
      .select("id, product_id, org_id, attributes, price_adjustment, stock_quantity")
      .in("id", variantIds)
      .eq("org_id", orgId);
    if (vErr) throw vErr;

    const variantMap = {};
    for (const v of variants || []) variantMap[v.id] = v;

    // Fetch parent products for base prices and names
    const productIds = [...new Set(Object.values(variantMap).map((v) => v.product_id))];
    const { data: products, error: pErr } = await supabase
      .from("products")
      .select("id, name, selling_price, published")
      .in("id", productIds)
      .eq("org_id", orgId)
      .eq("published", true);
    if (pErr) throw pErr;

    const productMap = {};
    for (const p of products || []) productMap[p.id] = p;

    // Build line items with pricing and stock validation
    const orderItems = [];
    let subtotal = 0;

    for (const item of items) {
      const variant = variantMap[item.variantId];
      if (!variant) {
        return res.status(400).json({ error: `Variant not found or doesn't belong to this store` });
      }
      const product = productMap[variant.product_id];
      if (!product) {
        return res.status(400).json({ error: `Product is no longer available` });
      }

      const qty = Math.max(1, parseInt(item.quantity, 10) || 1);
      if (variant.stock_quantity < qty) {
        const attrStr = Object.entries(variant.attributes || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
        return res.status(400).json({
          error: `Insufficient stock for "${product.name}"${attrStr ? ` (${attrStr})` : ""}. Available: ${variant.stock_quantity}`,
        });
      }

      const basePrice = parseFloat(product.selling_price) || 0;
      const adjustment = parseFloat(variant.price_adjustment) || 0;
      const unitPrice = basePrice + adjustment;
      const lineTotal = unitPrice * qty;

      orderItems.push({
        variantId: variant.id,
        productId: product.id,
        productName: product.name,
        attributes: variant.attributes || {},
        quantity: qty,
        unitPrice,
        lineTotal,
      });
      subtotal += lineTotal;
    }

    // ── Shipping calculation ─────────────────────────────────────────────
    let shipping = 0;
    if (shippingZoneId) {
      const { data: settings } = await supabase
        .from("storefront_settings")
        .select("shipping_zones")
        .eq("org_id", orgId)
        .maybeSingle();

      const zones = settings?.shipping_zones || [];
      const shippingResult = calculateShippingCost(subtotal, shippingZoneId, zones);
      if (shippingResult.error) {
        return res.status(400).json({ error: shippingResult.error });
      }
      shipping = shippingResult.cost;
    }

    const total = subtotal + shipping;

    // ── Build order product string (summary of all items) ───────────────
    const productSummary = orderItems
      .map((item) => {
        const attrs = Object.values(item.attributes).join(", ");
        return `${item.productName}${attrs ? ` (${attrs})` : ""} x${item.quantity}`;
      })
      .join(", ");

    // ── Insert order ─────────────────────────────────────────────────────
    const orderSeq = await getNextManualOrderSeq(orgId);
    const orderNumber = `#S${orderSeq}`;
    const shopifyOrderId = -(Math.floor(Math.random() * 9_000_000_000_000) + 1_000_000_000_000);

    const orderRow = {
      org_id: orgId,
      shopify_order_id: shopifyOrderId,
      order_number: orderNumber,
      customer_name: customerName,
      phone: cleanPhone,
      address,
      product: productSummary,
      quantity: orderItems.reduce((sum, i) => sum + i.quantity, 0),
      price: subtotal,
      delivery_rate: shipping,
      status: "pending",
      source: "storefront",
      notes: notes || null,
    };

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert(orderRow)
      .select("*")
      .single();
    if (orderErr) throw orderErr;

    // ── Decrement variant stock ──────────────────────────────────────────
    for (const item of orderItems) {
      await supabase
        .from("product_variants")
        .update({ stock_quantity: Math.max(0, variantMap[item.variantId].stock_quantity - item.quantity) })
        .eq("id", item.variantId)
        .eq("org_id", orgId);
    }

    // ── Purge inventory cache so storefront reflects new stock ───────────
    await purgeProductCache(orgId, null, { listChanged: false, warm: false });

    return res.json({
      success: true,
      orderId: orderNumber,
      total,
      shipping,
      message: "Order placed successfully! We'll contact you shortly.",
    });
  } catch (e) {
    console.error("[Storefront Order] Error:", e.message);
    return res.status(500).json({ error: e.message });
  }
}

async function handlePublicHandleProducts(req, res) {
  try {
    const orgId = await resolveStorefrontHandle(req.params.handle);
    // Same 404 shape whether the handle is unknown or the catalog is empty:
    // don't let attackers enumerate handles by comparing responses.
    if (!orgId) return res.status(404).json({ error: "not_found" });
    const products = await loadPublicProducts(orgId);
    if (respondCached(res, {
      etag: catalogEtag(products),
      cacheControl: "public, max-age=60, stale-while-revalidate=86400, s-maxage=60",
      cacheTag: cacheTagHeader(req.params.handle),
    })) return;
    return res.json({ products });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function handlePublicHandleProductDetail(req, res) {
  try {
    const orgId = await resolveStorefrontHandle(req.params.handle);
    if (!orgId) return res.status(404).json({ error: "not_found" });
    const product = await loadPublicProductBySlug(orgId, req.params.slug);
    if (!product) return res.status(404).json({ error: "not_found" });
    if (respondCached(res, {
      etag: catalogEtag([product]),
      cacheControl: "public, max-age=120, stale-while-revalidate=86400, s-maxage=120",
      cacheTag: cacheTagHeader(req.params.handle, [product.id]),
    })) return;
    return res.json({ product });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// Short-TTL stock-truth endpoint. Bulk `?ids=a,b,c` covers the PLP
// add-to-cart case; per-slug covers the PDP. The storefront renders
// the catalog from the cached list and hydrates stock from here — that's
// the two-tier split that makes a merchant's edit show instantly
// without turning stock into a distributed-systems problem.
async function handlePublicHandleInventory(req, res) {
  try {
    const orgId = await resolveStorefrontHandle(req.params.handle);
    if (!orgId) {
      res.set("Cache-Control", "no-store");
      return res.status(404).json({ error: "not_found" });
    }

    const ids = (req.query.ids ? String(req.query.ids).split(",") : [])
      .map((s) => s.trim()).filter(Boolean);
    if (ids.length > 100) return res.status(413).json({ error: "ids: max 100" });
    if (!ids.length) return res.status(400).json({ error: "ids_required" });

    const inventory = await loadPublicInventory(orgId, ids);
    const body = { inventory, as_of: new Date().toISOString() };
    if (respondCached(res, {
      etag: inventoryEtag(inventory),
      cacheControl: "public, max-age=5, stale-while-revalidate=30, s-maxage=5",
      cacheTag: cacheTagHeader(req.params.handle, ids),
    })) return;
    // Validate through Zod so a leaked field is a staging 500, not a
    // contract break shipped to storefronts.
    return res.json(PublicInventoryResponseSchema.parse(body));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function handlePublicHandleProductInventory(req, res) {
  try {
    const orgId = await resolveStorefrontHandle(req.params.handle);
    if (!orgId) {
      res.set("Cache-Control", "no-store");
      return res.status(404).json({ error: "not_found" });
    }
    const supabase = getServiceSupabase();
    const { data: product, error } = await supabase
      .from("products")
      .select("id")
      .eq("org_id", orgId)
      .eq("published", true)
      .eq("slug", req.params.slug)
      .maybeSingle();
    if (error) throw error;
    if (!product) {
      res.set("Cache-Control", "no-store");
      return res.status(404).json({ error: "not_found" });
    }
    const inventory = await loadPublicInventory(orgId, [product.id]);
    const entry = inventory[product.id] || null;
    const body = { inventory: entry, as_of: new Date().toISOString() };
    if (respondCached(res, {
      etag: inventoryEtag(inventory),
      cacheControl: "public, max-age=5, stale-while-revalidate=30, s-maxage=5",
      cacheTag: cacheTagHeader(req.params.handle, [product.id]),
    })) return;
    // Validates the entry (or null) shape through Zod.
    return res.json({
      inventory: entry === null ? null : PublicInventoryEntrySchema.parse(entry),
      as_of: body.as_of,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

app.get("/api/public/v1/:handle/config", rateLimitPublicRead, handlePublicHandleConfig);
app.get("/api/public/v1/:handle/products", rateLimitPublicRead, handlePublicHandleProducts);
app.post("/api/public/v1/:handle/orders", rateLimitPublicRead, handlePublicHandleOrderSubmit);
app.get("/api/public/v1/:handle/products/:slug", rateLimitPublicRead, handlePublicHandleProductDetail);
app.get("/api/public/v1/:handle/products/:slug/inventory", rateLimitPublicRead, handlePublicHandleProductInventory);
app.get("/api/public/v1/:handle/inventory", rateLimitPublicRead, handlePublicHandleInventory);

app.get("/api/public/v1/storefronts/:storefrontId/products", rateLimitPublicRead, handlePublicStorefrontProducts);
app.get("/api/public/v1/storefronts/:storefrontId/products/:slug", rateLimitPublicRead, handlePublicStorefrontProductDetail);
app.get("/api/public/v1/storefronts/:storefrontId/products/:slug/inventory", rateLimitPublicRead, handlePublicHandleProductInventory);

app.get("/api/public/storefronts/:storefrontId/products", (req, res) => {
  setDeprecationHeaders(res, `/api/public/v1/storefronts/${req.params.storefrontId}/products`);
  return handlePublicStorefrontProducts(req, res);
});
app.get("/api/public/storefronts/:storefrontId/products/:slug", (req, res) => {
  setDeprecationHeaders(res, `/api/public/v1/storefronts/${req.params.storefrontId}/products/${req.params.slug}`);
  return handlePublicStorefrontProductDetail(req, res);
});

app.post("/api/products/save", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { products, sourceUrl } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: "products array required" });
    }
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    // Insert product rows (without variants)
    const rows = [];
    const sourceProducts = [];
    for (const p of products) {
      const name = String(p.name || "").trim();
      if (!name) continue;
      const published = p.published === true;
      rows.push({
        name,
        url: p.url || null,
        image_url: p.image_url || null,
        selling_price: p.selling_price != null ? parseFloat(p.selling_price) : null,
        compare_at_price: p.compare_at_price != null ? parseFloat(p.compare_at_price) : null,
        cog: p.cog != null ? parseFloat(p.cog) : 0,
        description: p.description || null,
        slug: published ? await getUniqueProductSlug(supabase, orgId, crypto.randomUUID(), p.slug, name) : null,
        published: p.published === true,
        published_at: published ? new Date().toISOString() : null,
        source_url: sourceUrl || null,
        org_id: orgId,
      });
      sourceProducts.push(p);
    }
    if (!rows.length) return res.status(400).json({ error: "No valid products to save" });

    const { data, error } = await supabase.from("products").insert(rows).select();
    if (error) throw error;

    for (let i = 0; i < data.length; i++) {
      const savedProduct = data[i];
      const sourceProduct = sourceProducts[i];
      if (sourceProduct.stock_quantity !== undefined) {
        await saveProductStock(orgId, savedProduct.id, sourceProduct.stock_quantity);
      }
    }

    // Bulk-insert variants for products that came with extracted variant data
    const variantRows = [];
    for (let i = 0; i < data.length; i++) {
      const savedProduct = data[i];
      const sourceProduct = sourceProducts[i];
      if (!Array.isArray(sourceProduct.variants) || sourceProduct.variants.length === 0) continue;
      for (const v of sourceProduct.variants) {
        if (!v.attributes || typeof v.attributes !== "object" || Object.keys(v.attributes).length === 0) continue;
        // Compute price_adjustment relative to base selling_price
        const basePx = savedProduct.selling_price;
        const varPx = v.selling_price != null ? parseFloat(v.selling_price) : null;
        const priceAdj = basePx != null && varPx != null ? varPx - basePx : 0;
        variantRows.push({
          product_id: savedProduct.id,
          org_id: orgId,
          attributes: Object.fromEntries(
            Object.entries(v.attributes).map(([k, val]) => [k.trim().toLowerCase(), String(val).trim()])
          ),
          cog: v.cog != null ? parseFloat(v.cog) : 0,
          stock_quantity: Math.max(0, parseInt(v.stock_quantity, 10) || 0),
          price_adjustment: priceAdj,
        });
      }
    }

    if (variantRows.length > 0) {
      const { error: vErr } = await supabase.from("product_variants").insert(variantRows);
      if (vErr) console.error("[products/save] variant insert error:", vErr.message);
    }

    // Generate embeddings in background (non-blocking)
    for (const product of data) {
      if (product.image_url) {
        generateProductEmbedding(product.image_url).then(({ embedding, description }) => {
          if (embedding) {
            const vectorStr = `[${embedding.join(",")}]`;
            supabase.from("products").update({ image_embedding: vectorStr, image_description: description })
              .eq("id", product.id).eq("org_id", orgId).then(({ error: embErr }) => {
                if (embErr) console.warn(`[Embedding] save failed for ${product.id}:`, embErr.message);
                else console.log(`[Embedding] generated for product ${product.id}: "${description?.slice(0, 60)}..."`);
              });
          }
        }).catch((err) => console.warn(`[Embedding] generation failed for ${product.id}:`, err.message));
      }
    }

    return res.json({ saved: data.length, variants_saved: variantRows.length, products: data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/products/crawl", rateLimitAI, async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "url required" });

    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (!firecrawlKey) return res.status(500).json({ error: "FIRECRAWL_API_KEY not configured in .env" });

    const { default: FirecrawlApp } = await import("@mendable/firecrawl-js");
    const firecrawl = new FirecrawlApp({ apiKey: firecrawlKey });

    // Step 1: scrape the page for clean markdown
    const scrapeResult = await firecrawl.scrapeUrl(url, {
      formats: ["markdown"],
    });

    if (!scrapeResult.markdown) {
      return res.status(500).json({ error: "Firecrawl could not retrieve page content. Check the URL is publicly accessible." });
    }

    let products = [];

    // Step 2: Firecrawl structured extract — now includes universal variants
    try {
      const extractResult = await firecrawl.scrapeUrl(url, {
        formats: [
          "markdown",
          {
            type: "json",
            prompt: `Extract all products being sold on this page.
For each product include:
- name: product name
- selling_price: base price as a plain number, no currency symbols
- image_url: main product image URL
- url: product page URL
- variants: array of variant combinations available (e.g. color + size, weight, material, flavour, storage, capacity, volume — whatever attributes this product type has). Each variant must have:
  - attributes: object with arbitrary key/value string pairs (e.g. {"color":"Black","size":"M"} or {"weight":"500g"} or {"storage":"256GB","color":"Space Grey"})
  - selling_price: variant-specific price if different from base, otherwise omit

Only include real products for sale. Ignore navigation links, blog posts, categories.
If a product has no distinguishable variants, return an empty variants array.`,
            schema: {
              type: "object",
              properties: {
                products: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name:          { type: "string" },
                      selling_price: { type: "number" },
                      image_url:     { type: "string" },
                      url:           { type: "string" },
                      variants: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            attributes:    { type: "object" },
                            selling_price: { type: "number" },
                          },
                          required: ["attributes"],
                        },
                      },
                    },
                    required: ["name"],
                  },
                },
              },
            },
          }
        ],
      });

      const extracted = extractResult?.json?.products;
      if (Array.isArray(extracted) && extracted.length > 0) {
        products = extracted
          .filter((p) => p.name && typeof p.name === "string" && p.name.trim())
          .map((p) => ({
            name: p.name.trim(),
            url: p.url || url,
            image_url: p.image_url || null,
            selling_price: p.selling_price ? parseFloat(p.selling_price) : null,
            cog: 0,
            variants: Array.isArray(p.variants)
              ? p.variants
                  .filter((v) => v.attributes && typeof v.attributes === "object" && Object.keys(v.attributes).length > 0)
                  .map((v) => ({
                    attributes: Object.fromEntries(
                      Object.entries(v.attributes).map(([k, val]) => [
                        k.trim().toLowerCase(),
                        String(val).trim(),
                      ])
                    ),
                    selling_price: v.selling_price ? parseFloat(v.selling_price) : null,
                  }))
              : [],
          }));
      }
    } catch { /* extract failed, fall through to GPT */ }

    // Step 3: GPT-4o-mini fallback if Firecrawl found nothing
    if (products.length === 0 && scrapeResult.markdown) {
      try {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const snippet = scrapeResult.markdown.slice(0, 6000);
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0,
          messages: [
            {
              role: "system",
              content: `You extract product listings from e-commerce page content.
Return a JSON array. Each item:
{
  "name": string,
  "selling_price": number|null,
  "image_url": string|null,
  "variants": [
    {
      "attributes": { "key": "value" },
      "selling_price": number|null
    }
  ]
}
The attributes object holds ANY product-specific variant dimensions relevant to that product type — color, size, weight, material, flavour, storage, capacity, volume, etc. Use lowercase keys.
If a product has no variants, set "variants" to [].
Only include real products for sale. Ignore navigation, categories, blog posts.
Respond with raw JSON array only — no markdown fences.`,
            },
            {
              role: "user",
              content: `Extract products from this page:\n\n${snippet}`,
            },
          ],
        });
        const raw = completion.choices[0]?.message?.content?.trim() || "[]";
        const parsed = JSON.parse(raw.replace(/^```json\n?|```$/g, "").trim());
        if (Array.isArray(parsed)) {
          products = parsed
            .filter((p) => p.name && typeof p.name === "string")
            .map((p) => ({
              name: p.name.trim(),
              url: url,
              image_url: p.image_url || null,
              selling_price: p.selling_price ? parseFloat(p.selling_price) : null,
              cog: 0,
              variants: Array.isArray(p.variants)
                ? p.variants
                    .filter((v) => v.attributes && typeof v.attributes === "object" && Object.keys(v.attributes).length > 0)
                    .map((v) => ({
                      attributes: Object.fromEntries(
                        Object.entries(v.attributes).map(([k, val]) => [
                          k.trim().toLowerCase(),
                          String(val).trim(),
                        ])
                      ),
                      selling_price: v.selling_price ? parseFloat(v.selling_price) : null,
                    }))
                : [],
            }));
        }
      } catch { /* GPT fallback failed */ }
    }

    // Deduplicate by name
    const seen = new Set();
    const unique = products.filter((p) => {
      const key = p.name.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (unique.length === 0) {
      return res.json({ products: [], message: "No products found on this page. Try linking directly to a product listing or product detail page." });
    }

    return res.json({ products: unique });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

function getOrderDeliveryFromText(text) {
  const lowerText = String(text || "").toLowerCase();
  // Keep in sync with determineDeliveryCharge() in src/pages/OrderExtraction.tsx
  const dhakaKws = ["dhaka", "dhanmondi", "gulshan", "banani", "mirpur", "mohammadpur",
    "uttara", "badda", "khilgaon", "motijheel", "paltan", "farmgate",
    "shahbagh", "new market", "azampur", "kurmitola", "tejgaon"];
  const isInsideDhaka = dhakaKws.some((k) => lowerText.includes(k));
  return {
    delivery_charge: isInsideDhaka ? 80 : 120,
    location_type: isInsideDhaka ? "inside_dhaka" : "outside_dhaka",
  };
}

function extractOrderWithRegex(text) {
  // Regex fallback works without OpenAI. Patterns are tuned for BD social commerce messages.
  const phoneMatch = text.match(/(?:\+?880|0)?(1[3-9]\d{8})/);
  const rawPhone = phoneMatch ? phoneMatch[1] : "";
  const phone = rawPhone ? "0" + rawPhone : "";

  const nameMatch = text.match(/(?:name|নাম)\s*[:\-]\s*([^\n,।]+)/i);
  const addrMatch = text.match(/(?:address|ঠিকানা|delivery\s*address|location)\s*[:\-]\s*([^\n।]+)/i);
  const productMatch = text.match(/(?:product|item|order|পণ্য)\s*[:\-]\s*([^\n,।]+)/i);
  const qtyMatch = text.match(/(\d+)\s*(?:pcs?|pieces?|টি|টা|nos?\.?)/i);
  const priceMatch = text.match(/(?:৳|BDT|Tk\.?)\s*([\d,]+)/i);
  const delivery = getOrderDeliveryFromText(text);

  return {
    customer_name: nameMatch ? nameMatch[1].trim() : "Unknown",
    phone,
    address: addrMatch ? addrMatch[1].trim() : "",
    product: productMatch ? productMatch[1].trim() : "",
    quantity: qtyMatch ? parseInt(qtyMatch[1], 10) : 1,
    price: priceMatch ? parseFloat(priceMatch[1].replace(/,/g, "")) : 0,
    delivery_charge: delivery.delivery_charge,
    location_type: delivery.location_type,
  };
}

function cleanOrderString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanOrderNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/[^\d.]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function sanitizeExtractedOrder(aiOrder, fallbackOrder, text) {
  const address = cleanOrderString(aiOrder?.address) || fallbackOrder.address;
  const delivery = getOrderDeliveryFromText(`${address}\n${text}`);
  const phone = normalizeBdPhone(cleanOrderString(aiOrder?.phone)) || fallbackOrder.phone;
  const locationType = aiOrder?.location_type === "inside_dhaka" || aiOrder?.location_type === "outside_dhaka"
    ? aiOrder.location_type
    : delivery.location_type;

  return {
    customer_name: cleanOrderString(aiOrder?.customer_name) || fallbackOrder.customer_name || "Unknown",
    phone,
    address,
    product: cleanOrderString(aiOrder?.product) || fallbackOrder.product,
    quantity: Math.max(1, Math.round(cleanOrderNumber(aiOrder?.quantity, fallbackOrder.quantity || 1))),
    price: Math.max(0, cleanOrderNumber(aiOrder?.price, fallbackOrder.price || 0)),
    delivery_charge: Math.max(0, cleanOrderNumber(aiOrder?.delivery_charge, delivery.delivery_charge)),
    location_type: locationType,
  };
}

async function extractOrderWithAI(text, fallbackOrder, model) {
  if (!process.env.OPENAI_API_KEY) return null;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 400,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You extract Bangladeshi social-commerce order details from Bangla, English, or mixed messages.
Return ONLY valid JSON with these exact keys:
customer_name, phone, address, product, quantity, price, delivery_charge, location_type.
Rules:
- phone must be a Bangladesh mobile number normalized to 01XXXXXXXXX when present.
- quantity must be a number. If the message clearly orders a product but quantity is missing, use 1.
- price must be the order subtotal or unit price stated in the message. If not stated, use 0.
- location_type must be inside_dhaka or outside_dhaka.
- delivery_charge should be 80 for inside Dhaka and 120 outside Dhaka unless the message explicitly states another delivery charge.
- Do not invent missing customer, product, phone, or address details. Use empty string when unknown.`,
        },
        {
          role: "user",
          content: `Order text:\n${text.slice(0, 4000)}\n\nRegex fallback guess:\n${JSON.stringify(fallbackOrder)}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(parseOpenAIError(response.status, body));
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || "{}";
  const parsed = JSON.parse(raw.replace(/^```json\n?|```$/g, "").trim());
  return sanitizeExtractedOrder(parsed, fallbackOrder, text);
}

function getOrderExtractionWarnings(extractedOrder) {
  const warnings = [];
  if (!extractedOrder.phone) warnings.push("Phone number not found in order text");
  if (!extractedOrder.product) warnings.push("Product not found in order text");
  if (extractedOrder.price === 0) warnings.push("Price not found in order text — defaulted to 0");
  return warnings;
}

app.post("/api/extract-order-from-text", rateLimitAI, async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    incrementUsage(orgId, "ai_extractions").catch(() => {});

    const { orderText } = req.body;
    if (!orderText || typeof orderText !== "string" || !orderText.trim()) {
      return res.status(400).json({ error: "orderText is required" });
    }

    const text = orderText.trim();
    const regexOrder = extractOrderWithRegex(text);
    let extractedOrder = regexOrder;
    let source = "regex_fallback";

    try {
      const aiOrder = await extractOrderWithAI(text, regexOrder, process.env.ORDER_EXTRACTION_MODEL || "gpt-4o-mini");
      if (aiOrder) {
        extractedOrder = aiOrder;
        source = "ai";
      }
    } catch (err) {
      console.warn("[OrderExtraction] AI extraction failed, using regex fallback:", errorMessage(err));
    }

    return res.json({ extractedOrder, warnings: getOrderExtractionWarnings(extractedOrder), source });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.patch("/api/products/:id", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const allowed = ["name", "url", "image_url", "selling_price", "cog", "published", "slug", "description", "compare_at_price"];
    const update = {};
    for (const k of allowed) { if (req.body[k] !== undefined) update[k] = req.body[k]; }
    const hasStockUpdate = req.body.stock_quantity !== undefined;
    if (!Object.keys(update).length && !hasStockUpdate) return res.status(400).json({ error: "Nothing to update" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    if (update.published === true) {
      const { data: current, error: currentError } = await supabase
        .from("products")
        .select("id, name, slug")
        .eq("id", req.params.id)
        .eq("org_id", orgId)
        .single();
      if (currentError) throw currentError;
      update.slug = await getUniqueProductSlug(supabase, orgId, req.params.id, update.slug || current.slug, update.name || current.name);
      update.published_at = new Date().toISOString();
    } else if (update.published === false) {
      update.published_at = null;
    } else if (update.slug !== undefined) {
      update.slug = await getUniqueProductSlug(supabase, orgId, req.params.id, update.slug, update.name);
    }
    let data = null;
    if (Object.keys(update).length) {
      const result = await supabase
        .from("products")
        .update(update)
        .eq("id", req.params.id)
        .eq("org_id", orgId)
        .select()
        .single();
      if (result.error) throw result.error;
      data = result.data;
    } else {
      const result = await supabase.from("products").select("*").eq("id", req.params.id).eq("org_id", orgId).single();
      if (result.error) throw result.error;
      data = result.data;
    }
    if (hasStockUpdate) await saveProductStock(orgId, req.params.id, req.body.stock_quantity);
    data = { ...data, stock_quantity: hasStockUpdate ? Math.max(0, parseInt(req.body.stock_quantity, 10) || 0) : 0 };

    // Edge purge: skip if only stock_quantity changed (5s inventory TTL
    // self-heals). Purge when the published state flips or the product
    // is already published (any catalog field edit must go live).
    const changedFields = Object.keys(update);
    const onlyStockChanged = hasStockUpdate && changedFields.length === 0;
    const isUnpublishing = update.published === false;
    if (!onlyStockChanged && (data.published || isUnpublishing)) {
      const isPublishing = update.published === true;
      const listChanged = isPublishing || isUnpublishing;
      purgeProductCache(orgId, req.params.id, {
        listChanged,
        warm: !isUnpublishing,
      }).catch(() => {});
    }

    // Regenerate embedding if image_url changed
    if (update.image_url && data.image_url) {
      generateProductEmbedding(data.image_url).then(({ embedding, description }) => {
        if (embedding) {
          const vectorStr = `[${embedding.join(",")}]`;
          supabase.from("products").update({ image_embedding: vectorStr, image_description: description })
            .eq("id", data.id).eq("org_id", orgId).then(() => {});
        }
      }).catch(() => {});
    }

    return res.json({ success: true, product: data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.delete("/api/products/:id", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const { data: images } = await supabase
      .from("product_images")
      .select("storage_path")
      .eq("product_id", req.params.id)
      .eq("org_id", orgId);
    const { error } = await supabase.from("products").delete().eq("id", req.params.id).eq("org_id", orgId);
    if (error) throw error;
    // List changed + detail stale: purge with warm:false (warming an
    // unpublished 404 would pollute the edge with a negative entry).
    purgeProductCache(orgId, req.params.id, { listChanged: true, warm: false }).catch(() => {});
    const paths = (images || []).map((image) => image.storage_path).filter(Boolean);
    if (paths.length) {
      await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove(paths);
    }
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Publishes every unpublished product for the org in one shot (Dashboard
// "Publish All" button). Single list purge — detail warms happen on
// first real visitor (60s catalog TTL).
app.post("/api/products/publish-all", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    const { data, error } = await supabase
      .from("products")
      .update({ published: true, published_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("published", false)
      .select("id");
    if (error) throw error;

    purgeProductCache(orgId, null, { listChanged: true, warm: true }).catch(() => {});

    return res.json({ success: true, published: (data || []).length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/products/:id/images", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const productId = req.params.id;
    const { files } = req.body || {};
    if (!Array.isArray(files) || files.length === 0) return res.status(400).json({ error: "files array required" });

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name")
      .eq("id", productId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) return res.status(404).json({ error: "Product not found" });

    const { count, error: countError } = await supabase
      .from("product_images")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId)
      .eq("org_id", orgId);
    if (countError) throw countError;
    const currentCount = count || 0;
    if (currentCount + files.length > PRODUCT_IMAGE_MAX_COUNT) {
      return res.status(400).json({ error: `A product can have up to ${PRODUCT_IMAGE_MAX_COUNT} images` });
    }

    await ensureProductImagesBucket(supabase);
    const inserted = [];
    for (let i = 0; i < files.length; i++) {
      const { buffer, mimeType } = parseProductImagePayload(files[i]);
      const ext = productImageExtension(mimeType);
      const storagePath = `${orgId}/${productId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
      if (uploadError) throw uploadError;
      const { data: publicData } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(storagePath);
      const imageUrl = publicData.publicUrl;
      const isPrimary = currentCount === 0 && i === 0;
      const { data: image, error: insertError } = await supabase
        .from("product_images")
        .insert({
          org_id: orgId,
          product_id: productId,
          image_url: imageUrl,
          storage_path: storagePath,
          alt_text: files[i]?.alt_text || product.name,
          sort_order: currentCount + i,
          is_primary: isPrimary,
        })
        .select("id, product_id, image_url, alt_text, sort_order, is_primary, created_at")
        .single();
      if (insertError) {
        await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([storagePath]);
        throw insertError;
      }
      inserted.push({ ...image, url: image.image_url });
    }

    if (inserted[0] && inserted[0].is_primary) {
      await supabase
        .from("products")
        .update({ image_url: inserted[0].image_url })
        .eq("id", productId)
        .eq("org_id", orgId);
      generateProductEmbedding(inserted[0].image_url).then(({ embedding, description }) => {
        if (!embedding) return;
        const vectorStr = `[${embedding.join(",")}]`;
        supabase.from("products").update({ image_embedding: vectorStr, image_description: description })
          .eq("id", productId).eq("org_id", orgId).then(() => {});
      }).catch(() => {});
    }

    return res.json({ images: inserted });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message });
  }
});

app.patch("/api/products/:id/images/reorder", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const productId = req.params.id;
    const imageIds = Array.isArray(req.body?.imageIds) ? req.body.imageIds.map(String) : [];
    if (!imageIds.length) return res.status(400).json({ error: "imageIds array required" });

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) return res.status(404).json({ error: "Product not found" });

    const { data: existing, error: existingError } = await supabase
      .from("product_images")
      .select("id, image_url")
      .eq("product_id", productId)
      .eq("org_id", orgId);
    if (existingError) throw existingError;
    const existingIds = new Set((existing || []).map((image) => image.id));
    const requestedIds = new Set(imageIds);
    if (imageIds.length !== existingIds.size || requestedIds.size !== existingIds.size || imageIds.some((id) => !existingIds.has(id))) {
      return res.status(400).json({ error: "imageIds must include every image for this product" });
    }

    for (const [index, imageId] of imageIds.entries()) {
      const { error } = await supabase
        .from("product_images")
        .update({ sort_order: index, is_primary: index === 0 })
        .eq("id", imageId)
        .eq("product_id", productId)
        .eq("org_id", orgId);
      if (error) throw error;
    }

    const primary = (existing || []).find((image) => image.id === imageIds[0]);
    if (primary) {
      await supabase.from("products").update({ image_url: primary.image_url }).eq("id", productId).eq("org_id", orgId);
    }
    const imagesMap = await loadProductImagesMap(supabase, orgId, [productId]);
    return res.json({ images: imagesMap[productId] || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.delete("/api/products/:id/images/:imageId", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const productId = req.params.id;
    const { data: image, error: imageError } = await supabase
      .from("product_images")
      .select("id, storage_path, is_primary")
      .eq("id", req.params.imageId)
      .eq("product_id", productId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (imageError) throw imageError;
    if (!image) return res.status(404).json({ error: "Image not found" });

    const { error: deleteError } = await supabase
      .from("product_images")
      .delete()
      .eq("id", req.params.imageId)
      .eq("product_id", productId)
      .eq("org_id", orgId);
    if (deleteError) throw deleteError;
    if (image.storage_path) {
      await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([image.storage_path]);
    }

    if (image.is_primary) {
      const { data: remaining } = await supabase
        .from("product_images")
        .select("id, image_url")
        .eq("product_id", productId)
        .eq("org_id", orgId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(1);
      const nextPrimary = remaining?.[0];
      if (nextPrimary) {
        await supabase.from("product_images").update({ is_primary: true }).eq("id", nextPrimary.id).eq("org_id", orgId);
        await supabase.from("products").update({ image_url: nextPrimary.image_url }).eq("id", productId).eq("org_id", orgId);
      } else {
        await supabase.from("products").update({ image_url: null }).eq("id", productId).eq("org_id", orgId);
      }
    }

    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/products/regenerate-embeddings", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId, role } = await getUserOrg(supabase, user.id);
    if (role !== "admin") return res.status(403).json({ error: "Admin only" });

    const { data: prods, error } = await supabase
      .from("products")
      .select("id, image_url")
      .eq("org_id", orgId)
      .not("image_url", "is", null);

    if (error) throw error;
    if (!prods?.length) return res.json({ message: "No products with images found", processed: 0 });

    res.json({ message: `Regenerating embeddings for ${prods.length} products. This runs in the background.`, total: prods.length });

    let count = 0;
    for (const product of prods) {
      try {
        const { embedding, description } = await generateProductEmbedding(product.image_url);
        if (embedding) {
          const vectorStr = `[${embedding.join(",")}]`;
          await supabase.from("products").update({ image_embedding: vectorStr, image_description: description }).eq("id", product.id).eq("org_id", orgId);
          count++;
        }
        await new Promise((r) => setTimeout(r, 350));
      } catch {}
    }
    console.log(`[Embedding Regen] Done: ${count}/${prods.length} for org ${orgId}`);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── Product Variants ─────────────────────────────────────────────────────────

// GET /api/products/:id/variants
app.get("/api/products/:id/variants", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const { data, error } = await supabase
      .from("product_variants")
      .select("*")
      .eq("product_id", req.params.id)
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return res.json({ variants: data || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/products/:id/variants — add a new variant (universal attributes)
app.post("/api/products/:id/variants", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const { attributes, cog, stock_quantity, price_adjustment } = req.body;
    if (!attributes || typeof attributes !== "object" || Object.keys(attributes).length === 0) {
      return res.status(400).json({ error: "attributes object with at least one key required" });
    }
    // Sanitise: all attribute values must be strings
    const sanitised = Object.fromEntries(
      Object.entries(attributes).map(([k, v]) => [k.trim().toLowerCase(), String(v).trim()])
    );
    const { data, error } = await supabase
      .from("product_variants")
      .insert({
        product_id: req.params.id,
        org_id: orgId,
        attributes: sanitised,
        cog: parseFloat(cog) || 0,
        stock_quantity: Math.max(0, parseInt(stock_quantity, 10) || 0),
        price_adjustment: parseFloat(price_adjustment) || 0,
      })
      .select()
      .single();
    if (error) throw error;
    return res.json({ variant: data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// PATCH /api/products/:id/variants/:variantId — update attributes / cog / stock / price_adjustment
app.patch("/api/products/:id/variants/:variantId", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const patch = {};
    if (req.body.attributes !== undefined) {
      if (typeof req.body.attributes !== "object" || Object.keys(req.body.attributes).length === 0) {
        return res.status(400).json({ error: "attributes must be a non-empty object" });
      }
      patch.attributes = Object.fromEntries(
        Object.entries(req.body.attributes).map(([k, v]) => [k.trim().toLowerCase(), String(v).trim()])
      );
    }
    if (req.body.cog !== undefined) patch.cog = parseFloat(req.body.cog) || 0;
    if (req.body.stock_quantity !== undefined) patch.stock_quantity = Math.max(0, parseInt(req.body.stock_quantity, 10) || 0);
    if (req.body.price_adjustment !== undefined) patch.price_adjustment = parseFloat(req.body.price_adjustment) || 0;
    const { data, error } = await supabase
      .from("product_variants")
      .update(patch)
      .eq("id", req.params.variantId)
      .eq("product_id", req.params.id)
      .eq("org_id", orgId)
      .select()
      .single();
    if (error) throw error;
    return res.json({ variant: data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// DELETE /api/products/:id/variants/:variantId
app.delete("/api/products/:id/variants/:variantId", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const { error } = await supabase
      .from("product_variants")
      .delete()
      .eq("id", req.params.variantId)
      .eq("product_id", req.params.id)
      .eq("org_id", orgId);
    if (error) throw error;
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// DB schema SQL — restricted to admin users only
app.get("/api/db-setup-sql", async (req, res) => {
  const { user } = await getUser(getToken(req)).catch(() => ({ user: null }));
  if (!user) return res.status(401).send("Unauthorized");
  const supabase = getServiceSupabase();
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleRow?.role !== "admin") return res.status(403).send("Forbidden");
  res.type("text/plain").send(SETUP_SQL);
});

// Run DB setup via Supabase Management API
app.post("/api/db-setup", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req)).catch(() => ({ user: null }));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    if (roleRow?.role !== "admin") return res.status(403).json({ error: "Forbidden — admin only" });

    const supabaseUrl = process.env.SUPABASE_URL || "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (!projectRef || !serviceKey) {
      return res.status(500).json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });
    }

    const resp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: SETUP_SQL }),
    });

    if (resp.ok) {
      return res.json({ success: true, message: "Database tables created successfully" });
    }

    const errBody = await resp.text();
    return res.status(resp.status).json({
      error: "Management API call failed",
      detail: errBody,
      sqlEndpoint: `/api/db-setup-sql`,
      instruction: "Please copy the SQL from /api/db-setup-sql and run it in your Supabase SQL Editor at https://supabase.com/dashboard",
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

async function migrateInboxOrdersTable() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (!projectRef || !serviceKey) return;

    const migrationSql = `
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS sent_to_courier BOOLEAN DEFAULT FALSE;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS consignment_id TEXT;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS tracking_code TEXT;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS courier_status TEXT;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS courier_message TEXT;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS fraud_checked BOOLEAN DEFAULT FALSE;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS fraud_data JSONB;
ALTER TABLE public.social_inbox_orders ADD COLUMN IF NOT EXISTS delivery_rate NUMERIC;
ALTER TABLE public.social_conversations ADD COLUMN IF NOT EXISTS order_fields JSONB DEFAULT '{}';
ALTER TABLE public.social_conversations ADD COLUMN IF NOT EXISTS paused_ai BOOLEAN DEFAULT false;
ALTER TABLE public.social_conversations ADD COLUMN IF NOT EXISTS ai_summary TEXT DEFAULT '';
    `;

    await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ query: migrationSql }),
    });
    console.log("[Migrate] social_inbox_orders columns ensured.");
  } catch (e) {
    console.warn("[Migrate] Could not run inbox orders migration:", e.message);
  }
}

async function migrateProductsForecastColumns() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (!projectRef || !serviceKey) return;

    const migrationSql = `
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC;
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS products_org_slug_unique_idx
    ON public.products(org_id, slug)
    WHERE slug IS NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
NOTIFY pgrst, 'reload schema';
    `;

    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ query: migrationSql }),
    });
    if (!response.ok) {
      const text = await response.text();
      console.warn("[Migrate] products forecast columns failed:", text);
      return;
    }
    console.log("[Migrate] products forecast columns ensured.");
  } catch (e) {
    console.warn("[Migrate] Could not run products forecast migration:", e.message);
  }
}

// ─── Storefront Settings Migration ────────────────────────────────────────────
// Creates the storefront_settings table for merchant branding, shipping zones,
// and storefront configuration. One row per org (org_id is UNIQUE).
async function migrateStorefrontSettingsTable() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (!projectRef || !serviceKey) return;

    const migrationSql = `
CREATE TABLE IF NOT EXISTS public.storefront_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  store_name TEXT,
  tagline TEXT,
  logo_url TEXT,
  favicon_url TEXT,
  primary_color TEXT DEFAULT '#000000',
  background_color TEXT DEFAULT '#FAFAF8',
  font_family TEXT DEFAULT 'Geist Sans',
  contact_phone TEXT,
  contact_email TEXT,
  social_facebook TEXT,
  social_instagram TEXT,
  social_tiktok TEXT,
  seo_title_template TEXT DEFAULT '{product_name} | {store_name}',
  seo_description_template TEXT DEFAULT '{product_description}',
  shipping_zones JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS storefront_settings_org_id_idx
    ON public.storefront_settings(org_id);
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Ensure orders table has source column for storefront orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source TEXT;

NOTIFY pgrst, 'reload schema';
    `;

    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ query: migrationSql }),
    });
    if (!response.ok) {
      const text = await response.text();
      console.warn("[Migrate] storefront_settings failed:", text);
      return;
    }
    console.log("[Migrate] storefront_settings table ensured.");
  } catch (e) {
    console.warn("[Migrate] Could not run storefront settings migration:", e.message);
  }
}

async function ensureAppSettingsTable() {
  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase.from("user_roles").select("user_id").limit(1);
    if (error && error.code === "PGRST205") {
      console.warn(
        "\n[Setup] Required database tables are missing.\n" +
        "Please run the setup SQL in your Supabase SQL Editor:\n" +
        "  1. Go to https://supabase.com/dashboard\n" +
        "  2. Open your project → SQL Editor\n" +
        "  3. Visit /api/db-setup-sql on this server to get the SQL\n" +
        "  4. Paste and run it\n"
      );
    }
  } catch (e) {
    console.warn("[Setup] Could not verify database tables:", e.message);
  }
}

// ─── Start Server ────────────────────────────────────────────────────────────

if (!process.env.VERCEL) {
  if (!isDev) {
    const distPath = join(__dirname, "../dist");
    app.use(express.static(distPath));
    app.use((req, res) => {
      res.sendFile(join(distPath, "index.html"));
    });
  }
}

// Fetches all products from the products table (despite the name, this is NOT app_settings).
// Named for historical reasons — used by bootstrapAiProductContext.
async function getProductsFromSettings() {
  try {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("products")
      .select("id, name, selling_price, cog")
      .order("created_at", { ascending: false });
    return data || [];
  } catch {
    return [];
  }
}

async function rebuildAiProductContext(products) {
  if (!products.length) return;
  try {
    const supabase = getServiceSupabase();
    const context = products
      .map((p) => `${p.name} — ৳${p.selling_price ?? "?"}`)
      .join("\n");
    await supabase
      .from("app_settings")
      .upsert({ key: "ai_product_context", value: context, updated_at: new Date().toISOString() }, { onConflict: "key" });
  } catch (e) {
    console.warn("[AI Training] rebuildAiProductContext failed:", e.message);
  }
}

async function bootstrapAiProductContext() {
  try {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "ai_product_context")
      .single();
    const products = await getProductsFromSettings();
    if (!data?.value && products.length > 0) {
      console.log(`[AI Training] No context found — bootstrapping from ${products.length} existing products...`);
      await rebuildAiProductContext(products);
    } else if (products.length > 0) {
      console.log(`[AI Training] Context exists for ${products.length} products — refreshing on startup...`);
      await rebuildAiProductContext(products);
    } else {
      console.log("[AI Training] No products yet — skipping bootstrap.");
    }
  } catch (err) {
    console.error("[AI Training] Bootstrap error:", err.message);
  }
}

async function backfillProductEmbeddings() {
  if (!process.env.OPENAI_API_KEY) return;
  const supabase = getServiceSupabase();

  const { data: products, error } = await supabase
    .from("products")
    .select("id, image_url, org_id")
    .not("image_url", "is", null)
    .is("image_embedding", null)
    .limit(50);

  if (error || !products?.length) {
    if (!error && products?.length === 0) console.log("[Embedding Backfill] All products have embeddings.");
    return;
  }

  console.log(`[Embedding Backfill] Processing ${products.length} products without embeddings...`);
  let count = 0;

  for (const product of products) {
    try {
      const { embedding, description } = await generateProductEmbedding(product.image_url);
      if (embedding) {
        const vectorStr = `[${embedding.join(",")}]`;
        await supabase.from("products").update({ image_embedding: vectorStr, image_description: description }).eq("id", product.id);
        count++;
      }
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      console.warn(`[Embedding Backfill] Failed for ${product.id}:`, err.message);
    }
  }

  console.log(`[Embedding Backfill] Generated ${count}/${products.length} embeddings.`);
}

// ── Direct Postgres client (bypasses PostgREST entirely) ─────────────────────
// Prefer a Supabase pooler/full connection string in hosted environments. The
// direct db.<project>.supabase.co host can resolve to IPv6, which Railway may
// not be able to reach.
function getPgPool() {
  const connectionString =
    process.env.SUPABASE_DB_URL ||
    process.env.SUPABASE_POOLER_URL ||
    process.env.SUPABASE_DB_POOLER_URL ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL;
  if (connectionString) {
    return new Pool({
      connectionString,
      ssl: connectionString.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 8000,
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL || "";
  const dbPassword = process.env.SUPABASE_DB_PASSWORD || "";
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!projectRef || !dbPassword) return null;
  const poolerHost = process.env.SUPABASE_POOLER_HOST || process.env.SUPABASE_DB_POOLER_HOST;
  if (poolerHost) {
    return new Pool({
      host: poolerHost,
      port: Number(process.env.SUPABASE_POOLER_PORT || process.env.SUPABASE_DB_POOLER_PORT || 6543),
      database: process.env.SUPABASE_DB_NAME || "postgres",
      user: process.env.SUPABASE_DB_USER || `postgres.${projectRef}`,
      password: dbPassword,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 8000,
    });
  }

  return new Pool({
    host: `db.${projectRef}.supabase.co`,
    port: 5432,
    database: "postgres",
    user: "postgres",
    password: dbPassword,
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 8000,
  });
}

async function runSQL(sql, values) {
  const pool = getPgPool();
  if (!pool) {
    console.warn("[SQL] No DB credentials — skipping raw SQL.");
    return;
  }
  let client;
  try {
    client = await pool.connect();
    await client.query(sql, values);
  } catch (e) {
    console.warn("[SQL] runSQL failed:", e.message, "| SQL:", sql.slice(0, 120));
  } finally {
    if (client) client.release();
    await pool.end().catch(() => {});
  }
}

// Raw SQL is not available through normal Supabase PostgREST projects. Keep this
// fallback only for deployments that have explicitly exposed a compatible SQL RPC.
async function runSQLViaREST(sql) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { success: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" };
  }
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/sql`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "Authorization": `Bearer ${serviceKey}`,
        "apikey": serviceKey,
      },
      body: sql,
    });
    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: text };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function migrateMultiTenancy() {
  const pool = getPgPool();
  if (!pool) {
    console.warn(
      "[Migrate] No Postgres connection configured. Set SUPABASE_DB_URL to the Supabase pooler connection string in Railway."
    );
    const result = await runSQLViaREST(MULTI_TENANCY_SQL);
    if (result.success) {
      console.log("[Migrate] Multi-tenancy migration via REST SQL succeeded.");
    } else {
      console.warn("[Migrate] REST SQL fallback also failed:", result.error);
    }
    return;
  }
  let client;
  try {
    client = await pool.connect();
    await client.query(MULTI_TENANCY_SQL);
    // Reload PostgREST schema cache so it recognises the new org_id columns
    await client.query("NOTIFY pgrst, 'reload schema'");
    console.log("[Migrate] Multi-tenancy org_id columns ensured + schema reloaded.");
    return;
  } catch (e) {
    console.warn(
      "[Migrate] Postgres migration failed:",
      e.message,
      "— if this mentions ENETUNREACH/IPv6, set SUPABASE_DB_URL to the Supabase pooler connection string."
    );
  } finally {
    if (client) client.release();
    await pool.end().catch(() => {});
  }
  // Direct Postgres failed — fall back to the PostgREST /rest/v1/sql endpoint.
  const result = await runSQLViaREST(MULTI_TENANCY_SQL);
  if (result.success) {
    console.log("[Migrate] Multi-tenancy migration via REST SQL succeeded.");
  } else {
    console.warn("[Migrate] REST SQL fallback also failed:", result.error);
  }
}

if (!process.env.VERCEL) {
  import("http").then(({ createServer }) => {
    const httpServer = createServer(app);

    const startServer = async () => {
      if (isDev) {
        const { createServer: createViteServer } = await import("vite");
        const vite = await createViteServer({
          server: { middlewareMode: true, hmr: { server: httpServer } },
          appType: "spa",
        });
        app.use(vite.middlewares);
      }

      httpServer.listen(PORT, "0.0.0.0", async () => {
        console.log(`Server running on port ${PORT}`);
        await ensureAppSettingsTable();
        await migrateInboxOrdersTable();
        await migrateMultiTenancy();
        await migrateStorefrontSettingsTable();
        await bootstrapAiProductContext();
        backfillProductEmbeddings().catch((err) => console.warn("[Embedding Backfill] Error:", err.message));
      });
    };

    startServer().catch(console.error);
  });
} else {
  // Serverless cold-start: run DB init without a TCP listener.
  // migrateMultiTenancy now creates ALL social tables (conversations, messages,
  // inbox_orders) plus adds org_id columns, so it must run on every cold-start.
  ensureAppSettingsTable().catch(() => {});
  migrateMultiTenancy().catch(() => {});
  migrateInboxOrdersTable().catch(() => {});
  migrateStorefrontSettingsTable().catch(() => {});
}

export default app;
