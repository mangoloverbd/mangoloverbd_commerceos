# Public Product API — Cache Tier + Purge + Inventory Endpoint

> **Superseded for new work (2026-08-27):** This Cloudflare-oriented plan is historical. Use `docs/superpowers/specs/2026-08-27-realtime-storefront-sync-design.md` and create a new Vercel/revision/Realtime implementation plan.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Context:** The earlier plan `2026-07-15-public-product-api-bridge.md` landed Phase 0 (contract lockdown, `/v1` prefix, `toPublicProduct()` + Zod strict, handle routing with atomic claim). What is still missing: the edge is not actually caching anything, mutations do not purge, there is no `/inventory` endpoint, and public routes have no rate limit or warm bypass. This plan closes those gaps in one PR.

**Goal:** Make `GET /api/public/v1/:handle/products` and `.../:slug` cacheable at the Cloudflare edge with correct `Cache-Control` + `Cache-Tag`, split stock onto a short-TTL `/inventory` endpoint, and wire an inline fire-and-forget purge-and-warm on every product mutation. Add `publicRateLimit` with a `WARM_TOKEN` bypass so purge warms cannot be locked out by their own limiter.

**Architecture:**
- Catalog endpoints: `s-maxage=60, stale-while-revalidate=86400`, tagged `org:{orgId} product:{id} storefront:{handle}`.
- Inventory endpoint: `s-maxage=5, stale-while-revalidate=30`, tagged the same way; served from the existing `loadPublicInventory` loader.
- Purge: URL-based via Cloudflare `purge_cache` for now (tag-based purge is Enterprise-only). `Cache-Tag` headers ship so switching later is a config change, not a code change.
- Purge triggers: PATCH (skip if only `stock_quantity` changed), DELETE, new `POST /api/products/publish-all`. `POST /api/products/save` does not purge — products are created unpublished.
- Warm requests carry `X-Warm-Token`, compared with `crypto.timingSafeEqual`, and skip `publicRateLimit`.
- `app.set("trust proxy", 2)` so `req.ip` reflects the real client behind Cloudflare → Railway.

**Tech Stack:** Express.js, Supabase PostgreSQL, Cloudflare (proxy + cache), Upstash Redis (rate limiting), `crypto.timingSafeEqual`.

**Not in scope (follow-up plans):**
- Dashboard publish toggle + "Publish All" button (`src/pages/Products.tsx`).
- Storefront handle input (`src/pages/Settings.tsx`).
- Cloudflare zone config, Tiered Cache, `/cdn-cgi/image/` transforms.
- `docs/public-api.md`, `.env.example` updates.
- Image pipeline (BlurHash, dominant_color, width/height, LCP preload).
- SDK + starter (`@merchant-suite/storefront`, `create-merchant-storefront`).
- `/.well-known/merchant-suite.json`.
- Outbox pattern + push webhooks.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `server/index.js` | Modify | Env constants, `trust proxy`, defensive `/api` `Cache-Control` + `/public/` exemption, `purgeProductCache` helper, purge wired into PATCH/DELETE, `POST /api/products/publish-all`, `publicRateLimit` + `isWarmRequest`, `Cache-Control` + `Cache-Tag` on v1 handlers, `/inventory` route |
| `src/test/publicCatalog.test.ts` | Modify | Extend with an `available` snapshot for the inventory serializer if not already covered |

---

## Task 1: Env config, trust proxy, defensive `/api` cache guard

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add Cloudflare + warm env constants**

Near the top after rate limit setup:

```js
const CLOUDFLARE_ZONE_ID = process.env.CLOUDFLARE_ZONE_ID || "";
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || "";
const PUBLIC_DOMAIN = process.env.PUBLIC_DOMAIN || "";
const WARM_TOKEN = process.env.WARM_TOKEN || "";
```

- [ ] **Step 2: Trust the proxy chain**

Right after `const app = express();`:

```js
app.set("trust proxy", 2); // Cloudflare -> Railway proxy -> Express
```

- [ ] **Step 3: Defensive `Cache-Control` on `/api/*` + exempt `/public/`**

Find the global `app.use("/api", ...)` middleware and replace it with:

```js
app.use("/api", (req, res, next) => {
  const path = req.path;
  // Public v1 routes set their own caching + rate limiting.
  if (path.startsWith("/public/")) return next();
  // Everything else under /api is per-user data — never cache.
  res.set("Cache-Control", "private, no-store");
  if (
    path.startsWith("/webhooks/") ||
    path === "/tracker.js" ||
    path === "/live-visitor/ping" ||
    path === "/config"
  ) return next();
  return rateLimitAPI(req, res, next);
});
```

