# Image Embedding Product Matching — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match customer-sent product images to the business's catalog using vector similarity search instead of GPT name-guessing.

**Architecture:** GPT-4o-mini describes product images → text-embedding-3-small generates 1536-dim vectors → stored in `products.image_embedding` via pgvector → on customer image, same pipeline produces a query vector → cosine similarity finds top 3 matches → passed to the AI as candidates.

**Tech Stack:** Supabase PostgreSQL + pgvector extension, OpenAI GPT-4o-mini (vision), OpenAI text-embedding-3-small, Express.js (server/index.js)

---

### Task 1: Enable pgvector and add embedding column

**Files:**
- Modify: `server/index.js` (inside `migrateMultiTenancy()` SQL block, ~line 7196)

- [ ] **Step 1: Add pgvector extension and column migration**

Add these SQL statements to the migration block in `migrateMultiTenancy()`, after the existing products table creation/alterations:

```js
// Inside the SQL template string in migrateMultiTenancy(), after products table setup:
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_embedding vector(1536);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_description TEXT;
CREATE INDEX IF NOT EXISTS idx_products_embedding ON public.products USING ivfflat (image_embedding vector_cosine_ops) WITH (lists = 100);
```

Note: The `ivfflat` index requires at least ~100 rows to be effective. For smaller tables it will still work, just without the index speedup. Supabase's pgvector supports this natively.

- [ ] **Step 2: Verify migration runs**

Run: `npm run dev` — check console output for no SQL errors on startup.

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: add pgvector extension and image_embedding column to products"
```

---

### Task 2: Create embedding generation helpers

**Files:**
- Modify: `server/index.js` (add new helper functions after `prepareOpenAiImageRef` at ~line 4310)

- [ ] **Step 1: Add `describeProductImage` helper**

Insert after `prepareOpenAiImageRef` function (~line 4312):

```js
// ─── Image Embedding Helpers ─────────────────────────────────────────────────

async function describeProductImage(imageUrl) {
  if (!imageUrl || !process.env.OPENAI_API_KEY) return null;
  try {
    const safeUrl = await prepareOpenAiImageRef(imageUrl);
    if (!safeUrl) return null;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 150,
        messages: [
          {
            role: "system",
            content: "Describe this product image in 1-2 sentences for search purposes. Focus on: product type, material, color, shape, size, and primary function. Be specific and factual. Do not mention backgrounds or styling.",
          },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: safeUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.warn("[Embedding] describeProductImage failed:", err.message);
    return null;
  }
}
```

- [ ] **Step 2: Add `generateTextEmbedding` helper**

Insert directly after `describeProductImage`:

```js
async function generateTextEmbedding(text) {
  if (!text || !process.env.OPENAI_API_KEY) return null;
  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.data?.[0]?.embedding || null;
  } catch (err) {
    console.warn("[Embedding] generateTextEmbedding failed:", err.message);
    return null;
  }
}
```

- [ ] **Step 3: Add `generateProductEmbedding` orchestrator**

Insert directly after `generateTextEmbedding`:

```js
async function generateProductEmbedding(imageUrl) {
  const description = await describeProductImage(imageUrl);
  if (!description) return { embedding: null, description: null };
  const embedding = await generateTextEmbedding(description);
  return { embedding, description };
}
```

- [ ] **Step 4: Add `findSimilarProducts` query helper**

Insert directly after `generateProductEmbedding`:

```js
async function findSimilarProducts(orgId, embedding, limit = 3, threshold = 0.75) {
  if (!embedding || !orgId) return [];
  const supabase = getServiceSupabase();
  const vectorStr = `[${embedding.join(",")}]`;

  const { data, error } = await supabase.rpc("match_products_by_embedding", {
    query_embedding: vectorStr,
    match_org_id: orgId,
    match_threshold: threshold,
    match_count: limit,
  });

  if (error) {
    console.warn("[Embedding] findSimilarProducts RPC failed:", error.message);
    return [];
  }
  return data || [];
}
```

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "feat: add image embedding generation and similarity search helpers"
```

---

### Task 3: Create the Supabase RPC function for vector search

**Files:**
- Modify: `server/index.js` (add SQL function in `migrateMultiTenancy()`)

- [ ] **Step 1: Add the `match_products_by_embedding` SQL function**

Add this SQL to the migration block in `migrateMultiTenancy()`, after the vector column creation from Task 1:

