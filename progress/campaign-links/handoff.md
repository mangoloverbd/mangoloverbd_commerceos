# Handoff — Campaign Links with Delivered-Revenue Reporting (2026-10-02)

## Goal
Dub.co-style tracked links for Mango Lover BD, e.g. `https://www.mangolover.com.bd/go/himsagar-reel`.
Each link is tied to a campaign name, channel, post/ad and creator. Storefront orders are attributed
to the link that brought the customer, and **Marketing › Campaign Links** reports clicks → checkouts →
orders → delivered → delivered revenue and profit (৳) per link.

Success = admin creates a link, a customer taps it on Facebook, orders on the storefront, and the order
shows the campaign; the report counts it and moves it to delivered/cancelled/returned as courier status changes.

## Current state
- **Plan written, no code yet.** Full plan: `docs/superpowers/plans/2026-10-02-campaign-links.md` (uncommitted).
- Scope agreed with the user: Dub idea #1 (tracked links) + #2 (revenue per link). QR codes, influencer
  commissions and social-inbox attribution are later phases. Ad spend / profit per ad is planned as
  **Phase E** (plan §7a), approved by the user to start 2–4 weeks after Campaign Links goes live.
- UI naming agreed: sidebar section **Marketing**, page **Campaign Links**, route `/marketing/links`.
- Storefront domain is **www.mangolover.com.bd** (not mangoloverbd.com). Link format `/go/<slug>` on that domain (Option A); a `go.` subdomain can be added later.
- **Start with Phase A (database)**, confirmed by the user 2026-10-02.

## Decisions (all confirmed by the user 2026-10-02, plan §1)
- D1 last-click attribution, D2 30-day window
- D4 **everyone** can view/create/edit/archive any link; **profit and cost fields are admin-only**
  (server omits them for team members via `redactCampaignFinancials`)
- D5 storefront orders + abandoned checkouts only (no Messenger/phone/manual in v1)
- D6 profit = delivered value − COGS − courier fees (returns still cost a courier fee)
- D7 no ad spend in the first build; it is Phase E (plan §7a)
- D8 automatic UTM tags in the first build: `/go/<slug>` adds `utm_source=<channel>`, `utm_medium=campaign_link`,
  `utm_campaign=<slug>` only where the incoming URL lacks them (Meta/hand-written tags win). Plan §1, §4 B1, §6.

## Architecture in one breath
`/go/:slug` → storefront `api/go.ts` → `POST /api/public/v1/:handle/campaign-links/:slug/clicks` →
HttpOnly cookie `ml_cclick=<clickId>` (30d) → 302 to destination. Storefront `api/orders.ts`
(`server/order-service.ts`) and `api/abandoned-carts.ts` read the cookie and forward `campaignClickId`.
Merchant-Suite `handlePublicHandleOrderSubmit` (`server/index.js:14132`) verifies the click (same org,
within window, not bot) and stores `orders.campaign_link_id` + `campaign_click_id`. Invalid click ids
are ignored silently and never fail an order.

## Key facts found in the codebase
- Precedent to copy: `landing_page_path` attribution. Migration `supabase/migrations/20260914000001_add_order_landing_page_path.sql`,
  server `normalizeLandingPagePath` (`server/index.js:830`), storefront `client/src/lib/landing-page-attribution.ts`.
- Order source enum: `ORDER_SOURCE_VALUES` (`server/index.js:822`). Campaign attribution stays separate from `source`.
- Outcome and metric rules live in `server/businessReport.js` (approved/cancelled/returned sets, `isTerminalCourierReturn`,
  `createMetrics`/`addOrderMetrics`). **Export and reuse them** so numbers match Business Report (PR #142 made order value consistent).
- COGS: `computeOrderCogs` in `server/cog.js`. Dhaka dates: `toDhakaInterval` in `server/reports.js`.
- Pure-module pattern to follow: `server/orderAttribution.js` (no Express/Supabase/clock).
- Public routes are registered around `server/index.js:14562`; `rateLimitPublicRead` and `resolveStorefrontHandle` exist.
- Sidebar: `src/components/AppSidebar.tsx`. Sections are `NavSection` objects (`label`, `collapsible`, `routes`) with inline
  two-tone SVG icons using `var(--fillg)`, not Phosphor. Current order: product → reports → workspace (Intelligence) → socialInbox.
  Add `marketing` after reports. Nav tests render `DashboardNavigation` directly (`src/test/sidebarNavBadges.test.tsx`).
- Routes: `src/App.tsx`. Lazy imports at the top; routes sit inside the `ProtectedRoute` + `DashboardLayout` block; admin pages use `<AdminRoute>`.
- Storefront repo: `../mangoloverbd_storefront`. Four checkout components already send `landingPagePath`
  (`order-dialog.tsx`, `honey-checkout.tsx`, `honey-nut-checkout.tsx`, `kalojira-checkout.tsx`); the cookie
  approach means none of them need to change. `vercel.json` has an SPA catch-all rewrite; the `/go/:slug` rewrite must go above it.

## Active files
Created this session (both uncommitted):
- `docs/superpowers/plans/2026-10-02-campaign-links.md`
- `progress/campaign-links/handoff.md` (this file)

Pre-existing uncommitted changes, not from this session (leave alone): `skills-lock.json`, `harness-copy.html`, `src/__harnessCopy.tsx`, other `progress/` folders.

## Next steps
1. ~~Get the user's answers~~ Done: all decisions confirmed; start with Phase A.
2. Branch from `main` (e.g. `feat/campaign-links`), ideally in a worktree under `.worktrees/`.
3. Phase A: invoke `supabase` skill → `npm run verify:supabase-project` → write the migration (plan §3) → `npm run verify:supabase-baseline` → regenerate `src/integrations/supabase/types.ts`.
4. Phase B: `plan-eng-review` on plan §4, then TDD `server/campaignLinks.js` and `server/campaignReport.js`, then routes and order intake.
5. Phase C: UI (plan §5): sidebar Marketing section, list page, create dialog, detail page, campaign chip on order detail.
6. Phase D: storefront PR (plan §6): `vercel.json` rewrite, `api/go.ts`, cookie forwarding in orders and abandoned carts.
7. Release in order A → B → C → D, then a production smoke test with a test link in the FB in-app browser (plan §7).
8. Before each PR: `review`, `verification-before-completion`, `ship`.
9. Phase E (later): Meta spend per ad → delivered return and profit after ads per link. Reuses the
   insights fetch at `server/index.js:4970` (currently `level=account`) and `convertMetaSpendToBdt`.

- Related plan: `docs/superpowers/plans/2026-10-02-first-party-analytics.md` (PostHog replacement). Shares `isBotUserAgent`,
  `buildCampaignUtm` naming, the Marketing sidebar section and the storefront cookie-forwarding PR.

## Gotchas
- Facebook/WhatsApp link-preview crawlers hit links as soon as they're posted. Flag bot UAs and exclude them from metrics and attribution.
- `destination_path` must be relative-only (no scheme, no `//`, no `/go/`) to avoid open redirects.
- Slugs are immutable once a link has clicks (printed QR codes and published posts would break). Archive links instead of deleting them.
- `api/go.ts` must always redirect, even if Merchant-Suite is down, and must send `Cache-Control: no-store`.
- Never accept `org_id` or `link_id` from the browser. Only the opaque click id, verified server-side.
