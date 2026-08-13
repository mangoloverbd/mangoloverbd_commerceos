# 09 — Storefront Cart + Checkout Flow

**What to build:** A customer can review their cart, fill in delivery details, select a shipping zone, and place an order — all without creating an account. After this ticket, the storefront has a complete COD checkout flow that creates orders in the merchant's Merchant-Suite dashboard.

**Blocked by:** 06 — Storefront Template Refactor, 02 — Storefront Order Submission API, 04 — Dashboard Shipping Zone Builder

**Status:** ready-for-agent

- [ ] Cart state persisted in localStorage (survives page refresh)
- [ ] Cart icon in header shows item count badge
- [ ] Cart page (`/cart`): displays each item with product image, name, selected variant attributes, unit price, quantity controls (+/-), line total, and remove button
- [ ] Cart subtotal calculated from all line items
- [ ] Empty cart state with "Start shopping" CTA linking to product listing
- [ ] Checkout page (`/checkout`): contact information form (customer name — required, phone number — required with BD format validation)
- [ ] Delivery address form (address text area — required)
- [ ] Shipping zone dropdown populated from merchant's config API (`shippingZones` from `GET /api/public/v1/:handle/config`)
- [ ] Shipping cost updates dynamically when zone selection changes (uses zone `price`, applies `free_above` threshold if subtotal qualifies)
- [ ] Order summary section: line items, subtotal, shipping cost, total
- [ ] Payment method: "Cash on Delivery" displayed (no payment gateway — COD only)
- [ ] "Place Order" button: submits to `POST /api/public/v1/:handle/orders` with cart items, customer info, and selected shipping zone
- [ ] Order success page (`/order/:orderId`): displays order number, summary, "What happens next" message, "Continue Shopping" and "Back to Home" links
- [ ] Error handling: stock insufficient → clear error message, API failure → retry option
- [ ] Cart cleared after successful order placement
