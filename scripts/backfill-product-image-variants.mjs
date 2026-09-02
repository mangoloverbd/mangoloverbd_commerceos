import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRODUCT_IMAGE_CACHE_SECONDS,
  buildProductImageBuffers,
  createProductImageAssetPaths,
  isVariantAssetSourcePath,
} from "../server/productImages.js";
import { buildProductCacheUrls, purgeProductCacheUrls } from "../server/productCache.js";

const PRODUCT_IMAGES_BUCKET = "product-images";
const PRODUCT_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseBackfillArguments(args) {
  const orgId = args.find((arg) => arg.startsWith("--org-id="))?.slice("--org-id=".length);
  if (!UUID_RE.test(orgId || "")) {
    throw new Error("Pass a valid --org-id=<uuid>");
  }

  return { orgId, apply: args.includes("--apply") };
}

export function getBackfillProductImageMimeType(blob) {
  const mimeType = String(blob?.type || "").toLowerCase();
  return PRODUCT_IMAGE_MIME_TYPES.has(mimeType) ? mimeType : null;
}

function getPublicUrl(supabase, path) {
  return supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function removeUploadedPaths(supabase, paths) {
  if (!paths.length) return;

  const { error } = await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove(paths);
  if (error) {
    console.warn("[backfill] asset cleanup failed:", error.message);
  }
}

async function getStorefrontHandle(supabase, orgId) {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", `${orgId}:public_storefront_handle`)
    .maybeSingle();
  if (error) throw error;
  return data?.value || null;
}

async function purgeCatalogCache(supabase, orgId, product) {
  const publicDomain = process.env.PUBLIC_DOMAIN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!publicDomain || !zoneId || !apiToken) {
    console.warn("[backfill] Cloudflare is not configured; catalog TTL is the fallback");
    return;
  }

  try {
    const handle = await getStorefrontHandle(supabase, orgId);
    const urls = buildProductCacheUrls({
      publicDomain,
      orgId,
      handle,
      productSlug: product.slug,
      listChanged: true,
    });
    await purgeProductCacheUrls({
      zoneId,
      apiToken,
      urls,
      warmToken: process.env.WARM_TOKEN || "",
    });
  } catch (error) {
    console.warn("[backfill] catalog cache purge failed:", error.message);
  }
}

async function migrateImage(supabase, orgId, image) {
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, slug")
    .eq("id", image.product_id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (productError) throw productError;
  if (!product) throw new Error("Product not found in workspace");

  const { data: sourceBlob, error: downloadError } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .download(image.storage_path);
  if (downloadError) throw downloadError;

  const mimeType = getBackfillProductImageMimeType(sourceBlob);
  if (!mimeType) {
    throw new Error(`Unsupported source MIME type: ${sourceBlob?.type || "unknown"}`);
  }

  const imageBuffers = await buildProductImageBuffers(
    Buffer.from(await sourceBlob.arrayBuffer()),
    { mimeType },
  );
  const asset = createProductImageAssetPaths({
    orgId,
    productId: image.product_id,
    assetId: randomUUID(),
  });
  const uploadedPaths = [];

  try {
    const uploads = [
      { path: asset.sourcePath, buffer: imageBuffers.source.buffer, contentType: imageBuffers.source.mimeType },
      ...Object.entries(asset.variantPaths).map(([width, path]) => ({
        path,
        buffer: imageBuffers.variants[width].buffer,
        contentType: "image/webp",
      })),
    ];
    for (const upload of uploads) {
      const { error } = await supabase.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .upload(upload.path, upload.buffer, {
          contentType: upload.contentType,
          cacheControl: String(PRODUCT_IMAGE_CACHE_SECONDS),
          upsert: false,
        });
      if (error) throw error;
      uploadedPaths.push(upload.path);
    }

    const imageUrl = getPublicUrl(supabase, asset.variantPaths["960"]);
    const { error: imageUpdateError } = await supabase
      .from("product_images")
      .update({ storage_path: asset.sourcePath, image_url: imageUrl })
      .eq("id", image.id)
      .eq("org_id", orgId);
    if (imageUpdateError) throw imageUpdateError;

    if (image.is_primary) {
      const { error: productUpdateError } = await supabase
        .from("products")
        .update({ image_url: imageUrl })
        .eq("id", product.id)
        .eq("org_id", orgId);
      if (productUpdateError) {
        const { error: rollbackError } = await supabase
          .from("product_images")
          .update({ storage_path: image.storage_path, image_url: image.image_url })
          .eq("id", image.id)
          .eq("org_id", orgId);
        if (rollbackError) {
          console.warn("[backfill] primary image rollback failed:", rollbackError.message);
        }
        throw productUpdateError;
      }
    }

    await purgeCatalogCache(supabase, orgId, product);
    console.log(`[backfill] migrated ${image.id}: ${image.storage_path} -> ${asset.sourcePath}`);
  } catch (error) {
    await removeUploadedPaths(supabase, uploadedPaths);
    throw error;
  }
}

async function main() {
  const { orgId, apply } = parseBackfillArguments(process.argv.slice(2));
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("product_images")
    .select("id, product_id, image_url, storage_path, is_primary")
    .eq("org_id", orgId);
  if (error) throw error;

  const legacyImages = (data || []).filter((image) => !isVariantAssetSourcePath(image.storage_path));
  if (!apply) {
    console.log(`[backfill] dry run: ${legacyImages.length} legacy image row(s) for ${orgId}`);
    for (const image of legacyImages) {
      console.log(`[backfill] would migrate ${image.id}`);
    }
    return;
  }

  console.log(`[backfill] applying ${legacyImages.length} legacy image row(s) for ${orgId}`);
  for (const image of legacyImages) {
    try {
      await migrateImage(supabase, orgId, image);
    } catch (error) {
      console.error(`[backfill] failed ${image.id}:`, error.message);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("[backfill] failed:", error.message);
    process.exitCode = 1;
  });
}
