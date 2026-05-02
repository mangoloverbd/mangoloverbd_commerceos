import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { orderText } = await req.json()

    if (!orderText) {
      return new Response(
        JSON.stringify({ error: 'Order text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured")
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an order extraction assistant for a Bangladeshi e-commerce business. Extract customer details from unstructured text (which may be in Bangla, English, or mixed). You MUST extract:
- customer_name: The customer's full name
- phone: Phone number (Bangladeshi format, e.g. 01XXXXXXXXX)
- address: Full delivery address
- product: Product name/description
- quantity: Number of items (default 1)
- price: Price in BDT (number only, 0 if not found)
- location_type: "inside_dhaka" or "outside_dhaka" based on the address

Dhaka areas include: Dhaka, Dhanmondi, Gulshan, Banani, Mirpur, Mohammadpur, Uttara, Badda, Khilgaon, Motijheel, Paltan, Farmgate, Shahbagh, Tejgaon, Azampur, Kurmitola, New Market, Rampura, Bashundhara, Mohakhali, Banasree, Jatrabari, Demra, Keraniganj, Savar, Gazipur, Narayanganj, Tongi.

If any field is genuinely not present in the text, use reasonable defaults but try your best to extract everything.`
          },
          {
            role: "user",
            content: `Extract order details from this text:\n\n${orderText}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_order",
              description: "Extract structured order details from customer text",
              parameters: {
                type: "object",
                properties: {
                  customer_name: { type: "string", description: "Customer's full name" },
                  phone: { type: "string", description: "Phone number" },
                  address: { type: "string", description: "Delivery address" },
                  product: { type: "string", description: "Product name" },
                  quantity: { type: "number", description: "Quantity ordered" },
                  price: { type: "number", description: "Price in BDT" },
                  location_type: { type: "string", enum: ["inside_dhaka", "outside_dhaka"] }
                },
                required: ["customer_name", "phone", "address", "product", "quantity", "price", "location_type"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_order" } }
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("OpenAI API error:", response.status, errorText)
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const aiResult = await response.json()
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0]
    
    if (!toolCall?.function?.arguments) {
      throw new Error("OpenAI did not return structured extraction")
    }

    const extracted = JSON.parse(toolCall.function.arguments)
    const deliveryCharge = extracted.location_type === "inside_dhaka" ? 80 : 120

    const extractedOrder = {
      customer_name: extracted.customer_name || "Unknown Customer",
      phone: extracted.phone || "No phone found",
      address: extracted.address || "No address provided",
      product: extracted.product || "Unknown Product",
      quantity: extracted.quantity || 1,
      price: extracted.price || 0,
      delivery_charge: deliveryCharge,
      location_type: extracted.location_type || "outside_dhaka"
    }

    return new Response(
      JSON.stringify({ extractedOrder }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error("Extraction error:", error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
