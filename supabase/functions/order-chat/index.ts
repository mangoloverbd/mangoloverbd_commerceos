import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require a valid JWT — verify_jwt is now true in config.toml so Supabase
    // will reject requests without a valid token before reaching this handler.
    // We also resolve the caller's org_id here so queries are tenant-scoped.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve caller identity
    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve org_id from app_settings (same pattern as server/index.js)
    const settingsKey = `user:${user.id}:org_id`;
    const { data: settingRow } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", settingsKey)
      .maybeSingle();
    const orgId = settingRow?.value ?? null;

    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Fetch orders scoped to this org only
    const ordersQuery = supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (orgId) ordersQuery.eq("org_id", orgId);

    const { data: orders, error } = await ordersQuery;

    if (error) {
      console.error("Error fetching orders:", error);
      throw new Error("Failed to fetch orders");
    }

    // Build order summary for context
    const totalOrders = orders?.length || 0;
    const pendingOrders = orders?.filter((o) => o.status === "pending") || [];
    const confirmedOrders = orders?.filter((o) => o.status === "confirmed") || [];
    const cancelledOrders = orders?.filter((o) => o.status === "cancelled") || [];
    const sentToCourier = orders?.filter((o) => o.sent_to_courier) || [];
    const notSentToCourier = orders?.filter((o) => !o.sent_to_courier) || [];
    const withNotes = orders?.filter((o) => o.notes) || [];
    const fraudChecked = orders?.filter((o) => o.fraud_checked) || [];

    const totalRevenue = orders?.reduce((sum, o) => sum + (o.price || 0), 0) || 0;
    const totalDeliveryCharges = orders?.reduce((sum, o) => sum + (o.delivery_rate || 0), 0) || 0;

    // Compact order data to fit within token limits - drop fraud_data (bulky JSON) and address
    const orderDetails = orders?.map((o) => ({
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
    })) || [];

    // Limit to most recent 500 orders to stay within context window
    const limitedOrders = orderDetails.slice(0, 500);

    const systemPrompt = `You are an intelligent order management assistant for Angonaloy, a Bangladeshi e-commerce business. You have access to order data below. Answer accurately.

## Response Style Rules (STRICTLY FOLLOW)
- NEVER use markdown tables. They look bad.
- Use compact numbered lists when listing orders. Format: "1. #OrderNum (Customer): detail"
- Keep answers short and direct. No filler sentences.
- Use bold for key numbers and stats.
- When showing multiple orders, group them logically (by status, by date, etc.) if it makes sense.
- Don't ask follow-up questions unless truly needed.
- Use ৳ (Taka) for currency.

## Summary
Total: ${totalOrders} | Pending: ${pendingOrders.length} | Confirmed: ${confirmedOrders.length} | Cancelled: ${cancelledOrders.length} | Sent to courier: ${sentToCourier.length} | Not sent: ${notSentToCourier.length} | With notes: ${withNotes.length} | Fraud checked: ${fraudChecked.length} | Revenue: ৳${totalRevenue} | Delivery: ৳${totalDeliveryCharges}

## Field key: #=order_number, c=customer, ph=phone, addr=address, p=product, qty=quantity, price=price, dlv=delivery_rate, st=status, fs=fulfillment_status, sent=sent_to_courier(1/0), cid=consignment_id, trk=tracking_code, cs=courier_status, fc=fraud_checked(1/0), note=notes, dt=date

## Orders (${limitedOrders.length} of ${totalOrders})
${JSON.stringify(limitedOrders)}
`;

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("order-chat error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
