// @ts-check
/**
 * One-off, idempotent seed for the storefront catalog in the current Merchant Suite DB.
 *
 * Run with the repo's .env loaded:
 *   SEED_ORDER_API_KEY=<generated-secret> node --env-file=.env scripts/seed-storefront.mjs
 *
 * What it does:
 *   1. Ensures the `product_variants` table exists (matches MULTI_TENANCY_SQL) + reloads the
 *      PostgREST schema cache so the public storefront API can read it.
 *   2. Ensures the `product-images` storage bucket exists.
 *   3. Upserts 9 published products for a single org (single-storefront, single-tenant),
 *      uploading product images to the bucket (fashion images are local assets; the Stepprs
 *      insoles images are pulled from the legacy bucket and re-hosted here).
 *   4. Seeds size variants where the storefront advertises them.
 *   5. Registers the custom-store order API key in app_settings so storefront checkouts
 *      land in this org's `orders` table via POST /api/custom-orders/webhook.
 *
 * Safe to re-run: products are upserted by (org_id, slug); their images + variants are
 * replaced each run.
 */
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, "seed-assets");

const ORG_ID = process.env.SEED_ORG_ID || "2a155750-b11a-4ff2-a7ff-4e26daac46ef";
const ORDER_API_KEY = process.env.SEED_ORDER_API_KEY;
if (!ORDER_API_KEY) {
  throw new Error("SEED_ORDER_API_KEY is required; generate a unique secret and provide it through the environment");
}
const BUCKET = "product-images";

const INSOLES_IMG_BASE =
  "https://stieyrpctvgpsszntwfh.supabase.co/storage/v1/object/public/product-images/da1aecbc-a969-4b93-a5d3-40e7c80c8987/a2af0705-80e2-4018-8fab-06fd45460c20";

// fashion products use local assets; insoles uses 4 remote webp gallery shots.
const PRODUCTS = [
  {
    slug: "stepprs-massage-insoles",
    name: "Stepprs Massage Insoles",
    price: 499,
    compare_at: 699,
    description:
      "Transform every step with Stepprs Massage Insoles. Features targeted massage nodes, biomechanical arch support, and breathable vents for instant foot pain relief. Trimmable to fit any shoe perfectly.",
    images: [
      { src: `${INSOLES_IMG_BASE}/3bd3f64b-c456-45c9-9cb3-880a441aaf38.webp`, type: "image/webp" },
      { src: `${INSOLES_IMG_BASE}/f663f279-40fd-448f-8ac8-ba85bb589557.webp`, type: "image/webp" },
      { src: `${INSOLES_IMG_BASE}/17921c7a-f5a5-4c5d-b184-642a3e913f86.webp`, type: "image/webp" },
      { src: `${INSOLES_IMG_BASE}/ced2467b-f536-4cdd-a35e-6df109857870.webp`, type: "image/webp" },
    ],
    variants: [],
  },
  {
    slug: "linen-baggy-trouser-clean-white",
    name: "Linen Baggy Trouser - Clean White",
    price: 799,
    compare_at: null,
    description: "Relaxed-fit linen baggy trousers in clean white. Breathable, drapes beautifully, made for everyday wear.",
    images: [{ src: join(ASSETS, "new1.webp"), type: "image/webp" }],
    variants: [],
  },
  {
    slug: "linen-baggy-trouser-earthy-olive",
    name: "Linen Baggy Trouser - Earthy Olive",
    price: 799,
    compare_at: null,
    description: "Relaxed-fit linen baggy trousers in earthy olive. Easy, grounded, and endlessly wearable.",
    images: [{ src: join(ASSETS, "new2.webp"), type: "image/webp" }],
    variants: [],
  },
  {
    slug: "linen-baggy-trouser-black",
    name: "Linen Baggy Trouser - Black",
    price: 799,
    compare_at: null,
    description: "Relaxed-fit linen baggy trousers in black. Lightweight linen with a clean, lived-in drape.",
    images: [{ src: join(ASSETS, "new3.webp"), type: "image/webp" }],
    variants: [],
  },
  {
    slug: "linen-baggy-trouser-cocoa-brown",
    name: "Linen Baggy Trouser - Cocoa Brown",
    price: 799,
    compare_at: null,
    description: "Relaxed-fit linen baggy trousers in cocoa brown. Warm neutral, soft hand, all-day comfort.",
    images: [{ src: join(ASSETS, "new4.webp"), type: "image/webp" }],
    variants: [],
  },
  {
    slug: "black-blazer-dress",
    name: "Black Blazer Dress",
    price: 1690,
    compare_at: null,
    description: "Tailored black blazer dress. Sharp shoulder line, nipped waist, made to move.",
    images: [{ src: join(ASSETS, "new1.webp"), type: "image/webp" }],
    variants: ["S", "M", "L", "XL", "XXL"],
  },
  {
    slug: "black-high-leggings",
    name: "Black High Leggings",
    price: 990,
    compare_at: null,
    description: "High-waisted black leggings. Second-skin stretch with a matte, opaque finish.",
    images: [{ src: join(ASSETS, "new2.webp"), type: "image/webp" }],
    variants: ["S", "M", "L", "XL"],
  },
  {
    slug: "clean-white-trouser",
    name: "Clean White Trouser",
    price: 799,
    compare_at: null,
    description: "Crisp clean white trousers. Straight leg, pressed crease, goes with everything.",
    images: [{ src: join(ASSETS, "new3.webp"), type: "image/webp" }],
    variants: ["S", "M", "L", "XL", "XXL"],
  },
  {
    slug: "cocoa-brown-trouser",
    name: "Cocoa Brown Trouser",
    price: 799,
    compare_at: null,
    description: "Cocoa brown trousers. Warm, tailored, and easy to dress up or down.",
    images: [{ src: join(ASSETS, "new4.webp"), type: "image/webp" }],
    variants: ["S", "M", "L"],
  },
];