```js
CREATE OR REPLACE FUNCTION match_products_by_embedding(
  query_embedding vector(1536),
  match_org_id UUID,
  match_threshold FLOAT DEFAULT 0.75,
  match_count INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  selling_price NUMERIC,
  image_url TEXT,
  image_description TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.selling_price,
    p.image_url,
    p.image_description,
    1 - (p.image_embedding <=> query_embedding) AS similarity
  FROM public.products p
  WHERE p.org_id = match_org_id
    AND p.image_embedding IS NOT NULL
    AND 1 - (p.image_embedding <=> query_embedding) > match_threshold
  ORDER BY p.image_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

- [ ] **Step 2: Commit**

```bash
git add server/index.js
git commit -m "feat: add match_products_by_embedding SQL RPC function"
```

---

### Task 4: Auto-generate embeddings on product create/update

**Files:**
- Modify: `server/index.js` (product save endpoint ~line 6397, product patch endpoint ~line 6732)

- [ ] **Step 1: Add embedding generation after product insert**

In `POST /api/products/save` (~line 6420), after the successful insert and variant handling, add background embedding generation:

```js
// After line: return res.json({ saved: data.length, variants_saved: variantRows.length, products: data });
// Replace the return with:

    // Generate embeddings in background (non-blocking)
    for (const product of data) {
      if (product.image_url) {
        generateProductEmbedding(product.image_url).then(({ embedding, description }) => {
          if (embedding) {
            const vectorStr = `[${embedding.join(",")}]`;
            supabase.from("products").update({
              image_embedding: vectorStr,
              image_description: description,
            }).eq("id", product.id).eq("org_id", orgId).then(({ error }) => {
              if (error) console.warn(`[Embedding] save failed for ${product.id}:`, error.message);
              else console.log(`[Embedding] generated for product ${product.id}: "${description?.slice(0, 60)}..."`);
            });
          }
        }).catch((err) => console.warn(`[Embedding] generation failed for ${product.id}:`, err.message));
      }
    }

    return res.json({ saved: data.length, variants_saved: variantRows.length, products: data });
```

- [ ] **Step 2: Add embedding regeneration on image_url update**

In `PATCH /api/products/:id` (~line 6732), after the successful update, regenerate embedding if image changed:

```js
// After: data = { ...data, stock_quantity: ... };
// Before: return res.json({ success: true, product: data });

    // Regenerate embedding if image_url changed
    if (update.image_url && data.image_url) {
      generateProductEmbedding(data.image_url).then(({ embedding, description }) => {
        if (embedding) {
          const vectorStr = `[${embedding.join(",")}]`;
          supabase.from("products").update({
            image_embedding: vectorStr,
            image_description: description,
          }).eq("id", data.id).eq("org_id", orgId).then(() => {});
        }
      }).catch(() => {});
    }

    return res.json({ success: true, product: data });
```

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: auto-generate image embeddings on product create/update"
```

---

### Task 5: Backfill embeddings for existing products

**Files:**
- Modify: `server/index.js` (add backfill function near `bootstrapAiProductContext` ~line 7072, call it on startup)

- [ ] **Step 1: Add `backfillProductEmbeddings` function**

Insert after `bootstrapAiProductContext` function:

```js
async function backfillProductEmbeddings() {
  if (!process.env.OPENAI_API_KEY) return;
  const supabase = getServiceSupabase();

  // Find products with image_url but no embedding
  const { data: products, error } = await supabase
    .from("products")
    .select("id, image_url, org_id")
    .not("image_url", "is", null)
    .is("image_embedding", null)
    .limit(50); // Process 50 at a time to avoid rate limits

  if (error || !products?.length) {
    if (products?.length === 0) console.log("[Embedding Backfill] All products have embeddings.");
    return;
  }

  console.log(`[Embedding Backfill] Processing ${products.length} products without embeddings...`);
  let count = 0;

  for (const product of products) {
    try {
      const { embedding, description } = await generateProductEmbedding(product.image_url);
      if (embedding) {
        const vectorStr = `[${embedding.join(",")}]`;
        await supabase.from("products").update({
          image_embedding: vectorStr,
          image_description: description,
        }).eq("id", product.id);
        count++;
      }
      // Rate limit: ~3 requests/sec to stay within OpenAI limits
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      console.warn(`[Embedding Backfill] Failed for ${product.id}:`, err.message);
    }
  }

  console.log(`[Embedding Backfill] Generated ${count}/${products.length} embeddings.`);
}
```

- [ ] **Step 2: Call backfill on startup**

In the server startup block (~line 7256), add the backfill call:

