# Order Chat AI Mutations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admin merchants ask the Order Chat AI to mutate business data (stock, prices, orders, courier dispatch, fraud checks, product creation) with confirm-before-apply cards and an audit log.

**Architecture:** OpenAI Responses API function-calling. The server attaches `tools` only for admins, streams `function_call` items back as SSE `question`/`action` events, and never mutates from the model's call directly — the browser POSTs to a separate `/api/order-chat/apply` endpoint that re-validates admin+org and writes an `ai_action_log` row. New `server/ai-actions.js` module holds tool schemas, the `executeAiAction` dispatcher, and `buildRecommendation` so they're unit-testable; existing routes stay untouched (zero regression risk).

**Tech Stack:** Express (ESM, Node 20), Supabase (service role), OpenAI Responses API, React 18 + Vite + TypeScript, TanStack Query, Framer Motion, Phosphor Icons, Vitest.

## Global Constraints

- All DB queries in AI action execution MUST filter `.eq("org_id", orgId)` (AGENTS.md §12 rule 2).
- Every new route MUST call `getToken(req)` → `getUser(token)` → 401 guard → `getUserOrg` → role check (AGENTS.md §12 rule 3).
- All frontend API calls MUST use `apiFetch()` from `src/lib/api.ts` (AGENTS.md §12 rule 1).
- Icons: Phosphor `weight="light"` (AGENTS.md §12 rule 5). No Lucide for new icons.
- Background `#FAFAF8`, borderless panels, `rounded-[14px]`, `shadow-sm`, Geist Sans (AGENTS.md §8). No new design tokens.
- Never commit `.env` (AGENTS.md §12 rule 6).
- Run `normalizeBdPhone()` before any phone hits FraudShield/courier (AGENTS.md §12 rule 7) — `checkFraudStatus` already does this internally.
- New routes go in `server/index.js` in the Order Chat domain section; pure logic goes in the new `server/ai-actions.js` (genuinely standalone, testable module — exception to §12 rule 8).
- Test convention: route tests use source-text inspection (`readFileSync(server/index.js)` + substring asserts, matching `src/test/orderExtractionAiRoute.test.ts`); pure-function tests import from the module.

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `supabase/migrations/<ts>_ai_action_log.sql` | `ai_action_log` table + index + RLS | Create (via Supabase MCP `apply_migration`) |
| `server/ai-actions.js` | Tool schemas (`AI_ACTION_TOOLS`, `askUserTool`), `executeAiAction` dispatcher, `buildRecommendation`, audit-reader helpers | Create |
| `server/index.js` | Modified `/api/order-chat` (admin tools + SSE events), new `/api/order-chat/apply`, new `/api/order-chat/answer` | Modify |
| `src/components/order-chat/useAiChatStream.ts` | SSE parser → `StreamEvent` union (`delta`/`question`/`action`) | Create |
| `src/components/order-chat/AiClarifyCard.tsx` | Ports `ApprovalCard` interaction (one question at a time, pager, send) | Create |
| `src/components/order-chat/AiActionCard.tsx` | Ports `RecommendationCard` interaction (meter, alternatives, accept/reject) | Create |
| `src/pages/OrderChat.tsx` | Wire stream events to messages, render the two card types, apply/answer/reject handlers, role guard | Modify |
| `src/components/OrderChatComposer.tsx` | Cosmetic admin hint for team members | Modify |
| `src/test/aiActions.test.ts` | Unit tests for `executeAiAction`, `buildRecommendation`, tool schemas | Create |
| `src/test/orderChatMutations.test.ts` | Source-inspection tests for the new routes + admin gates | Create |
| `src/test/aiClarifyCard.test.tsx` | Component test for AiClarifyCard | Create |
| `src/test/aiActionCard.test.tsx` | Component test for AiActionCard | Create |

---

### Task 1: `ai_action_log` table

**Files:**
- Create: Supabase migration via `supabase_apply_migration` MCP tool

**Interfaces:**
- Produces: `public.ai_action_log` table with columns `id, org_id, user_id, call_id, tool, args, before_snapshot, after_snapshot, applied_at`. RLS enabled, service role bypasses.

- [ ] **Step 1: Invoke the `supabase` skill**

Load the supabase skill before writing schema SQL (AGENTS.md §12 rule 10).

- [ ] **Step 2: Apply the migration via the Supabase MCP tool**

Call `supabase_apply_migration` with:

```sql
create table if not exists public.ai_action_log (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  user_id         uuid not null,
  call_id         text not null,
  tool            text not null,
  args            jsonb not null,
  before_snapshot jsonb,
  after_snapshot  jsonb,
  applied_at      timestamptz not null default now()
);
create index if not exists ai_action_log_org_applied_idx
  on public.ai_action_log (org_id, applied_at desc);
alter table public.ai_action_log enable row level security;
```

Migration name: `create_ai_action_log`.

- [ ] **Step 3: Verify the table exists**

Call `supabase_list_tables` with schemas `["public"]` and assert `ai_action_log` is in the result.

- [ ] **Step 4: Run advisors**

Call `supabase_get_advisors` with type `security`. Fix any issue it raises about the new table (e.g. missing RLS — we enabled it, so it should be clean).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add ai_action_log table for AI mutation audit trail"
```

---

### Task 2: Tool schemas + `buildRecommendation` + audit readers (`server/ai-actions.js`)

**Files:**
- Create: `server/ai-actions.js`
- Test: `src/test/aiActions.test.ts`

**Interfaces:**
- Produces: `AI_ACTION_TOOLS` (array of 6 function schemas), `askUserTool` (object), `buildRecommendation(tool, args, ctx)`, `getProductForAudit(supabase, orgId, productId)`, `getVariantForAudit(supabase, orgId, productId, variantId)`, `getOrderForAudit(supabase, orgId, orderId)`, `getOrdersForAudit(supabase, orgId, orderIds)`.
- Consumes: nothing from earlier tasks (Task 1's table is used only by `executeAiAction` in Task 3).

- [ ] **Step 1: Write the failing test for tool schemas**

`src/test/aiActions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AI_ACTION_TOOLS, askUserTool } from "../../server/ai-actions.js";

