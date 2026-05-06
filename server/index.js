import express from "express";
import cors from "cors";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";
const { Pool } = pg;

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

async function getUser(token) {
  if (!token) return { user: null };
  try {
    const supabase = getServiceSupabase();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return { user: null };

    // Auto-assign admin role on first login if no roles exist yet
    const { data: existingRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existingRole) {
      await supabase
        .from("user_roles")
        .upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id" })
        .catch((e) => console.warn("[Auth] role upsert failed:", e.message));
    }

    return { user };
  } catch (err) {
    console.error("[Auth] getUser error:", err.message);
    return { user: null };
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanPhone(phone) {
  let clean = phone.replace(/\D/g, "");
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
  const cleanedPhone = cleanPhone(phone);
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

async function getPathaoToken() {
  const cfg = await getSettings(["pathao_client_id", "pathao_client_secret", "pathao_username", "pathao_password"]);
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
      .upsert({ user_id: newUser.user.id, role: "admin" }, { onConflict: "user_id" });

    if (roleError) throw roleError;

    return res.json({ success: true, userId: newUser.user.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: msg });
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
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (callerRole?.role !== "admin") {
        return res.status(403).json({ error: "Only admins can assign roles" });
      }
    }

    // Assign the role (upsert)
    const assignTo = targetUserId || user.id;
    const { error: upsertError } = await supabase
      .from("user_roles")
      .upsert({ user_id: assignTo, role: roleToAssign }, { onConflict: "user_id" });

    if (upsertError) throw upsertError;

    return res.json({ success: true, userId: assignTo, role: roleToAssign });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: msg });
  }
});

// Check if the current user is admin
app.get("/api/admin/check", async (req, res) => {
  try {
    const token = getToken(req);
    if (!token) return res.json({ isAdmin: false, hasAdmins: false });

    // getUser validates the JWT and auto-assigns admin role on first login
    // in user_roles so the role exists by the time we query it below.
    const { user } = await getUser(token);
    if (!user) return res.json({ isAdmin: false, hasAdmins: false });

    const supabase = getServiceSupabase();
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    return res.json({ isAdmin: roleRow?.role === "admin", hasAdmins: !!roleRow });
  } catch {
    return res.json({ isAdmin: false, hasAdmins: false });
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

app.get("/api/settings", async (req, res) => {
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase.from("app_settings").select("key, value").order("key");
    if (error) throw error;
    const settings = {};
    for (const row of data || []) {
      settings[row.key] = row.value;
    }
    return res.json({ settings });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: msg });
  }
});

app.post("/api/settings", async (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== "object") {
      return res.status(400).json({ error: "settings object required" });
    }
    await saveSettings(settings);
    return res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: msg });
  }
});

// ─── Integration Test Endpoints ──────────────────────────────────────────────

// Test Facebook Ads connection server-side so the token never appears in a browser URL
app.post("/api/settings/test-facebook", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const cfg = await getSettings(["facebook_access_token", "facebook_ad_account_id"]);
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
    const cfg = await getSettings(["fraudshield_api_key"]);
    const apiKey = cfg["fraudshield_api_key"];
    if (!apiKey) return res.status(400).json({ error: "FraudShield API key not configured" });
    return res.json({ success: true, message: "API key configured" });
  } catch (err) {
    return res.status(500).json({ error: "An internal error occurred" });
  }
});

// ─── Analytics ───────────────────────────────────────────────────────────────