async function loadBytes(image) {
  if (/^https?:\/\//.test(image.src)) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(image.src);
        if (res.ok) return Buffer.from(await res.arrayBuffer());
        if (attempt < 2) await new Promise((r) => setTimeout(r, 400));
      } catch {
        if (attempt < 2) await new Promise((r) => setTimeout(r, 400));
      }
    }
    console.warn(`[seed] WARNING: skipping unreachable remote image: ${image.src}`);
    return null;
  }
  return readFile(image.src);
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dbUrl || !supabaseUrl || !serviceKey) {
    throw new Error("Missing SUPABASE_DB_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env.");
  }

  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // 1. Ensure product_variants table exists (mirrors MULTI_TENANCY_SQL) + reload schema cache.
  await pool.query(`
    DO $$ BEGIN
      CREATE TABLE IF NOT EXISTS public.product_variants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id UUID NOT NULL,
        product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
        attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
        cog NUMERIC NOT NULL DEFAULT 0,
        stock_quantity INTEGER NOT NULL DEFAULT 0,
        price_adjustment NUMERIC NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
      CREATE INDEX IF NOT EXISTS product_variants_org_product_idx ON public.product_variants(org_id, product_id);
      CREATE POLICY "service_role_all_product_variants" ON public.product_variants TO service_role USING (true) WITH CHECK (true);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await pool.query(`NOTIFY pgrst, 'reload schema'`);
  console.log("[seed] product_variants ensured + PostgREST schema reloaded.");

  // 2. Ensure the product-images bucket exists (public).
  const { error: bucketErr } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    fileSizeLimit: 10 * 1024 * 1024,
  });
  if (bucketErr && !/already exists/i.test(bucketErr.message || "")) {
    throw new Error(`Bucket create failed: ${bucketErr.message}`);
  }
  console.log("[seed] product-images bucket ensured.");

  // 3. Upsert products + images + variants.
  let totalImages = 0;
  let totalVariants = 0;
  for (const p of PRODUCTS) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query(
        `SELECT id FROM products WHERE org_id = $1 AND slug = $2`,
        [ORG_ID, p.slug],
      );
      let productId;
      if (rows.length) {
        const upd = await client.query(
          `UPDATE products
             SET name = $2, description = $3, selling_price = $4, compare_at_price = $5,
                 stock_quantity = $6, published = true, published_at = now()
           WHERE id = $1 RETURNING id`,
          [rows[0].id, p.name, p.description, p.price, p.compare_at, 50],
        );
        productId = upd.rows[0].id;
      } else {
        const ins = await client.query(
          `INSERT INTO products (org_id, name, slug, description, selling_price, compare_at_price, image_url, cog, stock_quantity, published, published_at)
           VALUES ($1,$2,$3,$4,$5,$6,NULL,0,50,true,now()) RETURNING id`,
          [ORG_ID, p.name, p.slug, p.description, p.price, p.compare_at],
        );
        productId = ins.rows[0].id;
      }

      // replace existing images + variants for this product
      await client.query(`DELETE FROM product_images WHERE product_id = $1`, [productId]);
      await client.query(`DELETE FROM product_variants WHERE product_id = $1`, [productId]);

      let primaryUrl = null;
      let imageIndex = 0;
      for (let i = 0; i < p.images.length; i++) {
        const image = p.images[i];
        const bytes = await loadBytes(image);
        if (!bytes) continue;
        const ext = image.type === "image/png" ? "png" : image.type === "image/jpeg" ? "jpg" : "webp";
        const storagePath = `${ORG_ID}/${productId}/${randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, bytes, { contentType: image.type, upsert: true });
        if (upErr) throw new Error(`Upload failed for ${p.slug} image ${i}: ${upErr.message}`);
        const url = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${storagePath}`;
        if (imageIndex === 0) primaryUrl = url;
        await client.query(
          `INSERT INTO product_images (org_id, product_id, image_url, storage_path, alt_text, sort_order, is_primary)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [ORG_ID, productId, url, storagePath, p.name, imageIndex, imageIndex === 0],
        );
        imageIndex++;
        totalImages++;
      }
      if (primaryUrl) {
        await client.query(`UPDATE products SET image_url = $1 WHERE id = $2`, [primaryUrl, productId]);
      }

      for (const size of p.variants) {
        await client.query(
          `INSERT INTO product_variants (org_id, product_id, attributes, cog, stock_quantity, price_adjustment)
           VALUES ($1,$2,$3,0,50,0)`,
          [ORG_ID, productId, JSON.stringify({ size })],
        );
        totalVariants++;
      }

      await client.query("COMMIT");
      console.log(`[seed] ${p.slug}: ${p.images.length} image(s), ${p.variants.length} variant(s)`);
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  // 4. Register the custom-store order API key for this org.
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [`${ORG_ID}:custom_store_api_key`, ORDER_API_KEY],
  );
  console.log(`[seed] order API key registered for ${ORG_ID}.`);

  // 5. Summary.
  const { rows: summary } = await pool.query(
    `SELECT (SELECT count(*) FROM products WHERE org_id=$1 AND published=true) AS products,
            (SELECT count(*) FROM product_images WHERE org_id=$1) AS images,
            (SELECT count(*) FROM product_variants WHERE org_id=$1) AS variants,
            (SELECT count(*) FROM app_settings WHERE key=$2) AS api_key`,
    [ORG_ID, `${ORG_ID}:custom_store_api_key`],
  );
  console.log("[seed] DONE:", summary[0]);

  await pool.end();
}

main().catch((e) => {
  console.error("[seed] FAILED:", e);
  process.exit(1);
});
