import "dotenv/config";
import express from "express";
import cors from "cors";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFile } from "fs/promises";
import pg from "pg";
const { Pool } = pg;

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
app.use(cors({ origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : true }));

// Parse JSON and simultaneously capture raw body buffer for webhook HMAC verification.
// Using the verify callback avoids consuming the stream twice.
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));

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

  try {
    const response = await fetch("https://fraudshield.bd/api/customer/check", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ phone: cleanedPhone }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
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
  });
});

// ─── Auth Registration Endpoint ──────────────────────────────────────────────

// Register a new user and automatically assign them the admin role
app.post("/api/auth/register", async (req, res) => {
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

async function saveOrgSettings(orgId, settings) {
  const scopedSettings = {};
  for (const [key, value] of Object.entries(settings)) {
    scopedSettings[orgSettingKey(orgId, key)] = value;
  }
  return saveSettings(scopedSettings);
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
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", process.env.META_APP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "meta-state")
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyMetaState(state) {
  const [encoded, signature] = String(state || "").split(".");
  if (!encoded || !signature) throw new Error("Invalid OAuth state");
  const expected = crypto
    .createHmac("sha256", process.env.META_APP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "meta-state")
    .update(encoded)
    .digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Invalid OAuth state signature");
  }
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  if (!payload.ts || Date.now() - payload.ts > 10 * 60 * 1000) {
    throw new Error("OAuth state expired");
  }
  return payload;
}

function metaRedirectUri() {
  return process.env.META_REDIRECT_URI || "https://suite.arclabtechnology.com/api/meta/oauth/callback";
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
    const { data, error } = await supabase.from("app_settings").select("key, value").order("key");
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

// Test FraudShield connection server-side
app.post("/api/settings/test-fraudshield", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const cfg = await getOrgSettings(orgId, ["fraudshield_api_key"]);
    const apiKey = cfg["fraudshield_api_key"];
    if (!apiKey) return res.status(400).json({ error: "FraudShield API key not configured" });
    return res.json({ success: true, message: "API key configured" });
  } catch (err) {
    return res.status(500).json({ error: "An internal error occurred" });
  }
});

// ─── Meta Business OAuth + Asset Sync ───────────────────────────────────────

async function exchangeMetaCodeForToken(code) {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) throw new Error("Missing META_APP_ID or META_APP_SECRET env vars");

  const shortLived = await metaGraph("/oauth/access_token", {
    params: {
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: metaRedirectUri(),
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
        ],
      },
    });
    return { subscribed: true, error: null };
  } catch (err) {
    console.warn(`[Meta] Failed to subscribe page ${pageId}:`, errorMessage(err));
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

  await saveOrgSettings(orgId, {
    ai_auto_reply_enabled: "true",
    auto_reply_channels: JSON.stringify(["facebook", "instagram", "whatsapp"]),
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
    const { orgId, userId } = verifyMetaState(req.query.state);
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

    // price = total_price from Shopify (subtotal + shipping − discounts) = what the customer pays.
    // delivery_rate = shipping component (kept separately for the Shipping card display).
    // Revenue matches Shopify "Total Sales" exactly.
    let revenue = 0;
    let shipping = 0;
    for (const o of orders || []) {
      const orderRevenue = parseFloat(o.price || 0);
      const orderShipping = parseFloat(o.delivery_rate || 0);
      revenue += orderRevenue;
      shipping += orderShipping;
      const parts = dhakaParts(o.created_at);
      const bucket = seriesByKey.get(singleDaySeries ? `${parts.ymd}-${parts.hour}` : parts.ymd);
      if (bucket) {
        bucket.revenue += orderRevenue;
        bucket.shipping += orderShipping;
      }
    }

    // Fetch Meta/Facebook ad spend. Prefer OAuth-connected Meta ad accounts,
    // but keep legacy manual Facebook Ads settings as fallback.
    let adSpend = null;
    let fbError = null;
    const cfg = await getOrgSettings(orgId, ["facebook_access_token", "facebook_ad_account_id", "usd_to_bdt_rate"]);
    let fbToken = cfg["facebook_access_token"];
    let fbAccountId = cfg["facebook_ad_account_id"];
    if (!fbToken || !fbAccountId) {
      try {
        const { data: connection } = await supabase
          .from("meta_connections")
          .select("encrypted_user_access_token")
          .eq("org_id", orgId)
          .maybeSingle();
        const { data: adAccount } = await supabase
          .from("meta_ad_accounts")
          .select("ad_account_id")
          .eq("org_id", orgId)
          .limit(1)
          .maybeSingle();
        if (connection?.encrypted_user_access_token && adAccount?.ad_account_id) {
          fbToken = decryptToken(connection.encrypted_user_access_token);
          fbAccountId = adAccount.ad_account_id;
        }
      } catch (err) {
        console.warn("[Meta Analytics] OAuth ad account fallback unavailable:", errorMessage(err));
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

        adSpend = parseFloat((totalSpendUsd * usdToBdt).toFixed(2));
        if (singleDaySeries) {
          const dailySpend = parseFloat(((spendByDayUsd.get(seriesStart) || totalSpendUsd) * usdToBdt).toFixed(2));
          for (const bucket of seriesBuckets) bucket.adSpend = dailySpend;
        } else {
          for (const bucket of seriesBuckets) {
            bucket.adSpend = parseFloat(((spendByDayUsd.get(bucket.key) || 0) * usdToBdt).toFixed(2));
          }
        }
        console.log(`[FB Analytics] total USD spend: ${totalSpendUsd}, rate: ${usdToBdt}, BDT: ${adSpend}`);
      } catch (e) {
        fbError = e.message || "Failed to reach Facebook API";
      }
    }

    // Estimate COGS from the products catalog stored in app_settings.
    // Only use products that have BOTH selling_price > 0 AND cog > 0.
    // We compute the weighted COG ratio across those qualifying products and
    // scale it to the period revenue.  We also return coverage metadata so
    // the frontend can show how complete the estimate is.
    let totalCog = 0;
    let cogCoverage = { set: 0, total: 0 };
    try {
      const { data: prods } = await supabase
        .from("products")
        .select("selling_price, cog")
        .eq("org_id", orgId);
      if (prods && prods.length > 0) {
        let sumCog = 0;
        let sumSelling = 0;
        cogCoverage.total = prods.length;
        for (const p of prods) {
          const sp = parseFloat(p.selling_price || 0);
          const cg = parseFloat(p.cog || 0);
          if (cg > 0) cogCoverage.set++;
          if (sp > 0 && cg > 0) {
            sumCog += cg;
            sumSelling += sp;
          }
        }
        if (sumSelling > 0) {
          const cogRatio = sumCog / sumSelling;
          totalCog = revenue * cogRatio;
        }
      }
    } catch { /* ignore – no products yet */ }

    // Net Profit = Revenue − Ad Spend − Shipping − COG
    const shippingCost = parseFloat(shipping.toFixed(2));
    const profit = adSpend !== null
      ? revenue - adSpend - shippingCost - totalCog
      : null;
    const cogRatioForSeries = revenue > 0 ? totalCog / revenue : 0;
    for (const bucket of seriesBuckets) {
      bucket.revenue = parseFloat(bucket.revenue.toFixed(2));
      bucket.shipping = parseFloat(bucket.shipping.toFixed(2));
      bucket.totalCog = parseFloat((bucket.revenue * cogRatioForSeries).toFixed(2));
      bucket.profit = adSpend !== null
        ? parseFloat((bucket.revenue - bucket.shipping - bucket.totalCog - bucket.adSpend).toFixed(2))
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

app.get("/api/business-forecast", async (req, res) => {
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
        .gte("created_at", previousStart.toISOString())
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

const ORDER_CHAT_MODELS = new Set(["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"]);

app.post("/api/order-chat", async (req, res) => {
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

    const productDetails = products.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.selling_price,
      cog: p.cog,
      stock: p.stock_quantity ?? null,
      url: p.url,
    }));

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
- If asked about stock, reference the products data.
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
Product field key: id, name, price=selling_price, cog=cost_of_goods, stock=stock_quantity(null=not tracked), url

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
app.post("/api/studio/generate", async (req, res) => {
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
      .order("order_number", { ascending: false });
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
    if (!row.order_number) row.order_number = `MAN-${Date.now()}`;
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
    const allowed = ["status", "notes", "courier_status", "consignment_id", "tracking_code", "courier_message", "sent_to_courier", "fraud_checked", "fraud_data"];
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

    const invoice = `ORD-${order.order_number || order.id.slice(-8).toUpperCase()}`;
    const payload = {
      invoice,
      recipient_name: order.customer_name || "Customer",
      recipient_phone: cleanedPhone,
      recipient_address: order.address || "No address provided",
      cod_amount: order.price || 0,
      note: order.product ? `${order.quantity || 1}x ${order.product}` : "N/A",
    };

    const sfRes = await fetch("https://portal.packzy.com/api/v1/create_order", {
      method: "POST",
      headers: { "Api-Key": apiKey, "Secret-Key": secretKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const sfData = await sfRes.json();

    if (sfData.status !== 200) {
      await supabase.from("orders").update({ courier_message: sfData.message || "Failed" }).eq("id", orderId).eq("org_id", orgId);
      return res.status(400).json({ error: sfData.message || "Steadfast rejected the order", details: sfData });
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
      amount_to_collect: order.price || 0,
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
    await supabase.from("orders").update({
      sent_to_courier: true,
      consignment_id: consignmentId,
      tracking_code: consignmentId,
      courier_status: "Pending",
      courier_message: "Sent to Pathao successfully",
      courier_name: "pathao",
    }).eq("id", orderId).eq("org_id", orgId);

    const { data: updated } = await supabase.from("orders").select("*").eq("id", orderId).eq("org_id", orgId).single();
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
        if (!statusRes.ok) continue;
        const statusData = await statusRes.json();
        const newStatus = statusData?.delivery_status;
        if (!newStatus) continue;

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

        await supabase.from("orders").update(patch).eq("id", order.id).eq("org_id", orgId);
        updated++;
      } catch { /* skip */ }
    }
    return res.json({ updated, total: activeOrders.length });
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
    const cfg = await getOrgSettings(orgId, ["fraudshield_api_key"]);
    const fraudShieldApiKey = cfg["fraudshield_api_key"];
    if (!fraudShieldApiKey) return res.status(400).json({ error: "FraudShield API key not configured" });

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
    const { data: order, error: fetchError } = await supabase.from("social_inbox_orders").select("*").eq("id", orderId).eq("org_id", orgId).single();
    if (fetchError || !order) return res.status(404).json({ error: "Inbox order not found" });

    const { phone: rawPhone } = parseInboxOrderNotes(order.notes);
    if (!rawPhone) return res.status(400).json({ error: "No phone number found in this order's notes" });

    const cfg = await getOrgSettings(orgId, ["fraudshield_api_key"]);
    const fraudShieldApiKey = cfg["fraudshield_api_key"];
    if (!fraudShieldApiKey) return res.status(400).json({ error: "FraudShield API key not configured" });

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
        contact_name: contactName || conversation.contact_name,
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

async function getMetaReplyProductContext(orgId) {
  try {
    const supabase = getServiceSupabase();
    const { data: products, error } = await supabase
      .from("products")
      .select("id, name, url, image_url, selling_price, cog")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(250);
    if (error) throw error;
    const rows = products || [];
    const stockMap = rows.length ? await getProductStockMap(orgId, rows.map((p) => p.id)) : {};
    return rows.map((p) => ({
      name: p.name,
      price: p.selling_price != null ? Number(p.selling_price) : null,
      stock: stockMap[p.id] ?? 0,
      url: p.url || null,
      image_url: p.image_url || null,
    }));
  } catch (err) {
    console.warn("[Meta Auto Reply] product context unavailable:", errorMessage(err));
    return [];
  }
}

function buildProductVisionContent({ brandDoc, products, customerMessage, imageUrl, conversationHistory = "" }) {
  const catalogForText = products.map((p) => ({
    name: p.name,
    price: p.price,
    available: Number(p.stock || 0) > 0,
    url: p.url,
    image_url: p.image_url,
  }));
  const content = [
    {
      type: "text",
      text:
        `Brand knowledge:\n${brandDoc || "(none)"}\n\n` +
        `PRODUCT CATALOG JSON:\n${JSON.stringify(catalogForText).slice(0, 18000)}\n\n` +
        `RECENT CONVERSATION, oldest to newest:\n${conversationHistory || "(none)"}\n\n` +
        `Customer message:\n${customerMessage || "(customer sent an image only)"}\n\n` +
        "If an image is included, visually match it against the catalog names/images and answer with the matching product price and whether it is available. Use the recent conversation as memory: honor customer corrections like 'not glass cup', keep the currently selected product across follow-ups, and do not switch products unless the customer clearly sends/selects a different product.",
    },
  ];

  if (imageUrl) {
    content.push({ type: "text", text: "CUSTOMER IMAGE:" });
    content.push({ type: "image_url", image_url: { url: imageUrl } });
  }

  const visualProducts = products.filter((p) => p.image_url).slice(0, 16);
  for (const product of visualProducts) {
    content.push({
      type: "text",
      text: `CATALOG IMAGE: ${product.name} | price=${product.price ?? "unknown"} | available=${Number(product.stock || 0) > 0 ? "yes" : "no"}`,
    });
    content.push({ type: "image_url", image_url: { url: product.image_url } });
  }

  return content;
}

async function requestMetaAutoReply({ brandDoc, products, customerMessage, imageUrl, conversationHistory }) {
  const messages = [
    {
      role: "system",
      content:
        "You are a helpful ecommerce support assistant for social DMs. Reply naturally, briefly, and in the customer's language when clear. You have live product catalog data with price, availability, URLs, and product images. Treat RECENT CONVERSATION as memory. If the customer corrects a product match, accept the correction and do not repeat the rejected product. Keep the same selected product across follow-up messages like price, stock, available, order, address, and place order unless the customer clearly changes it. If the customer sends an image and asks price, pp, price?, koto, দাম, or availability in a follow-up, identify the product from the most recent image by comparing it with catalog product names/images, then answer the price and availability immediately. Use ৳ for prices. Never tell customers exact stock counts; only say available or currently unavailable. Do not ask for the customer's name before answering product price/availability questions. If one clear product matches, answer directly. If multiple products match, list the closest 2-4 options with prices and ask which one they mean. If no product matches, say you cannot find that exact product and ask for another photo or exact product name. Only ask for name, phone, address, product, and quantity when the customer is ready to place an order. Do not invent prices, stock, discounts, delivery promises, or policies.",
    },
    {
      role: "user",
      content: buildProductVisionContent({ brandDoc, products, customerMessage, imageUrl, conversationHistory }),
    },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      temperature: 0.2,
      messages,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI ${response.status}: ${body.slice(0, 240)}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

function isPriceIntentMessage(text = "") {
  const value = String(text).trim().toLowerCase();
  if (!value) return false;
  return /(^|\b)(price|pp|৳|tk|taka|dam|দাম|কত|koto|available|availability|stock|ache|আছে)(\b|[?:.!।]|$)/i.test(value);
}

function isOrderIntentMessage(text = "") {
  const value = String(text).trim().toLowerCase();
  if (!value) return false;
  return /(place\s+the\s+order|place\s+order|confirm\s+(the\s+)?order|order\s+(now|confirm|koren|করেন|করুন)|i\s*(would|want|wanna|like).*order|নিতে\s*চাই|অর্ডার|order ta|order kore|order koren)/i.test(value);
}

async function getRecentConversationImage(supabase, conversationId) {
  if (!conversationId) return null;
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("social_messages")
    .select("image_url")
    .eq("conversation_id", conversationId)
    .eq("sender", "user")
    .not("image_url", "is", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[Meta Auto Reply] recent image lookup failed:", errorMessage(error));
    return null;
  }
  return data?.image_url || null;
}

async function getRecentConversationHistory(supabase, conversationId, limit = 14) {
  if (!conversationId) return "";
  const { data, error } = await supabase
    .from("social_messages")
    .select("sender, content, image_url, message_type, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[Meta Auto Reply] conversation history lookup failed:", errorMessage(error));
    return "";
  }
  return (data || [])
    .reverse()
    .map((m) => {
      const who = m.sender === "bot" ? "assistant" : "customer";
      const image = m.image_url ? " [image attached]" : "";
      const body = String(m.content || "").trim() || `[${m.message_type || "message"}]`;
      return `${who}${image}: ${body}`.slice(0, 900);
    })
    .join("\n");
}

function inferDeliveryCharge(address = "") {
  const lowerAddress = String(address || "").toLowerCase();
  const dhakaKeywords = [
    "dhaka", "dhanmondi", "gulshan", "banani", "mirpur", "mohammadpur",
    "uttara", "badda", "khilgaon", "motijheel", "paltan", "farmgate",
    "shahbagh", "new market", "azampur", "kurmitola", "tejgaon",
  ];
  return dhakaKeywords.some((k) => lowerAddress.includes(k)) ? 80 : 120;
}

function parseInboxOrderNotes(notes = "") {
  return {
    phone: String(notes).match(/Phone:\s*([^,\n]+)/i)?.[1]?.trim() || "",
    address: String(notes).match(/Address:\s*([^\n]+)/i)?.[1]?.trim() || "",
  };
}

function parseMetaJsonObject(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function findCatalogProduct(products, productName = "") {
  const wanted = String(productName || "").trim().toLowerCase();
  if (!wanted) return null;
  return products.find((p) => String(p.name || "").trim().toLowerCase() === wanted)
    || products.find((p) => String(p.name || "").toLowerCase().includes(wanted) || wanted.includes(String(p.name || "").toLowerCase()))
    || null;
}

function extractInboxOrderHeuristic({ products, conversationHistory }) {
  const history = String(conversationHistory || "");
  const lowerHistory = history.toLowerCase();
  const phoneMatch = history.match(/(?:\+?880|0)?(1[3-9]\d{8})/);
  const phone = phoneMatch ? `0${phoneMatch[1]}` : "";
  if (!phone) return null;

  const phoneLine = history.split("\n").find((line) => line.includes(phoneMatch[0])) || "";
  const beforePhone = phoneLine.split(phoneMatch[0])[0]?.replace(/^customer:\s*/i, "").trim();
  const afterPhone = phoneLine.split(phoneMatch[0])[1]?.replace(/^[\s,;:-]+/, "").trim();
  const customerName = beforePhone?.split(/\s+/).slice(-3).join(" ").trim() || "";
  const address = afterPhone || "";
  if (!customerName || !address) return null;

  const rejected = [];
  for (const match of lowerHistory.matchAll(/(?:not|না|নয়|নয়)\s+([a-z0-9\u0980-\u09ff ]{2,40})/gi)) {
    rejected.push(match[1].trim());
  }

  let bestProduct = null;
  let bestIndex = -1;
  for (const product of products) {
    const name = String(product.name || "");
    const lowerName = name.toLowerCase();
    if (rejected.some((term) => term && (lowerName.includes(term) || term.includes(lowerName)))) continue;
    const productIndex = lowerHistory.lastIndexOf(lowerName);
    if (productIndex > bestIndex) {
      bestProduct = product;
      bestIndex = productIndex;
    }
  }
  if (!bestProduct) return null;
  return {
    ready: true,
    customer_name: customerName,
    phone,
    address,
    product_name: bestProduct.name,
    quantity: 1,
    price: bestProduct.price,
    reason: "heuristic",
  };
}

async function extractInboxOrderFromConversation({ products, conversationHistory, latestCustomerMessage }) {
  if (!process.env.OPENAI_API_KEY) return null;
  const catalog = products.map((p) => ({
    name: p.name,
    price: p.price,
    available: Number(p.stock || 0) > 0,
    url: p.url || null,
  }));
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Extract a social commerce order from the conversation. Return JSON only. Only set ready=true when the customer has clearly asked to place/confirm the order and the conversation contains customer_name, phone, address, product_name, quantity, and price or a product match in the catalog. Honor the latest customer correction; if they rejected a product, do not use it. Never invent missing fields.",
        },
        {
          role: "user",
          content:
            `PRODUCT CATALOG JSON:\n${JSON.stringify(catalog).slice(0, 16000)}\n\n` +
            `RECENT CONVERSATION, oldest to newest:\n${conversationHistory || "(none)"}\n\n` +
            `LATEST CUSTOMER MESSAGE:\n${latestCustomerMessage || ""}\n\n` +
            "Return exactly this shape: {\"ready\":boolean,\"customer_name\":\"\",\"phone\":\"\",\"address\":\"\",\"product_name\":\"\",\"quantity\":1,\"price\":0,\"reason\":\"\"}",
        },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI ${response.status}: ${body.slice(0, 240)}`);
  }
  const data = await response.json();
  return parseMetaJsonObject(data.choices?.[0]?.message?.content);
}

async function maybeCreateMetaInboxOrder({ supabase, orgId, platform, conversation, contactId, latestCustomerMessage, products, conversationHistory }) {
  if (!isOrderIntentMessage(latestCustomerMessage)) return null;

  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: existing } = await supabase
    .from("social_inbox_orders")
    .select("*")
    .eq("org_id", orgId)
    .eq("conversation_id", conversation.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return { order: existing, duplicate: true };

  let extracted = null;
  try {
    extracted = await extractInboxOrderFromConversation({ products, conversationHistory, latestCustomerMessage });
  } catch (err) {
    console.warn("[Meta Inbox Order] extraction failed:", errorMessage(err));
  }
  if (!extracted?.ready) {
    extracted = extractInboxOrderHeuristic({ products, conversationHistory });
  }
  if (!extracted?.ready) return null;

  const product = findCatalogProduct(products, extracted.product_name);
  const productName = product?.name || String(extracted.product_name || "").trim();
  const quantity = Math.max(1, Number.parseInt(extracted.quantity, 10) || 1);
  const unitPrice = Number(product?.price ?? extracted.price ?? 0) || 0;
  const phone = normalizeBdPhone(extracted.phone || "");
  const address = String(extracted.address || "").trim();
  const customerName = String(extracted.customer_name || "").trim();
  if (!productName || !phone || !address || !customerName || unitPrice <= 0) return null;
  if (product && Number(product.stock || 0) <= 0) return null;

  const deliveryRate = inferDeliveryCharge(address);
  const totalPrice = unitPrice * quantity + deliveryRate;
  const notes = [
    `Phone: ${phone}`,
    `Address: ${address}`,
    `Source: ${platform} AI auto-capture`,
  ].join("\n");

  const { data, error } = await supabase
    .from("social_inbox_orders")
    .insert({
      org_id: orgId,
      conversation_id: conversation.id,
      platform,
      contact_name: customerName,
      contact_id: contactId,
      items: [{ product: productName, quantity, unit_price: unitPrice }],
      notes,
      total_price: totalPrice,
      delivery_rate: deliveryRate,
      status: "pending",
    })
    .select("*")
    .single();
  if (error) throw error;
  return { order: data, duplicate: false };
}

async function buildMetaAutoReply({ orgId, platform, customerMessage, imageUrl, conversationHistory }) {
  const settings = await getOrgSettings(orgId, ["brand_doc", "ai_auto_reply_enabled", "auto_reply_channels"]);
  if (settings.ai_auto_reply_enabled !== "true") return null;
  let channels = [];
  try {
    channels = JSON.parse(settings.auto_reply_channels || "[]");
  } catch {
    channels = [];
  }
  if (!channels.includes(platform)) return null;
  if (!process.env.OPENAI_API_KEY) return null;

  const brandDoc = settings.brand_doc || "";
  const products = await getMetaReplyProductContext(orgId);
  try {
    return await requestMetaAutoReply({ brandDoc, products, customerMessage, imageUrl, conversationHistory });
  } catch (err) {
    console.warn("[Meta Auto Reply] OpenAI vision failed:", errorMessage(err));
    if (!imageUrl) return null;
    try {
      return await requestMetaAutoReply({ brandDoc, products, customerMessage, imageUrl: null, conversationHistory });
    } catch (fallbackErr) {
      console.warn("[Meta Auto Reply] OpenAI text fallback failed:", errorMessage(fallbackErr));
      return null;
    }
  }
}

async function sendMetaMessage({ platform, pageId, pageToken, recipientId, text }) {
  if (!text || !pageToken || !recipientId) return;
  const path = platform === "instagram" ? `/${pageId}/messages` : `/${pageId}/messages`;
  await metaGraph(path, {
    method: "POST",
    token: pageToken,
    body: {
      recipient: { id: recipientId },
      messaging_type: "RESPONSE",
      message: { text: text.slice(0, 1900) },
    },
  });
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
  if (!phoneNumberId || !token || !recipientId || !text) return;
  await metaGraph(`/${phoneNumberId}/messages`, {
    method: "POST",
    token,
    body: {
      messaging_product: "whatsapp",
      to: recipientId,
      type: "text",
      text: { body: text.slice(0, 4000), preview_url: true },
    },
  });
}

async function handleMetaMessagingEvent({ supabase, objectType, entry, messaging }) {
  const platform = objectType === "instagram" ? "instagram" : "facebook";
  const senderId = messaging.sender?.id;
  const recipientId = messaging.recipient?.id || entry.id;
  const text = messaging.message?.text || messaging.postback?.payload || "";
  const attachment = messaging.message?.attachments?.[0];
  const imageUrl = attachment?.payload?.url || null;
  const messageType = attachment?.type || (text ? "text" : "event");
  if (!senderId || !recipientId) return;

  const channel = await findMetaChannelByRecipient(supabase, recipientId, platform);
  if (!channel?.org_id) {
    await upsertMetaWebhookEvent(supabase, {
      objectType,
      platform,
      pageId: recipientId,
      senderId,
      eventType: "unmatched_message",
      payload: messaging,
    });
    return;
  }

  await upsertMetaWebhookEvent(supabase, {
    orgId: channel.org_id,
    objectType,
    platform,
    pageId: channel.page_id || recipientId,
    instagramAccountId: channel.instagram_account_id || null,
    senderId,
    eventType: "message",
    payload: messaging,
  });

  const { conversation } = await upsertSocialMessage({
    supabase,
    orgId: channel.org_id,
    platform,
    contactId: senderId,
    contactName: senderId,
    sender: "user",
    content: text,
    imageUrl,
    messageType,
  });

  if (!text) return;
  const contextImageUrl = imageUrl || await getRecentConversationImage(supabase, conversation.id);
  const conversationHistory = await getRecentConversationHistory(supabase, conversation.id);
  const products = await getMetaReplyProductContext(channel.org_id);
  const capturedOrder = await maybeCreateMetaInboxOrder({
    supabase,
    orgId: channel.org_id,
    platform,
    conversation,
    contactId: senderId,
    latestCustomerMessage: text,
    products,
    conversationHistory,
  });
  const reply = capturedOrder
    ? `Done, your order has been placed. Order ID: IO-${capturedOrder.order.id.slice(-6).toUpperCase()}. Total: ৳${Number(capturedOrder.order.total_price || 0).toLocaleString("en-US")}.`
    : await buildMetaAutoReply({ orgId: channel.org_id, platform, customerMessage: text, imageUrl: contextImageUrl, conversationHistory });
  if (!reply) return;

  const pageToken = channel.encrypted_page_access_token ? decryptToken(channel.encrypted_page_access_token) : "";
  try {
    await sendMetaMessage({
      platform,
      pageId: channel.page_id || recipientId,
      pageToken,
      recipientId: senderId,
      text: reply,
    });
    await upsertSocialMessage({
      supabase,
      orgId: channel.org_id,
      platform,
      contactId: senderId,
      contactName: senderId,
      sender: "bot",
      content: reply,
      messageType: "text",
    });
  } catch (err) {
    console.warn("[Meta Auto Reply] send failed:", errorMessage(err));
  }
}

async function handleWhatsAppMessageEvent({ supabase, value, message, contact }) {
  const phoneNumberId = value.metadata?.phone_number_id;
  const senderId = message.from;
  if (!phoneNumberId || !senderId) return;
  const channel = await findMetaWhatsAppChannel(supabase, phoneNumberId);
  if (!channel?.org_id) {
    await upsertMetaWebhookEvent(supabase, {
      objectType: "whatsapp_business_account",
      platform: "whatsapp",
      pageId: phoneNumberId,
      senderId,
      eventType: "unmatched_message",
      payload: message,
    });
    return;
  }

  const token = channel.encrypted_access_token ? decryptToken(channel.encrypted_access_token) : "";
  const text =
    message.text?.body ||
    message.button?.text ||
    message.interactive?.button_reply?.title ||
    message.interactive?.list_reply?.title ||
    "";
  let imageUrl = null;
  let messageType = message.type || "event";
  if (message.image?.id) {
    imageUrl = await getWhatsAppMediaDataUrl(message.image.id, token);
    messageType = "image";
  }

  await upsertMetaWebhookEvent(supabase, {
    orgId: channel.org_id,
    objectType: "whatsapp_business_account",
    platform: "whatsapp",
    pageId: phoneNumberId,
    senderId,
    eventType: "message",
    payload: message,
  });

  const { conversation } = await upsertSocialMessage({
    supabase,
    orgId: channel.org_id,
    platform: "whatsapp",
    contactId: senderId,
    contactName: contact?.profile?.name || senderId,
    sender: "user",
    content: text,
    imageUrl,
    messageType,
  });

  if (!text) return;
  const contextImageUrl = imageUrl || await getRecentConversationImage(supabase, conversation.id);
  const conversationHistory = await getRecentConversationHistory(supabase, conversation.id);
  const products = await getMetaReplyProductContext(channel.org_id);
  const capturedOrder = await maybeCreateMetaInboxOrder({
    supabase,
    orgId: channel.org_id,
    platform: "whatsapp",
    conversation,
    contactId: senderId,
    latestCustomerMessage: text,
    products,
    conversationHistory,
  });
  const reply = capturedOrder
    ? `Done, your order has been placed. Order ID: IO-${capturedOrder.order.id.slice(-6).toUpperCase()}. Total: ৳${Number(capturedOrder.order.total_price || 0).toLocaleString("en-US")}.`
    : await buildMetaAutoReply({
      orgId: channel.org_id,
      platform: "whatsapp",
      customerMessage: text,
      imageUrl: contextImageUrl,
      conversationHistory,
    });
  if (!reply) return;

  try {
    await sendWhatsAppMessage({ phoneNumberId, token, recipientId: senderId, text: reply });
    await upsertSocialMessage({
      supabase,
      orgId: channel.org_id,
      platform: "whatsapp",
      contactId: senderId,
      contactName: contact?.profile?.name || senderId,
      sender: "bot",
      content: reply,
      messageType: "text",
    });
  } catch (err) {
    console.warn("[WhatsApp Auto Reply] send failed:", errorMessage(err));
  }
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
  const supabase = getServiceSupabase();
  const body = req.body || {};
  res.sendStatus(200);
  try {
    const entries = Array.isArray(body.entry) ? body.entry : [];
    for (const entry of entries) {
      for (const messaging of entry.messaging || []) {
        await handleMetaMessagingEvent({ supabase, objectType: body.object, entry, messaging });
      }
      for (const change of entry.changes || []) {
        await upsertMetaWebhookEvent(supabase, {
          objectType: body.object,
          platform: body.object === "instagram" ? "instagram" : "facebook",
          pageId: entry.id,
          eventType: change.field || "change",
          payload: change,
        });
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
  const supabase = getServiceSupabase();
  const body = req.body || {};
  res.sendStatus(200);
  try {
    const entries = Array.isArray(body.entry) ? body.entry : [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const contacts = new Map((value.contacts || []).map((contact) => [contact.wa_id, contact]));
        for (const message of value.messages || []) {
          await handleWhatsAppMessageEvent({
            supabase,
            value,
            message,
            contact: contacts.get(message.from),
          });
        }
        if (!value.messages?.length) {
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
    return res.json({ conversations: data || [] });
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
    return res.json({ messages: data || [] });
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
    const allowed = ["status", "notes", "sent_to_courier", "consignment_id", "tracking_code", "courier_status", "courier_message", "fraud_checked", "fraud_data", "delivery_rate"];
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
  org_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(platform, contact_id)
);
ALTER TABLE public.social_conversations ENABLE ROW LEVEL SECURITY;
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
  CREATE POLICY "Authenticated users can view all orders" ON public.orders FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated users can insert orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated users can update orders" ON public.orders FOR UPDATE TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Authenticated users can delete orders" ON public.orders FOR DELETE TO authenticated USING (true);
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
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(platform, contact_id)
);
ALTER TABLE public.social_conversations ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role_all_products" ON public.products TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "auth_users_products" ON public.products TO authenticated USING (true) WITH CHECK (true);
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
    const stockMap = await getProductStockMap(orgId, (data || []).map((p) => p.id));
    return res.json({ products: (data || []).map((p) => ({ ...p, stock_quantity: stockMap[p.id] || 0 })) });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
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
    const rows = products.map((p) => ({
      name: String(p.name || "").trim(),
      url: p.url || null,
      image_url: p.image_url || null,
      selling_price: p.selling_price != null ? parseFloat(p.selling_price) : null,
      cog: p.cog != null ? parseFloat(p.cog) : 0,
      source_url: sourceUrl || null,
      org_id: orgId,
    })).filter((r) => r.name);
    if (!rows.length) return res.status(400).json({ error: "No valid products to save" });
    const { data, error } = await supabase.from("products").insert(rows).select();
    if (error) throw error;
    return res.json({ saved: data.length, products: data });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/products/crawl", async (req, res) => {
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

    // Use Firecrawl extract for structured product data
    try {
      const extractResult = await firecrawl.scrapeUrl(url, {
        formats: [
          "markdown",
          {
            type: "json",
            prompt: "Extract all products being sold on this page. For each product include its name, selling price as a plain number (no currency symbols), image URL, and product URL. Only include real products for sale — ignore navigation links, blog posts, categories, and page titles.",
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
          }));
      }
    } catch { /* extract failed, fall through to GPT */ }

    // GPT fallback over the clean markdown if extract found nothing
    if (products.length === 0 && scrapeResult.markdown) {
      try {
        const OpenAI = (await import("openai")).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const snippet = scrapeResult.markdown.slice(0, 5000);
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0,
          messages: [
            {
              role: "system",
              content: `You extract product listings from e-commerce page content.
Return a JSON array. Each item: { "name": string, "selling_price": number|null, "image_url": string|null }.
Only include real products for sale. Ignore navigation, categories, blog posts, page titles.
If no products found, return [].
Respond with raw JSON only — no markdown fences.`,
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

app.post("/api/extract-order-from-text", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const { orderText } = req.body;
    if (!orderText || typeof orderText !== "string" || !orderText.trim()) {
      return res.status(400).json({ error: "orderText is required" });
    }

    // Regex-based extractor — works without an external AI key.
    // Patterns tuned for Bangladeshi social commerce messages (Bengali + English).
    const text = orderText.trim();

    // Phone: BD numbers starting with 01, optionally prefixed with +880 / 880
    const phoneMatch = text.match(/(?:\+?880|0)?(1[3-9]\d{8})/);
    const rawPhone = phoneMatch ? phoneMatch[1] : "";
    const phone = rawPhone ? "0" + rawPhone : "";

    // Customer name: look for "name:", "নাম:", or leading proper noun before phone
    let customerName = "";
    const nameMatch = text.match(/(?:name|নাম)\s*[:\-]\s*([^\n,।]+)/i);
    if (nameMatch) {
      customerName = nameMatch[1].trim();
    }

    // Address: look for "address:", "ঠিকানা:", "delivery:", etc.
    let address = "";
    const addrMatch = text.match(/(?:address|ঠিকানা|delivery\s*address|location)\s*[:\-]\s*([^\n।]+)/i);
    if (addrMatch) {
      address = addrMatch[1].trim();
    }

    // Product: look for "product:", "item:", "order:", or take the first noun phrase
    let product = "";
    const productMatch = text.match(/(?:product|item|order|পণ্য)\s*[:\-]\s*([^\n,।]+)/i);
    if (productMatch) {
      product = productMatch[1].trim();
    }

    // Quantity: look for digits followed by "pcs", "pieces", "টি", "টা", etc.
    let quantity = 1;
    const qtyMatch = text.match(/(\d+)\s*(?:pcs?|pieces?|টি|টা|nos?\.?)/i);
    if (qtyMatch) quantity = parseInt(qtyMatch[1], 10);

    // Price: look for ৳ / BDT / Tk patterns
    let price = 0;
    const priceMatch = text.match(/(?:৳|BDT|Tk\.?)\s*([\d,]+)/i);
    if (priceMatch) price = parseFloat(priceMatch[1].replace(/,/g, ""));

    // Delivery charge heuristic (same logic as frontend determineDeliveryCharge)
    const lowerText = text.toLowerCase();
    // Keep in sync with determineDeliveryCharge() in src/pages/OrderExtraction.tsx
    const dhakaKws = ["dhaka", "dhanmondi", "gulshan", "banani", "mirpur", "mohammadpur",
      "uttara", "badda", "khilgaon", "motijheel", "paltan", "farmgate",
      "shahbagh", "new market", "azampur", "kurmitola", "tejgaon"];
    const isInsideDhaka = dhakaKws.some((k) => lowerText.includes(k));
    const deliveryCharge = isInsideDhaka ? 80 : 120;
    const locationType = isInsideDhaka ? "inside_dhaka" : "outside_dhaka";

    const extractedOrder = {
      customer_name: customerName || "Unknown",
      phone,
      address,
      product,
      quantity,
      price,
      delivery_charge: deliveryCharge,
      location_type: locationType,
    };

    // Warn caller when critical fields could not be extracted
    const warnings = [];
    if (!phone) warnings.push("Phone number not found in order text");
    if (!product) warnings.push("Product not found in order text");
    if (price === 0) warnings.push("Price not found in order text — defaulted to 0");

    return res.json({ extractedOrder, warnings });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.patch("/api/products/:id", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const allowed = ["name", "url", "image_url", "selling_price", "cog"];
    const update = {};
    for (const k of allowed) { if (req.body[k] !== undefined) update[k] = req.body[k]; }
    const hasStockUpdate = req.body.stock_quantity !== undefined;
    if (!Object.keys(update).length && !hasStockUpdate) return res.status(400).json({ error: "Nothing to update" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
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
    const { error } = await supabase.from("products").delete().eq("id", req.params.id).eq("org_id", orgId);
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
        await bootstrapAiProductContext();
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
}

export default app;