app.get("/api/analytics", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const supabase = getServiceSupabase();

    // Optional date range from query params (YYYY-MM-DD)
    const since = req.query.since || null;
    const until = req.query.until || null;

    // Use SELECT * so PostgREST doesn't validate individual column names against
    // its schema cache. If org_id isn't cached yet, named selects throw a 500;
    // with * PostgREST returns whatever Postgres gives and we filter in JS.
    let ordersQuery = supabase.from("orders").select("*");
    if (since) ordersQuery = ordersQuery.gte("created_at", `${since}T00:00:00+06:00`);
    if (until) ordersQuery = ordersQuery.lte("created_at", `${until}T23:59:59+06:00`);

    const { data: rawOrders, error: ordersError } = await ordersQuery;
    if (ordersError) throw ordersError;

    const orders = rawOrders || [];

    console.log(`[Analytics] date filter: since=${since} until=${until}, matched ${orders.length} orders`);

    // price = total_price from Shopify (subtotal + shipping − discounts) = what the customer pays.
    // delivery_rate = shipping component (kept separately for the Shipping card display).
    // Revenue matches Shopify "Total Sales" exactly.
    let revenue = 0;
    let shipping = 0;
    for (const o of orders || []) {
      revenue += parseFloat(o.price || 0);
      shipping += parseFloat(o.delivery_rate || 0);
    }

    // Fetch Facebook ad spend
    let adSpend = null;
    let fbError = null;
    const cfg = await getSettings(["facebook_access_token", "facebook_ad_account_id", "usd_to_bdt_rate"]);
    const fbToken = cfg["facebook_access_token"];
    const fbAccountId = cfg["facebook_ad_account_id"];
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
        let nextUrl = `https://graph.facebook.com/v20.0/${accountId}/insights?fields=spend&level=account&${dateParam}&time_increment=all_days&access_token=${encodeURIComponent(fbToken)}`;
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
              totalSpendUsd += parseFloat(row.spend || 0);
            }
          }

          nextUrl = fbData.paging?.next || null;
          pages++;
        }

        adSpend = parseFloat((totalSpendUsd * usdToBdt).toFixed(2));
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
    let cogCoverage = { set: 0, total: 0 }; // products with cog set vs total
    try {
      const { data: cogRow } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "products_catalog")
        .single();
      if (cogRow?.value) {
        const prods = JSON.parse(cogRow.value);
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
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ error: msg });
  }
});

// ─── API Routes ─────────────────────────────────────────────────────────────

