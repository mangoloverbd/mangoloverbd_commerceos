import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CourierEntry {
  courier: string;
  total: number;
  successful: number;
  cancelled: number;
}

interface FraudShieldResponse {
  success: boolean;
  courierData: {
    summary: {
      total_parcels: number;
      successful_deliveries: number;
      cancelled_deliveries: number;
      success_rate: number;
    };
    couriers: CourierEntry[];
  };
  fraudRiskScore: {
    score: number;
    level: string;
  };
}

interface NormalizedFraudData {
  mobile_number: string;
  total_parcels: number;
  total_delivered: number;
  total_cancel: number;
  fraud_risk: string;
  success_rate: number;
  last_delivery: string;
  apis: Record<string, {
    total_parcels: number;
    total_delivered_parcels: number;
    total_cancelled_parcels: number;
  }>;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanPhone(phone: string): string | null {
  let clean = phone.replace(/\D/g, "");
  if (clean.startsWith("880")) {
    const after = clean.slice(3);
    if (after.startsWith("01") && after.length === 11) clean = after;
    else if (after.startsWith("1") && after.length === 10) clean = "0" + after;
  }
  if (clean.length !== 11 || !clean.startsWith("01")) return null;
  return clean;
}

function parseFraudShieldError(status: number, body: string): string {
  let message = body;
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string; details?: string };
    message = parsed.message ?? parsed.error ?? parsed.details ?? body;
  } catch {
    // FraudShield sometimes returns plain text/HTML on upstream failures.
  }

  if (/BdCourierService|transformApiResponse|null returned/i.test(message)) {
    return "FraudShield is temporarily failing while reading BD Courier data. Please try again later or contact FraudShield support if it continues.";
  }

  const hint = status === 401 || status === 403
    ? "Invalid or expired API key"
    : `HTTP ${status}`;
  return `${hint}: ${String(message).substring(0, 200) || "(no body)"}`;
}

interface FraudCheckResult {
  fraudData: NormalizedFraudData | null;
  successRate: number | null;
  errorMessage: string | null;
}