```js
httpServer.listen(PORT, "0.0.0.0", async () => {
  console.log(`Server running on port ${PORT}`);
  await ensureAppSettingsTable();
  await migrateInboxOrdersTable();
  await migrateMultiTenancy();
  await bootstrapAiProductContext();
  // Backfill embeddings in background (non-blocking)
  backfillProductEmbeddings().catch((err) => console.warn("[Embedding Backfill] Error:", err.message));
});
```

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: backfill image embeddings for existing products on startup"
```

---

### Task 6: Integrate embedding search into handleMetaMessage

**Files:**
- Modify: `server/index.js` (~line 4857, inside `handleMetaMessage`, between context loading and GPT call)

- [ ] **Step 1: Add embedding-based product search when customer sends image**

After the context loading block (line ~4862) and before the GPT call (line ~4878), insert:

```js
  // 3b. If customer sent an image, find similar products via embedding search
  let embeddingMatches = [];
  if (allImageUrls.length > 0) {
    try {
      const customerImageUrl = allImageUrls[0];
      const safeUrl = await prepareOpenAiImageRef(customerImageUrl, platformToken);
      if (safeUrl) {
        const description = await describeProductImage(safeUrl);
        if (description) {
          const embedding = await generateTextEmbedding(description);
          if (embedding) {
            embeddingMatches = await findSimilarProducts(orgId, embedding, 3, 0.6);
            if (embeddingMatches.length > 0) {
              console.log(`[${platform.toUpperCase()} AI] Embedding matches: ${embeddingMatches.map((m) => `${m.name} (${(m.similarity * 100).toFixed(1)}%)`).join(", ")}`);
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[${platform.toUpperCase()} AI] Embedding search failed:`, err.message);
    }
  }
```

- [ ] **Step 2: Pass embedding matches to the AI call**

Modify the `runMetaAI` call to include embedding matches:

```js
  aiResult = await runMetaAI({ brandDoc, products, conversationHistory, customerMessage: text || "", imageUrls: allImageUrls, platformToken, existingOrder, aiSummary, embeddingMatches });
```

- [ ] **Step 3: Update `runMetaAI` function signature and system prompt**

In the `runMetaAI` function definition (~line 4423), add `embeddingMatches = []` to the destructured params:

```js
async function runMetaAI({ brandDoc, products, conversationHistory, customerMessage, imageUrls, imageUrl, platformToken = "", existingOrder = null, aiSummary = "", embeddingMatches = [] }) {
```

Then in the system prompt, add after the CATALOG section:

```js
${embeddingMatches.length > 0 ? `\nIMAGE MATCH RESULTS (products from our catalog that visually match the customer's image, ranked by similarity):\n${embeddingMatches.map((m, i) => `${i + 1}. ${m.name} — ৳${m.selling_price || "N/A"} (${(m.similarity * 100).toFixed(0)}% match)${m.image_description ? ` [${m.image_description}]` : ""}`).join("\n")}\n\nIMPORTANT: If the customer sent an image, prefer the IMAGE MATCH RESULTS above over guessing from the catalog names. The top match is very likely the correct product. Use it to respond.` : ""}
```

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat: integrate embedding similarity search into AI message handler"
```

---

### Task 7: Add API endpoint for manual embedding regeneration

**Files:**
- Modify: `server/index.js` (add new endpoint after products routes)

- [ ] **Step 1: Add `POST /api/products/regenerate-embeddings` endpoint**

```js
app.post("/api/products/regenerate-embeddings", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId, role } = await getUserOrg(supabase, user.id);
    if (role !== "admin") return res.status(403).json({ error: "Admin only" });

    const { data: products, error } = await supabase
      .from("products")
      .select("id, image_url")
      .eq("org_id", orgId)
      .not("image_url", "is", null);

    if (error) throw error;
    if (!products?.length) return res.json({ message: "No products with images found", processed: 0 });

    // Process in background
    res.json({ message: `Regenerating embeddings for ${products.length} products. This runs in the background.`, total: products.length });

    let count = 0;
    for (const product of products) {
      try {
        const { embedding, description } = await generateProductEmbedding(product.image_url);
        if (embedding) {
          const vectorStr = `[${embedding.join(",")}]`;
          await supabase.from("products").update({
            image_embedding: vectorStr,
            image_description: description,
          }).eq("id", product.id).eq("org_id", orgId);
          count++;
        }
        await new Promise((r) => setTimeout(r, 350));
      } catch {}
    }
    console.log(`[Embedding Regen] Done: ${count}/${products.length} for org ${orgId}`);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add server/index.js
git commit -m "feat: add manual embedding regeneration endpoint"
```

---

### Task 8: Final integration test and cleanup

- [ ] **Step 1: Start the dev server and verify startup**

Run: `npm run dev`

Expected: Console shows migration running, no errors about vector/pgvector. Backfill begins processing products.

- [ ] **Step 2: Test embedding generation**

Send a POST to save a product with an image_url, then check the DB for the embedding:

```bash
# Check if embeddings are being generated (in server logs)
# Look for: [Embedding] generated for product xxx: "A gold stainless steel teapot..."
```

- [ ] **Step 3: Test similarity search via a real customer image**

Send a test message with a product image through the social inbox. Check logs for:
```
[FACEBOOK AI] Embedding matches: Oil Storage Jar (87.3%), ...
```

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: image embedding product matching — complete implementation"
```

---

## Summary

| Task | What it does |
|------|-------------|
| 1 | Enable pgvector, add column + index |
| 2 | Create describe → embed → search helpers |
| 3 | SQL RPC function for vector similarity |
| 4 | Auto-embed on product create/update |
| 5 | Backfill existing products on startup |
| 6 | Wire into handleMetaMessage AI flow |
| 7 | Manual regeneration endpoint for admins |
| 8 | Integration test and verification |
