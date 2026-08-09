# 08 — Storefront Product Detail + Variant Picker

**What to build:** A customer viewing a product can select specific variants (e.g., color, size), see the price update in real-time, check stock availability, and add the item to their cart. After this ticket, the product detail page provides a complete pre-purchase experience using the merchant's actual variant data.

**Blocked by:** 06 — Storefront Template Refactor

**Status:** ready-for-agent

- [ ] Product detail page loads product by slug from `GET /api/public/v1/:handle/products/:slug`
- [ ] Large product image displayed with gallery thumbnails (if multiple images exist via `images` array)
- [ ] Variant picker generated from product's `variants[].attributes` (e.g., `{"Color": "Red", "Size": "M"}`) — each unique attribute key becomes a picker row
- [ ] Attribute values rendered as appropriate UI: color swatches (circles) for color-like attributes, buttons for everything else
- [ ] Price updates when a variant is selected (base price + `price_adjustment` from variant)
- [ ] Stock availability checked via inventory API (`GET /api/public/v1/:handle/products/:slug/inventory`) — shows "In stock (X left)" or "Out of stock"
- [ ] Quantity selector: min 1, max = available stock for selected variant
- [ ] "Add to Cart" button: disabled when selected variant is out of stock, adds variant ID + quantity to cart state
- [ ] Product description rendered below the variant picker
- [ ] Breadcrumb or "Back to products" link for navigation