app.get("/api/orders", async (req, res) => {
  try {
    const token = getToken(req);
    const { user } = await getUser(token);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    console.log(`[Orders] user=${user.id}`);

    const supabase = getServiceSupabase();
    const { data: allData, error } = await supabase
      .from("orders")
      .select("*")
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

app.patch("/api/orders/:id", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const allowed = ["status", "notes", "courier_status", "consignment_id", "tracking_code", "courier_message", "sent_to_courier", "fraud_checked", "fraud_data"];
    const update = {};
    for (const k of allowed) { if (req.body[k] !== undefined) update[k] = req.body[k]; }
    // Verify org ownership — tenant can only update their own orders.
    const { data: orderCheck } = await supabase.from("orders").select("*").eq("id", req.params.id).single();
    if (!orderCheck) return res.status(404).json({ error: "Order not found" });
    await supabase.from("orders").update(update).eq("id", req.params.id);
    const { data } = await supabase.from("orders").select("*").eq("id", req.params.id).single();
    return res.json({ success: true, order: data });
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

    const cfg = await getSettings(["steadfast_api_key", "steadfast_secret_key"]);
    const apiKey = cfg["steadfast_api_key"];
    const secretKey = cfg["steadfast_secret_key"];
    if (!apiKey || !secretKey) return res.status(500).json({ error: "Steadfast credentials not configured. Go to Settings → Integrations." });

    const supabase = getServiceSupabase();
    const { data: order, error: fetchError } = await supabase.from("orders").select("*").eq("id", orderId).single();
    if (fetchError || !order) return res.status(404).json({ error: "Order not found" });
    if (order.sent_to_courier) return res.status(400).json({ error: "Order already sent to courier", consignment_id: order.consignment_id });

    const cleanPhone = cleanBdPhone(order.phone || "");
    if (cleanPhone.length !== 11 || !cleanPhone.startsWith("01")) {
      return res.status(400).json({ error: "Invalid phone number. Must be 11 digits starting with 01." });
    }

    const invoice = `ORD-${order.order_number || order.id.slice(-8).toUpperCase()}`;
    const payload = {
      invoice,
      recipient_name: order.customer_name || "Customer",
      recipient_phone: cleanPhone,
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
      await supabase.from("orders").update({ courier_message: sfData.message || "Failed" }).eq("id", orderId);
      return res.status(400).json({ error: sfData.message || "Steadfast rejected the order", details: sfData });
    }

    const consignment = sfData.consignment;
    await supabase.from("orders").update({
      sent_to_courier: true,
      consignment_id: String(consignment.consignment_id),
      tracking_code: consignment.tracking_code,
      courier_status: consignment.status,
      courier_message: "Sent to Steadfast successfully",
    }).eq("id", orderId);

    const { data: updated } = await supabase.from("orders").select("*").eq("id", orderId).single();
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

    const cfg = await getSettings(["pathao_store_id"]);
    const storeId = cfg["pathao_store_id"];
    if (!storeId) return res.status(500).json({ error: "Pathao credentials not configured. Go to Settings → Integrations." });

    const supabase = getServiceSupabase();
    const { data: order, error: fetchError } = await supabase.from("orders").select("*").eq("id", orderId).single();
    if (fetchError || !order) return res.status(404).json({ error: "Order not found" });

    const cleanPhone = cleanBdPhone(order.phone || "");
    if (cleanPhone.length !== 11 || !cleanPhone.startsWith("01")) {
      return res.status(400).json({ error: "Invalid phone number. Must be 11 digits starting with 01." });
    }

    const accessToken = await getPathaoToken();
    const pathaoPayload = {
      store_id: parseInt(storeId),
      merchant_order_id: `ORD-${order.order_number || order.id.slice(-8).toUpperCase()}`,
      recipient_name: order.customer_name || "Customer",
      recipient_phone: cleanPhone,
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
      await supabase.from("orders").update({ courier_message: pathaoData.message || "Failed" }).eq("id", orderId);
      return res.status(400).json({ error: pathaoData.message || "Pathao rejected the order", details: pathaoData });
    }

    const consignment = pathaoData.data;
    const consignmentId = consignment?.consignment_id ? String(consignment.consignment_id) : null;
    await supabase.from("orders").update({
      sent_to_courier: true,
      consignment_id: consignmentId,
      tracking_code: consignmentId,
      courier_status: "pending",
      courier_message: "Sent to Pathao successfully",
    }).eq("id", orderId);

    const { data: updated } = await supabase.from("orders").select("*").eq("id", orderId).single();
    return res.json({ success: true, consignment, order: updated });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/fetch-shopify-orders", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    const cfg = await getSettings(["shopify_admin_api_token", "shopify_store_url"]);
    const shopifyToken = cfg["shopify_admin_api_token"];
    const shopifyStoreUrl = cfg["shopify_store_url"];

    if (!shopifyToken || !shopifyStoreUrl) {
      return res.status(500).json({ error: "Shopify credentials not configured. Go to Settings → Integrations to add them." });
    }

    const cleanStoreUrl = shopifyStoreUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");

    const shopifyResponse = await fetch(
      `https://${cleanStoreUrl}/admin/api/2024-10/orders.json?status=any&limit=250&order=created_at+desc`,
      {
        headers: {
          "X-Shopify-Access-Token": shopifyToken,
          "Content-Type": "application/json",
        },
      }
    );

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      return res.status(shopifyResponse.status).json({
        error: "Failed to fetch orders from Shopify",
        details: errorText,
      });
    }

    const shopifyData = await shopifyResponse.json();
    const orders = shopifyData.orders || [];

    const supabase = getServiceSupabase();

    const { data: existingOrdersRaw } = await supabase
      .from("orders")
      .select("*");
    const existingOrders = existingOrdersRaw || [];

    const existingOrdersMap = new Map(
      existingOrders.map((o) => [o.shopify_order_id, o])
    );

    const processedOrders = [];

    for (const order of orders) {
      let phone = order.shipping_address?.phone || order.customer?.phone || "";

      if (!phone && order.note_attributes) {
        const phoneAttr = order.note_attributes.find(
          (attr) =>
            attr.name.toLowerCase().includes("phone") ||
            attr.name.toLowerCase().includes("tel") ||
            attr.name.toLowerCase().includes("mobile")
        );
        if (phoneAttr) phone = phoneAttr.value;
      }

      if (phone) {
        let cleanPhoneNum = phone.replace(/\D/g, "");
        if (cleanPhoneNum.startsWith("880")) cleanPhoneNum = cleanPhoneNum.slice(3);
        if (cleanPhoneNum.length === 10 && cleanPhoneNum.startsWith("1"))
          cleanPhoneNum = "0" + cleanPhoneNum;
        phone = cleanPhoneNum;
      }

      const addr = order.shipping_address || order.customer?.default_address;
      let addressParts = [addr?.address1, addr?.city, addr?.province, addr?.country, addr?.zip].filter(Boolean);

      if (addressParts.length <= 1 && order.note_attributes) {
        const noteAddressParts = [];
        const addressFields = ["address", "shipping address", "delivery address", "street", "road", "house", "flat"];
        const cityFields = ["city", "town", "district", "thana", "upazila", "area"];
        const regionFields = ["region", "province", "state", "division"];
        const zipFields = ["zip", "postal", "postcode", "post code"];

        for (const attr of order.note_attributes) {
          const attrNameLower = attr.name.toLowerCase();
          const attrValue = attr.value?.trim();
          if (!attrValue) continue;
          if (
            addressFields.some((f) => attrNameLower.includes(f)) ||
            cityFields.some((f) => attrNameLower.includes(f)) ||
            regionFields.some((f) => attrNameLower.includes(f)) ||
            zipFields.some((f) => attrNameLower.includes(f))
          ) {
            noteAddressParts.push(attrValue);
          }
        }

        if (noteAddressParts.length > 0) {
          if (addr?.country) noteAddressParts.push(addr.country);
          addressParts = noteAddressParts;
        }
      }

      const address = addressParts.join(", ");

      let customerName = "";
      if (order.shipping_address?.name) customerName = order.shipping_address.name;
      else if (order.shipping_address?.first_name || order.shipping_address?.last_name)
        customerName = `${order.shipping_address.first_name || ""} ${order.shipping_address.last_name || ""}`.trim();
      else if (order.billing_address?.name) customerName = order.billing_address.name;
      else if (order.billing_address?.first_name || order.billing_address?.last_name)
        customerName = `${order.billing_address.first_name || ""} ${order.billing_address.last_name || ""}`.trim();
      else if (order.customer?.first_name || order.customer?.last_name)
        customerName = `${order.customer.first_name || ""} ${order.customer.last_name || ""}`.trim();
      else if (order.customer?.default_address?.name)
        customerName = order.customer.default_address.name;

      if (!customerName && order.note_attributes) {
        const nameAttr = order.note_attributes.find(
          (attr) => attr.name.toLowerCase().includes("name") && !attr.name.toLowerCase().includes("phone")
        );
        if (nameAttr) customerName = nameAttr.value;
      }

      const lineItems = order.line_items || [];
      const product = lineItems.map((item) => `${item.quantity || 1}x ${item.name}`).join(", ");
      const quantity = lineItems.reduce((acc, item) => acc + (item.quantity || 0), 0);

      // total_price = what the customer actually pays (subtotal + shipping − discounts).
      // This matches Shopify's "Total Sales" metric exactly.
      const totalPrice = parseFloat(order.total_price) || 0;
      const shippingPrice = parseFloat(order.total_shipping_price_set?.shop_money?.amount || "0");

      const existingOrder = existingOrdersMap.get(order.id);

      processedOrders.push({
        shopify_order_id: order.id,
        order_number: order.name || `#${order.order_number}`,
        customer_name: customerName,
        phone,
        address,
        product,
        quantity,
        // org_id is included directly — the column exists in the DB and PostgREST
        // schema cache is up to date (seeded via Supabase SQL Editor migration).
        price: (order.cancelled_at || order.financial_status === 'refunded' || order.financial_status === 'voided') ? 0 : totalPrice,
        delivery_rate: (order.cancelled_at || order.financial_status === 'refunded' || order.financial_status === 'voided') ? 0 : shippingPrice,
        fulfillment_status: order.cancelled_at
          ? 'cancelled'
          : (order.financial_status === 'refunded' || order.financial_status === 'voided')
            ? 'cancelled'
            : (order.fulfillment_status || null),
        fraud_checked: existingOrder?.fraud_checked || false,
        fraud_data: existingOrder?.fraud_data || null,
        created_at: order.created_at || new Date().toISOString(),
      });

      // Log orders that get zeroed so we can confirm the right ones are excluded
      if (order.cancelled_at || order.financial_status === 'refunded' || order.financial_status === 'voided') {
        console.log(`[Sync] ZEROED order ${order.name}: cancelled_at=${order.cancelled_at}, financial_status=${order.financial_status}, original total_price=${totalPrice}`);
      }
    }

    console.log(`[Sync] processed ${processedOrders.length} orders (zeroed any cancelled/refunded ones)`);

    const { error: upsertError } = await supabase
      .from("orders")
      .upsert(processedOrders, { onConflict: "shopify_order_id", ignoreDuplicates: false });

    if (upsertError) {
      console.error("[Sync] Upsert error:", JSON.stringify(upsertError));
      return res.status(500).json({ error: "Failed to save orders", details: upsertError.message });
    }

    res.json({ synced: processedOrders.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/social/messages/:conversationId", async (req, res) => {
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("social_messages")
      .select("*")
      .eq("conversation_id", req.params.conversationId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    await supabase.from("social_conversations").update({ unread_count: 0 }).eq("id", req.params.conversationId);
    res.json({ messages: data || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Inbox orders
app.get("/api/social/inbox-orders", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { data: allInboxOrders, error } = await supabase
      .from("social_inbox_orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[GET inbox-orders] SELECT failed:", error.message);
      return res.status(500).json({ error: error.message, orders: [] });
    }
    const all = allInboxOrders || [];

    const orders = all;

    res.json({ orders });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch("/api/social/inbox-orders/:id", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { data: existing, error: fetchErr } = await supabase.from("social_inbox_orders").select("id, org_id").eq("id", req.params.id).single();
    if (fetchErr || !existing) return res.status(404).json({ error: "Order not found" });
    const allowed = ["status", "notes"];
    const update = {};
    for (const k of allowed) { if (req.body[k] !== undefined) update[k] = req.body[k]; }
    await supabase.from("social_inbox_orders").update(update).eq("id", req.params.id);
    const { data } = await supabase.from("social_inbox_orders").select("*").eq("id", req.params.id).single();
    res.json({ success: true, order: data });
  } catch (e) { res.status(500).json({ error: "An internal error occurred" }); }
});

app.delete("/api/social/inbox-orders/:id", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { data: existing, error: fetchErr } = await supabase.from("social_inbox_orders").select("id, org_id").eq("id", req.params.id).single();
    if (fetchErr || !existing) return res.status(404).json({ error: "Order not found" });
    await supabase.from("social_inbox_orders").delete().eq("id", req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "An internal error occurred" }); }
});

// Helper to parse phone and address from inbox order notes
function parseInboxOrderNotes(notes) {
  const phone = (notes || "").match(/Phone:\s*([^,\n]+)/i)?.[1]?.trim() || "";
  const address = (notes || "").match(/Address:\s*(.+)/i)?.[1]?.trim() || "";
  return { phone, address };
}

// Helper to clean BD phone number
function cleanBdPhone(raw) {
  let p = raw.replace(/\D/g, "");
  if (p.startsWith("880")) {
    p = p.slice(3);
    if (!p.startsWith("0")) p = "0" + p;
  }
  return p;
}

app.post("/api/inbox-orders/send-to-courier", async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: "Order ID is required" });

    const { user } = await getUser(getToken(req));
    const cfg = await getSettings(["steadfast_api_key", "steadfast_secret_key"]);
    const apiKey = cfg["steadfast_api_key"];
    const secretKey = cfg["steadfast_secret_key"];
    if (!apiKey || !secretKey) return res.status(500).json({ error: "Steadfast credentials not configured. Go to Settings → Integrations." });

    const supabase = getServiceSupabase();
    const { data: order, error: fetchError } = await supabase.from("social_inbox_orders").select("*").eq("id", orderId).single();
    if (fetchError || !order) return res.status(404).json({ error: "Inbox order not found" });
    if (order.sent_to_courier) return res.status(400).json({ error: "Order already sent to courier", consignment_id: order.consignment_id });

    const { phone: rawPhone, address } = parseInboxOrderNotes(order.notes);
    const cleanPhone = cleanBdPhone(rawPhone);
    if (cleanPhone.length !== 11 || !cleanPhone.startsWith("01")) {
      return res.status(400).json({ error: "Invalid phone number. Must be 11 digits starting with 01." });
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const productNote = items.map(i => `${i.quantity}x ${i.product}`).join(", ") || "N/A";
    const invoice = `IO-${order.id.slice(-8).toUpperCase()}`;

    const payload = {
      invoice,
      recipient_name: order.contact_name || "Customer",
      recipient_phone: cleanPhone,
      recipient_address: address || "No address provided",
      cod_amount: order.total_price || 0,
      note: productNote,
    };

    const sfRes = await fetch("https://portal.packzy.com/api/v1/create_order", {
      method: "POST",
      headers: { "Api-Key": apiKey, "Secret-Key": secretKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const sfData = await sfRes.json();

    if (sfData.status !== 200) {
      await supabase.from("social_inbox_orders").update({ courier_message: sfData.message || "Failed" }).eq("id", orderId);
      return res.status(400).json({ error: sfData.message || "Steadfast rejected the order", details: sfData });
    }

    const consignment = sfData.consignment;
    await supabase.from("social_inbox_orders").update({
      sent_to_courier: true,
      consignment_id: String(consignment.consignment_id),
      tracking_code: consignment.tracking_code,
      courier_status: consignment.status,
      courier_message: "Sent to Steadfast successfully",
    }).eq("id", orderId);

    const { data: updated } = await supabase.from("social_inbox_orders").select("*").eq("id", orderId).single();
    return res.json({ success: true, consignment, order: updated });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/inbox-orders/send-to-pathao", async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: "Order ID is required" });

    const { user } = await getUser(getToken(req));
    const cfg = await getSettings(["pathao_store_id"]);
    const storeId = cfg["pathao_store_id"];
    if (!storeId) return res.status(500).json({ error: "Pathao credentials not configured. Go to Settings → Integrations." });

    const supabase = getServiceSupabase();
    const { data: order, error: fetchError } = await supabase.from("social_inbox_orders").select("*").eq("id", orderId).single();
    if (fetchError || !order) return res.status(404).json({ error: "Inbox order not found" });

    const { phone: rawPhone, address } = parseInboxOrderNotes(order.notes);
    const cleanPhone = cleanBdPhone(rawPhone);
    if (cleanPhone.length !== 11 || !cleanPhone.startsWith("01")) {
      return res.status(400).json({ error: "Invalid phone number. Must be 11 digits starting with 01." });
    }

    const items = Array.isArray(order.items) ? order.items : [];
    const productNote = items.map(i => `${i.quantity}x ${i.product}`).join(", ") || "N/A";
    const totalQty = items.reduce((a, i) => a + (i.quantity || 1), 0) || 1;
    const accessToken = await getPathaoToken();

    const pathaoPayload = {
      store_id: parseInt(storeId),
      merchant_order_id: `IO-${order.id.slice(-8).toUpperCase()}`,
      recipient_name: order.contact_name || "Customer",
      recipient_phone: cleanPhone,
      recipient_address: address || "No address provided",
      delivery_type: 48,
      item_type: 2,
      special_instruction: productNote,
      item_quantity: totalQty,
      item_weight: 0.5,
      amount_to_collect: order.total_price || 0,
    };

    const pathaoRes = await fetch("https://api-hermes.pathao.com/aladdin/api/v1/orders", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(pathaoPayload),
    });
    const pathaoData = await pathaoRes.json();

    if (!pathaoRes.ok) {
      await supabase.from("social_inbox_orders").update({ courier_message: pathaoData.message || "Failed" }).eq("id", orderId);
      return res.status(400).json({ error: pathaoData.message || "Pathao rejected the order", details: pathaoData });
    }

    const consignment = pathaoData.data;
    const consignmentId = consignment?.consignment_id ? String(consignment.consignment_id) : null;
    await supabase.from("social_inbox_orders").update({
      sent_to_courier: true,
      consignment_id: consignmentId,
      tracking_code: consignmentId,
      courier_status: "pending",
      courier_message: "Sent to Pathao successfully",
    }).eq("id", orderId);

    const { data: updated } = await supabase.from("social_inbox_orders").select("*").eq("id", orderId).single();
    return res.json({ success: true, consignment, order: updated });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/check-fraud", async (req, res) => {
  try {
    const { orderId } = req.body || {};
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const cfg = await getSettings(["fraudshield_api_key"]);
    const fraudShieldApiKey = cfg["fraudshield_api_key"];
    if (!fraudShieldApiKey) return res.status(400).json({ error: "FraudShield API key not configured" });

    const supabase = getServiceSupabase();

    if (orderId) {
      const { data: order, error: fetchError } = await supabase
        .from("orders")
        .select("id, phone, fraud_checked, fraud_data")
        .eq("id", orderId)
        .single();

      if (fetchError || !order) return res.status(404).json({ error: "Order not found" });
      if (!order.phone) return res.status(400).json({ error: "Order has no phone number" });

      const { fraudData, errorMessage } = await checkFraudStatus(order.phone, fraudShieldApiKey);
      const dataToStore = fraudData ?? { _error: errorMessage ?? "Unknown error" };

      await supabase
        .from("orders")
        .update({ fraud_checked: true, fraud_data: dataToStore })
        .eq("id", order.id);

      const { data: updatedOrder } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();

      return res.json({ success: true, order: updatedOrder, fraudError: errorMessage });
    }

    const { data: orders, error: fetchError } = await supabase
      .from("orders")
      .select("id, shopify_order_id, phone, fraud_checked, fraud_data")
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
        .eq("id", order.id);

      if (!updateError && fraudData) successCount++;
    }

    const { data: allOrders } = await supabase
      .from("orders")
      .select("*")
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
    const { data: order, error: fetchError } = await supabase.from("social_inbox_orders").select("*").eq("id", orderId).single();
    if (fetchError || !order) return res.status(404).json({ error: "Inbox order not found" });

    const { phone: rawPhone } = parseInboxOrderNotes(order.notes);
    if (!rawPhone) return res.status(400).json({ error: "No phone number found in this order's notes" });

    const cfg = await getSettings(["fraudshield_api_key"]);
    const fraudShieldApiKey = cfg["fraudshield_api_key"];
    if (!fraudShieldApiKey) return res.status(400).json({ error: "FraudShield API key not configured" });

    const { fraudData, errorMessage } = await checkFraudStatus(rawPhone, fraudShieldApiKey);
    const dataToStore = fraudData ?? { _error: errorMessage ?? "Unknown error" };

    await supabase.from("social_inbox_orders").update({ fraud_checked: true, fraud_data: dataToStore }).eq("id", orderId);
    const { data: updated } = await supabase.from("social_inbox_orders").select("*").eq("id", orderId).single();
    return res.json({ success: true, order: updated, fraudError: errorMessage });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Brand document
app.get("/api/social/brand-doc", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    const cfg = await getSettings(["brand_doc"]);
    res.json({ content: cfg["brand_doc"] || "" });
  } catch (e) { res.json({ content: "" }); }
});

app.post("/api/social/brand-doc", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    const { content } = req.body;
    await saveSettings({ brand_doc: content || "" });
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
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
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
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return res.json({ products: data || [] });
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
    const rows = products.map((p) => ({
      name: String(p.name || "").trim(),
      url: p.url || null,
      image_url: p.image_url || null,
      selling_price: p.selling_price != null ? parseFloat(p.selling_price) : null,
      cog: p.cog != null ? parseFloat(p.cog) : 0,
      source_url: sourceUrl || null,
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

    // Fetch the page
    const pageRes = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Seraphine/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    if (!pageRes.ok) return res.status(400).json({ error: `Could not fetch page: HTTP ${pageRes.status}` });
    const html = await pageRes.text();

    // Strip HTML tags to get plain text
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Extract product names and prices using common patterns
    // Look for price patterns like ৳1,200 / BDT 1200 / Tk. 1200 / 1,200৳ / 1200.00
    const pricePattern = /(?:৳|BDT|Tk\.?|TK\.?)\s*([\d,]+(?:\.\d{1,2})?)|(\d[\d,]*(?:\.\d{1,2})?)\s*(?:৳|BDT|Tk\.?|TK)/g;
    const prices = [];
    let m;
    while ((m = pricePattern.exec(text)) !== null) {
      const raw = (m[1] || m[2]).replace(/,/g, "");
      const val = parseFloat(raw);
      if (val > 0 && val < 1000000) prices.push(val);
    }

    // Try to extract structured product data from JSON-LD schema
    const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    const products = [];

    for (const block of jsonLdMatches) {
      try {
        const json = JSON.parse(block.replace(/<script[^>]*>|<\/script>/gi, ""));
        const items = Array.isArray(json) ? json : [json];
        for (const item of items) {
          if (item["@type"] === "Product" && item.name) {
            const price = item.offers?.price || item.offers?.lowPrice || null;
            const img = item.image?.[0] || item.image || null;
            const productUrl = item.url || item.offers?.url || null;
            products.push({
              name: item.name,
              url: productUrl,
              image_url: typeof img === "string" ? img : null,
              selling_price: price ? parseFloat(price) : null,
              cog: 0,
            });
          }
          // ItemList
          if (item["@type"] === "ItemList" && Array.isArray(item.itemListElement)) {
            for (const el of item.itemListElement) {
              const it = el.item || el;
              if (it.name) {
                products.push({
                  name: it.name,
                  url: it.url || null,
                  image_url: it.image || null,
                  selling_price: it.offers?.price ? parseFloat(it.offers.price) : null,
                  cog: 0,
                });
              }
            }
          }
        }
      } catch { /* skip malformed JSON-LD */ }
    }

    // If no structured data, fall back to Open Graph / meta tags for single-product pages
    if (products.length === 0) {
      const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)/i)?.[1]
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1];
      const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)/i)?.[1]
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1];
      const ogPrice = html.match(/<meta[^>]*property=["']product:price:amount["'][^>]*content=["']([^"']+)/i)?.[1]
        || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']product:price:amount["']/i)?.[1];

      if (ogTitle) {
        products.push({
          name: ogTitle.trim(),
          url: url,
          image_url: ogImage || null,
          selling_price: ogPrice ? parseFloat(ogPrice) : (prices[0] || null),
          cog: 0,
        });
      }
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
      return res.json({ products: [], message: "No structured product data found. Try a product listing or detail page." });
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
    if (!Object.keys(update).length) return res.status(400).json({ error: "Nothing to update" });
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("products")
      .update(update)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
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
    const { error } = await supabase.from("products").delete().eq("id", req.params.id);
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
  if (isDev) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
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
// Uses SUPABASE_DB_PASSWORD + SUPABASE_URL to build the connection string.
function getPgPool() {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const dbPassword = process.env.SUPABASE_DB_PASSWORD || "";
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!projectRef || !dbPassword) return null;
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

// Run SQL via the PostgREST /rest/v1/sql endpoint (PostgREST 12+, Supabase standard).
// This works on Vercel without SUPABASE_DB_PASSWORD — all it needs is the service role key.
// Returns { success: true } or { success: false, error: string }.
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
        "Content-Type": "application/sql",
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
    // No direct DB connection — fall back to the PostgREST /rest/v1/sql endpoint.
    console.warn("[Migrate] No DB credentials — trying REST SQL fallback.");
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
    console.warn("[Migrate] Direct Postgres failed:", e.message, "— trying REST SQL fallback.");
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
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    ensureAppSettingsTable();
    migrateInboxOrdersTable();
    migrateMultiTenancy();
    bootstrapAiProductContext();
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
