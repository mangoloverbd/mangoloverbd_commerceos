# Campaign redirect speed implementation plan

## Goal and approved design

Make `https://www.mangolover.com.bd/go/*` redirects fast without changing DNS,
adding Redis or a second platform. Supabase stays the only permanent
campaign/order store, reached through Merchant Suite.

Approved on 2026-10-04 (replaces the Cloudflare Worker + Queue design):
Vercel Routing Middleware answers `/go/*` from cached link routing data, sends
the 302 with signed cookies immediately and records the click with `waitUntil`.
Storefront functions move to `sin1`, next to the Suite. Details, deploy order,
verification and rollback: `docs/runbooks/campaign-edge-rollout.md`.

Why the Worker design was dropped: proxying `www` through Cloudflare makes
Vercel see Cloudflare IPs for every storefront request (trusted proxies are
Enterprise-only), degrading checkout context and order protection.

## Kept from the earlier work

- Suite: `server/campaignEvents.js` signed receipts and idempotent persistence;
  `POST /api/public/v1/:handle/campaign-click-events`; GET click lookup returns
  `linkId`; order/capture paths materialize a valid receipt before attribution;
  signed route-cache purge on link create/edit.
- Storefront: receipt validation and forwarding through Vercel and Express
  order/abandoned-capture paths; dual-key click cookie verification.

## Tasks

- [x] Receipts, idempotent persistence and receipt forwarding (both repos).
- [x] `server/campaign-edge.ts` (Web Crypto signing shared with the Node signer)
  and `server/campaign-middleware.ts` + root `middleware.ts` in the storefront,
  using `@vercel/functions` `getCache`, `waitUntil`, `ipAddress`, `next`.
- [x] Tests: immediate redirect before delivery, cookie/receipt compatibility
  with checkout, Suite-compatible visitor hash, cache hit + purge tag, HEAD and
  bot handling, fallthrough cases, delivery retry policy, signed purge.
- [x] `vercel.json` regions `sin1`; remove the Cloudflare Worker package and
  delete its two unused queues.
- [x] Checks (2026-10-04): Suite tests/lint/build; storefront typecheck/build;
  storefront Node sweep has only the 13 failures that also fail on `origin/main`.
- [x] Ship Suite (#159) then storefront (#90); both deployed to production.
- [x] Verify production and record timings: 0.64–1.26 s before, 0.15–0.25 s after
  (server ~70 ms). Link-edit purge and fast-checkout receipt still to observe.
