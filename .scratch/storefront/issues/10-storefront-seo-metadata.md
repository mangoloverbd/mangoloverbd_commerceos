# 10 — Storefront SEO Metadata

**What to build:** When a storefront link is shared on Facebook, WhatsApp, or any social platform, it renders a rich preview with the product image, name, price, and store name. After this ticket, every storefront page has correct Open Graph tags and structured data for search engines.

**Blocked by:** 06 — Storefront Template Refactor

**Status:** ready-for-agent

- [ ] Product pages: auto-generated `<title>` using merchant's `seo_title_template` from config (default: `{product_name} | {store_name}`)
- [ ] Product pages: auto-generated `<meta name="description">` using `seo_description_template` (default: product description, truncated to 160 chars)
- [ ] Product pages: Open Graph tags — `og:title`, `og:description`, `og:image` (product primary image URL), `og:type` = "product", `og:url`
- [ ] Product pages: `product:price:amount` and `product:price:currency` OG tags (currency = BDT)
- [ ] Store/listing pages: generic OG tags with store name, tagline, and logo as image
- [ ] JSON-LD `Product` structured data schema on product pages (name, image, price, availability, currency)
- [ ] All meta tags rendered server-side or via Vite SSR/pre-render (not just client-side React — social crawlers need static HTML)
- [ ] Links shared on Facebook and WhatsApp render with correct rich previews (testable via Facebook Sharing Debugger and WhatsApp)
- [ ] Favicon from merchant's config (`favicon_url` from storefront settings) applied to the page
