import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PATHAO_BASE_URL = "https://api-hermes.pathao.com";

async function getPathaoToken(): Promise<string> {
  const clientId = Deno.env.get("PATHAO_CLIENT_ID");
  const clientSecret = Deno.env.get("PATHAO_CLIENT_SECRET");
  const username = Deno.env.get("PATHAO_USERNAME");
  const password = Deno.env.get("PATHAO_PASSWORD");

  if (!clientId || !clientSecret || !username || !password) {
    throw new Error("Missing Pathao credentials");
  }

  const response = await fetch(`${PATHAO_BASE_URL}/aladdin/api/v1/issue-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      username: username,
      password: password,
      grant_type: "password",
    }),
  });

  const data = await response.json();
  console.log("Pathao token response status:", response.status);

  if (!response.ok || !data.access_token) {
    console.error("Pathao token error:", JSON.stringify(data));
    throw new Error(data.message || "Failed to get Pathao access token");
  }

  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("Starting send-to-pathao function");

    const { orderId } = await req.json();

    if (!orderId) {
      return new Response(
        JSON.stringify({ error: "Order ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const storeId = Deno.env.get("PATHAO_STORE_ID");
    if (!storeId) {
      return new Response(
        JSON.stringify({ error: "Missing Pathao store ID" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the order
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (fetchError || !order) {
      console.error("Error fetching order:", fetchError);
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean phone number (needs 11 digits starting with 01)
    let cleanPhone = (order.phone || "").replace(/\D/g, "");
    if (cleanPhone.startsWith("880")) {
      cleanPhone = cleanPhone.slice(3);
      if (!cleanPhone.startsWith("0")) {
        cleanPhone = "0" + cleanPhone;
      }
    }

    if (cleanPhone.length !== 11 || !cleanPhone.startsWith("01")) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number format. Must be 11 digits starting with 01" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate COD amount
    const productSubtotal = order.price || 0;
    const deliveryCharge = order.delivery_rate || 0;
    const codAmount = productSubtotal + deliveryCharge;

    console.log(`COD: Subtotal(${productSubtotal}) + Delivery(${deliveryCharge}) = ${codAmount}`);

    // Get Pathao access token
    const accessToken = await getPathaoToken();

    // Prepare Pathao order payload
    const pathaoPayload: Record<string, unknown> = {
      store_id: parseInt(storeId),
      merchant_order_id: order.order_number.replace("#", ""),
      recipient_name: order.customer_name || "Customer",
      recipient_phone: cleanPhone,
      recipient_address: order.address || "No address provided",
      delivery_type: 48, // Normal delivery
      item_type: 2, // Parcel
      special_instruction: `Product: ${order.product || "N/A"}, Qty: ${order.quantity || 1}`,
      item_quantity: order.quantity || 1,
      item_weight: 0.5,
      amount_to_collect: codAmount,
    };

    console.log("Sending to Pathao:", JSON.stringify(pathaoPayload));

    // Send to Pathao API
    const pathaoResponse = await fetch(`${PATHAO_BASE_URL}/aladdin/api/v1/orders`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(pathaoPayload),
    });

    const pathaoData = await pathaoResponse.json();
    console.log("Pathao response:", JSON.stringify(pathaoData));

    if (!pathaoResponse.ok) {
      await supabase
        .from("orders")
        .update({
          courier_message: pathaoData.message || "Failed to create Pathao order",
        })
        .eq("id", orderId);

      return new Response(
        JSON.stringify({ error: pathaoData.message || "Failed to send to Pathao", details: pathaoData }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update order with Pathao consignment details
    const consignment = pathaoData.data;
    const consignmentId = consignment?.consignment_id ? String(consignment.consignment_id) : null;
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        sent_to_courier: true,
        consignment_id: consignmentId,
        tracking_code: consignmentId,
        courier_status: "pending",
        courier_message: "Sent to Pathao successfully",
      })
      .eq("id", orderId);

    if (updateError) {
      console.error("Error updating order:", updateError);
    }

    // Fetch updated order
    const { data: updatedOrder } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Order sent to Pathao successfully",
        consignment: consignment,
        order: updatedOrder,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Unexpected error", details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
