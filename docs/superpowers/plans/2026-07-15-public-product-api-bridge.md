# Public Product API Bridge Implementation Plan

> **Superseded for new work (2026-08-27):** This Cloudflare-oriented plan is historical. Use `docs/superpowers/specs/2026-08-27-realtime-storefront-sync-design.md` and create a new Vercel-oriented implementation plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public-facing product API so merchant custom websites can read product data (title, price, stock, images) from Merchant-Suite via Cloudflare edge cache.

**Architecture:** New `GET /api/public/v1/:handle/products` endpoints with split TTLs (300s list, 60s detail), behind Cloudflare proxy with Tiered Cache. On product publish/update, an inline fire-and-forget purge + warm sequence refreshes the edge cache. Products are gated by a new `published` column — nothing is publicly visible until the merchant toggles it.

**Tech Stack:** Express.js, Supabase PostgreSQL, Cloudflare (proxy + cache + image optimization), Upstash Redis (rate limiting), `crypto.timingSafeEqual` for warm-token comparison.

---
## File Map

| File | Action | Responsibility |
|---|---|---|
| `server/index.js` | Modify | Schema migration, purge helper, purge wired into PATCH/DELETE/publish-all routes, public v1 endpoints, rate limiter, `trust proxy`, `POST /api/storefront/handle` route |
| `src/pages/Products.tsx` | Modify | shadcn Switch for publish/unpublish per product, "Publish All" button calling bulk route |
| `src/pages/Settings.tsx` | Modify | Storefront handle input field |
| `.env.example` | Modify | Document new env vars |
| `docs/public-api.md` | Create | Merchant-facing documentation |

---

### Task 1: Schema Migration — Add published, slug, description columns

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add the migration function**

Add this right after `migrateProductsForecastColumns()` (closing `}` around line 8416):

```js
async function migratePublicProductApi() {
  try {
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
    if (!projectRef || !serviceKey) return;

    const migrationSql = `
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description TEXT;
UPDATE public.products SET slug = lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9\\s-]', '', 'g'), '\\s+', '-', 'g')) WHERE slug IS NULL AND name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_org_slug ON public.products (org_id, slug) WHERE slug IS NOT NULL;
NOTIFY pgrst, 'reload schema';
    `;

    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ query: migrationSql }),
    });
    if (!response.ok) {
      const text = await response.text();
      console.warn("[Migrate] public product API columns failed:", text);
      return;
    }
    console.log("[Migrate] public product API columns ensured.");
  } catch (e) {
    console.warn("[Migrate] Could not run public product API migration:", e.message);
  }
}
```

The `UPDATE` backfills slugs for existing products. Products whose names produce empty slugs keep `slug: NULL` — acceptable for v1.

- [ ] **Step 2: Call the migration at cold start**

In the server startup block (~line 8694), between `migrateInboxOrdersTable()` and `migrateMultiTenancy()`:

```js
await migratePublicProductApi();
```

Also in the Vercel cold-start block (~line 8706):

```js
migratePublicProductApi().catch(() => {});
```

Run: `npm run dev`
Expected: Console prints `[Migrate] public product API columns ensured.`

