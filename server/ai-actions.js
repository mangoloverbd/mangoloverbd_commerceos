// AI action tool schemas, dispatcher, and helpers for Order Chat mutations.
// Imported by server/index.js. Pure logic lives here so it's unit-testable.

export const AI_ACTION_TOOLS = [
  {
    type: "function",
    name: "update_product",
    description: "Update core fields of an existing product. Use when the merchant asks to change a product's name, price, compare-at price, COG, stock (only when the product has NO variants), or published state.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["product_id", "fields"],
      properties: {
        product_id: { type: "string", description: "UUID of the product, from the PRODUCTS & STOCK context" },
        fields: {
          type: "object",
          additionalProperties: false,
          properties: {
            name:             { type: "string" },
            selling_price:    { type: "number", minimum: 0 },
            compare_at_price: { type: ["number", "null"], minimum: 0 },
            cog:              { type: "number", minimum: 0 },
            stock_quantity:   { type: "integer", minimum: 0, description: "Only when product has no variants" },
            published:        { type: "boolean" },
          },
        },
      },
    },
  },
  {
    type: "function",
    name: "update_variant",
    description: "Update a single product variant's stock, COG, price adjustment, or attributes. This is the tool for 'add 50 stock to M size of product X' — resolve the variant by matching the attributes (e.g. size:M) against the variants list in PRODUCTS & STOCK context.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["product_id", "variant_id", "fields"],
      properties: {
        product_id: { type: "string" },
        variant_id: { type: "string", description: "UUID of the variant from the variants list" },
        fields: {
          type: "object",
          additionalProperties: false,
          properties: {
            stock_quantity:   { type: "integer", minimum: 0 },
            cog:              { type: "number", minimum: 0 },
            price_adjustment: { type: "number" },
            attributes:       { type: "object", additionalProperties: { type: "string" } },
          },
        },
      },
    },
  },
  {
    type: "function",
    name: "update_order",
    description: "Update an order's status, notes, or fulfillment status. Use for 'cancel order #1234', 'mark #1001 as confirmed', 'add a note to #998'.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["order_id", "fields"],
      properties: {
        order_id: { type: "string", description: "UUID of the order" },
        fields: {
          type: "object",
          additionalProperties: false,
          properties: {
            status:             { type: "string", enum: ["pending", "confirmed", "cancelled"] },
            fulfillment_status: { type: "string" },
            notes:              { type: "string" },
          },
        },
      },
    },
  },
  {
    type: "function",
    name: "dispatch_to_courier",
    description: "Send one or more orders to a courier (Steadfast or Pathao). High-risk: external side effect, costs money. Do NOT batch large numbers without the merchant naming each order.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["courier", "order_ids"],
      properties: {
        courier:   { type: "string", enum: ["steadfast", "pathao"] },
        order_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 25 },
      },
    },
  },
  {
    type: "function",
    name: "check_fraud",
    description: "Run a FraudShield phone-number fraud check. Pass raw phone; server normalizes to BD format before calling FraudShield.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["phones"],
      properties: {
        phones: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 50 },
      },
    },
  },
  {
    type: "function",
    name: "create_product",
    description: "Create a new product with optional variants. Use when the merchant asks to add a product that doesn't exist yet.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["name"],
      properties: {
        name:             { type: "string" },
        description:      { type: ["string", "null"] },
        selling_price:    { type: ["number", "null"], minimum: 0 },
        compare_at_price: { type: ["number", "null"], minimum: 0 },
        cog:              { type: ["number", "null"], minimum: 0 },
        stock_quantity:   { type: "integer", minimum: 0 },
        published:        { type: "boolean" },
        variants: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["attributes", "stock_quantity"],
            properties: {
              attributes:       { type: "object", additionalProperties: { type: "string" } },
              stock_quantity:   { type: "integer", minimum: 0 },
              cog:              { type: "number", minimum: 0 },
              price_adjustment: { type: "number" },
            },
          },
        },
      },
    },
  },
];

export const askUserTool = {
  type: "function",
  name: "ask_user",
  description: "Ask the merchant a clarifying question when the request is ambiguous. Call this BEFORE calling any mutation tool if you cannot uniquely resolve the target product/variant/order or the intent.",
  strict: true,
  parameters: {
    type: "object",
    additionalProperties: false,
    required: ["questions"],
    properties: {
      questions: {
        type: "array", minItems: 1, maxItems: 5,
        items: {
          type: "object", additionalProperties: false,
          required: ["q", "type", "options"],
          properties: {
            q:       { type: "string" },
            type:    { type: "string", enum: ["radio", "check"] },
            options: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
          },
        },
      },
    },
  },
};

// ── Audit readers (snapshot BEFORE, and 404 if row missing/in another org) ──