describe("AI action tool schemas", () => {
  it("defines exactly 6 mutation tools with strict:true", () => {
    expect(AI_ACTION_TOOLS).toHaveLength(6);
    const names = AI_ACTION_TOOLS.map((t) => t.name).sort();
    expect(names).toEqual([
      "check_fraud",
      "create_product",
      "dispatch_to_courier",
      "update_order",
      "update_product",
      "update_variant",
    ]);
    for (const t of AI_ACTION_TOOLS) expect(t.strict).toBe(true);
  });

  it("defines ask_user tool with radio/check types", () => {
    expect(askUserTool.name).toBe("ask_user");
    expect(askUserTool.strict).toBe(true);
    const qType = askUserTool.parameters.properties.questions.items.properties.type;
    expect(qType.enum).toEqual(["radio", "check"]);
  });

  it("update_variant fields include stock_quantity, cog, price_adjustment, attributes", () => {
    const v = AI_ACTION_TOOLS.find((t) => t.name === "update_variant");
    const f = v.parameters.properties.fields.properties;
    expect(Object.keys(f).sort()).toEqual(["attributes", "cog", "price_adjustment", "stock_quantity"]);
  });

  it("dispatch_to_courier caps order_ids at 25", () => {
    const d = AI_ACTION_TOOLS.find((t) => t.name === "dispatch_to_courier");
    expect(d.parameters.properties.order_ids.maxItems).toBe(25);
    expect(d.parameters.properties.courier.enum).toEqual(["steadfast", "pathao"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/aiActions.test.ts`
Expected: FAIL — `Cannot find module '../../server/ai-actions.js'`.

- [ ] **Step 3: Create `server/ai-actions.js` with tool schemas + audit readers + buildRecommendation**

`server/ai-actions.js`:

```js
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
```

- [ ] **Step 4: Add tests for `buildRecommendation`**

Append to `src/test/aiActions.test.ts`:

```ts
import { buildRecommendation } from "../../server/ai-actions.js";

describe("buildRecommendation", () => {
  const ctx = {
    products: [{ id: "p1", name: "Cocoa Brown Trouser" }],
    variantsMap: { p1: [{ id: "vM", attributes: { size: "M" }, stock_quantity: 12 }] },
    orders: [{ id: "o1", order_number: "1001" }],
  };

  it("update_variant stock change yields add primary + set alternative", () => {
    const args = { product_id: "p1", variant_id: "vM", fields: { stock_quantity: 62 } };
    const r = buildRecommendation("update_variant", args, ctx);
    expect(r.recommendation.signal).toBe(3);
    expect(r.recommendation.tone).toBe("green");
    expect(r.recommendation.summary).toContain("was 12, +50");
    expect(r.alternatives).toHaveLength(1);
    expect(r.alternatives[0].summary).toContain("replace");
  });

  it("update_order yields no alternatives", () => {
    const args = { order_id: "o1", fields: { status: "cancelled" } };
    const r = buildRecommendation("update_order", args, ctx);
    expect(r.alternatives).toEqual([]);
    expect(r.recommendation.summary).toContain("#1001");
  });

  it("unknown tool yields empty", () => {
    const r = buildRecommendation("nope", {}, ctx);
    expect(r.recommendation).toBeNull();
  });
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/test/aiActions.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add server/ai-actions.js src/test/aiActions.test.ts
git commit -m "feat: add AI action tool schemas, buildRecommendation, audit readers"
```

---

### Task 3: `executeAiAction` dispatcher (`server/ai-actions.js`)

**Files:**
- Modify: `server/ai-actions.js` (append `executeAiAction`)
- Test: `src/test/aiActions.test.ts` (append dispatcher tests)

**Interfaces:**
- Consumes: `getProductForAudit`, `getVariantForAudit`, `getOrderForAudit`, `getOrdersForAudit` (from Task 2). Low-level helpers from `server/index.js` are **not** imported (circular import risk) — instead `executeAiAction` takes a `helpers` object: `{ saveProductStock, getUniqueProductSlug, purgeProductCache, generateProductEmbedding, checkFraudStatus, normalizeBdPhone, sendBulkSms, getOrgSettings, getServiceSupabase }`. `server/index.js` passes these in when calling.
- Produces: `executeAiAction({ supabase, orgId, userId, tool, args, helpers })` → `{ before, after }`.

- [ ] **Step 1: Write the failing test for `executeAiAction` dispatch + error cases**

Append to `src/test/aiActions.test.ts`:

```ts
import { executeAiAction } from "../../server/ai-actions.js";

describe("executeAiAction dispatcher", () => {
  // Minimal fake supabase builder: each table returns an object with
  // select/update/insert/delete that return { data, error } via maybeSingle/single.
  function fakeSupabase(tables) {
    return new Proxy({}, {
      get(_t, table) {
        return tables[table] ?? { _missing: true };
      },
    });
  }
  const noHelpers = {};

  it("throws on unknown tool", async () => {
    await expect(
      executeAiAction({ supabase: fakeSupabase({}), orgId: "o", userId: "u", tool: "nope", args: {}, helpers: noHelpers }),
    ).rejects.toThrow(/Unknown AI action tool/);
  });

  it("throws 404-style when target variant missing in org (cross-tenant guard)", async () => {
    const supabase = fakeSupabase({
      product_variants: {
        select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }),
      },
    });
    await expect(
      executeAiAction({ supabase, orgId: "o", userId: "u", tool: "update_variant",
        args: { product_id: "p1", variant_id: "vX", fields: { stock_quantity: 5 } }, helpers: noHelpers }),
    ).rejects.toThrow(/not found/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/aiActions.test.ts`
Expected: FAIL — `executeAiAction is not a function` (not yet exported).

- [ ] **Step 3: Append `executeAiAction` to `server/ai-actions.js`**

```js
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
      for (const k of allowed) if (args.fields?.[k] !== undefined) update[k] = args.fields[k];
      const hasStock = args.fields?.stock_quantity !== undefined;
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
      // Cache purge + embedding regen (best-effort, non-blocking)
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
      if (args.fields?.attributes !== undefined) {
        if (typeof args.fields.attributes !== "object" || Object.keys(args.fields.attributes).length === 0)
          throw new Error("attributes must be a non-empty object");
        patch.attributes = Object.fromEntries(
          Object.entries(args.fields.attributes).map(([k, v]) => [k.trim().toLowerCase(), String(v).trim()])
        );
      }
      if (args.fields?.cog !== undefined) patch.cog = parseFloat(args.fields.cog) || 0;
      if (args.fields?.stock_quantity !== undefined) patch.stock_quantity = Math.max(0, parseInt(args.fields.stock_quantity, 10) || 0);
      if (args.fields?.price_adjustment !== undefined) patch.price_adjustment = parseFloat(args.fields.price_adjustment) || 0;
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
      for (const k of allowed) if (args.fields?.[k] !== undefined) update[k] = args.fields[k];
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
      if (args.stock_quantity !== undefined) await helpers.saveProductStock(orgId, product.id, args.stock_quantity);
      const variantRows = [];
      for (const v of args.variants || []) {
        if (!v.attributes || typeof v.attributes !== "object" || Object.keys(v.attributes).length === 0) continue;
        variantRows.push({
          product_id: product.id, org_id: orgId,
          attributes: Object.fromEntries(Object.entries(v.attributes).map(([k, val]) => [k.trim().toLowerCase(), String(val).trim()])),
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/aiActions.test.ts`
Expected: PASS (unknown-tool throws, missing-variant throws "not found").

- [ ] **Step 5: Commit**

```bash
git add server/ai-actions.js src/test/aiActions.test.ts
git commit -m "feat: add executeAiAction dispatcher with org-scoped mutations"
```

---

### Task 4: Modify `POST /api/order-chat` (admin tools + SSE events)

**Files:**
- Modify: `server/index.js` (route at `:4331`, import from `ai-actions.js`, role check, tools, output parsing)
- Test: `src/test/orderChatMutations.test.ts` (create — source inspection)

**Interfaces:**
- Consumes: `AI_ACTION_TOOLS`, `askUserTool`, `buildRecommendation` from `server/ai-actions.js`.
- Produces: `/api/order-chat` now streams `{question}` and `{action}` SSE events for admins; team path unchanged.

- [ ] **Step 1: Write the failing source-inspection test**

`src/test/orderChatMutations.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("order chat AI mutations (source inspection)", () => {
  const source = readFileSync(resolve(process.cwd(), "server/index.js"), "utf8");
  const routeStart = source.indexOf('app.post("/api/order-chat"');
  const routeEnd = source.indexOf('app.post("/api/studio/generate"', routeStart);
  const routeSource = source.slice(routeStart, routeEnd);

  it("imports AI_ACTION_TOOLS, askUserTool, buildRecommendation from ai-actions.js", () => {
    expect(source).toContain('from "./ai-actions.js"');
    expect(source).toMatch(/AI_ACTION_TOOLS/);
    expect(source).toMatch(/askUserTool/);
    expect(source).toMatch(/buildRecommendation/);
  });

  it("attaches tools only when role === admin", () => {
    expect(routeSource).toContain("canMutate");
    expect(routeSource).toMatch(/role\s*===\s*["']admin["']/);
    expect(routeSource).toContain("tools:");
  });

  it("streams question events for ask_user function calls", () => {
    expect(routeSource).toContain('"question"');
    expect(routeSource).toContain("call_id");
  });

  it("streams action events for mutation function calls", () => {
    expect(routeSource).toContain('"action"');
    expect(routeSource).toContain("buildRecommendation");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/orderChatMutations.test.ts`
Expected: FAIL — `from "./ai-actions.js"` not found, `canMutate` not found.

- [ ] **Step 3: Add the import at the top of `server/index.js`**

Find the existing imports block near the top of `server/index.js` (after the `import` lines, before the first `const`). Add:

```js
import { AI_ACTION_TOOLS, askUserTool, buildRecommendation, executeAiAction } from "./ai-actions.js";
```

- [ ] **Step 4: Modify the `/api/order-chat` route**

In `server/index.js` at the `app.post("/api/order-chat", ...)` handler (around line 4331):

4a. After `const { orgId } = await getUserOrg(supabase, user.id);` add role capture:

```js
const { orgId, role } = await getUserOrg(supabase, user.id);
const canMutate = role === "admin";
```

(Replace the existing `const { orgId } = await getUserOrg(supabase, user.id);` line — `getUserOrg` already returns `{ orgId, role }`.)

4b. Build the Responses API payload conditionally. Find the existing `body: JSON.stringify({ model, input })` line and change it to attach tools for admins:

```js
const payload = { model, input };
if (canMutate) payload.tools = [...AI_ACTION_TOOLS, askUserTool];
```

Then use `body: JSON.stringify(payload)` in the fetch.

4c. Replace the single-line text extraction + single SSE write block:

```js
// BEFORE (existing):
// const data = await response.json();
// const text = extractResponsesText(data) || "I couldn't generate a response.";
// res.setHeader("Content-Type", "text/event-stream");
// res.setHeader("Cache-Control", "no-cache");
// res.setHeader("Connection", "keep-alive");
// res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
// res.write("data: [DONE]\n\n");
// res.end();

// AFTER:
const data = await response.json();
res.setHeader("Content-Type", "text/event-stream");
res.setHeader("Cache-Control", "no-cache");
res.setHeader("Connection", "keep-alive");

for (const item of data.output || []) {
  if (item.type === "message") {
    const text = (item.content || []).map((c) => c.text || "").join("");
    if (text) res.write(`data: ${JSON.stringify({ delta: { content: text } })}\n\n`);
  } else if (item.type === "function_call") {
    if (item.name === "ask_user") {
      const parsed = parseJsonObject(item.arguments);
      res.write(`data: ${JSON.stringify({ question: { call_id: item.call_id, questions: parsed?.questions || [] } })}\n\n`);
    } else {
      const args = parseJsonObject(item.arguments) || {};
      const reco = canMutate ? buildRecommendation(item.name, args, { products, orders: orderDetailsRaw, variantsMap: chatVariantsMap }) : { recommendation: null, alternatives: [] };
      res.write(`data: ${JSON.stringify({ action: { call_id: item.call_id, tool: item.name, ...reco } })}\n\n`);
    }
  }
}
res.write("data: [DONE]\n\n");
res.end();
```

Note: `orderDetailsRaw` is the raw `orders` array (already in scope as `orders`); rename to pass the raw rows with `id` and `order_number` to `buildRecommendation`. Use the existing `orders` variable.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/test/orderChatMutations.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full build to ensure no syntax errors**

Run: `npm run build`
Expected: clean (Vite build succeeds; server is ESM so `node --check server/index.js` also works — run `node --check server/index.js`).

- [ ] **Step 7: Commit**

```bash
git add server/index.js src/test/orderChatMutations.test.ts
git commit -m "feat: attach AI action tools to order-chat for admins, stream question/action SSE events"
```

---

### Task 5: `POST /api/order-chat/apply` route

**Files:**
- Modify: `server/index.js` (add route after the `/api/order-chat` handler)
- Test: `src/test/orderChatMutations.test.ts` (append)

**Interfaces:**
- Consumes: `executeAiAction` + the low-level helpers (`saveProductStock`, `getUniqueProductSlug`, `purgeProductCache`, `generateProductEmbedding`, `checkFraudStatus`, `getOrgSettings`) which already exist in `server/index.js` scope.
- Produces: `POST /api/order-chat/apply` → `{ ok, before, after }`.

- [ ] **Step 1: Write the failing source-inspection test**

Append to `src/test/orderChatMutations.test.ts`:

```ts
  it("defines POST /api/order-chat/apply with admin gate + tool allowlist + audit insert", () => {
    const applyStart = source.indexOf('app.post("/api/order-chat/apply"');
    expect(applyStart).toBeGreaterThan(-1);
    const applyEnd = source.indexOf("\n});", applyStart);
    const applySrc = source.slice(applyStart, applyEnd);
    expect(applySrc).toContain("getToken");
    expect(applySrc).toContain("getUser(");
    expect(applySrc).toMatch(/role\s*!==\s*["']admin["']/);
    expect(applySrc).toContain("AI_ACTION_TOOLS");
    expect(applySrc).toContain("executeAiAction");
    expect(applySrc).toContain("ai_action_log");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/orderChatMutations.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Add the route to `server/index.js`**

Immediately after the closing `});` of the `/api/order-chat` handler (before the `// ── Studio: AI Copy Generation` comment), add:

```js
// ── Order Chat: apply a proposed AI mutation (admin only) ───────────────────
app.post("/api/order-chat/apply", rateLimitAI, async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId, role } = await getUserOrg(supabase, user.id);
    if (role !== "admin") return res.status(403).json({ error: "Admin only" });

    const { call_id, tool, args } = req.body || {};
    if (!call_id || !tool) return res.status(400).json({ error: "call_id and tool required" });
    if (!AI_ACTION_TOOLS.some((t) => t.name === tool)) return res.status(400).json({ error: "Unknown tool" });

    const helpers = {
      saveProductStock, getUniqueProductSlug, purgeProductCache,
      generateProductEmbedding, checkFraudStatus, normalizeBdPhone,
      sendBulkSms, getOrgSettings: (k, keys) => getOrgSettings(k, keys),
    };
    const { before, after } = await executeAiAction({ supabase, orgId, userId: user.id, tool, args, helpers });
    await supabase.from("ai_action_log").insert({
      call_id, org_id: orgId, user_id: user.id, tool, args,
      before_snapshot: before, after_snapshot: after, applied_at: new Date().toISOString(),
    });
    return res.json({ ok: true, before, after });
  } catch (e) {
    console.error("[Order Chat apply] error:", errorMessage(e));
    return res.status(500).json({ error: errorMessage(e) });
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/orderChatMutations.test.ts`
Expected: PASS.

- [ ] **Step 5: Run `node --check server/index.js`**

Run: `node --check server/index.js`
Expected: no syntax errors.

- [ ] **Step 6: Commit**

```bash
git add server/index.js src/test/orderChatMutations.test.ts
git commit -m "feat: add POST /api/order-chat/apply (admin-only, audit-logged)"
```

---

### Task 6: `POST /api/order-chat/answer` route

**Files:**
- Modify: `server/index.js` (add route after `/api/order-chat/apply`)
- Test: `src/test/orderChatMutations.test.ts` (append)

**Interfaces:**
- Consumes: `AI_ACTION_TOOLS`, `askUserTool` (re-attached for the resumed call).
- Produces: `POST /api/order-chat/answer` → SSE stream (same shape as `/api/order-chat`).

- [ ] **Step 1: Write the failing source-inspection test**

Append to `src/test/orderChatMutations.test.ts`:

```ts
  it("defines POST /api/order-chat/answer with admin gate and streams SSE", () => {
    const ansStart = source.indexOf('app.post("/api/order-chat/answer"');
    expect(ansStart).toBeGreaterThan(-1);
    const ansEnd = source.indexOf("\n});", ansStart);
    const ansSrc = source.slice(ansStart, ansEnd);
    expect(ansSrc).toContain("getToken");
    expect(ansSrc).toMatch(/role\s*!==\s*["']admin["']/);
    expect(ansSrc).toContain("text/event-stream");
    expect(ansSrc).toContain("function_call_output");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/orderChatMutations.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Add the route to `server/index.js`**

Immediately after the `/api/order-chat/apply` handler, add:

```js
// ── Order Chat: resume after a clarification answer (admin only) ────────────
app.post("/api/order-chat/answer", rateLimitAI, async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId, role } = await getUserOrg(supabase, user.id);
    if (role !== "admin") return res.status(403).json({ error: "Admin only" });
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY is not configured" });

    const model = ORDER_CHAT_MODELS.has(req.body?.model) ? req.body.model : "gpt-5.4-mini";
    const { call_id, answers, priorMessages } = req.body || {};
    if (!call_id || !Array.isArray(answers)) return res.status(400).json({ error: "call_id and answers required" });

    const answerText = answers.map((a, i) => {
      const picked = (a.selected || []).map((idx) => a.options?.[idx]).filter(Boolean);
      const parts = [...picked];
      if (a.custom?.trim()) parts.push(`(custom: ${a.custom.trim()})`);
      return `Q${i + 1}: ${a.q}\nA: ${parts.join(", ") || "(no answer)"}`;
    }).join("\n\n");

    const input = [
      ...priorMessages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "") })),
      { role: "user", content: `[Clarification answer for call ${call_id}]\n${answerText}` },
    ];

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input, tools: [...AI_ACTION_TOOLS, askUserTool] }),
    });
    if (!response.ok) {
      const body = await response.text();
      const message = parseOpenAIError(response.status, body);
      return res.status([401, 403, 429].includes(response.status) ? response.status : 502).json({ error: message });
    }
    const data = await response.json();
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    for (const item of data.output || []) {
      if (item.type === "message") {
        const text = (item.content || []).map((c) => c.text || "").join("");
        if (text) res.write(`data: ${JSON.stringify({ delta: { content: text } })}\n\n`);
      } else if (item.type === "function_call") {
        if (item.name === "ask_user") {
          const parsed = parseJsonObject(item.arguments);
          res.write(`data: ${JSON.stringify({ question: { call_id: item.call_id, questions: parsed?.questions || [] } })}\n\n`);
        } else {
          const args = parseJsonObject(item.arguments) || {};
          res.write(`data: ${JSON.stringify({ action: { call_id: item.call_id, tool: item.name, recommendation: null, alternatives: [] } })}\n\n`);
        }
      }
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (e) {
    console.error("[Order Chat answer] error:", errorMessage(e));
    return res.status(500).json({ error: errorMessage(e) });
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/orderChatMutations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/index.js src/test/orderChatMutations.test.ts
git commit -m "feat: add POST /api/order-chat/answer to resume after clarifications"
```

---

### Task 7: `useAiChatStream` hook

**Files:**
- Create: `src/components/order-chat/useAiChatStream.ts`
- Test: none (covered by OrderChat test in Task 10)

**Interfaces:**
- Consumes: `apiFetch` from `@/lib/api`.
- Produces: `useAiChatStream()` → `send({ messages, model, signal, onEvent, onDone, onError })` where `onEvent` receives a `StreamEvent` union.

- [ ] **Step 1: Create the hook**

`src/components/order-chat/useAiChatStream.ts`:

```ts
import { useCallback } from "react";
import { apiFetch } from "@/lib/api";

export type ClarifyQuestion = { q: string; type: "radio" | "check"; options: string[] };

export type Recommendation = {
  key: string;
  summary: string;
  args: Record<string, unknown>;
  signal: 0 | 1 | 2 | 3;
  tone: "green" | "orange" | "ink";
  label: string;
  cta: string;
};

export type StreamEvent =
  | { type: "delta"; content: string }
  | { type: "question"; call_id: string; questions: ClarifyQuestion[] }
  | {
      type: "action";
      call_id: string;
      tool: string;
      recommendation: Recommendation | null;
      alternatives: Recommendation[];
    };

type SendArgs = {
  messages: { role: "user" | "assistant"; content: string }[];
  model: string;
  signal?: AbortSignal;
  onEvent: (e: StreamEvent) => void;
  onDone: () => void;
  onError: (err: string) => void;
};

export function useAiChatStream() {
  return useCallback(async ({ messages, model, signal, onEvent, onDone, onError }: SendArgs) => {
    let resp: Response;
    try {
      resp = await apiFetch("/api/order-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, model }),
        signal,
      });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      onError(err instanceof Error ? err.message : "Network error");
      return;
    }

    if (resp.status === 404) {
      onError("Chat backend is not active yet. Restart localhost so the new /api/order-chat route is loaded.");
      return;
    }
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      onError((data as { error?: string }).error || `Error ${resp.status}`);
      return;
    }
    if (!resp.body) {
      onError("No response body");
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done = false;

    while (!done) {
      const { done: d, value } = await reader.read();
      if (d) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (json === "[DONE]") {
          done = true;
          break;
        }
        try {
          const parsed = JSON.parse(json);
          if (parsed.delta?.content) onEvent({ type: "delta", content: parsed.delta.content });
          else if (parsed.question) onEvent({ type: "question", call_id: parsed.question.call_id, questions: parsed.question.questions || [] });
          else if (parsed.action) onEvent({
            type: "action",
            call_id: parsed.action.call_id,
            tool: parsed.action.tool,
            recommendation: parsed.action.recommendation || null,
            alternatives: parsed.action.alternatives || [],
          });
        } catch {
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }
    onDone();
  }, []);
}
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: no errors in the new file.

- [ ] **Step 3: Commit**

```bash
git add src/components/order-chat/useAiChatStream.ts
git commit -m "feat: add useAiChatStream hook (SSE parser for delta/question/action)"
```

---

### Task 8: `AiClarifyCard` component

**Files:**
- Create: `src/components/order-chat/AiClarifyCard.tsx`
- Test: `src/test/aiClarifyCard.test.tsx`

**Interfaces:**
- Consumes: `ClarifyQuestion` type from `useAiChatStream`.
- Produces: `<AiClarifyCard questions={...} status="pending" onSubmit={(answers) => ...} onDismiss={...} />`.

- [ ] **Step 1: Write the failing component test**

`src/test/aiClarifyCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AiClarifyCard from "../components/order-chat/AiClarifyCard";

const questions = [
  { q: "Which product?", type: "radio" as const, options: ["Cocoa Brown Trouser", "Cocoa Brown Pants"] },
  { q: "Which sizes?", type: "check" as const, options: ["M", "L", "XL"] },
];

describe("AiClarifyCard", () => {
  it("renders the first question and auto-advances on radio select", () => {
    const onSubmit = vi.fn();
    render(<AiClarifyCard questions={questions} status="pending" onSubmit={onSubmit} onDismiss={() => {}} />);
    expect(screen.getByText("Which product?")).toBeTruthy();
    fireEvent.click(screen.getByText("Cocoa Brown Trouser"));
    // auto-advance to the second question
    expect(screen.getByText("Which sizes?")).toBeTruthy();
  });

  it("toggles check options without auto-advancing", () => {
    render(<AiClarifyCard questions={questions} status="pending" onSubmit={() => {}} onDismiss={() => {}} />);
    fireEvent.click(screen.getByText("Cocoa Brown Trouser"));
    fireEvent.click(screen.getByText("M"));
    fireEvent.click(screen.getByText("L"));
    expect(screen.getByText("M").parentElement?.parentElement?.getAttribute("aria-pressed")).toBe("true");
  });

  it("calls onSubmit on the last question send", () => {
    const onSubmit = vi.fn();
    render(<AiClarifyCard questions={questions} status="pending" onSubmit={onSubmit} onDismiss={() => {}} />);
    fireEvent.click(screen.getByText("Cocoa Brown Trouser"));
    fireEvent.click(screen.getByText("M"));
    fireEvent.click(screen.getByLabelText("Send answers"));
    expect(onSubmit).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/aiClarifyCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

`src/components/order-chat/AiClarifyCard.tsx`:

```tsx
import { useState } from "react";
import { Check, CaretLeft, CaretRight, ArrowUp, X } from "@phosphor-icons/react";
import type { ClarifyQuestion } from "./useAiChatStream";

type Answer = { q: string; type: "radio" | "check"; options: string[]; selected: number[]; custom?: string };

type Props = {
  questions: ClarifyQuestion[];
  status: "pending" | "answered" | "collapsed";
  onSubmit: (answers: Answer[]) => void;
  onDismiss: () => void;
};

export default function AiClarifyCard({ questions, status, onSubmit, onDismiss }: Props) {
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [custom, setCustom] = useState<Record<number, string>>({});
  const [sent, setSent] = useState(status !== "pending");

  if (status === "answered" || sent) {
    return (
      <div className="flex w-full max-w-sm items-center gap-3" style={{ animation: "pop-in 260ms cubic-bezier(0.23,1,0.32,1) both" }}>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-status-lime-background px-2.5 py-1 text-[12.5px] font-medium text-status-lime-text">
          <span className="flex size-4 items-center justify-center rounded-full bg-status-lime-text text-white">
            <Check weight="light" className="h-3 w-3" />
          </span>
          Answers sent
        </span>
      </div>
    );
  }

  const question = questions[qi];
  if (!question) return null;
  const last = qi === questions.length - 1;
  const selected = answers[qi] ?? [];
  const hasAnswer = selected.length > 0 || Boolean(custom[qi]?.trim());

  const toggle = (index: number) => {
    setAnswers((cur) => {
      const picked = cur[qi] ?? [];
      const next = question.type === "radio"
        ? [index]
        : picked.includes(index) ? picked.filter((i) => i !== index) : [...picked, index];
      return { ...cur, [qi]: next };
    });
    if (question.type === "radio") {
      setCustom((cur) => ({ ...cur, [qi]: "" }));
      window.setTimeout(() => {
        if (qi === questions.length - 1) {
          setSent(true);
          collectAndSubmit();
        } else setQi((c) => Math.min(questions.length - 1, c + 1));
      }, 480);
    }
  };

  const collectAndSubmit = () => {
    const out: Answer[] = questions.map((q, i) => ({
      q: q.q, type: q.type, options: q.options,
      selected: answers[i] ?? [], custom: custom[i] ?? "",
    }));
    onSubmit(out);
  };

  const reset = () => { setQi(0); setAnswers({}); setCustom({}); setSent(false); };

  return (
    <div className="flex w-full max-w-sm flex-col items-stretch">
      <div className="w-full overflow-hidden rounded-[14px] bg-white shadow-sm border border-black/[0.08]">
        <div key={qi} className="p-3.5" style={{ animation: "fade-up 350ms cubic-bezier(0.23,1,0.32,1) both" }}>
          <div className="flex items-start justify-between gap-3">
            <span className="text-[13px] font-medium text-black">{question.q}</span>
            <button type="button" aria-label="Dismiss" onClick={onDismiss}
              className="flex size-6 shrink-0 items-center justify-center rounded-[8px] text-black/40 hover:bg-black/[0.04] hover:text-black">
              <X weight="light" className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 flex flex-col gap-0.5">
            {question.options.map((option, i) => {
              const on = selected.includes(i);
              return (
                <button key={option} type="button" aria-pressed={on} onClick={() => toggle(i)}
                  className="-mx-1.5 flex items-center gap-2 rounded-[10px] px-1.5 py-1 text-left hover:bg-black/[0.04]">
                  <span className={`flex size-4 shrink-0 items-center justify-center transition-colors ${question.type === "radio" ? "rounded-full" : "rounded-[5px]"} ${on ? "bg-black text-white" : "shadow-[inset_0_0_0_1.5px_rgba(0,0,0,0.16)] text-transparent"}`}>
                    {question.type === "radio" ? (
                      <span className="size-1.5 rounded-full bg-white" style={{ transform: on ? "scale(1)" : "scale(0)" }} />
                    ) : (
                      <Check weight="light" className="h-3 w-3" />
                    )}
                  </span>
                  <span className={`text-[13px] ${on ? "text-black" : "text-black/60"}`}>{option}</span>
                </button>
              );
            })}
            <label className="-mx-1.5 flex items-center gap-2 rounded-[10px] px-1.5 py-1 hover:bg-black/[0.04]">
              <span aria-hidden="true" className="size-4 shrink-0" />
              <input
                value={custom[qi] ?? ""}
                onChange={(e) => {
                  setCustom((c) => ({ ...c, [qi]: e.target.value }));
                  if (question.type === "radio") setAnswers((c) => ({ ...c, [qi]: [] }));
                }}
                placeholder="Type something…"
                aria-label="Custom answer"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-black outline-none placeholder:text-black/40"
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-black/[0.06] bg-[#FAFAF8] px-3.5 py-2">
          <span className="flex items-center gap-2">
            <button type="button" aria-label="Previous" disabled={qi === 0}
              onClick={() => setQi((c) => Math.max(0, c - 1))}
              className="flex size-6 items-center justify-center rounded-[5px] text-black/40 enabled:hover:bg-black/[0.04] enabled:hover:text-black/60 disabled:opacity-35">
              <CaretLeft weight="light" className="h-3.5 w-3.5" />
            </button>
            <span className="flex items-center gap-1">
              {questions.map((_, i) => (
                <button key={i} type="button" aria-label={`Question ${i + 1}`} aria-current={i === qi ? "step" : undefined}
                  disabled={sent} onClick={() => setQi(i)} className="rounded-full"
                  style={i === qi ? { width: 9, height: 9, border: "2.5px solid var(--color-black)" }
                    : i < qi ? { width: 7, height: 7, background: "rgba(0,0,0,0.4)" }
                    : { width: 7, height: 7, border: "1.5px solid rgba(0,0,0,0.4)" }} />
              ))}
            </span>
            <button type="button" aria-label="Next" disabled={last}
              onClick={() => setQi((c) => Math.min(questions.length - 1, c + 1))}
              className="flex size-6 items-center justify-center rounded-[5px] text-black/40 enabled:hover:bg-black/[0.04] enabled:hover:text-black/60 disabled:opacity-35">
              <CaretRight weight="light" className="h-3.5 w-3.5" />
            </button>
          </span>
          <button type="button" aria-label={last ? "Send answers" : "Next question"} disabled={!hasAnswer}
            onClick={() => { if (last) { setSent(true); collectAndSubmit(); } else setQi((c) => c + 1); }}
            className="flex size-7 items-center justify-center rounded-[8px] transition-colors"
            style={{ background: hasAnswer ? "black" : "rgba(0,0,0,0.06)", color: hasAnswer ? "white" : "rgba(0,0,0,0.4)" }}>
            <ArrowUp weight="light" className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/aiClarifyCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/order-chat/AiClarifyCard.tsx src/test/aiClarifyCard.test.tsx
git commit -m "feat: add AiClarifyCard (ports ApprovalCard interaction)"
```

---

### Task 9: `AiActionCard` component

**Files:**
- Create: `src/components/order-chat/AiActionCard.tsx`
- Test: `src/test/aiActionCard.test.tsx`

**Interfaces:**
- Consumes: `Recommendation` type from `useAiChatStream`.
- Produces: `<AiActionCard tool recommendation alternatives status before after onApply onReject />`.

- [ ] **Step 1: Write the failing component test**

`src/test/aiActionCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AiActionCard from "../components/order-chat/AiActionCard";

const recommendation = {
  key: "add", summary: "Set Cocoa Brown Trouser / M stock to 62 (was 12, +50)",
  args: { product_id: "p1", variant_id: "vM", fields: { stock_quantity: 62 } },
  signal: 3 as const, tone: "green" as const, label: "High confidence", cta: "Apply",
};
const alternatives = [{
  key: "set", summary: "Set to 50 (replace)", args: { product_id: "p1", variant_id: "vM", fields: { stock_quantity: 50 } },
  signal: 1 as const, tone: "orange" as const, label: "Needs review", cta: "Apply",
}];

describe("AiActionCard", () => {
  it("renders the primary recommendation summary", () => {
    render(<AiActionCard tool="update_variant" recommendation={recommendation} alternatives={alternatives}
      status="pending" onApply={() => {}} onReject={() => {}} />);
    expect(screen.getByText(/Set Cocoa Brown Trouser/)).toBeTruthy();
  });

  it("opens the alternatives drawer and promotes a selection", () => {
    render(<AiActionCard tool="update_variant" recommendation={recommendation} alternatives={alternatives}
      status="pending" onApply={() => {}} onReject={() => {}} />);
    fireEvent.click(screen.getByText("Alternatives"));
    fireEvent.click(screen.getByText("Set to 50 (replace)"));
    // the promoted summary now shows as primary
    expect(screen.getAllByText(/Set to 50/).length).toBeGreaterThan(0);
  });

  it("calls onApply with the selected args on Accept", () => {
    const onApply = vi.fn();
    render(<AiActionCard tool="update_variant" recommendation={recommendation} alternatives={alternatives}
      status="pending" onApply={onApply} onReject={() => {}} />);
    fireEvent.click(screen.getByText("Apply"));
    expect(onApply).toHaveBeenCalledWith(recommendation.args);
  });

  it("calls onReject on Reject", () => {
    const onReject = vi.fn();
    render(<AiActionCard tool="update_variant" recommendation={recommendation} alternatives={alternatives}
      status="pending" onApply={() => {}} onReject={onReject} />);
    fireEvent.click(screen.getByText("Reject"));
    expect(onReject).toHaveBeenCalled();
  });

  it("hides the Alternatives button when alternatives is empty", () => {
    render(<AiActionCard tool="update_order" recommendation={recommendation} alternatives={[]}
      status="pending" onApply={() => {}} onReject={() => {}} />);
    expect(screen.queryByText("Alternatives")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/aiActionCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

`src/components/order-chat/AiActionCard.tsx`:

```tsx
import { useState } from "react";
import { Check } from "@phosphor-icons/react";
import { PopButton } from "@/components/ui/pop-button";
import type { Recommendation } from "./useAiChatStream";

type Props = {
  tool: string;
  recommendation: Recommendation;
  alternatives: Recommendation[];
  status: "pending" | "applied" | "rejected";
  before?: unknown;
  after?: unknown;
  onApply: (args: Record<string, unknown>) => void;
  onReject: () => void;
};

function Meter({ signal, tone }: { signal: number; tone: string }) {
  const color = tone === "green" ? "bg-status-lime-text" : tone === "orange" ? "bg-status-yellow-text" : "bg-black/40";
  return (
    <span className="flex items-end gap-0.5">
      {[0, 1, 2].map((bar) => (
        <span key={bar} className="w-1 rounded-full transition-colors"
          style={{ height: 10, background: bar < signal ? undefined : "rgba(0,0,0,0.16)" }} >
          <span className={`block h-full w-full rounded-full ${bar < signal ? color : ""}`} />
        </span>
      ))}
    </span>
  );
}

export default function AiActionCard({ recommendation, alternatives, status, before, after, onApply, onReject }: Props) {
  const all = [recommendation, ...alternatives];
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const active = all[selected];
  const others = all.map((o, i) => ({ o, i })).filter(({ i }) => i !== selected);

  if (status === "applied") {
    return (
      <div className="flex w-full max-w-md items-center gap-3" style={{ animation: "pop-in 260ms cubic-bezier(0.23,1,0.32,1) both" }}>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-status-lime-background px-2.5 py-1 text-[12.5px] font-medium text-status-lime-text">
          <span className="flex size-4 items-center justify-center rounded-full bg-status-lime-text text-white">
            <Check weight="light" className="h-3 w-3" />
          </span>
          Applied
        </span>
        <span className="text-[12px] text-black/60">
          {active.summary}
        </span>
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center rounded-full bg-black/[0.06] px-2.5 py-1 text-[12.5px] font-medium text-black/40">
        Rejected
      </span>
    );
  }

  return (
    <div className="w-full max-w-md overflow-hidden rounded-[14px] bg-white shadow-sm border border-black/[0.08]">
      <div className="p-3.5">
        <span className="text-[13px] font-semibold text-black">Want me to apply this?</span>
        <p key={active.key} className="mt-1.5 min-h-12 text-[13px] leading-relaxed text-black/60"
          style={{ animation: "fade-in 180ms ease-out both" }}>
          {active.summary}
        </p>
      </div>

      {alternatives.length > 0 && (
        <div className="grid transition-[grid-template-rows,opacity] duration-300"
          style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0, transitionTimingFunction: "cubic-bezier(0.16,1,0.3,1)" }}>
          <div className="overflow-hidden">
            <div className="border-t border-black/[0.06] bg-[#FAFAF8] px-2 py-2">
              <p className="px-1.5 pb-1 text-[11px] font-medium text-black/40">Other options</p>
              {others.map(({ o, i }) => (
                <button key={o.key} type="button"
                  onClick={() => setSelected(i)}
                  className="flex w-full items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 text-left hover:bg-black/[0.04]">
                  <Meter signal={o.signal} tone={o.tone} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-black">{o.summary}</span>
                  <span className="shrink-0 text-[11px] text-black/40">{o.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-black/[0.06] bg-[#FAFAF8] px-3.5 py-2">
        <span className="flex items-center gap-2">
          <Meter signal={active.signal} tone={active.tone} />
          <span className="text-[12.5px] font-medium text-black/60">{active.label}</span>
        </span>
        <span className="flex items-center gap-2">
          {alternatives.length > 0 && (
            <PopButton color="default" size="sm" aria-expanded={open}
              onClick={() => setOpen((c) => !c)} className="px-2.5 text-[12.5px]">
              Alternatives
            </PopButton>
          )}
          <PopButton color="default" size="sm" onClick={onReject} className="px-2.5 text-[12.5px]">
            Reject
          </PopButton>
          <PopButton color="blue" size="sm" onClick={() => onApply(active.args)} className="text-[12.5px]">
            {active.cta}
          </PopButton>
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/aiActionCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/order-chat/AiActionCard.tsx src/test/aiActionCard.test.tsx
git commit -m "feat: add AiActionCard (ports RecommendationCard interaction)"
```

---

### Task 10: Wire into `OrderChat.tsx` + composer + quick questions

**Files:**
- Modify: `src/pages/OrderChat.tsx`
- Modify: `src/components/OrderChatComposer.tsx` (cosmetic)
- Test: `src/test/orderChatMutations.test.ts` is server-side; the wiring test is a component smoke test added here: `src/test/orderChatWiring.test.tsx` (create)

**Interfaces:**
- Consumes: `useAiChatStream`, `AiClarifyCard`, `AiActionCard`, `useUserRole` (existing hook at `src/hooks/useUserRole.tsx`).
- Produces: the full chat flow — delta/question/action rendering, apply/answer/reject handlers, admin quick-question.

- [ ] **Step 1: Read the current `OrderChat.tsx` to confirm the `send` and render shape**

Re-read `src/pages/OrderChat.tsx` (already done in planning — the `send` function at `:280`, the messages map at `:417`, the `quickQuestions` at `:102`). The wiring replaces `streamChat` with `useAiChatStream` and adds render branches.

- [ ] **Step 2: Write the failing wiring test**

`src/test/orderChatWiring.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("OrderChat wiring", () => {
  const src = readFileSync(resolve(process.cwd(), "src/pages/OrderChat.tsx"), "utf8");

  it("imports useAiChatStream, AiClarifyCard, AiActionCard", () => {
    expect(src).toContain("useAiChatStream");
    expect(src).toContain("AiClarifyCard");
    expect(src).toContain("AiActionCard");
  });

  it("handles action and clarify message kinds in the render branch", () => {
    expect(src).toContain('kind === "clarify"');
    expect(src).toContain('kind === "action"');
  });

  it("calls /api/order-chat/apply from a handler", () => {
    expect(src).toContain("/api/order-chat/apply");
  });

  it("adds the admin quick question about stock", () => {
    expect(src).toContain("Add 50 stock to M size");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/test/orderChatWiring.test.tsx`
Expected: FAIL — imports not present.

- [ ] **Step 4: Modify `src/pages/OrderChat.tsx`**

4a. Replace the `streamChat` import/function with the hook + the two cards + the role hook. At the top of the file, add:

```tsx
import { useAiChatStream, type StreamEvent, type ClarifyQuestion, type Recommendation } from "@/components/order-chat/useAiChatStream";
import AiClarifyCard from "@/components/order-chat/AiClarifyCard";
import AiActionCard from "@/components/order-chat/AiActionCard";
import { useUserRole } from "@/hooks/useUserRole";
```

Delete the local `streamChat` function (lines `:26`–`:100`) entirely.

4b. Extend the `Msg` type. Replace the existing `type Msg = { ... }` with:

```tsx
type BaseMsg = { role: "user" | "assistant"; content: string; image?: string; revisedPrompt?: string; model?: string; at?: number };
type ClarifyMsg = { role: "assistant"; kind: "clarify"; call_id: string; questions: ClarifyQuestion[]; status: "pending" | "answered" | "collapsed"; at?: number };
type ActionMsg = { role: "assistant"; kind: "action"; call_id: string; tool: string; recommendation: Recommendation; alternatives: Recommendation[]; status: "pending" | "applied" | "rejected"; before?: unknown; after?: unknown; at?: number };
type Msg = BaseMsg | ClarifyMsg | ActionMsg;
```

4c. In the component, add the stream hook and role:

```tsx
const sendStream = useAiChatStream();
const { role } = useUserRole();
const isAdmin = role === "admin";
```

4d. Rewrite the `send` function to fan stream events into messages:

```tsx
const send = async (text: string, files: UploadedFile[]) => {
  const msg = text.trim();
  if (!msg || isLoading) return;
  if (imageMode) return generateImage(msg, files);

  const userMsg: Msg = { role: "user", content: buildPrompt(msg, files), at: Date.now() };
  setMessages((prev) => [...prev, userMsg]);
  setIsLoading(true);

  const controller = new AbortController();
  abortRef.current = controller;

  const baseMsgs = [...messages, userMsg].map((m) => ({ role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant", content: "content" in m ? m.content : "" }));

  await sendStream({
    messages: baseMsgs,
    model,
    signal: controller.signal,
    onEvent: (e: StreamEvent) => {
      if (e.type === "delta") {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant" && !("kind" in last)) {
            return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: (m.content || "") + e.content } : m);
          }
          return [...prev, { role: "assistant", content: e.content, model, at: Date.now() }];
        });
      } else if (e.type === "question") {
        setMessages((prev) => [...prev, { role: "assistant", kind: "clarify", call_id: e.call_id, questions: e.questions, status: "pending", at: Date.now() }]);
      } else if (e.type === "action") {
        if (e.recommendation) {
          setMessages((prev) => [...prev, { role: "assistant", kind: "action", call_id: e.call_id, tool: e.tool, recommendation: e.recommendation, alternatives: e.alternatives, status: "pending", at: Date.now() }]);
        }
      }
    },
    onDone: () => setIsLoading(false),
    onError: (err) => {
      setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${err}`, model, at: Date.now() }]);
      setIsLoading(false);
    },
  });
};
```

4e. Add the three handlers above the `return`:

```tsx
const handleApply = async (msg: ActionMsg, args: Record<string, unknown>) => {
  try {
    const res = await apiFetch("/api/order-chat/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call_id: msg.call_id, tool: msg.tool, args }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error((data as { error?: string }).error || "Failed to apply");
      return;
    }
    setMessages((prev) => prev.map((m) => m === msg ? { ...m, status: "applied", before: (data as { before?: unknown }).before, after: (data as { after?: unknown }).after } : m));
    // ask the model for a short confirmation
    const priorMsgs = messages.map((m) => ({ role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant", content: "content" in m ? m.content : "" }));
    await sendStream({
      messages: [...priorMsgs, { role: "user", content: `[Applied action ${msg.tool} with args ${JSON.stringify(args)}. Result: ${JSON.stringify((data as { after?: unknown }).after)}. Confirm in one short sentence.]` }],
      model,
      onEvent: (e) => {
        if (e.type === "delta") {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === "assistant" && !("kind" in last)) {
              return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: (m.content || "") + e.content } : m);
            }
            return [...prev, { role: "assistant", content: e.content, model, at: Date.now() }];
          });
        }
      },
      onDone: () => {},
      onError: () => {},
    });
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Failed to apply");
  }
};

const handleReject = (msg: ActionMsg) => {
  setMessages((prev) => prev.map((m) => m === msg ? { ...m, status: "rejected" } : m));
};

const handleClarifyAnswer = async (msg: ClarifyMsg, answers: { q: string; type: "radio" | "check"; options: string[]; selected: number[]; custom?: string }[]) => {
  setMessages((prev) => prev.map((m) => m === msg ? { ...m, status: "answered" } : m));
  const priorMsgs = messages.map((m) => ({ role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant", content: "content" in m ? m.content : "" }));
  setIsLoading(true);
  await sendStream({
    messages: priorMsgs,
    model,
    onEvent: (e: StreamEvent) => {
      if (e.type === "delta") {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant" && !("kind" in last)) {
            return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: (m.content || "") + e.content } : m);
          }
          return [...prev, { role: "assistant", content: e.content, model, at: Date.now() }];
        });
      } else if (e.type === "question") {
        setMessages((prev) => [...prev, { role: "assistant", kind: "clarify", call_id: e.call_id, questions: e.questions, status: "pending", at: Date.now() }]);
      } else if (e.type === "action") {
        if (e.recommendation) {
          setMessages((prev) => [...prev, { role: "assistant", kind: "action", call_id: e.call_id, tool: e.tool, recommendation: e.recommendation, alternatives: e.alternatives, status: "pending", at: Date.now() }]);
        }
      }
    },
    onDone: () => setIsLoading(false),
    onError: (err) => { setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${err}`, model, at: Date.now() }]); setIsLoading(false); },
  });
  // Also fire the /answer route so the server-side model resumes with function_call_output
  void apiFetch("/api/order-chat/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call_id: msg.call_id, answers, priorMessages: priorMsgs, model }),
  });
};
```

> Note: the `/answer` POST is fire-and-forget for the server audit/resume; the visible confirmation comes from the streamed `sendStream` call above it. This keeps the UX responsive. (If the two diverge in practice during QA, Task 10 step 8 will reconcile — prefer letting `/answer` be the single source and dropping the second `sendStream`. Decide during QA.)

4f. Add render branches in the messages map. Find the `messages.map((msg, i) => {` block and add at the top of the callback:

```tsx
if ("kind" in msg && msg.kind === "clarify") {
  return (
    <div key={i} className="flex justify-start">
      <AiClarifyCard questions={msg.questions} status={msg.status}
        onSubmit={(answers) => void handleClarifyAnswer(msg, answers)}
        onDismiss={() => setMessages((prev) => prev.map((m) => m === msg ? { ...m, status: "collapsed" } : m))} />
    </div>
  );
}
if ("kind" in msg && msg.kind === "action") {
  return (
    <div key={i} className="flex justify-start">
      <AiActionCard tool={msg.tool} recommendation={msg.recommendation} alternatives={msg.alternatives}
        status={msg.status} before={msg.before} after={msg.after}
        onApply={(args) => void handleApply(msg, args)}
        onReject={() => handleReject(msg)} />
    </div>
  );
}
```

4g. Update `quickQuestions` to include the admin example, filtered by role:

```tsx
const quickQuestions = [
  "How many orders are pending?",
  "Show orders sent to Steadfast",
  "What's the total revenue?",
  ...(isAdmin ? ["Add 50 stock to M size of Cocoa Brown Trouser"] : []),
  "Which orders have notes?",
];
```

- [ ] **Step 5: Modify `src/components/OrderChatComposer.tsx` (cosmetic)**

Add a subtle admin-only hint. Read the file first, then add near the input row, only when an `isAdmin` prop is `false` (pass it from `OrderChat`), a small muted label "AI mutations are admin-only." This is cosmetic — the server is the real gate. Keep the change minimal: add an optional `isAdmin` prop to `OrderChatComposer` and render the hint. (If the composer is shared with image mode, guard so it only shows in chat mode.)

- [ ] **Step 6: Run the wiring test**

Run: `npx vitest run src/test/orderChatWiring.test.tsx`
Expected: PASS.

- [ ] **Step 7: Run the full test suite + lint + build**

Run: `npm test && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 8: Manual QA (invoke the `qa` skill)**

End-to-end on localhost (admin): type "add 50 stock to a variant of an existing product" → see clarify or recommendation card → accept → "Applied" → model confirmation. Then as a team member: chat is read-only, no cards, `/apply` returns 403.

- [ ] **Step 9: Commit**

```bash
git add src/pages/OrderChat.tsx src/components/OrderChatComposer.tsx src/test/orderChatWiring.test.tsx
git commit -m "feat: wire AI mutation cards into Order Chat (admin-only, confirm-before-apply)"
```

---

### Task 11: Pre-ship review + ship

**Files:** none (process)

- [ ] **Step 1: Invoke the `review` skill**

Run the review skill on the diff against `main`. Focus: SQL safety, auth gaps, `org_id` isolation on every new query (AGENTS.md §12 rules 2, 3).

- [ ] **Step 2: Invoke the `verification-before-completion` skill**

Confirm `npm test && npm run lint && npm run build` are green and the manual QA passed.

- [ ] **Step 3: Invoke the `ship` skill**

Create the PR against `main` with a summary referencing the design spec at `docs/superpowers/specs/2026-08-18-order-chat-ai-mutations-design.md`.

---

## Self-Review

**1. Spec coverage:**
- Tool schemas (7 tools) → Task 2. ✓
- `executeAiAction` dispatcher → Task 3. ✓
- Modified `/api/order-chat` (admin tools, SSE question/action) → Task 4. ✓
- `/api/order-chat/apply` (admin, audit) → Task 5. ✓
- `/api/order-chat/answer` → Task 6. ✓
- `ai_action_log` table → Task 1. ✓
- `useAiChatStream` → Task 7. ✓
- `AiClarifyCard` (ApprovalCard port) → Task 8. ✓
- `AiActionCard` (RecommendationCard port) → Task 9. ✓
- `OrderChat.tsx` wiring + role guard + quick question → Task 10. ✓
- Org isolation test → Task 3 (unit) + Task 5 (source-inspection covers the gate). ✓
- Team-member read-only → Task 4 (no tools) + Task 10 (cosmetic). ✓
- Audit log → Task 1 (table) + Task 5 (insert). ✓
- No delete tools → enforced by tool-schema allowlist (Task 2 has exactly 6). ✓
- Courier cap 25 → Task 2 schema. ✓
- `normalizeBdPhone` before fraud/courier → Task 3 uses `checkFraudStatus` (normalizes internally) + `normalizeBdPhoneLocal` for courier. ✓

**2. Placeholder scan:** No "TBD"/"TODO"/"implement later". Every code step has full code. The one deliberate "decide during QA" note in Task 10 step 4e is a real ambiguity (double-call vs single-call for the confirmation turn) that needs runtime observation to resolve — flagged, not hidden.

**3. Type consistency:** `ClarifyQuestion` and `Recommendation` are defined in Task 7 (`useAiChatStream.ts`) and imported in Tasks 8, 9, 10. `executeAiAction` signature is consistent across Task 3 (definition) and Task 5 (call). `AI_ACTION_TOOLS`, `askUserTool`, `buildRecommendation` consistent across Tasks 2, 4, 5, 6. `Msg` union consistent in Task 10. ✓

One spec deviation documented inline: the spec said "extract existing route bodies into reusable functions"; the plan instead implements dedicated AI-action functions in `server/ai-actions.js` that call existing low-level helpers directly, leaving existing routes untouched (zero regression risk). This is a deliberate risk-reduction and is noted in the Architecture line at the top.
