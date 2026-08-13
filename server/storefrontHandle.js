// Storefront handles form the public URL for a merchant's catalog:
//   /api/public/v1/:handle/products
//
// Rules (validated end-to-end in setStorefrontHandle):
//   - 2 to 50 chars
//   - lowercase [a-z0-9-], no leading/trailing hyphen
//   - reserved words that would collide with siblings under /api/public/v1/
//     are rejected

export const HANDLE_REGEX = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/;

export const RESERVED_HANDLES = new Set([
  "v1",
  "v2",
  "v3",
  "webhooks",
  "oauth",
  "callback",
  "graphql",
  "admin",
  "internal",
  "api",
  "public",
  "storefronts",
  ".well-known",
]);

export function normalizeStorefrontHandle(handle) {
  return typeof handle === "string" ? handle.trim().toLowerCase() : "";
}

export function validateStorefrontHandle(handle) {
  const clean = normalizeStorefrontHandle(handle);
  if (!clean) return { ok: false, reason: "empty" };
  if (!HANDLE_REGEX.test(clean)) return { ok: false, reason: "format" };
  if (RESERVED_HANDLES.has(clean)) return { ok: false, reason: "reserved" };
  return { ok: true, handle: clean };
}
