// AI action tool schemas, dispatcher, and helpers for Order Chat mutations.
// Imported by server/index.js. Pure logic lives here so it's unit-testable.

export const AI_ACTION_TOOLS = [
  {
    type: "function",
    name: "update_product",
    description: "Update core fields of an existing product. Use when the merchant asks to change a product's name, price, compare-at price, COG, stock (only when the product has NO variants), or published state. Set unused fields to null.",
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
          required: ["name", "selling_price", "compare_at_price", "cog", "stock_quantity", "published"],
          properties: {
            name:             { type: ["string", "null"] },
            selling_price:    { type: ["number", "null"], minimum: 0 },
            compare_at_price: { type: ["number", "null"], minimum: 0 },
            cog:              { type: ["number", "null"], minimum: 0 },
            stock_quantity:   { type: ["integer", "null"], minimum: 0, description: "Only when product has no variants. Set to null if not updating." },
            published:        { type: ["boolean", "null"] },
          },
        },
      },
    },
  },
  {
    type: "function",
    name: "update_variant",
    description: "Update a single product variant's stock, COG, price adjustment, or attributes. This is the tool for 'add 50 stock to M size of product X' — resolve the variant by matching the attributes (e.g. size:M) against the variants list in PRODUCTS & STOCK context. Set unused fields to null.",
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
          required: ["stock_quantity", "cog", "price_adjustment", "attributes"],
          properties: {
            stock_quantity:   { type: ["integer", "null"], minimum: 0 },
            cog:              { type: ["number", "null"], minimum: 0 },
            price_adjustment: { type: ["number", "null"] },
            attributes:       { type: ["string", "null"], description: "JSON object of attribute key-value pairs, e.g. \"{\\\"size\\\":\\\"M\\\",\\\"color\\\":\\\"red\\\"}\". Set to null if not updating." },
          },
        },
      },
    },
  },
  {
    type: "function",
    name: "update_order",
    description: "Update an order's status, notes, or fulfillment status. Use for 'cancel order #1234', 'mark #1001 as confirmed', 'add a note to #998'. Set unused fields to null.",
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
          required: ["status", "fulfillment_status", "notes"],
          properties: {
            status:             { type: ["string", "null"], enum: ["pending", "confirmed", "cancelled", null] },
            fulfillment_status: { type: ["string", "null"] },
            notes:              { type: ["string", "null"] },
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
    description: "Create a new product with optional variants. Use when the merchant asks to add a product that doesn't exist yet. Set optional fields you don't need to null and variants to an empty array if none.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["name", "description", "selling_price", "compare_at_price", "cog", "stock_quantity", "published", "variants"],
      properties: {
        name:             { type: "string" },
        description:      { type: ["string", "null"] },
        selling_price:    { type: ["number", "null"], minimum: 0 },
        compare_at_price: { type: ["number", "null"], minimum: 0 },
        cog:              { type: ["number", "null"], minimum: 0 },
        stock_quantity:   { type: ["integer", "null"], minimum: 0 },
        published:        { type: ["boolean", "null"] },
        variants: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["attributes", "stock_quantity", "cog", "price_adjustment"],
            properties: {
              attributes:       { type: "string", description: "JSON object of attribute key-value pairs, e.g. \"{\\\"size\\\":\\\"M\\\",\\\"color\\\":\\\"red\\\"}\"" },
              stock_quantity:   { type: "integer", minimum: 0 },
              cog:              { type: ["number", "null"], minimum: 0 },
              price_adjustment: { type: ["number", "null"] },
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

// ── executeAiAction: the single dispatcher the /apply route calls ──
// helpers = { saveProductStock, getUniqueProductSlug, purgeProductCache,
//             generateProductEmbedding, checkFraudStatus, normalizeBdPhone,
//             sendBulkSms, getOrgSettings }
// All queries filter by orgId. Throws if the target row is missing in this org.

export async function executeAiAction({ supabase, orgId, userId, tool, args, helpers = {} }) {
  switch (tool) {
    case "update_product": {
      const before = await getProductForAudit(supabase, orgId, args.product_id);
      if (!before) throw new Error("Product not found in your organization");
      const update = {};
      const allowed = ["name", "url", "image_url", "selling_price", "cog", "published", "description", "compare_at_price"];
      for (const k of allowed) if (args.fields?.[k] != null) update[k] = args.fields[k];
      const hasStock = args.fields?.stock_quantity != null;
      if (!Object.keys(update).length && !hasStock) throw new Error("Nothing to update");
      if (update.published === true) {
        update.slug = await helpers.getUniqueProductSlug(supabase, orgId, args.product_id, before.slug, update.name || before.name);
        update.published_at = new Date().toISOString();
      } else if (update.published === false) {
        update.published_at = null;
      }
      let after = before;
      if (Object.keys(update).length) {
        const { data, error } = await supabase.from("products").update(update)
          .eq("id", args.product_id).eq("org_id", orgId).select().single();
        if (error) throw error;
        after = data;
      }
      if (hasStock) await helpers.saveProductStock(orgId, args.product_id, args.fields.stock_quantity);
      const onlyStock = hasStock && Object.keys(update).length === 0;
      const isUnpublishing = update.published === false;
      if (!onlyStock && (after.published || isUnpublishing)) {
        helpers.purgeProductCache(orgId, args.product_id, { listChanged: update.published !== undefined, warm: !isUnpublishing }).catch(() => {});
      }
      if (update.image_url && after.image_url) {
        helpers.generateProductEmbedding(after.image_url).then(({ embedding, description }) => {
          if (embedding) {
            const vectorStr = `[${embedding.join(",")}]`;
            supabase.from("products").update({ image_embedding: vectorStr, image_description: description })
              .eq("id", after.id).eq("org_id", orgId).then(() => {});
          }
        }).catch(() => {});
      }
      return { before, after: { ...after, stock_quantity: hasStock ? Math.max(0, parseInt(args.fields.stock_quantity, 10) || 0) : after.stock_quantity } };
    }

    case "update_variant": {
      const before = await getVariantForAudit(supabase, orgId, args.product_id, args.variant_id);
      if (!before) throw new Error("Variant not found in your organization");
      const patch = {};
      if (args.fields?.attributes != null) {
        let attrs = args.fields.attributes;
        if (typeof attrs === "string") {
          try { attrs = JSON.parse(attrs); } catch { throw new Error("attributes must be valid JSON"); }
        }
        if (typeof attrs !== "object" || Object.keys(attrs).length === 0)
          throw new Error("attributes must be a non-empty object");
        patch.attributes = Object.fromEntries(
          Object.entries(attrs).map(([k, v]) => [k.trim().toLowerCase(), String(v).trim()])
        );
      }
      if (args.fields?.cog != null) patch.cog = parseFloat(args.fields.cog) || 0;
      if (args.fields?.stock_quantity != null) patch.stock_quantity = Math.max(0, parseInt(args.fields.stock_quantity, 10) || 0);
      if (args.fields?.price_adjustment != null) patch.price_adjustment = parseFloat(args.fields.price_adjustment) || 0;
      const { data, error } = await supabase.from("product_variants").update(patch)
        .eq("id", args.variant_id).eq("product_id", args.product_id).eq("org_id", orgId).select().single();
      if (error) throw error;
      return { before, after: data };
    }

    case "update_order": {
      const before = await getOrderForAudit(supabase, orgId, args.order_id);
      if (!before) throw new Error("Order not found in your organization");
      const allowed = ["status", "notes", "fulfillment_status"];
      const update = {};
      for (const k of allowed) if (args.fields?.[k] != null) update[k] = args.fields[k];
      if (!Object.keys(update).length) throw new Error("Nothing to update");
      await supabase.from("orders").update(update).eq("id", args.order_id).eq("org_id", orgId);
      const { data, error } = await supabase.from("orders").select("*").eq("id", args.order_id).eq("org_id", orgId).single();
      if (error) throw error;
      return { before, after: data };
    }

    case "dispatch_to_courier": {
      const before = await getOrdersForAudit(supabase, orgId, args.order_ids);
      if (before.length !== args.order_ids.length) throw new Error("One or more orders not found in your organization");
      const results = [];
      for (const orderId of args.order_ids) {
        const order = before.find((o) => o.id === orderId);
        if (order.sent_to_courier) { results.push({ orderId, skipped: "already sent", consignment_id: order.consignment_id }); continue; }
        const cfg = await helpers.getOrgSettings(orgId, args.courier === "steadfast"
          ? ["steadfast_api_key", "steadfast_secret_key"]
          : ["pathao_client_id", "pathao_client_secret", "pathao_username", "pathao_password", "pathao_store_id"]);
        if (args.courier === "steadfast") {
          results.push(await dispatchOneSteadfast(supabase, orgId, order, cfg));
        } else {
          results.push(await dispatchOnePathao(supabase, orgId, order, cfg, helpers));
        }
      }
      const after = await getOrdersForAudit(supabase, orgId, args.order_ids);
      return { before, after: { results, orders: after } };
    }

    case "check_fraud": {
      const apiKey = (process.env.FRAUDSHIELD_API_KEY || "").trim();
      if (!apiKey) throw new Error("FraudShield API key not configured in environment");
      const results = [];
      for (const phone of args.phones) {
        const { fraudData, errorMessage } = await helpers.checkFraudStatus(phone, apiKey);
        results.push({ phone, fraudData, errorMessage });
      }
      return { before: { phones: args.phones }, after: { results } };
    }

    case "create_product": {
      const row = {
        name: String(args.name || "").trim(),
        description: args.description ?? null,
        selling_price: args.selling_price != null ? parseFloat(args.selling_price) : null,
        compare_at_price: args.compare_at_price != null ? parseFloat(args.compare_at_price) : null,
        cog: args.cog != null ? parseFloat(args.cog) : 0,
        url: null, image_url: null,
        slug: args.published === true ? await helpers.getUniqueProductSlug(supabase, orgId, crypto.randomUUID(), null, String(args.name || "").trim()) : null,
        published: args.published === true,
        published_at: args.published === true ? new Date().toISOString() : null,
        source_url: "ai_chat",
        org_id: orgId,
      };
      const { data: product, error: pErr } = await supabase.from("products").insert(row).select().single();
      if (pErr) throw pErr;
      if (args.stock_quantity != null) await helpers.saveProductStock(orgId, product.id, args.stock_quantity);
      const variantRows = [];
      for (const v of args.variants || []) {
        let attrs = v.attributes;
        if (typeof attrs === "string") {
          try { attrs = JSON.parse(attrs); } catch { continue; }
        }
        if (!attrs || typeof attrs !== "object" || Object.keys(attrs).length === 0) continue;
        variantRows.push({
          product_id: product.id, org_id: orgId,
          attributes: Object.fromEntries(Object.entries(attrs).map(([k, val]) => [k.trim().toLowerCase(), String(val).trim()])),
          cog: v.cog != null ? parseFloat(v.cog) : 0,
          stock_quantity: Math.max(0, parseInt(v.stock_quantity, 10) || 0),
          price_adjustment: v.price_adjustment != null ? parseFloat(v.price_adjustment) : 0,
        });
      }
      let variants = [];
      if (variantRows.length) {
        const { data: vData, error: vErr } = await supabase.from("product_variants").insert(variantRows).select();
        if (vErr) throw vErr;
        variants = vData;
      }
      if (args.published === true) helpers.purgeProductCache(orgId, product.id, { listChanged: true, warm: true }).catch(() => {});
      return { before: null, after: { product, variants } };
    }

    default:
      throw new Error(`Unknown AI action tool: ${tool}`);
  }
}

// ── single-order courier dispatch helpers (used by dispatch_to_courier) ──

async function dispatchOneSteadfast(supabase, orgId, order, cfg) {
  const apiKey = cfg["steadfast_api_key"];
  const secretKey = cfg["steadfast_secret_key"];
  if (!apiKey || !secretKey) throw new Error("Steadfast credentials not configured. Go to Settings → Integrations.");
  const cleanedPhone = normalizeBdPhoneLocal(order.phone || "");
  if (!cleanedPhone || cleanedPhone.length !== 11 || !cleanedPhone.startsWith("01"))
    return { orderId: order.id, error: "Invalid phone number" };
  const invoice = `ORD-${String(order.order_number || order.id.slice(-8)).replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase()}`;
  const payload = {
    invoice,
    recipient_name: order.customer_name || "Customer",
    recipient_phone: cleanedPhone,
    recipient_address: order.address || "No address provided",
    cod_amount: (parseFloat(order.price) || 0) + (parseFloat(order.delivery_rate) || 0),
    note: order.product ? `${order.quantity || 1}x ${order.product}` : "N/A",
  };
  const sfRes = await fetch("https://portal.packzy.com/api/v1/create_order", {
    method: "POST",
    headers: { "Api-Key": apiKey, "Secret-Key": secretKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const sfData = await sfRes.json();
  if (sfData.status !== 200) {
    const sfError = sfData.message || (sfData.errors ? JSON.stringify(sfData.errors) : "Steadfast rejected the order");
    await supabase.from("orders").update({ courier_message: sfError }).eq("id", order.id).eq("org_id", orgId);
    return { orderId: order.id, error: sfError };
  }
  const consignment = sfData.consignment;
  await supabase.from("orders").update({
    sent_to_courier: true,
    consignment_id: String(consignment.consignment_id),
    tracking_code: consignment.tracking_code,
    courier_status: consignment.status,
    courier_message: "Sent to Steadfast successfully",
    courier_name: "steadfast",
  }).eq("id", order.id).eq("org_id", orgId);
  const { data: updated } = await supabase.from("orders").select("*").eq("id", order.id).eq("org_id", orgId).single();
  return { orderId: order.id, consignment, order: updated };
}

async function dispatchOnePathao(supabase, orgId, order, cfg, helpers) {
  // Pathao token fetch (not cached, per AGENTS.md §7)
  const tokenRes = await fetch("https://api.pathao.com/v1/issues/access-token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: cfg["pathao_client_id"], client_secret: cfg["pathao_client_secret"],
      username: cfg["pathao_username"], password: cfg["pathao_password"], grant_type: "password",
    }),
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenData.access_token) return { orderId: order.id, error: "Pathao auth failed" };
  const cleanedPhone = normalizeBdPhoneLocal(order.phone || "");
  if (!cleanedPhone || cleanedPhone.length !== 11 || !cleanedPhone.startsWith("01"))
    return { orderId: order.id, error: "Invalid phone number" };
  const payload = {
    store_id: parseInt(cfg["pathao_store_id"], 10),
    merchant_order_id: String(order.order_number || order.id.slice(-8)),
    recipient_name: order.customer_name || "Customer",
    recipient_phone: cleanedPhone,
    recipient_address: order.address || "No address provided",
    recipient_city: "1",
    recipient_zone: "1",
    recipient_area: "1",
    delivery_type: "48",
    item_type: "2",
    item_quantity: order.quantity || 1,
    item_weight: "0.5",
    amount_to_collect: (parseFloat(order.price) || 0) + (parseFloat(order.delivery_rate) || 0),
    special_instruction: order.product ? `${order.quantity || 1}x ${order.product}` : "N/A",
  };
  const pRes = await fetch("https://api.pathao.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenData.access_token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const pData = await pRes.json().catch(() => ({}));
  if (pData.code !== 200) {
    const pError = pData.message || "Pathao rejected the order";
    await supabase.from("orders").update({ courier_message: pError }).eq("id", order.id).eq("org_id", orgId);
    return { orderId: order.id, error: pError };
  }
  const consignment = pData.data || {};
  await supabase.from("orders").update({
    sent_to_courier: true,
    consignment_id: String(consignment.consignment_id || consignment.order_id || ""),
    tracking_code: String(consignment.tracking_code || ""),
    courier_status: "assigned",
    courier_message: "Sent to Pathao successfully",
    courier_name: "pathao",
  }).eq("id", order.id).eq("org_id", orgId);
  const { data: updated } = await supabase.from("orders").select("*").eq("id", order.id).eq("org_id", orgId).single();
  return { orderId: order.id, consignment, order: updated };
}

// local phone normalizer (mirrors server/index.js normalizeBdPhone; kept here to avoid circular import)
function normalizeBdPhoneLocal(phone) {
  if (!phone) return null;
  let p = String(phone).replace(/[^\d+]/g, "");
  if (p.startsWith("+880")) p = "0" + p.slice(4);
  else if (p.startsWith("880")) p = "0" + p.slice(3);
  else if (p.startsWith("+")) p = p.slice(1);
  if (p.length === 13 && p.startsWith("880")) p = "0" + p.slice(3);
  if (p.length === 10 && p.startsWith("1")) p = "0" + p;
  if (p.length === 11 && p.startsWith("01")) return p;
  return null;
}
