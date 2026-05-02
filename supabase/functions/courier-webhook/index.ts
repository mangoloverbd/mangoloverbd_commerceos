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
    console.log("Received courier webhook");

    const payload = await req.json();
    console.log("Webhook payload:", JSON.stringify(payload));

    // Validate webhook (optional: check authorization header)
    const authHeader = req.headers.get("Authorization");
    console.log("Auth header:", authHeader);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { notification_type, consignment_id, invoice, status, tracking_message, cod_amount, delivery_charge } = payload;

    if (!consignment_id) {
      console.error("Missing consignment_id in webhook");
      return new Response(
        JSON.stringify({ status: "error", message: "Missing consignment_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find order by consignment_id
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, order_number")
      .eq("consignment_id", consignment_id)
      .single();

    if (fetchError || !order) {
      console.log(`Order not found for consignment_id: ${consignment_id}, trying invoice: ${invoice}`);
      
      // Try finding by invoice (order_number)
      if (invoice) {
        const { data: orderByInvoice, error: invoiceError } = await supabase
          .from("orders")
          .select("id, order_number")
          .eq("order_number", `#${invoice}`)
          .single();

        if (!invoiceError && orderByInvoice) {
          // Update this order
          const { error: updateError } = await supabase
            .from("orders")
            .update({
              consignment_id: consignment_id,
              courier_status: status || null,
              courier_message: tracking_message || null,
            })
            .eq("id", orderByInvoice.id);

          if (updateError) {
            console.error("Error updating order:", updateError);
          } else {
            console.log(`Updated order ${orderByInvoice.order_number} with status: ${status}`);
          }

          return new Response(
            JSON.stringify({ status: "success", message: "Webhook received successfully." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      return new Response(
        JSON.stringify({ status: "error", message: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update order with webhook data
    const updateData: Record<string, unknown> = {
      courier_message: tracking_message || null,
    };

    if (notification_type === "delivery_status" && status) {
      updateData.courier_status = status;
    }

    const { error: updateError } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", order.id);

    if (updateError) {
      console.error("Error updating order:", updateError);
      return new Response(
        JSON.stringify({ status: "error", message: "Failed to update order" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Updated order ${order.order_number} with status: ${status}, message: ${tracking_message}`);

    return new Response(
      JSON.stringify({ status: "success", message: "Webhook received successfully." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ status: "error", message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
