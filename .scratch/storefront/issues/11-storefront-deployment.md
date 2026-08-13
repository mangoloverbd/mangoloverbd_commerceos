# 11 — Deployment + Vercel Configuration

**What to build:** The storefront is live and accessible to real customers. After this ticket, a merchant's storefront is reachable at its handle-based URL, and the full order flow works end-to-end in production.

**Blocked by:** 07 — Storefront Product Listing Page, 09 — Storefront Cart + Checkout Flow, 10 — Storefront SEO Metadata

**Status:** ready-for-agent

- [ ] Vercel project configured for the storefront app (separate from Merchant-Suite dashboard deployment)
- [ ] Environment variables set: `VITE_API_URL` = `https://merchant-suite.online`, `VITE_STOREFRONT_HANDLE` per merchant instance
- [ ] DNS configured for `merchant-suite.online` — storefront app served from this domain
- [ ] Storefront app builds and deploys successfully on Vercel
- [ ] End-to-end smoke test passes: visit storefront URL → browse products → add to cart → checkout → order appears in merchant's Merchant-Suite dashboard with `source: "storefront"`
- [ ] Public API CORS configured to allow storefront origin (`merchant-suite.online`)
- [ ] Error pages (404, 500) render with store branding (not generic Vercel errors)
- [ ] Production monitoring: basic error tracking and uptime check configured
