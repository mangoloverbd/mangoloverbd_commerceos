# Campaign redirect rollout

## Design (2026-10-04)

`www.mangolover.com.bd/go/*` is answered by Vercel Routing Middleware in the
storefront project (`middleware.ts`), the same pattern Dub uses:

```
GET /go/slug -> middleware (edge, near the visitor)
             -> link routing data from Vercel Runtime Cache (Suite GET on a miss, 5 min TTL)
             -> 302 + ml_cclick / ml_cproof cookies, sent immediately
             -> waitUntil: POST signed receipt to Suite /campaign-click-events -> Supabase
Checkout     -> storefront forwards the receipt -> Suite materializes the click first
Staff edit   -> Suite POST /go/_refresh (signed) -> middleware expires the route cache tag
Anything odd -> next() -> existing /api/go function (unchanged synchronous path)
```

No Cloudflare, no Redis, no DNS change. `www` stays DNS-only to Vercel, so Vercel
keeps seeing shoppers' real IPs for checkout context and order protection.
Storefront functions run in `sin1`, next to the Suite (`vercel.json` regions).

The earlier Cloudflare Worker + Queue design was dropped: proxying `www` through
Cloudflare makes Vercel see Cloudflare IPs (trusted proxies are Enterprise-only).
Its queues were deleted on 2026-10-04; no Worker, route or DNS change was ever made.

## Ownership

- Merchant Suite: `mangoloverbd/mangoloverbd_commerceos`, Vercel project
  `mangoloverbd-commerceos` (`prj_tRxzOi3nzncXm5AhgOFwjF077XQt`).
- Storefront and middleware: `mangoloverbd/mangoloverbd_storefront`, Vercel
  project `mangoloverbd` (`prj_ipM63e5qJSY3fOfVKhTptQQxanXR`).
- Vercel team `mango-lover-bd` (`team_lcV6J4XWNLSWyIctlk9DUAe4`), Pro plan.
- Supabase `ldiktvcavyabivpxfwpn`; workspace `3cd26e57-85ef-4970-94a4-cd99c0f1b554`;
  public handle `mangoloverbd`.

## Secrets

- `CAMPAIGN_EDGE_SECRET`: sensitive, production + preview, on both Vercel
  projects. Signs receipts, middleware click cookies and route-cache purges.
  Never copy its value into docs, config or logs.
- `STOREFRONT_CONTEXT_SECRET`: unchanged. Still protects checkout context and
  cookies issued by the old `/api/go` path, which remain valid.

## Deploy order

1. Merge and deploy the Suite (event receiver, receipt materialization, purge call).
2. Merge and deploy the storefront (middleware, `sin1`, receipt forwarding).
   Deploying the storefront first is safe: middleware deliveries fail until the
   Suite is live, and checkout receipts still materialize the click afterwards.

## Verify after deploy

1. `curl -sI https://www.mangolover.com.bd/go/bori-campaign-1` repeated: 302 to
   `/product/homemade-pumpkin-bori?...`, no `set-cookie` (HEAD never records a click).
   Compare timings with the baseline below.
2. Home page, a product page and checkout load normally (no test orders).
3. One clearly identified functional GET click, then check the Suite campaign
   report shows it, and Vercel logs show no `[campaign] click delivery failed`.
4. Edit a test link destination in the Suite and confirm the redirect changes
   immediately (cache purge), not after 5 minutes.

## Baseline (before)

On 2026-10-03, four HEAD requests to `/go/bori-campaign-1` returned 302 in
896, 743, 638 and 669 ms; on 2026-10-04, 1264, 836 and 750 ms. `x-vercel-id`
`bom1::iad1`: the redirect function ran in Virginia while the Suite runs in
Singapore. The Suite's link lookup alone took ~250 ms from the same machine.

## Rollback

Revert the storefront PR (or delete `middleware.ts` and redeploy). `/go/*` then
goes back to the `/api/go` function. Cookies and receipts issued meanwhile stay
valid; no campaign, click or order data needs cleaning up.
