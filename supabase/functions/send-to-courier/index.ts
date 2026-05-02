import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("Starting send-to-courier function");

    const { orderId } = await req.json();

    if (!orderId) {
      return new Response(
        JSON.stringify({ error: "Order ID is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Steadfast credentials
    const apiKey = Deno.env.get("STEADFAST_API_KEY");
    const secretKey = Deno.env.get("STEADFAST_SECRET_KEY");

    if (!apiKey || !secretKey) {
      console.error("Missing Steadfast credentials");
      return new Response(
        JSON.stringify({ error: "Missing courier credentials" }),
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

    // Check if already sent
    if (order.sent_to_courier) {
      return new Response(
        JSON.stringify({ error: "Order already sent to courier", consignment_id: order.consignment_id }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean phone number for Steadfast (needs 11 digits starting with 01)
    let cleanPhone = (order.phone || "").replace(/\D/g, ""); // Remove all non-digits

    // Handle +880 or 880 prefix (Bangladesh country code)
    if (cleanPhone.startsWith("880")) {
      cleanPhone = cleanPhone.slice(3); // Remove 880 prefix
      if (!cleanPhone.startsWith("0")) {
        cleanPhone = "0" + cleanPhone; // Add leading 0 if not present
      }
    }

    // Validate phone
    if (cleanPhone.length !== 11 || !cleanPhone.startsWith("01")) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number format. Must be 11 digits starting with 01" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate COD amount (price + delivery charge)
    // order.price is the subtotal from Shopify, which already includes quantity
    const productSubtotal = (order.price || 0);
    const deliveryCharge = (order.delivery_rate || 0);
    const codAmount = productSubtotal + deliveryCharge;

    console.log(`COD Calculation: Subtotal(${productSubtotal}) + Delivery(${deliveryCharge}) = ${codAmount}`);


    // Prepare Steadfast payload
    const steadfastPayload = {
      invoice: order.order_number.replace("#", ""),
      recipient_name: order.customer_name || "Customer",
      recipient_phone: cleanPhone,
      recipient_address: order.address || "No address provided",
      cod_amount: codAmount,
      note: `Product: ${order.product || "N/A"}, Qty: ${order.quantity || 1}`,
    };

    console.log("Sending to Steadfast:", JSON.stringify(steadfastPayload));

    // Send to Steadfast API
    const steadfastResponse = await fetch("https://portal.packzy.com/api/v1/create_order", {
      method: "POST",
      headers: {
        "Api-Key": apiKey,
        "Secret-Key": secretKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(steadfastPayload),
    });

    const steadfastData = await steadfastResponse.json();
    console.log("Steadfast response:", JSON.stringify(steadfastData));

    if (steadfastData.status !== 200) {
      // Update order with error
      await supabase
        .from("orders")
        .update({
          courier_message: steadfastData.message || "Failed to create consignment",
        })
        .eq("id", orderId);

      return new Response(
        JSON.stringify({ error: steadfastData.message || "Failed to send to courier", details: steadfastData }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update order with consignment details
    const consignment = steadfastData.consignment;
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        sent_to_courier: true,
        consignment_id: consignment.consignment_id,
        tracking_code: consignment.tracking_code,
        courier_status: consignment.status,
        courier_message: "Sent to Steadfast successfully",
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
        message: "Order sent to courier successfully",
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