Two effects: (1) any Cloudflare rule misconfiguration cannot leak authenticated JSON into a shared cache, (2) public routes bypass the 120/min global limiter so warm-token bypass in `publicRateLimit` cannot be defeated.

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat: trust proxy + defensive Cache-Control on /api, exempt /public"
```

---

## Task 2: `purgeProductCache` helper

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add the helper**

Add after `getStorefrontHandle` (near the storefront handle helpers):

```js
async function purgeProductCache(orgId, productId, { listChanged = false, warm = true } = {}) {
  if (!CLOUDFLARE_ZONE_ID || !CLOUDFLARE_API_TOKEN || !PUBLIC_DOMAIN) {
    console.warn("[Purge] Cloudflare not configured — skipping purge");
    return;
  }
  const handle = await getStorefrontHandle(orgId);
  if (!handle) return;

  const urls = [];
  if (productId) {
    urls.push(`https://${PUBLIC_DOMAIN}/api/public/v1/${handle}/products/${productId}`);
    urls.push(`https://${PUBLIC_DOMAIN}/api/public/v1/${handle}/products/${productId}/inventory`);
  }
  if (listChanged) {
    urls.push(`https://${PUBLIC_DOMAIN}/api/public/v1/${handle}/products`);
  }

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
      },
    );
    if (!response.ok) {
      const body = await response.text();
      console.warn(`[Purge] Cloudflare purge failed: ${body}`);
    } else {
      console.log(`[Purge] Purged ${urls.length} URL(s) for org ${orgId} product ${productId || "*"}`);
    }
  } catch (e) {
    console.warn("[Purge] Cloudflare purge error:", e.message);
  }

  if (warm && WARM_TOKEN) {
    const warmHeaders = { headers: { "X-Warm-Token": WARM_TOKEN } };
    for (const url of urls) {
      fetch(url, warmHeaders).catch(() => {});
    }
  }
}
```

Purge is fire-and-forget by design. Failures log and drop — the outbox replay job is a separate plan.

- [ ] **Step 2: Commit**

```bash
git add server/index.js
git commit -m "feat: add purgeProductCache helper (URL-based, warm-on-write)"
```

---

## Task 3: Wire purge into product mutations

**Rules:**
- `POST /api/products/save`: no purge (products created unpublished).
- `PATCH /api/products/:id`: skip purge when the only changed field is `stock_quantity` (the 5s inventory TTL self-heals). Purge when published state flips or the product is already published.
- `DELETE /api/products/:id`: purge with `warm: false`.
- Variant CRUD: no purge (short TTL self-heals; avoids purge fan-out during bulk edits).
- New `POST /api/products/publish-all`: single list purge with warm.

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Extend PATCH `allowed` fields**

Find the `allowed` array in `PATCH /api/products/:id` and confirm it includes:

```js
const allowed = ["name", "url", "image_url", "selling_price", "cog", "published", "slug", "description"];
```

- [ ] **Step 2: Purge on PATCH, skipping stock-only**

Immediately after the `hasStockUpdate` block and stock write, before the embedding regeneration:

```js
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
```

Unpublishing does not warm — warming an unpublished detail URL would immediately hit the 404 branch and pollute the cache with a negative entry.

- [ ] **Step 3: Purge on DELETE**

Right after the successful `.delete().eq(...).eq("org_id", orgId)`:

```js
purgeProductCache(orgId, req.params.id, { listChanged: true, warm: false }).catch(() => {});
```

- [ ] **Step 4: Add `POST /api/products/publish-all`**

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

    // Single list purge; detail warms happen on first real visitor (60s TTL).
    purgeProductCache(orgId, null, { listChanged: true, warm: true }).catch(() => {});

    return res.json({ success: true, published: (data || []).length });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
```

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server/index.js
git commit -m "feat: wire purge into PATCH/DELETE and add publish-all"
```

---

## Task 4: Public v1 caching + rate limit + warm bypass

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add the public rate limiter**

Alongside the existing rate limiter setup:

```js
const rlPublic = redisClient
  ? new Ratelimit({
      redis: redisClient,
      limiter: Ratelimit.slidingWindow(60, "60 s"),
      prefix: "rl:public",
    })
  : null;
```

- [ ] **Step 2: Add `isWarmRequest` + `publicRateLimit`**

Add above the public route registrations:

```js
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