- [ ] **Step 3: Add defensive Cache-Control to all authenticated /api/* routes + exclude /public/**

Find the global `app.use("/api", ...)` middleware at ~line 164. Replace it with:

```js
app.use("/api", (req, res, next) => {
  const path = req.path;
  // Public v1 routes use their own caching — skip global rate limiter
  if (path.startsWith("/public/")) return next();
  // All other /api/* responses are private — never cache
  res.set("Cache-Control", "private, no-store");
  // Exclude webhook endpoints and public config from rate limiting
  if (
    path.startsWith("/webhooks/") ||
    path === "/tracker.js" ||
    path === "/live-visitor/ping" ||
    path === "/config"
  ) return next();
  return rateLimitAPI(req, res, next);
});
```

This does two things: (1) prevents any Cloudflare misconfiguration from caching authenticated data (tenant-leak defense), (2) exempts the public v1 routes from the global 120/min rate limiter so the warm-token bypass in `publicRateLimit` isn't defeated.

- [ ] **Step 4: Add published + slug to GET /api/products**

The existing `GET /api/products` (~line 7626) uses `select("*")` then maps fields. After the migration, `published` and `slug` will be in the spread. Verify the response includes both when querying the endpoint.

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "feat: add published, slug, description columns for public product API"
```

---

### Task 2: Storefront Handle Storage + Set Handle Route

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add handle helpers with in-memory cache + hijacking protection**

Add near the other settings helpers (~line 1000):

```js
// ─── Public Storefront Handle ────────────────────────────────────────────────

const handleCache = new Map();
const HANDLE_CACHE_TTL = 60_000;

async function resolveStorefrontHandle(handle) {
  const cacheKey = `handle:${handle}`;
  const cached = handleCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.orgId;

  const settings = await getSettings([`storefront_handle:${handle}`]);
  const orgId = settings[`storefront_handle:${handle}`] || null;

  if (orgId) {
    handleCache.set(cacheKey, { orgId, expiresAt: Date.now() + HANDLE_CACHE_TTL });
  }
  return orgId;
}

async function setStorefrontHandle(orgId, handle) {
  if (!orgId || !handle) return;

  // Check for hijacking: if key exists belonging to a different org, reject
  const existing = await getSettings([`storefront_handle:${handle}`]);
  const existingOrgId = existing[`storefront_handle:${handle}`];
  if (existingOrgId && existingOrgId !== orgId) {
    throw new Error(`Storefront handle "${handle}" is already taken`);
  }

  await saveSettings({ [`storefront_handle:${handle}`]: orgId });
  await saveSettings({ [`${orgId}:public_storefront_handle`]: handle });
  handleCache.delete(`handle:${handle}`);
}

async function getStorefrontHandle(orgId) {
  const settings = await getSettings([`${orgId}:public_storefront_handle`]);
  return settings[`${orgId}:public_storefront_handle`] || null;
}
```

- [ ] **Step 2: Add POST + GET /api/storefront/handle routes**

Add these in the Settings domain section:

```js
const RESERVED_HANDLES = new Set([
  "admin", "api", "www", "dashboard", "settings", "auth",
  "public", "v1", "merchant", "support", "help", "docs",
  "status", "health", "login", "register", "signup", "billing",
]);

app.post("/api/storefront/handle", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId, role } = await getUserOrg(supabase, user.id);
    if (role !== "admin") return res.status(403).json({ error: "Admin only" });

    const { handle } = req.body;
    if (!handle || typeof handle !== "string") {
      return res.status(400).json({ error: "handle is required" });
    }

    const clean = handle.trim().toLowerCase();
    if (!/^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$/.test(clean) || clean.length < 2 || clean.length > 50) {
      return res.status(400).json({
        error: "Handle must be 2-50 characters, lowercase letters, numbers, and hyphens only (no leading/trailing hyphen)",
      });
    }
    if (RESERVED_HANDLES.has(clean)) {
      return res.status(400).json({ error: `"${clean}" is a reserved handle` });
    }

    await setStorefrontHandle(orgId, clean);
    return res.json({ success: true, handle: clean });
  } catch (e) {
    if (e.message.includes("is already taken")) {
      return res.status(409).json({ error: e.message });
    }
    return sendError(res, e);
  }
});

app.get("/api/storefront/handle", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);
    const handle = await getStorefrontHandle(orgId);
    return res.json({ handle: handle || null });
  } catch (e) {
    return sendError(res, e);
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: add storefront handle helpers and set/get routes"
```

---

### Task 3: Centralized purgeProductCache Helper

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add environment config constants**

Near the top after rate limit setup (~line 58):

```js
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID || "";
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || "";
const PUBLIC_DOMAIN = process.env.PUBLIC_DOMAIN || "";
const WARM_TOKEN = process.env.WARM_TOKEN || "";
```

- [ ] **Step 2: Add the purge function**

Add after `getStorefrontHandle`:

```js
async function purgeProductCache(orgId, productId, { listChanged = false, warm = true } = {}) {
  if (!CLOUDFLARE_ZONE_ID || !CLOUDFLARE_API_TOKEN || !PUBLIC_DOMAIN) {
    console.warn("[Purge] Cloudflare not configured — skipping purge");
    return;
  }
  const handle = await getStorefrontHandle(orgId);
  if (!handle) return;

  const urls = [];
  if (productId) urls.push(`https://${PUBLIC_DOMAIN}/api/public/v1/${handle}/products/${productId}`);
  if (listChanged) urls.push(`https://${PUBLIC_DOMAIN}/api/public/v1/${handle}/products`);

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ files: urls }),
      }
    );
    if (!response.ok) {
      const body = await response.text();
      console.warn(`[Purge] Cloudflare purge failed: ${body}`);
    } else {
      console.log(`[Purge] Purged ${urls.length} URL(s) for org ${orgId} product ${productId}`);
    }
  } catch (e) {
    console.warn("[Purge] Cloudflare purge error:", e.message);
  }

  if (warm) {
    const warmHeaders = { headers: { "X-Warm-Token": WARM_TOKEN } };
    for (const url of urls) {
      fetch(url, warmHeaders).catch(() => {});
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: add centralized purgeProductCache helper"
```

---

### Task 4: Wire Purge into Product Mutation Routes

**Files:**
- Modify: `server/index.js`

**Rules:**
- PATCH: purge when published status changes or if already published — **skip purge if the update only touched `stock_quantity`**
- DELETE: purge (no warm)
- Variant routes: never purge (60s TTL self-heals)
- Save route: no purge (products created unpublished; publish via PATCH triggers purge)

- [ ] **Step 1: Add slug generation helper**

Add near the purge helper:

```js
function generateSlug(name) {
  if (!name) return null;
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || null;
}
```

- [ ] **Step 2: Add slug + description to POST /api/products/save**

In the save route ~line 7680, update the `rows.map()`:

```js
    const rows = products.map((p) => ({
      name: String(p.name || "").trim(),
      slug: generateSlug(p.name) || null,
      url: p.url || null,
      image_url: p.image_url || null,
      selling_price: p.selling_price != null ? parseFloat(p.selling_price) : null,
      cog: p.cog != null ? parseFloat(p.cog) : 0,
      description: p.description || null,
      source_url: sourceUrl || null,
      org_id: orgId,
    })).filter((r) => r.name);
```

Slugs are non-unique in v1 (API keys by `:id`). Collisions won't error.

No purge added here — products are created unpublished.

- [ ] **Step 3: PATCH /api/products/:id — purge after update, skip if stock-only**

Find the PATCH route ~line 8090. Replace the section from the `hasStockUpdate` block to the return.

The current code around line 8117-8131:

```js
    if (hasStockUpdate) await saveProductStock(orgId, req.params.id, req.body.stock_quantity);
    data = { ...data, stock_quantity: hasStockUpdate ? Math.max(0, parseInt(req.body.stock_quantity, 10) || 0) : 0 };

    // Regenerate embedding if image_url changed
    if (update.image_url && data.image_url) {
      generateProductEmbedding(data.image_url).then(({ embedding, description }) => {
        ...
      }).catch(() => {});
    }

    return res.json({ success: true, product: data });
```

Replace with:

```js
    if (hasStockUpdate) await saveProductStock(orgId, req.params.id, req.body.stock_quantity);
    data = { ...data, stock_quantity: hasStockUpdate ? Math.max(0, parseInt(req.body.stock_quantity, 10) || 0) : 0 };

    // Purge cache unless the update only touched stock_quantity
    const changedFields = Object.keys(update);
    const onlyStockChanged = hasStockUpdate && changedFields.length === 0;
    const isUnpublishing = update.published === false;
    if (!onlyStockChanged && (data.published || isUnpublishing)) {
      const isPublishing = update.published === true;
      const listChanged = isPublishing || isUnpublishing;
      purgeProductCache(orgId, data.id, {
        listChanged,
        warm: !isUnpublishing,
      }).catch(() => {});
    }

    // Regenerate embedding if image_url changed
    if (update.image_url && data.image_url) {
      generateProductEmbedding(data.image_url).then(({ embedding, description }) => {
        if (embedding) {
          const vectorStr = `[${embedding.join(",")}]`;
          supabase.from("products").update({ image_embedding: vectorStr, image_description: description })
            .eq("id", data.id).eq("org_id", orgId).then(() => {});
        }
      }).catch(() => {});
    }

    return res.json({ success: true, product: data });
```

Also update the `allowed` array to include `published`, `slug`, `description`:

```js
    const allowed = ["name", "url", "image_url", "selling_price", "cog", "published", "slug", "description"];
```

- [ ] **Step 4: DELETE /api/products/:id — purge after delete (no warm)**

Find the DELETE route ~line 8137. Replace the block:

```js
    const { error } = await supabase.from("products").delete().eq("id", req.params.id).eq("org_id", orgId);
    if (error) throw error;

    purgeProductCache(orgId, req.params.id, { listChanged: true, warm: false }).catch(() => {});

    return res.json({ success: true });
```

- [ ] **Step 5: Add POST /api/products/publish-all — bulk publish, one purge**

Add after the DELETE route:

```js
app.post("/api/products/publish-all", async (req, res) => {
  try {
    const { user } = await getUser(getToken(req));
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const supabase = getServiceSupabase();
    const { orgId } = await getUserOrg(supabase, user.id);

    const { data, error } = await supabase
      .from("products")
      .update({ published: true })
      .eq("org_id", orgId)
      .eq("published", false)
      .select("id");

    if (error) throw error;

    purgeProductCache(orgId, null, { listChanged: true, warm: true }).catch(() => {});

    return res.json({ success: true, published: (data || []).length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
```

Note: `productId=null` skips the detail URL entirely — only the list endpoint is purged and warmed. Detail endpoints warm on first real visitor (60s TTL, acceptable).

- [ ] **Step 6: Verify compilation**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add server/index.js
git commit -m "feat: wire purge into PATCH/DELETE/publish-all, skip on stock-only changes"
```

---

### Task 5: Public v1 Endpoints

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Set Express trust proxy**

Near the top where `app` is created (~line 145):

```js
app.set("trust proxy", 2); // Cloudflare → Railway proxy → Express
```

- [ ] **Step 2: Add public rate limiter**

Alongside existing rate limiter setup (~line 31-58):

```js
const rlPublic = redisClient
  ? new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(60, "60 s"),
      prefix: "rl:public",
    })
  : null;
```

- [ ] **Step 3: Add the public v1 routes with variant-aware in_stock**

Add this block in a dedicated section after the product-variants routes (~after line 8296):

```js
// ─── Public Product API (v1) ─────────────────────────────────────────────────

function publicRateLimit(req, res, next) {
  if (isWarmRequest(req)) return next(); // warm fetches skip rate limiting
  if (!rlPublic) return next();
  const ip = req.headers["cf-connecting-ip"] || req.ip || req.socket.remoteAddress;
  rlPublic.limit(ip).then(({ success }) => {
    if (!success) return res.status(429).json({ error: "Too many requests" });
    next();
  }).catch(() => next());
}

function isWarmRequest(req) {
  if (!WARM_TOKEN) return false;
  const token = req.headers["x-warm-token"] || "";
  if (!token) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(WARM_TOKEN));
  } catch {
    return false;
  }
}

// GET /api/public/v1/:handle/products — list published products
app.get(
  "/api/public/v1/:handle/products",
  publicTrackerCors,
  publicRateLimit,
  async (req, res) => {
    res.set("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");

    try {
      const orgId = await resolveStorefrontHandle(req.params.handle);
      if (!orgId) {
        res.set("Cache-Control", "no-store");
        return res.status(404).json({ error: "storefront_not_found" });
      }

      const supabase = getServiceSupabase();
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, description, url, image_url, selling_price")
        .eq("org_id", orgId)
        .eq("published", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const productIds = (data || []).map((p) => p.id);
      const stockMap = await getProductStockMap(orgId, productIds);

      // Fetch variants for all listed products (needed for variant-aware in_stock)
      let variantsByProduct = {};
      if (productIds.length > 0) {
        const { data: variantRows } = await supabase
          .from("product_variants")
          .select("product_id, stock_quantity")
          .in("product_id", productIds)
          .eq("org_id", orgId);
        for (const v of variantRows || []) {
          if (!variantsByProduct[v.product_id]) variantsByProduct[v.product_id] = [];
          variantsByProduct[v.product_id].push(v);
        }
      }

      const products = (data || []).map((p) => {
        const productStock = stockMap[p.id] || 0;
        const variants = variantsByProduct[p.id] || [];
        // If product has variants, in_stock means at least one variant has stock
        const inStock = variants.length > 0
          ? variants.some((v) => v.stock_quantity > 0)
          : productStock > 0;

        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          description: p.description || null,
          url: p.url,
          image_url: p.image_url,
          selling_price: p.selling_price != null ? Number(p.selling_price) : null,
          in_stock: inStock,
        };
      });

      return res.json({ products });
    } catch (e) {
      res.set("Cache-Control", "no-store");
      return res.status(500).json({ error: "internal_error" });
    }
  }
);

// GET /api/public/v1/:handle/products/:id — single product detail
app.get(
  "/api/public/v1/:handle/products/:id",
  publicTrackerCors,
  publicRateLimit,
  async (req, res) => {
    res.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");

    try {
      const orgId = await resolveStorefrontHandle(req.params.handle);
      if (!orgId) {
        res.set("Cache-Control", "no-store");
        return res.status(404).json({ error: "storefront_not_found" });
      }

      const supabase = getServiceSupabase();
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, description, url, image_url, selling_price")
        .eq("org_id", orgId)
        .eq("id", req.params.id)
        .eq("published", true)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        res.set("Cache-Control", "no-store");
        return res.status(404).json({ error: "product_not_found" });
      }

      const stockMap = await getProductStockMap(orgId, [data.id]);
      const stockQuantity = stockMap[data.id] || 0;

      const { data: variantRows } = await supabase
        .from("product_variants")
        .select("id, attributes, price_adjustment, stock_quantity")
        .eq("product_id", data.id)
        .eq("org_id", orgId);

      const product = {
        id: data.id,
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        url: data.url,
        image_url: data.image_url,
        selling_price: data.selling_price != null ? Number(data.selling_price) : null,
        stock_quantity: stockQuantity,
        variants: (variantRows || []).map((v) => ({
          id: v.id,
          attributes: v.attributes,
          price_adjustment: v.price_adjustment != null ? Number(v.price_adjustment) : 0,
          stock_quantity: v.stock_quantity || 0,
        })),
      };

      return res.json({ product });
    } catch (e) {
      res.set("Cache-Control", "no-store");
      return res.status(500).json({ error: "internal_error" });
    }
  }
);
```

- [ ] **Step 4: Verify the routes work**

Start: `npm run dev`

```bash
# 1. Set handle
TOKEN="your-admin-jwt"
curl -s -X POST http://localhost:24678/api/storefront/handle \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"handle":"demo"}'
# Expected: {"success":true,"handle":"demo"}

# 2. Create product (unpublished)
curl -s -X POST http://localhost:24678/api/products/save \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"products":[{"name":"Widget","selling_price":299}]}'
# Save the returned product ID

# 3. List should be empty (product not published)
curl -s http://localhost:24678/api/public/v1/demo/products
# Expected: {"products":[]}

# 4. Publish
curl -s -X PATCH http://localhost:24678/api/products/<ID> \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"published":true}'

# 5. Product appears
curl -s http://localhost:24678/api/public/v1/demo/products
# Expected: {"products":[{"name":"Widget","selling_price":299,...}]}
```

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "feat: add public v1 product API endpoints with variant-aware in_stock"
```

---

### Task 6: Dashboard Publish Toggle + Bulk Publish

**Files:**
- Modify: `src/pages/Products.tsx`

- [ ] **Step 1: Add published and slug to the Product type**

Find the `Product` type definition in `src/pages/Products.tsx` (around line 36-47). Add `published` and `slug`:

```ts
interface Product {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  url: string | null;
  image_url: string | null;
  selling_price: number | null;
  cog: number;
  stock_quantity: number;
  published: boolean;
  variants: Variant[];
  // ... existing fields
}
```

If the type is inferred from the API response rather than explicitly declared, the `select("*")` + spread at `GET /api/products` line 7657 already returns these fields post-migration. But because TypeScript is strict (`npm run build` type-checks — CLAUDE.md §9), the switch toggle `product.published` and filter `!product.published` will fail at compile time without the type. Add the fields explicitly.

Verify the type compiles before moving on:

```bash
npm run build
```

- [ ] **Step 2: Add a shadcn Switch column for publish toggle**

Add import: `import { Switch } from "@/components/ui/switch";`

In the table column rendering, add a "Published" column:

```tsx
<Switch
  checked={product.published}
  onCheckedChange={(checked) =>
    togglePublish.mutate({ id: product.id, published: checked })
  }
/>
```

Define the mutation:

```tsx
const togglePublish = useMutation({
  mutationFn: async ({ id, published }: { id: string; published: boolean }) => {
    const res = await apiFetch(`/api/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ published }),
    });
    if (!res.ok) throw new Error("Failed to toggle publish");
    return res.json();
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
});
```

- [ ] **Step 3: Add "Publish All" button**

Find the toolbar area. Get unpublished count from the products query:

```tsx
const { data: productsData } = useQuery({ queryKey: ["products"], ... });
const products = productsData?.products || [];
const unpublishedCount = products.filter((p) => !p.published).length;

const publishAll = useMutation({
  mutationFn: async () => {
    const res = await apiFetch("/api/products/publish-all", { method: "POST" });
    if (!res.ok) throw new Error("Failed to publish all");
    return res.json();
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
});
```

Render:

```tsx
{unpublishedCount > 0 && (
  <Button
    variant="outline"
    size="sm"
    onClick={() => publishAll.mutate()}
    disabled={publishAll.isPending}
  >
    {publishAll.isPending ? "Publishing..." : `Publish All (${unpublishedCount})`}
  </Button>
)}
```

Use shadcn `Button` — not custom-colored raw buttons. Follow the project's design system.

- [ ] **Step 4: Verify**

Toggle a product. Confirm the Switch reflects DB state. Confirm public endpoint includes/excludes it. Click Publish All and verify all unpublished products flip to published with one API call.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Products.tsx
git commit -m "feat: add shadcn Switch publish toggle and Publish All button"
```

---

### Task 7: Storefront Handle in Settings Page

**Files:**
- Modify: `src/pages/Settings.tsx`

- [ ] **Step 1: Read the Settings page**

Read `src/pages/Settings.tsx`. Find the section where Shopify/Facebook credentials are configured. Add a "Storefront" section nearby.

- [ ] **Step 2: Add storefront handle input**

Add imports: `import { Input } from "@/components/ui/input";` (Button and useQuery may already be imported).

```tsx
const { data: handleData, refetch: refetchHandle } = useQuery({
  queryKey: ["storefront-handle"],
  queryFn: async () => {
    const res = await apiFetch("/api/storefront/handle");
    const data = await res.json();
    return data.handle;
  },
});

const setHandle = useMutation({
  mutationFn: async (handle: string) => {
    const res = await apiFetch("/api/storefront/handle", {
      method: "POST",
      body: JSON.stringify({ handle }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    return res.json();
  },
  onSettled: () => refetchHandle(),
});
```

Render:

```tsx
```tsx
const [handleInput, setHandleInput] = useState("");

useEffect(() => {
  if (handleData) setHandleInput(handleData);
}, [handleData]);
```

```tsx
<div className="space-y-4">
  <h3 className="text-sm font-medium">Storefront Handle</h3>
  <p className="text-xs text-muted-foreground">
    Your public product API will be available at:
    <code className="ml-1 text-primary/70">
      /api/public/v1/{handleData || "your-handle"}/products
    </code>
  </p>
  <div className="flex gap-2">
    <Input
      placeholder="my-store"
      value={handleInput}
      onChange={(e) => setHandleInput(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && handleInput.trim()) {
          setHandle.mutate(handleInput.trim().toLowerCase());
        }
      }}
    />
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        if (handleInput.trim()) setHandle.mutate(handleInput.trim().toLowerCase());
      }}
    >
      Save
    </Button>
  </div>
  {setHandle.isError && (
    <p className="text-xs text-destructive">{setHandle.error.message}</p>
  )}
</div>
```
```

- [ ] **Step 3: Verify**

Set a handle. Refresh the page. Confirm it persists. Test hijacking: login as different org, try the same handle, verify 409 error.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Settings.tsx
git commit -m "feat: add storefront handle field to Settings page"
```

---

### Task 8: Cloudflare Configuration

**Files:**
- None (Cloudflare dashboard)

- [ ] **Step 1: DNS record**

Add `api.merchantsuite.com` → Railway hostname/IP. Proxy enabled (orange cloud).

- [ ] **Step 2: Cache rules**

Order matters — list rule before detail rule:

**Rule 1 — List endpoint:**
```
Expression: starts_with(http.request.uri.path, "/api/public/v1/") and ends_with(http.request.uri.path, "/products")
Edge TTL mode: Respect origin (use cache-control header if present, use this TTL if absent)
Edge TTL: 300s
Cache Key → Query string → Ignore
```

**Rule 2 — Detail endpoint:**
```
Expression: matches http.request.uri.path "^/api/public/v1/[^/]+/products/[^/]+$"
Edge TTL mode: Respect origin (use cache-control header if present, use this TTL if absent)
Edge TTL: 60s
Cache Key → Query string → Ignore
```

- [ ] **Step 3: Enable Tiered Cache**

Dashboard → Speed → Optimization → Tiered Cache → On.

- [ ] **Step 4: Firewall rule — only Cloudflare IPs (REQUIRED)**

```
Expression: (ip.src not in { <Cloudflare IPv4 + IPv6 ranges from https://www.cloudflare.com/ips/> })
Action: Block
```

Apply to hostname: `api.merchantsuite.com`. Without this, `CF-Connecting-IP` is spoofable.

- [ ] **Step 5: Verify stale-while-revalidate**

```bash
curl -sI https://api.merchantsuite.com/api/public/v1/demo/products | grep -i "cache-control\|cf-cache-status"
```

First request: `MISS`. Repeat: `HIT`.

- [ ] **Step 6: Add Railway env vars**

```
CLOUDFLARE_ZONE_ID=
CLOUDFLARE_API_TOKEN=
PUBLIC_DOMAIN=api.merchantsuite.com
WARM_TOKEN=<random-32-char-hex-string>
```

- [ ] **Step 7: Commit env template**

```bash
echo -e "\n# Public Product API\nCLOUDFLARE_ZONE_ID=\nCLOUDFLARE_API_TOKEN=\nPUBLIC_DOMAIN=\nWARM_TOKEN=" >> .env.example
git add .env.example
git commit -m "chore: document new public API env vars"
```

---

### Task 9: End-to-End Verification

- [ ] **Step 1: Set handle**

```bash
TOKEN="your-admin-jwt"
curl -s -X POST http://localhost:24678/api/storefront/handle \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"handle":"demo"}'
```

Expected: `{"success":true,"handle":"demo"}`

- [ ] **Step 2: Create + publish a product**

```bash
curl -s -X POST http://localhost:24678/api/products/save \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"products":[{"name":"Test","selling_price":299}]}'

# Save the returned ID
PRODUCT_ID="<uuid>"

curl -s -X PATCH http://localhost:24678/api/products/$PRODUCT_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"published":true}'
```

- [ ] **Step 3: Verify public endpoint**

```bash
curl -s http://localhost:24678/api/public/v1/demo/products
```

Expected: `{"products":[{"name":"Test","selling_price":299,"in_stock":false,...}]}`

- [ ] **Step 4: Check cache headers**

```bash
curl -sI http://localhost:24678/api/public/v1/demo/products | grep -i "cache-control"
```

Expected: `cache-control: public, s-maxage=300, stale-while-revalidate=3600`

- [ ] **Step 5: Unpublish, verify 404**

Dashboard → toggle Switch off.

```bash
curl -s http://localhost:24678/api/public/v1/demo/products
```

Expected: `{"products":[]}` (or product removed from list)

- [ ] **Step 6: Rate limiting**

```bash
for i in $(seq 1 70); do curl -s http://localhost:24678/api/public/v1/demo/products | head -c 50; echo; done
```

After ~60: `{"error":"Too many requests"}`

- [ ] **Step 7: Warm-token bypass**

```bash
# Without token, should hit limiter eventually
# With token:
curl -sI -H "X-Warm-Token: $WARM_TOKEN" http://localhost:24678/api/public/v1/demo/products
```

Expected: 200 (always passes regardless of rate-limit state)

- [ ] **Step 8: Handle hijacking blocked**

From a different org's admin token:

```bash
curl -s -X POST http://localhost:24678/api/storefront/handle \
  -H "Authorization: Bearer $OTHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"handle":"demo"}'
```

Expected: `{"error":"Storefront handle \"demo\" is already taken"}` (409)

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: complete public product API bridge v1"
```

---

### Task 10: Merchant Documentation

**Files:**
- Create: `docs/public-api.md`

- [ ] **Step 1: Write docs**

```markdown
# Public Product API

Base URL: `https://api.merchantsuite.com/api/public/v1/{storefront-handle}`

## Setup

1. Go to **Settings → Storefront** in your dashboard
2. Choose a handle: lowercase letters, numbers, hyphens (e.g., `my-store`)
3. Your API is live at `/api/public/v1/my-store/products`
4. Toggle products to **Published** — only published products appear

## Endpoints

### List published products

`GET /products`

Returns `{ "products": [{ id, name, slug, description, url, image_url, selling_price, in_stock }] }`

`in_stock` is boolean: `true` if at least one variant has stock, or product stock > 0.

### Get single product detail

`GET /products/{id}`

Returns `{ "product": { id, name, slug, description, url, image_url, selling_price, stock_quantity, variants } }`

Includes exact stock count and per-variant breakdown.

## Caching

- List endpoint: cached for **5 minutes**. Updated globally on publish/unpublish.
- Detail endpoint: cached for **60 seconds**. Stock and price refresh automatically.

## Example

```html
<div id="products"></div>
<script>
  fetch("https://api.merchantsuite.com/api/public/v1/my-store/products")
    .then(r => r.json())
    .then(data => {
      document.getElementById("products").innerHTML = data.products.map(p => `
        <div>
          <img src="${p.image_url}" alt="${p.name}" />
          <h3>${p.name}</h3>
          <p>৳${p.selling_price}</p>
          <p>${p.in_stock ? "In Stock" : "Out of Stock"}</p>
        </div>
      `).join("");
    });
</script>
```

## Limits

- 60 requests per minute per IP
- Contact support for higher limits
```

- [ ] **Step 2: Commit**

```bash
git add docs/public-api.md
git commit -m "docs: add merchant-facing public API documentation"
```

---

### Self-Review Checklist

- [ ] **Spec coverage:** All v5 requirements mapped: schema migration (Task 1), handle storage + hijacking protection (Task 2), purge helper (Task 3), purge wired into PATCH/DELETE/publish-all skipping stock-only (Task 4), public v1 endpoints with variant-aware in_stock (Task 5), warm-token bypass (Task 5, `publicRateLimit` first line calls `isWarmRequest`), dashboard toggle + bulk publish (Task 6), settings handle input (Task 7), Cloudflare config (Task 8), verification (Task 9), docs (Task 10).
- [ ] **Placeholder scan:** No "TBD", "TODO", "implement later", "add appropriate error handling" — every code block is complete.
- [ ] **Type consistency:** `purgeProductCache(orgId, productId, { listChanged, warm })` consistent across Task 3 and Task 4. `togglePublish.mutate({ id, published })` matches Switch `onCheckedChange`. `setStorefrontHandle(orgId, handle)` throws on hijacking, caught in route. `publicRateLimit` checks `isWarmRequest(req)` first.
