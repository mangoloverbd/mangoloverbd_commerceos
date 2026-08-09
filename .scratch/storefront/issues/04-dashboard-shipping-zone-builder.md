# 04 — Dashboard Shipping Zone Builder

**What to build:** A merchant can configure delivery rates from the dashboard. After this ticket, the Online Store settings page has a shipping zone builder where the merchant creates named zones (e.g., "Inside Dhaka", "Outside Dhaka") with prices and optional free-shipping thresholds. These zones are used by the checkout flow to calculate delivery costs.

**Blocked by:** 01 — Storefront Branding Schema + Config API, 03 — Dashboard "Online Store" Settings Page

**Status:** ✅ Resolved

- [x] Shipping zone builder UI within the Online Store settings page (section below branding settings)
- [x] "Add zone" button creates a new zone with default values
- [x] Each zone row: name input, price input (৳), optional free-above threshold input (৳), delete button
- [x] Default zones pre-populated for new merchants: "Inside Dhaka" (৳60, free above ৳1000), "Outside Dhaka" (৳120, free above ৳2000)
- [x] Zones serialize to JSONB format: `[{ id, name, price, min_order_amount, free_above, conditions }]`
- [x] Zones saved as part of `storefront_settings.shipping_zones` via existing settings save mutation
- [x] Shipping zones appear in the public config API response (`GET /api/public/v1/:handle/config`)
- [x] Checkout can calculate shipping cost given a subtotal and zone ID (utility function, tested independently)