function publicRateLimit(req, res, next) {
  if (isWarmRequest(req)) return next();
  if (!rlPublic) return next();
  const ip = req.headers["cf-connecting-ip"] || req.ip || req.socket.remoteAddress;
  rlPublic.limit(ip).then(({ success }) => {
    if (!success) return res.status(429).json({ error: "Too many requests" });
    next();
  }).catch(() => next());
}
```

Warm-token check runs first so purge warms cannot be locked out.

- [ ] **Step 3: Add a `setPublicCacheHeaders` helper**

Add near the public handlers:

```js
async function setPublicCacheHeaders(res, {
  orgId,
  productId = null,
  handle,
  tier, // "catalog" | "inventory"
}) {
  const tags = [`org:${orgId}`, `storefront:${handle}`];
  if (productId) tags.push(`product:${productId}`);
  res.set("Cache-Tag", tags.join(" "));
  if (tier === "catalog") {
    res.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=86400");
  } else {
    res.set("Cache-Control", "public, s-maxage=5, stale-while-revalidate=30");
  }
  res.set("Vary", "Accept-Encoding");
}
```

`Cache-Tag` ships even though URL-based purge is what actually runs today — this makes the future switch to tag-based purge a config change, not a code change.

- [ ] **Step 4: Wire caching + rate limit into the v1 handlers**

Update the handler registrations to use `publicRateLimit` and to set headers before responding:

```js
app.get("/api/public/v1/:handle/products", publicRateLimit, handlePublicHandleProducts);
app.get("/api/public/v1/:handle/products/:slug", publicRateLimit, handlePublicHandleProductDetail);
app.get("/api/public/v1/storefronts/:storefrontId/products", publicRateLimit, handlePublicStorefrontProducts);
app.get("/api/public/v1/storefronts/:storefrontId/products/:slug", publicRateLimit, handlePublicStorefrontProductDetail);
```

Inside `handlePublicHandleProducts`, after resolving `orgId` and before returning:

```js
await setPublicCacheHeaders(res, { orgId, handle: req.params.handle, tier: "catalog" });
```

Inside `handlePublicHandleProductDetail`, after loading the product:

```js
await setPublicCacheHeaders(res, {
  orgId,
  productId: product.id,
  handle: req.params.handle,
  tier: "catalog",
});
```

On the 404 branches, set `Cache-Control: no-store` so a lookup mistake does not stick at the edge.

For the deprecated unversioned handlers, leave the existing `Deprecation` / `Sunset` / `Link` headers untouched but do not add public cache headers — they will phase out.

- [ ] **Step 5: Lint + smoke**

Run: `npm run lint`
Then hit `/api/public/v1/:handle/products` locally and confirm `Cache-Control` and `Cache-Tag` headers appear on the response.

- [ ] **Step 6: Commit**

```bash
git add server/index.js
git commit -m "feat: rate limit + warm bypass + Cache-Control + Cache-Tag on v1"
```

---

## Task 5: `/inventory` endpoint

**Files:**
- Modify: `server/index.js`

- [ ] **Step 1: Add the two inventory handlers**

The loaders (`loadPublicInventory`) already exist. Add thin route handlers:

```js
async function handlePublicHandleInventory(req, res) {
  try {
    const orgId = await resolveStorefrontHandle(req.params.handle);
    if (!orgId) {
      res.set("Cache-Control", "no-store");
      return res.status(404).json({ error: "not_found" });
    }
    const ids = String(req.query.ids || "").split(",").filter(Boolean);
    if (!ids.length) return res.status(400).json({ error: "ids_required" });

    const inventory = await loadPublicInventory(orgId, ids);
    await setPublicCacheHeaders(res, { orgId, handle: req.params.handle, tier: "inventory" });
    return res.json({ inventory, as_of: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

async function handlePublicHandleProductInventory(req, res) {
  try {
    const orgId = await resolveStorefrontHandle(req.params.handle);
    if (!orgId) {
      res.set("Cache-Control", "no-store");
      return res.status(404).json({ error: "not_found" });
    }
    const supabase = getServiceSupabase();
    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("org_id", orgId)
      .eq("published", true)
      .eq("slug", req.params.slug)
      .maybeSingle();
    if (!product) {
      res.set("Cache-Control", "no-store");
      return res.status(404).json({ error: "not_found" });
    }
    const inventory = await loadPublicInventory(orgId, [product.id]);
    await setPublicCacheHeaders(res, {
      orgId,
      productId: product.id,
      handle: req.params.handle,
      tier: "inventory",
    });
    return res.json({
      inventory: inventory[product.id] || null,
      as_of: new Date().toISOString(),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
```

- [ ] **Step 2: Register the routes**

```js
app.get("/api/public/v1/:handle/inventory", publicRateLimit, handlePublicHandleInventory);
app.get("/api/public/v1/:handle/products/:slug/inventory", publicRateLimit, handlePublicHandleProductInventory);
```

Bulk `/inventory?ids=a,b,c` covers the PLP add-to-cart case; per-slug covers the PDP.

- [ ] **Step 3: Validate `PublicInventoryResponseSchema` on output**

Wrap the bulk response body through `PublicInventoryResponseSchema.parse` before returning so a leaked field is a staging 500. Per-slug wraps `{ inventory: PublicInventoryEntrySchema | null }` (add a small local Zod object rather than a new export unless the shape is reused).

- [ ] **Step 4: Extend `src/test/publicCatalog.test.ts`**

Add a test that:
1. `toPublicInventoryEntry` with variants sums `stock_quantity` and sets `available` correctly (some variants zero, some non-zero).
2. `toPublicInventoryEntry` with no variants falls back to `stockQuantity`.
3. Snapshot the bulk response shape through `PublicInventoryResponseSchema.parse` — a leaked field fails the test.

Run: `npm test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add server/index.js src/test/publicCatalog.test.ts
git commit -m "feat: add /api/public/v1/:handle/inventory bulk + per-slug endpoints"
```

---

## Task 6: Verification

- [ ] **Step 1: Manual smoke**

With `PUBLIC_DOMAIN`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN`, `WARM_TOKEN` set to test values, start the server and:

1. `curl -i http://localhost:24678/api/public/v1/{handle}/products` — confirm `Cache-Control: public, s-maxage=60, stale-while-revalidate=86400` and `Cache-Tag: org:... storefront:{handle}`.
2. `curl -i .../products/{slug}` — confirm `product:{id}` also appears in `Cache-Tag`.
3. `curl -i .../products/{slug}/inventory` — confirm `s-maxage=5, stale-while-revalidate=30`.
4. `curl -i .../inventory?ids=<id1>,<id2>` — same headers, `inventory` object keyed by id.
5. PATCH a product (non-stock field) — server log prints `[Purge] Purged N URL(s)` (or `[Purge] Cloudflare not configured` in dev without keys).
6. PATCH with only `stock_quantity` — no purge log line, inventory endpoint reflects the change on next hit.
7. `curl -i -H "X-Warm-Token: $WARM_TOKEN" .../products` — succeeds even after exceeding the rate limit from the same IP.

- [ ] **Step 2: `npm run lint && npm test && npm run build`**

Expected: all green.

- [ ] **Step 3: Commit any test fixes**

```bash
git commit -am "chore: fix tests uncovered by cache tier work"
```

---

## Follow-up plans (write separately)

- **Dashboard toggle + Publish All button** — `src/pages/Products.tsx` (shadcn Switch, POST `/api/products/publish-all`).
- **Settings handle input** — `src/pages/Settings.tsx`, wired to `/api/storefront/handle`.
- **Cloudflare zone config** — Tiered Cache on, cache rules for `/api/public/v1/*`, `/cdn-cgi/image/` transforms.
- **`.env.example` + `docs/public-api.md`** — merchant-facing documentation.
- **Image pipeline** — BlurHash, dominant color, width/height persisted on upload; `Link: rel=preload; as=image` on PDP responses; Bengali font subset.
- **SDK + starter + web component** — `@merchant-suite/storefront`, `create-merchant-storefront`, `<merchant-suite-product>`.
- **`/.well-known/merchant-suite.json`** — per-handle endpoint + schema-version discovery.
- **Outbox pattern + push webhooks** — `outbox_events` table, replay worker, signed `product.published/updated/unpublished` webhooks.

---

## Spec coverage

Requirements from the chairman synthesis addressed here:
- Cache-Tag on every response ✓ (Task 4).
- Split payload into two cache tiers (60s catalog, 5s inventory) ✓ (Tasks 4 + 5).
- Purge on write, warm on write ✓ (Tasks 2 + 3).
- Warm-token bypass with `crypto.timingSafeEqual` ✓ (Task 4).
- Anon-cacheable GET as default ✓ (Task 4 — no auth required, rate limit only).

Requirements from the chairman synthesis deferred (see follow-ups): image pipeline, LCP preload, SDK/starter/web component, `.well-known`, published contract artifact on npm, push webhooks, outbox pattern.