async function checkFraudStatus(
  phone: string,
  apiKey: string,
): Promise<FraudCheckResult> {
  const cleanedPhone = cleanPhone(phone);

  if (!cleanedPhone) {
    return { fraudData: null, successRate: null, errorMessage: `Invalid phone format: "${phone}"` };
  }
  if (!apiKey) {
    return { fraudData: null, successRate: null, errorMessage: "No API key provided" };
  }

  try {
    console.log(`Checking fraud status for: ${cleanedPhone}`);

    const response = await fetch("https://fraudshield.bd/api/customer/check", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({ phone: cleanedPhone }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`FraudShield API error for ${cleanedPhone}: ${response.status} - ${errorBody}`);
      return {
        fraudData: null,
        successRate: null,
        errorMessage: parseFraudShieldError(response.status, errorBody),
      };
    }

    let result: FraudShieldResponse;
    try {
      result = await response.json();
    } catch {
      return {
        fraudData: null,
        successRate: null,
        errorMessage: "FraudShield returned an invalid JSON response. Please try again later.",
      };
    }
    console.log(`FraudShield response for ${cleanedPhone}:`, JSON.stringify(result).substring(0, 500));

    if (!result.success || !result.courierData) {
      const msg = `Unexpected response: ${JSON.stringify(result).substring(0, 200)}`;
      console.error(msg);
      return { fraudData: null, successRate: null, errorMessage: msg };
    }

    const summary = result.courierData.summary;
    const successRate = summary?.success_rate ?? 0;
    const riskLevel = result.fraudRiskScore?.level ?? (successRate >= 70 ? "low" : successRate >= 50 ? "medium" : "high");

    const apis: NormalizedFraudData["apis"] = {};
    if (result.courierData.couriers) {
      for (const c of result.courierData.couriers) {
        apis[c.courier] = {
          total_parcels: c.total,
          total_delivered_parcels: c.successful,
          total_cancelled_parcels: c.cancelled,
        };
      }
    }

    const fraudData: NormalizedFraudData = {
      mobile_number: cleanedPhone,
      total_parcels: summary?.total_parcels ?? 0,
      total_delivered: summary?.successful_deliveries ?? 0,
      total_cancel: summary?.cancelled_deliveries ?? 0,
      fraud_risk: riskLevel,
      success_rate: successRate,
      last_delivery: "",
      apis,
    };

    console.log(`Fraud check result for ${cleanedPhone}: ${fraudData.total_delivered}/${fraudData.total_parcels} (${successRate}%)`);
    return { fraudData, successRate, errorMessage: null };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Network error checking fraud for ${cleanedPhone}:`, msg);
    return {
      fraudData: null,
      successRate: null,
      errorMessage: `Network error: ${msg}`,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("Starting check-fraud function");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse body FIRST so the client-supplied apiKey can be used
    let body: { orderId?: string; skipSync?: boolean; testOnly?: boolean; apiKey?: string } = {};
    try {
      body = await req.json();
    } catch {
      // No body
    }

    // Key priority: request body → env var → DB (app_settings table)
    let fraudShieldApiKey: string | null =
      body.apiKey ?? Deno.env.get("FRAUDSHIELD_API_KEY") ?? null;

    if (!fraudShieldApiKey) {
      try {
        const { data: setting } = await supabase
          .from("app_settings" as never)
          .select("value")
          .eq("key", "fraudshield_api_key")
          .maybeSingle() as { data: { value: string } | null };
        fraudShieldApiKey = setting?.value ?? null;
      } catch {
        // Table may not exist yet — skip
      }
    }

    if (!fraudShieldApiKey) {
      return new Response(
        JSON.stringify({ error: "FraudShield API key not configured. Go to Settings → API Configuration to add it." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Test mode — just confirm the key is present and return success
    if (body.testOnly) {
      return new Response(
        JSON.stringify({ success: true, message: "API key configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Sync Shopify orders before bulk check
    if (!body.orderId && !body.skipSync) {
      console.log("Syncing Shopify orders before fraud check...");
      try {
        const authHeader = req.headers.get("authorization") ?? "";
        const apikey = req.headers.get("apikey") ?? "";
        const syncResponse = await fetch(`${supabaseUrl}/functions/v1/fetch-shopify-orders`, {
          method: "POST",
          headers: {
            ...(authHeader ? { Authorization: authHeader } : {}),
            ...(apikey ? { apikey } : {}),
            "Content-Type": "application/json",
          },
        });
        if (syncResponse.ok) {
          const syncData = await syncResponse.json();
          console.log(`Shopify sync complete: ${syncData.synced || 0} orders synced`);
        } else {
          console.error("Shopify sync failed:", await syncResponse.text());
        }
      } catch (syncError) {
        console.error("Error syncing Shopify orders:", syncError);
      }
    }

    // ── Single-order check ───────────────────────────────────────────────
    if (body.orderId) {
      const { data: order, error: fetchError } = await supabase
        .from("orders")
        .select("id, phone, fraud_checked, fraud_data")
        .eq("id", body.orderId)
        .single();

      if (fetchError || !order) {
        return new Response(
          JSON.stringify({ error: "Order not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (!order.phone) {
        return new Response(
          JSON.stringify({ error: "Order has no phone number" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { fraudData, errorMessage } = await checkFraudStatus(order.phone, fraudShieldApiKey);

      // Store the error message inside fraud_data so the UI can display it
      const dataToStore = fraudData ?? { _error: errorMessage ?? "Unknown error" };

      await supabase
        .from("orders")
        .update({ fraud_checked: true, fraud_data: dataToStore })
        .eq("id", order.id);

      const { data: updatedOrder } = await supabase
        .from("orders")
        .select("*")
        .eq("id", body.orderId)
        .single();

      return new Response(
        JSON.stringify({ success: true, order: updatedOrder, fraudError: errorMessage }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Bulk check: latest 15 orders ─────────────────────────────────────
    const { data: orders, error: fetchError } = await supabase
      .from("orders")
      .select("id, shopify_order_id, phone, fraud_checked, fraud_data")
      .order("shopify_order_id", { ascending: false })
      .limit(15);

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch orders", details: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ordersToCheck = (orders || []).filter(o => !o.fraud_data && o.phone);
    console.log(`Found ${ordersToCheck.length} orders to check`);

    let checkedCount = 0;
    let successCount = 0;

    for (const order of ordersToCheck) {
      if (checkedCount > 0) await delay(1500);

      const { fraudData, errorMessage } = await checkFraudStatus(order.phone, fraudShieldApiKey);
      checkedCount++;

      const bulkDataToStore = fraudData ?? { _error: errorMessage ?? "Unknown error" };

      const { error: updateError } = await supabase
        .from("orders")
        .update({ fraud_checked: true, fraud_data: bulkDataToStore })
        .eq("id", order.id);

      if (updateError) {
        console.error(`Error updating order ${order.id}:`, updateError);
      } else if (fraudData) {
        successCount++;
      }
    }

    console.log(`Fraud check complete: ${successCount}/${checkedCount} successful`);

    const { data: allOrders } = await supabase
      .from("orders")
      .select("*")
      .order("shopify_order_id", { ascending: false });

    return new Response(
      JSON.stringify({ success: true, checked: checkedCount, successful: successCount, orders: allOrders || [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
