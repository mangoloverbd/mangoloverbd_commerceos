import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { subDays } from "https://esm.sh/date-fns@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const { data: { user }, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve org_id
    const { data: settingRow } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", `user:${user.id}:org_id`)
      .maybeSingle();
    const orgId = settingRow?.value ?? null;

    const twoDaysAgo = subDays(new Date(), 2).toISOString();

    const ordersQuery = supabase
      .from("orders")
      .select("id, order_number, customer_name, phone, product, price, status, sent_to_courier, created_at, notes, courier_status")
      .or(`and(status.eq.pending,created_at.lt.${twoDaysAgo}),and(status.eq.confirmed,sent_to_courier.eq.false)`)
      .order("created_at", { ascending: true })
      .limit(50);

    if (orgId) ordersQuery.eq("org_id", orgId);

    const { data: orders, error: ordersErr } = await ordersQuery;
    if (ordersErr) throw ordersErr;

    if (!orders || orders.length === 0) {
      return new Response(JSON.stringify({ insights: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const stalePending = orders.filter((o) => o.status === "pending");
    const unsentConfirmed = orders.filter((o) => o.status === "confirmed" && !o.sent_to_courier);

    const orderSummary = orders.map((o) => ({
      "#": o.order_number,
      customer: o.customer_name,
      product: o.product,
      price: o.price,
      status: o.status,
      sent: o.sent_to_courier ? 1 : 0,
      daysOld: Math.floor((now.getTime() - new Date(o.created_at).getTime()) / 86400000),
      notes: o.notes,
    }));

    const systemPrompt = `You are an intelligent order operations assistant for a Bangladeshi e-commerce business.

You are given two groups of orders that need attention:
1. STALE PENDING: ${stalePending.length} orders that have been pending for more than 2 days
2. UNSENT CONFIRMED: ${unsentConfirmed.length} confirmed orders not yet dispatched to courier

Your job: generate SHORT, actionable AI insights for each group. Each insight must be 1-2 sentences max. Be direct, practical, and mention specific numbers or patterns you notice (e.g. repeat customers, high-value orders, product patterns, time clusters).

Respond with valid JSON only — no markdown, no extra text:
{
  "stalePending": {
    "headline": "short 5-8 word summary",
    "insight": "1-2 sentence actionable insight mentioning specific patterns"
  },
  "unsentConfirmed": {
    "headline": "short 5-8 word summary",
    "insight": "1-2 sentence actionable insight mentioning specific patterns"
  }
}

Only include a key if that group has orders. If stalePending is empty, omit it. Same for unsentConfirmed.

Orders data:
${JSON.stringify(orderSummary)}`;

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: systemPrompt }],
        temperature: 0.4,
        max_tokens: 300,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("OpenAI error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-alerts error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
