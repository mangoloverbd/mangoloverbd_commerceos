# 05 — Image Pipeline (sharp + WebP Conversion)

**What to build:** Product images uploaded by merchants are automatically optimized for fast storefront loading. After this ticket, all JPEG/PNG uploads are converted to WebP format and three thumbnail sizes are generated. The API returns WebP URLs to the storefront.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `sharp` installed as a dependency in `package.json`
- [ ] Image upload endpoint (existing product image upload flow) detects JPEG/PNG uploads and converts to WebP (quality: 80) using `sharp`
- [ ] WebP uploads are stored as-is (no double conversion)
- [ ] Three thumbnail sizes generated per upload: small (100px width), medium (400px width), large (800px width) — all WebP
- [ ] All variants stored in Supabase Storage `product-images` bucket in organized paths
- [ ] API responses (both authenticated product list and public catalog) return WebP URLs as the primary image URL, with original URL as fallback
- [ ] Variant images (if set) also go through the pipeline
- [ ] Deployment compatibility verified — `sharp` is a native module, ensure it works in the production environment
- [ ] Existing image upload behavior preserved for WebP uploads (no conversion needed)