export async function getProductForAudit(supabase, orgId, productId) {
  const { data, error } = await supabase
    .from("products").select("*")
    .eq("id", productId).eq("org_id", orgId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getVariantForAudit(supabase, orgId, productId, variantId) {
  const { data, error } = await supabase
    .from("product_variants").select("*")
    .eq("id", variantId).eq("product_id", productId).eq("org_id", orgId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getOrderForAudit(supabase, orgId, orderId) {
  const { data, error } = await supabase
    .from("orders").select("*")
    .eq("id", orderId).eq("org_id", orgId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getOrdersForAudit(supabase, orgId, orderIds) {
  const { data, error } = await supabase
    .from("orders").select("*")
    .in("id", orderIds).eq("org_id", orgId);
  if (error) throw error;
  return data || [];
}

// ── buildRecommendation: turn a model function_call into a card payload ──
// Returns { recommendation: {key, summary, args, signal, tone, label, cta}, alternatives: [...] }
// ctx = { products: [{id,name,...}], variantsMap: {productId:[{id,attributes,stock_quantity}]}, orders: [{id,order_number,...}] }

export function buildRecommendation(tool, args, ctx = {}) {
  const { products = [], variantsMap = {}, orders = [] } = ctx;
  const empty = { recommendation: null, alternatives: [] };

  if (tool === "update_variant") {
    const product = products.find((p) => p.id === args.product_id);
    const variants = variantsMap[args.product_id] || [];
    const variant = variants.find((v) => v.id === args.variant_id);
    if (!product || !variant) return empty;
    const attrLabel = Object.values(variant.attributes || {}).filter(Boolean).join(" · ") || "variant";
    const cur = variant.stock_quantity ?? 0;
    const next = args.fields?.stock_quantity;
    if (next == null) {
      return {
        recommendation: {
          key: "update", summary: `Update ${product.name} / ${attrLabel}`, args,
          signal: 2, tone: "orange", label: "Needs review", cta: "Apply",
        },
        alternatives: [],
      };
    }
    const delta = next - cur;
    return {
      recommendation: {
        key: "add",
        summary: `Set ${product.name} / ${attrLabel} stock to ${next} (was ${cur}, ${delta >= 0 ? "+" : ""}${delta})`,
        args, signal: 3, tone: "green", label: "High confidence", cta: "Apply",
      },
      alternatives: [
        {
          key: "set",
          summary: `Set ${product.name} / ${attrLabel} stock to ${next} (replace, not add)`,
          args: { ...args, fields: { ...args.fields, stock_quantity: next } },
          signal: 1, tone: "orange", label: "Needs review", cta: "Apply",
        },
      ],
    };
  }

  if (tool === "update_product") {
    const product = products.find((p) => p.id === args.product_id);
    if (!product) return empty;
    const fields = Object.entries(args.fields || {}).map(([k, v]) => `${k}=${v}`).join(", ");
    return {
      recommendation: {
        key: "update", summary: `Update ${product.name}: ${fields}`, args,
        signal: 3, tone: "green", label: "High confidence", cta: "Apply",
      },
      alternatives: [],
    };
  }

  if (tool === "update_order") {
    const order = orders.find((o) => o.id === args.order_id);
    const label = order ? `#${order.order_number}` : args.order_id.slice(-6);
    const fields = Object.entries(args.fields || {}).map(([k, v]) => `${k}=${v}`).join(", ");
    return {
      recommendation: {
        key: "update", summary: `Update order ${label}: ${fields}`, args,
        signal: 2, tone: "orange", label: "Needs review", cta: "Apply",
      },
      alternatives: [],
    };
  }

  if (tool === "dispatch_to_courier") {
    const nums = args.order_ids.map((id) => {
      const o = orders.find((x) => x.id === id);
      return o ? `#${o.order_number}` : id.slice(-6);
    });
    return {
      recommendation: {
        key: "dispatch",
        summary: `Send ${nums.length} order(s) to ${args.courier}: ${nums.join(", ")}`,
        args, signal: 2, tone: "orange", label: "Needs review", cta: "Dispatch",
      },
      alternatives: [],
    };
  }

  if (tool === "check_fraud") {
    return {
      recommendation: {
        key: "check",
        summary: `Run FraudShield check on ${args.phones.length} phone(s): ${args.phones.join(", ")}`,
        args, signal: 2, tone: "orange", label: "Needs review", cta: "Run check",
      },
      alternatives: [],
    };
  }

  if (tool === "create_product") {
    const v = args.variants?.length ? ` with ${args.variants.length} variant(s)` : "";
    return {
      recommendation: {
        key: "create",
        summary: `Create product "${args.name}"${v}`,
        args, signal: 3, tone: "green", label: "High confidence", cta: "Create",
      },
      alternatives: [],
    };
  }

  return empty;
}
